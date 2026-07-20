
import json
import logging
import os
import time
from typing import Any, Dict, List, Optional, Tuple

import asyncpg
from sqlalchemy import text

logger = logging.getLogger(__name__)

# Default datasource (the kasetti_bank docker container).
# Used when a datasource binding has no explicit datasource_id, or when the
# registered URL can't be looked up.
_DEFAULT_DATASOURCE_URL = os.getenv(
    "KASETTI_DS_URL",
    "postgresql://eivsdemo:eivsdemo@kasetti-datasource-postgres:5432/kasetti_bank",
)


# =============================================================================
# Public entry point
# =============================================================================

async def resolve_context(
    conn,                                  # SQLAlchemy AsyncConnection (the engine connection)
    bindings: List[Dict[str, Any]],
    runtime_params: Optional[Dict[str, Any]] = None,
) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """
    Resolve every context binding into a value dict.

    Args:
        conn:           SQLAlchemy AsyncConnection (so we can look up datasource
                        connection details from template_builder.datasources).
        bindings:       list of dicts shaped like prompt_builder.prompt_context_bindings rows.
        runtime_params: caller-supplied dict.

    Returns:
        (resolved_dict, traces)
    """
    bindings = bindings or []
    runtime_params = runtime_params or {}

    # ── Normalize runtime_params: trim leading/trailing whitespace on any
    #    string values. Protects datasource filter matching from accidental
    #    spaces typed in the UI (e.g. "LN99999 " vs "LN99999"). ──────────────
    runtime_params = {
        k: (v.strip() if isinstance(v, str) else v)
        for k, v in runtime_params.items()
    }

    resolved: Dict[str, Any] = {}
    traces: List[Dict[str, Any]] = []

    for binding in bindings:
        b_name        = binding.get("name") or "unnamed"
        b_source      = (binding.get("source_type") or "runtime").lower().strip()
        b_meta        = binding.get("metadata_json") or {}
        b_filter      = binding.get("filter_json") or {}
        b_field_list  = binding.get("field_list_json") or []
        b_max_records = binding.get("max_records") or 1
        b_ds_id       = binding.get("datasource_id")
        b_entity      = binding.get("semantic_entity")

        t0 = time.monotonic()
        value: Any = None
        status = "success"
        error: Optional[str] = None
        summary = ""

        try:
            # ── runtime ──────────────────────────────────────────────────
            if b_source == "runtime":
                value, summary = _resolve_runtime(
                    b_name, b_meta, b_filter, runtime_params,
                )

            # ── static ───────────────────────────────────────────────────
            elif b_source == "static":
                value, summary = _resolve_static(b_name, b_meta)

            # ── datasource (the big one) ─────────────────────────────────
            elif b_source == "datasource":
                value, summary = await _resolve_datasource(
                    conn=conn,
                    binding_name=b_name,
                    datasource_id=b_ds_id,
                    entity=b_entity,
                    filter_json=b_filter,
                    field_list=b_field_list,
                    max_records=b_max_records,
                    metadata=b_meta,
                    runtime_params=runtime_params,
                )

            # ── deferred sources — placeholders for future tickets ───────
            elif b_source in ("semantic_model", "document_template", "api"):
                value = {"status": "not_implemented", "source_type": b_source}
                summary = f"{b_source} resolution not implemented yet (PB-008 deferred)"
                status = "deferred"

            else:
                value = None
                summary = f"Unknown source_type '{b_source}'"
                status = "error"
                error = summary

        except Exception as exc:
            logger.exception(
                f"Context binding '{b_name}' (source_type={b_source}) failed: {exc}"
            )
            value = None
            summary = f"Failed to resolve binding"
            status = "error"
            error = str(exc)

        resolved[b_name] = value
        traces.append({
            "binding":     b_name,
            "source_type": b_source,
            "status":      status,
            "latency_ms":  int((time.monotonic() - t0) * 1000),
            "error":       error,
            "summary":     summary,
        })

    return resolved, traces


# =============================================================================
# runtime + static resolvers (simple, sync)
# =============================================================================

def _resolve_runtime(
    binding_name: str,
    metadata: Dict[str, Any],
    filter_json: Dict[str, Any],
    runtime_params: Dict[str, Any],
) -> Tuple[Any, str]:
    """
    Pick a value out of runtime_params.

    Resolution order for the lookup KEY:
      1. metadata_json.value_key  (explicit override)
      2. filter_json.key          (alternate spelling some UIs use)
      3. binding name itself
    """
    key = metadata.get("value_key") or filter_json.get("key") or binding_name

    if key in runtime_params:
        return runtime_params[key], f"resolved from runtime_params['{key}']"

    # Fallback: was a default declared inside metadata?
    if "default" in metadata:
        return metadata["default"], f"runtime key '{key}' missing — used metadata.default"

    return None, f"runtime key '{key}' not present in runtime_params"


def _resolve_static(
    binding_name: str,
    metadata: Dict[str, Any],
) -> Tuple[Any, str]:
    """Return the literal `metadata_json.value`."""
    if "value" in metadata:
        return metadata["value"], "resolved from metadata.value"
    return None, "static binding has no metadata.value declared"


# =============================================================================
# datasource resolver — connects to kasetti_bank (or any registered DS)
# =============================================================================

async def _resolve_datasource(
    conn,
    binding_name: str,
    datasource_id: Optional[int],
    entity: Optional[str],          # table name (e.g. "loans", "customers")
    filter_json: Dict[str, Any],    # WHERE clause filters
    field_list: List[Any],          # which fields to SELECT (empty = all)
    max_records: int,
    metadata: Dict[str, Any],
    runtime_params: Dict[str, Any],
) -> Tuple[Any, str]:
    """
    Execute a SQL query against the registered datasource and return the rows.

    The binding tells us:
      - which datasource (datasource_id from template_builder.datasources)
      - which entity/table (e.g. "loans")
      - which fields to fetch (field_list_json)
      - how to filter ({"loan_id": "{{loan_number}}"})
      - max_records (1 for single record, >1 for list)

    Returns:
      - dict (single record) when max_records == 1
      - list of dicts (multiple records) when max_records > 1
    """
    if not entity:
        return None, "datasource binding requires 'semantic_entity' (table name)"

    # ─── 1. Look up datasource connection URL ────────────────────────────
    ds_url = await _get_datasource_url(conn, datasource_id)
    if not ds_url:
        return None, f"no active datasource found for datasource_id={datasource_id}"

    # ─── 2. Build the SQL query ──────────────────────────────────────────
    select_clause = _build_select_clause(field_list)
    where_clause, where_params = _build_where_clause(filter_json, runtime_params)
    sql = f"SELECT {select_clause} FROM {_safe_identifier(entity)}"
    if where_clause:
        sql += f" WHERE {where_clause}"
    sql += f" LIMIT {int(max_records) if max_records > 0 else 1}"

    logger.warning(
        f"[CONTEXT DEBUG] binding={binding_name!r} entity={entity!r} "
        f"filter_json={filter_json!r} runtime_params={runtime_params!r} "
        f"sql={sql!r} where_params={where_params!r} ds_url={ds_url!r}"
    )

    # ─── 3. Connect and execute ──────────────────────────────────────────
    try:
        external_conn = await asyncpg.connect(ds_url, timeout=10)
    except Exception as exc:
        logger.warning(f"[CONTEXT DEBUG] connect failed: {exc!r}")
        return None, f"could not connect to datasource: {exc}"

    try:
        rows = await external_conn.fetch(sql, *where_params)
        logger.warning(f"[CONTEXT DEBUG] query returned {len(rows)} row(s)")
    except Exception as exc:
        logger.warning(f"[CONTEXT DEBUG] query failed: {exc!r}")
        await external_conn.close()
        return None, f"query failed: {exc}"
    finally:
        try:
            await external_conn.close()
        except Exception:
            pass

    # ─── 4. Convert asyncpg.Record → plain dicts ─────────────────────────
    records = [dict(r) for r in rows]
    # Convert non-JSON-serializable types (datetime, Decimal, UUID) to strings
    records = [_jsonify(r) for r in records]

    if max_records == 1:
        if not records:
            return None, f"no records found in {entity} for filter {filter_json}"
        return records[0], f"resolved 1 record from {entity}"
    else:
        return records, f"resolved {len(records)} records from {entity}"


async def _get_datasource_url(conn, datasource_id: Optional[int]) -> Optional[str]:
    """
    Look up the connection URL for a given datasource_id.

    Tries the registered table first (template_builder.datasources). Falls back
    to the default kasetti_bank URL if datasource_id is missing or unregistered.
    """
    if datasource_id is None:
        return _DEFAULT_DATASOURCE_URL

    try:
        result = await conn.execute(text("""
            SELECT connection_key
            FROM template_builder.datasources
            WHERE datasource_id = :did AND is_active = true
            LIMIT 1
        """), {"did": datasource_id})
        row = result.fetchone()
        if row and row[0]:
            return row[0]
    except Exception as exc:
        logger.warning(f"Could not look up datasource_id={datasource_id}: {exc}")

    # Try the eivs schema (some installations use this)
    try:
        result = await conn.execute(text("""
            SELECT connection_key
            FROM eivs.datasources
            WHERE datasource_id = :did AND is_active = true
            LIMIT 1
        """), {"did": datasource_id})
        row = result.fetchone()
        if row and row[0]:
            return row[0]
    except Exception:
        pass

    # Final fallback: env var
    return _DEFAULT_DATASOURCE_URL


# =============================================================================
# SQL building helpers
# =============================================================================

# Strict identifier whitelist — only allow [a-zA-Z0-9_].
# This prevents SQL injection via tampered binding rows.
import re as _re
_IDENTIFIER_RE = _re.compile(r"^[A-Za-z_][A-Za-z0-9_\.]*$")


def _safe_identifier(name: str) -> str:
    """Validate that a string is safe to use as a SQL identifier (table/column)."""
    if not name or not _IDENTIFIER_RE.match(name):
        raise ValueError(f"Invalid SQL identifier: {name!r}")
    return name


def _build_select_clause(field_list: List[Any]) -> str:
    """
    Build a SELECT field list. Empty list = *.
    Each entry must pass _safe_identifier (so we never let untrusted column
    names through to the database).
    """
    if not field_list:
        return "*"
    clean = []
    for f in field_list:
        if not isinstance(f, str):
            continue
        try:
            clean.append(_safe_identifier(f))
        except ValueError:
            logger.warning(f"Skipping invalid field name in field_list: {f!r}")
    return ", ".join(clean) if clean else "*"


def _build_where_clause(
    filter_json: Dict[str, Any],
    runtime_params: Dict[str, Any],
) -> Tuple[str, List[Any]]:
    """
    Build a parameterized WHERE clause from filter_json.

    filter_json values can include {{var}} tokens that we substitute from
    runtime_params before using them as a parameter. Example:

        filter_json = {"loan_id": "{{loan_number}}"}
        runtime_params = {"loan_number": "LN-12345"}
        → WHERE loan_id = $1     with params=["LN-12345"]
    """
    if not filter_json:
        return "", []

    parts: List[str] = []
    params: List[Any] = []
    idx = 1

    for key, raw_value in filter_json.items():
        try:
            col = _safe_identifier(key)
        except ValueError:
            logger.warning(f"Skipping invalid filter key: {key!r}")
            continue

        # Substitute any {{var}} tokens in the value
        resolved_value = _interp(raw_value, runtime_params)

        # Keep simple equality semantics (most common case)
        # Could be extended later for $in/$gt/$lt/$like operators.
        parts.append(f"{col} = ${idx}")
        params.append(resolved_value)
        idx += 1

    return " AND ".join(parts), params


_VAR_RE = _re.compile(r"\{\{\s*([\w.]+)\s*\}\}")


def _interp(value: Any, runtime_params: Dict[str, Any]) -> Any:
    """
    If value is a string with {{var}} tokens, substitute them from runtime_params.
    Preserves the original type when the entire value is a single {{var}} token
    so integers stay integers — fixes PostgreSQL type mismatch on integer columns.
    """
    if not isinstance(value, str):
        return value

    stripped = value.strip()

    single_match = _re.fullmatch(r'\{\{\s*([\w.]+)\s*\}\}', stripped)
    if single_match:
        key = single_match.group(1)
        if key in runtime_params:
            raw = runtime_params[key]
            if isinstance(raw, str):
                try:
                    return int(raw)
                except ValueError:
                    try:
                        return float(raw)
                    except ValueError:
                        return raw
            return raw
        return value

    def _sub(match: '_re.Match') -> str:
        key = match.group(1)
        if key in runtime_params:
            return str(runtime_params[key])
        return match.group(0)

    return _VAR_RE.sub(_sub, value)


def _jsonify(record: Dict[str, Any]) -> Dict[str, Any]:
    """
    Convert non-JSON-serializable values (datetime, Decimal, UUID, etc.)
    into safe JSON forms (strings, floats).
    """
    out: Dict[str, Any] = {}
    for k, v in record.items():
        try:
            json.dumps(v)
            out[k] = v
        except (TypeError, ValueError):
            out[k] = str(v)
    return out