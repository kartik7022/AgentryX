"""
UPDATED FlowEngine Datasource Schemas
Path: backend/modules/datasources/schemas.py

Includes all NEW fields:
- connection_status
- last_test_at  
- last_error_summary
"""

from pydantic import BaseModel, Field, field_validator
from typing import Optional, Dict, Any
from datetime import datetime


# ============ DATASOURCE SCHEMAS ============

# Valid datasource types


# Valid connection status values
VALID_CONNECTION_STATUS = ["UNKNOWN", "VERIFIED", "FAILED"]


class DatasourceBase(BaseModel):
    name: str = Field(..., min_length=1, description="Logical name (e.g., CRM_DB, LOAN_CORE_DB)")
    datasource_type: str = Field(..., min_length=1, description="Type: resolved from driver_id")
    connection_key: str = Field(..., min_length=1, description="Key for Adapter/middleware routing")
    description: Optional[str] = Field(None, description="Description of the datasource")
    tenant_id: str = Field(default='global', description="Tenant ID for multi-tenancy")
    is_active: bool = True


class DatasourceCreate(BaseModel):
    """Schema for creating a new datasource — accepts driver_id, resolves datasource_type in service"""
    name: str = Field(..., min_length=1)
    driver_id: int = Field(..., description="FK to driver_definitions")
    connection_key: str = Field(..., min_length=1)
    description: Optional[str] = None
    tenant_id: str = Field(default='global')
    is_active: bool = True
    datasource_mode: str = Field(default='data', description="Mode: 'query' or 'data'")

    @field_validator('datasource_mode')
    @classmethod
    def validate_datasource_mode(cls, v):
        if v not in ['data', 'query']:
            raise ValueError("datasource_mode must be 'data' or 'query'")
        return v

class DatasourceUpdate(BaseModel):
    """Schema for updating an existing datasource"""
    name: Optional[str] = Field(None, min_length=1)
    driver_id: Optional[int] = None
    datasource_type: Optional[str] = Field(None, min_length=1)
    connection_key: Optional[str] = Field(None, min_length=1)
    description: Optional[str] = None
    tenant_id: Optional[str] = None
    is_active: Optional[bool] = None
    datasource_mode: Optional[str] = None

    @field_validator('datasource_mode')
    @classmethod
    def validate_datasource_mode(cls, v):
        if v is None:
            return v
        if v not in ['data', 'query']:
            raise ValueError("datasource_mode must be 'data' or 'query'")
        return v

    @field_validator('datasource_type')
    @classmethod
    def validate_datasource_type(cls, v):
        if v is None:
            return v
        from backend.modules.datasource_types import repository as dst_repo
        driver = dst_repo.resolve_driver_by_alias(v)
        if not driver:
            driver = dst_repo.get_driver_by_canonical_name(v)
        if not driver:
            raise ValueError(f"'{v}' is not a recognised datasource type.")
        return v



class DatasourceOut(DatasourceBase):
    """Schema for datasource output (read operations)"""
    datasource_id: int
    datasource_mode: str = 'data'

    class Config:
        from_attributes = True


# ============ DATASOURCE CONFIG SCHEMAS ============

class DatasourceConfigBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="Unique config name, e.g., SERVICENOW_ITSM_PROD")
    protocol: str = Field(..., description="Protocol: 'sql', 'rest', 'graphql', 'file', 'stream'")
    driver_family: str = Field(..., description="Driver family canonical name")
    driver_id: Optional[int] = Field(None, description="FK to driver_definitions")
    base_url: Optional[str] = Field(None, description="Base URL for REST/GraphQL")
    auth_type: Optional[str] = Field(None, description="Auth type: 'oauth2', 'apikey', 'basic', 'none'")
    auth_config: Optional[Dict[str, Any]] = Field(None, description="Auth configuration")
    connection_json: Optional[Dict[str, Any]] = Field(None, description="Connection details (DSN, JDBC URL, ODBC, etc.)")
    metadata_ref: Optional[str] = Field(None, description="Metadata reference URL (OpenAPI, GraphQL SDL, etc.)")
    is_active: bool = Field(default=True)
    router_base_url: Optional[str] = Field(None, description="Router base URL for API routing")
    tenant_id: str = Field(default='global', description="Tenant ID for multi-tenancy")
    vault_secret_path: Optional[str] = Field(None)
    pool_size: Optional[int] = Field(default=20)
    max_overflow: Optional[int] = Field(default=10)
    pool_timeout_seconds: Optional[int] = Field(default=30)
    pool_recycle_seconds: Optional[int] = Field(default=180)
    sgate_enabled: Optional[bool] = Field(default=True)
    profiling_enabled: Optional[bool] = Field(default=False)
    profiling_sample_limit: Optional[int] = Field(default=50)
    default_execute: Optional[bool] = Field(default=True)
    default_result_format: Optional[str] = Field(default="TABULAR_JSON")
    driver_service_url: Optional[str] = Field(None)

    @field_validator('protocol')
    @classmethod
    def validate_protocol(cls, v):
        allowed = ['sql', 'soql', 'rest', 'graphql', 'file', 'stream']
        if v not in allowed:
            raise ValueError(f'protocol must be one of {allowed}')
        return v

    @field_validator('auth_type')
    @classmethod
    def validate_auth_type(cls, v):
        if v is None:
            return v
        allowed = ['oauth2', 'apikey', 'basic', 'none']
        if v not in allowed:
            raise ValueError(f'auth_type must be one of {allowed}')
        return v


class DatasourceConfigCreate(DatasourceConfigBase):
    pass


class DatasourceConfigUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    protocol: Optional[str] = None
    driver_family: Optional[str] = None
    base_url: Optional[str] = None
    auth_type: Optional[str] = None
    auth_config: Optional[Dict[str, Any]] = None
    connection_json: Optional[Dict[str, Any]] = None
    metadata_ref: Optional[str] = None
    is_active: Optional[bool] = None
    router_base_url: Optional[str] = None
    tenant_id: Optional[str] = None
    vault_secret_path: Optional[str] = None
    pool_size: Optional[int] = None
    max_overflow: Optional[int] = None
    pool_timeout_seconds: Optional[int] = None
    pool_recycle_seconds: Optional[int] = None
    sgate_enabled: Optional[bool] = None
    profiling_enabled: Optional[bool] = None
    profiling_sample_limit: Optional[int] = None
    default_execute: Optional[bool] = None
    default_result_format: Optional[str] = None
    driver_service_url: Optional[str] = None

    @field_validator('protocol')
    @classmethod
    def validate_protocol(cls, v):
        if v is None:
            return v
        allowed = ['sql', 'soql', 'rest', 'graphql', 'file', 'stream']
        if v not in allowed:
            raise ValueError(f'protocol must be one of {allowed}')
        return v

    @field_validator('auth_type')
    @classmethod
    def validate_auth_type(cls, v):
        if v is None:
            return v
        allowed = ['oauth2', 'apikey', 'basic', 'none']
        if v not in allowed:
            raise ValueError(f'auth_type must be one of {allowed}')
        return v


class DatasourceConfigOut(DatasourceConfigBase):
    config_id: int
    driver_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True