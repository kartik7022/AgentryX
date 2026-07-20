# backend/modules/datasource_types/routes.py

from typing import List

from fastapi import APIRouter, Cookie, Depends, HTTPException, status

from backend.modules.admins.service import verify_admin_token
from backend.modules.datasource_types.schemas import (
    DriverCreate,
    DriverUpdate,
    DriverResponse,
    DriverWithAliasesResponse,
    AliasCreate,
    AliasResponse,
)
from backend.modules.datasource_types import service

router = APIRouter()


def require_company_admin(admin_session: str = Cookie(default=None)) -> dict:
    if not admin_session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated.")
    try:
        payload = verify_admin_token(admin_session)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))
    if payload["role"] not in ("admin", "superadmin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required.")
    return payload


@router.get("/admin/datasource-types/public")
def list_datasource_types_public():
    return service.get_all_as_public()


@router.get("/admin/datasource-types", response_model=List[DriverResponse])
def list_drivers(admin=Depends(require_company_admin)):
    return service.list_all()


@router.get("/admin/datasource-types/{driver_id}", response_model=DriverWithAliasesResponse)
def get_driver(driver_id: int, admin=Depends(require_company_admin)):
    return service.get_with_aliases(driver_id)


@router.post("/admin/datasource-types", response_model=DriverResponse, status_code=status.HTTP_201_CREATED)
def create_driver(body: DriverCreate, admin=Depends(require_company_admin)):
    return service.create(
        canonical_name=body.canonical_name,
        display_name=body.display_name,
        runtime_owner=body.runtime_owner,
        protocol=body.protocol,
        dialect_token=body.dialect_token,
        implementation_key=body.implementation_key,
        auth_style=body.auth_style,
        capabilities=body.capabilities,
        config_schema=body.config_schema,
        is_active=body.is_active,
    )


@router.patch("/admin/datasource-types/{driver_id}", response_model=DriverResponse)
def update_driver(driver_id: int, body: DriverUpdate, admin=Depends(require_company_admin)):
    return service.update(
        driver_id=driver_id,
        display_name=body.display_name,
        runtime_owner=body.runtime_owner,
        protocol=body.protocol,
        dialect_token=body.dialect_token,
        implementation_key=body.implementation_key,
        auth_style=body.auth_style,
        capabilities=body.capabilities,
        config_schema=body.config_schema,
        is_active=body.is_active,
    )


@router.delete("/admin/datasource-types/{driver_id}")
def delete_driver(driver_id: int, admin=Depends(require_company_admin)):
    service.delete(driver_id)
    return {"success": True, "message": "Driver deleted successfully."}


@router.get("/admin/datasource-types/{driver_id}/aliases", response_model=List[AliasResponse])
def list_aliases(driver_id: int, admin=Depends(require_company_admin)):
    return service.list_aliases(driver_id)


@router.post("/admin/datasource-types/{driver_id}/aliases", response_model=AliasResponse, status_code=status.HTTP_201_CREATED)
def add_alias(driver_id: int, body: AliasCreate, admin=Depends(require_company_admin)):
    return service.add_alias(
        driver_id=driver_id,
        alias_name=body.alias_name,
        alias_type=body.alias_type,
        is_active=body.is_active,
    )


@router.delete("/admin/datasource-types/aliases/{alias_id}")
def delete_alias(alias_id: int, admin=Depends(require_company_admin)):
    service.delete_alias(alias_id)
    return {"success": True, "message": "Alias deleted successfully."}
