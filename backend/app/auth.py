from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timezone
from typing import Callable

from fastapi import Depends, Header, HTTPException, status
from pydantic import BaseModel

from .database import get_connection, row_to_dict

ROLE_PERMISSIONS = {
    "admin": {
        "label": "Administrator",
        "description": "Can upload logs, import remote CSVs, run detections, and manage alert status.",
    },
    "analyst": {
        "label": "SOC Analyst",
        "description": "Can upload logs, run detections, and update investigations.",
    },
    "student": {
        "label": "Student Viewer",
        "description": "Can view dashboards, alerts, rules, and event evidence.",
    },
}

DEFAULT_USERS = [
    {
        "username": "admin",
        "display_name": "Academy Admin",
        "role": "admin",
        "password": "LogSightAdmin123!",
    },
    {
        "username": "analyst",
        "display_name": "SOC Analyst",
        "role": "analyst",
        "password": "Analyst123!",
    },
    {
        "username": "student",
        "display_name": "Student Viewer",
        "role": "student",
        "password": "Student123!",
    },
]


class LoginRequest(BaseModel):
    username: str
    password: str


def hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120_000)
    return f"pbkdf2_sha256${salt}${digest.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        algorithm, salt, expected_digest = stored_hash.split("$", 2)
    except ValueError:
        return False
    if algorithm != "pbkdf2_sha256":
        return False
    candidate = hash_password(password, salt).split("$", 2)[2]
    return hmac.compare_digest(candidate, expected_digest)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def ensure_default_users() -> None:
    with get_connection() as conn:
        for user in DEFAULT_USERS:
            existing = conn.execute(
                "SELECT id FROM users WHERE username = ?",
                (user["username"],),
            ).fetchone()
            if existing is not None:
                continue
            conn.execute(
                """
                INSERT INTO users (username, display_name, role, password_hash, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    user["username"],
                    user["display_name"],
                    user["role"],
                    hash_password(user["password"]),
                    utc_now(),
                ),
            )


def public_user(user: dict) -> dict:
    return {
        "id": user["id"],
        "username": user["username"],
        "display_name": user["display_name"],
        "role": user["role"],
        "role_label": ROLE_PERMISSIONS.get(user["role"], {}).get("label", user["role"]),
    }


def authenticate_user(username: str, password: str) -> dict | None:
    with get_connection() as conn:
        user = row_to_dict(
            conn.execute(
                "SELECT * FROM users WHERE LOWER(username) = LOWER(?)",
                (username.strip(),),
            ).fetchone()
        )
    if user is None or not verify_password(password, user["password_hash"]):
        return None
    return user


def create_session(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO sessions (user_id, token_hash, created_at) VALUES (?, ?, ?)",
            (user_id, hash_token(token), utc_now()),
        )
    return token


def revoke_session(token: str) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM sessions WHERE token_hash = ?", (hash_token(token),))


def get_current_user(authorization: str | None = Header(default=None)) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
        )

    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")

    with get_connection() as conn:
        user = row_to_dict(
            conn.execute(
                """
                SELECT users.*
                FROM sessions
                JOIN users ON users.id = sessions.user_id
                WHERE sessions.token_hash = ?
                """,
                (hash_token(token),),
            ).fetchone()
        )

    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired or invalid.")
    return public_user(user)


def require_roles(*allowed_roles: str) -> Callable:
    def dependency(current_user: dict = Depends(get_current_user)) -> dict:
        if current_user["role"] not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your role does not have permission for this action.",
            )
        return current_user

    return dependency


def token_from_authorization(authorization: str | None) -> str | None:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    return authorization.split(" ", 1)[1].strip() or None
