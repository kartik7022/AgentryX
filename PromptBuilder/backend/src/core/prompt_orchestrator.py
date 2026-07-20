# src/core/prompt_orchestrator.py
# Safe mode and topic restrictions are now HARD enforced via post-processing.
# After every LLM response, the orchestrator:
#   1. If safe_mode=true  → scans output for harmful keywords and rejects if found
#   2. If topic_restrictions exist → checks output contains no restricted topic violations

import json
import logging
import re
import time
import uuid
from typing import Any, Dict, List, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from src.core.prompt_compiler import compile_prompt
from src.core.prompt_validation import validate_runtime_params
from src.core.prompt_context import resolve_context

logger = logging.getLogger(__name__)

# ── Hard safe mode keyword patterns ──────────────────────────────────────────
# These are checked against the raw LLM output when safe_mode = true.
# If any pattern matches, the response is REJECTED before returning to caller.

SAFE_MODE_PATTERNS = [
    # Violence / self-harm
    r'\b(kill yourself|kys|go die|commit suicide|self.harm|cut yourself)\b',
    # Hate speech
    r'\b(nigger|faggot|chink|spic|kike|wetback|tranny)\b',
    # Explicit sexual content
    r'\b(pornograph|explicit sex|nude photo|naked image|sexual content)\b',
    # Dangerous instructions
    r'\b(how to make a bomb|build a weapon|synthesize drugs|hack into)\b',
    # Threats
    r'\b(i will kill|i am going to kill|death threat|threaten)\b',
]

SAFE_MODE_RE = re.compile('|'.join(SAFE_MODE_PATTERNS), re.IGNORECASE)


def _check_safe_mode(raw_output: str) -> Optional[str]:
    """
    Hard safe mode check. Returns error message if harmful content found,
    None if output is clean.
    """
    if not raw_output:
        return None
    match = SAFE_MODE_RE.search(raw_output)
    if match:
        return (
            f"Safe mode violation: response contained harmful content "
            f"(matched pattern near: '{match.group(0)}'). Response blocked."
        )
    return None


def _check_topic_restrictions(raw_output: str, topic_restrictions: List[str]) -> Optional[str]:
    """
    Hard topic restriction check. For each restriction, the orchestrator
    asks the LLM inline whether the output violates it — but since we can't
    do a second LLM call easily here, we do keyword matching based on the
    restriction text itself.

    Strategy: parse each restriction into keywords and check if the output
    contains those keywords in a suspicious context.

    Returns error message if violation found, None if clean.
    """
    if not raw_output or not topic_restrictions:
        return None

    output_lower = raw_output.lower()

    # Build keyword sets from each restriction
    # e.g. "Do not mention competitor bank names" → ["competitor", "bank"]
    STOP_WORDS = {
        'do', 'not', 'never', 'avoid', 'mention', 'provide', 'share',
        'generate', 'include', 'use', 'discuss', 'reveal', 'expose',
        'a', 'an', 'the', 'of', 'in', 'or', 'and', 'for', 'to', 'with',
        'any', 'all', 'some', 'no', 'is', 'are', 'be', 'been', 'that',
        'this', 'these', 'those', 'it', 'its', 'on', 'at', 'by', 'from'
    }

    # Known competitor bank names for banking context
    COMPETITOR_BANKS = [
        'hdfc', 'icici', 'axis bank', 'kotak', 'yes bank', 'indusind',
        'punjab national', 'pnb', 'bank of baroda', 'union bank',
        'canara bank', 'idfc', 'rbl bank', 'federal bank'
    ]

    for restriction in topic_restrictions:
        restriction_lower = restriction.lower()

        # Special case: competitor bank names
        if 'competitor' in restriction_lower and 'bank' in restriction_lower:
            for bank in COMPETITOR_BANKS:
                if bank in output_lower:
                    return (
                        f"Topic restriction violation: response mentioned competitor bank "
                        f"'{bank}' which is restricted. Response blocked."
                    )

        # Special case: personal data / PAN / Aadhaar
        if 'personal data' in restriction_lower or 'pan' in restriction_lower or 'aadhaar' in restriction_lower:
            pan_pattern = re.compile(r'\b[A-Z]{5}[0-9]{4}[A-Z]\b')
            aadhaar_pattern = re.compile(r'\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b')
            if pan_pattern.search(raw_output):
                return "Topic restriction violation: response contained a PAN number. Response blocked."
            if aadhaar_pattern.search(raw_output):
                return "Topic restriction violation: response contained an Aadhaar number. Response blocked."

        # Special case: legal advice
        if 'legal advice' in restriction_lower:
            legal_phrases = [
                'consult a lawyer', 'legal remedy', 'file a case',
                'sue the bank', 'legal action', 'court order', 'legal opinion'
            ]
            for phrase in legal_phrases:
                if phrase in output_lower:
                    return (
                        f"Topic restriction violation: response contained legal advice "
                        f"('{phrase}') which is restricted. Response blocked."
                    )

        # Special case: open loans
        if 'open' in restriction_lower and ('loan' in restriction_lower or 'noc' in restriction_lower):
            if 'noc' in output_lower and 'open' in output_lower:
                # Check if NOC was generated for an open loan
                if re.search(r'(eligible.*yes|noc.*issued|certificate.*issued)', output_lower):
                    if re.search(r'(loan.*open|outstanding.*[1-9])', output_lower):
                        return (
                            "Topic restriction violation: NOC appears to have been generated "
                            "for an open loan. Response blocked."
                        )

    return None


# =============================================================================
# Public entry point
# =============================================================================

async def run_prompt(
    engine: AsyncEngine,
    request: Dict[str, Any],
    actor: str = "system",
) -> Dict[str, Any]:

    prompt_id        = request.get("prompt_id")
    version_spec     = (request.get("version") or "published").lower().strip()
    locale           = request.get("locale") or "en"
    runtime_params   = request.get("runtime_params") or {}
    response_format  = (request.get("response_format") or "json").lower().strip()
    allow_draft      = bool(request.get("allow_draft", False))

    if not prompt_id:
        raise ValueError("prompt_id is required")

    traces: List[Dict[str, Any]] = []
    run_id = str(uuid.uuid4())
    started_at = time.monotonic()

    # STEP 1+2+3: Load prompt, version, structure
    step_t0 = time.monotonic()
    try:
        async with engine.connect() as conn:
            prompt_row = await _load_prompt(conn, prompt_id)
            if prompt_row is None:
                raise _RunError(404, f"Prompt {prompt_id} not found")
            version_row = await _load_version(conn, prompt_id, version_spec, allow_draft)
            inputs   = await _load_inputs(conn, prompt_id)
            blocks   = await _load_blocks(conn, prompt_id)
            bindings = await _load_context_bindings(conn, prompt_id)
    except _RunError:
        raise
    except Exception as exc:
        logger.exception(f"Failed loading prompt structure: {exc}")
        raise _RunError(500, f"Failed to load prompt structure: {exc}")

    traces.append({
        "step_name": "load_prompt_structure", "step_type": "db_load",
        "input":  {"prompt_id": prompt_id, "version_spec": version_spec},
        "output": {
            "prompt_name":    prompt_row.get("name"),
            "version_id":     version_row["version_id"] if version_row else None,
            "version_status": version_row["status"] if version_row else None,
            "block_count":    len(blocks),
            "input_count":    len(inputs),
            "binding_count":  len(bindings),
        },
        "latency_ms": int((time.monotonic() - step_t0) * 1000),
        "status": "success", "error": None,
    })

    output_schema = (version_row or {}).get("output_schema_json") or {}
    guardrails    = (version_row or {}).get("guardrails_json") or {}
    version_id    = (version_row or {}).get("version_id")

    # Extract guardrail settings
    safe_mode         = bool(guardrails.get("safe_mode", False))
    topic_restrictions = guardrails.get("topic_restrictions") or []

    # STEP 4: Validate runtime_params
    step_t0 = time.monotonic()
    validation_errors = validate_runtime_params(inputs, runtime_params)
    traces.append({
        "step_name": "input_validation", "step_type": "validation",
        "input":  {"runtime_params": runtime_params, "input_count": len(inputs)},
        "output": {"errors": validation_errors},
        "latency_ms": int((time.monotonic() - step_t0) * 1000),
        "status": "error" if validation_errors else "success",
        "error":  "; ".join(validation_errors) if validation_errors else None,
    })

    if validation_errors:
        await _persist_failed_run(
            engine, run_id, prompt_id, version_id, runtime_params,
            "; ".join(validation_errors), traces, actor,
        )
        raise _RunError(422, f"Validation failed: {'; '.join(validation_errors)}")

    # STEP 5: Resolve context bindings
    step_t0 = time.monotonic()
    binding_notes: List[str] = []
    resolved_context: Dict[str, Any] = {}

    if bindings:
        try:
            async with engine.connect() as ctx_conn:
                resolved_context, binding_traces = await resolve_context(
                    conn=ctx_conn, bindings=bindings, runtime_params=runtime_params,
                )
            for bt in binding_traces:
                if bt["status"] != "success":
                    binding_notes.append(
                        f"{bt['source_type']} binding '{bt['binding']}': {bt['summary']}"
                    )
        except Exception as exc:
            logger.exception(f"Context resolution failed: {exc}")
            binding_notes.append(f"context resolution error: {exc}")
            binding_traces = []
    else:
        binding_traces = []

    traces.append({
        "step_name": "context_resolution", "step_type": "context",
        "input":  {"binding_count": len(bindings)},
        "output": {"resolved_keys": list(resolved_context.keys()), "binding_traces": binding_traces, "notes": binding_notes},
        "latency_ms": int((time.monotonic() - step_t0) * 1000),
        "status": "success", "error": None,
    })

    # STEP 6: Compile the final prompt
    step_t0 = time.monotonic()
    try:
        compiled = compile_prompt(
            blocks=blocks, runtime_params=runtime_params,
            resolved_context=resolved_context, output_schema=output_schema,
            guardrails=guardrails,
        )
    except Exception as exc:
        logger.exception(f"Compile failed: {exc}")
        await _persist_failed_run(
            engine, run_id, prompt_id, version_id, runtime_params,
            f"Compile error: {exc}", traces, actor,
        )
        raise _RunError(500, f"Compile error: {exc}")

    system_msg   = compiled["system"]
    user_msg     = compiled["user"]
    compile_meta = compiled["metadata"]

    traces.append({
        "step_name": "prompt_compilation", "step_type": "compile",
        "input":  {"block_count": len(blocks)},
        "output": {"system_chars": len(system_msg), "user_chars": len(user_msg), "metadata": compile_meta},
        "latency_ms": int((time.monotonic() - step_t0) * 1000),
        "status": "success", "error": None,
    })

    # STEP 7: Insert prompt_runs row with status='running'
    try:
        async with engine.begin() as conn:
            await conn.execute(text("""
                INSERT INTO prompt_builder.prompt_runs (
                    run_id, prompt_id, version_id, status,
                    runtime_params_json, resolved_context_json,
                    created_by, created_at
                ) VALUES (
                    :rid, :pid, :vid, 'running',
                    :params, :ctx,
                    :actor, NOW()
                )
            """), {
                "rid": run_id, "pid": prompt_id, "vid": version_id,
                "params": json.dumps(runtime_params, default=str),
                "ctx":    json.dumps(resolved_context, default=str),
                "actor":  actor,
            })
    except Exception as exc:
        logger.exception(f"Failed to insert running run: {exc}")

    # STEP 8: Call the LLM
    step_t0 = time.monotonic()
    raw_output: Optional[str] = None
    llm_error:  Optional[str] = None

    try:
        from src.api.ai import call_llm
        raw_output = await call_llm(prompt=user_msg, system_hint=system_msg)
    except Exception as exc:
        logger.exception(f"LLM call failed: {exc}")
        llm_error = str(exc)

    llm_latency_ms = int((time.monotonic() - step_t0) * 1000)
    traces.append({
        "step_name": "model_call", "step_type": "llm",
        "input":  {"system_chars": len(system_msg), "user_chars": len(user_msg)},
        "output": {"raw_output_chars": len(raw_output) if raw_output else 0},
        "latency_ms": llm_latency_ms,
        "status": "error" if llm_error else "success",
        "error":  llm_error,
    })

    if llm_error:
        await _persist_run_outcome(
            engine, run_id, "error", None, raw_output, llm_error,
            llm_latency_ms, traces, actor,
        )
        raise _RunError(502, f"LLM error: {llm_error}")

    # ─────────────────────────────────────────────────────────────────────────
    # STEP 8b: HARD SAFE MODE CHECK (post-processing)
    # Runs BEFORE returning output to caller — blocks harmful responses
    # ─────────────────────────────────────────────────────────────────────────
    if safe_mode and raw_output:
        safe_mode_error = _check_safe_mode(raw_output)
        if safe_mode_error:
            logger.warning(f"Safe mode blocked response for run {run_id}: {safe_mode_error}")
            traces.append({
                "step_name": "safe_mode_check", "step_type": "guardrail",
                "input":  {"safe_mode": True, "output_chars": len(raw_output)},
                "output": {"blocked": True, "reason": safe_mode_error},
                "latency_ms": 0, "status": "error", "error": safe_mode_error,
            })
            await _persist_run_outcome(
                engine, run_id, "error", None, raw_output, safe_mode_error,
                llm_latency_ms, traces, actor,
            )
            raise _RunError(422, safe_mode_error)

        traces.append({
            "step_name": "safe_mode_check", "step_type": "guardrail",
            "input":  {"safe_mode": True}, "output": {"blocked": False},
            "latency_ms": 0, "status": "success", "error": None,
        })

    # ─────────────────────────────────────────────────────────────────────────
    # STEP 8c: HARD TOPIC RESTRICTION CHECK (post-processing)
    # Runs BEFORE returning output to caller — blocks restricted content
    # ─────────────────────────────────────────────────────────────────────────
    if topic_restrictions and raw_output:
        topic_error = _check_topic_restrictions(raw_output, topic_restrictions)
        if topic_error:
            logger.warning(f"Topic restriction blocked response for run {run_id}: {topic_error}")
            traces.append({
                "step_name": "topic_restriction_check", "step_type": "guardrail",
                "input":  {"restrictions": topic_restrictions, "output_chars": len(raw_output)},
                "output": {"blocked": True, "reason": topic_error},
                "latency_ms": 0, "status": "error", "error": topic_error,
            })
            await _persist_run_outcome(
                engine, run_id, "error", None, raw_output, topic_error,
                llm_latency_ms, traces, actor,
            )
            raise _RunError(422, topic_error)

        traces.append({
            "step_name": "topic_restriction_check", "step_type": "guardrail",
            "input":  {"restrictions_count": len(topic_restrictions)},
            "output": {"blocked": False},
            "latency_ms": 0, "status": "success", "error": None,
        })

    # STEP 9+10: Parse + validate output
    step_t0 = time.monotonic()
    parsed_output: Any = None
    parse_error: Optional[str] = None

    if response_format == "json":
        parsed_output, parse_error = _safe_parse_json(raw_output)
        if parse_error:
            traces.append({
                "step_name": "output_validation", "step_type": "validation",
                "input":  {"format": "json"},
                "output": {"raw_preview": (raw_output or "")[:300]},
                "latency_ms": int((time.monotonic() - step_t0) * 1000),
                "status": "error", "error": parse_error,
            })
            await _persist_run_outcome(
                engine, run_id, "error", None, raw_output, parse_error,
                llm_latency_ms, traces, actor,
            )
            return {
                "status": "error", "prompt_run_id": run_id,
                "output": None, "raw_output": raw_output,
                "metadata": {"parse_error": parse_error, "compile": compile_meta, "binding_notes": binding_notes},
                "error_message": parse_error,
            }

        schema_errors = _check_output_schema(parsed_output, output_schema)
        traces.append({
            "step_name": "output_validation", "step_type": "validation",
            "input":  {"format": "json", "schema_keys": list(output_schema.get("properties", {}).keys())},
            "output": {"schema_errors": schema_errors},
            "latency_ms": int((time.monotonic() - step_t0) * 1000),
            "status": "error" if schema_errors else "success",
            "error":  "; ".join(schema_errors) if schema_errors else None,
        })
    else:
        parsed_output = raw_output
        traces.append({
            "step_name": "output_validation", "step_type": "validation",
            "input":  {"format": "text"},
            "output": {"chars": len(raw_output or "")},
            "latency_ms": int((time.monotonic() - step_t0) * 1000),
            "status": "success", "error": None,
        })

    # STEP 11: Persist success
    total_latency_ms = int((time.monotonic() - started_at) * 1000)
    await _persist_run_outcome(
        engine, run_id, "success", parsed_output, raw_output, None,
        total_latency_ms, traces, actor,
    )

    return {
        "status":        "success",
        "prompt_run_id": run_id,
        "output":        parsed_output,
        "raw_output":    raw_output,
        "metadata": {
            "compile":        compile_meta,
            "latency_ms":     total_latency_ms,
            "llm_latency_ms": llm_latency_ms,
            "version_id":     version_id,
            "version_status": (version_row or {}).get("status"),
            "binding_notes":  binding_notes,
        },
        "error_message": None,
    }


# =============================================================================
# Internal helpers
# =============================================================================

class _RunError(Exception):
    def __init__(self, http_status: int, message: str):
        super().__init__(message)
        self.http_status = http_status
        self.message = message


async def _load_prompt(conn, prompt_id: str) -> Optional[Dict[str, Any]]:
    result = await conn.execute(text("""
        SELECT prompt_id, name, status, default_locale, supported_locales
        FROM prompt_builder.prompts WHERE prompt_id = :pid
    """), {"pid": prompt_id})
    row = result.fetchone()
    if row is None:
        return None
    return {"prompt_id": str(row[0]), "name": row[1], "status": row[2], "default_locale": row[3], "supported_locales": list(row[4]) if row[4] else ["en"]}


async def _load_version(conn, prompt_id: str, version_spec: str, allow_draft: bool) -> Optional[Dict[str, Any]]:
    if version_spec.isdigit():
        result = await conn.execute(text("""
            SELECT version_id, version_number, status, input_schema_json, output_schema_json, guardrails_json
            FROM prompt_builder.prompt_versions WHERE prompt_id = :pid AND version_number = :vnum LIMIT 1
        """), {"pid": prompt_id, "vnum": int(version_spec)})
    elif version_spec == "latest":
        result = await conn.execute(text("""
            SELECT version_id, version_number, status, input_schema_json, output_schema_json, guardrails_json
            FROM prompt_builder.prompt_versions WHERE prompt_id = :pid ORDER BY version_number DESC LIMIT 1
        """), {"pid": prompt_id})
    else:
        result = await conn.execute(text("""
            SELECT version_id, version_number, status, input_schema_json, output_schema_json, guardrails_json
            FROM prompt_builder.prompt_versions WHERE prompt_id = :pid AND status = 'published' ORDER BY version_number DESC LIMIT 1
        """), {"pid": prompt_id})

    row = result.fetchone()
    if row is None and allow_draft:
        result = await conn.execute(text("""
            SELECT version_id, version_number, status, input_schema_json, output_schema_json, guardrails_json
            FROM prompt_builder.prompt_versions WHERE prompt_id = :pid AND status = 'draft' ORDER BY version_number DESC LIMIT 1
        """), {"pid": prompt_id})
        row = result.fetchone()

    if row is None:
        return None
    return {"version_id": str(row[0]), "version_number": row[1], "status": row[2], "input_schema_json": row[3] or {}, "output_schema_json": row[4] or {}, "guardrails_json": row[5] or {}}


async def _load_inputs(conn, prompt_id: str) -> List[Dict[str, Any]]:
    result = await conn.execute(text("""
        SELECT name, type, required, default_value, validation_json
        FROM prompt_builder.prompt_inputs WHERE prompt_id = :pid ORDER BY name ASC
    """), {"pid": prompt_id})
    return [{"name": r[0], "type": r[1], "required": r[2], "default_value": r[3], "validation_json": r[4] or {}} for r in result.fetchall()]


async def _load_blocks(conn, prompt_id: str) -> List[Dict[str, Any]]:
    result = await conn.execute(text("""
        SELECT block_id, block_type, sequence_no, title, content, variables_json, is_required, metadata_json
        FROM prompt_builder.prompt_blocks WHERE prompt_id = :pid ORDER BY sequence_no ASC
    """), {"pid": prompt_id})
    return [{"block_id": str(r[0]), "block_type": r[1], "sequence_no": r[2], "title": r[3], "content": r[4], "variables_json": r[5] or {}, "is_required": r[6], "metadata_json": r[7] or {}} for r in result.fetchall()]


async def _load_context_bindings(conn, prompt_id: str) -> List[Dict[str, Any]]:
    result = await conn.execute(text("""
        SELECT binding_id, name, source_type, datasource_id, semantic_entity,
               field_list_json, filter_json, retrieval_policy_json, max_records, metadata_json
        FROM prompt_builder.prompt_context_bindings WHERE prompt_id = :pid ORDER BY name ASC
    """), {"pid": prompt_id})
    return [{"binding_id": str(r[0]), "name": r[1], "source_type": r[2], "datasource_id": r[3], "semantic_entity": r[4], "field_list_json": r[5] or [], "filter_json": r[6] or {}, "retrieval_policy_json": r[7] or {}, "max_records": r[8], "metadata_json": r[9] or {}} for r in result.fetchall()]


async def _persist_run_outcome(engine, run_id, final_status, output_json, raw_output, error_message, latency_ms, traces, actor):
    try:
        async with engine.begin() as conn:
            await conn.execute(text("""
                UPDATE prompt_builder.prompt_runs
                SET status = :status, output_json = :output, raw_output = :raw, latency_ms = :latency, error_message = :err
                WHERE run_id = :rid
            """), {"status": final_status, "output": json.dumps(output_json, default=str) if output_json is not None else None, "raw": raw_output, "latency": latency_ms, "err": error_message, "rid": run_id})
            for t in traces:
                await conn.execute(text("""
                    INSERT INTO prompt_builder.prompt_run_traces (
                        trace_id, run_id, step_name, step_type, input_json, output_json, latency_ms, status, error_message, created_at
                    ) VALUES (uuid_generate_v4(), :rid, :step, :stype, :inp, :out, :lat, :status, :err, NOW())
                """), {"rid": run_id, "step": t["step_name"], "stype": t["step_type"], "inp": json.dumps(t.get("input"), default=str), "out": json.dumps(t.get("output"), default=str), "lat": t.get("latency_ms") or 0, "status": t.get("status") or "success", "err": t.get("error")})
    except Exception as exc:
        logger.exception(f"Failed to persist run outcome for {run_id}: {exc}")


async def _persist_failed_run(engine, run_id, prompt_id, version_id, runtime_params, error_message, traces, actor):
    try:
        async with engine.begin() as conn:
            await conn.execute(text("""
                INSERT INTO prompt_builder.prompt_runs (
                    run_id, prompt_id, version_id, status, runtime_params_json, resolved_context_json, error_message, created_by, created_at
                ) VALUES (:rid, :pid, :vid, 'error', :params, '{}'::jsonb, :err, :actor, NOW())
                ON CONFLICT (run_id) DO UPDATE SET status = 'error', error_message = :err
            """), {"rid": run_id, "pid": prompt_id, "vid": version_id, "params": json.dumps(runtime_params, default=str), "err": error_message, "actor": actor})
            for t in traces:
                await conn.execute(text("""
                    INSERT INTO prompt_builder.prompt_run_traces (
                        trace_id, run_id, step_name, step_type, input_json, output_json, latency_ms, status, error_message, created_at
                    ) VALUES (uuid_generate_v4(), :rid, :step, :stype, :inp, :out, :lat, :status, :err, NOW())
                """), {"rid": run_id, "step": t["step_name"], "stype": t["step_type"], "inp": json.dumps(t.get("input"), default=str), "out": json.dumps(t.get("output"), default=str), "lat": t.get("latency_ms") or 0, "status": t.get("status") or "success", "err": t.get("error")})
    except Exception as exc:
        logger.exception(f"Failed to persist failed-run for {run_id}: {exc}")


_JSON_FENCE_RE = re.compile(r"```(?:json)?\s*(\{.*?\}|\[.*?\])\s*```", re.DOTALL)


def _safe_parse_json(raw: Optional[str]) -> tuple:
    if not raw:
        return None, "LLM returned empty response"
    text_value = raw.strip()
    try:
        return json.loads(text_value), None
    except json.JSONDecodeError:
        pass
    match = _JSON_FENCE_RE.search(text_value)
    if match:
        try:
            return json.loads(match.group(1)), None
        except json.JSONDecodeError:
            pass
    first_brace = text_value.find("{")
    last_brace  = text_value.rfind("}")
    if first_brace != -1 and last_brace > first_brace:
        try:
            return json.loads(text_value[first_brace:last_brace + 1]), None
        except json.JSONDecodeError:
            pass
    return None, "Could not parse LLM output as JSON"


def _check_output_schema(parsed: Any, schema: Dict[str, Any]) -> List[str]:
    if not schema:
        return []
    errors: List[str] = []
    declared_type = schema.get("type")
    required = schema.get("required") or []
    if declared_type == "object" and not isinstance(parsed, dict):
        errors.append(f"Expected output to be a JSON object, got {type(parsed).__name__}")
        return errors
    if isinstance(parsed, dict):
        for key in required:
            if key not in parsed:
                errors.append(f"Required output field '{key}' is missing")
    return errors