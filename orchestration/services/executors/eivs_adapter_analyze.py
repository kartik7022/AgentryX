# services/executors/eivs_adapter_analyze.py
import asyncio
import json
import logging
from typing import Any, Dict

from .step_executor import StepExecutor
from ..models.runtime_context import StepExecutionInput, StepExecutionResult
from ..eivs.adapter_client import (
    call_adapter_email_validation_analyze,
    call_adapter_email_search_analyze,
    AdapterClientError,
)

logger = logging.getLogger(__name__)

_SUPPORTED_OPERATIONS = {
    "email_validation_analyze": call_adapter_email_validation_analyze,
    "email_search_analyze": call_adapter_email_search_analyze,
}


class AdapterAnalyzeExecutor(StepExecutor):
    @property
    def kind(self) -> str:
        return "adapter_analyze"

    def execute(self, step_input: StepExecutionInput) -> StepExecutionResult:
        start = self._start_timer()
        ctx = step_input.context
        bindings = step_input.step.get("input_bindings_json") or {}
        params = ctx.runtime_params

        operation = bindings.get("operation", "email_validation_analyze")
        adapter_fn = _SUPPORTED_OPERATIONS.get(operation)

        if adapter_fn is None:
            return self.failure(
                step_key=ctx.step_key,
                kind=self.kind,
                error={
                    "message": (
                        f"Unsupported adapter_analyze operation '{operation}' "
                        f"— supported: {sorted(_SUPPORTED_OPERATIONS)}"
                    ),
                    "type": "UnsupportedOperationError",
                },
                duration_ms=self._elapsed_ms(start),
            )

        datasource_name = (
            bindings.get("datasource_name")
            or step_input.step.get("datasource_name")
        )
        if not datasource_name:
            return self.failure(
                step_key=ctx.step_key,
                kind=self.kind,
                error={
                    "message": "adapter_analyze requires a datasource_name",
                    "type": "MissingDatasourceError",
                },
                duration_ms=self._elapsed_ms(start),
            )

        prompt = bindings.get("prompt")
        if prompt is None:
            prompt = json.dumps(params)
        elif not isinstance(prompt, str):
            prompt = json.dumps(prompt)

        try:
            adapter_response = asyncio.run(
                adapter_fn(
                    tenant_id=ctx.tenant_id,
                    prompt=prompt,
                    datasource_name=datasource_name,
                    correlation_id=ctx.correlation_id,
                )
            )
        except AdapterClientError as e:
            return self.failure(
                step_key=ctx.step_key,
                kind=self.kind,
                error={"message": str(e), "type": "AdapterClientError"},
                duration_ms=self._elapsed_ms(start),
            )
        except Exception as e:
            return self.failure(
                step_key=ctx.step_key,
                kind=self.kind,
                error={"message": str(e), "type": type(e).__name__},
                duration_ms=self._elapsed_ms(start),
            )

        output: Dict[str, Any] = {
            "status": adapter_response.get("status"),
            "datasource_result": adapter_response.get("datasource_result"),
            "sql_executed": adapter_response.get("sql_executed"),
            "safety_decision": adapter_response.get("sgate_decision"),
            "safety_request_id": adapter_response.get("safety_request_id"),
            "evidence_id": adapter_response.get("evidence_id"),
            "adapter_request_id": adapter_response.get("request_id"),
        }

        evidence = {
            "source": "adapter",
            "operation": operation,
            "evidence_id": adapter_response.get("evidence_id"),
            "safety_request_id": adapter_response.get("safety_request_id"),
        }

        trace_ids = {
            "execution_id": ctx.execution_id,
            "correlation_id": ctx.correlation_id,
            "adapter_request_id": adapter_response.get("request_id"),
        }

        return self.success(
            step_key=ctx.step_key,
            kind=self.kind,
            output=output,
            evidence=evidence,
            trace_ids=trace_ids,
            duration_ms=self._elapsed_ms(start),
        )