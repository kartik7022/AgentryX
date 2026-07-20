# backend/modules/admins/repository.py

import httpx
from backend.core.config import settings


def _get_admin_token() -> str:
    res = httpx.post(
        f"{settings.keycloak_url}/realms/master/protocol/openid-connect/token",
        data={"grant_type": "password", "client_id": "admin-cli",
            "username": settings.keycloak_admin_username,
            "password": settings.keycloak_admin_password},
        timeout=10,
    )
    res.raise_for_status()
    return res.json()["access_token"]


def get_admin_by_username(username: str):
    admin_token = _get_admin_token()
    res = httpx.get(
        f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users?username={username}&exact=true",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=10,
    )
    users = res.json()
    if not users:
        return None
    return {"id": users[0]["id"], "username": users[0]["username"]}


def create_admin(username: str, password: str, created_by: str) -> dict:
    admin_token = _get_admin_token()

    # Create user in Keycloak
    create_res = httpx.post(
        f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users",
        json={
            "username": username,
            "email": username,
            "enabled": True,
            "emailVerified": True,
            "credentials": [{"type": "password", "value": password, "temporary": False}],
            "attributes": {"user_type": ["admin"], "created_by": [created_by or ""]},
        },
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=10,
    )
    create_res.raise_for_status()

    # Get created user ID
    users_res = httpx.get(
        f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users?username={username}&exact=true",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=10,
    )
    user = users_res.json()[0]
    keycloak_user_id = user["id"]

    # Assign admin realm role
    role_res = httpx.get(
        f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/roles/admin",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=10,
    )
    if role_res.status_code == 200:
        role_data = role_res.json()
        httpx.post(
            f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users/{keycloak_user_id}/role-mappings/realm",
            json=[{"id": role_data["id"], "name": role_data["name"]}],
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10,
        )

    return {
        "id": keycloak_user_id,
        "username": username,
        "role": "admin",
        "is_active": True,
        "created_at": None,
        "created_by_username": None,
    }


def list_admins() -> list:
    admin_token = _get_admin_token()
    res = httpx.get(
        f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users?max=1000",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=10,
    )
    users = res.json()
    result = []
    for u in users:
        attrs = u.get("attributes") or {}
        user_type = attrs.get("user_type", [None])[0]
        if user_type not in ("admin", "superadmin"):
            continue

        # Get realm roles to determine role
        roles_res = httpx.get(
            f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users/{u['id']}/role-mappings/realm",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10,
        )
        role_names = [r["name"] for r in roles_res.json()]
        role = "superadmin" if "superadmin" in role_names else "admin"

        result.append({
            "id": u["id"],
            "username": u["username"],
            "role": role,
            "is_active": u.get("enabled", True),
            "created_at": None,
            "created_by_username": attrs.get("created_by", [None])[0],
        })
    return result


def get_admin_by_id(admin_id: str):
    admin_token = _get_admin_token()
    res = httpx.get(
        f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users/{admin_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=10,
    )
    if res.status_code == 404:
        return None
    u = res.json()
    attrs = u.get("attributes") or {}
    user_type = attrs.get("user_type", [None])[0]
    if user_type not in ("admin", "superadmin"):
        return None

    roles_res = httpx.get(
        f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users/{admin_id}/role-mappings/realm",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=10,
    )
    role_names = [r["name"] for r in roles_res.json()]
    role = "superadmin" if "superadmin" in role_names else "admin"
    return {"id": u["id"], "role": role}


def update_admin_password(admin_id: str, password: str):
    admin_token = _get_admin_token()
    httpx.put(
        f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users/{admin_id}/reset-password",
        json={"type": "password", "value": password, "temporary": False},
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=10,
    ).raise_for_status()


def update_admin_status(admin_id: str, is_active: bool):
    admin_token = _get_admin_token()
    httpx.put(
        f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users/{admin_id}",
        json={"enabled": is_active},
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=10,
    ).raise_for_status()


def delete_admin(admin_id: str):
    admin_token = _get_admin_token()
    httpx.delete(
        f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users/{admin_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=10,
    ).raise_for_status()