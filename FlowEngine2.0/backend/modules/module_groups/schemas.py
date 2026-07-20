# backend/modules/module_groups/schemas.py

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel


class ModuleGroupCreate(BaseModel):
    name: str
    description: Optional[str] = None
    display_order: int = 0


class ModuleGroupUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    display_order: Optional[int] = None
    status: Optional[str] = None


class ModuleGroupOut(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    display_order: int
    status: str
    created_at: datetime
    updated_at: Optional[datetime] = None


class ModuleGroupListResponse(BaseModel):
    groups: List[ModuleGroupOut]
    count: int