# services/executors/prompt_run_executor.py
import json
import logging
import os
import uuid
from typing import Any, Dict

import httpx
from jsonschema import validate, ValidationError

from .step_executor import StepExecutor
from ..models.runtime_context import StepExecutionInput, StepExecutionResult

logger = logging.getLogger(__name__)

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")


def _resolve_prompt_template(bindings: Dict[str, Any], step: Dict[str, Any]) -> str:
    return (
        bindings.get("prompt_template")
        or step.get("ai_prompt_template")
        or ""
    )


def _build_prompt(template: str, runtime_params: Dict[str, Any], prior_results: Dict[str, Any]) -> str:
    context = {"params": runtime_params, "results": prior_results}
    context_text = json.dumps(context, indent=2, default=str)
    prompt = f"{template}\n\nContext:\n{context_text}"
    prompt += "\n\nRespond with valid JSON only. No explanation, no markdown, just the JSON object."
    return prompt


def _call_groq(prompt: str) -> Dict[str, Any]:
    with httpx.Client(timeout=60.0) as client:
        resp = client.post(
            GROQ_API_URL,
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": GROQ_MODEL,
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "You are a governed prompt execution engine. "
                            "Follow the instructions in the prompt template exactly. "
                            "Always respond with valid JSON only, no markdown."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.1,
                "max_tokens": 2048,
                "response_format": {"type": "json_object"},
            },
        )
        resp.raise_for_status()
        data = resp.json()
        content = data["choices"][0]["message"]["content"]
        usage = data.get("usage", {})
        return {
            "output": json.loads(content),
            "model": data.get("model", GROQ_MODEL),
            "tokens_prompt": usage.get("prompt_tokens"),
            "tokens_completion": usage.get("completion_tokens"),
        }


class PromptRunExecutor(StepExecutor):
    @property
    def kind(self) -> str:
        return "prompt_run"

    def execute(self, step_input: StepExecutionInput) -> StepExecutionResult:
        start = self._start_timer()
        ctx = step_input.context
        bindings = step_input.step.get("input_bindings_json") or {}

        prompt_template = _resolve_prompt_template(bindings, step_input.step)
        if not prompt_template:
            return self.failure(
                step_key=ctx.step_key,
                kind=self.kind,
                error={
                    "message": (
                        "prompt_run requires a prompt_template in "
                        "input_bindings_json or ai_prompt_template on the step"
                    ),
                    "type": "MissingPromptTemplateError",
                },
                duration_ms=self._elapsed_ms(start),
            )

        if not GROQ_API_KEY:
            return self.failure(
                step_key=ctx.step_key,
                kind=self.kind,
                error={"message": "GROQ_API_KEY not configured", "type": "ConfigurationError"},
                duration_ms=self._elapsed_ms(start),
            )

        prompt = _build_prompt(prompt_template, ctx.runtime_params, ctx.prior_step_results)
        prompt_run_id = str(uuid.uuid4())

        try:
            llm_result = _call_groq(prompt)
        except Exception as e:
            return self.failure(
                step_key=ctx.step_key,
                kind=self.kind,
                error={"message": str(e), "type": type(e).__name__},
                duration_ms=self._elapsed_ms(start),
            )

        output_schema = bindings.get("output_schema") or step_input.step.get("ai_output_schema")
        validation_errors = []
        if output_schema:
            try:
                validate(instance=llm_result["output"], schema=output_schema)
            except ValidationError as e:
                validation_errors.append(str(e))
                logger.warning("prompt_run output schema validation failed: %s", e)

        output: Dict[str, Any] = {
            "status": "success",
            "prompt_run_id": prompt_run_id,
            "output": llm_result["output"],
            "model": llm_result["model"],
            "tokens_prompt": llm_result["tokens_prompt"],
            "tokens_completion": llm_result["tokens_completion"],
            "guardrail_result": {
                "schema_validated": bool(output_schema),
                "validation_errors": validation_errors,
            },
        }

        evidence = {
            "source": "prompt_run",
            "prompt_run_id": prompt_run_id,
            "model": llm_result["model"],
        }
        trace_ids = {
            "execution_id": ctx.execution_id,
            "correlation_id": ctx.correlation_id,
            "prompt_run_id": prompt_run_id,
        }

        return self.success(
            step_key=ctx.step_key,
            kind=self.kind,
            output=output,
            evidence=evidence,
            trace_ids=trace_ids,
            duration_ms=self._elapsed_ms(start),
        )