# services/models/runtime_context.py

from __future__ import annotations

from typing import Any, Dict, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class RuntimeContext(BaseModel):
    """
    Carried through every executor call, every DB write, and every log
    entry for a single step execution.
    """

    model_config = ConfigDict(arbitrary_types_allowed=True)

    tenant_id: str
    correlation_id: str
    execution_id: Optional[str] = None
    plan_name: str
    step_key: str
    runtime_params: Dict[str, Any] = Field(default_factory=dict)
    prior_step_results: Dict[str, Any] = Field(default_factory=dict)
    # Live psycopg2 connection for the current request, set by
    # PlanOrchestrator._run_step_with_metrics. Only agent_task uses this
    # today (to persist orchestration.agent_task_runs / _trace_events /
    # _approvals) — every other executor writes through execute()/db.py
    # helpers instead. Optional and may be None (e.g. in tests, or when
    # execute_plan() is called without a live db_conn, as /v1/360 does).
    db_conn: Optional[Any] = None


class StepExecutionInput(BaseModel):
    """
    What every StepExecutor.execute() receives: the runtime context plus
    the raw plan_step row (as a dict) being executed.
    """

    context: RuntimeContext
    step: Dict[str, Any] = Field(default_factory=dict)


class StepExecutionResult(BaseModel):
    """
    What every StepExecutor.execute() must return. The orchestration
    engine, the Execution Monitor UI, and the execution_steps table all
    consume this exact shape regardless of step kind.
    """

    step_key: str
    kind: str
    status: Literal["success", "skipped", "failed"]
    output: Dict[str, Any] = Field(default_factory=dict)
    error: Optional[Dict[str, Any]] = None
    evidence: Dict[str, Any] = Field(default_factory=dict)
    trace_ids: Dict[str, Any] = Field(default_factory=dict)
    duration_ms: int = 0