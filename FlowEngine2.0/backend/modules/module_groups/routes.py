# backend/modules/module_groups/routes.py

from fastapi import APIRouter, HTTPException, status, Cookie
from typing import Optional

from backend.modules.module_groups.schemas import (
    ModuleGroupCreate,
    ModuleGroupUpdate,
    ModuleGroupOut,
    ModuleGroupListResponse,
)
from backend.modules.module_groups import service
from backend.modules.admins.service import verify_admin_token
from backend.common.responses import SuccessResponse

router = APIRouter(prefix="/admin/module-groups", tags=["Admin - Module Groups"])


def get_current_admin(admin_session: str = Cookie(default=None)) -> dict:
    if not admin_session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        return verify_admin_token(admin_session)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))


def require_superadmin(admin_session: str = Cookie(default=None)) -> dict:
    payload = get_current_admin(admin_session)
    if payload["role"] != "superadmin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Superadmin access required.")
    return payload


@router.get("", response_model=ModuleGroupListResponse)
def list_groups(
    status_filter: Optional[str] = None,
    admin_session: str = Cookie(default=None),
):
    get_current_admin(admin_session)
    groups, count = service.get_all_groups(status_filter=status_filter)
    return ModuleGroupListResponse(
        groups=[ModuleGroupOut(**g) for g in groups],
        count=count,
    )


@router.get("/{group_id}", response_model=ModuleGroupOut)
def get_group(
    group_id: str,
    admin_session: str = Cookie(default=None),
):
    get_current_admin(admin_session)
    group = service.get_group_by_id(group_id)
    return ModuleGroupOut(**group)


@router.post("", response_model=ModuleGroupOut, status_code=status.HTTP_201_CREATED)
def create_group(
    body: ModuleGroupCreate,
    admin_session: str = Cookie(default=None),
):
    require_superadmin(admin_session)
    group = service.create_group(payload=body.dict())
    return ModuleGroupOut(**group)


@router.patch("/{group_id}", response_model=ModuleGroupOut)
def update_group(
    group_id: str,
    body: ModuleGroupUpdate,
    admin_session: str = Cookie(default=None),
):
    require_superadmin(admin_session)
    group = service.update_group(group_id=group_id, payload=body.dict(exclude_unset=True))
    return ModuleGroupOut(**group)


@router.delete("/{group_id}", response_model=SuccessResponse)
def delete_group(
    group_id: str,
    admin_session: str = Cookie(default=None),
):
    require_superadmin(admin_session)
    service.delete_group(group_id)
    return SuccessResponse(message=f"Group {group_id} deleted successfully")