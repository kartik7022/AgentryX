# backend/modules/datasource_types/schemas.py

from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel


VALID_RUNTIME_OWNERS = ["drivers_service", "semantic_engine", "shared"]
VALID_PROTOCOLS = ["sql", "soql", "rest", "graphql"]
VALID_ALIAS_TYPES = ["canonical", "driver_family", "datasource_type", "legacy", "ui"]


# ── Alias schemas ─────────────────────────────────────────────────────────────

class AliasCreate(BaseModel):
    alias_name: str
    alias_type: str
    is_active: bool = True


class AliasResponse(BaseModel):
    alias_id: int
    driver_id: int
    alias_name: str
    alias_type: str
    is_active: bool
    created_at: datetime


    # ── Driver schemas ────────────────────────────────────────────────────────────

class DriverCreate(BaseModel):
    canonical_name: str
    display_name: str
    runtime_owner: str = "shared"
    protocol: str
    dialect_token: str
    implementation_key: str
    auth_style: str = "broker"
    capabilities: Dict[str, Any] = {}
    config_schema: Dict[str, Any] = {}
    is_active: bool = True


class DriverUpdate(BaseModel):
    display_name: str
    runtime_owner: str
    protocol: str
    dialect_token: str
    implementation_key: str
    auth_style: str
    capabilities: Dict[str, Any]
    config_schema: Dict[str, Any]
    is_active: bool


class DriverResponse(BaseModel):
    driver_id: int
    canonical_name: str
    display_name: str
    runtime_owner: str
    protocol: str
    dialect_token: str
    implementation_key: str
    auth_style: str
    capabilities: Dict[str, Any]
    config_schema: Dict[str, Any]
    is_active: bool
    created_at: datetime
    updated_at: datetime


class DriverWithAliasesResponse(DriverResponse):
    aliases: List[AliasResponse] = []