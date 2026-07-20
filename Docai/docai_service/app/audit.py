from __future__ import annotations

import logging
from typing import Any

from app.db import AuditLog
from app.compliance import redact_pii

logging.basicConfig(filename="audit.log", level=logging.INFO)

ALLOWED_EVENT_TYPES = {
    "UPLOAD",
    "TRAIN",
    "PARSE",
    "LOGIN",
    "LOGOUT",
    "ERROR",
    "AUTO_DETECT",
}


def _sanitize_details(details: dict[str, Any] | None) -> dict[str, Any]:
    if not details:
        return {}

    sanitized: dict[str, Any] = {}
    for key, value in details.items():
        if isinstance(value, str):
            sanitized[key] = redact_pii(value)["redacted_text"]
        elif isinstance(value, dict):
            sanitized[key] = _sanitize_details(value)
        elif isinstance(value, list):
            sanitized[key] = [
                redact_pii(item)["redacted_text"] if isinstance(item, str) else item
                for item in value
            ]
        else:
            sanitized[key] = value
    return sanitized


def log_event(
    db_session,
    event_type: str,
    doc_id: str,
    user_id: str,
    status: str,
    parse_request_id: str | None = None,
    details: dict[str, Any] | None = None,
) -> str:
    if event_type not in ALLOWED_EVENT_TYPES:
        event_type = "ERROR"

    sanitized_details = _sanitize_details(details)
    logging.info(
        f"{event_type} | doc_id={doc_id} | user={user_id} | status={status} | details={sanitized_details}"
    )

    audit_log = AuditLog(
        event_type=event_type,
        doc_id=doc_id,
        parse_request_id=parse_request_id,
        user_id=user_id,
        status=status,
        details=sanitized_details,
    )
    db_session.add(audit_log)
    db_session.commit()
    db_session.refresh(audit_log)
    return str(audit_log.id)


def get_audit_trail(db_session, parse_request_id: str) -> list[dict[str, Any]]:
    rows = (
        db_session.query(AuditLog)
        .filter(AuditLog.parse_request_id == parse_request_id)
        .order_by(AuditLog.created_at.asc())
        .all()
    )
    return [
        {
            "id": str(row.id),
            "event_type": row.event_type,
            "doc_id": row.doc_id,
            "parse_request_id": str(row.parse_request_id) if row.parse_request_id else None,
            "user_id": row.user_id,
            "status": row.status,
            "details": row.details or {},
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }
        for row in rows
    ]


def write_audit_log(
    db,
    event_type: str,
    doc_id: str | None,
    user_id: str | None = None,
    status: str = "success",
    details: dict[str, Any] | None = None,
    parse_request_id=None,
) -> str:
    return log_event(
        db,
        event_type=event_type,
        doc_id=doc_id or "",
        user_id=user_id or "anonymous",
        status=status,
        parse_request_id=parse_request_id,
        details=details,
    )
