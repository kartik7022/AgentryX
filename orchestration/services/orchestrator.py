# orchestration/orchestration/services/orchestrator.py
import logging
from concurrent.futures import ThreadPoolExecutor, wait, FIRST_COMPLETED
from time import time
from typing import Any, Dict, Optional, Set

from prometheus_client import Counter, Histogram

from .expression import eval_condition
from .executors.registry import build_default_registry
from .executors.step_executor import UnsupportedStepKindError
from .executors.base import StepContext
from .models.runtime_context import RuntimeContext, StepExecutionInput

logger = logging.getLogger(__name__)

# ── Prometheus metrics ─────────────────────────────────────────────
PLAN_REQUESTS = Counter(
    "orchestration_plan_requests_total",
    "Total orchestration plan requests",
    ["plan", "entity_type"],
)
PLAN_LATENCY = Histogram(
    "orchestration_plan_latency_seconds",
    "Plan execution latency in seconds",
    ["plan", "entity_type"],
)
STEP_LATENCY = Histogram(
    "orchestration_step_latency_seconds",
    "Step execution latency in seconds",
    ["plan", "step_key", "kind"],
)
STEP_FAILURES = Counter(
    "orchestration_step_failures_total",
    "Total failures per step",
    ["plan", "step_key", "kind"],
)


class PlanOrchestrator:
    def __init__(self):
        self.registry = build_default_registry()

    def execute_plan(
        self,
        plan: dict,
        tenant_id: str,
        params: Dict[str, str],
        execution_id: Optional[str] = None,
        db_conn=None,
        resume_seed: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        execution_id and db_conn are optional — when provided (by
        POST /v1/orchestrations/run, ORCH-010), each step writes a trace
        row to orchestration.execution_steps and RuntimeContext.execution_id
        is populated so EIVS executors can link their own rows back to this
        execution. When omitted (existing /v1/360 callers), behavior is
        identical to before this change — no trace rows, execution_id=None.

        resume_seed (NOC-C): when resuming a previously-paused execution,
        pass {"results": {...prior ctx.results...}, "completed_step_keys": [...]}
        so already-finished steps aren't re-run, and any condition_expr that
        references a step gated behind human review sees its real prior
        output instead of nothing.
        """

        plan_name       = plan["name"]
        entity_type     = plan["entity_type"]
        error_policy    = plan.get("error_policy", "best_effort")
        max_concurrency = plan.get("max_concurrency") or 8

        PLAN_REQUESTS.labels(plan_name, entity_type).inc()
        start_time = time()

        ctx = StepContext(
    tenant_id=tenant_id,
    params=params,
    results=dict((resume_seed or {}).get("results") or {}),
    plan_name=plan_name,  # ← comes from DB!
    )
        # Only enabled steps
        all_steps = [s for s in plan.get("steps", []) if s.get("enabled", True)]
        already_completed_keys = set((resume_seed or {}).get("completed_step_keys") or [])
        pending   = {s["step_key"]: s for s in all_steps if s["step_key"] not in already_completed_keys}
        completed = set(already_completed_keys)   # ← all finished steps (success + failed)
        failed    = set()   # ← only failed step keys
        skipped   = set()   # ← skipped due to dependent_fail
        failures: Dict[str, str] = {}
        futures   = {}
        abort     = False   # ← flag for fail_fast
        paused_at_step: Optional[str] = None   # ← NOC-C: set when a human_review
                                                 #   step is hit; stops scheduling
                                                 #   NEW steps but lets in-flight
                                                 #   futures finish naturally

        with ThreadPoolExecutor(max_workers=max_concurrency) as pool:
            while pending or futures:

                if abort:
                    # fail_fast — cancel everything
                    pending.clear()
                    break

                # ── dependent_fail — skip steps whose dependency failed ──
                if error_policy == "dependent_fail":
                    to_skip = []
                    for step_key, step in pending.items():
                        deps = step.get("depends_on") or []
                        if any(dep in failed for dep in deps):
                            to_skip.append(step_key)
                    for step_key in to_skip:
                        skipped.add(step_key)
                        completed.add(step_key)
                        failures[step_key] = "Skipped — dependency failed"
                        logger.info(
                            "Step '%s' skipped due to failed dependency", step_key
                        )
                        del pending[step_key]
                        self._maybe_trace_skip(
                            db_conn, execution_id, step_key, step.get("kind", "")
                        )

                # ── Find ready steps ───────────────────────────────────
                # NOC-C: once paused_at_step is set, stop handing out NEW
                # work — the plan is waiting on a human decision. Anything
                # already submitted this iteration still gets to finish.
                ready = [] if paused_at_step else [
                    s for s in pending.values()
                    if all(
                        dep in completed
                        for dep in (s.get("depends_on") or [])
                    )
                    and eval_condition(
                        s.get("condition_expr") or "",
                        {"params": ctx.params, "results": ctx.results},
                    )
                ]

                for step in ready:
                    fut = pool.submit(
                        self._run_step_with_metrics,
                        plan_name, step, ctx, execution_id, db_conn
                    )
                    futures[fut] = step
                    pending.pop(step["step_key"])

                if not futures:
                    break

                done, _ = wait(futures.keys(), return_when=FIRST_COMPLETED)

                for fut in done:
                    step     = futures.pop(fut)
                    step_key = step["step_key"]
                    kind     = step["kind"]

                    try:
                        result = fut.result(
                            timeout=(step.get("timeout_ms") or 5000) / 1000
                        )
                        # ── Success ────────────────────────────────────
                        ctx.results[step_key] = result
                        completed.add(step_key)
                        logger.info(
                            "Step '%s' completed successfully", step_key
                        )

                        # NOC-C: a human_review step reaching this point
                        # (StepExecutionResult status "success", output
                        # tagged pending_human_review) means the design's
                        # "engine pauses" moment — stop scheduling further
                        # steps for the rest of this call.
                        if kind == "human_review" and isinstance(result, dict) \
                                and result.get("status") == "pending_human_review":
                            paused_at_step = step_key
                            logger.info(
                                "Plan '%s' pausing at human_review step '%s' — "
                                "awaiting approval before continuing",
                                plan_name, step_key,
                            )

                    except Exception as e:
                        # ── Failure ────────────────────────────────────
                        failures[step_key] = str(e)
                        failed.add(step_key)
                        completed.add(step_key)
                        STEP_FAILURES.labels(plan_name, step_key, kind).inc()
                        logger.error(
                            "Step '%s' failed: %s", step_key, str(e)
                        )

                        # ── Apply error policy ─────────────────────────
                        if error_policy == "fail_fast":
                            logger.warning(
                                "fail_fast: Step '%s' failed — aborting plan!", step_key
                            )
                            abort = True
                            # Cancel all running futures
                            for f in futures:
                                f.cancel()
                            futures.clear()
                            break

                        elif error_policy == "dependent_fail":
                            logger.info(
                                "dependent_fail: Step '%s' failed — "
                                "dependent steps will be skipped", step_key
                            )
                            # Skipping handled at top of while loop

                        elif error_policy == "best_effort":
                            logger.info(
                                "best_effort: Step '%s' failed — "
                                "continuing with remaining steps", step_key
                            )
                            # Just continue — no special action needed

                if paused_at_step and not futures:
                    # Nothing else is running and we've hit the pause point —
                    # stop the whole loop here rather than looking for more
                    # ready work (there won't be any while paused_at_step is set).
                    break

        PLAN_LATENCY.labels(plan_name, entity_type).observe(time() - start_time)

        return {
            "entity_type": entity_type,
            "plan":        plan_name,
            "params":      params,
            "results":     ctx.results,
            "errors":      failures,
            "skipped":     list(skipped),
            "error_policy": error_policy,
            "paused_at_step": paused_at_step,
            "completed_step_keys": list(completed),
        }

    def _maybe_trace_skip(self, db_conn, execution_id, step_key, kind):
        if db_conn is None or execution_id is None:
            return
        try:
            from . import execution_steps_repository as steps_repo
            sid = steps_repo.create_step_run(db_conn, execution_id, step_key, kind)
            steps_repo.mark_step_skipped(db_conn, sid, reason="dependency failed")
            db_conn.commit()
        except Exception:
            logger.exception(
                "Failed to write skip trace for step '%s' (non-fatal)", step_key
            )

    def _run_step_with_metrics(
        self,
        plan_name: str,
        step: dict,
        ctx: StepContext,
        execution_id: Optional[str] = None,
        db_conn=None,
    ) -> Any:
        step_key = step["step_key"]
        kind     = step["kind"]
        s        = time()

        execution_step_id = None
        if db_conn is not None and execution_id is not None:
            try:
                from . import execution_steps_repository as steps_repo
                execution_step_id = steps_repo.create_step_run(
                    db_conn, execution_id, step_key, kind
                )
                steps_repo.mark_step_running(db_conn, execution_step_id)
                db_conn.commit()
            except Exception:
                logger.exception(
                    "Failed to create execution_steps row for '%s' (non-fatal)",
                    step_key,
                )
                execution_step_id = None

        try:
            runtime_ctx = RuntimeContext(
                tenant_id=ctx.tenant_id,
                correlation_id=f"{plan_name}-{step_key}",
                execution_id=execution_id,
                plan_name=plan_name,
                step_key=step_key,
                runtime_params=ctx.params,
                prior_step_results=ctx.results,
                 db_conn=db_conn,
            )
            step_input = StepExecutionInput(context=runtime_ctx, step=step)

            executor = self.registry.get(kind)
            step_result = executor.execute(step_input)

            STEP_LATENCY.labels(plan_name, step_key, kind).observe(time() - s)
            duration_ms = int((time() - s) * 1000)

            if step_result.status == "failed":
                error_message = (
                    step_result.error.get("message")
                    if step_result.error else "Step failed"
                )
                if execution_step_id is not None:
                    self._safe_mark_failed(
                        db_conn, execution_step_id, step_result, step,
                        duration_ms,
                    )
                raise RuntimeError(error_message)

            if execution_step_id is not None:
                self._safe_mark_success(
                    db_conn, execution_step_id, step, step_result, duration_ms
                )

            # Unwrap back to the plain output dict — existing downstream
            # code (eval_condition, eval_bindings, ctx.results consumers)
            # expects a plain dict, exactly as before this change.
            return step_result.output

        except UnsupportedStepKindError:
            STEP_LATENCY.labels(plan_name, step_key, kind).observe(time() - s)
            if execution_step_id is not None:
                self._safe_mark_failed(
                    db_conn, execution_step_id,
                    None, step, int((time() - s) * 1000),
                    fallback_message=f"Unknown step kind: {kind}",
                )
            raise ValueError(f"Unknown step kind: {kind}")

        except Exception:
            STEP_LATENCY.labels(plan_name, step_key, kind).observe(time() - s)
            raise

    def _safe_mark_success(self, db_conn, execution_step_id, step, step_result, duration_ms):
        try:
            from . import execution_steps_repository as steps_repo
            steps_repo.mark_step_success(
                db_conn,
                execution_step_id,
                request_json=step,
                response_json=step_result.output,
                evidence_json=step_result.evidence,
                duration_ms=duration_ms,
            )
            db_conn.commit()
        except Exception:
            logger.exception(
                "Failed to write success trace for execution_step_id=%s (non-fatal)",
                execution_step_id,
            )

    def _safe_mark_failed(self, db_conn, execution_step_id, step_result, step, duration_ms, fallback_message=None):
        try:
            from . import execution_steps_repository as steps_repo
            error_json = (
                step_result.error if step_result and step_result.error
                else {"message": fallback_message or "Step failed"}
            )
            steps_repo.mark_step_failed(
                db_conn,
                execution_step_id,
                error_json=error_json,
                request_json=step,
                duration_ms=duration_ms,
            )
            db_conn.commit()
        except Exception:
            logger.exception(
                "Failed to write failure trace for execution_step_id=%s (non-fatal)",
                execution_step_id,
            )