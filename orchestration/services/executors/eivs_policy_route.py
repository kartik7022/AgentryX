# services/executors/eivs_policy_route.py
# services/executors/eivs_policy_route.py
import uuid
from typing import Any, Dict, List

from .step_executor import StepExecutor
from ..models.runtime_context import StepExecutionInput, StepExecutionResult
from ..eivs.intent_service import ClassifiedIntent, apply_routing_logic
from ..eivs.db import SessionLocal
from ..notifications import notify_human_review_needed


class PolicyRouteExecutor(StepExecutor):
    """
    ORCH-007: independently reloads eivs.intent_policies and re-applies
    auto_process_min_conf / manual_review_min_conf / multi_intent_mode /
    allow_multi_auto / allow_subset_auto for the classified intents, rather
    than relaying the routing_decision that intent_classify already
    computed. Reuses the exact same apply_routing_logic() that
    classify_email() calls internally, so there is exactly one place that
    encodes the threshold rules — no forked/duplicated policy logic.

    This means policy_route can be re-run against an updated policy
    without re-classifying, and works from any classify-shaped step output
    that carries an `intents` list, not just the email path.
    """

    @property
    def kind(self) -> str:
        return "policy_route"

    def execute(self, step_input: StepExecutionInput) -> StepExecutionResult:
        start = self._start_timer()
        ctx = step_input.context
        bindings = step_input.step.get("input_bindings_json") or {}

        classify_step_key = bindings.get("classify_step_key", "classify_email_intent")
        classify_result = ctx.prior_step_results.get(classify_step_key)

        if classify_result is None:
            return self.failure(
                step_key=ctx.step_key,
                kind=self.kind,
                error={
                    "message": (
                        f"No result found for prior step "
                        f"'{classify_step_key}' — policy_route must depend "
                        "on an intent_classify step"
                    ),
                    "type": "MissingDependencyError",
                },
                duration_ms=self._elapsed_ms(start),
            )

        if not isinstance(classify_result, dict):
            return self.failure(
                step_key=ctx.step_key,
                kind=self.kind,
                error={
                    "message": (
                        f"Result for step '{classify_step_key}' is not a "
                        f"dict (got {type(classify_result).__name__})"
                    ),
                    "type": "InvalidDependencyResultError",
                },
                duration_ms=self._elapsed_ms(start),
            )

        raw_intents = classify_result.get("intents") or []
        language_code = classify_result.get("language_detected")

        classified: List[ClassifiedIntent] = []
        for item in raw_intents:
            intent_code = item.get("intent_code")
            if not intent_code:
                continue
            classified.append(
                ClassifiedIntent(
                    intent_code=intent_code,
                    confidence=float(item.get("confidence", 0.0)),
                    coverage=item.get("coverage") or "PARTIAL",
                )
            )

        db = SessionLocal()
        try:
            routing = apply_routing_logic(
                db=db,
                classified=classified,
                language_code=language_code,
            )
        except Exception as e:
            return self.failure(
                step_key=ctx.step_key,
                kind=self.kind,
                error={"message": str(e), "type": type(e).__name__},
                duration_ms=self._elapsed_ms(start),
            )
        finally:
            db.close()

        output: Dict[str, Any] = {
            "status": "success",
            "routing_decision": routing.routing_decision,
            "primary_intent_code": routing.primary_intent_code,
            "primary_intent_conf": routing.primary_intent_conf,
            "coverage_status": routing.coverage_status,
            "routing_reasons": routing.routing_reasons,
            "reroute_email": routing.reroute_email,
        }

        # Built-in, automatic escalation: the moment routing lands on
        # MANUAL_REVIEW, a real ITSM ticket + Slack alert fires right here —
        # no separate plan step needed for this to happen, for ANY plan
        # using policy_route.
        if routing.routing_decision == "MANUAL_REVIEW":
            review_id = str(uuid.uuid4())
            reason = (
                f"Intent classification confidence ({routing.primary_intent_conf}%) for "
                f"'{routing.primary_intent_code}' was too low to safely auto-process — "
                "needs a human to review the original request from scratch."
            )
            notify_human_review_needed(
                review_id=review_id, execution_id=ctx.execution_id,
                step_key=ctx.step_key, tenant_id=ctx.tenant_id, reason=reason,
                plan_name=ctx.plan_name, conn=ctx.db_conn,
                ticket_type="manual_review",
            )
            output["manual_review_ticket_raised"] = True
            output["review_id"] = review_id

        evidence = {
            "source": "eivs.intent_policies",
            "policy_applied_independently": True,
            "read_from_classify_step": classify_step_key,
            "read_from_intent_run_id": (
                classify_result.get("evidence", {}).get("intent_run_id")
                if isinstance(classify_result.get("evidence"), dict) else None
            ),
        }

        trace_ids = {
            "execution_id": ctx.execution_id,
            "correlation_id": ctx.correlation_id,
        }

        return self.success(
            step_key=ctx.step_key,
            kind=self.kind,
            output=output,
            evidence=evidence,
            trace_ids=trace_ids,
            duration_ms=self._elapsed_ms(start),
        )