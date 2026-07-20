# services/execution_steps_repository.py

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from uuid import UUID, uuid4

from .db import execute, execute_one, execute_write

logger = logging.getLogger(__name__)


def create_step_run(
    conn,
    execution_id: str,
    step_key: str,
    kind: str,
    plan_step_id: Optional[str] = None,
) -> str:
    """
    Create a new execution_steps row in 'queued' status, before the step
    actually starts running. Returns the new execution_step_id.
    """
    execution_step_id = str(uuid4())
    execute_write(conn, """
        INSERT INTO orchestration.execution_steps
            (execution_step_id, execution_id, plan_step_id, step_key, kind, status)
        VALUES (%s, %s, %s, %s, %s, 'queued')
    """, (
        execution_step_id,
        execution_id,
        plan_step_id,
        step_key,
        kind,
    ))
    return execution_step_id


def mark_step_running(conn, execution_step_id: str) -> None:
    """Mark a step as running and record its start time."""
    execute_write(conn, """
        UPDATE orchestration.execution_steps
        SET status = 'running', started_at = NOW()
        WHERE execution_step_id = %s
    """, (execution_step_id,))


def mark_step_success(
    conn,
    execution_step_id: str,
    request_json: Optional[Dict[str, Any]] = None,
    response_json: Optional[Dict[str, Any]] = None,
    evidence_json: Optional[Dict[str, Any]] = None,
    duration_ms: int = 0,
) -> None:
    """Mark a step as succeeded, with its request/response/evidence."""
    execute_write(conn, """
        UPDATE orchestration.execution_steps
        SET status = 'success',
            request_json = %s,
            response_json = %s,
            evidence_json = %s,
            duration_ms = %s,
            completed_at = NOW()
        WHERE execution_step_id = %s
    """, (
        json.dumps(request_json or {}, default=str),
        json.dumps(response_json or {}, default=str),
        json.dumps(evidence_json or {}, default=str),
        duration_ms,
        execution_step_id,
    ))


def mark_step_failed(
    conn,
    execution_step_id: str,
    error_json: Dict[str, Any],
    request_json: Optional[Dict[str, Any]] = None,
    duration_ms: int = 0,
    retry_count: int = 0,
) -> None:
    """Mark a step as failed, with structured error detail."""
    execute_write(conn, """
        UPDATE orchestration.execution_steps
        SET status = 'failed',
            request_json = %s,
            error_json = %s,
            duration_ms = %s,
            retry_count = %s,
            completed_at = NOW()
        WHERE execution_step_id = %s
    """, (
        json.dumps(request_json or {}, default=str),
        json.dumps(error_json, default=str),
        duration_ms,
        retry_count,
        execution_step_id,
    ))


def mark_step_skipped(conn, execution_step_id: str, reason: str = "") -> None:
    """Mark a step as skipped (e.g. condition_expr was false, or a
    dependency failed under dependent_fail error policy)."""
    execute_write(conn, """
        UPDATE orchestration.execution_steps
        SET status = 'skipped',
            error_json = %s,
            completed_at = NOW()
        WHERE execution_step_id = %s
    """, (
        json.dumps({"reason": reason} if reason else {}),
        execution_step_id,
    ))


def list_steps_for_execution(conn, execution_id: str) -> list[dict]:
    """Return all execution_steps rows for one execution, in insertion
    order (which matches step run order in practice)."""
    return execute(conn, """
        SELECT * FROM orchestration.execution_steps
        WHERE execution_id = %s
        ORDER BY started_at NULLS LAST, execution_step_id
    """, (execution_id,))