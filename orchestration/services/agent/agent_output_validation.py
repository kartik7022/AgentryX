# services/agent/agent_output_validation.py
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from jsonschema import validate, ValidationError

logger = logging.getLogger(__name__)


def validate_agent_output(
    output: Any,
    output_schema: Dict[str, Any],
) -> List[str]:
    """Validate final agent output against JSON Schema. Returns list of errors — empty = valid."""
    errors: List[str] = []
    try:
        validate(instance=output, schema=output_schema)
    except ValidationError as e:
        errors.append(e.message)
    except Exception as e:
        errors.append(f"Schema validation error: {e}")
    return errors


def run_agent_evaluations(
    output: Any,
    evaluation_suite: Optional[List[Dict[str, Any]]] = None,
    context: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Run evaluation suite against agent output.
    Supported types: field_present, field_equals, min_length, score_above.
    Returns: {score, passed, results}
    """
    if not evaluation_suite:
        return {"score": 1.0, "passed": True, "results": []}

    results = []
    passed_count = 0

    for eval_def in evaluation_suite:
        name      = eval_def.get("name", "unnamed")
        eval_type = eval_def.get("type", "field_present")
        field     = eval_def.get("field")
        threshold = float(eval_def.get("threshold", 0.0))
        expected  = eval_def.get("expected_value")
        min_len   = int(eval_def.get("min_length", 0))
        passed    = False
        reason    = ""

        try:
            output_dict = output if isinstance(output, dict) else {}

            if eval_type == "field_present":
                passed = field in output_dict and output_dict[field] is not None
                reason = f"Field '{field}' {'present' if passed else 'missing or null'}"
            elif eval_type == "field_equals":
                actual = output_dict.get(field)
                passed = actual == expected
                reason = f"Field '{field}' = {actual!r}, expected {expected!r}"
            elif eval_type == "min_length":
                actual_len = len(str(output_dict.get(field, "")))
                passed = actual_len >= min_len
                reason = f"Field '{field}' length={actual_len}, min={min_len}"
            elif eval_type == "score_above":
                score_val = float(output_dict.get(field, 0))
                passed = score_val >= threshold
                reason = f"Score {score_val:.2f} >= {threshold:.2f}: {passed}"
            else:
                reason = f"Unknown evaluation type: {eval_type}"
        except Exception as e:
            reason = f"Evaluation error: {e}"

        if passed:
            passed_count += 1
        results.append({"name": name, "type": eval_type, "passed": passed, "reason": reason})

    total      = len(evaluation_suite)
    score      = passed_count / total if total > 0 else 1.0
    pass_thr   = float(evaluation_suite[0].get("pass_threshold", 0.8)) if evaluation_suite else 0.8

    return {"score": round(score, 4), "passed": score >= pass_thr, "results": results}


def determine_final_status(
    schema_errors: List[str],
    eval_result: Dict[str, Any],
    pass_threshold: float = 0.8,
) -> str:
    """
    Returns 'success', 'output_invalid', or 'needs_human_review'.
    """
    if schema_errors:
        return "output_invalid"
    if not eval_result.get("passed", True):
        if eval_result.get("score", 1.0) < pass_threshold:
            return "needs_human_review"
    return "success"