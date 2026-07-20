# services/executors/eivs_intent_classify.py
import asyncio
import logging
from typing import Any, Dict

from .step_executor import StepExecutor
from ..models.runtime_context import StepExecutionInput, StepExecutionResult
from ..eivs.models_runtime.intent_request import IntentClassificationRequest, PartyRef, AttachmentRef
from ..eivs.intent_service import classify_email, classify_request
from ..eivs.db import SessionLocal

logger = logging.getLogger(__name__)


class IntentClassifyExecutor(StepExecutor):
    """
    Supports all 12 IntentClassificationRequest source types.
    source_type='email' routes to classify_email() (left untouched, per
    ORCH-002 — proven, working, has its own test coverage). Every other
    source_type routes to classify_request(), the generic counterpart
    added to services/eivs/intent_service.py that builds a source-type-
    aware LLM prompt from whichever fields are populated.

    This step's job is ONLY to read the content and report the intent +
    confidence it found — it does not decide routing (AUTO_PROCESS /
    MANUAL_REVIEW / REROUTE). That's policy_route's separate, independent
    job, which recomputes its own decision from the raw `intents` list
    below rather than trusting anything this step might say about routing.
    """

    @property
    def kind(self) -> str:
        return "intent_classify"

    def execute(self, step_input: StepExecutionInput) -> StepExecutionResult:
        start = self._start_timer()
        ctx = step_input.context
        bindings = step_input.step.get("input_bindings_json") or {}
        params = ctx.runtime_params

        source_type = bindings.get("source_type", "email")

        try:
            request = IntentClassificationRequest(
                request_id=ctx.correlation_id,
                tenant_id=ctx.tenant_id,
                source_type=source_type,
                entity_id=params.get("email_id") or params.get("entity_id"),
                correlation_id=ctx.correlation_id,
                language_hint=params.get("language_hint"),
                channel=params.get("channel") or bindings.get("channel"),
                locale=params.get("locale", "multi"),
                # Email fields
                subject=params.get("subject"),
                body=params.get("body"),
                sender_email=params.get("sender_email"),
                sender_name=params.get("sender_name"),
                # Chat / generic text fields
                text=params.get("text"),
                messages=params.get("messages") or [],
                # Document / support_ticket fields
                title=params.get("title"),
                summary=params.get("summary"),
                # Claim / structured event fields
                claim_id=params.get("claim_id"),
                payload_json=params.get("payload_json") or {},
                metadata=params.get("metadata") or {},
                # Attachments (document / patient_record)
                attachments=[
                    AttachmentRef(**a) if isinstance(a, dict) else a
                    for a in (params.get("attachments") or [])
                ],
                participants=[
                    PartyRef(**p) if isinstance(p, dict) else p
                    for p in (params.get("participants") or [])
                ],
            )
        except Exception as e:
            return self.failure(
                step_key=ctx.step_key,
                kind=self.kind,
                error={
                    "message": f"Invalid intent classification request: {e}",
                    "type": "ValidationError",
                },
                duration_ms=self._elapsed_ms(start),
            )

        db = SessionLocal()
        try:
            if request.source_type == "email":
                legacy_kwargs = request.to_legacy_email_request()
                intent_run = asyncio.run(classify_email(db, **legacy_kwargs))
            else:
                intent_run = asyncio.run(classify_request(db, request=request))

            # Extract every field we need while the session is still open —
            # touching ORM attributes after db.close() (below) raises
            # "Instance is not bound to a Session" if anything was expired
            # since the last commit/refresh (e.g. when classify_email's own
            # LLM call failed and it returned the still-provisional run).
            run_snapshot = {
                "intent_run_id": str(intent_run.intent_run_id),
                "primary_intent_code": intent_run.primary_intent_code,
                "primary_intent_conf": (
                    float(intent_run.primary_intent_conf)
                    if intent_run.primary_intent_conf is not None else None
                ),
                "language_detected": intent_run.language_detected,
                "intents_json": intent_run.intents_json,
            }
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
            "intent_run_id": run_snapshot["intent_run_id"],
            "primary_intent_code": run_snapshot["primary_intent_code"],
            "primary_intent_conf": run_snapshot["primary_intent_conf"],
            "language_detected": run_snapshot["language_detected"],
            "intents": run_snapshot["intents_json"],
        }

        evidence = {
            "source": "eivs.email_intent_runs",
            "source_type": request.source_type,
            "intent_run_id": run_snapshot["intent_run_id"],
        }
        trace_ids = {
            "execution_id": ctx.execution_id,
            "correlation_id": ctx.correlation_id,
            "intent_run_id": run_snapshot["intent_run_id"],
        }

        return self.success(
            step_key=ctx.step_key,
            kind=self.kind,
            output=output,
            evidence=evidence,
            trace_ids=trace_ids,
            duration_ms=self._elapsed_ms(start),
        )