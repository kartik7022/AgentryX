#!/usr/bin/env python3
# backend/modules/admins/service.py
"""
Admin Authentication Service — verifies admin sessions via Keycloak JWT realm roles.
"""

import httpx

from backend.core.config import settings


def _get_keycloak_admin_token() -> str:
    res = httpx.post(
        f"{settings.keycloak_url}/realms/master/protocol/openid-connect/token",
        data={
            "grant_type": "password",
            "client_id": "admin-cli",
            "username": settings.keycloak_admin_username,
            "password": settings.keycloak_admin_password,
        },
        timeout=10,
    )
    res.raise_for_status()
    return res.json()["access_token"]


def verify_admin_token(token: str) -> dict:
    try:
        userinfo = httpx.get(
            f"{settings.keycloak_url}/realms/{settings.keycloak_realm}/protocol/openid-connect/userinfo",
            headers={"Authorization": f"Bearer {token}"},
            timeout=5,
        )
        if userinfo.status_code != 200:
            raise ValueError("Invalid or expired session.")

        userinfo_data = userinfo.json()
        subject = userinfo_data.get("sub")
        username = (
            userinfo_data.get("preferred_username")
            or userinfo_data.get("email")
            or userinfo_data.get("sub")
        )
        if not subject:
            raise ValueError("Invalid or expired session.")

        admin_token = _get_keycloak_admin_token()
        roles_res = httpx.get(
            f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users/{subject}/role-mappings/realm",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10,
        )
        roles_res.raise_for_status()
        role_names = {r["name"] for r in roles_res.json()}
    except ValueError:
        raise
    except Exception:
        raise ValueError("Invalid or expired session.")

    if "superadmin" not in role_names and "admin" not in role_names:
        raise ValueError("Invalid admin session.")

    return {
        "sub": subject,
        "username": username,
        "role": "superadmin" if "superadmin" in role_names else "admin",
        "type": "admin",
    }


def refresh_admin_token(token: str) -> None:
    return None
