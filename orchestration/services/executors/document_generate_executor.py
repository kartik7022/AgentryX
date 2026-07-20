# services/executors/document_generate_executor.py
import logging
import uuid
from typing import Any, Dict

from .step_executor import StepExecutor
from ..models.runtime_context import StepExecutionInput, StepExecutionResult

logger = logging.getLogger(__name__)


class DocumentGenerateExecutor(StepExecutor):
    @property
    def kind(self) -> str:
        return "document_generate"

    def execute(self, step_input: StepExecutionInput) -> StepExecutionResult:
        start = self._start_timer()
        ctx = step_input.context
        bindings = step_input.step.get("input_bindings_json") or {}
        params = ctx.runtime_params

        template_id = bindings.get("template_id")
        if not template_id:
            return self.failure(
                step_key=ctx.step_key,
                kind=self.kind,
                error={
                    "message": (
                        "document_generate requires a template_id in "
                        "input_bindings_json"
                    ),
                    "type": "MissingTemplateError",
                },
                duration_ms=self._elapsed_ms(start),
            )

        # Lazy import to avoid circular import: main.py imports orchestrator.py
        # -> registry.py -> this file, so importing from main.py at module
        # load time would deadlock the import chain.
        from ..main import TEMPLATES, _render_content, _apply_redaction

        template = TEMPLATES.get(template_id)
        if not template:
            return self.failure(
                step_key=ctx.step_key,
                kind=self.kind,
                error={
                    "message": f"Template '{template_id}' not found",
                    "type": "TemplateNotFoundError",
                },
                duration_ms=self._elapsed_ms(start),
            )

        placeholder_values = bindings.get("placeholder_values")
        if placeholder_values is None:
            # Fall back to whatever's available from runtime params and
            # prior step results, matching the template's declared placeholders.
            placeholder_values = {}
            for ph in template.get("placeholders", []):
                if ph in params:
                    placeholder_values[ph] = params[ph]
                else:
                    for prior_result in ctx.prior_step_results.values():
                        if isinstance(prior_result, dict) and ph in prior_result:
                            placeholder_values[ph] = prior_result[ph]
                            break

        redaction_role = bindings.get("redaction_role")
        redacted_fields = []
        values_to_render = placeholder_values
        if redaction_role:
            values_to_render, redacted_fields = _apply_redaction(
                placeholder_values, redaction_role
            )

        try:
            content = _render_content(template, values_to_render)
        except Exception as e:
            return self.failure(
                step_key=ctx.step_key,
                kind=self.kind,
                error={"message": str(e), "type": type(e).__name__},
                duration_ms=self._elapsed_ms(start),
            )

        document_job_id = str(uuid.uuid4())

        output: Dict[str, Any] = {
            "status": "success",
            "document_job_id": document_job_id,
            "template_id": template_id,
            "template_name": template.get("name"),
            "output_target": bindings.get("output_target", "inline"),
            "result_location": None,
            "content_preview": content,
            "redacted_fields": redacted_fields,
        }

        evidence = {
            "source": "document_generate",
            "document_job_id": document_job_id,
            "template_id": template_id,
        }
        trace_ids = {
            "execution_id": ctx.execution_id,
            "correlation_id": ctx.correlation_id,
            "document_job_id": document_job_id,
        }

        return self.success(
            step_key=ctx.step_key,
            kind=self.kind,
            output=output,
            evidence=evidence,
            trace_ids=trace_ids,
            duration_ms=self._elapsed_ms(start),
        )