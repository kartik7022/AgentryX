# backend/modules/rbac/routes.py

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from backend.core.config import settings
from backend.core.middleware.auth import require_permission

router = APIRouter()




@router.get("/rbac/roles")
def get_roles(admin: dict = Depends(require_permission("rbac"))):
    try:
        token_res = httpx.post(
            f"{settings.keycloak_url}/realms/master/protocol/openid-connect/token",
            data={"grant_type": "password", "client_id": "admin-cli",
                "username": settings.keycloak_admin_username,
                "password": settings.keycloak_admin_password},
            timeout=10,
        )
        admin_token = token_res.json().get("access_token")
        roles_res = httpx.get(
            f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/roles",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10,
        )
        roles = [r for r in roles_res.json() if r["name"] in ("tenant_admin", "tenant_co_admin", "tenant_module_user")]
        return {"roles": [{"name": r["name"], "description": r.get("description", "")} for r in roles]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch roles from Keycloak: {str(e)}")