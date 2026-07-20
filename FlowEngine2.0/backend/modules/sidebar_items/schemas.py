# backend/modules/sidebar_items/schemas.py

from pydantic import BaseModel, validator
from typing import List, Optional
from datetime import datetime


class SidebarItemCreate(BaseModel):
    """Schema for creating a new sidebar item"""
    value: str
    label: str
    icon: str
    href: str
    type: str = "internal"
    nav_section: str = "primary"
    open_mode: Optional[str] = None
    hidden_from_module_user: Optional[bool] = False
    display_order: int = 0
    status: str = "active"

    @validator("type")
    def validate_type(cls, v):
        if v not in ["internal", "external"]:
            raise ValueError("type must be 'internal' or 'external'")
        return v

    @validator("nav_section")
    def validate_nav_section(cls, v):
        if v not in ["primary", "more"]:
            raise ValueError("nav_section must be 'primary' or 'more'")
        return v

    @validator("open_mode")
    def validate_open_mode(cls, v):
        if v is not None and v not in ["iframe", "new_tab"]:
            raise ValueError("open_mode must be 'iframe' or 'new_tab'")
        return v

    @validator("status")
    def validate_status(cls, v):
        if v not in ["active", "inactive"]:
            raise ValueError("status must be 'active' or 'inactive'")
        return v


class SidebarItemUpdate(BaseModel):
    label: Optional[str] = None
    icon: Optional[str] = None
    href: Optional[str] = None
    type: Optional[str] = None
    nav_section: Optional[str] = None
    open_mode: Optional[str] = None
    hidden_from_module_user: Optional[bool] = None
    display_order: Optional[int] = None
    status: Optional[str] = None

    @validator("type")
    def validate_type(cls, v):
        if v is not None and v not in ["internal", "external"]:
            raise ValueError("type must be 'internal' or 'external'")
        return v

    @validator("nav_section")
    def validate_nav_section(cls, v):
        if v is not None and v not in ["primary", "more"]:
            raise ValueError("nav_section must be 'primary' or 'more'")
        return v

    @validator("open_mode")
    def validate_open_mode(cls, v):
        if v is not None and v not in ["iframe", "new_tab"]:
            raise ValueError("open_mode must be 'iframe' or 'new_tab'")
        return v

    @validator("status")
    def validate_status(cls, v):
        if v is not None and v not in ["active", "inactive"]:
            raise ValueError("status must be 'active' or 'inactive'")
        return v


class SidebarItemOut(BaseModel):
    id: str
    value: str
    label: str
    icon: str
    href: str
    type: str
    nav_section: str
    open_mode: Optional[str] = None
    hidden_from_module_user: bool = False
    display_order: int = 0
    status: str
    created_at: datetime
    updated_at: Optional[datetime] = None


class SidebarItemListResponse(BaseModel):
    items: List[SidebarItemOut]
    count: int