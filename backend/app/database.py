from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "logsight.db"

REQUIRED_COLUMNS = [
    "timestamp",
    "event_id",
    "user",
    "src_ip",
    "dst_ip",
    "action",
    "status",
    "file",
    "role",
    "user_agent",
]

ALERT_STATUSES = {
    "new",
    "investigating",
    "closed_true_positive",
    "closed_false_positive",
}


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with get_connection() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS uploads (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT NOT NULL,
                uploaded_at TEXT NOT NULL,
                total_events INTEGER NOT NULL,
                source TEXT NOT NULL DEFAULT 'file',
                uploaded_by TEXT,
                mapping_json TEXT
            );

            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                upload_id INTEGER NOT NULL,
                timestamp TEXT,
                event_id TEXT,
                user TEXT,
                src_ip TEXT,
                dst_ip TEXT,
                action TEXT,
                status TEXT,
                file TEXT,
                role TEXT,
                user_agent TEXT,
                raw_json TEXT NOT NULL,
                FOREIGN KEY (upload_id) REFERENCES uploads(id)
            );

            CREATE TABLE IF NOT EXISTS alerts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                upload_id INTEGER NOT NULL,
                alert_id TEXT NOT NULL UNIQUE,
                event_id TEXT,
                rule_id TEXT NOT NULL,
                rule_name TEXT NOT NULL,
                severity TEXT NOT NULL,
                timestamp TEXT,
                user TEXT,
                src_ip TEXT,
                dst_ip TEXT,
                reason TEXT NOT NULL,
                recommended_action TEXT NOT NULL,
                mitre_tactic TEXT NOT NULL,
                mitre_technique TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'new',
                FOREIGN KEY (upload_id) REFERENCES uploads(id)
            );

            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                display_name TEXT NOT NULL,
                role TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                token_hash TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id)
            );

            CREATE INDEX IF NOT EXISTS idx_events_upload_id ON events(upload_id);
            CREATE INDEX IF NOT EXISTS idx_alerts_upload_id ON alerts(upload_id);
            CREATE INDEX IF NOT EXISTS idx_alerts_rule_id ON alerts(rule_id);
            CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
            CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity);
            CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
            """
        )
        _ensure_column(conn, "uploads", "source", "TEXT NOT NULL DEFAULT 'file'")
        _ensure_column(conn, "uploads", "uploaded_by", "TEXT")
        _ensure_column(conn, "uploads", "mapping_json", "TEXT")


def _ensure_column(conn: sqlite3.Connection, table: str, column: str, definition: str) -> None:
    existing = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
    if column not in existing:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return {key: row[key] for key in row.keys()}


def rows_to_dicts(rows: list[sqlite3.Row]) -> list[dict[str, Any]]:
    return [row_to_dict(row) or {} for row in rows]
