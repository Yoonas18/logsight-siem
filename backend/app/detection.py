from __future__ import annotations

from collections import defaultdict
from dataclasses import asdict, dataclass
from datetime import datetime
from typing import Any

KNOWN_ADMIN_IPS = {"192.168.1.10", "192.168.1.11", "10.0.0.10"}
SENSITIVE_FILE_KEYWORDS = {"admin", "payroll", "finance", "backup", "secret"}
SUSPICIOUS_USER_AGENT_KEYWORDS = {
    "curl",
    "python-requests",
    "nmap",
    "sqlmap",
    "nikto",
    "powershell",
}


@dataclass(frozen=True)
class DetectionRule:
    rule_id: str
    name: str
    severity: str
    condition: str
    reason: str
    recommended_action: str
    mitre_tactic: str
    mitre_technique: str


RULES = [
    DetectionRule(
        rule_id="R001",
        name="Failed Login Detection",
        severity="Low",
        condition='action == "login" and status == "failed"',
        reason="Login attempt failed for this user.",
        recommended_action=(
            "Check whether the failure is expected. Review recent failed attempts "
            "from the same user and source IP."
        ),
        mitre_tactic="Credential Access",
        mitre_technique="T1110 - Brute Force",
    ),
    DetectionRule(
        rule_id="R002",
        name="Multiple Failed Login Attempts",
        severity="High",
        condition="Same user has 5 or more failed login attempts in the uploaded dataset.",
        reason="User has multiple failed login attempts, possible brute-force activity.",
        recommended_action=(
            "Check source IP, account lockout status, and whether login later succeeded."
        ),
        mitre_tactic="Credential Access",
        mitre_technique="T1110 - Brute Force",
    ),
    DetectionRule(
        rule_id="R003",
        name="Off-Hours Login",
        severity="Medium",
        condition=(
            'action == "login" and status == "success" and login hour is before '
            "06:00 or after/equal 22:00"
        ),
        reason="Successful login occurred outside normal business hours.",
        recommended_action=(
            "Verify if the user was expected to work during this time and review post-login activity."
        ),
        mitre_tactic="Initial Access",
        mitre_technique="T1078 - Valid Accounts",
    ),
    DetectionRule(
        rule_id="R004",
        name="Restricted File Access",
        severity="High",
        condition=(
            'action == "file_access" and status == "success" and role != "admin" '
            "and file path contains admin, payroll, finance, backup, or secret"
        ),
        reason="Non-admin user accessed a sensitive file path.",
        recommended_action=(
            "Review whether the user has a valid business reason. Check file permissions "
            "and related access activity."
        ),
        mitre_tactic="Collection",
        mitre_technique="T1005 - Data from Local System",
    ),
    DetectionRule(
        rule_id="R005",
        name="Admin Login from Unknown IP",
        severity="High",
        condition=(
            'action == "login" and status == "success" and role == "admin" '
            "and src_ip is not a known admin IP"
        ),
        reason="Admin account logged in from an unknown source IP.",
        recommended_action=(
            "Verify the admin login with the account owner. Review geolocation, VPN usage, "
            "and privileged activity after login."
        ),
        mitre_tactic="Privilege Escalation",
        mitre_technique="T1078 - Valid Accounts",
    ),
    DetectionRule(
        rule_id="R006",
        name="Suspicious User Agent",
        severity="Medium",
        condition="user_agent contains curl, python-requests, nmap, sqlmap, nikto, or powershell",
        reason="User agent contains a known automation or security testing tool string.",
        recommended_action=(
            "Check whether this was an approved scanner or unauthorized automation."
        ),
        mitre_tactic="Reconnaissance",
        mitre_technique="T1595 - Active Scanning",
    ),
]

RULE_LOOKUP = {rule.rule_id: rule for rule in RULES}


def rules_as_dicts() -> list[dict[str, str]]:
    return [asdict(rule) for rule in RULES]


def parse_hour(timestamp: str | None) -> int | None:
    if not timestamp:
        return None

    value = timestamp.strip().replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(value).hour
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
            return datetime.strptime(timestamp.strip(), date_format).hour
        except ValueError:
            continue

    return None


def _base_alert(rule: DetectionRule, event: dict[str, Any], reason: str | None = None) -> dict[str, Any]:
    return {
        "event_id": event.get("event_id"),
        "rule_id": rule.rule_id,
        "rule_name": rule.name,
        "severity": rule.severity,
        "timestamp": event.get("timestamp"),
        "user": event.get("user"),
        "src_ip": event.get("src_ip"),
        "dst_ip": event.get("dst_ip"),
        "reason": reason or rule.reason,
        "recommended_action": rule.recommended_action,
        "mitre_tactic": rule.mitre_tactic,
        "mitre_technique": rule.mitre_technique,
    }


def analyze_events(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    alerts: list[dict[str, Any]] = []
    failed_logins_by_user: dict[str, list[dict[str, Any]]] = defaultdict(list)

    for event in events:
        if event.get("action") == "login" and event.get("status") == "failed":
            failed_logins_by_user[event.get("user") or "unknown"].append(event)

    for event in events:
        action = event.get("action")
        status = event.get("status")
        role = event.get("role")
        file_path = (event.get("file") or "").lower()
        src_ip = event.get("src_ip")
        user_agent = (event.get("user_agent") or "").lower()

        if action == "login" and status == "failed":
            alerts.append(_base_alert(RULE_LOOKUP["R001"], event))

        if action == "login" and status == "success":
            hour = parse_hour(event.get("timestamp"))
            if hour is not None and (hour < 6 or hour >= 22):
                alerts.append(_base_alert(RULE_LOOKUP["R003"], event))

        if (
            action == "file_access"
            and status == "success"
            and role != "admin"
            and any(keyword in file_path for keyword in SENSITIVE_FILE_KEYWORDS)
        ):
            alerts.append(_base_alert(RULE_LOOKUP["R004"], event))

        if (
            action == "login"
            and status == "success"
            and role == "admin"
            and src_ip not in KNOWN_ADMIN_IPS
        ):
            alerts.append(_base_alert(RULE_LOOKUP["R005"], event))

        if any(keyword in user_agent for keyword in SUSPICIOUS_USER_AGENT_KEYWORDS):
            alerts.append(_base_alert(RULE_LOOKUP["R006"], event))

    for user, failed_events in failed_logins_by_user.items():
        if len(failed_events) >= 5:
            anchor_event = sorted(
                failed_events,
                key=lambda item: (item.get("timestamp") or "", item.get("event_id") or ""),
            )[-1]
            rule = RULE_LOOKUP["R002"]
            reason = (
                f"{rule.reason} Observed {len(failed_events)} failed login attempts "
                f"for {user} in this upload."
            )
            alerts.append(_base_alert(rule, anchor_event, reason=reason))

    return alerts
