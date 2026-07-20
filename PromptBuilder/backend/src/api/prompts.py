# src/api/prompts.py
# =============================================================================
# Prompt Builder — CRUD API
# =============================================================================
#
# Implements:
#   PB-002: Pydantic request/response schemas for prompts
#   PB-003: Prompt CRUD router (/v1/prompts)
#
# Endpoints:
#   POST   /v1/prompts                           Create draft prompt
#   GET    /v1/prompts                           List with filters
#   GET    /v1/prompts/{prompt_id}               Get one (with blocks/inputs/bindings)
#   PUT    /v1/prompts/{prompt_id}               Update metadata
#   DELETE /v1/prompts/{prompt_id}               Soft delete (status='archived')
#   POST   /v1/prompts/{prompt_id}/duplicate     Clone prompt + children
#
# Style follows existing api/documents.py and api/templates.py:
#   - APIRouter(prefix=..., tags=...)
#   - request.app.state.engine for AsyncEngine
#   - x-user-id header for actor
#   - audit events into template_builder.audit_events
#   - SQLAlchemy text() with named params
# =============================================================================

from fastapi import APIRouter, HTTPException, Request, status, Depends
from pydantic import BaseModel, Field
from typing import Dict, Any, Optional, List
import uuid
import json
import logging

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine
from src.core.prompt_orchestrator import run_prompt, _RunError


router = APIRouter(prefix="/prompts", tags=["prompts"])
logger = logging.getLogger(__name__)


# =============================================================================
# PB-002: Pydantic Schemas
# =============================================================================

# ── Prompt-level ─────────────────────────────────────────────────────────────

class PromptCreateRequest(BaseModel):
    name:               str = Field(..., min_length=1, max_length=200)
    description:        Optional[str] = None
    use_case:           Optional[str] = None
    industry:           Optional[str] = None
    owner:              Optional[str] = None
    default_locale:     str = Field(default="en", pattern=r"^[a-z]{2}$")
    supported_locales:  List[str] = Field(default_factory=lambda: ["en"])
    tags:               List[str] = Field(default_factory=list)


class PromptUpdateRequest(BaseModel):
    name:               Optional[str] = Field(default=None, min_length=1, max_length=200)
    description:        Optional[str] = None
    use_case:           Optional[str] = None
    industry:           Optional[str] = None
    owner:              Optional[str] = None
    status:             Optional[str] = None
    default_locale:     Optional[str] = Field(default=None, pattern=r"^[a-z]{2}$")
    supported_locales:  Optional[List[str]] = None
    tags:               Optional[List[str]] = None


class PromptResponse(BaseModel):
    prompt_id:          str
    name:               str
    description:        Optional[str] = None
    use_case:           Optional[str] = None
    industry:           Optional[str] = None
    status:             str
    owner:              Optional[str] = None
    default_locale:     str
    supported_locales:  List[str]
    tags:               List[str]
    created_by:         str
    created_at:         str
    updated_at:         str


# ── Child entity schemas (used by PB-004 and onwards) ────────────────────────

class PromptBlockRequest(BaseModel):
    block_id:        Optional[str] = None
    block_type:      str
    sequence_no:     int
    title:           Optional[str] = None
    content:         str = ""
    variables_json:  Dict[str, Any] = Field(default_factory=dict)
    is_required:     bool = False
    metadata_json:   Dict[str, Any] = Field(default_factory=dict)


class PromptInputRequest(BaseModel):
    input_id:                  Optional[str] = None
    name:                      str
    label:                     Optional[str] = None
    type:                      str = "string"
    required:                  bool = True
    default_value:             Optional[str] = None
    validation_json:           Dict[str, Any] = Field(default_factory=dict)
    description:               Optional[str] = None
    sensitive_classification:  Optional[str] = "internal"


class PromptContextBindingRequest(BaseModel):
    binding_id:             Optional[str] = None
    name:                   str
    source_type:            str
    datasource_id:          Optional[int] = None
    semantic_entity:        Optional[str] = None
    field_list_json:        List[Any] = Field(default_factory=list)
    filter_json:            Dict[str, Any] = Field(default_factory=dict)
    retrieval_policy_json:  Dict[str, Any] = Field(default_factory=dict)
    max_records:            int = 1
    metadata_json:          Dict[str, Any] = Field(default_factory=dict)


# ── Runtime schemas (used by PB-007, PB-010) ─────────────────────────────────

class PromptRunRequest(BaseModel):
    prompt_id:        str
    version:          Optional[str] = "published"   # "published" | "latest" | version number
    locale:           Optional[str] = "en"
    runtime_params:   Dict[str, Any] = Field(default_factory=dict)
    response_format:  Optional[str] = "json"        # "json" | "text"
    allow_draft:      bool = False


class PromptRunResponse(BaseModel):
    status:          str
    prompt_run_id:   str
    output:          Optional[Any] = None
    raw_output:      Optional[str] = None
    metadata:        Dict[str, Any] = Field(default_factory=dict)
    error_message:   Optional[str] = None


class PromptTestCaseRequest(BaseModel):
    test_id:               Optional[str] = None
    name:                  str
    description:           Optional[str] = None
    runtime_params_json:   Dict[str, Any] = Field(default_factory=dict)
    expected_output_json:  Dict[str, Any] = Field(default_factory=dict)
    expected_checks_json:  List[Dict[str, Any]] = Field(default_factory=list)


class PromptEvaluationResponse(BaseModel):
    evaluation_id:  str
    prompt_id:      str
    run_id:         Optional[str] = None
    test_id:        Optional[str] = None
    score_json:     Dict[str, Any] = Field(default_factory=dict)
    passed:         bool
    created_at:     str


# =============================================================================
# Helpers (mirrors documents.py style)
# =============================================================================

def get_engine(request: Request) -> AsyncEngine:
    engine = getattr(request.app.state, "engine", None)
    if engine is None:
        raise HTTPException(status_code=500, detail="DB engine not initialized")
    return engine


def get_current_user(request: Request) -> str:
    return request.headers.get("x-user-id", "system")


async def _insert_generic_audit(conn, entity_type, entity_id, action, actor,
                                summary=None, details=None):
    """
    Inserts an audit event into the existing template_builder.audit_events table.
    Mirrors the helper used in api/documents.py so all auditing flows through
    one consistent table.
    """
    sql = text("""
        INSERT INTO prompt_builder.audit_events (
            event_id, entity_type, entity_id, action, actor,
            summary, details_json, created_at
        ) VALUES (
            uuid_generate_v4(), :etype, :eid, :act, :actor,
            :summary, :details, NOW()
        )
    """)
    await conn.execute(sql, {
        "etype":   entity_type,
        "eid":     entity_id,
        "act":     action,
        "actor":   actor,
        "summary": summary,
        "details": json.dumps(details or {}),
    })


def _row_to_prompt_dict(row) -> Dict[str, Any]:
    """Converts a SQL row from prompt_builder.prompts into a JSON-friendly dict."""
    return {
        "prompt_id":          str(row[0]),
        "name":               row[1],
        "description":        row[2],
        "use_case":           row[3],
        "industry":           row[4],
        "status":             row[5],
        "owner":              row[6],
        "default_locale":     row[7],
        "supported_locales":  list(row[8]) if row[8] else ["en"],
        "tags":               list(row[9]) if row[9] else [],
        "created_by":         row[10],
        "created_at":         row[11].isoformat() if row[11] else None,
        "updated_at":         row[12].isoformat() if row[12] else None,
    }


PROMPT_SELECT_COLS = """
    prompt_id, name, description, use_case, industry, status, owner,
    default_locale, supported_locales, tags, created_by, created_at, updated_at
"""


# =============================================================================
# PB-003: Prompt CRUD Endpoints
# =============================================================================

# ── POST /prompts ────────────────────────────────────────────────────────────

@router.post("", status_code=status.HTTP_201_CREATED, response_model=PromptResponse)
async def create_prompt(
    payload: PromptCreateRequest,
    request: Request,
    user: str = Depends(get_current_user),
) -> PromptResponse:
    """Create a new draft prompt."""
    engine = get_engine(request)
    prompt_id = str(uuid.uuid4())

    async with engine.begin() as conn:
        await conn.execute(text(f"""
            INSERT INTO prompt_builder.prompts (
                prompt_id, name, description, use_case, industry, status,
                owner, default_locale, supported_locales, tags,
                created_by, created_at, updated_at
            ) VALUES (
                :pid, :name, :desc, :use_case, :industry, 'draft',
                :owner, :locale, :locales, :tags,
                :user, NOW(), NOW()
            )
        """), {
            "pid":      prompt_id,
            "name":     payload.name,
            "desc":     payload.description,
            "use_case": payload.use_case,
            "industry": payload.industry,
            "owner":    payload.owner,
            "locale":   payload.default_locale,
            "locales":  payload.supported_locales or ["en"],
            "tags":     payload.tags or [],
            "user":     user,
        })

        await _insert_generic_audit(
            conn, "prompt", prompt_id, "create", user,
            f"Prompt '{payload.name}' created",
            {"use_case": payload.use_case, "industry": payload.industry},
        )

        result = await conn.execute(
            text(f"SELECT {PROMPT_SELECT_COLS} FROM prompt_builder.prompts WHERE prompt_id = :pid"),
            {"pid": prompt_id},
        )
        row = result.fetchone()

    if not row:
        raise HTTPException(status_code=500, detail="Prompt was created but could not be reloaded")

    logger.info(f"Prompt created: {prompt_id} by {user}")
    return PromptResponse(**_row_to_prompt_dict(row))


# ── GET /prompts (list with filters) ─────────────────────────────────────────

@router.get("", response_model=List[PromptResponse])
async def list_prompts(
    request: Request,
    status_filter:  Optional[str] = None,
    industry:       Optional[str] = None,
    use_case:       Optional[str] = None,
    search:         Optional[str] = None,
    limit:          int = 100,
    offset:         int = 0,
) -> List[PromptResponse]:
    """
    List prompts with optional filters.
    Note: query parameter is `status` from the client, but we receive it as
    `status_filter` to avoid shadowing FastAPI's `status` import.
    """
    engine = get_engine(request)

    # Build dynamic WHERE clause
    where_clauses = []
    params: Dict[str, Any] = {"limit": limit, "offset": offset}

    if status_filter:
        where_clauses.append("status = :status")
        params["status"] = status_filter
    else:
        # By default hide archived unless explicitly requested
        where_clauses.append("status <> 'archived'")

    if industry:
        where_clauses.append("industry = :industry")
        params["industry"] = industry

    if use_case:
        where_clauses.append("use_case = :use_case")
        params["use_case"] = use_case

    if search:
        where_clauses.append("(name ILIKE :search OR description ILIKE :search)")
        params["search"] = f"%{search}%"

    where_sql = " AND ".join(where_clauses) if where_clauses else "TRUE"

    async with engine.connect() as conn:
        result = await conn.execute(text(f"""
            SELECT {PROMPT_SELECT_COLS}
            FROM prompt_builder.prompts
            WHERE {where_sql}
            ORDER BY created_at DESC
            LIMIT :limit OFFSET :offset
        """), params)
        rows = result.fetchall()

    return [PromptResponse(**_row_to_prompt_dict(r)) for r in rows]


# ── GET /prompts/{id} (with children) ────────────────────────────────────────

@router.get("/{prompt_id}", response_model=Dict[str, Any])
async def get_prompt(prompt_id: str, request: Request) -> Dict[str, Any]:
    """
    Get a single prompt with its blocks, inputs, context bindings, and the
    latest version metadata. Returns a dict (not PromptResponse) because the
    payload includes nested children.
    """
    engine = get_engine(request)

    async with engine.connect() as conn:
        # 1) Main prompt
        result = await conn.execute(
            text(f"SELECT {PROMPT_SELECT_COLS} FROM prompt_builder.prompts WHERE prompt_id = :pid"),
            {"pid": prompt_id},
        )
        row = result.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail=f"Prompt {prompt_id} not found")

        prompt_dict = _row_to_prompt_dict(row)

        # 2) Blocks
        result = await conn.execute(text("""
            SELECT block_id, block_type, sequence_no, title, content,
                   variables_json, is_required, metadata_json
            FROM prompt_builder.prompt_blocks
            WHERE prompt_id = :pid
            ORDER BY sequence_no ASC
        """), {"pid": prompt_id})
        blocks = [
            {
                "block_id":        str(r[0]),
                "block_type":      r[1],
                "sequence_no":     r[2],
                "title":           r[3],
                "content":         r[4],
                "variables_json":  r[5] or {},
                "is_required":     r[6],
                "metadata_json":   r[7] or {},
            }
            for r in result.fetchall()
        ]

        # 3) Inputs
        result = await conn.execute(text("""
            SELECT input_id, name, label, type, required, default_value,
                   validation_json, description, sensitive_classification
            FROM prompt_builder.prompt_inputs
            WHERE prompt_id = :pid
            ORDER BY name ASC
        """), {"pid": prompt_id})
        inputs = [
            {
                "input_id":                  str(r[0]),
                "name":                      r[1],
                "label":                     r[2],
                "type":                      r[3],
                "required":                  r[4],
                "default_value":             r[5],
                "validation_json":           r[6] or {},
                "description":               r[7],
                "sensitive_classification":  r[8],
            }
            for r in result.fetchall()
        ]

        # 4) Context bindings
        result = await conn.execute(text("""
            SELECT binding_id, name, source_type, datasource_id, semantic_entity,
                   field_list_json, filter_json, retrieval_policy_json,
                   max_records, metadata_json
            FROM prompt_builder.prompt_context_bindings
            WHERE prompt_id = :pid
            ORDER BY name ASC
        """), {"pid": prompt_id})
        bindings = [
            {
                "binding_id":             str(r[0]),
                "name":                   r[1],
                "source_type":            r[2],
                "datasource_id":          r[3],
                "semantic_entity":        r[4],
                "field_list_json":        r[5] or [],
                "filter_json":            r[6] or {},
                "retrieval_policy_json":  r[7] or {},
                "max_records":            r[8],
                "metadata_json":          r[9] or {},
            }
            for r in result.fetchall()
        ]

        # 5) Latest version (if any)
        result = await conn.execute(text("""
            SELECT version_id, version_number, status, change_summary,
                   created_by, created_at, approved_by, approved_at
            FROM prompt_builder.prompt_versions
            WHERE prompt_id = :pid
            ORDER BY version_number DESC
            LIMIT 1
        """), {"pid": prompt_id})
        v = result.fetchone()
        latest_version = None
        if v:
            latest_version = {
                "version_id":     str(v[0]),
                "version_number": v[1],
                "status":         v[2],
                "change_summary": v[3],
                "created_by":     v[4],
                "created_at":     v[5].isoformat() if v[5] else None,
                "approved_by":    v[6],
                "approved_at":    v[7].isoformat() if v[7] else None,
            }

    return {
        **prompt_dict,
        "blocks":           blocks,
        "inputs":           inputs,
        "context_bindings": bindings,
        "latest_version":   latest_version,
    }


# ── PUT /prompts/{id} ────────────────────────────────────────────────────────

@router.put("/{prompt_id}", response_model=PromptResponse)
async def update_prompt(
    prompt_id: str,
    payload: PromptUpdateRequest,
    request: Request,
    user: str = Depends(get_current_user),
) -> PromptResponse:
    """Update prompt metadata. Only fields provided in the payload are changed."""
    engine = get_engine(request)

    # Build dynamic SET clause from provided fields only
    set_parts: List[str] = []
    params: Dict[str, Any] = {"pid": prompt_id}

    if payload.name is not None:
        set_parts.append("name = :name");                params["name"] = payload.name
    if payload.description is not None:
        set_parts.append("description = :description"); params["description"] = payload.description
    if payload.use_case is not None:
        set_parts.append("use_case = :use_case");       params["use_case"] = payload.use_case
    if payload.industry is not None:
        set_parts.append("industry = :industry");       params["industry"] = payload.industry
    if payload.owner is not None:
        set_parts.append("owner = :owner");             params["owner"] = payload.owner
    if payload.status is not None:
        set_parts.append("status = :status");           params["status"] = payload.status
    if payload.default_locale is not None:
        set_parts.append("default_locale = :locale");   params["locale"] = payload.default_locale
    if payload.supported_locales is not None:
        set_parts.append("supported_locales = :locales"); params["locales"] = payload.supported_locales
    if payload.tags is not None:
        set_parts.append("tags = :tags");               params["tags"] = payload.tags

    if not set_parts:
        raise HTTPException(status_code=400, detail="No fields provided to update")

    set_parts.append("updated_at = NOW()")
    set_sql = ", ".join(set_parts)

    async with engine.begin() as conn:
        # Confirm exists first to give a clean 404 (instead of "0 rows updated")
        check = await conn.execute(
            text("SELECT 1 FROM prompt_builder.prompts WHERE prompt_id = :pid"),
            {"pid": prompt_id},
        )
        if check.fetchone() is None:
            raise HTTPException(status_code=404, detail=f"Prompt {prompt_id} not found")

        await conn.execute(
            text(f"UPDATE prompt_builder.prompts SET {set_sql} WHERE prompt_id = :pid"),
            params,
        )

        await _insert_generic_audit(
            conn, "prompt", prompt_id, "update", user,
            f"Prompt {prompt_id} updated",
            {"fields_updated": [k for k in params.keys() if k != "pid"]},
        )

        result = await conn.execute(
            text(f"SELECT {PROMPT_SELECT_COLS} FROM prompt_builder.prompts WHERE prompt_id = :pid"),
            {"pid": prompt_id},
        )
        row = result.fetchone()

    logger.info(f"Prompt updated: {prompt_id} by {user}")
    return PromptResponse(**_row_to_prompt_dict(row))


# ── DELETE /prompts/{id} (soft delete) ───────────────────────────────────────

@router.delete("/{prompt_id}", status_code=status.HTTP_200_OK)
async def delete_prompt(
    prompt_id: str,
    request: Request,
    user: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Soft delete: marks prompt status as 'archived' instead of removing the row.
    Preserves audit trail and prevents accidental loss of approved/published
    prompts that may already be referenced by run history.
    """
    engine = get_engine(request)

    async with engine.begin() as conn:
        check = await conn.execute(
            text("SELECT name FROM prompt_builder.prompts WHERE prompt_id = :pid"),
            {"pid": prompt_id},
        )
        existing = check.fetchone()
        if existing is None:
            raise HTTPException(status_code=404, detail=f"Prompt {prompt_id} not found")

        await conn.execute(text("""
            UPDATE prompt_builder.prompts
            SET status = 'archived', updated_at = NOW()
            WHERE prompt_id = :pid
        """), {"pid": prompt_id})

        await _insert_generic_audit(
            conn, "prompt", prompt_id, "archive", user,
            f"Prompt '{existing[0]}' archived",
        )

    logger.info(f"Prompt archived: {prompt_id} by {user}")
    return {
        "status":     "archived",
        "prompt_id":  prompt_id,
        "message":    f"Prompt {prompt_id} marked as archived",
    }


# ── POST /prompts/{id}/duplicate ─────────────────────────────────────────────

@router.post("/{prompt_id}/duplicate", status_code=status.HTTP_201_CREATED, response_model=PromptResponse)
async def duplicate_prompt(
    prompt_id: str,
    request: Request,
    user: str = Depends(get_current_user),
) -> PromptResponse:
    """
    Clone a prompt along with its blocks, inputs, and context bindings.
    The clone always starts as 'draft' regardless of the source's status.
    Versions, runs, traces, evaluations, and approvals are NOT copied —
    a duplicate is a fresh editable copy, not a history clone.
    """
    engine = get_engine(request)
    new_prompt_id = str(uuid.uuid4())

    async with engine.begin() as conn:
        # 1) Load source prompt
        result = await conn.execute(
            text(f"SELECT {PROMPT_SELECT_COLS} FROM prompt_builder.prompts WHERE prompt_id = :pid"),
            {"pid": prompt_id},
        )
        src = result.fetchone()
        if src is None:
            raise HTTPException(status_code=404, detail=f"Prompt {prompt_id} not found")

        # 2) Insert new prompt as a fresh draft (Copy-suffix on name)
        await conn.execute(text("""
            INSERT INTO prompt_builder.prompts (
                prompt_id, name, description, use_case, industry, status,
                owner, default_locale, supported_locales, tags,
                created_by, created_at, updated_at
            ) VALUES (
                :pid, :name, :desc, :use_case, :industry, 'draft',
                :owner, :locale, :locales, :tags,
                :user, NOW(), NOW()
            )
        """), {
            "pid":      new_prompt_id,
            "name":     f"{src[1]} (Copy)",
            "desc":     src[2],
            "use_case": src[3],
            "industry": src[4],
            "owner":    src[6],
            "locale":   src[7],
            "locales":  list(src[8]) if src[8] else ["en"],
            "tags":     list(src[9]) if src[9] else [],
            "user":     user,
        })

        # 3) Copy blocks
        await conn.execute(text("""
            INSERT INTO prompt_builder.prompt_blocks (
                block_id, prompt_id, version_id, block_type, sequence_no,
                title, content, variables_json, is_required, metadata_json,
                created_at, updated_at
            )
            SELECT uuid_generate_v4(), :new_pid, NULL, block_type, sequence_no,
                   title, content, variables_json, is_required, metadata_json,
                   NOW(), NOW()
            FROM prompt_builder.prompt_blocks
            WHERE prompt_id = :src_pid
        """), {"new_pid": new_prompt_id, "src_pid": prompt_id})

        # 4) Copy inputs
        await conn.execute(text("""
            INSERT INTO prompt_builder.prompt_inputs (
                input_id, prompt_id, name, label, type, required,
                default_value, validation_json, description,
                sensitive_classification, created_at
            )
            SELECT uuid_generate_v4(), :new_pid, name, label, type, required,
                   default_value, validation_json, description,
                   sensitive_classification, NOW()
            FROM prompt_builder.prompt_inputs
            WHERE prompt_id = :src_pid
        """), {"new_pid": new_prompt_id, "src_pid": prompt_id})

        # 5) Copy context bindings
        await conn.execute(text("""
            INSERT INTO prompt_builder.prompt_context_bindings (
                binding_id, prompt_id, name, source_type, datasource_id,
                semantic_entity, field_list_json, filter_json,
                retrieval_policy_json, max_records, metadata_json, created_at
            )
            SELECT uuid_generate_v4(), :new_pid, name, source_type, datasource_id,
                   semantic_entity, field_list_json, filter_json,
                   retrieval_policy_json, max_records, metadata_json, NOW()
            FROM prompt_builder.prompt_context_bindings
            WHERE prompt_id = :src_pid
        """), {"new_pid": new_prompt_id, "src_pid": prompt_id})

        # 6) Audit
        await _insert_generic_audit(
            conn, "prompt", new_prompt_id, "duplicate", user,
            f"Prompt duplicated from {prompt_id}",
            {"source_prompt_id": prompt_id},
        )

        # 7) Reload the new prompt
        result = await conn.execute(
            text(f"SELECT {PROMPT_SELECT_COLS} FROM prompt_builder.prompts WHERE prompt_id = :pid"),
            {"pid": new_prompt_id},
        )
        new_row = result.fetchone()

    logger.info(f"Prompt duplicated: {prompt_id} → {new_prompt_id} by {user}")
    return PromptResponse(**_row_to_prompt_dict(new_row))
# =============================================================================
# PB-004: PROMPT STRUCTURE APIs
# =============================================================================
#
# APPEND THIS TO THE BOTTOM OF: backend/src/api/prompts.py
#
# Adds 8 endpoints for managing the children of a prompt:
#
#   GET  /prompts/{id}/blocks            List blocks
#   PUT  /prompts/{id}/blocks            Replace ALL blocks transactionally
#
#   GET  /prompts/{id}/inputs            List inputs
#   PUT  /prompts/{id}/inputs            Replace ALL inputs transactionally
#
#   GET  /prompts/{id}/context-bindings  List context bindings
#   PUT  /prompts/{id}/context-bindings  Replace ALL bindings transactionally
#
#   GET  /prompts/{id}/schema            Get input/output schema + guardrails
#   PUT  /prompts/{id}/schema            Update schema for draft version
#
# DESIGN:
#   * "Replace-all" semantics — DELETE all rows for prompt_id, then INSERT
#     the submitted rows. Wrapped in a single transaction so either
#     everything succeeds or nothing changes.
#   * Schema (input_schema_json, output_schema_json, guardrails_json) is
#     stored on the LATEST DRAFT version row. If no draft version exists,
#     a new draft v1 is created on first save.
#   * Audit events are written for every PUT operation.
# =============================================================================


# ─── Helper: confirm a prompt exists ────────────────────────────────────────

async def _ensure_prompt_exists(conn, prompt_id: str) -> None:
    """Raise 404 if the given prompt_id is not in the table."""
    result = await conn.execute(
        text("SELECT 1 FROM prompt_builder.prompts WHERE prompt_id = :pid"),
        {"pid": prompt_id},
    )
    if result.fetchone() is None:
        raise HTTPException(status_code=404, detail=f"Prompt {prompt_id} not found")


# =============================================================================
# BLOCKS
# =============================================================================

@router.get("/{prompt_id}/blocks", response_model=List[Dict[str, Any]])
async def list_prompt_blocks(prompt_id: str, request: Request) -> List[Dict[str, Any]]:
    """List all blocks for a prompt, ordered by sequence_no."""
    engine = get_engine(request)

    async with engine.connect() as conn:
        await _ensure_prompt_exists(conn, prompt_id)

        result = await conn.execute(text("""
            SELECT block_id, block_type, sequence_no, title, content,
                   variables_json, is_required, metadata_json,
                   created_at, updated_at
            FROM prompt_builder.prompt_blocks
            WHERE prompt_id = :pid
            ORDER BY sequence_no ASC
        """), {"pid": prompt_id})
        rows = result.fetchall()

    return [
        {
            "block_id":        str(r[0]),
            "block_type":      r[1],
            "sequence_no":     r[2],
            "title":           r[3],
            "content":         r[4],
            "variables_json":  r[5] or {},
            "is_required":     r[6],
            "metadata_json":   r[7] or {},
            "created_at":      r[8].isoformat() if r[8] else None,
            "updated_at":      r[9].isoformat() if r[9] else None,
        }
        for r in rows
    ]


@router.put("/{prompt_id}/blocks", response_model=List[Dict[str, Any]])
async def replace_prompt_blocks(
    prompt_id: str,
    payload: List[PromptBlockRequest],
    request: Request,
    user: str = Depends(get_current_user),
) -> List[Dict[str, Any]]:
    """
    REPLACE-ALL semantics:
      1) Delete every existing block for this prompt
      2) Insert the submitted blocks in order
      3) Return the saved rows
    Wrapped in a single transaction so failures roll back cleanly.
    """
    engine = get_engine(request)

    async with engine.begin() as conn:
        await _ensure_prompt_exists(conn, prompt_id)

        # 1) Delete existing
        await conn.execute(
            text("DELETE FROM prompt_builder.prompt_blocks WHERE prompt_id = :pid"),
            {"pid": prompt_id},
        )

        # 2) Insert new (in payload order)
        saved_rows = []
        for idx, block in enumerate(payload):
            block_id = block.block_id or str(uuid.uuid4())
            seq = block.sequence_no if block.sequence_no is not None else idx

            await conn.execute(text("""
                INSERT INTO prompt_builder.prompt_blocks (
                    block_id, prompt_id, version_id, block_type, sequence_no,
                    title, content, variables_json, is_required, metadata_json,
                    created_at, updated_at
                ) VALUES (
                    :bid, :pid, NULL, :btype, :seq,
                    :title, :content, :vars, :required, :meta,
                    NOW(), NOW()
                )
            """), {
                "bid":      block_id,
                "pid":      prompt_id,
                "btype":    block.block_type,
                "seq":      seq,
                "title":    block.title,
                "content":  block.content,
                "vars":     json.dumps(block.variables_json or {}),
                "required": block.is_required,
                "meta":     json.dumps(block.metadata_json or {}),
            })
            saved_rows.append({
                "block_id":       block_id,
                "block_type":     block.block_type,
                "sequence_no":    seq,
                "title":          block.title,
                "content":        block.content,
                "variables_json": block.variables_json or {},
                "is_required":    block.is_required,
                "metadata_json":  block.metadata_json or {},
            })

        # 3) Bump prompt updated_at + audit
        await conn.execute(
            text("UPDATE prompt_builder.prompts SET updated_at = NOW() WHERE prompt_id = :pid"),
            {"pid": prompt_id},
        )
        await _insert_generic_audit(
            conn, "prompt", prompt_id, "blocks_updated", user,
            f"Replaced blocks ({len(payload)} blocks)",
            {"block_count": len(payload)},
        )

    logger.info(f"Blocks replaced for prompt {prompt_id} by {user}: {len(payload)} blocks")
    return saved_rows


# =============================================================================
# INPUTS
# =============================================================================

@router.get("/{prompt_id}/inputs", response_model=List[Dict[str, Any]])
async def list_prompt_inputs(prompt_id: str, request: Request) -> List[Dict[str, Any]]:
    """List all input definitions for a prompt."""
    engine = get_engine(request)

    async with engine.connect() as conn:
        await _ensure_prompt_exists(conn, prompt_id)

        result = await conn.execute(text("""
            SELECT input_id, name, label, type, required, default_value,
                   validation_json, description, sensitive_classification,
                   created_at
            FROM prompt_builder.prompt_inputs
            WHERE prompt_id = :pid
            ORDER BY name ASC
        """), {"pid": prompt_id})
        rows = result.fetchall()

    return [
        {
            "input_id":                  str(r[0]),
            "name":                      r[1],
            "label":                     r[2],
            "type":                      r[3],
            "required":                  r[4],
            "default_value":             r[5],
            "validation_json":           r[6] or {},
            "description":               r[7],
            "sensitive_classification":  r[8],
            "created_at":                r[9].isoformat() if r[9] else None,
        }
        for r in rows
    ]


@router.put("/{prompt_id}/inputs", response_model=List[Dict[str, Any]])
async def replace_prompt_inputs(
    prompt_id: str,
    payload: List[PromptInputRequest],
    request: Request,
    user: str = Depends(get_current_user),
) -> List[Dict[str, Any]]:
    """REPLACE-ALL inputs for a prompt, wrapped in one transaction."""
    engine = get_engine(request)

    # Validate no duplicate names within payload (DB has UNIQUE constraint, but
    # catching it early gives a cleaner 400 message)
    names_seen = set()
    for inp in payload:
        if inp.name in names_seen:
            raise HTTPException(status_code=400, detail=f"Duplicate input name: {inp.name}")
        names_seen.add(inp.name)

    async with engine.begin() as conn:
        await _ensure_prompt_exists(conn, prompt_id)

        await conn.execute(
            text("DELETE FROM prompt_builder.prompt_inputs WHERE prompt_id = :pid"),
            {"pid": prompt_id},
        )

        saved_rows = []
        for inp in payload:
            input_id = inp.input_id or str(uuid.uuid4())
            await conn.execute(text("""
                INSERT INTO prompt_builder.prompt_inputs (
                    input_id, prompt_id, name, label, type, required,
                    default_value, validation_json, description,
                    sensitive_classification, created_at
                ) VALUES (
                    :iid, :pid, :name, :label, :type, :required,
                    :default_value, :validation, :description,
                    :classification, NOW()
                )
            """), {
                "iid":            input_id,
                "pid":            prompt_id,
                "name":           inp.name,
                "label":          inp.label,
                "type":           inp.type,
                "required":       inp.required,
                "default_value":  inp.default_value,
                "validation":     json.dumps(inp.validation_json or {}),
                "description":    inp.description,
                "classification": inp.sensitive_classification or "internal",
            })
            saved_rows.append({
                "input_id":                  input_id,
                "name":                      inp.name,
                "label":                     inp.label,
                "type":                      inp.type,
                "required":                  inp.required,
                "default_value":             inp.default_value,
                "validation_json":           inp.validation_json or {},
                "description":               inp.description,
                "sensitive_classification":  inp.sensitive_classification or "internal",
            })

        await conn.execute(
            text("UPDATE prompt_builder.prompts SET updated_at = NOW() WHERE prompt_id = :pid"),
            {"pid": prompt_id},
        )
        await _insert_generic_audit(
            conn, "prompt", prompt_id, "inputs_updated", user,
            f"Replaced inputs ({len(payload)} inputs)",
            {"input_count": len(payload), "input_names": [i.name for i in payload]},
        )

    logger.info(f"Inputs replaced for prompt {prompt_id} by {user}: {len(payload)} inputs")
    return saved_rows


# =============================================================================
# CONTEXT BINDINGS
# =============================================================================

@router.get("/{prompt_id}/context-bindings", response_model=List[Dict[str, Any]])
async def list_prompt_context_bindings(
    prompt_id: str,
    request: Request,
) -> List[Dict[str, Any]]:
    """List all context bindings for a prompt."""
    engine = get_engine(request)

    async with engine.connect() as conn:
        await _ensure_prompt_exists(conn, prompt_id)

        result = await conn.execute(text("""
            SELECT binding_id, name, source_type, datasource_id, semantic_entity,
                   field_list_json, filter_json, retrieval_policy_json,
                   max_records, metadata_json, created_at
            FROM prompt_builder.prompt_context_bindings
            WHERE prompt_id = :pid
            ORDER BY name ASC
        """), {"pid": prompt_id})
        rows = result.fetchall()

    return [
        {
            "binding_id":             str(r[0]),
            "name":                   r[1],
            "source_type":            r[2],
            "datasource_id":          r[3],
            "semantic_entity":        r[4],
            "field_list_json":        r[5] or [],
            "filter_json":            r[6] or {},
            "retrieval_policy_json":  r[7] or {},
            "max_records":            r[8],
            "metadata_json":          r[9] or {},
            "created_at":             r[10].isoformat() if r[10] else None,
        }
        for r in rows
    ]


@router.put("/{prompt_id}/context-bindings", response_model=List[Dict[str, Any]])
async def replace_prompt_context_bindings(
    prompt_id: str,
    payload: List[PromptContextBindingRequest],
    request: Request,
    user: str = Depends(get_current_user),
) -> List[Dict[str, Any]]:
    """REPLACE-ALL context bindings for a prompt, wrapped in one transaction."""
    engine = get_engine(request)

    async with engine.begin() as conn:
        await _ensure_prompt_exists(conn, prompt_id)

        await conn.execute(
            text("DELETE FROM prompt_builder.prompt_context_bindings WHERE prompt_id = :pid"),
            {"pid": prompt_id},
        )

        saved_rows = []
        for binding in payload:
            binding_id = binding.binding_id or str(uuid.uuid4())
            await conn.execute(text("""
                INSERT INTO prompt_builder.prompt_context_bindings (
                    binding_id, prompt_id, name, source_type, datasource_id,
                    semantic_entity, field_list_json, filter_json,
                    retrieval_policy_json, max_records, metadata_json, created_at
                ) VALUES (
                    :bid, :pid, :name, :source_type, :ds_id,
                    :semantic_entity, :field_list, :filter,
                    :policy, :max_records, :meta, NOW()
                )
            """), {
                "bid":             binding_id,
                "pid":             prompt_id,
                "name":            binding.name,
                "source_type":     binding.source_type,
                "ds_id":           binding.datasource_id,
                "semantic_entity": binding.semantic_entity,
                "field_list":      json.dumps(binding.field_list_json or []),
                "filter":          json.dumps(binding.filter_json or {}),
                "policy":          json.dumps(binding.retrieval_policy_json or {}),
                "max_records":     binding.max_records,
                "meta":            json.dumps(binding.metadata_json or {}),
            })
            saved_rows.append({
                "binding_id":             binding_id,
                "name":                   binding.name,
                "source_type":            binding.source_type,
                "datasource_id":          binding.datasource_id,
                "semantic_entity":        binding.semantic_entity,
                "field_list_json":        binding.field_list_json or [],
                "filter_json":            binding.filter_json or {},
                "retrieval_policy_json":  binding.retrieval_policy_json or {},
                "max_records":            binding.max_records,
                "metadata_json":          binding.metadata_json or {},
            })

        await conn.execute(
            text("UPDATE prompt_builder.prompts SET updated_at = NOW() WHERE prompt_id = :pid"),
            {"pid": prompt_id},
        )
        await _insert_generic_audit(
            conn, "prompt", prompt_id, "bindings_updated", user,
            f"Replaced context bindings ({len(payload)} bindings)",
            {"binding_count": len(payload), "binding_names": [b.name for b in payload]},
        )

    logger.info(f"Context bindings replaced for prompt {prompt_id} by {user}: {len(payload)} bindings")
    return saved_rows


# =============================================================================
# SCHEMA  (input_schema + output_schema + guardrails)
# =============================================================================
#
# These three live on the LATEST DRAFT version row. If no draft version
# exists, the first save creates v1 as a draft. Subsequent saves update
# whatever draft is currently the latest.
# =============================================================================


class PromptSchemaRequest(BaseModel):
    input_schema_json:   Dict[str, Any] = Field(default_factory=dict)
    output_schema_json:  Dict[str, Any] = Field(default_factory=dict)
    guardrails_json:     Dict[str, Any] = Field(default_factory=dict)
    change_summary:      Optional[str] = None


class PromptSchemaResponse(BaseModel):
    version_id:          str
    version_number:      int
    input_schema_json:   Dict[str, Any]
    output_schema_json:  Dict[str, Any]
    guardrails_json:     Dict[str, Any]
    change_summary:      Optional[str] = None
    status:              str
    updated_at:          str


@router.get("/{prompt_id}/schema", response_model=PromptSchemaResponse)
async def get_prompt_schema(prompt_id: str, request: Request) -> PromptSchemaResponse:
    """
    Returns the schema (input/output/guardrails) from the latest DRAFT version.
    If no draft exists, returns empty objects with version_number = 0.
    """
    engine = get_engine(request)

    async with engine.connect() as conn:
        await _ensure_prompt_exists(conn, prompt_id)

        # Find the latest draft version (preferred) — fall back to latest version of any kind
        result = await conn.execute(text("""
            SELECT version_id, version_number, status,
                   input_schema_json, output_schema_json, guardrails_json,
                   change_summary, created_at
            FROM prompt_builder.prompt_versions
            WHERE prompt_id = :pid
            ORDER BY
              CASE WHEN status = 'draft' THEN 0 ELSE 1 END,
              version_number DESC
            LIMIT 1
        """), {"pid": prompt_id})
        row = result.fetchone()

    if row is None:
        # No version exists yet — return blank schema
        return PromptSchemaResponse(
            version_id="",
            version_number=0,
            input_schema_json={},
            output_schema_json={},
            guardrails_json={},
            change_summary=None,
            status="none",
            updated_at="",
        )

    return PromptSchemaResponse(
        version_id=str(row[0]),
        version_number=row[1],
        status=row[2],
        input_schema_json=row[3] or {},
        output_schema_json=row[4] or {},
        guardrails_json=row[5] or {},
        change_summary=row[6],
        updated_at=row[7].isoformat() if row[7] else "",
    )


@router.put("/{prompt_id}/schema", response_model=PromptSchemaResponse)
async def update_prompt_schema(
    prompt_id: str,
    payload: PromptSchemaRequest,
    request: Request,
    user: str = Depends(get_current_user),
) -> PromptSchemaResponse:
    """
    Update the schema on the latest DRAFT version.
    If no draft version exists, create a new draft v1.
    """
    engine = get_engine(request)

    async with engine.begin() as conn:
        await _ensure_prompt_exists(conn, prompt_id)

        # Look for an existing draft version
        result = await conn.execute(text("""
            SELECT version_id, version_number
            FROM prompt_builder.prompt_versions
            WHERE prompt_id = :pid AND status = 'draft'
            ORDER BY version_number DESC
            LIMIT 1
        """), {"pid": prompt_id})
        existing_draft = result.fetchone()

        if existing_draft:
            # Update existing draft
            version_id = str(existing_draft[0])
            version_number = existing_draft[1]

            await conn.execute(text("""
                UPDATE prompt_builder.prompt_versions
                SET input_schema_json  = :input_schema,
                    output_schema_json = :output_schema,
                    guardrails_json    = :guardrails,
                    change_summary     = :summary
                WHERE version_id = :vid
            """), {
                "input_schema":  json.dumps(payload.input_schema_json or {}),
                "output_schema": json.dumps(payload.output_schema_json or {}),
                "guardrails":    json.dumps(payload.guardrails_json or {}),
                "summary":       payload.change_summary,
                "vid":           version_id,
            })
            action = "schema_updated"
        else:
            # No draft yet — figure out next version_number
            result = await conn.execute(text("""
                SELECT COALESCE(MAX(version_number), 0) + 1
                FROM prompt_builder.prompt_versions
                WHERE prompt_id = :pid
            """), {"pid": prompt_id})
            version_number = result.fetchone()[0]
            version_id = str(uuid.uuid4())

            await conn.execute(text("""
                INSERT INTO prompt_builder.prompt_versions (
                    version_id, prompt_id, version_number, status,
                    input_schema_json, output_schema_json, guardrails_json,
                    change_summary, created_by, created_at
                ) VALUES (
                    :vid, :pid, :vnum, 'draft',
                    :input_schema, :output_schema, :guardrails,
                    :summary, :user, NOW()
                )
            """), {
                "vid":           version_id,
                "pid":           prompt_id,
                "vnum":          version_number,
                "input_schema":  json.dumps(payload.input_schema_json or {}),
                "output_schema": json.dumps(payload.output_schema_json or {}),
                "guardrails":    json.dumps(payload.guardrails_json or {}),
                "summary":       payload.change_summary,
                "user":          user,
            })
            action = "schema_created"

        # Bump prompt updated_at + audit
        await conn.execute(
            text("UPDATE prompt_builder.prompts SET updated_at = NOW() WHERE prompt_id = :pid"),
            {"pid": prompt_id},
        )
        await _insert_generic_audit(
            conn, "prompt", prompt_id, action, user,
            f"Schema saved on draft v{version_number}",
            {
                "version_id":     version_id,
                "version_number": version_number,
                "change_summary": payload.change_summary,
            },
        )

        # Reload the row to return fresh data
        result = await conn.execute(text("""
            SELECT version_id, version_number, status,
                   input_schema_json, output_schema_json, guardrails_json,
                   change_summary, created_at
            FROM prompt_builder.prompt_versions
            WHERE version_id = :vid
        """), {"vid": version_id})
        row = result.fetchone()

    logger.info(f"Schema updated for prompt {prompt_id} by {user}: v{version_number}")
    return PromptSchemaResponse(
        version_id=str(row[0]),
        version_number=row[1],
        status=row[2],
        input_schema_json=row[3] or {},
        output_schema_json=row[4] or {},
        guardrails_json=row[5] or {},
        change_summary=row[6],
        updated_at=row[7].isoformat() if row[7] else "",
    )

@router.post("/run", response_model=PromptRunResponse, status_code=status.HTTP_200_OK)
async def execute_prompt(
    payload: PromptRunRequest,
    request: Request,
    user: str = Depends(get_current_user),
) -> PromptRunResponse:
    engine = get_engine(request)
    try:
        result = await run_prompt(
            engine=engine,
            request=payload.dict(),
            actor=user,
        )
    except _RunError as exc:
        raise HTTPException(status_code=exc.http_status, detail=exc.message)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception(f"Unexpected error in /prompts/run: {exc}")
        raise HTTPException(status_code=500, detail=f"Internal error: {exc}")
    return PromptRunResponse(**result)
# =============================================================================
# PB-009: PROMPT VERSIONING & PUBLISH WORKFLOW
# =============================================================================
#
# APPEND THIS TO THE BOTTOM OF: backend/src/api/prompts.py
#
# Adds 4 endpoints for governed lifecycle management:
#
#   GET    /prompts/{id}/versions          List all versions
#   POST   /prompts/{id}/versions          Create immutable snapshot
#   POST   /prompts/{id}/publish           Publish a version (deprecates old)
#   POST   /prompts/{id}/rollback          Roll back to a previous version
#
# CONCEPTS:
#   * A "version" is an IMMUTABLE snapshot of a prompt's blocks, inputs,
#     output schema, and guardrails at a point in time.
#   * Only one version per prompt may be `published` at a time.
#   * Publishing a new version automatically `deprecates` the previous one.
#   * Rollback re-publishes an older version and deprecates the current one.
#   * Audit rows go into the existing template_builder.audit_events table.
# =============================================================================


# ─── Pydantic models specific to versioning ─────────────────────────────────

class PromptVersionRequest(BaseModel):
    change_summary: Optional[str] = None
    model_policy_json: Dict[str, Any] = Field(default_factory=dict)


class PromptPublishRequest(BaseModel):
    version_number:  Optional[int] = None    # if None, publish the latest draft
    change_summary:  Optional[str] = None


class PromptRollbackRequest(BaseModel):
    version_number:  int                     # version to roll back to (required)
    change_summary:  Optional[str] = None


class PromptVersionResponse(BaseModel):
    version_id:           str
    prompt_id:            str
    version_number:       int
    status:               str
    model_policy_json:    Dict[str, Any]
    compiled_prompt_json: Dict[str, Any]
    input_schema_json:    Dict[str, Any]
    output_schema_json:   Dict[str, Any]
    guardrails_json:      Dict[str, Any]
    change_summary:       Optional[str]
    created_by:           str
    created_at:           str
    approved_by:          Optional[str]
    approved_at:          Optional[str]


# ─── Helpers ────────────────────────────────────────────────────────────────

VERSION_SELECT_COLS = """
    version_id, prompt_id, version_number, status,
    model_policy_json, compiled_prompt_json,
    input_schema_json, output_schema_json, guardrails_json,
    change_summary, created_by, created_at, approved_by, approved_at
"""


def _row_to_version_dict(row) -> Dict[str, Any]:
    """Convert a prompt_versions row tuple into a JSON-friendly dict."""
    return {
        "version_id":           str(row[0]),
        "prompt_id":            str(row[1]),
        "version_number":       row[2],
        "status":               row[3],
        "model_policy_json":    row[4] or {},
        "compiled_prompt_json": row[5] or {},
        "input_schema_json":    row[6] or {},
        "output_schema_json":   row[7] or {},
        "guardrails_json":      row[8] or {},
        "change_summary":       row[9],
        "created_by":           row[10],
        "created_at":           row[11].isoformat() if row[11] else None,
        "approved_by":          row[12],
        "approved_at":          row[13].isoformat() if row[13] else None,
    }


async def _build_compiled_snapshot(conn, prompt_id: str) -> Dict[str, Any]:
    """
    Build a JSON snapshot of the prompt's current blocks + inputs +
    context bindings. Stored on the version row so we always know exactly
    what was published, even if blocks are later edited or deleted.
    """
    # Blocks
    result = await conn.execute(text("""
        SELECT block_id, block_type, sequence_no, title, content,
               variables_json, is_required, metadata_json
        FROM prompt_builder.prompt_blocks
        WHERE prompt_id = :pid
        ORDER BY sequence_no ASC
    """), {"pid": prompt_id})
    blocks = [
        {
            "block_id":       str(r[0]),
            "block_type":     r[1],
            "sequence_no":    r[2],
            "title":          r[3],
            "content":        r[4],
            "variables_json": r[5] or {},
            "is_required":    r[6],
            "metadata_json":  r[7] or {},
        }
        for r in result.fetchall()
    ]

    # Inputs
    result = await conn.execute(text("""
        SELECT input_id, name, label, type, required, default_value,
               validation_json, description, sensitive_classification
        FROM prompt_builder.prompt_inputs
        WHERE prompt_id = :pid
        ORDER BY name ASC
    """), {"pid": prompt_id})
    inputs = [
        {
            "input_id":                  str(r[0]),
            "name":                      r[1],
            "label":                     r[2],
            "type":                      r[3],
            "required":                  r[4],
            "default_value":             r[5],
            "validation_json":           r[6] or {},
            "description":               r[7],
            "sensitive_classification":  r[8],
        }
        for r in result.fetchall()
    ]

    # Context bindings
    result = await conn.execute(text("""
        SELECT binding_id, name, source_type, datasource_id, semantic_entity,
               field_list_json, filter_json, retrieval_policy_json,
               max_records, metadata_json
        FROM prompt_builder.prompt_context_bindings
        WHERE prompt_id = :pid
        ORDER BY name ASC
    """), {"pid": prompt_id})
    bindings = [
        {
            "binding_id":             str(r[0]),
            "name":                   r[1],
            "source_type":            r[2],
            "datasource_id":          r[3],
            "semantic_entity":        r[4],
            "field_list_json":        r[5] or [],
            "filter_json":            r[6] or {},
            "retrieval_policy_json":  r[7] or {},
            "max_records":            r[8],
            "metadata_json":          r[9] or {},
        }
        for r in result.fetchall()
    ]

    return {
        "blocks":           blocks,
        "inputs":           inputs,
        "context_bindings": bindings,
    }


# =============================================================================
# GET /prompts/{id}/versions  — list all versions
# =============================================================================

@router.get("/{prompt_id}/versions", response_model=List[PromptVersionResponse])
async def list_prompt_versions(
    prompt_id: str,
    request: Request,
) -> List[PromptVersionResponse]:
    """List all versions of a prompt, newest first."""
    engine = get_engine(request)

    async with engine.connect() as conn:
        await _ensure_prompt_exists(conn, prompt_id)

        result = await conn.execute(text(f"""
            SELECT {VERSION_SELECT_COLS}
            FROM prompt_builder.prompt_versions
            WHERE prompt_id = :pid
            ORDER BY version_number DESC
        """), {"pid": prompt_id})
        rows = result.fetchall()

    return [PromptVersionResponse(**_row_to_version_dict(r)) for r in rows]


# =============================================================================
# POST /prompts/{id}/versions  — create immutable snapshot from current state
# =============================================================================

@router.post("/{prompt_id}/versions",
             status_code=status.HTTP_201_CREATED,
             response_model=PromptVersionResponse)
async def create_prompt_version(
    prompt_id: str,
    payload: PromptVersionRequest,
    request: Request,
    user: str = Depends(get_current_user),
) -> PromptVersionResponse:
    """
    Create a new draft version snapshot from the current state of the prompt.

    The snapshot captures:
      - All blocks (from prompt_blocks)
      - All inputs (from prompt_inputs)
      - All context bindings (from prompt_context_bindings)
      - Latest schema & guardrails (carried forward from existing draft if any)

    The created version starts in 'draft' status. To make it production-active,
    call POST /prompts/{id}/publish afterwards.
    """
    engine = get_engine(request)

    async with engine.begin() as conn:
        await _ensure_prompt_exists(conn, prompt_id)

        # 1) Compute next version_number
        result = await conn.execute(text("""
            SELECT COALESCE(MAX(version_number), 0) + 1
            FROM prompt_builder.prompt_versions
            WHERE prompt_id = :pid
        """), {"pid": prompt_id})
        next_version_number = result.fetchone()[0]

        # 2) Carry forward schema/guardrails from latest existing version
        result = await conn.execute(text("""
            SELECT input_schema_json, output_schema_json, guardrails_json
            FROM prompt_builder.prompt_versions
            WHERE prompt_id = :pid
            ORDER BY version_number DESC
            LIMIT 1
        """), {"pid": prompt_id})
        prev = result.fetchone()
        input_schema  = prev[0] if prev else {}
        output_schema = prev[1] if prev else {}
        guardrails    = prev[2] if prev else {}

        # 3) Build snapshot of blocks/inputs/bindings
        snapshot = await _build_compiled_snapshot(conn, prompt_id)

        # 4) Insert new version
        version_id = str(uuid.uuid4())
        await conn.execute(text("""
            INSERT INTO prompt_builder.prompt_versions (
                version_id, prompt_id, version_number, status,
                model_policy_json, compiled_prompt_json,
                input_schema_json, output_schema_json, guardrails_json,
                change_summary, created_by, created_at
            ) VALUES (
                :vid, :pid, :vnum, 'draft',
                :policy, :compiled,
                :input_schema, :output_schema, :guardrails,
                :summary, :user, NOW()
            )
        """), {
            "vid":           version_id,
            "pid":           prompt_id,
            "vnum":          next_version_number,
            "policy":        json.dumps(payload.model_policy_json or {}),
            "compiled":      json.dumps(snapshot),
            "input_schema":  json.dumps(input_schema or {}),
            "output_schema": json.dumps(output_schema or {}),
            "guardrails":    json.dumps(guardrails or {}),
            "summary":       payload.change_summary,
            "user":          user,
        })

        # 5) Audit
        await _insert_generic_audit(
            conn, "prompt", prompt_id, "version_created", user,
            f"Created snapshot v{next_version_number}",
            {
                "version_id":     version_id,
                "version_number": next_version_number,
                "block_count":    len(snapshot["blocks"]),
                "input_count":    len(snapshot["inputs"]),
                "binding_count":  len(snapshot["context_bindings"]),
                "change_summary": payload.change_summary,
            },
        )

        # 6) Reload the new version to return
        result = await conn.execute(
            text(f"SELECT {VERSION_SELECT_COLS} FROM prompt_builder.prompt_versions WHERE version_id = :vid"),
            {"vid": version_id},
        )
        row = result.fetchone()

    logger.info(f"Version created: prompt={prompt_id} v{next_version_number} by {user}")
    return PromptVersionResponse(**_row_to_version_dict(row))


# =============================================================================
# POST /prompts/{id}/publish  — promote a version to 'published'
# =============================================================================

# =============================================================================
# FIND THIS FUNCTION in your prompts.py:
#
#   @router.post("/{prompt_id}/publish", response_model=PromptVersionResponse)
#   async def publish_prompt(
#
# REPLACE THE ENTIRE FUNCTION with this one below.
# Everything else in the file stays the same.
# =============================================================================

@router.post("/{prompt_id}/publish", response_model=PromptVersionResponse)
async def publish_prompt(
    prompt_id: str,
    payload: PromptPublishRequest,
    request: Request,
    user: str = Depends(get_current_user),
) -> PromptVersionResponse:
    """
    Publish a version.

    NEW BEHAVIOUR:
      - If no draft version exists → AUTO-CREATE one from current state
      - Then publish it immediately
      - ONE click = snapshot + publish ✅

    If `version_number` is given, publish that specific version.
    Otherwise: find latest draft → if none → auto-create → publish.

    Side effects (one transaction):
      1. Auto-create draft version if none exists
      2. Deprecate currently published version
      3. Mark target version as 'published'
      4. Update prompt status to 'published'
      5. Write audit event
    """
    engine = get_engine(request)

    async with engine.begin() as conn:
        await _ensure_prompt_exists(conn, prompt_id)

        # ── Step 1: Resolve which version to publish ──────────────────────
        if payload.version_number is not None:
            # Publish a specific version number
            result = await conn.execute(text("""
                SELECT version_id, version_number, status
                FROM prompt_builder.prompt_versions
                WHERE prompt_id = :pid AND version_number = :vnum
                LIMIT 1
            """), {"pid": prompt_id, "vnum": payload.version_number})
            target = result.fetchone()
            if target is None:
                raise HTTPException(
                    status_code=404,
                    detail=f"Version {payload.version_number} not found for prompt {prompt_id}"
                )
        else:
            # No version specified → find latest draft
            result = await conn.execute(text("""
                SELECT version_id, version_number, status
                FROM prompt_builder.prompt_versions
                WHERE prompt_id = :pid AND status = 'draft'
                ORDER BY version_number DESC
                LIMIT 1
            """), {"pid": prompt_id})
            target = result.fetchone()

            # ── AUTO-CREATE SNAPSHOT IF NO DRAFT EXISTS ───────────────────
            if target is None:
                logger.info(
                    f"No draft version found for prompt {prompt_id} — "
                    f"auto-creating snapshot before publish"
                )

                # Get next version number
                result = await conn.execute(text("""
                    SELECT COALESCE(MAX(version_number), 0) + 1
                    FROM prompt_builder.prompt_versions
                    WHERE prompt_id = :pid
                """), {"pid": prompt_id})
                next_vnum = result.fetchone()[0]

                # Carry forward schema/guardrails from latest existing version
                result = await conn.execute(text("""
                    SELECT input_schema_json, output_schema_json, guardrails_json
                    FROM prompt_builder.prompt_versions
                    WHERE prompt_id = :pid
                    ORDER BY version_number DESC
                    LIMIT 1
                """), {"pid": prompt_id})
                prev = result.fetchone()
                input_schema  = prev[0] if prev else {}
                output_schema = prev[1] if prev else {}
                guardrails    = prev[2] if prev else {}

                # Build snapshot of current blocks/inputs/bindings
                snapshot = await _build_compiled_snapshot(conn, prompt_id)

                # Insert new draft version
                new_version_id = str(uuid.uuid4())
                await conn.execute(text("""
                    INSERT INTO prompt_builder.prompt_versions (
                        version_id, prompt_id, version_number, status,
                        model_policy_json, compiled_prompt_json,
                        input_schema_json, output_schema_json, guardrails_json,
                        change_summary, created_by, created_at
                    ) VALUES (
                        :vid, :pid, :vnum, 'draft',
                        :policy, :compiled,
                        :input_schema, :output_schema, :guardrails,
                        :summary, :user, NOW()
                    )
                """), {
                    "vid":           new_version_id,
                    "pid":           prompt_id,
                    "vnum":          next_vnum,
                    "policy":        json.dumps({}),
                    "compiled":      json.dumps(snapshot),
                    "input_schema":  json.dumps(input_schema if isinstance(input_schema, dict) else {}),
                    "output_schema": json.dumps(output_schema if isinstance(output_schema, dict) else {}),
                    "guardrails":    json.dumps(guardrails if isinstance(guardrails, dict) else {}),
                    "summary":       payload.change_summary or f"Auto-snapshot v{next_vnum}",
                    "user":          user,
                })

                logger.info(f"Auto-created snapshot v{next_vnum} for prompt {prompt_id}")

                # Re-fetch the newly created version as target
                result = await conn.execute(text("""
                    SELECT version_id, version_number, status
                    FROM prompt_builder.prompt_versions
                    WHERE version_id = :vid
                """), {"vid": new_version_id})
                target = result.fetchone()

        # ── Step 2: Validate target ───────────────────────────────────────
        target_version_id     = str(target[0])
        target_version_number = target[1]
        target_status         = target[2]

        if target_status == "published":
            raise HTTPException(
                status_code=400,
                detail=f"Version {target_version_number} is already published",
            )

        # ── Step 3: Deprecate currently published version ─────────────────
        await conn.execute(text("""
            UPDATE prompt_builder.prompt_versions
            SET status = 'deprecated'
            WHERE prompt_id = :pid AND status = 'published'
        """), {"pid": prompt_id})

        # ── Step 4: Publish the target version ────────────────────────────
        await conn.execute(text("""
            UPDATE prompt_builder.prompt_versions
            SET status         = 'published',
                approved_by    = :user,
                approved_at    = NOW(),
                change_summary = COALESCE(:summary, change_summary)
            WHERE version_id = :vid
        """), {
            "user":    user,
            "summary": payload.change_summary,
            "vid":     target_version_id,
        })

        # ── Step 5: Update prompt status ──────────────────────────────────
        await conn.execute(text("""
            UPDATE prompt_builder.prompts
            SET status = 'published', updated_at = NOW()
            WHERE prompt_id = :pid
        """), {"pid": prompt_id})

        # ── Step 6: Audit ─────────────────────────────────────────────────
        await _insert_generic_audit(
            conn, "prompt", prompt_id, "publish", user,
            f"Published v{target_version_number}",
            {
                "version_id":     target_version_id,
                "version_number": target_version_number,
                "change_summary": payload.change_summary,
            },
        )

        # ── Step 7: Reload row to return ──────────────────────────────────
        result = await conn.execute(
            text(f"SELECT {VERSION_SELECT_COLS} FROM prompt_builder.prompt_versions WHERE version_id = :vid"),
            {"vid": target_version_id},
        )
        row = result.fetchone()

    logger.info(f"Version published: prompt={prompt_id} v{target_version_number} by {user}")
    return PromptVersionResponse(**_row_to_version_dict(row))

# =============================================================================
# POST /prompts/{id}/rollback  — re-publish an older version
# =============================================================================

@router.post("/{prompt_id}/rollback", response_model=PromptVersionResponse)
async def rollback_prompt(
    prompt_id: str,
    payload: PromptRollbackRequest,
    request: Request,
    user: str = Depends(get_current_user),
) -> PromptVersionResponse:
    """
    Roll back to a previous version.

    Steps (one transaction):
      1. Find the target version by version_number.
      2. Deprecate the current published version.
      3. Mark the target version as 'published'.
      4. Update parent prompt status.
      5. Audit.
    """
    engine = get_engine(request)

    async with engine.begin() as conn:
        await _ensure_prompt_exists(conn, prompt_id)

        # 1) Look up target
        result = await conn.execute(text("""
            SELECT version_id, version_number, status
            FROM prompt_builder.prompt_versions
            WHERE prompt_id = :pid AND version_number = :vnum
            LIMIT 1
        """), {"pid": prompt_id, "vnum": payload.version_number})
        target = result.fetchone()
        if target is None:
            raise HTTPException(
                status_code=404,
                detail=f"Version {payload.version_number} not found for prompt {prompt_id}"
            )

        target_version_id = str(target[0])
        target_status     = target[2]

        if target_status == "published":
            raise HTTPException(
                status_code=400,
                detail=f"Version {payload.version_number} is already the published version. Nothing to roll back.",
            )

        # 2) Deprecate currently published
        await conn.execute(text("""
            UPDATE prompt_builder.prompt_versions
            SET status = 'deprecated'
            WHERE prompt_id = :pid AND status = 'published'
        """), {"pid": prompt_id})

        # 3) Re-publish the target
        await conn.execute(text("""
            UPDATE prompt_builder.prompt_versions
            SET status         = 'published',
                approved_by    = :user,
                approved_at    = NOW(),
                change_summary = COALESCE(:summary, change_summary)
            WHERE version_id = :vid
        """), {
            "user":    user,
            "summary": payload.change_summary or f"Rolled back to v{payload.version_number}",
            "vid":     target_version_id,
        })

        # 4) Make sure prompt-level status reflects published state
        await conn.execute(text("""
            UPDATE prompt_builder.prompts
            SET status = 'published', updated_at = NOW()
            WHERE prompt_id = :pid
        """), {"pid": prompt_id})

        # 5) Audit
        await _insert_generic_audit(
            conn, "prompt", prompt_id, "rollback", user,
            f"Rolled back to v{payload.version_number}",
            {
                "version_id":     target_version_id,
                "version_number": payload.version_number,
                "change_summary": payload.change_summary,
            },
        )

        # 6) Reload row
        result = await conn.execute(
            text(f"SELECT {VERSION_SELECT_COLS} FROM prompt_builder.prompt_versions WHERE version_id = :vid"),
            {"vid": target_version_id},
        )
        row = result.fetchone()

    logger.info(f"Version rolled back: prompt={prompt_id} → v{payload.version_number} by {user}")
    return PromptVersionResponse(**_row_to_version_dict(row))
# =============================================================================
# PB-010: PROMPT TESTING LAB — test cases, run, evaluate, history
# =============================================================================
#
# APPEND THIS TO THE BOTTOM OF: backend/src/api/prompts.py
#
# Adds 7 endpoints for the testing lab:
#
#   GET    /prompts/{id}/test-cases               List test cases
#   POST   /prompts/{id}/test-cases               Create test case
#   PUT    /prompts/{id}/test-cases/{test_id}     Update test case
#   DELETE /prompts/{id}/test-cases/{test_id}     Delete test case
#
#   POST   /prompts/{id}/test                     Run one test (saved or ad hoc)
#   POST   /prompts/{id}/evaluate                 Run ALL test cases (regression)
#   GET    /prompts/{id}/evaluations              History of past evaluations
#
# CHECK TYPES SUPPORTED in `expected_checks_json`:
#   { "type": "json_equals",  "path": "eligible",      "value": true }
#   { "type": "contains",     "value": "Loan is closed" }
#   { "type": "json_path_exists", "path": "reason" }
#   { "type": "regex",        "value": "^LN-\\d+" }
# =============================================================================


# ─── Pydantic models for test cases & evaluations ───────────────────────────

class PromptTestCaseCreateRequest(BaseModel):
    name:                  str = Field(..., min_length=1, max_length=200)
    description:           Optional[str] = None
    runtime_params_json:   Dict[str, Any] = Field(default_factory=dict)
    expected_output_json:  Dict[str, Any] = Field(default_factory=dict)
    expected_checks_json:  List[Dict[str, Any]] = Field(default_factory=list)


class PromptTestCaseUpdateRequest(BaseModel):
    name:                  Optional[str] = Field(default=None, min_length=1, max_length=200)
    description:           Optional[str] = None
    runtime_params_json:   Optional[Dict[str, Any]] = None
    expected_output_json:  Optional[Dict[str, Any]] = None
    expected_checks_json:  Optional[List[Dict[str, Any]]] = None


class PromptTestCaseResponse(BaseModel):
    test_id:               str
    prompt_id:             str
    name:                  str
    description:           Optional[str] = None
    runtime_params_json:   Dict[str, Any]
    expected_output_json:  Dict[str, Any]
    expected_checks_json:  List[Dict[str, Any]]
    created_by:            str
    created_at:            str


class PromptTestRunRequest(BaseModel):
    """Run a single test — either by saved test_id OR by ad-hoc runtime_params."""
    test_id:              Optional[str] = None
    runtime_params:       Optional[Dict[str, Any]] = None
    expected_checks_json: Optional[List[Dict[str, Any]]] = None
    version:              Optional[str] = "latest"
    allow_draft:          bool = True


class PromptTestRunResponse(BaseModel):
    evaluation_id:   str
    test_id:         Optional[str] = None
    prompt_id:       str
    run_id:          Optional[str] = None
    passed:          bool
    score_json:      Dict[str, Any]
    output:          Optional[Any] = None
    error_message:   Optional[str] = None


# ─── Helpers ────────────────────────────────────────────────────────────────

TEST_CASE_SELECT_COLS = """
    test_id, prompt_id, name, description,
    runtime_params_json, expected_output_json, expected_checks_json,
    created_by, created_at
"""


def _row_to_test_case_dict(row) -> Dict[str, Any]:
    """Convert a prompt_test_cases row tuple to a JSON-friendly dict."""
    return {
        "test_id":               str(row[0]),
        "prompt_id":             str(row[1]),
        "name":                  row[2],
        "description":           row[3],
        "runtime_params_json":   row[4] or {},
        "expected_output_json":  row[5] or {},
        "expected_checks_json":  row[6] or [],
        "created_by":            row[7],
        "created_at":            row[8].isoformat() if row[8] else None,
    }


def _resolve_json_path(value: Any, dotted_path: str) -> Any:
    """
    Walk a dotted path through nested dicts/lists.
    "user.name"        → value["user"]["name"]
    "items.0.title"    → value["items"][0]["title"]
    Returns None if the path can't be resolved.
    """
    if not dotted_path:
        return value
    current = value
    for part in dotted_path.split("."):
        if current is None:
            return None
        if isinstance(current, dict):
            current = current.get(part)
        elif isinstance(current, list):
            try:
                current = current[int(part)]
            except (ValueError, IndexError):
                return None
        else:
            return None
    return current


def _evaluate_checks(
    output: Any,
    raw_output: Optional[str],
    expected_output_json: Optional[Dict[str, Any]],
    expected_checks_json: Optional[List[Dict[str, Any]]],
) -> Dict[str, Any]:
    """
    Compare LLM output against expected criteria.

    Returns a score dict:
        {
          "passed":       bool,
          "checks":       [ { "type":..., "passed":..., "details":... }, ... ],
          "summary":      "8/10 checks passed",
          "total_checks": int,
          "passed_count": int,
        }
    """
    checks_results: List[Dict[str, Any]] = []
    expected_checks_json = expected_checks_json or []
    expected_output_json = expected_output_json or {}

    # ─── 1. expected_output_json — every key in here must match ──────────
    for key, expected_value in expected_output_json.items():
        actual_value = _resolve_json_path(output, key) if isinstance(output, (dict, list)) else None
        passed = (actual_value == expected_value)
        checks_results.append({
            "type":           "expected_output",
            "path":           key,
            "expected":       expected_value,
            "actual":         actual_value,
            "passed":         passed,
            "details":        "match" if passed else f"expected {expected_value!r}, got {actual_value!r}",
        })

    # ─── 2. expected_checks_json — explicit per-check assertions ─────────
    for check in expected_checks_json:
        if not isinstance(check, dict):
            checks_results.append({
                "type":    "invalid_check",
                "passed":  False,
                "details": f"Check must be a dict, got {type(check).__name__}",
            })
            continue

        check_type = (check.get("type") or "").lower().strip()
        result = {
            "type":   check_type,
            "passed": False,
            "details": "",
        }

        try:
            if check_type == "json_equals":
                path     = check.get("path", "")
                expected = check.get("value")
                actual   = _resolve_json_path(output, path)
                result["path"]     = path
                result["expected"] = expected
                result["actual"]   = actual
                result["passed"]   = (actual == expected)
                result["details"]  = "match" if result["passed"] else f"got {actual!r}"

            elif check_type == "json_path_exists":
                path = check.get("path", "")
                actual = _resolve_json_path(output, path)
                result["path"]    = path
                result["passed"]  = actual is not None
                result["details"] = "exists" if result["passed"] else "path not found"

            elif check_type == "contains":
                needle = check.get("value", "")
                haystack = raw_output or json.dumps(output, default=str) if output is not None else ""
                result["needle"]  = needle
                result["passed"]  = (str(needle) in str(haystack))
                result["details"] = "found" if result["passed"] else "not found in output"

            elif check_type == "regex":
                pattern = check.get("value", "")
                haystack = raw_output or json.dumps(output, default=str) if output is not None else ""
                try:
                    matched = re.search(pattern, str(haystack)) is not None
                except re.error as rex:
                    result["details"] = f"invalid regex: {rex}"
                    result["passed"]  = False
                else:
                    result["pattern"] = pattern
                    result["passed"]  = matched
                    result["details"] = "matched" if matched else "no match"

            else:
                result["details"] = f"unsupported check type '{check_type}'"
                result["passed"]  = False

        except Exception as exc:
            result["passed"]  = False
            result["details"] = f"check error: {exc}"

        checks_results.append(result)

    total  = len(checks_results)
    passed = sum(1 for c in checks_results if c.get("passed"))

    return {
        "passed":       (total > 0 and passed == total) if total > 0 else True,
        "total_checks": total,
        "passed_count": passed,
        "summary":      f"{passed}/{total} checks passed" if total > 0 else "no checks defined",
        "checks":       checks_results,
    }


async def _save_evaluation(
    conn,
    prompt_id: str,
    test_id: Optional[str],
    run_id: Optional[str],
    passed: bool,
    score: Dict[str, Any],
) -> str:
    """Insert one row into prompt_evaluations and return the evaluation_id."""
    evaluation_id = str(uuid.uuid4())
    await conn.execute(text("""
        INSERT INTO prompt_builder.prompt_evaluations (
            evaluation_id, prompt_id, run_id, test_id,
            score_json, passed, created_at
        ) VALUES (
            :eid, :pid, :rid, :tid,
            :score, :passed, NOW()
        )
    """), {
        "eid":    evaluation_id,
        "pid":    prompt_id,
        "rid":    run_id,
        "tid":    test_id,
        "score":  json.dumps(score, default=str),
        "passed": passed,
    })
    return evaluation_id


# Need re for "regex" check type
import re


# =============================================================================
# CRUD: TEST CASES
# =============================================================================

# ── GET /prompts/{id}/test-cases ────────────────────────────────────────────

@router.get("/{prompt_id}/test-cases", response_model=List[PromptTestCaseResponse])
async def list_prompt_test_cases(
    prompt_id: str,
    request: Request,
) -> List[PromptTestCaseResponse]:
    """List all test cases for a prompt."""
    engine = get_engine(request)

    async with engine.connect() as conn:
        await _ensure_prompt_exists(conn, prompt_id)

        result = await conn.execute(text(f"""
            SELECT {TEST_CASE_SELECT_COLS}
            FROM prompt_builder.prompt_test_cases
            WHERE prompt_id = :pid
            ORDER BY created_at DESC
        """), {"pid": prompt_id})
        rows = result.fetchall()

    return [PromptTestCaseResponse(**_row_to_test_case_dict(r)) for r in rows]


# ── POST /prompts/{id}/test-cases ───────────────────────────────────────────

@router.post("/{prompt_id}/test-cases",
             status_code=status.HTTP_201_CREATED,
             response_model=PromptTestCaseResponse)
async def create_prompt_test_case(
    prompt_id: str,
    payload: PromptTestCaseCreateRequest,
    request: Request,
    user: str = Depends(get_current_user),
) -> PromptTestCaseResponse:
    """Save a new test case (golden example) for a prompt."""
    engine = get_engine(request)
    test_id = str(uuid.uuid4())

    async with engine.begin() as conn:
        await _ensure_prompt_exists(conn, prompt_id)

        await conn.execute(text("""
            INSERT INTO prompt_builder.prompt_test_cases (
                test_id, prompt_id, name, description,
                runtime_params_json, expected_output_json, expected_checks_json,
                created_by, created_at
            ) VALUES (
                :tid, :pid, :name, :desc,
                :params, :expected, :checks,
                :user, NOW()
            )
        """), {
            "tid":      test_id,
            "pid":      prompt_id,
            "name":     payload.name,
            "desc":     payload.description,
            "params":   json.dumps(payload.runtime_params_json or {}),
            "expected": json.dumps(payload.expected_output_json or {}),
            "checks":   json.dumps(payload.expected_checks_json or []),
            "user":     user,
        })

        await _insert_generic_audit(
            conn, "prompt", prompt_id, "test_case_created", user,
            f"Test case '{payload.name}' created",
            {"test_id": test_id},
        )

        result = await conn.execute(
            text(f"SELECT {TEST_CASE_SELECT_COLS} FROM prompt_builder.prompt_test_cases WHERE test_id = :tid"),
            {"tid": test_id},
        )
        row = result.fetchone()

    logger.info(f"Test case created: prompt={prompt_id} test_id={test_id} by {user}")
    return PromptTestCaseResponse(**_row_to_test_case_dict(row))


# ── PUT /prompts/{id}/test-cases/{test_id} ──────────────────────────────────

@router.put("/{prompt_id}/test-cases/{test_id}", response_model=PromptTestCaseResponse)
async def update_prompt_test_case(
    prompt_id: str,
    test_id: str,
    payload: PromptTestCaseUpdateRequest,
    request: Request,
    user: str = Depends(get_current_user),
) -> PromptTestCaseResponse:
    """Update an existing test case. Only fields provided are changed."""
    engine = get_engine(request)

    set_parts: List[str] = []
    params: Dict[str, Any] = {"tid": test_id, "pid": prompt_id}

    if payload.name is not None:
        set_parts.append("name = :name");                       params["name"] = payload.name
    if payload.description is not None:
        set_parts.append("description = :description");         params["description"] = payload.description
    if payload.runtime_params_json is not None:
        set_parts.append("runtime_params_json = :params");      params["params"] = json.dumps(payload.runtime_params_json)
    if payload.expected_output_json is not None:
        set_parts.append("expected_output_json = :expected");   params["expected"] = json.dumps(payload.expected_output_json)
    if payload.expected_checks_json is not None:
        set_parts.append("expected_checks_json = :checks");     params["checks"] = json.dumps(payload.expected_checks_json)

    if not set_parts:
        raise HTTPException(status_code=400, detail="No fields provided to update")

    set_sql = ", ".join(set_parts)

    async with engine.begin() as conn:
        check = await conn.execute(text("""
            SELECT 1 FROM prompt_builder.prompt_test_cases
            WHERE test_id = :tid AND prompt_id = :pid
        """), {"tid": test_id, "pid": prompt_id})
        if check.fetchone() is None:
            raise HTTPException(status_code=404, detail=f"Test case {test_id} not found for prompt {prompt_id}")

        await conn.execute(
            text(f"""
                UPDATE prompt_builder.prompt_test_cases
                SET {set_sql}
                WHERE test_id = :tid AND prompt_id = :pid
            """),
            params,
        )

        await _insert_generic_audit(
            conn, "prompt", prompt_id, "test_case_updated", user,
            f"Test case {test_id} updated",
            {"test_id": test_id, "fields": [k for k in params if k not in ("tid", "pid")]},
        )

        result = await conn.execute(
            text(f"SELECT {TEST_CASE_SELECT_COLS} FROM prompt_builder.prompt_test_cases WHERE test_id = :tid"),
            {"tid": test_id},
        )
        row = result.fetchone()

    logger.info(f"Test case updated: test_id={test_id} by {user}")
    return PromptTestCaseResponse(**_row_to_test_case_dict(row))


# ── DELETE /prompts/{id}/test-cases/{test_id} ───────────────────────────────

@router.delete("/{prompt_id}/test-cases/{test_id}", status_code=status.HTTP_200_OK)
async def delete_prompt_test_case(
    prompt_id: str,
    test_id: str,
    request: Request,
    user: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """Hard delete a test case. (Test cases don't need archiving.)"""
    engine = get_engine(request)

    async with engine.begin() as conn:
        check = await conn.execute(text("""
            SELECT name FROM prompt_builder.prompt_test_cases
            WHERE test_id = :tid AND prompt_id = :pid
        """), {"tid": test_id, "pid": prompt_id})
        existing = check.fetchone()
        if existing is None:
            raise HTTPException(status_code=404, detail=f"Test case {test_id} not found")

        await conn.execute(
            text("DELETE FROM prompt_builder.prompt_test_cases WHERE test_id = :tid"),
            {"tid": test_id},
        )

        await _insert_generic_audit(
            conn, "prompt", prompt_id, "test_case_deleted", user,
            f"Test case '{existing[0]}' deleted",
            {"test_id": test_id},
        )

    logger.info(f"Test case deleted: test_id={test_id} by {user}")
    return {
        "status":  "deleted",
        "test_id": test_id,
        "message": f"Test case {test_id} deleted",
    }


# =============================================================================
# RUN: SINGLE TEST
# =============================================================================

@router.post("/{prompt_id}/test", response_model=PromptTestRunResponse)
async def run_prompt_test(
    prompt_id: str,
    payload: PromptTestRunRequest,
    request: Request,
    user: str = Depends(get_current_user),
) -> PromptTestRunResponse:
    """
    Run a single test case OR ad-hoc test.

    Behavior:
      - If test_id is provided, load that saved test case and run it.
      - Otherwise, run an ad-hoc test using runtime_params + expected_checks
        from the request body.

    Always saves the result into prompt_evaluations.
    """
    engine = get_engine(request)

    # ─── 1. Resolve runtime_params + expected_checks ─────────────────────
    async with engine.connect() as conn:
        await _ensure_prompt_exists(conn, prompt_id)

        runtime_params:       Dict[str, Any] = {}
        expected_output_json: Dict[str, Any] = {}
        expected_checks_json: List[Dict[str, Any]] = []

        if payload.test_id:
            result = await conn.execute(text("""
                SELECT runtime_params_json, expected_output_json, expected_checks_json
                FROM prompt_builder.prompt_test_cases
                WHERE test_id = :tid AND prompt_id = :pid
            """), {"tid": payload.test_id, "pid": prompt_id})
            tc = result.fetchone()
            if tc is None:
                raise HTTPException(
                    status_code=404,
                    detail=f"Test case {payload.test_id} not found for prompt {prompt_id}",
                )
            runtime_params       = tc[0] or {}
            expected_output_json = tc[1] or {}
            expected_checks_json = tc[2] or []
        else:
            runtime_params       = payload.runtime_params or {}
            expected_checks_json = payload.expected_checks_json or []

    # ─── 2. Run the prompt via the orchestrator ──────────────────────────
    run_id: Optional[str] = None
    output: Any = None
    raw_output: Optional[str] = None
    error_message: Optional[str] = None

    try:
        result = await run_prompt(
            engine=engine,
            request={
                "prompt_id":       prompt_id,
                "version":         payload.version or "latest",
                "runtime_params":  runtime_params,
                "response_format": "json",
                "allow_draft":     payload.allow_draft,
            },
            actor=user,
        )
        run_id        = result.get("prompt_run_id")
        output        = result.get("output")
        raw_output    = result.get("raw_output")
        error_message = result.get("error_message")
    except _RunError as exc:
        error_message = exc.message
    except Exception as exc:
        logger.exception(f"Test run failed: {exc}")
        error_message = str(exc)

    # ─── 3. Evaluate the output against expectations ─────────────────────
    if error_message:
        score = {
            "passed":       False,
            "total_checks": 0,
            "passed_count": 0,
            "summary":      f"run failed: {error_message}",
            "checks":       [],
        }
        passed = False
    else:
        score = _evaluate_checks(
            output=output,
            raw_output=raw_output,
            expected_output_json=expected_output_json,
            expected_checks_json=expected_checks_json,
        )
        passed = score["passed"]

    # ─── 4. Persist evaluation ───────────────────────────────────────────
    async with engine.begin() as conn:
        evaluation_id = await _save_evaluation(
            conn=conn,
            prompt_id=prompt_id,
            test_id=payload.test_id,
            run_id=run_id,
            passed=passed,
            score=score,
        )

        await _insert_generic_audit(
            conn, "prompt", prompt_id, "test_run", user,
            f"Test {'PASSED' if passed else 'FAILED'} ({score['summary']})",
            {
                "evaluation_id": evaluation_id,
                "test_id":       payload.test_id,
                "run_id":        run_id,
                "passed":        passed,
            },
        )

    logger.info(
        f"Test run: prompt={prompt_id} test_id={payload.test_id} "
        f"passed={passed} ({score['summary']})"
    )
    return PromptTestRunResponse(
        evaluation_id=evaluation_id,
        test_id=payload.test_id,
        prompt_id=prompt_id,
        run_id=run_id,
        passed=passed,
        score_json=score,
        output=output,
        error_message=error_message,
    )


# =============================================================================
# RUN: ALL TESTS (regression sweep)
# =============================================================================

@router.post("/{prompt_id}/evaluate", response_model=Dict[str, Any])
async def evaluate_all_test_cases(
    prompt_id: str,
    request: Request,
    user: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Run EVERY test case for this prompt, return aggregate pass/fail.
    Useful for regression sweeps before publishing a new version.
    """
    engine = get_engine(request)

    async with engine.connect() as conn:
        await _ensure_prompt_exists(conn, prompt_id)

        result = await conn.execute(text("""
            SELECT test_id, name
            FROM prompt_builder.prompt_test_cases
            WHERE prompt_id = :pid
            ORDER BY created_at ASC
        """), {"pid": prompt_id})
        test_cases = [(str(r[0]), r[1]) for r in result.fetchall()]

    if not test_cases:
        return {
            "prompt_id":     prompt_id,
            "total_tests":   0,
            "passed_count":  0,
            "failed_count":  0,
            "summary":       "no test cases defined",
            "results":       [],
        }

    # Run each test sequentially (could parallelize later if needed)
    results: List[Dict[str, Any]] = []
    passed_count = 0

    for test_id, test_name in test_cases:
        try:
            single = await run_prompt_test(
                prompt_id=prompt_id,
                payload=PromptTestRunRequest(test_id=test_id, allow_draft=True),
                request=request,
                user=user,
            )
            results.append({
                "test_id":       test_id,
                "name":          test_name,
                "passed":        single.passed,
                "summary":       single.score_json.get("summary"),
                "evaluation_id": single.evaluation_id,
                "error_message": single.error_message,
            })
            if single.passed:
                passed_count += 1
        except Exception as exc:
            logger.exception(f"Test run failed for {test_id}: {exc}")
            results.append({
                "test_id":       test_id,
                "name":          test_name,
                "passed":        False,
                "summary":       f"error: {exc}",
                "evaluation_id": None,
                "error_message": str(exc),
            })

    total = len(test_cases)
    return {
        "prompt_id":    prompt_id,
        "total_tests":  total,
        "passed_count": passed_count,
        "failed_count": total - passed_count,
        "summary":      f"{passed_count}/{total} test cases passed",
        "results":      results,
    }


# =============================================================================
# GET: EVALUATION HISTORY
# =============================================================================

@router.get("/{prompt_id}/evaluations", response_model=List[Dict[str, Any]])
async def list_prompt_evaluations(
    prompt_id: str,
    request: Request,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    """
    Return recent evaluation history for a prompt.
    Useful for showing 'last 50 test runs' in the UI.
    """
    engine = get_engine(request)

    async with engine.connect() as conn:
        await _ensure_prompt_exists(conn, prompt_id)

        result = await conn.execute(text("""
            SELECT e.evaluation_id, e.prompt_id, e.run_id, e.test_id,
                   e.score_json, e.passed, e.created_at,
                   tc.name AS test_name
            FROM prompt_builder.prompt_evaluations e
            LEFT JOIN prompt_builder.prompt_test_cases tc
              ON tc.test_id = e.test_id
            WHERE e.prompt_id = :pid
            ORDER BY e.created_at DESC
            LIMIT :limit
        """), {"pid": prompt_id, "limit": limit})
        rows = result.fetchall()

    return [
        {
            "evaluation_id": str(r[0]),
            "prompt_id":     str(r[1]),
            "run_id":        str(r[2]) if r[2] else None,
            "test_id":       str(r[3]) if r[3] else None,
            "test_name":     r[7],
            "score_json":    r[4] or {},
            "passed":        r[5],
            "created_at":    r[6].isoformat() if r[6] else None,
        }
        for r in rows
    ]
# =============================================================================
# PB-011: PROMPT → DOCUMENT INTEGRATION
# =============================================================================
#
# APPEND THIS TO THE BOTTOM OF: backend/src/api/prompts.py
#
# Adds the bridge between Prompt Builder and Document Builder:
#
#   POST /v1/prompts/{prompt_id}/generate-document
#
# FLOW:
#   1. Run the prompt via the orchestrator (PB-007).
#   2. Read `document_template_id`, `document_params`, and `output_target`
#      from the prompt's structured output.
#   3. Validate they are present; otherwise return 422.
#   4. Internally call the existing /v1/documents/generate logic to create
#      a render job.
#   5. Audit-link the prompt run to the document job.
#   6. Return prompt_run_id, prompt_output, document_job_id.
#
# This is the killer feature: ONE API call → AI decision + auto-generated PDF.
# =============================================================================


import os
import httpx

# Template Builder base URL — set in .env / docker-compose
_TEMPLATE_BUILDER_URL = os.getenv(
    "TEMPLATE_BUILDER_URL", "http://localhost:10001/v1"
)


# ─── Pydantic models ────────────────────────────────────────────────────────

class PromptGenerateDocumentRequest(BaseModel):
    """
    Request body for /prompts/{id}/generate-document.

    Same fields as PromptRunRequest plus optional document overrides that
    let the caller force a particular template/output even if the prompt's
    own output didn't include those fields.
    """
    version:          Optional[str] = "published"
    locale:           Optional[str] = "en"
    runtime_params:   Dict[str, Any] = Field(default_factory=dict)
    allow_draft:      bool = False
    # Optional caller-side overrides — used only if the prompt's output
    # didn't include them. Lets a caller use a "decision-only" prompt and
    # supply the document target externally.
    override_document_template_id: Optional[str] = None
    override_document_params:      Optional[Dict[str, Any]] = None
    override_output_target:        Optional[str] = None


class PromptGenerateDocumentResponse(BaseModel):
    status:                 str
    prompt_run_id:          str
    prompt_output:          Optional[Any] = None
    document_template_id:   Optional[str] = None
    document_job_id:        Optional[str] = None
    document_status:        Optional[str] = None
    error_message:          Optional[str] = None
    metadata:               Dict[str, Any] = Field(default_factory=dict)


# =============================================================================
# Endpoint
# =============================================================================

@router.post(
    "/{prompt_id}/generate-document",
    response_model=PromptGenerateDocumentResponse,
    status_code=status.HTTP_200_OK,
)
async def generate_document_from_prompt(
    prompt_id: str,
    payload: PromptGenerateDocumentRequest,
    request: Request,
    user: str = Depends(get_current_user),
) -> PromptGenerateDocumentResponse:
    """
    Run a prompt and use its structured output to generate a document.

    Expected prompt output shape (any of these may be omitted if overrides
    are passed in the request body):
        {
          "document_template_id": "<template uuid>",
          "document_params":      { "customer_id": "C1001", ... },
          "output_target":        "pdf"   // optional, defaults to pdf
          ...other fields the prompt produced...
        }

    HTTP code mapping:
      404 — prompt not found
      422 — validation failed OR prompt output missing template_id
      502 — LLM error
      500 — unexpected internal error
    """
    engine = get_engine(request)

    # ─── 1. Run the prompt via orchestrator ──────────────────────────────
    try:
        prompt_result = await run_prompt(
            engine=engine,
            request={
                "prompt_id":       prompt_id,
                "version":         payload.version or "published",
                "locale":          payload.locale or "en",
                "runtime_params":  payload.runtime_params or {},
                "response_format": "json",      # must be JSON for this endpoint
                "allow_draft":     payload.allow_draft,
            },
            actor=user,
        )
    except _RunError as exc:
        raise HTTPException(status_code=exc.http_status, detail=exc.message)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception(f"Prompt run failed in /generate-document: {exc}")
        raise HTTPException(status_code=500, detail=f"Internal error: {exc}")

    if prompt_result.get("status") != "success":
        # Prompt itself failed (LLM error, parse error, etc.)
        raise HTTPException(
            status_code=502,
            detail=f"Prompt run failed: {prompt_result.get('error_message') or 'unknown error'}",
        )

    prompt_run_id = prompt_result.get("prompt_run_id")
    prompt_output = prompt_result.get("output")

    # ─── 2. Extract document fields (with override fallback) ─────────────
    if not isinstance(prompt_output, dict):
        prompt_output_dict: Dict[str, Any] = {}
    else:
        prompt_output_dict = prompt_output

    document_template_id = (
        prompt_output_dict.get("document_template_id")
        or payload.override_document_template_id
    )
    document_params = (
        prompt_output_dict.get("document_params")
        or payload.override_document_params
        or payload.runtime_params      # last-resort: reuse the prompt's runtime_params
        or {}
    )
    output_target = (
        prompt_output_dict.get("output_target")
        or payload.override_output_target
        or "pdf"                       # sensible default
    )

    # ─── 3. Validate we have what we need ────────────────────────────────
    if not document_template_id:
        raise HTTPException(
            status_code=422,
            detail=(
                "Prompt output did not include 'document_template_id' and no override was provided. "
                "Either add document_template_id to the prompt's output schema, or pass "
                "override_document_template_id in the request."
            ),
        )

    if output_target not in ("html", "docx", "pdf", "xlsx", "md"):
        raise HTTPException(
            status_code=422,
            detail=f"Invalid output_target '{output_target}'. Must be one of: html, docx, pdf, xlsx, md.",
        )

    if not isinstance(document_params, dict):
        raise HTTPException(
            status_code=422,
            detail="document_params must be a JSON object (key/value pairs).",
        )

    # ─── 4. Call the existing document generator ─────────────────────────
    doc_job_id: Optional[str] = None
    doc_status: Optional[str] = None
    doc_error:  Optional[str] = None

    try:
        # Call Template Builder API via HTTP (Option 2 — separate services)
        async with httpx.AsyncClient(timeout=90) as client:
            gen_response = await client.post(
                f"{_TEMPLATE_BUILDER_URL}/documents/generate",
                json={
                    "template_id":    document_template_id,
                    "output_target":  output_target,
                    "locale":         payload.locale or "en",
                    "runtime_params": document_params,
                },
                headers={"x-user-id": user},
            )
        if gen_response.status_code not in (200, 201, 202):
            raise HTTPException(
                status_code=gen_response.status_code,
                detail=gen_response.text,
            )
        gen_data = gen_response.json()
        # GenerateResponse has shape: { status, job_id }
        doc_job_id = gen_data.get("job_id")
        doc_status = gen_data.get("status")
    except HTTPException as exc:
        # Surface document API errors back to the caller as a 502 — the prompt
        # ran fine; it's the document side that failed.
        doc_error = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
        logger.warning(f"Document generation failed for prompt_run={prompt_run_id}: {doc_error}")
    except Exception as exc:
        doc_error = str(exc)
        logger.exception(f"Document generation crashed for prompt_run={prompt_run_id}: {exc}")

    # ─── 5. Audit-link the prompt run to the document job ────────────────
    try:
        async with engine.begin() as conn:
            await _insert_generic_audit(
                conn=conn,
                entity_type="prompt",
                entity_id=prompt_id,
                action="prompt_to_document",
                actor=user,
                summary=(
                    f"Prompt → Document: prompt_run={prompt_run_id} "
                    f"→ doc_job={doc_job_id or 'FAILED'}"
                ),
                details={
                    "prompt_run_id":         prompt_run_id,
                    "document_template_id":  document_template_id,
                    "document_job_id":       doc_job_id,
                    "document_status":       doc_status,
                    "document_error":        doc_error,
                    "output_target":         output_target,
                },
            )
    except Exception as exc:
        # Audit failure should not break the main flow
        logger.warning(f"Audit link failed (prompt_run={prompt_run_id}): {exc}")

    # ─── 6. Return combined response ─────────────────────────────────────
    if doc_error and not doc_job_id:
        # Document side failed entirely — return 502 with all info
        raise HTTPException(
            status_code=502,
            detail={
                "message":              "Prompt succeeded but document generation failed",
                "prompt_run_id":        prompt_run_id,
                "prompt_output":        prompt_output,
                "document_template_id": document_template_id,
                "document_error":       doc_error,
            },
        )

    return PromptGenerateDocumentResponse(
        status="success",
        prompt_run_id=prompt_run_id,
        prompt_output=prompt_output,
        document_template_id=document_template_id,
        document_job_id=doc_job_id,
        document_status=doc_status,
        error_message=doc_error,
        metadata={
            "output_target":   output_target,
            "prompt_metadata": prompt_result.get("metadata") or {},
        },
    )
# ADD THIS to backend/src/api/prompts.py
# Place it AFTER the existing /run endpoint (around line 1450)
# This adds GET /prompts/{prompt_id}/runs and GET /prompt-runs/{run_id}

# ── GET /prompts/{prompt_id}/runs ────────────────────────────────────────────

@router.get("/{prompt_id}/runs", response_model=List[Dict[str, Any]])
async def list_prompt_runs(
    prompt_id: str,
    request: Request,
    limit: int = 50,
    status: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """List all runs for a prompt — used by Run History page."""
    engine = get_engine(request)

    async with engine.connect() as conn:
        await _ensure_prompt_exists(conn, prompt_id)

        filters = ["prompt_id = :pid"]
        params: Dict[str, Any] = {"pid": prompt_id, "limit": limit}

        if status:
            filters.append("status = :status")
            params["status"] = status

        where_clause = " AND ".join(filters)

        result = await conn.execute(text(f"""
            SELECT run_id, prompt_id, version_id, status,
                   runtime_params_json, resolved_context_json,
                   output_json, raw_output, error_message,
                   latency_ms, created_by, created_at
            FROM prompt_builder.prompt_runs
            WHERE {where_clause}
            ORDER BY created_at DESC
            LIMIT :limit
        """), params)
        rows = result.fetchall()

    return [
        {
            "run_id":                str(r[0]),
            "prompt_id":             str(r[1]),
            "version_id":            str(r[2]) if r[2] else None,
            "status":                r[3],
            "runtime_params_json":   r[4] or {},
            "resolved_context_json": r[5] or {},
            "output_json":           r[6] or None,
            "raw_output":            r[7],
            "error_message":         r[8],
            "latency_ms":            r[9],
            "created_by":            r[10],
            "created_at":            r[11].isoformat() if r[11] else None,
        }
        for r in rows
    ]


# ── GET /prompt-runs/{run_id} ─────────────────────────────────────────────────
# Note: This needs a SEPARATE router mounted at /v1/prompt-runs
# OR you can add it here and adjust the frontend URL to /prompts/runs/{run_id}
# Easiest: add to the same prompts router with a different path pattern

@router.get("/runs/{run_id}", response_model=Dict[str, Any])
async def get_prompt_run(
    run_id: str,
    request: Request,
) -> Dict[str, Any]:
    """Get a single run by ID with full details."""
    engine = get_engine(request)

    async with engine.connect() as conn:
        result = await conn.execute(text("""
            SELECT run_id, prompt_id, version_id, status,
                   runtime_params_json, resolved_context_json,
                   output_json, raw_output, error_message,
                   latency_ms, created_by, created_at
            FROM prompt_builder.prompt_runs
            WHERE run_id = :rid
        """), {"rid": run_id})
        row = result.fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")

    return {
        "run_id":                str(row[0]),
        "prompt_id":             str(row[1]),
        "version_id":            str(row[2]) if row[2] else None,
        "status":                row[3],
        "runtime_params_json":   row[4] or {},
        "resolved_context_json": row[5] or {},
        "output_json":           row[6] or None,
        "raw_output":            row[7],
        "error_message":         row[8],
        "latency_ms":            row[9],
        "created_by":            row[10],
        "created_at":            row[11].isoformat() if row[11] else None,
    }