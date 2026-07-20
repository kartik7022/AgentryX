# backend/modules/users/repository.py

from typing import Optional
from backend.core.config import settings


def email_exists_globally(email: str) -> bool:
    """Check if email exists anywhere in the system — Keycloak."""
    import httpx
    try:
        token_res = httpx.post(
            f"{settings.keycloak_url}/realms/master/protocol/openid-connect/token",
            data={"grant_type": "password", "client_id": "admin-cli",
                "username": settings.keycloak_admin_username,
                "password": settings.keycloak_admin_password},
                timeout=10,
        )
        admin_token = token_res.json().get("access_token")
        if admin_token:
            users_res = httpx.get(
                f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users?email={email.lower()}&exact=true",
                headers={"Authorization": f"Bearer {admin_token}"},
                timeout=10,
            )
            if users_res.json():
                return True
    except Exception:
        pass
    return False


def count_active_co_admins(tenant_id: str) -> int:
    import httpx
    try:
        token_res = httpx.post(
            f"{settings.keycloak_url}/realms/master/protocol/openid-connect/token",
            data={"grant_type": "password", "client_id": "admin-cli",
                "username": settings.keycloak_admin_username,
                "password": settings.keycloak_admin_password},
            timeout=10,
        )
        admin_token = token_res.json().get("access_token")
        users_res = httpx.get(
            f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users?max=1000",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10,
        )
        count = 0
        for u in users_res.json():
            attrs = u.get("attributes") or {}
            if (attrs.get("tenant_id", [None])[0] == tenant_id and
                attrs.get("role", [None])[0] == "tenant_co_admin" and
                attrs.get("status", ["active"])[0] == "active"):
                count += 1
        return count
    except Exception:
        return 0


def count_active_users_per_module(tenant_id: str, module_id: str) -> int:
    import httpx, json as _json
    try:
        token_res = httpx.post(
            f"{settings.keycloak_url}/realms/master/protocol/openid-connect/token",
            data={"grant_type": "password", "client_id": "admin-cli",
                "username": settings.keycloak_admin_username,
                "password": settings.keycloak_admin_password},
            timeout=10,
        )
        admin_token = token_res.json().get("access_token")
        users_res = httpx.get(
            f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users?max=1000",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10,
        )
        count = 0
        for u in users_res.json():
            attrs = u.get("attributes") or {}
            if (attrs.get("tenant_id", [None])[0] == tenant_id and
                attrs.get("role", [None])[0] == "tenant_module_user" and
                attrs.get("status", ["active"])[0] == "active"):
                modules_raw = attrs.get("modules", [None])[0]
                if modules_raw:
                    try:
                        if module_id in _json.loads(modules_raw):
                            count += 1
                    except Exception:
                        pass
        return count
    except Exception:
        return 0