# services/eivs/chart_llm_client.py
from __future__ import annotations

import logging
import os
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from services.common.llm_client import call_llm_async, LlmClientError
from services.eivs.models import LlmPrompt


LOGGER = logging.getLogger(__name__)
LOGGER.setLevel(logging.INFO)


def _get_timeout_seconds() -> int:
    """Timeout used when calling the shared llm-service."""
    return int(os.getenv("EIVS_LLM_TIMEOUT_SECONDS", "60"))


async def call_llm_with_logging(
    db: Session,
    *,
    messages: List[Dict[str, Any]],
    prompt_type: str,
    intent_run_id: Optional[Any] = None,
    validation_run_id: Optional[Any] = None,
    model_name: Optional[str] = None,
    backend: str = "PRIMARY",
    tenant_id: str,
) -> Dict[str, Any]:
    """
    EIVS entrypoint for LLM calls.

    - Delegates to services.common.llm_client.call_llm_async (which talks to
      llm-service at LLM_SERVICE_URL).
    - Does NOT try to override provider-specific config here; backend_type,
      base_url, model, api_key are optional and may be None.
    - Logs the prompt/response into eivs.llm_prompts for audit/cost tracking.
    - Returns the raw JSON `data` payload that llm-service produced.

    This function is what intent_service, validation_orchestrator, etc. use.
    """
    timeout_seconds = _get_timeout_seconds()

    request_payload: Dict[str, Any] = {
        "messages": messages,
        "prompt_type": prompt_type,
        "backend": backend,
        "model_name": model_name,
        "timeout_seconds": timeout_seconds,
    }

    LOGGER.info(
        "EIVS LLM call: backend_label=%s model_name=%s prompt_type=%s timeout=%s",
        backend,
        model_name,
        prompt_type,
        timeout_seconds,
    )

    started_at = datetime.utcnow()
    try:
        # Only pass messages / timeout / prompt_type; other kwargs use defaults.
        response: Dict[str, Any] = await call_llm_async(
            messages=messages,
            timeout_seconds=timeout_seconds,
            prompt_type=prompt_type,
        )
        success = True
        error_message = None
    except LlmClientError as exc:
        LOGGER.error(
            "LLM call failed for prompt_type=%s backend_label=%s model_name=%s: %s",
            prompt_type,
            backend,
            model_name,
            exc,
        )
        response = {"error": str(exc)}
        success = False
        error_message = str(exc)

    finished_at = datetime.utcnow()

    # Extract token usage if llm-service provided it
    usage = response.get("usage") or {}
    tokens_prompt = usage.get("prompt_tokens")
    tokens_completion = usage.get("completion_tokens")

    # Persist prompt log – failures here must NOT break the main flow
    try:
        prompt_row = LlmPrompt(
            intent_run_id=intent_run_id,
            validation_run_id=validation_run_id,
            prompt_type=prompt_type,
            model_name=model_name or "",
            backend=backend,
            request_payload=request_payload,
            response_payload=response,
            tokens_prompt=tokens_prompt,
            tokens_completion=tokens_completion,
            created_at=started_at,
            tenant_id=tenant_id,
        )
        db.add(prompt_row)
        db.commit()
    except Exception:
        LOGGER.exception("Failed to log LLM prompt for EIVS")
        db.rollback()

    if not success:
        # Surface the error so callers can route to MANUAL_REVIEW, etc.
        raise LlmClientError(error_message or "Unknown LLM error in EIVS")

    return response