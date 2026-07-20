# backend/modules/users/schemas.py

from pydantic import BaseModel, EmailStr, validator
from typing import Optional, List
from datetime import datetime

VALID_ROLES = {"tenant_co_admin", "tenant_module_user"}


class TenantUserCreate(BaseModel):
    email: EmailStr
    full_name: str
    role: str = "tenant_module_user"
    status: Optional[str] = "active"
    modules: Optional[List[str]] = []

    @validator("email")
    def email_lowercase(cls, v):
        return v.lower()

    @validator("full_name")
    def full_name_not_empty(cls, v):
        if not v.strip():
            raise ValueError("Full name cannot be empty.")
        return v.strip()

    @validator("role")
    def role_valid(cls, v):
        if v not in VALID_ROLES:
            raise ValueError(f"Role must be one of: {', '.join(VALID_ROLES)}.")
        return v

    @validator("modules", always=True)
    def modules_required_for_module_user(cls, v, values):
        role = values.get("role")
        if role == "tenant_module_user" and not v:
            raise ValueError("At least one module must be assigned for tenant_module_user.")
        return v or []


class TenantUserUpdate(BaseModel):
    full_name: Optional[str] = None
    status: Optional[str] = None
    modules: Optional[List[str]] = None

    @validator("full_name")
    def full_name_not_empty(cls, v):
        if v is not None and not v.strip():
            raise ValueError("Full name cannot be empty.")
        return v.strip() if v else v

    @validator("status")
    def status_valid(cls, v):
        if v is not None and v not in ("active", "inactive"):
            raise ValueError("Status must be 'active' or 'inactive'.")
        return v


class TenantUserOut(BaseModel):
    id: str
    tenant_id: str
    email: str
    full_name: str
    role: str
    modules: List[str] = []
    status: str
    created_at: datetime

    class Config:
        from_attributes = True