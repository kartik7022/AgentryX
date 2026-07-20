# backend/modules/platforms_modules/schemas.py

from pydantic import BaseModel, validator
from typing import List, Optional
from datetime import datetime


class ModuleCreate(BaseModel):
    """Schema for creating a new module"""
    name: str
    description: Optional[str] = None
    version: Optional[str] = "1.0.0"
    is_default: Optional[bool] = False
    sidebar_items: Optional[List[str]] = []
    external_url: Optional[str] = None
    icon: Optional[str] = None
    display_order: int = 0
    features: List[str] = []
    default_permissions: List[str] = []
    status: str = "active"
    group_id: Optional[str] = None
    free_plan: Optional[bool] = False
    trial_weeks: Optional[int] = 2
    api_calls_allowed: Optional[int] = 0

    @validator("status")
    def validate_status(cls, v):
        if v not in ["active", "inactive", "archived"]:
            raise ValueError("Status must be 'active', 'inactive', or 'archived'")
        return v


class ModuleUpdate(BaseModel):
    description: Optional[str] = None
    version: Optional[str] = None
    status: Optional[str] = None
    is_default: Optional[bool] = None
    sidebar_items: Optional[List[str]] = None
    external_url: Optional[str] = None
    icon: Optional[str] = None
    display_order: Optional[int] = None
    features: Optional[List[str]] = None
    default_permissions: Optional[List[str]] = None
    group_id: Optional[str] = None
    free_plan: Optional[bool] = None
    trial_weeks: Optional[int] = None
    api_calls_allowed: Optional[int] = None

    @validator("status")
    def validate_status(cls, v):
        if v is not None and v not in ["active", "inactive", "archived"]:
            raise ValueError("Status must be 'active', 'inactive', or 'archived'")
        return v


class ModuleOut(BaseModel):
    id: str
    name: str
    description: Optional[str]
    icon: Optional[str]
    version: Optional[str]
    display_order: int = 0
    features: List[str] = []
    default_permissions: List[str] = []
    is_default: bool
    status: str
    sidebar_items: List[str] = []
    external_url: Optional[str] = None
    group_id: Optional[str] = None
    group_name: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    free_plan: bool = False
    trial_weeks: int = 2
    api_calls_allowed: int = 0


class ModuleListResponse(BaseModel):
    modules: List[ModuleOut]
    count: int


class TenantModuleAssignRequest(BaseModel):
    module_ids: List[str]


class TenantModuleOut(BaseModel):
    id: str
    tenant_id: str
    module_id: str
    module_name: Optional[str] = None
    status: str
    assigned_at: Optional[datetime] = None


class DefaultModulesResponse(BaseModel):
    modules: List[ModuleOut]
    count: int