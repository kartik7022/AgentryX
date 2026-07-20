# src/core/prompt_compiler.py
# =============================================================================
# PB-005: Prompt Compiler Service
# =============================================================================
#
# Pure Python module — NO database access, NO HTTP calls, NO async.
# This is a deterministic function that turns a structured prompt
# (blocks + inputs + context + schema + guardrails) into a single
# LLM-ready instruction package.
#
# Why "pure"? So we can:
#   1. Unit test it without spinning up DB or network.
#   2. Reuse it in any execution context (sync/async/batch).
#   3. Cache compiled output by hash without worrying about side effects.
#
# Public API:
#   compile_prompt(blocks, runtime_params, resolved_context,
#                  output_schema, guardrails) -> dict
#   interpolate(text, values) -> str
# =============================================================================

import json
import logging
import re
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# ─── Regex for {{variable}} interpolation ──────────────────────────────────
# Matches:   {{name}}, {{ name }}, {{customer.id}}, {{loan_number}}
# Captures the inner name (trimmed of whitespace).
_INTERPOLATE_RE = re.compile(r"\{\{\s*([\w.]+)\s*\}\}")


# ─── Block-type grouping rules ─────────────────────────────────────────────
# As per spec:
#   - system / safety / role  → goes into the SYSTEM message
#   - task / instruction / business_rule / context / example / fallback
#                              → goes into the USER message
SYSTEM_BLOCK_TYPES = {"system", "safety", "role"}
USER_BLOCK_TYPES = {
    "task", "instruction", "business_rule",
    "context", "example", "fallback",
    "retrieval", "tool_call",
}
# `output_schema` blocks are handled specially (appended at the end of user msg)


# =============================================================================
# Public helpers
# =============================================================================

def interpolate(text: str, values: Dict[str, Any]) -> str:
    """
    Replace {{variable}} tokens in `text` with corresponding values
    from the `values` dict. Supports dotted lookups: {{loan.amount}}
    will look up values["loan"]["amount"].

    Per spec acceptance criteria: missing variables stay visible as
    `{{variable}}` so they're easy to debug at runtime.
    """
    if not text:
        return text or ""

    def _replace(match: re.Match) -> str:
        var_name = match.group(1)
        try:
            value = _resolve_dotted(values, var_name)
        except (KeyError, TypeError, AttributeError):
            # Spec: leave the token visible for debugging
            return match.group(0)

        if value is None:
            return match.group(0)

        # Render dicts/lists as compact JSON (so they fit in prompt text)
        if isinstance(value, (dict, list)):
            return json.dumps(value, ensure_ascii=False, default=str)
        return str(value)

    return _INTERPOLATE_RE.sub(_replace, text)


def _resolve_dotted(values: Dict[str, Any], path: str) -> Any:
    """Resolve a dotted path like 'customer.full_name' against a nested dict."""
    if "." not in path:
        if path not in values:
            raise KeyError(path)
        return values[path]

    parts = path.split(".")
    current: Any = values
    for part in parts:
        if isinstance(current, dict):
            if part not in current:
                raise KeyError(path)
            current = current[part]
        else:
            raise TypeError(f"Cannot descend into non-dict at {part}")
    return current


def _collect_variables(text: str) -> List[str]:
    """Return all unique {{variable}} names referenced in `text`."""
    if not text:
        return []
    return list({m.group(1) for m in _INTERPOLATE_RE.finditer(text)})


# =============================================================================
# Main compiler
# =============================================================================

def compile_prompt(
    blocks: List[Dict[str, Any]],
    runtime_params: Optional[Dict[str, Any]] = None,
    resolved_context: Optional[Dict[str, Any]] = None,
    output_schema: Optional[Dict[str, Any]] = None,
    guardrails: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Compile a structured prompt into the final system + user message pair
    that gets sent to the LLM.

    Args:
        blocks:             list of dicts shaped like
                            {"block_type": str, "sequence_no": int,
                             "title": str|None, "content": str}
        runtime_params:     caller-supplied variables (loan_number, etc.)
        resolved_context:   data already fetched by the orchestrator
                            (e.g. {"loan_record": {...}, "customer": {...}})
        output_schema:      JSON schema the LLM must conform to
        guardrails:         {max_output_tokens, banned_topics, ...}

    Returns:
        {
          "system":   str,           # joined system + safety + role blocks
          "user":     str,           # joined task + rules + context + schema
          "metadata": {
              "block_count":     int,
              "variables_used":  list[str],
              "missing_vars":    list[str],
              "model_policy":    {...},
              "output_format":   "json" | "text",
          }
        }
    """
    # Defensive defaults (function must remain pure even if caller passes None)
    blocks = blocks or []
    runtime_params = runtime_params or {}
    resolved_context = resolved_context or {}
    output_schema = output_schema or {}
    guardrails = guardrails or {}

    # ─── 1. Build the merged variable namespace ───────────────────────────
    # runtime_params are top-level (loan_number, etc.).
    # resolved_context entries are also top-level (loan_record, customer).
    # If a key collides, runtime_params wins (caller intent).
    variable_namespace: Dict[str, Any] = {}
    variable_namespace.update(resolved_context)
    variable_namespace.update(runtime_params)

    # ─── 2. Sort blocks by sequence_no ─────────────────────────────────────
    # Defensive copy + stable sort. Missing sequence_no goes last.
    sorted_blocks = sorted(
        blocks,
        key=lambda b: b.get("sequence_no") if b.get("sequence_no") is not None else 1_000_000,
    )

    # ─── 3. Group blocks by message role ──────────────────────────────────
    system_parts: List[str] = []
    user_parts: List[str] = []
    output_schema_blocks: List[Dict[str, Any]] = []   # rendered last in user msg

    variables_referenced: set = set()

    for block in sorted_blocks:
        block_type = (block.get("block_type") or "").lower().strip()
        title = block.get("title") or ""
        content = block.get("content") or ""

        # Track which variables this block references (before interpolation)
        for v in _collect_variables(content):
            variables_referenced.add(v)

        # Substitute {{vars}} in the block content
        rendered_content = interpolate(content, variable_namespace)

        # Skip blocks with no content after rendering (purely structural)
        if not rendered_content.strip():
            continue

        # Format as titled section if title present, else plain content
        section = (
            f"### {title}\n{rendered_content}".strip()
            if title
            else rendered_content
        )

        if block_type in SYSTEM_BLOCK_TYPES:
            system_parts.append(section)
        elif block_type in USER_BLOCK_TYPES:
            user_parts.append(section)
        elif block_type == "output_schema":
            # Defer — render at the end of the user message
            output_schema_blocks.append({"title": title, "content": rendered_content})
        else:
            # Unknown block type — be permissive, treat as user content
            logger.warning(f"Unknown block_type '{block_type}', treating as user content")
            user_parts.append(section)

    # ─── 4. Append resolved_context as a JSON appendix to user msg ────────
    if resolved_context:
        try:
            ctx_json = json.dumps(resolved_context, indent=2, default=str, ensure_ascii=False)
        except Exception as exc:
            logger.warning(f"Could not serialize resolved_context: {exc}")
            ctx_json = str(resolved_context)
        user_parts.append(
            "### Context Data\nThe following data has been fetched for this request:\n"
            f"```json\n{ctx_json}\n```"
        )

    # ─── 5. Render output_schema blocks (block-level overrides param) ─────
    for sb in output_schema_blocks:
        if sb["title"]:
            user_parts.append(f"### {sb['title']}\n{sb['content']}")
        else:
            user_parts.append(sb["content"])

    # ─── 6. Append the formal output_schema instruction ───────────────────
    output_format = "text"
    if output_schema:
        output_format = "json"
        try:
            schema_json = json.dumps(output_schema, indent=2, ensure_ascii=False)
        except Exception:
            schema_json = str(output_schema)

        user_parts.append(
            "### Required Output Format\n"
            "Respond with a single JSON object that conforms exactly to this schema. "
            "Do not include any prose, markdown, or explanation outside of the JSON.\n\n"
            f"```json\n{schema_json}\n```"
        )

    # ─── 7. Append guardrails as instructions in system message ───────────
    guardrail_instructions = _format_guardrails(guardrails)
    if guardrail_instructions:
        # Prepend to system so it has high precedence
        system_parts.insert(0, guardrail_instructions)

    # ─── 8. Identify missing variables (helpful for debugging) ────────────
    missing_vars = sorted(
        v for v in variables_referenced
        if not _is_resolvable(v, variable_namespace)
    )

    # ─── 9. Assemble final messages ───────────────────────────────────────
    system_message = "\n\n".join(p for p in system_parts if p.strip()).strip()
    user_message = "\n\n".join(p for p in user_parts if p.strip()).strip()

    metadata = {
        "block_count":      len(sorted_blocks),
        "variables_used":   sorted(variables_referenced),
        "missing_vars":     missing_vars,
        "output_format":    output_format,
        "model_policy":     guardrails.get("model_policy") or {},
        "max_output_tokens": guardrails.get("max_output_tokens"),
    }

    if missing_vars:
        logger.warning(
            f"Compiled prompt has {len(missing_vars)} unresolved variable(s): {missing_vars}"
        )

    return {
        "system":   system_message,
        "user":     user_message,
        "metadata": metadata,
    }


# =============================================================================
# Internal helpers
# =============================================================================

def _is_resolvable(var_name: str, values: Dict[str, Any]) -> bool:
    """Check if a (possibly dotted) variable resolves to a non-None value."""
    try:
        result = _resolve_dotted(values, var_name)
        return result is not None
    except (KeyError, TypeError, AttributeError):
        return False


def _format_guardrails(guardrails: Dict[str, Any]) -> str:
    """
    Convert a guardrails dict into clear instruction text.
    Returns "" if no guardrails apply.
    """
    if not guardrails:
        return ""

    parts: List[str] = []

    banned = guardrails.get("banned_topics") or []
    if banned:
        topics = ", ".join(str(t) for t in banned)
        parts.append(f"You must NEVER discuss the following topics: {topics}.")

    required_disclaimers = guardrails.get("required_disclaimers") or []
    if required_disclaimers:
        for d in required_disclaimers:
            parts.append(f"You MUST include this disclaimer: \"{d}\"")

    pii_rules = guardrails.get("pii_redaction") or {}
    if pii_rules:
        masks = []
        if pii_rules.get("mask_account_numbers"):
            masks.append("account numbers")
        if pii_rules.get("mask_pan"):
            masks.append("PAN/Aadhaar")
        if pii_rules.get("mask_phone"):
            masks.append("phone numbers")
        if masks:
            parts.append(
                f"You must NEVER reveal {', '.join(masks)} in plain text. "
                "Always mask sensitive identifiers (e.g. XXXX-XXXX-1234)."
            )

    profanity = guardrails.get("profanity_filter")
    if profanity:
        parts.append("Do not use profanity, slurs, or aggressive language.")

    max_tokens = guardrails.get("max_output_tokens")
    if max_tokens:
        parts.append(f"Keep your response concise — under {max_tokens} tokens.")

    if not parts:
        return ""

    return "### Safety & Compliance Rules\n" + "\n".join(f"- {p}" for p in parts)