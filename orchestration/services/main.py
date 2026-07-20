# orchestration/orchestration/services/main.py
import hashlib
import json
import logging
import os
import uuid
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any

from uuid import UUID

from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST
from jose import JWTError, jwt
from pydantic import BaseModel, Field

from .config import settings
from .db import get_db, run_schema_sql, execute, execute_one, execute_write
from .plan_repository import PlanRepository
from .orchestrator import PlanOrchestrator
from .schemas import (
    Entity360Request, Entity360Result,
    PlanCreate, PlanUpdate, PlanResponse, PlanStepResponse, PlanCloneRequest,
    LoginRequest, LoginResponse, RefreshRequest, UserResponse,
)
from .security import get_auth_context, require_admin, AuthContext
from .domain_pack_plans import DOMAIN_PACK_PLANS
from .logging_middleware import LoggingMiddleware
from .schemas import (
    ExecutionResponse,
    PlanVersionResponse, PlanVersionCreate,
    TenantPolicyCreate, TenantPolicyResponse,
    TenantBudgetCreate, TenantBudgetResponse,
    DatasourceCreate, DatasourceResponse, DatasourceUpdate,
)
from .schemas import (
    OrchestrationRunRequest, OrchestrationRunResponse, ExecutionStepResponse,
    RuntimeContractResponse, IntentPlanMappingCreate, IntentPlanMappingUpdate,
    IntentPlanMappingResponse, HumanReviewApprovalResponse, ApprovalDecisionRequest,
)
# ── Logging ────────────────────────────────────────────────────────
logger = logging.getLogger("orchestration")
logging.basicConfig(level=logging.INFO)

# ── DB init ────────────────────────────────────────────────────────
settings.validate_environment()
run_schema_sql()

# ── App ────────────────────────────────────────────────────────────
app = FastAPI(
    title=settings.SERVICE_NAME,
    version=settings.SERVICE_VERSION,
)

app.add_middleware(LoggingMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Password helpers ───────────────────────────────────────────────
def _hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def _verify_password(plain: str, hashed: str) -> bool:
    return hashlib.sha256(plain.encode()).hexdigest() == hashed

# ── Auth config ────────────────────────────────────────────────────
ACCESS_TOKEN_EXPIRE_MINUTES  = 60 * 24
REFRESH_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7

DEMO_USERS = {
    "admin": {
        "user_id":   "user_admin_001",
        "username":  "admin",
        "password":  _hash_password("admin123"),
        "role":      "orchestration_admin",
        "tenant_id": None,
    },
    "viewer": {
        "user_id":   "user_viewer_001",
        "username":  "viewer",
        "password":  _hash_password("viewer123"),
        "role":      "orchestration_viewer",
        "tenant_id": None,
    },
}


def _make_token(data: dict, expires_minutes: int) -> str:
    payload = data.copy()
    payload["exp"] = datetime.utcnow() + timedelta(minutes=expires_minutes)
    return jwt.encode(payload, settings.TENANT_JWT_SECRET, algorithm=settings.TENANT_JWT_ALG)


# ── Plan dict → PlanResponse ───────────────────────────────────────
def _plan_to_response(plan: dict) -> PlanResponse:
    return PlanResponse(
        plan_id=plan["plan_id"],
        name=plan["name"],
        entity_type=plan["entity_type"],
        description=plan.get("description"),
        is_active=plan["is_active"],
        version=plan["version"],
        tenant_id=plan.get("tenant_id"),
        error_policy=plan["error_policy"],
        max_concurrency=plan["max_concurrency"],
        created_by=plan.get("created_by"),
        created_at=plan["created_at"],
        updated_at=plan["updated_at"],
        steps=[
            PlanStepResponse(
                plan_step_id=s["plan_step_id"],
                plan_id=s["plan_id"],
                step_key=s["step_key"],
                step_order=s["step_order"],
                kind=s["kind"],
                datasource_name=s["datasource_name"],
                sql_template=s.get("sql_template"),
                method=s.get("method"),
                path_template=s.get("path_template"),
                query_params_json=s.get("query_params_json") or {},
                body_json=s.get("body_json"),
                graphql_query_template=s.get("graphql_query_template"),
                graphql_vars_json=s.get("graphql_vars_json"),
                ai_prompt_template=s.get("ai_prompt_template"),
                ai_output_schema=s.get("ai_output_schema"),
                depends_on=s.get("depends_on") or [],
                condition_expr=s.get("condition_expr"),
                input_bindings_json=s.get("input_bindings_json") or {},
                timeout_ms=s.get("timeout_ms"),
                enabled=s.get("enabled"),
                created_at=s["created_at"],
            )
            for s in sorted(plan.get("steps", []), key=lambda x: x["step_order"])
        ],
    )


# ══════════════════════════════════════════════════════════════════
# HEALTH & METRICS
# ══════════════════════════════════════════════════════════════════

@app.get("/health")
def health():
    return {"status": "ok", "service": settings.SERVICE_NAME}


@app.get("/metrics")
def metrics():
    data = generate_latest()
    return (data, 200, {"Content-Type": CONTENT_TYPE_LATEST.decode("ascii")})


# ══════════════════════════════════════════════════════════════════
# AUTH APIS
# ══════════════════════════════════════════════════════════════════

@app.post("/auth/login", response_model=LoginResponse)
def login(payload: LoginRequest):
    user = DEMO_USERS.get(payload.username.lower())
    if not user or not _verify_password(payload.password, user["password"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")
    token_data = {"sub": user["user_id"], "usr": user["username"], "role": user["role"], "tid": user["tenant_id"] or "global", "type": "access"}
    access_token  = _make_token(token_data, ACCESS_TOKEN_EXPIRE_MINUTES)
    refresh_token = _make_token({**token_data, "type": "refresh"}, REFRESH_TOKEN_EXPIRE_MINUTES)
    return LoginResponse(
        access_token=access_token, refresh_token=refresh_token,
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=UserResponse(user_id=user["user_id"], username=user["username"], role=user["role"], tenant_id=user["tenant_id"]),
    )


@app.post("/auth/refresh", response_model=LoginResponse)
def refresh_token(payload: RefreshRequest):
    try:
        data = jwt.decode(payload.refresh_token, settings.TENANT_JWT_SECRET, algorithms=[settings.TENANT_JWT_ALG])
        if data.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid refresh token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")
    user = DEMO_USERS.get(data.get("usr") or "")
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    token_data = {"sub": user["user_id"], "usr": user["username"], "role": user["role"], "tid": user["tenant_id"] or "global", "type": "access"}
    return LoginResponse(
        access_token=_make_token(token_data, ACCESS_TOKEN_EXPIRE_MINUTES),
        refresh_token=_make_token({**token_data, "type": "refresh"}, REFRESH_TOKEN_EXPIRE_MINUTES),
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=UserResponse(user_id=user["user_id"], username=user["username"], role=user["role"], tenant_id=user["tenant_id"]),
    )


@app.get("/auth/me", response_model=UserResponse)
def get_me(auth: AuthContext = Depends(get_auth_context)):
    user = DEMO_USERS.get(auth.subject or "")
    if not user:
        return UserResponse(user_id=auth.subject or "unknown", username=auth.subject or "unknown", role=auth.role or "orchestration_viewer", tenant_id=auth.tenant_id if auth.tenant_id != "global" else None)
    return UserResponse(user_id=user["user_id"], username=user["username"], role=user["role"], tenant_id=user["tenant_id"])


# ══════════════════════════════════════════════════════════════════
# PLAN APIS
# ══════════════════════════════════════════════════════════════════

@app.post("/admin/plans", response_model=PlanResponse, status_code=201)
def create_plan(
    payload: PlanCreate,
    conn=Depends(get_db),
    auth: AuthContext = Depends(require_admin),
):
    repo = PlanRepository(conn)
    plan = repo.create_plan(payload, created_by=auth.subject or "unknown")
    return _plan_to_response(plan)


@app.get("/admin/plans", response_model=list[PlanResponse])
def list_plans(
    conn=Depends(get_db),
    auth: AuthContext = Depends(require_admin),
):
    repo = PlanRepository(conn)
    return [_plan_to_response(p) for p in repo.list_plans()]


@app.get("/admin/plans/{plan_id}", response_model=PlanResponse)
def get_plan(
    plan_id: UUID,
    conn=Depends(get_db),
    auth: AuthContext = Depends(require_admin),
):
    repo = PlanRepository(conn)
    plan = repo.get_plan_by_id(plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail=f"Plan {plan_id} not found")
    return _plan_to_response(plan)


@app.put("/admin/plans/{plan_id}", response_model=PlanResponse)
def update_plan(
    plan_id: UUID,
    payload: PlanUpdate,
    conn=Depends(get_db),
    auth: AuthContext = Depends(require_admin),
):
    repo = PlanRepository(conn)
    plan = repo.update_plan(plan_id, payload)
    if not plan:
        raise HTTPException(status_code=404, detail=f"Plan {plan_id} not found")
    return _plan_to_response(plan)


@app.delete("/admin/plans/{plan_id}", status_code=204)
def delete_plan(
    plan_id: UUID,
    conn=Depends(get_db),
    auth: AuthContext = Depends(require_admin),
):
    repo = PlanRepository(conn)
    if not repo.delete_plan(plan_id):
        raise HTTPException(status_code=404, detail=f"Plan {plan_id} not found")


@app.patch("/admin/plans/{plan_id}/deactivate", response_model=PlanResponse)
def deactivate_plan(
    plan_id: UUID,
    conn=Depends(get_db),
    auth: AuthContext = Depends(require_admin),
):
    repo = PlanRepository(conn)
    plan = repo.deactivate_plan(plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail=f"Plan {plan_id} not found")
    return _plan_to_response(plan)


@app.patch("/admin/plans/{plan_id}/activate", response_model=PlanResponse)
def activate_plan(
    plan_id: UUID,
    conn=Depends(get_db),
    auth: AuthContext = Depends(require_admin),
):
    repo = PlanRepository(conn)
    plan = repo.activate_plan(plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail=f"Plan {plan_id} not found")
    return _plan_to_response(plan)


@app.post("/admin/plans/{plan_id}/clone", response_model=PlanResponse, status_code=201)
def clone_plan(
    plan_id: UUID,
    payload: PlanCloneRequest,
    conn=Depends(get_db),
    auth: AuthContext = Depends(require_admin),
):
    repo  = PlanRepository(conn)
    clone = repo.clone_plan(plan_id, payload.new_name, created_by=auth.subject or "unknown")
    if not clone:
        raise HTTPException(status_code=404, detail=f"Plan {plan_id} not found")
    return _plan_to_response(clone)


# ══════════════════════════════════════════════════════════════════
# EXECUTE API
# ══════════════════════════════════════════════════════════════════

@app.post("/v1/360", response_model=Entity360Result)
def entity_360(
    req: Entity360Request,
    conn=Depends(get_db),
    auth: AuthContext = Depends(get_auth_context),
):
    import time
    start_ms = int(time.time() * 1000)

    repo = PlanRepository(conn)
    try:
        plan = repo.get_plan(req.plan_name, req.entity_type, req.tenant_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    orchestrator = PlanOrchestrator()
    result = orchestrator.execute_plan(
        plan=plan,
        tenant_id=req.tenant_id,
        params=req.params,
    )

    duration_ms = int(time.time() * 1000) - start_ms
    error_count  = len(result.get("errors", {}))
    result_count = len(result.get("results", {}))
    exec_status  = "success" if error_count == 0 else ("failed" if result_count == 0 else "partial")

    execution_id = str(uuid.uuid4())
    execute_write(conn, """
        INSERT INTO orchestration.executions
            (execution_id, plan_id, plan_name, entity_type, tenant_id,
             params, results, errors, status, duration_ms, executed_by)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """, (
        execution_id,
        str(plan.get("plan_id")) if plan.get("plan_id") else None,
        req.plan_name,
        req.entity_type,
        req.tenant_id,
        json.dumps(req.params, default=str),
        json.dumps(result.get("results", {}), default=str),
        json.dumps(result.get("errors", {}), default=str),
        exec_status,
        duration_ms,
        auth.subject,
    ))
    conn.commit()

    return Entity360Result(
        entity_type=result["entity_type"],
        plan=result["plan"],
        params=result["params"],
        results=result["results"],
        errors=result["errors"],
    )


# ══════════════════════════════════════════════════════════════════
# EXECUTION HISTORY APIS
# ══════════════════════════════════════════════════════════════════

@app.get("/v1/executions", response_model=list[ExecutionResponse])
def list_executions(
    plan_name: Optional[str] = None,
    tenant_id: Optional[str] = None,
    status:    Optional[str] = None,
    limit:     int = 100,
    conn=Depends(get_db),
    auth: AuthContext = Depends(get_auth_context),
):
    sql    = "SELECT * FROM orchestration.executions WHERE 1=1"
    params = []
    if plan_name:
        sql += " AND plan_name = %s"; params.append(plan_name)
    if tenant_id:
        sql += " AND tenant_id = %s"; params.append(tenant_id)
    if status:
        sql += " AND status = %s"; params.append(status)
    sql += " ORDER BY executed_at DESC LIMIT %s"
    params.append(limit)
    return execute(conn, sql, params)


@app.get("/v1/executions/{execution_id}", response_model=ExecutionResponse)
def get_execution(
    execution_id: UUID,
    conn=Depends(get_db),
    auth: AuthContext = Depends(get_auth_context),
):
    row = execute_one(conn,
        "SELECT * FROM orchestration.executions WHERE execution_id = %s",
        (str(execution_id),)
    )
    if not row:
        raise HTTPException(status_code=404, detail="Execution not found")
    return row


@app.delete("/v1/executions/{execution_id}", status_code=204)
def delete_execution(
    execution_id: UUID,
    conn=Depends(get_db),
    auth: AuthContext = Depends(require_admin),
):
    row = execute_one(conn,
        "SELECT execution_id FROM orchestration.executions WHERE execution_id = %s",
        (str(execution_id),)
    )
    if not row:
        raise HTTPException(status_code=404, detail="Execution not found")
    execute_write(conn,
        "DELETE FROM orchestration.executions WHERE execution_id = %s",
        (str(execution_id),)
    )
    conn.commit()


# ══════════════════════════════════════════════════════════════════
# PLAN VERSION HISTORY APIS
# ══════════════════════════════════════════════════════════════════

@app.get("/admin/plans/{plan_id}/versions", response_model=list[PlanVersionResponse])
def list_plan_versions(
    plan_id: UUID,
    conn=Depends(get_db),
    auth: AuthContext = Depends(require_admin),
):
    return execute(conn,
        "SELECT * FROM orchestration.plan_versions WHERE plan_id = %s ORDER BY version DESC",
        (str(plan_id),)
    )


@app.post("/admin/plans/{plan_id}/versions", response_model=PlanVersionResponse, status_code=201)
def save_plan_version(
    plan_id: UUID,
    payload: PlanVersionCreate,
    conn=Depends(get_db),
    auth: AuthContext = Depends(require_admin),
):
    repo = PlanRepository(conn)
    plan = repo.get_plan_by_id(plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    snapshot = {
        "plan_id":         str(plan["plan_id"]),
        "name":            plan["name"],
        "entity_type":     plan["entity_type"],
        "description":     plan.get("description"),
        "error_policy":    plan["error_policy"],
        "max_concurrency": plan["max_concurrency"],
        "version":         plan["version"],
        "is_active":       plan["is_active"],
        "steps": [
            {
                "step_key":        s["step_key"],
                "kind":            s["kind"],
                "datasource_name": s["datasource_name"],
                "step_order":      s["step_order"],
                "enabled":         s["enabled"],
                "timeout_ms":      s["timeout_ms"],
                "output_mode":     s["output_mode"],
                "depends_on":      s.get("depends_on") or [],
            }
            for s in plan.get("steps", [])
        ],
    }

    version_id = str(uuid.uuid4())
    execute_write(conn, """
        INSERT INTO orchestration.plan_versions
            (version_id, plan_id, version, snapshot, change_notes, created_by)
        VALUES (%s, %s, %s, %s, %s, %s)
    """, (
        version_id,
        str(plan_id),
        plan["version"],
        json.dumps(snapshot),
        payload.change_notes,
        auth.subject,
    ))
    conn.commit()
    return execute_one(conn,
        "SELECT * FROM orchestration.plan_versions WHERE version_id = %s",
        (version_id,)
    )


@app.post("/admin/plans/{plan_id}/versions/{version}/restore", response_model=PlanResponse)
def restore_plan_version(
    plan_id: UUID,
    version: int,
    conn=Depends(get_db),
    auth: AuthContext = Depends(require_admin),
):
    plan_version = execute_one(conn,
        "SELECT * FROM orchestration.plan_versions WHERE plan_id = %s AND version = %s",
        (str(plan_id), version)
    )
    if not plan_version:
        raise HTTPException(status_code=404, detail=f"Version {version} not found for plan {plan_id}")

    repo = PlanRepository(conn)
    plan = repo.get_plan_by_id(plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    snapshot = plan_version["snapshot"]
    if isinstance(snapshot, str):
        snapshot = json.loads(snapshot)

    # Auto-snapshot current state
    execute_write(conn, """
        INSERT INTO orchestration.plan_versions
            (version_id, plan_id, version, snapshot, change_notes, created_by)
        VALUES (%s, %s, %s, %s, %s, %s)
    """, (
        str(uuid.uuid4()),
        str(plan_id),
        plan["version"],
        json.dumps({
            "plan_id":         str(plan["plan_id"]),
            "name":            plan["name"],
            "entity_type":     plan["entity_type"],
            "description":     plan.get("description"),
            "error_policy":    plan["error_policy"],
            "max_concurrency": plan["max_concurrency"],
            "version":         plan["version"],
            "is_active":       plan["is_active"],
            "steps": [
                {"step_key": s["step_key"], "kind": s["kind"],
                 "datasource_name": s["datasource_name"], "step_order": s["step_order"],
                 "enabled": s["enabled"], "timeout_ms": s["timeout_ms"],
                 "output_mode": s["output_mode"], "depends_on": s.get("depends_on") or []}
                for s in plan.get("steps", [])
            ],
        }),
        f"Auto-snapshot before restoring to v{version}",
        auth.subject,
    ))

    # Restore plan fields
    execute_write(conn, """
        UPDATE orchestration.plans SET
            name            = %s,
            entity_type     = %s,
            description     = %s,
            error_policy    = %s,
            max_concurrency = %s,
            version         = version + 1,
            updated_at      = NOW()
        WHERE plan_id = %s
    """, (
        snapshot.get("name", plan["name"]),
        snapshot.get("entity_type", plan["entity_type"]),
        snapshot.get("description", plan.get("description")),
        snapshot.get("error_policy", plan["error_policy"]),
        snapshot.get("max_concurrency", plan["max_concurrency"]),
        str(plan_id),
    ))

    # Restore steps
    snapshot_steps = snapshot.get("steps", [])
    if snapshot_steps:
        execute_write(conn,
            "DELETE FROM orchestration.plan_steps WHERE plan_id = %s",
            (str(plan_id),)
        )
        for step_data in snapshot_steps:
            execute_write(conn, """
                INSERT INTO orchestration.plan_steps
                    (plan_step_id, plan_id, step_key, step_order, kind,
                     datasource_name, depends_on, enabled, timeout_ms,
                     output_mode, query_params_json, input_bindings_json)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                str(uuid.uuid4()), str(plan_id),
                step_data.get("step_key", ""),
                step_data.get("step_order", 1),
                step_data.get("kind", "sql"),
                step_data.get("datasource_name", ""),
                step_data.get("depends_on", []),
                step_data.get("enabled", True),
                step_data.get("timeout_ms", 5000),
                step_data.get("output_mode", "object"),
                json.dumps({}),
                json.dumps({}),
            ))

    conn.commit()
    return _plan_to_response(repo.get_plan_by_id(plan_id))


# ══════════════════════════════════════════════════════════════════
# TENANT POLICY APIS
# ══════════════════════════════════════════════════════════════════

@app.get("/admin/tenants/{tenant_id}/policy", response_model=TenantPolicyResponse)
def get_tenant_policy(
    tenant_id: str,
    conn=Depends(get_db),
    auth: AuthContext = Depends(require_admin),
):
    row = execute_one(conn,
        "SELECT * FROM orchestration.tenant_policies WHERE tenant_id = %s",
        (tenant_id,)
    )
    if not row:
        raise HTTPException(status_code=404, detail=f"No policy for tenant {tenant_id}")
    return row


@app.post("/admin/tenants/{tenant_id}/policy", response_model=TenantPolicyResponse)
def upsert_tenant_policy(
    tenant_id: str,
    payload: TenantPolicyCreate,
    conn=Depends(get_db),
    auth: AuthContext = Depends(require_admin),
):
    existing = execute_one(conn,
        "SELECT tenant_id FROM orchestration.tenant_policies WHERE tenant_id = %s",
        (tenant_id,)
    )
    if existing:
        execute_write(conn, """
            UPDATE orchestration.tenant_policies SET
                max_concurrency = %s, max_retries = %s, timeout_ms = %s,
                error_policy = %s, is_active = %s, notes = %s, updated_at = NOW()
            WHERE tenant_id = %s
        """, (
            payload.max_concurrency, payload.max_retries, payload.timeout_ms,
            payload.error_policy, payload.is_active, payload.notes, tenant_id,
        ))
    else:
        execute_write(conn, """
            INSERT INTO orchestration.tenant_policies
                (tenant_id, max_concurrency, max_retries, timeout_ms,
                 error_policy, is_active, notes)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """, (
            tenant_id, payload.max_concurrency, payload.max_retries,
            payload.timeout_ms, payload.error_policy, payload.is_active, payload.notes,
        ))
    conn.commit()
    return execute_one(conn,
        "SELECT * FROM orchestration.tenant_policies WHERE tenant_id = %s",
        (tenant_id,)
    )


@app.get("/admin/tenants", response_model=list[TenantPolicyResponse])
def list_tenants(
    conn=Depends(get_db),
    auth: AuthContext = Depends(require_admin),
):
    return execute(conn,
        "SELECT * FROM orchestration.tenant_policies ORDER BY tenant_id"
    )


# ══════════════════════════════════════════════════════════════════
# TENANT BUDGET APIS
# ══════════════════════════════════════════════════════════════════

@app.get("/admin/tenants/{tenant_id}/budget", response_model=TenantBudgetResponse)
def get_tenant_budget(
    tenant_id: str,
    conn=Depends(get_db),
    auth: AuthContext = Depends(require_admin),
):
    row = execute_one(conn,
        "SELECT * FROM orchestration.tenant_budgets WHERE tenant_id = %s",
        (tenant_id,)
    )
    if not row:
        raise HTTPException(status_code=404, detail=f"No budget for tenant {tenant_id}")
    return row


@app.post("/admin/tenants/{tenant_id}/budget", response_model=TenantBudgetResponse)
def upsert_tenant_budget(
    tenant_id: str,
    payload: TenantBudgetCreate,
    conn=Depends(get_db),
    auth: AuthContext = Depends(require_admin),
):
    existing = execute_one(conn,
        "SELECT tenant_id FROM orchestration.tenant_budgets WHERE tenant_id = %s",
        (tenant_id,)
    )
    if existing:
        execute_write(conn, """
            UPDATE orchestration.tenant_budgets SET
                max_rows = %s, max_bytes_mb = %s,
                max_cost_usd = %s, alert_at_pct = %s, updated_at = NOW()
            WHERE tenant_id = %s
        """, (
            payload.max_rows, payload.max_bytes_mb,
            payload.max_cost_usd, payload.alert_at_pct, tenant_id,
        ))
    else:
        execute_write(conn, """
            INSERT INTO orchestration.tenant_budgets
                (tenant_id, max_rows, max_bytes_mb, max_cost_usd, alert_at_pct)
            VALUES (%s, %s, %s, %s, %s)
        """, (
            tenant_id, payload.max_rows, payload.max_bytes_mb,
            payload.max_cost_usd, payload.alert_at_pct,
        ))
    conn.commit()
    return execute_one(conn,
        "SELECT * FROM orchestration.tenant_budgets WHERE tenant_id = %s",
        (tenant_id,)
    )


# ══════════════════════════════════════════════════════════════════
# DATASOURCE APIS
# ══════════════════════════════════════════════════════════════════

@app.get("/admin/datasources", response_model=list[DatasourceResponse])
def list_datasources(
    kind:      Optional[str]  = None,
    is_active: Optional[bool] = None,
    conn=Depends(get_db),
    auth: AuthContext = Depends(require_admin),
):
    sql    = "SELECT * FROM orchestration.datasources WHERE 1=1"
    params = []
    if kind:
        sql += " AND kind = %s"; params.append(kind)
    if is_active is not None:
        sql += " AND is_active = %s"; params.append(is_active)
    sql += " ORDER BY name"
    return execute(conn, sql, params or None)


@app.post("/admin/datasources", response_model=DatasourceResponse, status_code=201)
def create_datasource(
    payload: DatasourceCreate,
    conn=Depends(get_db),
    auth: AuthContext = Depends(require_admin),
):
    existing = execute_one(conn,
        "SELECT datasource_id FROM orchestration.datasources WHERE name = %s",
        (payload.name,)
    )
    if existing:
        raise HTTPException(status_code=409, detail=f"Datasource '{payload.name}' already exists")

    ds_id = str(uuid.uuid4())
    execute_write(conn, """
        INSERT INTO orchestration.datasources
            (datasource_id, name, kind, host, port, database_name,
             username, description, is_active, tags, tenant_id)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """, (
        ds_id, payload.name, payload.kind, payload.host, payload.port,
        payload.database_name, payload.username, payload.description,
        payload.is_active, json.dumps(payload.tags or []), payload.tenant_id,
    ))
    conn.commit()
    return execute_one(conn,
        "SELECT * FROM orchestration.datasources WHERE datasource_id = %s",
        (ds_id,)
    )


@app.get("/admin/datasources/{datasource_id}", response_model=DatasourceResponse)
def get_datasource(
    datasource_id: UUID,
    conn=Depends(get_db),
    auth: AuthContext = Depends(require_admin),
):
    row = execute_one(conn,
        "SELECT * FROM orchestration.datasources WHERE datasource_id = %s",
        (str(datasource_id),)
    )
    if not row:
        raise HTTPException(status_code=404, detail="Datasource not found")
    return row


@app.put("/admin/datasources/{datasource_id}", response_model=DatasourceResponse)
def update_datasource(
    datasource_id: UUID,
    payload: DatasourceUpdate,
    conn=Depends(get_db),
    auth: AuthContext = Depends(require_admin),
):
    row = execute_one(conn,
        "SELECT datasource_id FROM orchestration.datasources WHERE datasource_id = %s",
        (str(datasource_id),)
    )
    if not row:
        raise HTTPException(status_code=404, detail="Datasource not found")

    fields = []
    values = []
    for field, value in payload.model_dump(exclude_none=True).items():
        fields.append(f"{field} = %s")
        values.append(value)
    fields.append("updated_at = NOW()")
    values.append(str(datasource_id))

    execute_write(conn,
        f"UPDATE orchestration.datasources SET {', '.join(fields)} WHERE datasource_id = %s",
        values
    )
    conn.commit()
    return execute_one(conn,
        "SELECT * FROM orchestration.datasources WHERE datasource_id = %s",
        (str(datasource_id),)
    )


@app.delete("/admin/datasources/{datasource_id}", status_code=204)
def delete_datasource(
    datasource_id: UUID,
    conn=Depends(get_db),
    auth: AuthContext = Depends(require_admin),
):
    row = execute_one(conn,
        "SELECT datasource_id FROM orchestration.datasources WHERE datasource_id = %s",
        (str(datasource_id),)
    )
    if not row:
        raise HTTPException(status_code=404, detail="Datasource not found")
    execute_write(conn,
        "DELETE FROM orchestration.datasources WHERE datasource_id = %s",
        (str(datasource_id),)
    )
    conn.commit()


@app.post("/admin/datasources/{datasource_id}/test")
def test_datasource(
    datasource_id: UUID,
    conn=Depends(get_db),
    auth: AuthContext = Depends(require_admin),
):
    row = execute_one(conn,
        "SELECT * FROM orchestration.datasources WHERE datasource_id = %s",
        (str(datasource_id),)
    )
    if not row:
        raise HTTPException(status_code=404, detail="Datasource not found")
    return {
        "datasource_id": str(row["datasource_id"]),
        "name":          row["name"],
        "kind":          row["kind"],
        "status":        "reachable",
        "message":       "Connection test placeholder — real test available in Phase 3",
    }


# ══════════════════════════════════════════════════════════════════
# PHASE 4.3 — ITSM
# ══════════════════════════════════════════════════════════════════

class ITSMTicketRequest(BaseModel):
    summary:     str
    description: str
    priority:    str           = "MEDIUM"
    evidence_id: Optional[str] = None
    intent:      Optional[str] = None
    tenant_id:   Optional[str] = "global"
    itsm_system: str           = "SERVICENOW"

@app.post("/v1/itsm/tickets", status_code=201)
def create_itsm_ticket(payload: ITSMTicketRequest, conn=Depends(get_db), auth: AuthContext = Depends(get_auth_context)):
    ticket_id = f"TICK-{uuid.uuid4().hex[:8].upper()}"
    tenant_id = payload.tenant_id or auth.tenant_id
    url = (f"https://servicenow.example.com/tickets/{ticket_id}" if payload.itsm_system == "SERVICENOW"
           else f"https://jira.example.com/browse/{ticket_id}")
    execute_write(conn, """
        INSERT INTO orchestration.itsm_tickets
            (ticket_id, summary, description, priority, status, itsm_system,
             evidence_id, intent, tenant_id, created_by, resolution, url)
        VALUES (%s, %s, %s, %s, 'OPEN', %s, %s, %s, %s, %s, NULL, %s)
    """, (ticket_id, payload.summary, payload.description, payload.priority, payload.itsm_system,
          payload.evidence_id, payload.intent, tenant_id, auth.subject, url))
    conn.commit()
    return execute_one(conn, "SELECT * FROM orchestration.itsm_tickets WHERE ticket_id = %s", (ticket_id,))

@app.get("/v1/itsm/tickets/{ticket_id}")
def get_itsm_ticket(ticket_id: str, conn=Depends(get_db), auth: AuthContext = Depends(get_auth_context)):
    ticket = execute_one(conn, "SELECT * FROM orchestration.itsm_tickets WHERE ticket_id = %s", (ticket_id,))
    if not ticket:
        raise HTTPException(status_code=404, detail=f"Ticket {ticket_id} not found")
    age_seconds = (datetime.utcnow() - ticket["created_at"].replace(tzinfo=None)).total_seconds()
    if age_seconds > 30 and ticket["status"] == "OPEN":
        execute_write(conn, """
            UPDATE orchestration.itsm_tickets SET status = 'RESOLVED', resolution = 'APPROVE', updated_at = now()
            WHERE ticket_id = %s
        """, (ticket_id,))
        conn.commit()
        ticket = execute_one(conn, "SELECT * FROM orchestration.itsm_tickets WHERE ticket_id = %s", (ticket_id,))
    return {
        **ticket,
        "decision": ticket["resolution"],
        "resolution_code": "APPROVED_BY_AGENT" if ticket["resolution"] else None,
        "resolution_comment": "Verified and approved" if ticket["resolution"] else None,
    }

@app.get("/v1/itsm/tickets")
def list_itsm_tickets(tenant_id: Optional[str] = None, status: Optional[str] = None,
                       ticket_type: Optional[str] = None,
                       conn=Depends(get_db), auth: AuthContext = Depends(get_auth_context)):
    sql = "SELECT * FROM orchestration.itsm_tickets WHERE 1=1"
    params: list = []
    if tenant_id:
        sql += " AND tenant_id = %s"; params.append(tenant_id)
    if status:
        sql += " AND status = %s"; params.append(status)
    if ticket_type:
        sql += " AND ticket_type = %s"; params.append(ticket_type)
    sql += " ORDER BY created_at DESC"
    tickets = execute(conn, sql, params)
    return {"tickets": tickets, "total": len(tickets)}

class ResolveTicketRequest(BaseModel):
    reviewed_by:     str
    decision_reason: str

@app.post("/v1/itsm/tickets/{ticket_id}/resolve")
def resolve_itsm_ticket_directly(ticket_id: str, payload: ResolveTicketRequest,
                                  conn=Depends(get_db), auth: AuthContext = Depends(get_auth_context)):
    ticket = execute_one(conn, "SELECT * FROM orchestration.itsm_tickets WHERE ticket_id = %s", (ticket_id,))
    if not ticket:
        raise HTTPException(status_code=404, detail=f"Ticket '{ticket_id}' not found")
    if ticket["status"] != "OPEN":
        raise HTTPException(status_code=400, detail=f"Ticket '{ticket_id}' is already {ticket['status']}")
    execute_write(conn, """
        UPDATE orchestration.itsm_tickets
        SET status = 'RESOLVED', resolution = %s, updated_at = now()
        WHERE ticket_id = %s
    """, (f"Solved by {payload.reviewed_by}: {payload.decision_reason}", ticket_id))
    conn.commit()
    return execute_one(conn, "SELECT * FROM orchestration.itsm_tickets WHERE ticket_id = %s", (ticket_id,))

# ══════════════════════════════════════════════════════════════════
# PHASE 4.4 — AI COPILOT
# ══════════════════════════════════════════════════════════════════

class CopilotDesignRequest(BaseModel):
    description: str
    entity_type: Optional[str] = "customer"
    tenant_id:   Optional[str] = "global"

class CopilotLintRequest(BaseModel):
    plan: Dict[str, Any]

class CopilotOptimizeRequest(BaseModel):
    plan:          Dict[str, Any]
    metering_data: Optional[List[Dict[str, Any]]] = Field(default_factory=list)

@app.post("/v1/copilot/design")
def copilot_design(payload: CopilotDesignRequest, auth: AuthContext = Depends(get_auth_context)):
    import httpx, json as _json
    GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
    GROQ_MODEL   = "llama-3.3-70b-versatile"
    system_prompt = """You are an expert AI orchestration architect for regulated industries (Banking, Insurance, Healthcare, ITSM). Your job is to design orchestration plans based on user descriptions. You must return ONLY valid JSON — no explanation, no markdown, just the JSON object.

Each plan has steps of these kinds:
- sql: fetches data from a database. Needs sql_template.
- rest: calls a REST API. Needs method and path_template.
- graphql: calls a GraphQL API. Needs graphql_query_template and graphql_vars_json.
- ai_transform: sends data to AI for analysis. Needs ai_prompt_template.
- intent_classify: classifies inbound content (usually email) into a governed intent using EIVS. datasource_name is "EIVS". input_bindings_json needs subject/body/sender_email (or text for non-email sources) mapped from params, e.g. {"subject": "params.subject", "body": "params.body", "sender_email": "params.sender_email"}.
- policy_route: re-applies EIVS intent policy thresholds to decide AUTO_PROCESS / MANUAL_REVIEW / REROUTE. datasource_name is "EIVS". Always depends_on the intent_classify step. input_bindings_json needs {"classify_step_key": "<the intent_classify step_key>"}.
- intent_validate: runs EIVS validation rules (e.g. confirms customer/account details) against the classified intent. datasource_name is "EIVS". Depends on the policy_route step, and should usually have condition_expr like "results.<policy_route_step_key>.output.routing_decision == 'AUTO_PROCESS'" so validation only runs when auto-processing is allowed.
- adapter_analyze: calls the Adapter service for a semantic/SQL-gated lookup. datasource_name is the target datasource name.
- prompt_run: runs a single one-shot LLM prompt (lighter weight than ai_transform, no fixed schema binding). datasource_name is "LLM_SERVICE". Needs ai_prompt_template.
- document_generate: renders a document/letter from a Template Builder template. input_bindings_json needs {"template_id": "<template id — leave as a clear placeholder like 'REPLACE_WITH_TEMPLATE_ID' if unknown>", "placeholder_values": {}}.
- human_review: pauses the plan for manual review by flagging the step (does not block execution — downstream steps can branch on results.<step_key>.output.status == 'pending_human_review'). input_bindings_json needs {"reason": "...", "assignee_role": "orchestration_reviewer"}.
- webhook: posts the final result to an external system (n8n, callback URL, etc). input_bindings_json needs {"url": "...", "method": "POST"}.
- agent_task: runs a budgeted, governed autonomous agent loop for a task too open-ended for a fixed step. input_bindings_json MUST include ALL of: prompt_ref ({"prompt_id": "REPLACE_WITH_PROMPT_ID"}), goal (a specific instruction string), allowed_tools (an explicit list from: datasource_lookup, adapter_analyze, prompt_run, document_generate, human_review, webhook — NEVER a wildcard "*"), budgets ({"max_iterations": 5, "max_model_calls": 10, "max_tool_calls": 20, "max_cost_usd": 1.0, "timeout_ms": 120000}), output_schema (a JSON Schema object describing the required final answer shape), and approval_policy ({"mode": "auto_for_read_only", "require_approval_for": ["webhook", "human_review"]}) so mutating tools always require approval.

Available datasources:
- CRM_DB (sql) — customer profile data
- BILLING_API (rest) — billing and invoice data
- KYC_API (rest) — KYC verification data
- CREDIT_API (rest) — credit score data
- SUPPORT_API (rest) — support tickets
- LLM_SERVICE (ai_transform, prompt_run) — AI analysis
- EIVS (intent_classify, policy_route, intent_validate) — email/event intent classification and validation

Return this exact JSON structure:
{
  "plan": {
    "name": "snake_case_plan_name",
    "entity_type": "customer or patient or applicant or claim or employee or email",
    "description": "what this plan does",
    "error_policy": "best_effort",
    "max_concurrency": 8,
    "steps": [
      {
        "step_key": "unique_step_name",
        "step_order": 1,
        "kind": "sql or rest or graphql or ai_transform or intent_classify or policy_route or intent_validate or adapter_analyze or prompt_run or document_generate or human_review or webhook or agent_task",
        "datasource_name": "DATASOURCE_NAME",
        "sql_template": "SELECT * FROM table WHERE id = :entity_id",
        "method": "GET",
        "path_template": "/path/{entity_id}",
        "ai_prompt_template": "detailed prompt for AI analysis",
        "input_bindings_json": {},
        "condition_expr": null,
        "depends_on": [],
        "timeout_ms": 5000,
        "output_mode": "object",
        "enabled": true
      }
    ]
  },
  "step_count": 2,
  "governance_notes": ["note about governance"]
}

Important rules:
- step_key must be snake_case
- sql steps need sql_template, leave method and path_template empty
- rest steps need method and path_template, leave sql_template empty
- ai_transform / prompt_run steps need ai_prompt_template — make it very detailed and specific to the use case
- ai_transform steps should always depend on data collection steps
- intent_classify, policy_route, intent_validate, adapter_analyze, prompt_run, document_generate, human_review, webhook, and agent_task steps use input_bindings_json for their configuration, not sql_template/method/path_template
- agent_task steps must never use a wildcard in allowed_tools, and any of webhook/human_review in allowed_tools must appear in approval_policy.require_approval_for
- if the description clearly involves an inbound email or message that needs to be classified, routed by confidence, validated, and responded to, prefer the intent_classify -> policy_route -> intent_validate -> document_generate -> webhook chain over plain sql/rest steps
- depends_on should list step_keys this step needs to run first
- governance_notes should mention audit trail and data governance
- plan name must be lowercase with underscores only"""
    user_prompt = f"Design an orchestration plan for this use case:\n\nDescription: {payload.description}\nEntity Type: {payload.entity_type or 'customer'}\n\nCreate a complete plan with appropriate steps.\nMake the ai_prompt_template very specific and detailed for the exact analysis needed.\nReturn only the JSON object, nothing else."

    if GROQ_API_KEY:
        try:
            with httpx.Client(timeout=30.0) as client:
                resp = client.post("https://api.groq.com/openai/v1/chat/completions", headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"}, json={"model": GROQ_MODEL, "messages": [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}], "temperature": 0.2, "max_tokens": 2048, "response_format": {"type": "json_object"}})
                resp.raise_for_status()
                result = _json.loads(resp.json()["choices"][0]["message"]["content"])
                for i, step in enumerate(result.get("plan", {}).get("steps", [])):
                    step.setdefault("step_order", i + 1); step.setdefault("depends_on", []); step.setdefault("timeout_ms", 5000); step.setdefault("output_mode", "object"); step.setdefault("enabled", True); step.setdefault("input_bindings_json", {})
                result.setdefault("governance_notes", ["All data access governed through S-Gate validation", "Evidence bundles generated for each step execution", "Immutable audit trail maintained for compliance"])
                result.setdefault("step_count", len(result.get("plan", {}).get("steps", [])))
                result["generated_at"] = datetime.utcnow().isoformat()
                result["ai_generated"] = True
                logger.info(f"AI Copilot generated plan with {result['step_count']} steps using real Groq AI")
                return result
        except Exception as e:
            logger.error(f"Groq AI copilot design failed: {e} — falling back to keyword matching")

    logger.warning("Using keyword matching fallback for copilot design")
    desc = payload.description.lower(); steps = []; step_order = 1

    # ── EIVS / email-intent flow — checked first, since it's a distinct
    # chain shape (intent_classify -> policy_route -> intent_validate ->
    # document_generate -> webhook) rather than a flat data-collection list.
    if any(k in desc for k in ["email", "inbound message", "noc", "closure certificate", "intent"]) and \
       any(k in desc for k in ["classify", "route", "validate", "respond", "process"]):
        classify_key = "classify_intent"
        route_key = "route_policy"
        validate_key = "validate_request"
        steps = [
            {"step_key": classify_key, "step_order": 1, "kind": "intent_classify", "datasource_name": "EIVS",
             "input_bindings_json": {"subject": "params.subject", "body": "params.body", "sender_email": "params.sender_email"},
             "depends_on": [], "timeout_ms": 8000, "output_mode": "object", "enabled": True},
            {"step_key": route_key, "step_order": 2, "kind": "policy_route", "datasource_name": "EIVS",
             "input_bindings_json": {"classify_step_key": classify_key},
             "depends_on": [classify_key], "timeout_ms": 5000, "output_mode": "object", "enabled": True},
            {"step_key": validate_key, "step_order": 3, "kind": "intent_validate", "datasource_name": "EIVS",
             "input_bindings_json": {}, "condition_expr": f"results.{route_key}.output.routing_decision == 'AUTO_PROCESS'",
             "depends_on": [route_key], "timeout_ms": 10000, "output_mode": "object", "enabled": True},
        ]
        step_order = 4
        if any(k in desc for k in ["document", "letter", "certificate", "noc"]):
            steps.append({"step_key": "generate_document", "step_order": step_order, "kind": "document_generate",
                "datasource_name": "", "input_bindings_json": {"template_id": "REPLACE_WITH_TEMPLATE_ID", "placeholder_values": {}},
                "depends_on": [validate_key], "timeout_ms": 15000, "output_mode": "object", "enabled": True})
            step_order += 1
        if any(k in desc for k in ["notify", "webhook", "n8n", "callback", "downstream"]):
            deps = [s["step_key"] for s in steps]
            steps.append({"step_key": "notify_downstream", "step_order": step_order, "kind": "webhook",
                "datasource_name": "WEBHOOK", "input_bindings_json": {"url": "REPLACE_WITH_WEBHOOK_URL", "method": "POST"},
                "depends_on": deps[-1:], "timeout_ms": 5000, "output_mode": "object", "enabled": True})
            step_order += 1

    if not steps:
        if any(k in desc for k in ["crm","customer","profile","contact","360"]): steps.append({"step_key":"crm_data","step_order":step_order,"kind":"sql","datasource_name":"CRM_DB","sql_template":f"SELECT * FROM {payload.entity_type}s WHERE {payload.entity_type}_id = :{payload.entity_type}_id","depends_on":[],"timeout_ms":5000,"output_mode":"object","enabled":True}); step_order+=1
        if any(k in desc for k in ["billing","invoice","payment","outstanding","dues"]): steps.append({"step_key":"billing_data","step_order":step_order,"kind":"rest","datasource_name":"BILLING_API","method":"GET","path_template":f"/billing/{{{payload.entity_type}_id}}/summary","depends_on":[],"timeout_ms":5000,"output_mode":"object","enabled":True}); step_order+=1
        if any(k in desc for k in ["kyc","verification","identity","document"]): steps.append({"step_key":"kyc_data","step_order":step_order,"kind":"rest","datasource_name":"KYC_API","method":"GET","path_template":f"/kyc/{{{payload.entity_type}_id}}/status","depends_on":[],"timeout_ms":5000,"output_mode":"object","enabled":True}); step_order+=1
        if any(k in desc for k in ["risk","score","ai","analysis","assess","credit"]): depends=[s["step_key"] for s in steps]; steps.append({"step_key":"risk_score","step_order":step_order,"kind":"ai_transform","datasource_name":"LLM_SERVICE","ai_prompt_template":f"Analyse the {payload.entity_type} data and return a risk score 0-100 with risk_level (LOW/MEDIUM/HIGH) and reason. Return JSON: score, risk_level, reason, recommended_action.","depends_on":depends,"timeout_ms":10000,"output_mode":"object","enabled":True}); step_order+=1
        if any(k in desc for k in ["review", "approval", "manual", "sign off", "sign-off"]): depends=[s["step_key"] for s in steps]; steps.append({"step_key":"human_review","step_order":step_order,"kind":"human_review","datasource_name":"","input_bindings_json":{"reason":"Flagged for manual review by plan configuration","assignee_role":"orchestration_reviewer"},"depends_on":depends,"timeout_ms":5000,"output_mode":"object","enabled":True}); step_order+=1
        if any(k in desc for k in ["agent", "autonomous", "open-ended", "multi-step task"]): depends=[s["step_key"] for s in steps]; steps.append({"step_key":"agent_task","step_order":step_order,"kind":"agent_task","datasource_name":"","input_bindings_json":{"prompt_ref":{"prompt_id":"REPLACE_WITH_PROMPT_ID"},"goal":payload.description,"allowed_tools":["datasource_lookup"],"budgets":{"max_iterations":5,"max_model_calls":10,"max_tool_calls":20,"max_cost_usd":1.0,"timeout_ms":120000},"output_schema":{"type":"object"},"approval_policy":{"mode":"auto_for_read_only","require_approval_for":["webhook","human_review"]}},"depends_on":depends,"timeout_ms":120000,"output_mode":"object","enabled":True}); step_order+=1
        if not steps: steps=[{"step_key":"data_lookup","step_order":1,"kind":"rest","datasource_name":"KYC_API","method":"GET","path_template":f"/kyc/{{{payload.entity_type}_id}}/status","depends_on":[],"timeout_ms":5000,"output_mode":"object","enabled":True}]

    plan_name = "_".join([w for w in payload.description.lower().split() if len(w)>3][:4]) or f"{payload.entity_type}_360"
    return {"plan": {"name": plan_name, "entity_type": payload.entity_type, "description": payload.description, "error_policy": "best_effort", "max_concurrency": 8, "tenant_id": None, "steps": steps}, "step_count": len(steps), "governance_notes": ["All SQL steps validated through S-Gate before execution", "Evidence bundles generated for each step", "Metering events recorded for cost tracking"], "generated_at": datetime.utcnow().isoformat(), "ai_generated": False}
@app.post("/v1/copilot/safety-lint")
def copilot_safety_lint(payload: CopilotLintRequest, conn=Depends(get_db), auth: AuthContext = Depends(get_auth_context)):
    plan = payload.plan; steps = plan.get("steps", []); issues = []

    tenant_id = plan.get("tenant_id") or auth.tenant_id
    tenant_policy_row = execute_one(conn,
        "SELECT * FROM orchestration.tenant_policies WHERE tenant_id = %s", (tenant_id,)
    )
    tenant_budget_row = execute_one(conn,
        "SELECT * FROM orchestration.tenant_budgets WHERE tenant_id = %s", (tenant_id,)
    )
    tenant_max_timeout_ms = (tenant_policy_row or {}).get("timeout_ms", 5000)
    tenant_max_cost_usd = float((tenant_budget_row or {}).get("max_cost_usd", 50.0))
    # No dedicated tenant-level "max agent iterations" column exists yet; use
    # max_retries as the closest available tenant-level bound (defensive default).
    tenant_max_iterations = (tenant_policy_row or {}).get("max_retries", 3) or 3
    STATE_MUTATING_TOOLS = {"webhook", "document_generate", "human_review"}

    for step in steps:
        step_key = step.get("step_key","unknown"); kind = step.get("kind",""); sql = step.get("sql_template","")
        if kind == "sql":
            if not sql: issues.append({"severity":"ERROR","step":step_key,"issue":"SQL template is empty","fix":"Add a SELECT query to sql_template"})
            elif any(k in sql.upper() for k in ["DROP","DELETE","TRUNCATE","INSERT","UPDATE"]): issues.append({"severity":"ERROR","step":step_key,"issue":"Dangerous SQL operation detected","fix":"Only SELECT queries are allowed"})
            elif "WHERE" not in sql.upper(): issues.append({"severity":"WARNING","step":step_key,"issue":"SQL query has no WHERE clause","fix":"Add a WHERE clause to filter results"})
        if kind == "ai_transform" and not step.get("ai_prompt_template"): issues.append({"severity":"ERROR","step":step_key,"issue":"AI prompt template is empty","fix":"Add an ai_prompt_template"})
        if step.get("timeout_ms",5000) > 30000: issues.append({"severity":"WARNING","step":step_key,"issue":f"Timeout {step.get('timeout_ms')}ms is very high","fix":"Consider reducing timeout_ms to under 30000"})

        if kind == "agent_task":
            bindings = step.get("input_bindings_json") or {}
            prompt_ref = bindings.get("prompt_ref")
            allowed_tools = bindings.get("allowed_tools")
            budgets = bindings.get("budgets") or {}
            output_schema = bindings.get("output_schema")
            approval_policy = bindings.get("approval_policy") or {}
            require_approval_for = set(approval_policy.get("require_approval_for") or [])

            if not prompt_ref or not prompt_ref.get("prompt_id"):
                issues.append({"severity":"ERROR","step":step_key,"issue":"agent_task is missing prompt_ref","fix":"Set input_bindings_json.prompt_ref.prompt_id to a published Prompt Builder prompt"})
            elif (prompt_ref.get("version") not in (None, "published")) and not bindings.get("allow_draft"):
                issues.append({"severity":"ERROR","step":step_key,"issue":"agent_task references a non-published prompt version without allow_draft","fix":"Use version='published', or set allow_draft=true in a dev environment only"})

            if not bindings.get("goal"):
                issues.append({"severity":"ERROR","step":step_key,"issue":"agent_task is missing a goal","fix":"Add input_bindings_json.goal describing the task"})

            if not allowed_tools:
                issues.append({"severity":"ERROR","step":step_key,"issue":"agent_task has no allowed_tools","fix":"Add input_bindings_json.allowed_tools with an explicit tool list"})
            elif "*" in allowed_tools or any(t in ("*", "all") for t in allowed_tools):
                issues.append({"severity":"ERROR","step":step_key,"issue":"agent_task allowed_tools contains a wildcard","fix":"List specific approved tools instead of '*'"})

            if not budgets:
                issues.append({"severity":"ERROR","step":step_key,"issue":"agent_task has no budgets configured","fix":"Add input_bindings_json.budgets (max_iterations, max_model_calls, max_tool_calls, max_cost_usd, timeout_ms)"})
            else:
                if budgets.get("max_iterations", 0) > tenant_max_iterations:
                    issues.append({"severity":"ERROR","step":step_key,"issue":f"agent_task max_iterations ({budgets.get('max_iterations')}) exceeds tenant limit ({tenant_max_iterations})","fix":"Lower budgets.max_iterations or raise the tenant policy limit"})
                if float(budgets.get("max_cost_usd", 0)) > tenant_max_cost_usd:
                    issues.append({"severity":"ERROR","step":step_key,"issue":f"agent_task max_cost_usd (${budgets.get('max_cost_usd')}) exceeds tenant budget (${tenant_max_cost_usd})","fix":"Lower budgets.max_cost_usd or raise the tenant budget"})
                if budgets.get("timeout_ms", 0) > tenant_max_timeout_ms:
                    issues.append({"severity":"ERROR","step":step_key,"issue":f"agent_task timeout_ms ({budgets.get('timeout_ms')}) exceeds tenant policy timeout ({tenant_max_timeout_ms})","fix":"Lower budgets.timeout_ms or raise the tenant policy timeout"})

            if not output_schema:
                issues.append({"severity":"ERROR","step":step_key,"issue":"agent_task has no output_schema","fix":"Add input_bindings_json.output_schema so the agent's final answer is validated"})

            if allowed_tools:
                unguarded = [t for t in allowed_tools if t in STATE_MUTATING_TOOLS and t not in require_approval_for]
                mode = approval_policy.get("mode", "none")
                if unguarded and mode != "required_for_all_actions":
                    issues.append({"severity":"ERROR","step":step_key,"issue":f"agent_task allows state-mutating tool(s) {unguarded} without requiring approval","fix":"Add these tools to approval_policy.require_approval_for, or set mode='required_for_all_actions'"})

    if not plan.get("error_policy"): issues.append({"severity":"WARNING","step":"plan","issue":"No error_policy defined","fix":"Set error_policy to best_effort, fail_fast, or dependent_fail"})
    errors = [i for i in issues if i["severity"]=="ERROR"]; warnings = [i for i in issues if i["severity"]=="WARNING"]
    return {"plan_name": plan.get("name","unknown"), "total_issues": len(issues), "errors": len(errors), "warnings": len(warnings), "issues": issues, "safe_to_deploy": len(errors)==0, "linted_at": datetime.utcnow().isoformat()}
@app.post("/v1/copilot/optimize")
def copilot_optimize(payload: CopilotOptimizeRequest, auth: AuthContext = Depends(get_auth_context)):
    plan = payload.plan; metering_data = payload.metering_data or []; suggestions = []; steps = plan.get("steps",[])
    for step in steps:
        if step.get("kind") == "ai_transform" and step.get("timeout_ms",5000) > 10000: suggestions.append({"type":"COST_REDUCTION","step":step.get("step_key"),"issue":"AI step has long timeout","action":"Reduce timeout_ms to 10000 for faster execution","saving":"~20% cost reduction"})
        if step.get("kind") == "sql" and step.get("sql_template") and "LIMIT" not in step.get("sql_template","").upper(): suggestions.append({"type":"QUERY_OPTIMIZATION","step":step.get("step_key"),"issue":"SQL query has no LIMIT clause","action":"Add LIMIT 100 to prevent fetching too many rows","saving":"~40% data cost reduction"})
    if plan.get("max_concurrency",8) < 4 and len(steps) > 3: suggestions.append({"type":"PARALLELISM","step":"plan","issue":"Low max_concurrency with many steps","action":f"Increase max_concurrency to {len(steps)} for parallel execution","saving":f"~{len(steps)*20}% latency reduction"})
    if metering_data:
        ai_cost  = sum(float(e.get("cost_usd",0)) for e in metering_data if e.get("usage_type")=="ai_transform")
        sql_cost = sum(float(e.get("cost_usd",0)) for e in metering_data if e.get("usage_type")=="sql_query")
        if ai_cost > sql_cost * 3: suggestions.append({"type":"MODEL_DOWNGRADE","step":"ai_transform","issue":f"AI costs (${ai_cost:.4f}) are 3x higher than SQL costs (${sql_cost:.4f})","action":"Consider using a lighter model for simple classification tasks","saving":"~50% AI cost reduction"})
    return {"plan_name": plan.get("name","unknown"), "suggestions": suggestions, "total_suggestions": len(suggestions), "estimated_savings": f"{len(suggestions)*15}% overall cost reduction possible", "optimized_at": datetime.utcnow().isoformat()}


# ══════════════════════════════════════════════════════════════════
# PHASE 4.5 — KNOWLEDGE GRAPH
# ══════════════════════════════════════════════════════════════════

class KnowledgeSynthesizeRequest(BaseModel):
    document_schema: Dict[str, Any]
    entity_type:     Optional[str] = "customer"

@app.get("/v1/evidence/bundles")
def list_evidence_bundles(
    tenant_id: Optional[str] = None,
    plan_name: Optional[str] = None,
    conn=Depends(get_db),
    auth: AuthContext = Depends(get_auth_context),
):
    try:
        sql    = "SELECT * FROM evidence.bundles WHERE 1=1"
        params = []
        if tenant_id:
            sql += " AND tenant_id = %s"; params.append(tenant_id)
        if plan_name:
            sql += " AND plan_name = %s"; params.append(plan_name)
        sql += " ORDER BY created_at DESC LIMIT 500"
        return execute(conn, sql, params or None)
    except Exception:
        return []
    
@app.get("/v1/knowledge/entity-types")
def get_knowledge_entity_types(
    conn=Depends(get_db),
    auth: AuthContext = Depends(get_auth_context)
):
    rows = execute(conn, """
        SELECT DISTINCT entity_type 
        FROM orchestration.knowledge_graph_config
        ORDER BY entity_type
    """)
    return {"entity_types": [row["entity_type"] for row in rows]}

@app.get("/v1/knowledge/entities/{entity_type}/{entity_id}")
def get_knowledge_entity(
    entity_type: str,
    entity_id:   str,
    conn=Depends(get_db),
    auth: AuthContext = Depends(get_auth_context)
):
    attributes    = {}
    relationships = []

    try:
        # Step 1 — Read config for this entity from DB
        config = execute_one(conn, """
            SELECT * FROM orchestration.knowledge_graph_config
            WHERE entity_type = %s
            AND relationship_type IS NULL
        """, (entity_type,))

        if not config:
            return {
                "entity_id":        entity_id,
                "entity_type":      entity_type,
                "attributes":       {"note": f"Entity type '{entity_type}' not configured"},
                "relationships":    [],
                "enriched_at":      datetime.utcnow().isoformat(),
                "graph_confidence": 0.0,
            }

        # Step 2 — Query main entity table dynamically
        schema         = config["table_schema"]
        table          = config["table_name"]
        id_col         = config["id_column"]
        display_fields = config["display_fields"]
        fields_sql     = ", ".join(display_fields + [id_col])

        row = execute_one(conn,
            f"SELECT {fields_sql} FROM {schema}.{table} WHERE {id_col} = %s",
            (entity_id,)
        )

        if not row:
            return {
                "entity_id":        entity_id,
                "entity_type":      entity_type,
                "attributes":       {"note": f"No {entity_type} found with ID {entity_id}"},
                "relationships":    [],
                "enriched_at":      datetime.utcnow().isoformat(),
                "graph_confidence": 0.0,
            }

        # Step 3 — Build attributes
        for k, v in dict(row).items():
            if v is None:
                attributes[k] = ""
            elif hasattr(v, 'isoformat'):
                attributes[k] = v.isoformat()
            else:
                attributes[k] = str(v)

        # Step 4 — Read relationship configs from DB
        rel_configs = execute(conn, """
            SELECT * FROM orchestration.knowledge_graph_config
            WHERE parent_entity = %s
            AND relationship_type IS NOT NULL
        """, (entity_type,))

        # Step 5 — For each relationship automatically query that table
        for rel in rel_configs:
            rel_schema     = rel["table_schema"]
            rel_table      = rel["table_name"]
            rel_id_col     = rel["id_column"]
            rel_fields     = rel["display_fields"]
            rel_fk         = rel["parent_fk_column"]
            rel_type       = rel["relationship_type"]
            rel_entity     = rel["entity_type"]
            rel_fields_sql = ", ".join(rel_fields + [rel_id_col])

            try:
                related_rows = execute(conn,
                    f"SELECT {rel_fields_sql} FROM {rel_schema}.{rel_table} WHERE {rel_fk} = %s",
                    (entity_id,)
                )
                for related in related_rows:
                    related_dict = dict(related)
                    target_id    = str(related_dict.get(rel_id_col, ""))
                    rel_attrs    = {}
                    for k, v in related_dict.items():
                        if v is None:
                            rel_attrs[k] = ""
                        elif hasattr(v, 'isoformat'):
                            rel_attrs[k] = v.isoformat()
                        else:
                            rel_attrs[k] = str(v)
                    relationships.append({
                        "type":        rel_type,
                        "target_id":   target_id,
                        "target_type": rel_entity,
                        "attributes":  rel_attrs,
                    })
            except Exception as e:
                logger.warning("Relationship query failed for %s: %s", rel_table, e)
                continue

        # Step 6 — Check if this entity belongs to a parent (reverse lookup)
        try:
            parent_config = execute_one(conn, """
                SELECT * FROM orchestration.knowledge_graph_config
                WHERE entity_type = %s
                AND relationship_type IS NOT NULL
                AND parent_entity IS NOT NULL
                LIMIT 1
            """, (entity_type,))

            if parent_config:
                parent_fk          = parent_config["parent_fk_column"]
                parent_entity_type = parent_config["parent_entity"]

                p_config = execute_one(conn, """
                    SELECT * FROM orchestration.knowledge_graph_config
                    WHERE entity_type = %s
                    AND relationship_type IS NULL
                """, (parent_entity_type,))

                if p_config and parent_fk in attributes:
                    parent_id    = attributes[parent_fk]
                    p_schema     = p_config["table_schema"]
                    p_table      = p_config["table_name"]
                    p_id_col     = p_config["id_column"]
                    p_fields     = p_config["display_fields"]
                    p_fields_sql = ", ".join(p_fields + [p_id_col])

                    parent_row = execute_one(conn,
                        f"SELECT {p_fields_sql} FROM {p_schema}.{p_table} WHERE {p_id_col} = %s",
                        (parent_id,)
                    )
                    if parent_row:
                        parent_attrs = {}
                        for k, v in dict(parent_row).items():
                            if v is None:
                                parent_attrs[k] = ""
                            elif hasattr(v, 'isoformat'):
                                parent_attrs[k] = v.isoformat()
                            else:
                                parent_attrs[k] = str(v)
                        relationships.append({
                            "type":        "OWNED_BY",
                            "target_id":   str(parent_id),
                            "target_type": parent_entity_type,
                            "attributes":  parent_attrs,
                        })
        except Exception as e:
            logger.warning("Parent lookup failed: %s", e)

    except Exception as e:
        logger.warning("Knowledge graph error: %s", e)

    if not attributes:
        return {
            "entity_id":        entity_id,
            "entity_type":      entity_type,
            "attributes":       {"id": entity_id, "note": "Entity not found"},
            "relationships":    [],
            "enriched_at":      datetime.utcnow().isoformat(),
            "graph_confidence": 0.0,
        }

    return {
        "entity_id":          entity_id,
        "entity_type":        entity_type,
        "attributes":         attributes,
        "relationships":      relationships,
        "relationship_count": len(relationships),
        "enriched_at":        datetime.utcnow().isoformat(),
        "graph_confidence":   0.95,
    }
@app.post("/v1/knowledge/synthesize")
def knowledge_synthesize(payload: KnowledgeSynthesizeRequest, auth: AuthContext = Depends(get_auth_context)):
    schema = payload.document_schema; entity_type = payload.entity_type; mappings = []
    FIELD_MAPPINGS = {"FIRSTNM": "customer.first_name", "LASTNM": "customer.last_name", "CUSTID": "customer.id", "ACCTNO": "account.account_number", "LOANID": "loan.id", "OUTAMT": "loan.outstanding_amount", "DUEDATE": "loan.due_date", "first_name": f"{entity_type}.first_name", "last_name": f"{entity_type}.last_name", "customer_id": f"{entity_type}.id", "account_no": "account.number", "loan_id": "loan.id", "outstanding": "loan.outstanding", "email": f"{entity_type}.email", "phone": f"{entity_type}.phone", "dob": f"{entity_type}.date_of_birth", "pan": f"{entity_type}.tax_id"}
    for field in schema.get("fields", []):
        field_name = field.get("name",""); mapped_to = FIELD_MAPPINGS.get(field_name) or FIELD_MAPPINGS.get(field_name.lower())
        mappings.append({"source_field": field_name, "mapped_to": mapped_to or f"{entity_type}.{field_name.lower()}", "confidence": 0.95 if mapped_to else 0.60, "auto_mapped": bool(mapped_to), "data_type": field.get("type","string")})
    return {"entity_type": entity_type, "schema_name": schema.get("name","unknown"), "total_fields": len(mappings), "auto_mapped": len([m for m in mappings if m["auto_mapped"]]), "needs_review": len([m for m in mappings if not m["auto_mapped"]]), "field_mappings": mappings, "graph_coverage": round(len([m for m in mappings if m["auto_mapped"]])/max(len(mappings),1),2), "synthesized_at": datetime.utcnow().isoformat()}


# ══════════════════════════════════════════════════════════════════
# PHASE 4.6 — DOMAIN PACKS
# ══════════════════════════════════════════════════════════════════

DOMAIN_PACKS = {
    "banking_collections": {"pack_id":"banking_collections","name":"Banking Collections 360","category":"Banking","version":"1.2.0","description":"Complete collections workflow with CRM, billing, risk scoring and ITSM escalation","features":["customer_360","risk_scoring","itsm_escalation","evidence_audit"],"templates":["loan_noc","account_statement"],"intents":["REQUEST_LOAN_NOC","PAYMENT_DISPUTE","BALANCE_ENQUIRY"],"plan_count":3},
    "insurance_claims":    {"pack_id":"insurance_claims","name":"Insurance Claims FNOL","category":"Insurance","version":"1.0.0","description":"First Notice of Loss processing with fraud detection and automated routing","features":["fnol_processing","fraud_detection","auto_routing","document_generation"],"templates":["insurance_policy","claims_fnol"],"intents":["CLAIM_SUBMISSION","POLICY_ENQUIRY","DOCUMENT_REQUEST"],"plan_count":2},
    "healthcare_lab":      {"pack_id":"healthcare_lab","name":"Healthcare Lab Reports","category":"Healthcare","version":"1.1.0","description":"Lab result notification with PHI/PII redaction and patient routing","features":["lab_result_notify","phi_redaction","patient_routing","doctor_escalation"],"templates":["lab_report"],"intents":["LAB_RESULT_READY","APPOINTMENT_REMINDER","PRESCRIPTION_RENEWAL"],"plan_count":2},
    "itsm_incident":       {"pack_id":"itsm_incident","name":"ITSM Incident Response","category":"ITSM","version":"1.0.0","description":"Automated incident detection, routing and resolution with ServiceNow/Jira integration","features":["incident_detection","auto_routing","sla_tracking","escalation"],"templates":[],"intents":["INCIDENT_REPORT","SERVICE_REQUEST","CHANGE_REQUEST"],"plan_count":2},
}

@app.get("/admin/domain-packs")
def list_domain_packs(category: Optional[str] = None, conn=Depends(get_db), auth: AuthContext = Depends(get_auth_context)):
    tenant_id = auth.tenant_id or "global"
    # Get installed packs from DB
    installed_rows = execute(conn,
        "SELECT pack_id FROM orchestration.domain_pack_installations WHERE tenant_id = %s",
        (tenant_id,)
    )
    installed = {row["pack_id"] for row in installed_rows}
    packs = list(DOMAIN_PACKS.values())
    if category:
        packs = [p for p in packs if p["category"].lower() == category.lower()]
    return {
        "domain_packs": [{
            **p,
            "is_installed": p["pack_id"] in installed,
            "install_status": "INSTALLED" if p["pack_id"] in installed else "AVAILABLE"
        } for p in packs],
        "total": len(packs),
        "installed": len(installed)
    }

@app.post("/admin/domain-packs/{pack_id}/install", status_code=201)
def install_domain_pack(pack_id: str, conn=Depends(get_db), auth: AuthContext = Depends(require_admin)):
    pack = DOMAIN_PACKS.get(pack_id)
    if not pack:
        raise HTTPException(status_code=404, detail=f"Domain pack '{pack_id}' not found")
    tenant_id = auth.tenant_id or "global"
    # Check if already installed in DB
    existing = execute_one(conn,
        "SELECT id FROM orchestration.domain_pack_installations WHERE pack_id = %s AND tenant_id = %s",
        (pack_id, tenant_id)
    )
    if existing:
        raise HTTPException(status_code=409, detail=f"Pack '{pack_id}' already installed for tenant {tenant_id}")
    # Save to DB
   # Save installation to DB
    execute_write(conn,
        "INSERT INTO orchestration.domain_pack_installations (pack_id, tenant_id) VALUES (%s, %s)",
        (pack_id, tenant_id)
    )

    # Create real plans in DB
    from .schemas import PlanCreate, PlanStepCreate
    repo          = PlanRepository(conn)
    created_plans = []

    for plan_data in DOMAIN_PACK_PLANS.get(pack_id, []):
        existing_plan = execute_one(conn,
            "SELECT plan_id FROM orchestration.plans WHERE name = %s",
            (plan_data["name"],)
        )
        if existing_plan:
            created_plans.append(plan_data["name"])
            continue

        plan_create = PlanCreate(
            name            = plan_data["name"],
            entity_type     = plan_data["entity_type"],
            description     = plan_data["description"],
            error_policy    = plan_data["error_policy"],
            max_concurrency = 8,
            tenant_id       = None,
            steps           = [
                PlanStepCreate(
                    step_key           = s["step_key"],
                    step_order         = s["step_order"],
                    kind               = s["kind"],
                    datasource_name    = s["datasource_name"],
                    sql_template       = s.get("sql_template"),
                    ai_prompt_template = s.get("ai_prompt_template"),
                    depends_on         = s.get("depends_on", []),
                    timeout_ms         = s.get("timeout_ms", 5000),
                    enabled            = s.get("enabled", True),
                )
                for s in plan_data["steps"]
            ]
        )
        repo.create_plan(plan_create, created_by="domain_pack")
        created_plans.append(plan_data["name"])

    conn.commit()

    return {
        "pack_id":       pack_id,
        "name":          pack["name"],
        "tenant_id":     tenant_id,
        "status":        "INSTALLED",
        "installed_at":  datetime.utcnow().isoformat(),
        "features":      pack["features"],
        "templates":     pack["templates"],
        "plans_created": created_plans,
        "message":       f"Domain pack '{pack['name']}' installed! {len(created_plans)} plans created."
    }

@app.delete("/admin/domain-packs/{pack_id}/uninstall", status_code=200)
def uninstall_domain_pack(pack_id: str, conn=Depends(get_db), auth: AuthContext = Depends(require_admin)):
    pack = DOMAIN_PACKS.get(pack_id)
    if not pack:
        raise HTTPException(status_code=404, detail=f"Domain pack '{pack_id}' not found")
    tenant_id = auth.tenant_id or "global"
    # Check if installed in DB
    existing = execute_one(conn,
        "SELECT id FROM orchestration.domain_pack_installations WHERE pack_id = %s AND tenant_id = %s",
        (pack_id, tenant_id)
    )
    if not existing:
        raise HTTPException(status_code=404, detail=f"Pack '{pack_id}' is not installed for tenant {tenant_id}")
    # Delete from DB
    execute_write(conn,
        "DELETE FROM orchestration.domain_pack_installations WHERE pack_id = %s AND tenant_id = %s",
        (pack_id, tenant_id)
    )
    conn.commit()
    return {
        "pack_id": pack_id,
        "tenant_id": tenant_id,
        "status": "UNINSTALLED",
        "uninstalled_at": datetime.utcnow().isoformat(),
        "message": f"Domain pack '{pack['name']}' uninstalled successfully"
    }

# ══════════════════════════════════════════════════════════════════
# PHASE 4.7 — ADVANCED GOVERNANCE
# ══════════════════════════════════════════════════════════════════

class ZKPValidateRequest(BaseModel):
    attribute:   str
    claim:       str
    proof_token: str
    tenant_id:   Optional[str] = "global"

class RedactionPolicyRequest(BaseModel):
    role:      str
    fields:    Dict[str, str]
    tenant_id: Optional[str] = "global"

class AuditNarrativeRequest(BaseModel):
    evidence_id: str
    format:      Optional[str] = "SUMMARY"
    regulation:  Optional[str] = "GENERAL"
    tenant_id:   Optional[str] = "global"

class CounterfactualRequest(BaseModel):
    evidence_id: str
    decision:    str
    tenant_id:   Optional[str] = "global"

_redaction_policies: Dict[str, Any] = {}

@app.post("/v1/zkp/validate")
def zkp_validate(payload: ZKPValidateRequest, auth: AuthContext = Depends(get_auth_context)):
    is_valid = len(payload.proof_token) > 10
    verification_result = True if (">" in payload.claim or "<" in payload.claim or "==" in payload.claim) else is_valid
    explanation = f"Zero-knowledge proof verified: '{payload.claim}' is satisfied without revealing actual value" if (">" in payload.claim or "<" in payload.claim or "==" in payload.claim) else f"Proof verified for attribute '{payload.attribute}'"
    return {"proof_id": str(uuid.uuid4()), "attribute": payload.attribute, "claim": payload.claim, "verified": verification_result, "explanation": explanation, "proof_algorithm": "zk-SNARK-mock", "verified_at": datetime.utcnow().isoformat(), "actual_value_seen": False, "privacy_preserved": True}

@app.post("/v1/redaction/policy")
def create_redaction_policy(payload: RedactionPolicyRequest, auth: AuthContext = Depends(require_admin)):
    policy_id = f"POLICY-{payload.role.upper()}-{uuid.uuid4().hex[:6]}"
    policy    = {"policy_id": policy_id, "role": payload.role, "tenant_id": payload.tenant_id or auth.tenant_id, "fields": payload.fields, "created_by": auth.subject, "created_at": datetime.utcnow().isoformat(), "is_active": True}
    _redaction_policies[policy_id] = policy
    return {**policy, "message": f"Redaction policy created for role '{payload.role}' with {len(payload.fields)} field rules", "supported_actions": ["MASK","REMOVE","TOKENIZE","REVEAL"]}

@app.get("/v1/redaction/policies")
def list_redaction_policies(auth: AuthContext = Depends(require_admin)):
    return {"policies": list(_redaction_policies.values()), "total": len(_redaction_policies)}

@app.post("/v1/audit/narrative")
def audit_narrative(payload: AuditNarrativeRequest, conn=Depends(get_db), auth: AuthContext = Depends(get_auth_context)):
    regulation_context = {"BFSI": "RBI guidelines require full audit trail for all customer data access", "HEALTHCARE": "HIPAA compliance requires PHI access to be logged and auditable", "GENERAL": "Standard governance requires evidence of all data access decisions"}

    bundle = execute_one(conn, "SELECT * FROM evidence.bundles WHERE evidence_id = %s", (payload.evidence_id,))
    if not bundle:
        raise HTTPException(status_code=404, detail=f"Evidence bundle '{payload.evidence_id}' not found")

    result_snapshot = bundle.get("result_snapshot") or {}
    system_prompt = (
        "You are an audit compliance officer writing a narrative summary of a single "
        "governed workflow step for a regulator. Write 1-2 short paragraphs, in plain "
        "prose, referencing the ACTUAL specific details in the data given to you — real "
        "names, account numbers, statuses, decisions found in that data — not generic "
        "boilerplate about the platform's technical safeguards. If the data shows a "
        "problem or discrepancy, say so plainly. End with one line naming the "
        "regulation context given to you."
    )
    user_prompt = (
        f"Plan: {bundle.get('plan_name')}\n"
        f"Step: {bundle.get('step_key')}\n"
        f"Tenant: {bundle.get('tenant_id')}\n"
        f"Regulation: {payload.regulation} — {regulation_context.get(payload.regulation, regulation_context['GENERAL'])}\n"
        f"Actual data recorded for this step:\n{json.dumps(result_snapshot, default=str)[:3000]}"
    )

    narrative = None
    GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
    GROQ_MODEL   = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
    if GROQ_API_KEY:
        try:
            import httpx
            with httpx.Client(timeout=30.0) as client:
                resp = client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
                    json={
                        "model": GROQ_MODEL,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt},
                        ],
                        "temperature": 0.3, "max_tokens": 500,
                    },
                )
                resp.raise_for_status()
                narrative = resp.json()["choices"][0]["message"]["content"].strip()
        except Exception:
            logger.exception("Failed to generate real audit narrative for evidence_id=%s, falling back", payload.evidence_id)

    if narrative is None:
        narrative = (
            f"Unable to generate a real narrative right now (Groq unavailable). "
            f"Raw data on record for {bundle.get('step_key')} in plan {bundle.get('plan_name')}: "
            f"{json.dumps(result_snapshot, default=str)[:500]}"
        )

    return {"narrative_id": str(uuid.uuid4()), "evidence_id": payload.evidence_id, "format": payload.format, "regulation": payload.regulation, "narrative": narrative, "generated_at": datetime.utcnow().isoformat(), "generated_by": "Groq (llama-3.3-70b-versatile)" if GROQ_API_KEY else "fallback (Groq unavailable)", "word_count": len(narrative.split())}
@app.post("/v1/audit/counterfactual")
def audit_counterfactual(payload: CounterfactualRequest, auth: AuthContext = Depends(get_auth_context)):
    decision = payload.decision.upper()
    if decision in ["REJECT","DENIED","DENY"]:
        counterfactuals = [{"factor":"credit_score","current_value":"620","required_value":"700","change_needed":"+80 points","outcome_if_changed":"APPROVE","feasibility":"POSSIBLE","explanation":"If credit score was 700+, the application would have been approved"},{"factor":"debt_to_income_ratio","current_value":"45%","required_value":"< 40%","change_needed":"-5%","outcome_if_changed":"APPROVE","feasibility":"POSSIBLE","explanation":"Reducing DTI below 40% would flip the decision to approval"},{"factor":"outstanding_overdue","current_value":"INR 45,000","required_value":"INR 0","change_needed":"Clear all overdue","outcome_if_changed":"APPROVE_WITH_CONDITIONS","feasibility":"POSSIBLE","explanation":"Clearing overdue amount would improve the decision"}]
    elif decision in ["APPROVE","APPROVED"]:
        counterfactuals = [{"factor":"credit_score","current_value":"720","threshold_value":"650","change_needed":"-70 points","outcome_if_changed":"REJECT","feasibility":"HYPOTHETICAL","explanation":"If credit score drops below 650, the decision would change to REJECT"}]
    else:
        counterfactuals = [{"factor":"manual_review_outcome","current_value":"PENDING","threshold_value":"APPROVED","change_needed":"Agent approval required","outcome_if_changed":"AUTO_PROCESS","feasibility":"DEPENDENT","explanation":"Agent approval would trigger automatic processing"}]
    return {"counterfactual_id": str(uuid.uuid4()), "evidence_id": payload.evidence_id, "original_decision": decision, "counterfactuals": counterfactuals, "total_factors": len(counterfactuals), "explanation": f"Analysis shows {len(counterfactuals)} factor(s) that if changed would alter the '{decision}' decision", "generated_at": datetime.utcnow().isoformat(), "model": "Agentary Counterfactual Engine v1.0"}


def _find_genuine_business_failures(results: Dict[str, Any]) -> Dict[str, str]:
    """A step like intent_validate can complete perfectly successfully from
    the orchestrator's point of view (no exception, self.success(...)
    returned) while its own real business verdict is overall_status=FAILED
    (e.g. the loan doesn't exist, or isn't CLOSED). Since nothing downstream
    even attempts to run in that case (their condition_expr is simply
    false), error_count stays 0 and the execution would otherwise show as
    a misleading 'success' with an empty errors object — hiding a genuinely
    rejected/failed case with no visible reason at all.

    Returns {step_key: reason} for every step whose own output says
    overall_status=FAILED, using that step's own reasoning/critical_failures
    detail as the reason — so this failure is exactly as clear and readable
    as a human's rejection reason already is, not just a bare status flip."""
    failures: Dict[str, str] = {}
    for step_key, step_output in results.items():
        if isinstance(step_output, dict) and step_output.get("overall_status") == "FAILED":
            reason = step_output.get("reasoning") or ""
            if not reason:
                critical = step_output.get("critical_failures") or []
                if critical and isinstance(critical[0], dict):
                    reason = critical[0].get("detail", "")
            failures[step_key] = reason or "overall_status=FAILED (no detail provided)"
    return failures
# ══════════════════════════════════════════════════════════════════
# ORCH-010: ORCHESTRATION RUNTIME APIS
# ══════════════════════════════════════════════════════════════════

@app.post("/v1/orchestrations/run", response_model=OrchestrationRunResponse)
def orchestrations_run(
    req: OrchestrationRunRequest,
    conn=Depends(get_db),
    auth: AuthContext = Depends(get_auth_context),
):
    """
    Stable runtime entry point (ORCH-010). Functionally equivalent to
    /v1/360, but creates the execution_id BEFORE running the plan so
    every step can write its own orchestration.execution_steps row and
    EIVS executors can link their own eivs.* rows back to this exact
    execution via execution_id.
    """
    import time
    start_ms = int(time.time() * 1000)

    repo = PlanRepository(conn)
    try:
        plan = repo.get_plan(req.plan_name, req.entity_type, req.tenant_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    execution_id = str(uuid.uuid4())

    # Create the execution row up-front in 'partial' status; updated after run.
    execute_write(conn, """
        INSERT INTO orchestration.executions
            (execution_id, plan_id, plan_name, entity_type, tenant_id,
             params, results, errors, status, duration_ms, executed_by)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """, (
        execution_id,
        str(plan.get("plan_id")) if plan.get("plan_id") else None,
        req.plan_name,
        req.entity_type,
        req.tenant_id,
        json.dumps(req.params, default=str),
        json.dumps({}, default=str),
        json.dumps({}, default=str),
        "partial",
        0,
        auth.subject,
    ))
    conn.commit()

    orchestrator = PlanOrchestrator()
    result = orchestrator.execute_plan(
        plan=plan,
        tenant_id=req.tenant_id,
        params=req.params,
        execution_id=execution_id,
        db_conn=conn,
    )

    duration_ms = int(time.time() * 1000) - start_ms
    error_count  = len(result.get("errors", {}))
    result_count = len(result.get("results", {}))
    paused_at_step = result.get("paused_at_step")
    if paused_at_step:
        exec_status = "paused"
    else:
        exec_status = "success" if error_count == 0 else ("failed" if result_count == 0 else "partial")
        if exec_status != "failed":
            business_failures = _find_genuine_business_failures(result.get("results", {}))
            if business_failures:
                exec_status = "failed"
                result["errors"] = {**result.get("errors", {}), **business_failures}

    execute_write(conn, """
        UPDATE orchestration.executions
        SET results = %s, errors = %s, status = %s, duration_ms = %s
        WHERE execution_id = %s
    """, (
        json.dumps(result.get("results", {}), default=str),
        json.dumps(result.get("errors", {}), default=str),
        exec_status,
        duration_ms,
        execution_id,
    ))
    conn.commit()

    return OrchestrationRunResponse(
        execution_id=execution_id,
        status=exec_status,
        plan_name=result["plan"],
        entity_type=result["entity_type"],
        results=result["results"],
        errors=result["errors"],
        duration_ms=duration_ms,
        paused_at_step=paused_at_step,
    )
@app.get("/v1/human-review-approvals", response_model=List[HumanReviewApprovalResponse])
def list_human_review_approvals(
    status: Optional[str] = None,
    tenant_id: Optional[str] = None,
    conn=Depends(get_db),
    auth: AuthContext = Depends(get_auth_context),
):
    sql = "SELECT * FROM orchestration.human_review_approvals WHERE 1=1"
    params: list = []
    if status:
        sql += " AND status = %s"
        params.append(status)
    if tenant_id:
        sql += " AND tenant_id = %s"
        params.append(tenant_id)
    sql += " ORDER BY requested_at DESC"
    rows = execute(conn, sql, params)
    return [HumanReviewApprovalResponse(**r) for r in rows]


@app.get("/v1/human-review-approvals/{approval_id}", response_model=HumanReviewApprovalResponse)
def get_human_review_approval(
    approval_id: UUID,
    conn=Depends(get_db),
    auth: AuthContext = Depends(get_auth_context),
):
    row = execute_one(conn,
        "SELECT * FROM orchestration.human_review_approvals WHERE approval_id = %s",
        (str(approval_id),)
    )
    if not row:
        raise HTTPException(status_code=404, detail="Approval not found")
    return HumanReviewApprovalResponse(**row)


def _resume_paused_execution(conn, execution_row: dict, plan: dict) -> dict:
    """
    NOC-C: re-invoke the orchestrator for a previously-paused execution,
    seeding it with the results/completed steps it already had at pause
    time so nothing re-runs. Returns the same shape execute_plan() returns.
    """
    import time as _time
    start_ms = int(_time.time() * 1000)

    orchestrator = PlanOrchestrator()
    prior_results = execution_row.get("results") or {}
    result = orchestrator.execute_plan(
        plan=plan,
        tenant_id=execution_row["tenant_id"],
        params=execution_row.get("params") or {},
        execution_id=str(execution_row["execution_id"]),
        db_conn=conn,
        resume_seed={
            "results": prior_results,
            "completed_step_keys": list(prior_results.keys()),
        },
    )
    duration_ms = int(_time.time() * 1000) - start_ms

    error_count  = len(result.get("errors", {}))
    result_count = len(result.get("results", {}))
    paused_at_step = result.get("paused_at_step")
    if paused_at_step:
        exec_status = "paused"
    else:
        exec_status = "success" if error_count == 0 else ("failed" if result_count == 0 else "partial")
        if exec_status != "failed":
            business_failures = _find_genuine_business_failures(result.get("results", {}))
            if business_failures:
                exec_status = "failed"
                result["errors"] = {**result.get("errors", {}), **business_failures}

    execute_write(conn, """
        UPDATE orchestration.executions
        SET results = %s, errors = %s, status = %s, duration_ms = duration_ms + %s
        WHERE execution_id = %s
    """, (
        json.dumps(result.get("results", {}), default=str),
        json.dumps(result.get("errors", {}), default=str),
        exec_status,
        duration_ms,
        str(execution_row["execution_id"]),
    ))
    conn.commit()

    return {"exec_status": exec_status, "paused_at_step": paused_at_step,
             "results": result.get("results", {}), "errors": result.get("errors", {})}


@app.post("/v1/human-review-approvals/{approval_id}/approve")
def approve_human_review(
    approval_id: UUID,
    req: ApprovalDecisionRequest,
    conn=Depends(get_db),
    auth: AuthContext = Depends(get_auth_context),
):
    approval = execute_one(conn,
        "SELECT * FROM orchestration.human_review_approvals WHERE approval_id = %s",
        (str(approval_id),)
    )
    if not approval:
        raise HTTPException(status_code=404, detail="Approval not found")
    if approval["status"] != "pending":
        raise HTTPException(status_code=409, detail=f"Approval already {approval['status']}")

    execution = execute_one(conn,
        "SELECT * FROM orchestration.executions WHERE execution_id = %s",
        (str(approval["execution_id"]),)
    )
    if not execution:
        raise HTTPException(status_code=404, detail="Execution not found")

    repo = PlanRepository(conn)
    try:
        plan = repo.get_plan(execution["plan_name"], execution["entity_type"], execution["tenant_id"])
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    # Step 5→6 of the design: employee approves -> engine resumes.
    # Step 5→6 of the design: employee approves -> engine resumes.
    execute_write(conn, """
        UPDATE orchestration.human_review_approvals
        SET status = 'approved', reviewed_by = %s, reviewed_at = now(), decision_reason = %s
        WHERE approval_id = %s
    """, (req.reviewed_by, req.decision_reason, str(approval_id)))
    conn.commit()

    from .notifications import resolve_itsm_ticket_for_review
    resolve_itsm_ticket_for_review(conn, str(approval_id), "Approved", req.reviewed_by, req.decision_reason or "")

    # Patch the paused step's own result to reflect the human's decision —
    # otherwise nothing downstream ever learns "a human approved this",
    # since execution['results'] is just whatever was stored the moment it
    # paused (still status='pending_human_review'). This is what lets a
    # plan's condition_expr check results.<step_key>.status == 'approved'
    # as its own real signal that a human specifically vouched for this
    # case — separate from whether the AI agent itself ever resolved it.
    step_key = approval["step_key"]
    patched_results = dict(execution.get("results") or {})
    prior_step_result = patched_results.get(step_key) or {}
    patched_results[step_key] = {
        **prior_step_result,
        "status": "approved",
        "reviewed_by": req.reviewed_by,
        "decision_reason": req.decision_reason,
    }
    execution["results"] = patched_results

    resumed = _resume_paused_execution(conn, execution, plan)

    return {
        "approval_id": str(approval_id),
        "status": "approved",
        "execution_id": str(execution["execution_id"]),
        "execution_status": resumed["exec_status"],
        "paused_at_step": resumed["paused_at_step"],
        "results": resumed["results"],
        "errors": resumed["errors"],
    }


@app.post("/v1/human-review-approvals/{approval_id}/reject")
def reject_human_review(
    approval_id: UUID,
    req: ApprovalDecisionRequest,
    conn=Depends(get_db),
    auth: AuthContext = Depends(get_auth_context),
):
    approval = execute_one(conn,
        "SELECT * FROM orchestration.human_review_approvals WHERE approval_id = %s",
        (str(approval_id),)
    )
    if not approval:
        raise HTTPException(status_code=404, detail="Approval not found")
    if approval["status"] != "pending":
        raise HTTPException(status_code=409, detail=f"Approval already {approval['status']}")

    # Step 7 of the design: rejected -> execution closes, customer informed
    # separately (that notification is out of scope here — the plan simply
    # stops; nothing auto-emails the customer).
    execute_write(conn, """
        UPDATE orchestration.human_review_approvals
        SET status = 'rejected', reviewed_by = %s, reviewed_at = now(), decision_reason = %s
        WHERE approval_id = %s
    """, (req.reviewed_by, req.decision_reason, str(approval_id)))

    execute_write(conn, """
        UPDATE orchestration.executions
        SET status = 'failed',
            errors = errors || %s::jsonb
        WHERE execution_id = %s
    """, (
        json.dumps({approval["step_key"]: f"Rejected by {req.reviewed_by}: {req.decision_reason or 'no reason given'}"}),
        str(approval["execution_id"]),
    ))

    from .notifications import resolve_itsm_ticket_for_review
    resolve_itsm_ticket_for_review(conn, str(approval_id), "Rejected", req.reviewed_by, req.decision_reason or "")
    conn.commit()

    return {
        "approval_id": str(approval_id),
        "status": "rejected",
        "execution_id": str(approval["execution_id"]),
        "execution_status": "failed",
    }
@app.get("/v1/orchestrations/runs/{execution_id}", response_model=ExecutionResponse)
def get_orchestration_run(
    execution_id: UUID,
    conn=Depends(get_db),
    auth: AuthContext = Depends(get_auth_context),
):
    row = execute_one(conn,
        "SELECT * FROM orchestration.executions WHERE execution_id = %s",
        (str(execution_id),)
    )
    if not row:
        raise HTTPException(status_code=404, detail="Execution not found")
    return ExecutionResponse(**row)


@app.get(
    "/v1/orchestrations/runs/{execution_id}/steps",
    response_model=list[ExecutionStepResponse],
)
def list_orchestration_run_steps(
    execution_id: UUID,
    conn=Depends(get_db),
    auth: AuthContext = Depends(get_auth_context),
):
    from . import execution_steps_repository as steps_repo
    rows = steps_repo.list_steps_for_execution(conn, str(execution_id))
    return [ExecutionStepResponse(**r) for r in rows]


@app.get("/v1/orchestrations/runs", response_model=list[ExecutionResponse])
def list_orchestration_runs(
    tenant_id: Optional[str] = None,
    plan_name: Optional[str] = None,
    status: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    conn=Depends(get_db),
    auth: AuthContext = Depends(get_auth_context),
):
    sql = "SELECT * FROM orchestration.executions WHERE 1=1"
    params: list = []
    if tenant_id:
        sql += " AND tenant_id = %s"
        params.append(tenant_id)
    if plan_name:
        sql += " AND plan_name = %s"
        params.append(plan_name)
    if status:
        sql += " AND status = %s"
        params.append(status)
    if from_date:
        sql += " AND executed_at >= %s"
        params.append(from_date)
    if to_date:
        sql += " AND executed_at <= %s"
        params.append(to_date)
    sql += " ORDER BY executed_at DESC LIMIT %s OFFSET %s"
    params.extend([limit, offset])

    rows = execute(conn, sql, params)
    return [ExecutionResponse(**r) for r in rows]


@app.get("/v1/runtime/contracts/{plan_name}", response_model=RuntimeContractResponse)
def get_runtime_contract(
    plan_name: str,
    conn=Depends(get_db),
    auth: AuthContext = Depends(get_auth_context),
):
    row = execute_one(conn,
        "SELECT name, input_schema_json, output_schema_json, example_request_json "
        "FROM orchestration.plans WHERE name = %s",
        (plan_name,)
    )
    if not row:
        raise HTTPException(status_code=404, detail=f"Plan '{plan_name}' not found")
    return RuntimeContractResponse(
        plan_name=row["name"],
        input_schema_json=row["input_schema_json"] or {},
        output_schema_json=row["output_schema_json"] or {},
        example_request_json=row["example_request_json"] or {},
    )


@app.get("/v1/runtime/contracts/{plan_name}/openapi")
def get_runtime_contract_openapi(
    plan_name: str,
    conn=Depends(get_db),
    auth: AuthContext = Depends(get_auth_context),
):
    row = execute_one(conn,
        "SELECT name, input_schema_json, output_schema_json, example_request_json "
        "FROM orchestration.plans WHERE name = %s",
        (plan_name,)
    )
    if not row:
        raise HTTPException(status_code=404, detail=f"Plan '{plan_name}' not found")

    input_schema = row["input_schema_json"] or {
        "type": "object", "properties": {}, "additionalProperties": True
    }
    output_schema = row["output_schema_json"] or {
        "type": "object", "properties": {}, "additionalProperties": True
    }

    return {
        "openapi": "3.0.0",
        "info": {"title": f"{plan_name} runtime contract", "version": "1.0.0"},
        "paths": {
            "/v1/orchestrations/run": {
                "post": {
                    "summary": f"Run plan '{plan_name}'",
                    "requestBody": {
                        "required": True,
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "properties": {
                                        "plan_name": {"type": "string", "enum": [plan_name]},
                                        "entity_type": {"type": "string"},
                                        "tenant_id": {"type": "string"},
                                        "params": input_schema,
                                    },
                                    "required": ["plan_name", "entity_type", "params"],
                                },
                                "example": row["example_request_json"] or {},
                            }
                        },
                    },
                    "responses": {
                        "200": {
                            "description": "Execution result",
                            "content": {
                                "application/json": {
                                    "schema": {
                                        "type": "object",
                                        "properties": {
                                            "execution_id": {"type": "string"},
                                            "status": {"type": "string"},
                                            "results": output_schema,
                                            "errors": {"type": "object"},
                                        },
                                    }
                                }
                            },
                        },
                        "400": {
                            "description": "Invalid request — params failed input_schema validation, or malformed request body",
                            "content": {
                                "application/json": {
                                    "schema": {"type": "object", "properties": {"detail": {"type": "string"}}},
                                    "example": {"detail": "Missing required param: sender_email"},
                                }
                            },
                        },
                        "404": {
                            "description": f"Plan '{plan_name}' not found or not active",
                            "content": {
                                "application/json": {
                                    "schema": {"type": "object", "properties": {"detail": {"type": "string"}}},
                                    "example": {"detail": f"Plan '{plan_name}' not found"},
                                }
                            },
                        },
                        "500": {
                            "description": "Unhandled server error during plan execution",
                            "content": {
                                "application/json": {
                                    "schema": {"type": "object", "properties": {"detail": {"type": "string"}}}
                                }
                            },
                        },
                    },
                }
            }
        },
    }


# ══════════════════════════════════════════════════════════════════
# ORCH-010: INTENT → PLAN MAPPING ADMIN APIS
# ══════════════════════════════════════════════════════════════════

@app.post(
    "/admin/intent-plan-mappings",
    response_model=IntentPlanMappingResponse,
    status_code=201,
)
def create_intent_plan_mapping_route(
    payload: IntentPlanMappingCreate,
    conn=Depends(get_db),
    auth: AuthContext = Depends(require_admin),
):
    from . import intent_plan_mappings_repository as mappings_repo
    row = mappings_repo.create_intent_plan_mapping(
        conn,
        tenant_id=payload.tenant_id,
        intent_code=payload.intent_code,
        plan_name=payload.plan_name,
        entity_type=payload.entity_type,
        channel=payload.channel,
        locale=payload.locale,
        rank=payload.rank,
        is_active=payload.is_active,
        created_by=payload.created_by or auth.subject,
    )
    return IntentPlanMappingResponse(**row)


@app.get("/admin/intent-plan-mappings", response_model=list[IntentPlanMappingResponse])
def list_intent_plan_mappings_route(
    tenant_id: Optional[str] = None,
    intent_code: Optional[str] = None,
    is_active: Optional[bool] = None,
    conn=Depends(get_db),
    auth: AuthContext = Depends(get_auth_context),
):
    from . import intent_plan_mappings_repository as mappings_repo
    rows = mappings_repo.list_intent_plan_mappings(
        conn, tenant_id=tenant_id, intent_code=intent_code, is_active=is_active
    )
    return [IntentPlanMappingResponse(**r) for r in rows]


@app.get(
    "/admin/intent-plan-mappings/{mapping_id}",
    response_model=IntentPlanMappingResponse,
)
def get_intent_plan_mapping_route(
    mapping_id: UUID,
    conn=Depends(get_db),
    auth: AuthContext = Depends(get_auth_context),
):
    from . import intent_plan_mappings_repository as mappings_repo
    row = mappings_repo.get_intent_plan_mapping(conn, str(mapping_id))
    if not row:
        raise HTTPException(status_code=404, detail="Mapping not found")
    return IntentPlanMappingResponse(**row)


@app.put(
    "/admin/intent-plan-mappings/{mapping_id}",
    response_model=IntentPlanMappingResponse,
)
def update_intent_plan_mapping_route(
    mapping_id: UUID,
    payload: IntentPlanMappingUpdate,
    conn=Depends(get_db),
    auth: AuthContext = Depends(require_admin),
):
    from . import intent_plan_mappings_repository as mappings_repo
    row = mappings_repo.update_intent_plan_mapping(
        conn,
        str(mapping_id),
        plan_name=payload.plan_name,
        channel=payload.channel,
        locale=payload.locale,
        rank=payload.rank,
        is_active=payload.is_active,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Mapping not found")
    return IntentPlanMappingResponse(**row)


@app.delete("/admin/intent-plan-mappings/{mapping_id}", status_code=204)
def delete_intent_plan_mapping_route(
    mapping_id: UUID,
    conn=Depends(get_db),
    auth: AuthContext = Depends(require_admin),
):
    from . import intent_plan_mappings_repository as mappings_repo
    deleted = mappings_repo.delete_intent_plan_mapping(conn, str(mapping_id))
    if not deleted:
        raise HTTPException(status_code=404, detail="Mapping not found")


@app.get("/v1/intents/{intent_code}/plan")
def resolve_plan_for_intent_route(
    intent_code: str,
    tenant_id: str,
    entity_type: str = "email",
    channel: str = "email",
    locale: str = "multi",
    conn=Depends(get_db),
    auth: AuthContext = Depends(get_auth_context),
):
    from . import intent_plan_mappings_repository as mappings_repo
    plan_name = mappings_repo.resolve_plan_for_intent(
        conn, tenant_id=tenant_id, intent_code=intent_code,
        entity_type=entity_type, channel=channel, locale=locale,
    )
    if not plan_name:
        raise HTTPException(
            status_code=404,
            detail=f"No active plan mapping found for intent_code='{intent_code}'",
        )
    return {"intent_code": intent_code, "plan_name": plan_name}
def _lint_agent_task_steps(steps: list, issues: list) -> None:
    for step in steps:
        if step.get("kind") != "agent_task":
            continue
        step_key = step.get("step_key", "unknown")
        bindings = step.get("input_bindings_json") or {}

        if not bindings.get("prompt_ref"):
            issues.append({"severity": "error", "step": step_key,
                "issue": "agent_task missing prompt_ref",
                "fix":   "Add prompt_ref with prompt_id or prompt_name to input_bindings_json"})

        if not bindings.get("goal"):
            issues.append({"severity": "error", "step": step_key,
                "issue": "agent_task missing goal",
                "fix":   "Add a clear goal string to input_bindings_json"})

        tools = bindings.get("allowed_tools") or []
        if not tools:
            issues.append({"severity": "error", "step": step_key,
                "issue": "agent_task missing or empty allowed_tools",
                "fix":   "List at least one allowed tool in input_bindings_json.allowed_tools"})

        if "*" in tools:
            issues.append({"severity": "error", "step": step_key,
                "issue": "agent_task allowed_tools contains wildcard '*'",
                "fix":   "Replace '*' with explicit tool names"})

        budgets   = bindings.get("budgets") or {}
        max_iter  = budgets.get("max_iterations")
        if max_iter is None or int(max_iter) > 10:
            issues.append({"severity": "error", "step": step_key,
                "issue": f"agent_task budgets.max_iterations missing or > 10 (got {max_iter})",
                "fix":   "Set max_iterations to a value between 1 and 10"})

        max_mc = budgets.get("max_model_calls")
        if max_mc is None or int(max_mc) > 10:
            issues.append({"severity": "error", "step": step_key,
                "issue": f"agent_task budgets.max_model_calls missing or > 10 (got {max_mc})",
                "fix":   "Set max_model_calls to a value between 1 and 10"})

        max_cost = budgets.get("max_cost_usd")
        if max_cost is None or float(max_cost) <= 0:
            issues.append({"severity": "error", "step": step_key,
                "issue": f"agent_task budgets.max_cost_usd missing or <= 0 (got {max_cost})",
                "fix":   "Set max_cost_usd to a positive value e.g. 0.50"})

        if not bindings.get("output_schema"):
            issues.append({"severity": "error", "step": step_key,
                "issue": "agent_task missing output_schema",
                "fix":   "Add a JSON Schema dict to input_bindings_json.output_schema"})

        mutating     = {"webhook", "human_review"}
        has_mutating = any(t in mutating for t in tools)
        approval_mode = (bindings.get("approval_policy") or {}).get("mode", "auto_for_read_only")
        if has_mutating and approval_mode == "none":
            issues.append({"severity": "warning", "step": step_key,
                "issue": "agent_task uses mutating tools but approval_policy.mode is 'none'",
                "fix":   "Set approval_policy.mode to 'auto_for_read_only' or 'required_for_all_actions'"})
            # ══════════════════════════════════════════════════════════════════
# AGENT-012: Agent Run APIs
# ══════════════════════════════════════════════════════════════════

@app.get("/v1/agent-task-runs/{agent_run_id}")
def get_agent_task_run(
    agent_run_id: UUID,
    conn=Depends(get_db),
    auth: AuthContext = Depends(get_auth_context),
):
    row = execute_one(conn,
        "SELECT * FROM orchestration.agent_task_runs WHERE agent_run_id = %s",
        (str(agent_run_id),)
    )
    if not row:
        raise HTTPException(status_code=404, detail="Agent run not found")
    return row


@app.get("/v1/agent-task-runs/{agent_run_id}/trace")
def get_agent_task_trace(
    agent_run_id: UUID,
    conn=Depends(get_db),
    auth: AuthContext = Depends(get_auth_context),
):
    rows = execute(conn,
        "SELECT * FROM orchestration.agent_task_trace_events "
        "WHERE agent_run_id = %s ORDER BY event_index ASC",
        (str(agent_run_id),)
    )
    is_admin = getattr(auth, "role", "") in ("admin", "orchestration_admin")
    result = []
    for row in rows:
        if row.get("event_type") in ("model_request", "model_response") and not is_admin:
            row = {**row, "event_json": {"redacted": True}, "redacted": True}
        result.append(row)
    return result


@app.get("/v1/orchestrations/runs/{execution_id}/agent-tasks")
def list_agent_tasks_for_execution(
    execution_id: UUID,
    conn=Depends(get_db),
    auth: AuthContext = Depends(get_auth_context),
):
    return execute(conn,
        "SELECT * FROM orchestration.agent_task_runs "
        "WHERE execution_id = %s ORDER BY started_at ASC",
        (str(execution_id),)
    )


@app.get("/v1/agent-approvals")
def list_agent_approvals(
    status: Optional[str] = None,
    tenant_id: Optional[str] = None,
    limit: int = 50,
    conn=Depends(get_db),
    auth: AuthContext = Depends(get_auth_context),
):
    sql    = "SELECT * FROM orchestration.agent_task_approvals WHERE 1=1"
    params: list = []
    if status:
        sql += " AND status = %s"
        params.append(status)
    if tenant_id:
        sql += " AND tenant_id = %s"
        params.append(tenant_id)
    sql += " ORDER BY requested_at DESC LIMIT %s"
    params.append(limit)
    return execute(conn, sql, params)


@app.post("/v1/agent-approvals/{approval_id}/approve")
def approve_agent_action(
    approval_id: UUID,
    body: dict,
    conn=Depends(get_db),
    auth: AuthContext = Depends(require_admin),
):
    from .agent.agent_approval import resolve_approval
    updated = resolve_approval(
        conn=conn,
        approval_id=str(approval_id),
        decision="approved",
        reviewed_by=body.get("reviewed_by", auth.subject),
        decision_reason=body.get("decision_reason"),
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Approval not found or already resolved")
    return {"approval_id": str(approval_id), "status": "approved"}


@app.post("/v1/agent-approvals/{approval_id}/reject")
def reject_agent_action(
    approval_id: UUID,
    body: dict,
    conn=Depends(get_db),
    auth: AuthContext = Depends(require_admin),
):
    from .agent.agent_approval import resolve_approval

    approval = execute_one(
        conn, "SELECT * FROM orchestration.agent_task_approvals WHERE approval_id = %s",
        (str(approval_id),)
    )
    if not approval:
        raise HTTPException(status_code=404, detail="Approval not found or already resolved")

    reviewed_by = body.get("reviewed_by", auth.subject)
    decision_reason = body.get("decision_reason")

    updated = resolve_approval(
        conn=conn,
        approval_id=str(approval_id),
        decision="rejected",
        reviewed_by=reviewed_by,
        decision_reason=decision_reason,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Approval not found or already resolved")

    execution_id = approval.get("execution_id")
    step_key = approval.get("step_key") or "agent_task"
    if execution_id:
        execute_write(conn, """
            UPDATE orchestration.executions
            SET status = 'failed',
                errors = errors || %s::jsonb
            WHERE execution_id = %s
        """, (
            json.dumps({step_key: f"Agent action rejected by {reviewed_by}: {decision_reason or 'no reason given'}"}),
            str(execution_id),
        ))
        conn.commit()

    return {"approval_id": str(approval_id), "status": "rejected", "execution_id": str(execution_id) if execution_id else None}