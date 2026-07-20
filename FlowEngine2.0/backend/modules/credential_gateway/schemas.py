"""
Datasource-UI Schemas
Path: app/schemas/datasource.py

- No local database models at all
- TestRequest uses flowengine_datasource_id directly
- SaveRequest uses flowengine_datasource_id directly
"""

from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


# ── Datasource type descriptor (driver catalog) ───────────────────────────────

class FieldDescriptor(BaseModel):
    name:  str
    label: str
    type:  str


class DatasourceTypeDescriptor(BaseModel):
    datasource_type: str
    label:           str
    driver_family:   str
    required_fields: List[FieldDescriptor]


    # ── Test connection ───────────────────────────────────────────────────────────

class TestRequest(BaseModel):
    flowengine_datasource_id: int           # FlowEngine eivs.datasources PK
    datasource_type:          str
    tenant_id:                str
    datasource_name:          str
    connection_params:        Dict[str, Any]


class TestResponse(BaseModel):
    connection_status:  str
    last_error_summary: Optional[str] = None
    last_test_at:       str
    message:            Optional[str] = None


    # ── Save credentials ──────────────────────────────────────────────────────────

class SaveRequest(BaseModel):
    flowengine_datasource_id: int           # FlowEngine eivs.datasources PK
    config_id:                Optional[int] = None   # DatasourceConfig PK — vault_secret_path stored here
    datasource_type:          str
    datasource_name:          str
    tenant_id:                str
    connection_params:        Dict[str, Any]


class SaveResponse(BaseModel):
    status:            str
    vault_secret_path: str
    saved_at:          str




# ── Email inbox type descriptor ───────────────────────────────────────────────

class EmailInboxTypeDescriptor(BaseModel):
    provider_type:   str
    label:           str
    auth_family:     str
    required_fields: List[FieldDescriptor]


    # ── Test connection (email inbox) ─────────────────────────────────────────────

class EmailInboxTestRequest(BaseModel):
    inbox_id:          int
    provider_type:     str
    tenant_id:         str
    inbox_name:        str
    connection_params: Dict[str, Any]  # username, password, host, port, protocol, use_ssl


class EmailInboxTestResponse(BaseModel):
    connection_status:  str
    last_error_summary: Optional[str] = None
    last_test_at:       str
    message:            Optional[str] = None


    # ── Save credentials (email inbox) ────────────────────────────────────────────

class EmailInboxSaveRequest(BaseModel):
    inbox_id:          int
    inbox_name:        str
    provider_type:     str
    tenant_id:         str
    connection_params: Dict[str, Any]  # username, password, host, port, protocol, use_ssl


class EmailInboxSaveResponse(BaseModel):
    status:            str
    vault_secret_path: str
    saved_at:          str