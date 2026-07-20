# services/executors/human_review_executor.py
import json
import logging
import uuid
from typing import Any, Dict

from .step_executor import StepExecutor
from ..models.runtime_context import StepExecutionInput, StepExecutionResult
from ..notifications import notify_human_review_needed

logger = logging.getLogger(__name__)


def _create_human_review_approval(conn, review_id, execution_id, step_key,
                                   tenant_id, reason, context_json):
    """NOC-D: persist a real, queryable approval record. Best-effort —
    if this fails (e.g. no db_conn, running outside the API), the step
    itself still succeeds; it just won't show up in the approvals list."""
    if conn is None:
        return
    try:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO orchestration.human_review_approvals
                (approval_id, execution_id, step_key, tenant_id, status,
                 reason, context_json)
            VALUES (%s, %s, %s, %s, 'pending', %s, %s)
        """, (review_id, execution_id or "", step_key, tenant_id, reason,
              json.dumps(context_json, default=str)))
        conn.commit()
    except Exception:
        logger.exception(
            "Failed to create human_review_approvals row for review_id=%s (non-fatal)",
            review_id,
        )


class HumanReviewExecutor(StepExecutor):
    """
    Pauses the plan for manual review. NOC-C added real pause/resume:
    PlanOrchestrator.execute_plan() checks for this step's
    output.status == "pending_human_review" and stops scheduling further
    steps once it's hit — the execution's row is then marked status
    'paused' by the caller (POST /v1/orchestrations/run), and NOC-D's
    /v1/human-review-approvals/{id}/approve|reject endpoints resume it
    later via execute_plan(resume_seed=...).

    Supports a second mode via input_bindings_json.mode == "ticket_only":
    creates a real ITSM ticket + Slack notification, but does NOT create
    a human_review_approvals row and does NOT pause the plan — used for
    standalone administrative cases (like a low-confidence MANUAL_REVIEW
    routing decision) that need a ticket raised but have no paused
    execution to resume.
    """

    @property
    def kind(self) -> str:
        return "human_review"

    def execute(self, step_input: StepExecutionInput) -> StepExecutionResult:
        start = self._start_timer()
        ctx = step_input.context
        step = step_input.step
        bindings = step.get("input_bindings_json") or {}

        reason = (
            bindings.get("reason")
            or bindings.get("reasons")
            or "Routed to human_review by plan step configuration."
        )
        assignee_role = bindings.get("assignee_role", "orchestration_reviewer")
        ticket_only = bindings.get("mode") == "ticket_only"

        review_id = str(uuid.uuid4())

        context_snapshot = {
            "params": ctx.runtime_params,
            "prior_results": ctx.prior_step_results,
        }

        if not ticket_only:
            # Full pause-and-wait flow: a real, queryable approval row is
            # created, and the plan genuinely pauses until someone
            # approves/rejects it via the Approvals page.
            _create_human_review_approval(
                conn=ctx.db_conn, review_id=review_id, execution_id=ctx.execution_id,
                step_key=ctx.step_key, tenant_id=ctx.tenant_id, reason=reason,
                context_json=context_snapshot,
            )

        # NOC-E: step 3 of the design — "notification fires to Slack or
        # ITSM with full context". Best-effort — never blocks the step.
        # Fires for both modes — a manual_review ticket still needs a real
        # ITSM ticket and Slack alert, it just isn't tied to a paused plan.
        notify_human_review_needed(
            review_id=review_id, execution_id=ctx.execution_id,
            step_key=ctx.step_key, tenant_id=ctx.tenant_id, reason=reason,
            plan_name=ctx.plan_name, conn=ctx.db_conn,
            ticket_type="manual_review" if ticket_only else "human_review",
        )

        output: Dict[str, Any] = {
            # ticket_only uses a DIFFERENT status on purpose — the
            # orchestrator's pause-detection specifically only checks for
            # "pending_human_review", so this genuinely does not pause the
            # plan; it just raises a standalone ticket and lets the plan
            # continue/finish naturally.
            "status": "manual_review_ticket_raised" if ticket_only else "pending_human_review",
            "review_id": review_id,
            "reason": reason,
            "assignee_role": assignee_role,
            "context_snapshot": context_snapshot,
        }

        evidence = {
            "source": "human_review",
            "review_id": review_id,
            "assignee_role": assignee_role,
        }
        trace_ids = {
            "execution_id": ctx.execution_id,
            "correlation_id": ctx.correlation_id,
            "review_id": review_id,
        }

        return self.success(
            step_key=ctx.step_key,
            kind=self.kind,
            output=output,
            evidence=evidence,
            trace_ids=trace_ids,
            duration_ms=self._elapsed_ms(start),
        )