# services/executors/webhook_executor.py
import logging
import uuid
from typing import Any, Dict

import httpx

from .step_executor import StepExecutor
from ..models.runtime_context import StepExecutionInput, StepExecutionResult
from ..expression import eval_bindings

logger = logging.getLogger(__name__)


class WebhookExecutor(StepExecutor):
    """
    Outbound-notification step kind. Used for the terminal step of a plan
    (e.g. `send_to_n8n_or_webhook`) to push the final orchestration result
    to an external system such as n8n, a customer callback URL, or another
    internal service. Unlike `rest`, this executor is intentionally
    minimal and fire-oriented: it does not attempt datasource-backed auth
    resolution, it just resolves bindings and posts.
    """

    @property
    def kind(self) -> str:
        return "webhook"

    def execute(self, step_input: StepExecutionInput) -> StepExecutionResult:
        start = self._start_timer()
        ctx = step_input.context
        step = step_input.step
        bindings_raw = step.get("input_bindings_json") or {}

        resolve_context = {
            "params": ctx.runtime_params,
            "results": ctx.prior_step_results,
        }
        try:
            bindings = eval_bindings(bindings_raw, resolve_context)
        except Exception:
            bindings = bindings_raw

        url = bindings.get("url") or step.get("path_template")
        if not url:
            return self.failure(
                step_key=ctx.step_key,
                kind=self.kind,
                error={
                    "message": (
                        "webhook requires a 'url' in input_bindings_json "
                        "(or path_template on the step)"
                    ),
                    "type": "MissingWebhookUrlError",
                },
                duration_ms=self._elapsed_ms(start),
            )

        method = (bindings.get("method") or step.get("method") or "POST").upper()
        headers = dict(bindings.get("headers") or {})
        headers.setdefault("Content-Type", "application/json")
        headers.setdefault("X-Correlation-ID", ctx.correlation_id or "")

        body = bindings.get("body")
        if body is None:
            body = {
                "execution_id": ctx.execution_id,
                "plan_name": ctx.plan_name,
                "step_key": ctx.step_key,
                "params": ctx.runtime_params,
                "results": ctx.prior_step_results,
            }

        webhook_call_id = str(uuid.uuid4())
        timeout_s = max((step.get("timeout_ms") or 5000) / 1000.0, 1.0)

        try:
            with httpx.Client(timeout=timeout_s) as client:
                resp = client.request(method, url, headers=headers, json=body)
        except Exception as e:
            return self.failure(
                step_key=ctx.step_key,
                kind=self.kind,
                error={"message": str(e), "type": type(e).__name__},
                duration_ms=self._elapsed_ms(start),
            )

        try:
            response_body: Any = resp.json()
        except Exception:
            response_body = resp.text

        output: Dict[str, Any] = {
            "status": "success" if resp.status_code < 400 else "failed",
            "webhook_call_id": webhook_call_id,
            "url": url,
            "method": method,
            "status_code": resp.status_code,
            "response_body": response_body,
        }

        evidence = {
            "source": "webhook",
            "webhook_call_id": webhook_call_id,
            "url": url,
            "status_code": resp.status_code,
        }
        trace_ids = {
            "execution_id": ctx.execution_id,
            "correlation_id": ctx.correlation_id,
            "webhook_call_id": webhook_call_id,
        }

        if resp.status_code >= 400:
            return self.failure(
                step_key=ctx.step_key,
                kind=self.kind,
                error={
                    "message": f"Webhook returned HTTP {resp.status_code}",
                    "type": "WebhookHttpError",
                    "response_body": response_body,
                },
                duration_ms=self._elapsed_ms(start),
            )

        return self.success(
            step_key=ctx.step_key,
            kind=self.kind,
            output=output,
            evidence=evidence,
            trace_ids=trace_ids,
            duration_ms=self._elapsed_ms(start),
        )