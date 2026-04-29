from __future__ import annotations

import csv
import ipaddress
import io
import json
import socket
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import Depends, File, Form, Header, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .auth import (
    LoginRequest,
    authenticate_user,
    create_session,
    ensure_default_users,
    get_current_user,
    public_user,
    require_roles,
    revoke_session,
    token_from_authorization,
)
from .database import ALERT_STATUSES, REQUIRED_COLUMNS, get_connection, init_db, row_to_dict, rows_to_dicts
from .detection import analyze_events, rules_as_dicts

MAX_REMOTE_CSV_BYTES = 5 * 1024 * 1024

DEFAULT_NORMALIZED_VALUES = {
    "timestamp": "",
    "event_id": "",
    "user": "unknown",
    "src_ip": "unknown",
    "dst_ip": "",
    "action": "unknown",
    "status": "unknown",
    "file": "",
    "role": "user",
    "user_agent": "",
}

MAPPING_SYNONYMS = {
    "timestamp": ["timestamp", "time", "_time", "date", "datetime", "event_time", "created_at"],
    "event_id": ["event_id", "eventid", "id", "event_code", "event_identifier"],
    "user": ["user", "username", "user_name", "account", "src_user", "principal", "actor"],
    "src_ip": ["src_ip", "source_ip", "client_ip", "remote_addr", "ip", "source", "src"],
    "dst_ip": ["dst_ip", "destination_ip", "dest_ip", "server_ip", "destination", "dst"],
    "action": ["action", "event", "activity", "operation", "method", "event_type"],
    "status": ["status", "result", "outcome", "response", "status_code"],
    "file": ["file", "path", "file_path", "url", "uri", "resource", "object"],
    "role": ["role", "user_role", "account_type", "privilege"],
    "user_agent": ["user_agent", "useragent", "agent", "http_user_agent", "browser"],
}

app = FastAPI(
    title="LogSight SIEM API",
    description="Educational Mini SIEM backend for cybersecurity academy students.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AlertStatusUpdate(BaseModel):
    status: str


class UrlPreviewRequest(BaseModel):
    url: str


class UrlImportRequest(BaseModel):
    url: str
    mapping: dict[str, str] | None = None


@app.on_event("startup")
def on_startup() -> None:
    init_db()
    ensure_default_users()


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "LogSight SIEM API"}


@app.post("/api/auth/login")
def login(payload: LoginRequest) -> dict[str, Any]:
    user = authenticate_user(payload.username, payload.password)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid username or password.")

    token = create_session(user["id"])
    return {
        "token": token,
        "user": public_user(user),
        "message": "Login successful.",
    }


@app.get("/api/auth/me")
def me(current_user: dict = Depends(get_current_user)) -> dict[str, Any]:
    return {"user": current_user}


@app.post("/api/auth/logout")
def logout(authorization: str | None = Header(default=None)) -> dict[str, str]:
    token = token_from_authorization(authorization)
    if token:
        revoke_session(token)
    return {"message": "Logged out."}


@app.get("/api/rules")
def get_rules(current_user: dict = Depends(get_current_user)) -> list[dict[str, str]]:
    return rules_as_dicts()


@app.post("/api/upload")
async def upload_logs(
    file: UploadFile = File(...),
    mapping: str | None = Form(default=None),
    current_user: dict = Depends(require_roles("admin", "analyst")),
) -> dict[str, Any]:
    filename = file.filename or "uploaded_logs.csv"
    if not filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Please upload a CSV file.")

    content = await file.read()
    try:
        csv_text = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=400, detail="CSV must be UTF-8 encoded.") from exc

    mapping_dict = _parse_mapping(mapping)
    events, fieldnames, applied_mapping = _events_from_csv_text(csv_text, mapping_dict)
    return _store_upload(
        filename=filename,
        events=events,
        source="file",
        mapping=applied_mapping,
        uploaded_by=current_user["username"],
        source_columns=fieldnames,
    )


@app.post("/api/preview-url")
def preview_url(
    payload: UrlPreviewRequest,
    current_user: dict = Depends(require_roles("admin", "analyst")),
) -> dict[str, Any]:
    csv_text, filename, normalized_url = _download_csv_url(payload.url)
    reader = csv.DictReader(io.StringIO(csv_text))
    if reader.fieldnames is None:
        raise HTTPException(status_code=400, detail="Remote CSV file is empty.")

    sample_rows = []
    for index, row in enumerate(reader):
        if index >= 3:
            break
        sample_rows.append({key: row.get(key, "") for key in reader.fieldnames})

    fieldnames = [field.strip() for field in reader.fieldnames]
    return {
        "filename": filename,
        "url": normalized_url,
        "columns": fieldnames,
        "sample_rows": sample_rows,
        "exact_match": all(column in fieldnames for column in REQUIRED_COLUMNS),
        "suggested_mapping": _suggest_mapping(fieldnames),
    }


@app.post("/api/import-url")
def import_url(
    payload: UrlImportRequest,
    current_user: dict = Depends(require_roles("admin", "analyst")),
) -> dict[str, Any]:
    csv_text, filename, normalized_url = _download_csv_url(payload.url)
    events, fieldnames, applied_mapping = _events_from_csv_text(csv_text, payload.mapping)
    result = _store_upload(
        filename=filename,
        events=events,
        source="url",
        mapping=applied_mapping,
        uploaded_by=current_user["username"],
        source_columns=fieldnames,
    )
    result["url"] = normalized_url
    return result


@app.post("/api/analyze/{upload_id}")
def analyze_upload(
    upload_id: int,
    current_user: dict = Depends(require_roles("admin", "analyst")),
) -> dict[str, Any]:
    with get_connection() as conn:
        upload = row_to_dict(conn.execute("SELECT * FROM uploads WHERE id = ?", (upload_id,)).fetchone())
        if upload is None:
            raise HTTPException(status_code=404, detail="Upload not found.")

        events = rows_to_dicts(
            conn.execute("SELECT * FROM events WHERE upload_id = ? ORDER BY id ASC", (upload_id,)).fetchall()
        )
        if not events:
            raise HTTPException(status_code=404, detail="No events found for this upload.")

        generated_alerts = analyze_events(events)

        conn.execute("DELETE FROM alerts WHERE upload_id = ?", (upload_id,))
        for index, alert in enumerate(generated_alerts, start=1):
            alert_id = f"AL-{upload_id:04d}-{index:04d}"
            conn.execute(
                """
                INSERT INTO alerts (
                    upload_id, alert_id, event_id, rule_id, rule_name, severity, timestamp,
                    user, src_ip, dst_ip, reason, recommended_action, mitre_tactic,
                    mitre_technique, status
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')
                """,
                (
                    upload_id,
                    alert_id,
                    alert["event_id"],
                    alert["rule_id"],
                    alert["rule_name"],
                    alert["severity"],
                    alert["timestamp"],
                    alert["user"],
                    alert["src_ip"],
                    alert["dst_ip"],
                    alert["reason"],
                    alert["recommended_action"],
                    alert["mitre_tactic"],
                    alert["mitre_technique"],
                ),
            )

        alerts = rows_to_dicts(
            conn.execute("SELECT * FROM alerts WHERE upload_id = ? ORDER BY id ASC", (upload_id,)).fetchall()
        )

    return {
        "upload_id": upload_id,
        "filename": upload["filename"],
        "alerts_generated": len(alerts),
        "alerts": alerts,
    }


@app.get("/api/events")
def get_events(
    upload_id: int | None = None,
    limit: int = Query(default=100, ge=1, le=1000),
    current_user: dict = Depends(get_current_user),
) -> list[dict[str, Any]]:
    query = "SELECT * FROM events"
    params: list[Any] = []
    if upload_id is not None:
        query += " WHERE upload_id = ?"
        params.append(upload_id)
    query += " ORDER BY id DESC LIMIT ?"
    params.append(limit)

    with get_connection() as conn:
        return rows_to_dicts(conn.execute(query, params).fetchall())


@app.get("/api/alerts")
def get_alerts(
    severity: str | None = None,
    status: str | None = None,
    current_user: dict = Depends(get_current_user),
) -> list[dict[str, Any]]:
    query = "SELECT * FROM alerts"
    clauses: list[str] = []
    params: list[Any] = []

    if severity:
        clauses.append("LOWER(severity) = LOWER(?)")
        params.append(severity)
    if status:
        clauses.append("status = ?")
        params.append(status)

    if clauses:
        query += " WHERE " + " AND ".join(clauses)
    query += " ORDER BY id DESC"

    with get_connection() as conn:
        return rows_to_dicts(conn.execute(query, params).fetchall())


@app.get("/api/alerts/{alert_id}")
def get_alert(alert_id: str, current_user: dict = Depends(get_current_user)) -> dict[str, Any]:
    with get_connection() as conn:
        alert = _find_alert(conn, alert_id)
        if alert is None:
            raise HTTPException(status_code=404, detail="Alert not found.")

        event = row_to_dict(
            conn.execute(
                """
                SELECT * FROM events
                WHERE upload_id = ? AND event_id = ?
                ORDER BY id ASC
                LIMIT 1
                """,
                (alert["upload_id"], alert["event_id"]),
            ).fetchone()
        )

    return {
        "alert": alert,
        "event": event,
        "rule": next((rule for rule in rules_as_dicts() if rule["rule_id"] == alert["rule_id"]), None),
    }


@app.patch("/api/alerts/{alert_id}/status")
def update_alert_status(
    alert_id: str,
    payload: AlertStatusUpdate,
    current_user: dict = Depends(require_roles("admin", "analyst")),
) -> dict[str, Any]:
    if payload.status not in ALERT_STATUSES:
        allowed = ", ".join(sorted(ALERT_STATUSES))
        raise HTTPException(status_code=400, detail=f"Invalid status. Allowed values: {allowed}")

    with get_connection() as conn:
        alert = _find_alert(conn, alert_id)
        if alert is None:
            raise HTTPException(status_code=404, detail="Alert not found.")

        conn.execute("UPDATE alerts SET status = ? WHERE id = ?", (payload.status, alert["id"]))
        updated = row_to_dict(conn.execute("SELECT * FROM alerts WHERE id = ?", (alert["id"],)).fetchone())

    return {"alert": updated, "message": "Alert status updated."}


@app.get("/api/dashboard")
def dashboard(current_user: dict = Depends(get_current_user)) -> dict[str, Any]:
    with get_connection() as conn:
        total_logs = conn.execute("SELECT COUNT(*) AS count FROM events").fetchone()["count"]
        total_alerts = conn.execute("SELECT COUNT(*) AS count FROM alerts").fetchone()["count"]

        severity_counts = {
            row["severity"].lower(): row["count"]
            for row in conn.execute(
                "SELECT severity, COUNT(*) AS count FROM alerts GROUP BY severity"
            ).fetchall()
        }

        alerts_by_rule = rows_to_dicts(
            conn.execute(
                """
                SELECT rule_id, rule_name, severity, COUNT(*) AS count
                FROM alerts
                GROUP BY rule_id, rule_name, severity
                ORDER BY count DESC, rule_id ASC
                """
            ).fetchall()
        )

        top_users = rows_to_dicts(
            conn.execute(
                """
                SELECT user, COUNT(*) AS count
                FROM alerts
                WHERE user IS NOT NULL AND user != ''
                GROUP BY user
                ORDER BY count DESC, user ASC
                LIMIT 5
                """
            ).fetchall()
        )

        top_ips = rows_to_dicts(
            conn.execute(
                """
                SELECT src_ip, COUNT(*) AS count
                FROM alerts
                WHERE src_ip IS NOT NULL AND src_ip != ''
                GROUP BY src_ip
                ORDER BY count DESC, src_ip ASC
                LIMIT 5
                """
            ).fetchall()
        )

        recent_alerts = rows_to_dicts(
            conn.execute("SELECT * FROM alerts ORDER BY id DESC LIMIT 5").fetchall()
        )

    return {
        "total_logs_processed": total_logs,
        "total_alerts": total_alerts,
        "high_severity_alerts": severity_counts.get("high", 0),
        "medium_severity_alerts": severity_counts.get("medium", 0),
        "low_severity_alerts": severity_counts.get("low", 0),
        "alerts_by_rule": alerts_by_rule,
        "top_suspicious_users": top_users,
        "top_suspicious_ips": top_ips,
        "recent_alerts": recent_alerts,
    }


def _find_alert(conn: Any, alert_id: str) -> dict[str, Any] | None:
    if alert_id.isdigit():
        alert = row_to_dict(conn.execute("SELECT * FROM alerts WHERE id = ?", (int(alert_id),)).fetchone())
        if alert is not None:
            return alert

    return row_to_dict(conn.execute("SELECT * FROM alerts WHERE alert_id = ?", (alert_id,)).fetchone())


def _parse_mapping(mapping: str | None) -> dict[str, str] | None:
    if not mapping:
        return None
    try:
        parsed = json.loads(mapping)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Mapping must be valid JSON.") from exc
    if not isinstance(parsed, dict):
        raise HTTPException(status_code=400, detail="Mapping must be a JSON object.")
    return {str(target): str(source) for target, source in parsed.items() if source}


def _events_from_csv_text(
    csv_text: str,
    mapping: dict[str, str] | None,
) -> tuple[list[dict[str, str]], list[str], dict[str, str]]:
    reader = csv.DictReader(io.StringIO(csv_text))
    if reader.fieldnames is None:
        raise HTTPException(status_code=400, detail="CSV file is empty.")

    fieldnames = [(field or "").strip() for field in reader.fieldnames]
    exact_match = all(column in fieldnames for column in REQUIRED_COLUMNS)

    if mapping is None:
        if not exact_match:
            missing_columns = [column for column in REQUIRED_COLUMNS if column not in fieldnames]
            raise HTTPException(
                status_code=400,
                detail=(
                    "CSV columns do not match the LogSight schema. "
                    f"Missing: {', '.join(missing_columns)}. Use the schema mapper to map source columns."
                ),
            )
        applied_mapping = {column: column for column in REQUIRED_COLUMNS}
    else:
        _validate_mapping(mapping, fieldnames)
        applied_mapping = {column: mapping.get(column, "") for column in REQUIRED_COLUMNS}

    events = []
    for row_number, row in enumerate(reader, start=1):
        clean_row = {(key or "").strip(): (value or "").strip() for key, value in row.items()}
        if not any(clean_row.values()):
            continue
        events.append(_normalize_event(clean_row, applied_mapping, row_number))

    if not events:
        raise HTTPException(status_code=400, detail="CSV contains headers but no log rows.")

    return events, fieldnames, applied_mapping


def _validate_mapping(mapping: dict[str, str], fieldnames: list[str]) -> None:
    allowed_targets = set(REQUIRED_COLUMNS)
    unknown_targets = sorted(set(mapping) - allowed_targets)
    if unknown_targets:
        raise HTTPException(
            status_code=400,
            detail=f"Mapping contains unknown target fields: {', '.join(unknown_targets)}",
        )

    unknown_sources = sorted({source for source in mapping.values() if source and source not in fieldnames})
    if unknown_sources:
        raise HTTPException(
            status_code=400,
            detail=f"Mapping references columns that do not exist: {', '.join(unknown_sources)}",
        )


def _store_upload(
    *,
    filename: str,
    events: list[dict[str, str]],
    source: str,
    mapping: dict[str, str],
    uploaded_by: str,
    source_columns: list[str],
) -> dict[str, Any]:
    uploaded_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    mapping_payload = {
        "columns": source_columns,
        "mapping": mapping,
    }

    with get_connection() as conn:
        cursor = conn.execute(
            """
            INSERT INTO uploads (filename, uploaded_at, total_events, source, uploaded_by, mapping_json)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                filename,
                uploaded_at,
                len(events),
                source,
                uploaded_by,
                json.dumps(mapping_payload, ensure_ascii=False),
            ),
        )
        upload_id = cursor.lastrowid

        conn.executemany(
            """
            INSERT INTO events (
                upload_id, timestamp, event_id, user, src_ip, dst_ip, action, status,
                file, role, user_agent, raw_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    upload_id,
                    event["timestamp"],
                    event["event_id"],
                    event["user"],
                    event["src_ip"],
                    event["dst_ip"],
                    event["action"],
                    event["status"],
                    event["file"],
                    event["role"],
                    event["user_agent"],
                    event["raw_json"],
                )
                for event in events
            ],
        )

    return {
        "upload_id": upload_id,
        "filename": filename,
        "uploaded_at": uploaded_at,
        "total_events": len(events),
        "source": source,
        "uploaded_by": uploaded_by,
        "mapping": mapping,
        "message": "Log file imported and normalized successfully.",
    }


def _normalize_event(row: dict[str, str], mapping: dict[str, str], row_number: int) -> dict[str, str]:
    clean = DEFAULT_NORMALIZED_VALUES.copy()
    for target in REQUIRED_COLUMNS:
        source = mapping.get(target)
        if source:
            clean[target] = (row.get(source) or DEFAULT_NORMALIZED_VALUES[target]).strip()
        elif target in row:
            clean[target] = (row.get(target) or DEFAULT_NORMALIZED_VALUES[target]).strip()

    if not clean["event_id"]:
        clean["event_id"] = f"ROW-{row_number:05d}"

    normalized = {
        **clean,
        "timestamp": _normalize_timestamp(clean["timestamp"]),
        "action": clean["action"].lower(),
        "status": clean["status"].lower(),
        "role": clean["role"].lower(),
        "raw_json": json.dumps(row, ensure_ascii=False),
    }
    return normalized


def _suggest_mapping(fieldnames: list[str]) -> dict[str, str]:
    normalized_sources = {_simple_name(field): field for field in fieldnames}
    suggestions: dict[str, str] = {}
    for target, candidates in MAPPING_SYNONYMS.items():
        for candidate in candidates:
            match = normalized_sources.get(_simple_name(candidate))
            if match:
                suggestions[target] = match
                break
    return suggestions


def _simple_name(value: str) -> str:
    return "".join(character for character in value.lower() if character.isalnum())


def _download_csv_url(url: str) -> tuple[str, str, str]:
    normalized_url = _normalize_remote_csv_url(url)
    _validate_remote_url(normalized_url)

    request = urllib.request.Request(
        normalized_url,
        headers={"User-Agent": "LogSight-SIEM-Lab/1.0"},
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            data = response.read(MAX_REMOTE_CSV_BYTES + 1)
    except urllib.error.URLError as exc:
        raise HTTPException(status_code=400, detail=f"Could not download remote CSV: {exc.reason}") from exc

    if len(data) > MAX_REMOTE_CSV_BYTES:
        raise HTTPException(status_code=400, detail="Remote CSV is larger than the 5 MB training limit.")

    try:
        csv_text = data.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=400, detail="Remote CSV must be UTF-8 encoded.") from exc

    filename = Path(urllib.parse.urlparse(normalized_url).path).name or "remote_security_logs.csv"
    if not filename.lower().endswith(".csv"):
        filename = f"{filename}.csv"

    return csv_text, filename, normalized_url


def _normalize_remote_csv_url(url: str) -> str:
    value = url.strip()
    parsed = urllib.parse.urlparse(value)

    if parsed.netloc.lower() == "github.com":
        parts = [part for part in parsed.path.split("/") if part]
        if len(parts) >= 5 and parts[2] == "blob":
            owner, repo, _blob, branch = parts[:4]
            path = "/".join(parts[4:])
            return f"https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}"

    if parsed.netloc.lower() == "drive.google.com" and "/file/d/" in parsed.path:
        parts = [part for part in parsed.path.split("/") if part]
        try:
            file_id = parts[parts.index("d") + 1]
        except (ValueError, IndexError):
            return value
        return f"https://drive.google.com/uc?export=download&id={file_id}"

    return value


def _validate_remote_url(url: str) -> None:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise HTTPException(status_code=400, detail="Remote CSV URL must start with http:// or https://.")

    try:
        address_info = socket.getaddrinfo(parsed.hostname, None)
    except socket.gaierror as exc:
        raise HTTPException(status_code=400, detail="Could not resolve remote CSV host.") from exc

    for item in address_info:
        ip_address = ipaddress.ip_address(item[4][0])
        if ip_address.is_private or ip_address.is_loopback or ip_address.is_link_local:
            raise HTTPException(status_code=400, detail="Remote CSV URL cannot point to a private or local network.")


def _normalize_timestamp(timestamp: str) -> str:
    value = timestamp.strip()
    if not value:
        return value

    iso_value = value.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(iso_value)
        if parsed.tzinfo is not None:
            parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
        return parsed.isoformat(timespec="seconds")
    except ValueError:
        pass

    formats = [
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%m/%d/%Y %H:%M:%S",
        "%m/%d/%Y %H:%M",
    ]
    for date_format in formats:
        try:
            return datetime.strptime(value, date_format).isoformat(timespec="seconds")
        except ValueError:
            continue

    return value
