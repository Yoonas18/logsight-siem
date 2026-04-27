from __future__ import annotations

import csv
import io
import json
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .database import ALERT_STATUSES, REQUIRED_COLUMNS, get_connection, init_db, row_to_dict, rows_to_dicts
from .detection import analyze_events, rules_as_dicts

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


@app.on_event("startup")
def on_startup() -> None:
    init_db()


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "LogSight SIEM API"}


@app.get("/api/rules")
def get_rules() -> list[dict[str, str]]:
    return rules_as_dicts()


@app.post("/api/upload")
async def upload_logs(file: UploadFile = File(...)) -> dict[str, Any]:
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Please upload a CSV file.")

    content = await file.read()
    try:
        csv_text = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=400, detail="CSV must be UTF-8 encoded.") from exc

    reader = csv.DictReader(io.StringIO(csv_text))
    if reader.fieldnames is None:
        raise HTTPException(status_code=400, detail="CSV file is empty.")

    missing_columns = [column for column in REQUIRED_COLUMNS if column not in reader.fieldnames]
    if missing_columns:
        raise HTTPException(
            status_code=400,
            detail=f"Missing required columns: {', '.join(missing_columns)}",
        )

    events = [_normalize_event(row) for row in reader if any((value or "").strip() for value in row.values())]
    if not events:
        raise HTTPException(status_code=400, detail="CSV contains headers but no log rows.")

    uploaded_at = datetime.now(timezone.utc).isoformat(timespec="seconds")

    with get_connection() as conn:
        cursor = conn.execute(
            "INSERT INTO uploads (filename, uploaded_at, total_events) VALUES (?, ?, ?)",
            (file.filename, uploaded_at, len(events)),
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
        "filename": file.filename,
        "uploaded_at": uploaded_at,
        "total_events": len(events),
        "message": "Log file uploaded and normalized successfully.",
    }


@app.post("/api/analyze/{upload_id}")
def analyze_upload(upload_id: int) -> dict[str, Any]:
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
def get_alert(alert_id: str) -> dict[str, Any]:
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
def update_alert_status(alert_id: str, payload: AlertStatusUpdate) -> dict[str, Any]:
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
def dashboard() -> dict[str, Any]:
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


def _normalize_event(row: dict[str, str]) -> dict[str, str]:
    clean = {column: (row.get(column) or "").strip() for column in REQUIRED_COLUMNS}
    normalized = {
        **clean,
        "timestamp": _normalize_timestamp(clean["timestamp"]),
        "action": clean["action"].lower(),
        "status": clean["status"].lower(),
        "role": clean["role"].lower(),
        "raw_json": json.dumps(clean, ensure_ascii=False),
    }
    return normalized


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
