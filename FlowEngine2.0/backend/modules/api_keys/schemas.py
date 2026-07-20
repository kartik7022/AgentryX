# backend/modules/api_keys/schemas.py

from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class ApiKeyGenerateRequest(BaseModel):
    pass


class ApiKeyOut(BaseModel):
    id: str
    api_key: str
    status: str
    roles: list[str] = []
    created_at: datetime
    expires_at: Optional[datetime]


class ApiKeyListItem(BaseModel):
    id: str
    api_key: str
    status: str
    roles: list[str] = []
    created_at: datetime
    expires_at: Optional[datetime]


class ApiKeyListOut(BaseModel):
    api_keys: list[ApiKeyListItem]