# backend/modules/email_inboxes/schemas.py

from pydantic import BaseModel, Field, field_validator
from typing import Optional
from datetime import datetime


VALID_PROVIDER_TYPES = ["google", "microsoft365", "imap", "exchange"]
VALID_PROTOCOLS      = ["imap", "pop3", "smtp"]
VALID_STATUSES       = ["active", "inactive"]


class EmailInboxBase(BaseModel):
    inbox_name:       str            = Field(..., min_length=1, max_length=100)
    provider_type:    str            = Field(...)
    email_address:    Optional[str]  = Field(None, max_length=255)
    vault_path:       Optional[str]  = Field(None, max_length=255)
    server_host:      Optional[str]  = Field(None, max_length=255)
    server_port:      Optional[int]  = None
    protocol:         Optional[str]  = None
    use_ssl:          bool           = Field(default=True)
    polling_interval: int            = Field(default=5, ge=1, le=1440)
    status:           str            = Field(default="active")

    @field_validator("provider_type")
    @classmethod
    def validate_provider_type(cls, v):
        if v not in VALID_PROVIDER_TYPES:
            raise ValueError(f"provider_type must be one of {VALID_PROVIDER_TYPES}")
        return v

    @field_validator("protocol")
    @classmethod
    def validate_protocol(cls, v):
        if v is not None and v not in VALID_PROTOCOLS:
            raise ValueError(f"protocol must be one of {VALID_PROTOCOLS}")
        return v

    @field_validator("status")
    @classmethod
    def validate_status(cls, v):
        if v not in VALID_STATUSES:
            raise ValueError(f"status must be one of {VALID_STATUSES}")
        return v


class EmailInboxCreate(EmailInboxBase):
    pass


class EmailInboxUpdate(BaseModel):
    inbox_name:       Optional[str]  = Field(None, min_length=1, max_length=100)
    provider_type:    Optional[str]  = None
    email_address:    Optional[str]  = Field(None, max_length=255)
    vault_path:       Optional[str]  = Field(None, max_length=255)
    server_host:      Optional[str]  = Field(None, max_length=255)
    server_port:      Optional[int]  = None
    protocol:         Optional[str]  = None
    use_ssl:          Optional[bool] = None
    polling_interval: Optional[int]  = Field(None, ge=1, le=1440)
    status:           Optional[str]  = None

    @field_validator("provider_type")
    @classmethod
    def validate_provider_type(cls, v):
        if v is not None and v not in VALID_PROVIDER_TYPES:
            raise ValueError(f"provider_type must be one of {VALID_PROVIDER_TYPES}")
        return v

    @field_validator("protocol")
    @classmethod
    def validate_protocol(cls, v):
        if v is not None and v not in VALID_PROTOCOLS:
            raise ValueError(f"protocol must be one of {VALID_PROTOCOLS}")
        return v

    @field_validator("status")
    @classmethod
    def validate_status(cls, v):
        if v is not None and v not in VALID_STATUSES:
            raise ValueError(f"status must be one of {VALID_STATUSES}")
        return v


class EmailInboxOut(EmailInboxBase):
    inbox_id:    int
    tenant_id:   str
    created_at:  datetime
    updated_at:  datetime

    class Config:
        from_attributes = True


class TestConnectionResponse(BaseModel):
    inbox_id:   int
    inbox_name: str
    status:     str
    message:    str