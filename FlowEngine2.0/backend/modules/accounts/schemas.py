# backend/modules/accounts/schemas.py

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, EmailStr, validator


class AccountCreateRequest(BaseModel):
    email: EmailStr
    modules: List[str]
    account_type: str = "trial"
    expires_at: Optional[str] = None

    @validator("email")
    def email_lowercase(cls, v):
        return v.lower()

    @validator("modules")
    def validate_modules(cls, v):
        if not v:
            raise ValueError("At least one module must be selected")
        return v
class AccountResponse(BaseModel):
    id: str
    email: str
    tenant_id: str
    modules: List[str]
    status: str
    created_at: datetime

class ModuleItem(BaseModel):
    id: str
    name: str
    description: Optional[str] = None

class ModulesResponse(BaseModel):
    modules: List[ModuleItem]


class ApiKeyInfo(BaseModel):
    account_id: str
    email: str
    tenant_id: str
    message: str