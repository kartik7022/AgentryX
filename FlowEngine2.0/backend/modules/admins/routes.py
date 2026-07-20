# backend/modules/admins/routes.py

from fastapi import APIRouter, HTTPException, status, Response, Cookie
from typing import List

from backend.modules.admins.schemas import (
    AdminLoginResponse,
    AdminCreateRequest,
    AdminUpdateRequest,
    AdminResponse,
)
from backend.modules.admins.service import verify_admin_token, refresh_admin_token
from backend.modules.admins import repository

router = APIRouter()


# ── Helpers ───────────────────────────────────────────────────────────────────

def get_current_admin(admin_session: str = Cookie(default=None)) -> dict:
    if not admin_session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated.")
    try:
        return verify_admin_token(admin_session)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))


def require_superadmin(admin_session: str = Cookie(default=None)) -> dict:
    payload = get_current_admin(admin_session)
    if payload["role"] != "superadmin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Superadmin access required.")
    return payload


    # ── Auth Endpoints ────────────────────────────────────────────────────────────

@router.post("/admin/auth/logout")
def logout(response: Response):
    response.delete_cookie(key="admin_session")
    return {"success": True, "message": "Logged out successfully."}


@router.get("/admin/auth/me")
def me(admin_session: str = Cookie(default=None)):
    if not admin_session:
        return {"authenticated": False}
    try:
        payload = verify_admin_token(admin_session)
        return {
            "authenticated": True,
            "username": payload["username"],
            "role": payload["role"],
        }
    except ValueError:
        return {"authenticated": False}


    # ── Admin Management Endpoints (Superadmin only) ──────────────────────────────

@router.post("/admin/admins", response_model=AdminResponse, status_code=status.HTTP_201_CREATED)
def create_admin(body: AdminCreateRequest, admin_session: str = Cookie(default=None)):
    payload = require_superadmin(admin_session)

    if "@" not in body.username.strip():
        raise HTTPException(status_code=400, detail="Please enter a valid email address.")
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")

    existing = repository.get_admin_by_username(body.username.strip())
    if existing:
        raise HTTPException(status_code=409, detail=f"Username '{body.username}' already exists.")

    try:
        row = repository.create_admin(
            username=body.username.strip(),
            password=body.password,
            created_by=payload["sub"],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create admin: {str(e)}")

    return AdminResponse(
        id=row["id"],
        username=row["username"],
        role=row["role"],
        is_active=row["is_active"],
        created_at=row["created_at"],
        created_by_username=payload["username"],
    )


@router.get("/admin/admins", response_model=List[AdminResponse])
def list_admins(admin_session: str = Cookie(default=None)):
    require_superadmin(admin_session)

    rows = repository.list_admins()
    return [
        AdminResponse(
            id=r["id"],
            username=r["username"],
            role=r["role"],
            is_active=r["is_active"],
            created_at=r["created_at"],
            created_by_username=r["created_by_username"],
        )
        for r in rows
    ]


@router.patch("/admin/admins/{admin_id}")
def update_admin(admin_id: str, body: AdminUpdateRequest, admin_session: str = Cookie(default=None)):
    payload = require_superadmin(admin_session)

    if admin_id == payload["sub"]:
        raise HTTPException(status_code=400, detail="You cannot edit your own account.")

    admin = repository.get_admin_by_id(admin_id)
    if not admin:
        raise HTTPException(status_code=404, detail="Admin not found.")
    if admin["role"] == "superadmin":
        raise HTTPException(status_code=400, detail="Superadmin account cannot be modified.")

    try:
        if body.password is not None:
            if len(body.password) < 8:
                raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")
            repository.update_admin_password(admin_id, body.password)

        if body.is_active is not None:
            repository.update_admin_status(admin_id, body.is_active)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update admin: {str(e)}")

    return {"success": True, "message": "Admin updated successfully."}


@router.delete("/admin/admins/{admin_id}")
def delete_admin(admin_id: str, admin_session: str = Cookie(default=None)):
    payload = require_superadmin(admin_session)

    if admin_id == payload["sub"]:
        raise HTTPException(status_code=400, detail="You cannot delete your own account.")

    admin = repository.get_admin_by_id(admin_id)
    if not admin:
        raise HTTPException(status_code=404, detail="Admin not found.")
    if admin["role"] == "superadmin":
        raise HTTPException(status_code=400, detail="Superadmin account cannot be deleted.")

    try:
        repository.delete_admin(admin_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete admin: {str(e)}")

    return {"success": True, "message": "Admin deleted successfully."}