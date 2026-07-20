from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional
from uuid import UUID
from datetime import datetime

from pydantic import BaseModel, Field

PlanStepKind = Literal[
    "sql",
    "rest",
    "graphql",
    "ai_transform",
    "intent_classify",
    "policy_route",
    "intent_validate",
    "adapter_analyze",
    "prompt_run",
    "document_generate",
    "human_review",
    "webhook",
    "agent_task",
]


# ── Step Schemas ───────────────────────────────────────────────────

class PlanStepCreate(BaseModel):
    step_key:               str
    step_order:             int                         = 1
    kind:                   PlanStepKind                = "sql"
    datasource_name:        str                         = ""
    sql_template:           Optional[str]               = None
    method:                 Optional[str]               = None
    path_template:          Optional[str]               = None
    query_params_json:      Dict[str, Any]              = Field(default_factory=dict)
    body_json:              Optional[Any]               = None
    graphql_query_template: Optional[str]               = None
    graphql_vars_json:      Optional[Dict[str, Any]]    = None
    ai_prompt_template:     Optional[str]               = None
    ai_output_schema:       Optional[Any]               = None
    depends_on:             List[str]                   = Field(default_factory=list)
    condition_expr:         Optional[str]               = None
    input_bindings_json:    Dict[str, Any]              = Field(default_factory=dict)
    timeout_ms:             int                         = 5000
    enabled:                bool                        = True

    class Config:
        extra = "allow"


class PlanStepResponse(BaseModel):
    plan_step_id:           UUID
    plan_id:                UUID
    step_key:               str
    step_order:             int
    kind:                   PlanStepKind
    datasource_name:        str
    sql_template:           Optional[str]               = None
    method:                 Optional[str]               = None
    path_template:          Optional[str]               = None
    query_params_json:      Dict[str, Any]              = Field(default_factory=dict)
    body_json:              Optional[Any]               = None
    graphql_query_template: Optional[str]               = None
    graphql_vars_json:      Optional[Dict[str, Any]]    = None
    ai_prompt_template:     Optional[str]               = None
    ai_output_schema:       Optional[Any]               = None
    depends_on:             List[str]                   = Field(default_factory=list)
    condition_expr:         Optional[str]               = None
    input_bindings_json:    Dict[str, Any]              = Field(default_factory=dict)
    timeout_ms:             int                         = 5000
    enabled:                bool                        = True
    created_at:             datetime

    class Config:
        from_attributes = True


# ── Plan Schemas ───────────────────────────────────────────────────

class PlanCreate(BaseModel):
    name:            str
    entity_type:     str
    description:     Optional[str]           = None
    steps:           List[PlanStepCreate]    = Field(default_factory=list)
    tenant_id:       Optional[str]           = None
    error_policy:    str                     = "best_effort"
    max_concurrency: int                     = 8


class PlanUpdate(BaseModel):
    name:            Optional[str]           = None
    entity_type:     Optional[str]           = None
    description:     Optional[str]           = None
    steps:           Optional[List[PlanStepCreate]] = None
    tenant_id:       Optional[str]           = None
    error_policy:    Optional[str]           = None
    max_concurrency: Optional[int]           = None


class PlanResponse(BaseModel):
    plan_id:         UUID
    name:            str
    entity_type:     str
    description:     Optional[str]               = None
    is_active:       bool
    version:         int
    tenant_id:       Optional[str]               = None
    error_policy:    str
    max_concurrency: int
    steps:           List[PlanStepResponse]      = Field(default_factory=list)
    created_by:      Optional[str]               = None
    created_at:      datetime
    updated_at:      datetime

    class Config:
        from_attributes = True


class PlanCloneRequest(BaseModel):
    new_name: str = Field(..., min_length=1)


# ── Execute Schemas ────────────────────────────────────────────────

class Entity360Request(BaseModel):
    tenant_id:   str
    entity_type: str
    plan_name:   str
    params:      Dict[str, str]


class Entity360Result(BaseModel):
    entity_type: str
    plan:        str
    params:      Dict[str, str]
    results:     Dict[str, Any]
    errors:      Dict[str, str]


# ── Auth Schemas ───────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token:  str
    refresh_token: str
    token_type:    str = "bearer"
    expires_in:    int
    user:          UserResponse


class RefreshRequest(BaseModel):
    refresh_token: str


class UserResponse(BaseModel):
    user_id:   str
    username:  str
    role:      str
    tenant_id: Optional[str] = None

    class Config:
        from_attributes = True


# ── Execution Schemas ──────────────────────────────────────────────

class ExecutionResponse(BaseModel):
    execution_id: UUID
    plan_id:      Optional[UUID]   = None
    plan_name:    str
    entity_type:  str
    tenant_id:    str
    params:       Dict[str, Any]
    results:      Dict[str, Any]
    errors:       Dict[str, str]
    status:       str
    duration_ms:  int
    executed_by:  Optional[str]    = None
    executed_at:  datetime

    class Config:
        from_attributes = True


# ── Plan Version Schemas ───────────────────────────────────────────

class PlanVersionResponse(BaseModel):
    version_id:   UUID
    plan_id:      UUID
    version:      int
    snapshot:     Dict[str, Any]
    change_notes: Optional[str]  = None
    created_by:   Optional[str]  = None
    created_at:   datetime

    class Config:
        from_attributes = True


class PlanVersionCreate(BaseModel):
    change_notes: Optional[str] = None


# ── Tenant Policy Schemas ──────────────────────────────────────────

class TenantPolicyCreate(BaseModel):
    max_concurrency: int           = 8
    max_retries:     int           = 3
    timeout_ms:      int           = 5000
    error_policy:    str           = "best_effort"
    is_active:       bool          = True
    notes:           Optional[str] = None


class TenantPolicyResponse(BaseModel):
    tenant_id:       str
    max_concurrency: int
    max_retries:     int
    timeout_ms:      int
    error_policy:    str
    is_active:       bool
    notes:           Optional[str] = None
    created_at:      datetime
    updated_at:      datetime

    class Config:
        from_attributes = True


# ── Tenant Budget Schemas ──────────────────────────────────────────

class TenantBudgetCreate(BaseModel):
    max_rows:     int   = 100000
    max_bytes_mb: int   = 512
    max_cost_usd: float = 50.0
    alert_at_pct: int   = 80


class TenantBudgetResponse(BaseModel):
    tenant_id:    str
    max_rows:     int
    max_bytes_mb: int
    max_cost_usd: float
    alert_at_pct: int
    created_at:   datetime
    updated_at:   datetime

    class Config:
        from_attributes = True


# ── Datasource Schemas ─────────────────────────────────────────────

class DatasourceCreate(BaseModel):
    name:          str
    kind:          str
    host:          Optional[str]       = None
    port:          Optional[str]       = None
    database_name: Optional[str]       = None
    username:      Optional[str]       = None
    description:   Optional[str]       = None
    is_active:     bool                = True
    tags:          List[str]           = Field(default_factory=list)
    tenant_id:     Optional[str]       = None


class DatasourceResponse(BaseModel):
    datasource_id: UUID
    name:          str
    kind:          str
    host:          Optional[str]       = None
    port:          Optional[str]       = None
    database_name: Optional[str]       = None
    username:      Optional[str]       = None
    description:   Optional[str]       = None
    is_active:     bool
    tags:          List[str]           = Field(default_factory=list)
    tenant_id:     Optional[str]       = None
    created_at:    datetime
    updated_at:    datetime

    class Config:
        from_attributes = True


class DatasourceUpdate(BaseModel):
    name:          Optional[str]       = None
    kind:          Optional[str]       = None
    host:          Optional[str]       = None
    port:          Optional[str]       = None
    database_name: Optional[str]       = None
    username:      Optional[str]       = None
    description:   Optional[str]       = None
    is_active:     Optional[bool]      = None
    tags:          Optional[List[str]] = None
    tenant_id:     Optional[str]       = None


# ── User Schemas ───────────────────────────────────────────────────

class UserCreate(BaseModel):
    username:  str
    password:  str
    role:      str           = "orchestration_viewer"
    tenant_id: Optional[str] = None


class UserUpdate(BaseModel):
    role:      Optional[str]  = None
    tenant_id: Optional[str]  = None
    is_active: Optional[bool] = None


class UserDetailResponse(BaseModel):
    user_id:    UUID
    username:   str
    role:       str
    tenant_id:  Optional[str] = None
    is_active:  bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

        # ── ORCH-010: Runtime Run Schemas ───────────────────────────────────

class OrchestrationRunRequest(BaseModel):
    plan_name:   str
    entity_type: str
    tenant_id:   str = "global"
    params:      Dict[str, Any] = Field(default_factory=dict)


class OrchestrationRunResponse(BaseModel):
    execution_id: UUID
    status:       str
    plan_name:    str
    entity_type:  str
    results:      Dict[str, Any]
    errors:       Dict[str, str]
    duration_ms:  int
    paused_at_step: Optional[str] = None


class HumanReviewApprovalResponse(BaseModel):
    approval_id:     UUID
    execution_id:    UUID
    step_key:        str
    tenant_id:       str
    status:          str
    reason:          Optional[str] = None
    context_json:    Dict[str, Any]
    requested_at:    datetime
    reviewed_by:     Optional[str] = None
    reviewed_at:     Optional[datetime] = None
    decision_reason: Optional[str] = None

    class Config:
        from_attributes = True


class ApprovalDecisionRequest(BaseModel):
    reviewed_by:     str
    decision_reason: Optional[str] = None


class ExecutionStepResponse(BaseModel):
    execution_step_id: UUID
    execution_id:       UUID
    plan_step_id:        Optional[UUID] = None
    step_key:            str
    kind:                str
    status:              str
    request_json:        Dict[str, Any] = Field(default_factory=dict)
    response_json:       Dict[str, Any] = Field(default_factory=dict)
    error_json:          Dict[str, Any] = Field(default_factory=dict)
    evidence_json:        Dict[str, Any] = Field(default_factory=dict)
    retry_count:          int = 0
    started_at:           Optional[datetime] = None
    completed_at:          Optional[datetime] = None
    duration_ms:           int = 0

    class Config:
        from_attributes = True


class RuntimeContractResponse(BaseModel):
    plan_name:             str
    input_schema_json:      Dict[str, Any] = Field(default_factory=dict)
    output_schema_json:      Dict[str, Any] = Field(default_factory=dict)
    example_request_json:    Dict[str, Any] = Field(default_factory=dict)


# ── ORCH-010: Intent Plan Mapping Schemas ───────────────────────────

class IntentPlanMappingCreate(BaseModel):
    tenant_id:   str
    intent_code: str
    plan_name:   str
    entity_type: str = "email"
    channel:     str = "email"
    locale:      str = "multi"
    rank:        int = 1
    is_active:   bool = True
    created_by:  Optional[str] = None


class IntentPlanMappingUpdate(BaseModel):
    plan_name: Optional[str]  = None
    channel:   Optional[str]  = None
    locale:    Optional[str]  = None
    rank:      Optional[int]  = None
    is_active: Optional[bool] = None


class IntentPlanMappingResponse(BaseModel):
    mapping_id:  UUID
    tenant_id:   str
    intent_code: str
    entity_type: str
    plan_name:   str
    channel:     Optional[str] = None
    locale:      Optional[str] = None
    rank:        int
    is_active:   bool
    created_by:  Optional[str] = None
    created_at:  datetime

    class Config:
        from_attributes = True