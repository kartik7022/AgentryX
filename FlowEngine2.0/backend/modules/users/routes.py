# backend/modules/users/routes.py

from fastapi import APIRouter, Depends, HTTPException, status
from typing import List

from backend.modules.users.schemas import TenantUserCreate, TenantUserUpdate, TenantUserOut
from backend.modules.users import service
from backend.common.responses import SuccessResponse
from backend.core.middleware.auth import require_permission
router = APIRouter()




    # ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/users", response_model=TenantUserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    body: TenantUserCreate,
    ctx: dict = Depends(require_permission("users")),
):
    return service.create_user(
        tenant_id=ctx["tenant_id"],
        created_by=ctx["user_id"],
        payload=body,
    )


@router.get("/users", response_model=List[TenantUserOut])
def get_all_users(
    ctx: dict = Depends(require_permission("users")),
):
    return service.get_all_users(tenant_id=ctx["tenant_id"])


@router.get("/users/{user_id}", response_model=TenantUserOut)
def get_user(
    user_id: str,
    ctx: dict = Depends(require_permission("users")),
):
    return service.get_user_by_id(tenant_id=ctx["tenant_id"], user_id=user_id)


@router.patch("/users/{user_id}", response_model=TenantUserOut)
def update_user(
    user_id: str,
    body: TenantUserUpdate,
    ctx: dict = Depends(require_permission("users")),
):
    return service.update_user(tenant_id=ctx["tenant_id"], user_id=user_id, payload=body)


@router.delete("/users/{user_id}", response_model=SuccessResponse)
def delete_user(
    user_id: str,
    ctx: dict = Depends(require_permission("users")),
):
    if ctx.get("user_id") and ctx["user_id"] == user_id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account.")
    service.delete_user(tenant_id=ctx["tenant_id"], user_id=user_id)
    return SuccessResponse(message="User deleted successfully.")