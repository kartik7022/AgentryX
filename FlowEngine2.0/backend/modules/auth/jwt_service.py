# backend/modules/auth/jwt_service.py

from backend.core.config import settings


def verify_tenant_token(token: str) -> dict:
    """
    Verify tenant session using Keycloak token.
    Reads identity directly from Keycloak userinfo — no DB lookup.
    """
    try:
        import httpx as _httpx
        import json

        userinfo = _httpx.get(
            f"{settings.keycloak_url}/realms/{settings.keycloak_realm}/protocol/openid-connect/userinfo",
            headers={"Authorization": f"Bearer {token}"},
            timeout=5,
        )
        if userinfo.status_code == 200:
            data = userinfo.json()
            email = data.get("email")
            tenant_id = data.get("tenant_id")
            role = data.get("role")
            status = data.get("status")
            account_type = data.get("account_type")
            modules_raw = data.get("modules")

            if email and tenant_id and role:
                modules = []
                if modules_raw:
                    try:
                        modules = json.loads(modules_raw) if isinstance(modules_raw, str) else modules_raw
                    except Exception:
                        modules = []

                return {
                    "tenant_id": tenant_id,
                    "role": role,
                    "email": email,
                    "sub": email,
                    "status": status,
                    "account_type": account_type,
                    "modules": modules,
                }
    except Exception:
        pass

    raise ValueError("Invalid or expired session")