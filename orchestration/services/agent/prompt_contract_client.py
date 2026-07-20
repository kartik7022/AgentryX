# services/agent/prompt_contract_client.py
from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)

PROMPT_SERVICE_URL = os.getenv("PROMPT_SERVICE_URL", "http://localhost:9007")


def get_published_prompt_contract(
    prompt_id_or_name: str,
    version: str = "published",
) -> Dict[str, Any]:
    """
    Load a published Prompt Builder contract.
    Tries internal TEMPLATES first; falls back to HTTP GET.
    Raises ValueError if not found.
    """
    try:
        from services.main import TEMPLATES  # type: ignore
        if prompt_id_or_name in TEMPLATES:
            tmpl = TEMPLATES[prompt_id_or_name]
            return {
                "prompt_id":    prompt_id_or_name,
                "prompt_name":  tmpl.get("name", prompt_id_or_name),
                "version":      version,
                "template":     tmpl.get("template", ""),
                "placeholders": tmpl.get("placeholders", []),
                "source":       "internal_templates",
            }
    except Exception:
        pass

    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(
                f"{PROMPT_SERVICE_URL}/v1/prompts/{prompt_id_or_name}",
                params={"version": version},
            )
            if resp.status_code == 404:
                raise ValueError(
                    f"Prompt '{prompt_id_or_name}' not found in Prompt Builder service"
                )
            resp.raise_for_status()
            return resp.json()
    except ValueError:
        raise
    except Exception as e:
        raise ValueError(f"Failed to load prompt contract '{prompt_id_or_name}': {e}")


def validate_runtime_params(
    contract: Dict[str, Any],
    runtime_params: Dict[str, Any],
) -> List[str]:
    """Returns list of error strings — empty = valid."""
    errors: List[str] = []
    for placeholder in (contract.get("placeholders") or []):
        if placeholder not in runtime_params:
            errors.append(
                f"Missing required param '{placeholder}' "
                f"for prompt '{contract.get('prompt_id', contract.get('prompt_name'))}'"
            )
    return errors


def resolve_context(
    contract: Dict[str, Any],
    runtime_params: Dict[str, Any],
    prior_results: Dict[str, Any],
) -> Dict[str, Any]:
    """Merge runtime_params and prior_results into a resolved context dict."""
    resolved: Dict[str, Any] = {}
    for ph in (contract.get("placeholders") or []):
        if ph in runtime_params:
            resolved[ph] = runtime_params[ph]
            continue
        for step_output in prior_results.values():
            if isinstance(step_output, dict) and ph in step_output:
                resolved[ph] = step_output[ph]
                break
    for k, v in runtime_params.items():
        if k not in resolved:
            resolved[k] = v
    return resolved


def compile_agent_prompt(
    contract: Dict[str, Any],
    goal: str,
    runtime_params: Dict[str, Any],
    resolved_context: Dict[str, Any],
    tools: List[str],
    guardrails: Optional[List[str]] = None,
    tool_observations: Optional[List[str]] = None,
) -> str:
    """Compile the final agent prompt from contract template, goal, tools and guardrails.

    tool_observations carries the running scratchpad of prior tool results for
    this same agent run — AgentRuntime calls this once per loop iteration so
    the model sees what it has already tried, exactly like the legacy
    inline-prompt path did.
    """
    compiled = contract.get("template", "")
    for k, v in resolved_context.items():
        compiled = compiled.replace(f"{{{{{k}}}}}", str(v))
        compiled = compiled.replace(f"{{{k}}}", str(v))

    parts = []
    if goal:
        parts.append(f"GOAL: {goal}")
    if compiled.strip():
        parts.append(f"PROMPT CONTEXT:\n{compiled}")
    if tools:
        parts.append(f"ALLOWED TOOLS: {', '.join(tools)}")
    if guardrails:
        parts.append("GUARDRAILS:\n" + "\n".join(f"- {g}" for g in guardrails))
    if tool_observations:
        parts.append("TOOL OBSERVATIONS:\n" + "\n".join(tool_observations[-5:]))
    parts.append(
        'Respond with valid JSON only:\n'
        '{"action":"tool_call"|"final_answer"|"request_approval",'
        '"tool_name":"...","tool_input":{...},'
        '"final_output":{...},"reason_code":"..."}'
    )
    return "\n\n".join(parts)