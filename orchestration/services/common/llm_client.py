# services/common/llm_client.py
import json
import logging
import os
from typing import Any, Dict, List

import httpx

logger = logging.getLogger(__name__)

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")


class LlmClientError(Exception):
    pass


async def call_llm_async(
    *,
    messages: List[Dict[str, Any]],
    timeout_seconds: int = 60,
    prompt_type: str = "GENERIC",
) -> Dict[str, Any]:
    if not GROQ_API_KEY:
        raise LlmClientError("GROQ_API_KEY not configured")

    try:
        async with httpx.AsyncClient(timeout=timeout_seconds) as client:
            response = await client.post(
                GROQ_API_URL,
                headers={
                    "Authorization": f"Bearer {GROQ_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": GROQ_MODEL,
                    "messages": messages,
                    "response_format": {"type": "json_object"},
                    "temperature": 0,
                },
            )
            response.raise_for_status()
            data = response.json()
    except httpx.HTTPError as e:
        raise LlmClientError(f"LLM request failed: {e}") from e

    try:
        content = data["choices"][0]["message"]["content"]
        parsed = json.loads(content)
    except (KeyError, IndexError, json.JSONDecodeError) as e:
        raise LlmClientError(f"Failed to parse LLM response: {e}") from e

    usage = data.get("usage", {})
    parsed["usage"] = {
        "prompt_tokens": usage.get("prompt_tokens"),
        "completion_tokens": usage.get("completion_tokens"),
    }
    return parsed