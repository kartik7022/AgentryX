# services/agent/agent_contract.py
from __future__ import annotations
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, model_validator


class PromptRef(BaseModel):
    prompt_id:   Optional[str] = None
    prompt_name: Optional[str] = None
    version:     str = "published"

    @model_validator(mode="after")
    def at_least_one_identifier(self) -> "PromptRef":
        if not self.prompt_id and not self.prompt_name:
            raise ValueError("PromptRef requires at least one of prompt_id or prompt_name")
        return self


class AgentBudgetConfig(BaseModel):
    max_iterations:  int   = Field(default=5,      ge=1, le=10)
    max_model_calls: int   = Field(default=10,     ge=1, le=10)
    max_tool_calls:  int   = Field(default=20,     ge=0, le=20)
    max_cost_usd:    float = Field(default=1.0,    gt=0)
    max_rows:        int   = Field(default=10000,  ge=0)
    max_bytes_mb:    float = Field(default=50.0,   ge=0)
    timeout_ms:      int   = Field(default=120000, ge=1000)


class AgentApprovalPolicy(BaseModel):
    mode:                 str       = Field(
        default="auto_for_read_only",
        pattern="^(none|auto_for_read_only|required_for_all_actions)$",
    )
    require_approval_for: List[str] = Field(default_factory=list)


class AgentFallbackPolicy(BaseModel):
    on_budget_exceeded:   str = Field(default="fail",         pattern="^(fail|human_review)$")
    on_output_invalid:    str = Field(default="human_review", pattern="^(fail|human_review)$")
    on_approval_rejected: str = Field(default="fail",         pattern="^(fail|human_review)$")


class AgentTaskConfig(BaseModel):
    prompt_ref:      PromptRef
    goal:            str                = Field(..., min_length=1)
    runtime_params:  Dict[str, Any]     = Field(default_factory=dict)
    allowed_tools:   List[str]          = Field(..., min_length=1)
    approval_policy: AgentApprovalPolicy  = Field(default_factory=AgentApprovalPolicy)
    budgets:         AgentBudgetConfig    = Field(default_factory=AgentBudgetConfig)
    output_schema:   Dict[str, Any]     = Field(...)
    fallback_policy: AgentFallbackPolicy  = Field(default_factory=AgentFallbackPolicy)
    evaluation_suite: List[Dict[str, Any]] = Field(default_factory=list)
    pass_threshold:   float               = Field(default=0.8, ge=0.0, le=1.0)

    @model_validator(mode="after")
    def validate_tools_no_wildcard(self) -> "AgentTaskConfig":
        if "*" in self.allowed_tools:
            raise ValueError("allowed_tools cannot contain '*' — explicitly list the tools you need")
        if not self.allowed_tools:
            raise ValueError("allowed_tools must contain at least one tool name")
        if not self.output_schema:
            raise ValueError("output_schema is required and cannot be empty")
        return self