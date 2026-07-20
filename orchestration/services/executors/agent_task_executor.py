# services/executors/agent_task_executor.py
import json
import logging
import uuid
from typing import Any, Dict, Optional

from .step_executor import StepExecutor
from ..models.runtime_context import StepExecutionInput, StepExecutionResult
from ..agent.agent_contract import AgentTaskConfig
from ..agent.agent_runtime import AgentRuntime

logger = logging.getLogger(__name__)


def _create_agent_run_row(conn, agent_run_id, execution_id, execution_step_id,
                           tenant_id, plan_name, step_key, config, input_json):
    if conn is None:
        return
    try:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO orchestration.agent_task_runs
                (agent_run_id, execution_id, execution_step_id, tenant_id,
                 plan_name, step_key, prompt_id, prompt_version, goal,
                 status, input_json, budgets_json)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'running', %s, %s)
        """, (agent_run_id, execution_id or "", execution_step_id, tenant_id,
              plan_name, step_key, config.prompt_ref.prompt_id,
              config.prompt_ref.version, config.goal,
              json.dumps(input_json, default=str),
              json.dumps(config.budgets.model_dump(), default=str)))
        conn.commit()
    except Exception:
        logger.exception("Failed to create agent_task_runs row (non-fatal)")


def _update_agent_run_row(conn, agent_run_id, status, output_json, error_json,
                           usage_json, approval_json, duration_ms):
    if conn is None:
        return
    try:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE orchestration.agent_task_runs
            SET status=  %s, output_json= %s, error_json= %s,
                usage_json=%s, approval_json=%s, duration_ms=%s, completed_at=now()
            WHERE agent_run_id = %s
        """, (status, json.dumps(output_json, default=str),
              json.dumps(error_json, default=str),
              json.dumps(usage_json, default=str),
              json.dumps(approval_json, default=str),
              duration_ms, agent_run_id))
        conn.commit()
    except Exception:
        logger.exception("Failed to update agent_task_runs row (non-fatal)")


class AgentTaskExecutor(StepExecutor):
    @property
    def kind(self) -> str:
        return "agent_task"

    def execute(self, step_input: StepExecutionInput) -> StepExecutionResult:
        start    = self._start_timer()
        ctx      = step_input.context
        bindings = step_input.step.get("input_bindings_json") or {}

        try:
            config = AgentTaskConfig(**bindings)
        except Exception as e:
            return self.failure(step_key=ctx.step_key, kind=self.kind,
                error={"message": f"Invalid agent_task config: {e}", "type": "AgentTaskConfigError"},
                duration_ms=self._elapsed_ms(start))

        agent_run_id = str(uuid.uuid4())
        db_conn      = ctx.db_conn

        _create_agent_run_row(
            conn=db_conn, agent_run_id=agent_run_id,
            execution_id=ctx.execution_id or "",
            execution_step_id=None, tenant_id=ctx.tenant_id,
            plan_name=ctx.plan_name, step_key=ctx.step_key,
            config=config, input_json=ctx.runtime_params,
        )

        runtime    = AgentRuntime(conn=db_conn)
        run_result = runtime.run(config=config, context=ctx, agent_run_id=agent_run_id)
        duration_ms = self._elapsed_ms(start)

        _update_agent_run_row(
            conn=db_conn, agent_run_id=agent_run_id, status=run_result.status,
            output_json=run_result.output,
            error_json={"message": run_result.error} if run_result.error else {},
            usage_json=run_result.usage,
            approval_json={"approval_ids": run_result.approvals},
            duration_ms=duration_ms,
        )

        evidence  = {"source": "agent_runtime", "agent_run_id": agent_run_id,
                     "status": run_result.status, "iterations": run_result.usage.get("iterations_used", 0)}
        trace_ids = {"execution_id": ctx.execution_id, "correlation_id": ctx.correlation_id,
                     "agent_run_id": agent_run_id}

        if run_result.status == "needs_approval":
            return self.success(step_key=ctx.step_key, kind=self.kind,
                output={"status": "needs_approval", "agent_run_id": agent_run_id,
                        "pending_approval_id": run_result.output.get("pending_approval_id")},
                evidence=evidence, trace_ids=trace_ids, duration_ms=duration_ms)

        if run_result.status == "needs_human_review":
            # AGENT-011: reachable now that fallback_policy.on_output_invalid /
            # on_budget_exceeded and the evaluation suite are actually wired
            # into AgentRuntime. Treated as a successful step (like
            # human_review_executor does) so downstream condition_expr steps
            # can branch on results.<step_key>.output.status.
            return self.success(step_key=ctx.step_key, kind=self.kind,
                output={"status": "needs_human_review", "agent_run_id": agent_run_id,
                        "output": run_result.output, "usage": run_result.usage,
                        "evaluation": run_result.evidence.get("evaluation")},
                evidence=evidence, trace_ids=trace_ids, duration_ms=duration_ms)

        if run_result.status in ("failed", "budget_exceeded", "output_invalid"):
            return self.failure(step_key=ctx.step_key, kind=self.kind,
                error={"message": run_result.error or run_result.status,
                       "type": run_result.status, "agent_run_id": agent_run_id,
                       "usage": run_result.usage},
                duration_ms=duration_ms)

        return self.success(step_key=ctx.step_key, kind=self.kind,
            output={"status": "success", "agent_run_id": agent_run_id,
                    "output": run_result.output, "usage": run_result.usage,
                    "approvals": run_result.approvals},
            evidence=evidence, trace_ids=trace_ids, duration_ms=duration_ms)