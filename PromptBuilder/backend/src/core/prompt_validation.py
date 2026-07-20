# src/core/prompt_validation.py
# =============================================================================
# PB-006: Input Validation Service
# =============================================================================
#
# Pure Python module — no DB, no async, no exceptions raised inside.
# Validates runtime_params (caller-supplied values) against the prompt's
# declared input schema (the rows from prompt_builder.prompt_inputs).
#
# Design contract per spec:
#   - Returns a LIST of human-readable error strings.
#   - Empty list = valid.
#   - Function NEVER raises — orchestrator decides what to do with errors.
#
# Public API:
#   validate_runtime_params(inputs, runtime_params) -> list[str]
# =============================================================================

import json
import logging
import re
from datetime import datetime, date
from typing import Any, Dict, List

logger = logging.getLogger(__name__)


# ─── Supported types (mirror DB CHECK constraint on prompt_inputs.type) ─────
SUPPORTED_TYPES = {"string", "number", "boolean", "date", "datetime", "json", "array"}


# =============================================================================
# Public function
# =============================================================================

def validate_runtime_params(
    inputs: List[Dict[str, Any]],
    runtime_params: Dict[str, Any],
) -> List[str]:
    """
    Validate caller-supplied runtime_params against the prompt's declared
    input schema (rows from prompt_builder.prompt_inputs).

    Args:
        inputs: list of dicts shaped like
                {
                  "name": "loan_number",
                  "type": "string",
                  "required": True,
                  "default_value": None,
                  "validation_json": { "pattern": "^LN-\\d+$", "enum": [...] }
                }
        runtime_params: caller-supplied dict, e.g. {"loan_number": "LN-12345"}

    Returns:
        List of human-readable error strings.
        Empty list means validation passed.

    NEVER raises — even on malformed `inputs` rows.
    """
    errors: List[str] = []

    # Defensive defaults
    inputs = inputs or []
    runtime_params = runtime_params or {}

    # Defensive: caller might pass non-dict for runtime_params somehow
    if not isinstance(runtime_params, dict):
        return ["runtime_params must be an object (dict)"]

    for inp in inputs:
        # Defensive: skip malformed input rows but record the issue
        if not isinstance(inp, dict):
            errors.append(f"Malformed input definition: expected dict, got {type(inp).__name__}")
            continue

        name = inp.get("name")
        if not name or not isinstance(name, str):
            errors.append("An input definition is missing a valid 'name' field")
            continue

        declared_type = (inp.get("type") or "string").lower().strip()
        is_required   = bool(inp.get("required", True))
        default_value = inp.get("default_value")
        validation    = inp.get("validation_json") or {}
        if not isinstance(validation, dict):
            validation = {}

        # ─── 1. Required field present? ──────────────────────────────────
        present = name in runtime_params

        # If absent and a default is declared, treat as effectively present
        # but still validate the default value's type/format below
        if not present:
            if is_required and default_value in (None, ""):
                errors.append(f"Required input '{name}' is missing")
                continue
            # Use default for downstream type checks (if any default given)
            if default_value in (None, ""):
                # Optional, no default → nothing to validate
                continue
            value = default_value
        else:
            value = runtime_params[name]

        # ─── 2. Type check ───────────────────────────────────────────────
        type_error = _check_type(value, declared_type, name)
        if type_error:
            errors.append(type_error)
            continue   # don't run further checks if type is wrong

        # ─── 3. Pattern (regex) check, only meaningful for strings ──────
        pattern = validation.get("pattern")
        if pattern and isinstance(value, str):
            try:
                if not re.match(pattern, value):
                    errors.append(
                        f"Input '{name}' does not match required pattern: {pattern}"
                    )
            except re.error as exc:
                errors.append(
                    f"Invalid regex pattern for input '{name}': {pattern} ({exc})"
                )

        # ─── 4. Enum (allowed values) check ─────────────────────────────
        enum = validation.get("enum")
        if enum is not None:
            if not isinstance(enum, list):
                errors.append(f"validation.enum for '{name}' must be a list")
            elif value not in enum:
                # Render enum compactly for the error message
                enum_preview = ", ".join(str(e) for e in enum[:10])
                if len(enum) > 10:
                    enum_preview += ", ..."
                errors.append(
                    f"Input '{name}' must be one of: [{enum_preview}]"
                )

        # ─── 5. Numeric bounds (min / max) ──────────────────────────────
        if declared_type == "number":
            min_val = validation.get("min")
            max_val = validation.get("max")
            if isinstance(min_val, (int, float)) and value < min_val:
                errors.append(f"Input '{name}' must be >= {min_val}")
            if isinstance(max_val, (int, float)) and value > max_val:
                errors.append(f"Input '{name}' must be <= {max_val}")

        # ─── 6. String length bounds ────────────────────────────────────
        if declared_type == "string" and isinstance(value, str):
            min_len = validation.get("min_length")
            max_len = validation.get("max_length")
            if isinstance(min_len, int) and len(value) < min_len:
                errors.append(
                    f"Input '{name}' must be at least {min_len} characters long"
                )
            if isinstance(max_len, int) and len(value) > max_len:
                errors.append(
                    f"Input '{name}' must be at most {max_len} characters long"
                )

    # ─── 7. Warn about unknown extra params (informational, not an error) ─
    # We DO NOT add these to errors — extra params might be intentional
    # (e.g. for context bindings). The orchestrator decides what to do.
    declared_names = {inp.get("name") for inp in inputs if isinstance(inp, dict)}
    extra = [k for k in runtime_params.keys() if k not in declared_names]
    if extra:
        logger.debug(f"Extra runtime_params not in input schema: {extra}")

    return errors


# =============================================================================
# Internal helpers
# =============================================================================

def _check_type(value: Any, declared_type: str, name: str) -> str:
    """
    Returns error string if value doesn't match declared_type, else "".
    Never raises.
    """
    if declared_type not in SUPPORTED_TYPES:
        return f"Input '{name}' has unsupported type '{declared_type}'"

    # Allow JSON-string forms for json/array since callers often pass
    # them stringified (Postman, query params, etc.)
    if declared_type == "string":
        if not isinstance(value, str):
            return f"Input '{name}' must be a string, got {_type_name(value)}"

    elif declared_type == "number":
        # bool is technically int in Python — exclude it explicitly
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            return f"Input '{name}' must be a number, got {_type_name(value)}"

    elif declared_type == "boolean":
        if not isinstance(value, bool):
            return f"Input '{name}' must be a boolean (true/false), got {_type_name(value)}"

    elif declared_type == "date":
        if not _is_valid_date(value):
            return (
                f"Input '{name}' must be a valid ISO date (YYYY-MM-DD), "
                f"got {value!r}"
            )

    elif declared_type == "datetime":
        if not _is_valid_datetime(value):
            return (
                f"Input '{name}' must be a valid ISO datetime "
                f"(e.g. 2026-05-06T10:00:00Z), got {value!r}"
            )

    elif declared_type == "json":
        # Accept dicts directly, or JSON-encoded strings
        if isinstance(value, dict):
            pass
        elif isinstance(value, str):
            try:
                parsed = json.loads(value)
                if not isinstance(parsed, (dict, list)):
                    return f"Input '{name}' must be a JSON object or array"
            except json.JSONDecodeError as exc:
                return f"Input '{name}' is not valid JSON: {exc.msg}"
        else:
            return f"Input '{name}' must be a JSON object, got {_type_name(value)}"

    elif declared_type == "array":
        if isinstance(value, list):
            pass
        elif isinstance(value, str):
            try:
                parsed = json.loads(value)
                if not isinstance(parsed, list):
                    return f"Input '{name}' must be a JSON array"
            except json.JSONDecodeError as exc:
                return f"Input '{name}' is not a valid JSON array: {exc.msg}"
        else:
            return f"Input '{name}' must be an array, got {_type_name(value)}"

    return ""


def _is_valid_date(value: Any) -> bool:
    """True if value is a date object or a YYYY-MM-DD string."""
    if isinstance(value, date) and not isinstance(value, datetime):
        return True
    if isinstance(value, str):
        try:
            datetime.strptime(value, "%Y-%m-%d")
            return True
        except ValueError:
            return False
    return False


def _is_valid_datetime(value: Any) -> bool:
    """True if value is a datetime object or an ISO 8601 string."""
    if isinstance(value, datetime):
        return True
    if isinstance(value, str):
        try:
            # Accept standard ISO 8601 with optional Z suffix
            v = value.replace("Z", "+00:00") if value.endswith("Z") else value
            datetime.fromisoformat(v)
            return True
        except (ValueError, AttributeError):
            return False
    return False


def _type_name(value: Any) -> str:
    """Friendly type name for error messages."""
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, (int, float)):
        return "number"
    if isinstance(value, str):
        return "string"
    if isinstance(value, dict):
        return "object"
    if isinstance(value, list):
        return "array"
    return type(value).__name__