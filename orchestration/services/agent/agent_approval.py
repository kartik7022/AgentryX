# services/agent/agent_approval.py
from __future__ import annotations
import json
import logging
from typing import Any, Dict, Optional
from uuid import uuid4
from .agent_contract import AgentApprovalPolicy

logger = logging.getLogger(__name__)

_MUTATING_ACTIONS = {"state_mutation","external_webhook","document_send","payment_action","customer_notification"}
_MUTATING_TOOLS   = {"webhook", "human_review"}
_READ_ONLY_TOOLS  = {"datasource_lookup", "adapter_analyze", "prompt_run"}


def requires_approval(action_type: str, tool_name: str, approval_policy: AgentApprovalPolicy) -> bool:
    mode = approval_policy.mode
    if mode == "none":
        return False
    if mode == "required_for_all_actions":
        return True
    # auto_for_read_only
    if tool_name in _READ_ONLY_TOOLS:
        return False
    if action_type in _MUTATING_ACTIONS or tool_name in _MUTATING_TOOLS:
        return True
    if tool_name in (approval_policy.require_approval_for or []):
        return True
    return False


def create_approval_request(conn, agent_run_id: str, execution_id: str,
    tenant_id: str, step_key: str, approval_type: str,
    requested_action_json: Dict[str, Any], requested_by: Optional[str] = None,
    expires_at: Optional[str] = None) -> str:
    approval_id = str(uuid4())
    try:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO orchestration.agent_task_approvals
                (approval_id, agent_run_id, execution_id, tenant_id, step_key,
                 approval_type, requested_action_json, status, requested_by, expires_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, 'pending', %s, %s)
        """, (approval_id, agent_run_id, execution_id, tenant_id, step_key,
              approval_type, json.dumps(requested_action_json, default=str),
              requested_by, expires_at))
        conn.commit()
    except Exception:
        logger.exception("Failed to create approval request (non-fatal)")
    return approval_id


def get_approval_status(conn, approval_id: str) -> str:
    cursor = conn.cursor()
    cursor.execute("SELECT status FROM orchestration.agent_task_approvals WHERE approval_id = %s", (approval_id,))
    row = cursor.fetchone()
    return row[0] if row else "not_found"


def resolve_approval(conn, approval_id: str, decision: str,
    reviewed_by: str, decision_reason: Optional[str] = None) -> bool:
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE orchestration.agent_task_approvals
        SET status = %s, reviewed_by = %s, reviewed_at = now(), decision_reason = %s
        WHERE approval_id = %s AND status = 'pending'
    """, (decision, reviewed_by, decision_reason, approval_id))
    updated = cursor.rowcount > 0
    conn.commit()
    return updated