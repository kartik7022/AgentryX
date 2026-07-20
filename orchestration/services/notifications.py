# services/notifications.py
"""
NOC-E: real notifications when a plan pauses for human review — step 3 of
the design ("notification fires to Slack or ITSM with full context").

Both channels are best-effort: a notification failure must never break the
orchestration run itself. If SLACK_WEBHOOK_URL isn't set, Slack is skipped
silently. ITSM tickets are persisted in orchestration.itsm_tickets (a real
table) — an earlier in-memory-dict version silently lost every ticket on
every backend restart, which is exactly what happened during heavy dev
testing before this was found and fixed.

Two distinct ticket_type values exist:
- "human_review": tied to a paused plan execution, resolved via Approve/
  Reject on the /v1/human-review-approvals endpoints (resumes the plan).
- "manual_review": a standalone administrative ticket (e.g. a low-confidence
  MANUAL_REVIEW routing decision) — the plan does NOT pause for this, and
  it's resolved directly on the ticket itself via
  POST /v1/itsm/tickets/{id}/resolve, independent of any plan execution.
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime
from typing import Any, Dict, Optional

import httpx

logger = logging.getLogger(__name__)

SLACK_WEBHOOK_URL = os.getenv("SLACK_WEBHOOK_URL", "")
FRONTEND_URL       = os.getenv("FRONTEND_URL", "http://localhost:3000")


def _slack_message(review_id: str, execution_id: str, step_key: str,
                    tenant_id: str, reason: str, plan_name: Optional[str],
                    ticket_type: str) -> Dict[str, Any]:
    approvals_link = f"{FRONTEND_URL}/approvals"
    itsm_link = f"{FRONTEND_URL}/itsm"
    plan_line = f"*Plan:* {plan_name}\n" if plan_name else ""
    heading = ":pause_button: *Human review needed*" if ticket_type == "human_review" \
        else ":triangular_flag_on_post: *Manual review needed*"
    link_line = f"<{approvals_link}|Open Approvals to review>" if ticket_type == "human_review" \
        else f"<{itsm_link}|Open ITSM to review>"
    text = (
        f"{heading} — `{step_key}`\n"
        f"{plan_line}"
        f"*Tenant:* {tenant_id}\n"
        f"*Execution:* `{execution_id}`\n"
        f"*Reason:* {reason}\n"
        f"{link_line}"
    )
    return {"text": text}


def notify_human_review_needed(
    *,
    review_id: str,
    execution_id: Optional[str],
    step_key: str,
    tenant_id: str,
    reason: str,
    plan_name: Optional[str] = None,
    conn=None,
    ticket_type: str = "human_review",
) -> None:
    """Fire both notification channels. Never raises — logs and moves on."""
    _send_slack(review_id, execution_id or "", step_key, tenant_id, reason, plan_name, ticket_type)
    _create_itsm_ticket(conn, review_id, execution_id or "", step_key, tenant_id, reason, plan_name, ticket_type)


def _send_slack(review_id, execution_id, step_key, tenant_id, reason, plan_name, ticket_type) -> None:
    if not SLACK_WEBHOOK_URL:
        logger.info(
            "SLACK_WEBHOOK_URL not configured — skipping Slack notification "
            "for review_id=%s (step_key=%s)", review_id, step_key,
        )
        return
    try:
        payload = _slack_message(review_id, execution_id, step_key, tenant_id, reason, plan_name, ticket_type)
        with httpx.Client(timeout=5.0) as client:
            resp = client.post(SLACK_WEBHOOK_URL, json=payload)
            resp.raise_for_status()
        logger.info("Slack notification sent for review_id=%s", review_id)
    except Exception:
        logger.exception(
            "Failed to send Slack notification for review_id=%s (non-fatal)", review_id
        )


def _create_itsm_ticket(conn, review_id, execution_id, step_key, tenant_id, reason, plan_name, ticket_type) -> None:
    """Persists a real row in orchestration.itsm_tickets. Best-effort — if
    conn is None (e.g. running outside a real request) this silently no-ops
    rather than raising, same as the old in-memory version did."""
    if conn is None:
        logger.warning(
            "No db connection available — ITSM ticket not created for "
            "review_id=%s (step_key=%s)", review_id, step_key,
        )
        return
    try:
        ticket_id = f"TICK-{uuid.uuid4().hex[:8].upper()}"
        label = "Human review needed" if ticket_type == "human_review" else "Manual review needed"
        summary = f"{label}: {step_key}" + (f" ({plan_name})" if plan_name else "")
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO orchestration.itsm_tickets
                (ticket_id, summary, description, priority, status, ticket_type, itsm_system,
                 evidence_id, intent, tenant_id, created_by, resolution, url,
                 execution_id, step_key, review_id)
            VALUES (%s, %s, %s, 'HIGH', 'OPEN', %s, 'SERVICENOW',
                    %s, NULL, %s, 'orchestration_engine', NULL, %s,
                    %s, %s, %s)
        """, (
            ticket_id, summary, reason, ticket_type, review_id, tenant_id,
            f"https://servicenow.example.com/tickets/{ticket_id}",
            execution_id, step_key, review_id,
        ))
        conn.commit()
        logger.info(
            "ITSM ticket %s created for review_id=%s (step_key=%s, ticket_type=%s)",
            ticket_id, review_id, step_key, ticket_type,
        )
    except Exception:
        logger.exception(
            "Failed to create ITSM ticket for review_id=%s (non-fatal)", review_id
        )
        try:
            conn.rollback()
        except Exception:
            pass


def resolve_itsm_ticket_for_review(conn, review_id: str, decision: str, decided_by: str, decision_reason: str) -> None:
    """Closes the ITSM ticket that was created when a human_review step
    paused, once a person approves or rejects it via the Approvals page.
    Only ever applies to ticket_type='human_review' tickets — those are
    the ones tied to a paused plan execution."""
    if conn is None:
        return
    try:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE orchestration.itsm_tickets
            SET status = 'RESOLVED', resolution = %s, updated_at = now()
            WHERE review_id = %s AND status = 'OPEN'
        """, (f"{decision} by {decided_by}: {decision_reason}", review_id))
        conn.commit()
        logger.info(
            "ITSM ticket(s) resolved for review_id=%s (%s by %s)",
            review_id, decision, decided_by,
        )
    except Exception:
        logger.exception(
            "Failed to resolve ITSM ticket for review_id=%s (non-fatal)", review_id
        )
        try:
            conn.rollback()
        except Exception:
            pass