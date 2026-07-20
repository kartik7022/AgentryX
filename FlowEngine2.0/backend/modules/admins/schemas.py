# backend/modules/admins/schemas.py

from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class AdminLoginRequest(BaseModel):
    username: str
    password: str


class AdminLoginResponse(BaseModel):
    success: bool
    message: str
    username: str = ""
    role: str = ""


class AdminCreateRequest(BaseModel):
    username: str
    password: str


class AdminUpdateRequest(BaseModel):
    password: Optional[str] = None
    is_active: Optional[bool] = None


class AdminResponse(BaseModel):
    id: str
    username: str
    role: str
    is_active: bool
    created_at: Optional[datetime] = None
    created_by_username: Optional[str] = None