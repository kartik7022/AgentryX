# backend/modules/users/service.py

from typing import List
import httpx

from fastapi import HTTPException, status
from datetime import datetime
from backend.modules.users.schemas import TenantUserCreate, TenantUserUpdate, TenantUserOut
from backend.modules.users import repository
from backend.core.config import settings


def _get_keycloak_admin_token() -> str:
    """Get Keycloak admin token."""
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


def _create_keycloak_user(admin_token: str, email: str, full_name: str) -> str:
    """Create user in Keycloak and return Keycloak user ID."""
    name_parts = full_name.strip().split(" ", 1)
    first_name = name_parts[0]
    last_name = name_parts[1] if len(name_parts) > 1 else ""

    res = httpx.post(
        f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users",
        json={
            "email": email,
            "username": email,
            "firstName": first_name,
            "lastName": last_name,
            "enabled": True,
            "emailVerified": True,
            "requiredActions": ["UPDATE_PASSWORD"],
        },
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=10,
    )
    if res.status_code == 409:
        raise HTTPException(status_code=400, detail=f"User with email '{email}' already exists in Keycloak.")
    res.raise_for_status()

    # Get the created user ID
    users_res = httpx.get(
        f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users?email={email}&exact=true",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=10,
    )
    users_res.raise_for_status()
    users = users_res.json()
    if not users:
        raise HTTPException(status_code=500, detail="Failed to retrieve created Keycloak user.")
    return users[0]["id"]


def _send_keycloak_set_password_email(admin_token: str, keycloak_user_id: str) -> None:
    """Send set-password email to the user via Keycloak."""
    res = httpx.put(
        f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users/{keycloak_user_id}/execute-actions-email",
        json=["UPDATE_PASSWORD"],
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=10,
    )
    res.raise_for_status()


def _delete_keycloak_user(admin_token: str, email: str) -> None:
    """Delete user from Keycloak by email."""
    try:
        users_res = httpx.get(
            f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users?email={email}&exact=true",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10,
        )
        users = users_res.json()
        if users:
            httpx.delete(
                f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users/{users[0]['id']}",
                headers={"Authorization": f"Bearer {admin_token}"},
                timeout=10,
            )
    except Exception:
        pass


def create_user(tenant_id: str, created_by: str, payload: TenantUserCreate) -> TenantUserOut:
    # Check duplicate email within tenant
    if repository.email_exists_globally(payload.email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A user with email '{payload.email}' already exists in the system."
        )

    # Role-based limits
    if payload.role == "tenant_co_admin":
        co_admin_count = repository.count_active_co_admins(tenant_id)
        if co_admin_count >= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Maximum of 1 tenant co-admin allowed per account."
            )

    elif payload.role == "tenant_module_user":
        if not payload.modules:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="At least one module must be assigned to a tenant_module_user."
            )
        if payload.status == "active":
            for module_id in payload.modules:
                active_count = repository.count_active_users_per_module(tenant_id, module_id)
                if active_count >= 2:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Module limit reached: maximum of 2 active users are already assigned to this module."
                    )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid role. Must be 'tenant_co_admin' or 'tenant_module_user'."
        )

    # Step 1: Create user in Keycloak with attributes and send set-password email
    try:
        import json as _json
        admin_token = _get_keycloak_admin_token()
        keycloak_user_id = _create_keycloak_user(admin_token, payload.email, payload.full_name)

        # Write attributes to Keycloak
        modules = payload.modules if payload.role == "tenant_module_user" else []
        user_res = httpx.get(
            f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users/{keycloak_user_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10,
        )
        user_data = user_res.json()
        user_data["attributes"] = {
            "tenant_id": [tenant_id],
            "role": [payload.role],
            "modules": [_json.dumps(modules)],
            "status": [payload.status or "active"],
        }
        update_res = httpx.put(
            f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users/{keycloak_user_id}",
            json=user_data,
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10,
        )
        if update_res.status_code not in (200, 204):
            _delete_keycloak_user(admin_token, payload.email)
            raise HTTPException(status_code=500, detail="Failed to write Keycloak attributes for sub-user.")

        # Assign realm role to user
        role_res = httpx.get(
            f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/roles/{payload.role}",
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

        _send_keycloak_set_password_email(admin_token, keycloak_user_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create user in Keycloak: {str(e)}")

    return TenantUserOut(
        id=keycloak_user_id,
        tenant_id=tenant_id,
        email=payload.email.lower(),
        full_name=payload.full_name,
        role=payload.role,
        modules=modules,
        status=payload.status or "active",
        created_at=datetime.utcnow(),
    )

def get_all_users(tenant_id: str) -> List[TenantUserOut]:
    import json as _json
    try:
        admin_token = _get_keycloak_admin_token()
        users_res = httpx.get(
            f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users?max=1000",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10,
        )
        users_res.raise_for_status()
        all_users = users_res.json()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch users from Keycloak: {str(e)}")

    result = []
    for u in all_users:
        attrs = u.get("attributes") or {}
        u_tenant_id = attrs.get("tenant_id", [None])[0]
        u_role = attrs.get("role", [None])[0]
        if u_tenant_id != tenant_id:
            continue
        if u_role not in ("tenant_co_admin", "tenant_module_user"):
            continue
        modules_raw = attrs.get("modules", [None])[0]
        modules = []
        if modules_raw:
            try:
                modules = _json.loads(modules_raw)
            except Exception:
                modules = []
        full_name = f"{u.get('firstName', '')} {u.get('lastName', '')}".strip()
        result.append(TenantUserOut(
            id=u["id"],
            tenant_id=u_tenant_id,
            email=u.get("email", ""),
            full_name=full_name,
            role=u_role,
            modules=modules,
            status=attrs.get("status", ["active"])[0],
            created_at=datetime.utcfromtimestamp(u["createdTimestamp"] / 1000) if u.get("createdTimestamp") else datetime.utcnow(),
        ))
    return result


def get_user_by_id(tenant_id: str, user_id: str) -> TenantUserOut:
    import json as _json
    try:
        admin_token = _get_keycloak_admin_token()
        user_res = httpx.get(
            f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users/{user_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10,
        )
        if user_res.status_code == 404:
            raise HTTPException(status_code=404, detail="User not found.")
        user_res.raise_for_status()
        u = user_res.json()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch user from Keycloak: {str(e)}")

    attrs = u.get("attributes") or {}
    u_tenant_id = attrs.get("tenant_id", [None])[0]
    if u_tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="User not found.")

    modules_raw = attrs.get("modules", [None])[0]
    modules = []
    if modules_raw:
        try:
            modules = _json.loads(modules_raw)
        except Exception:
            modules = []

    full_name = f"{u.get('firstName', '')} {u.get('lastName', '')}".strip()
    return TenantUserOut(
        id=u["id"],
        tenant_id=u_tenant_id,
        email=u.get("email", ""),
        full_name=full_name,
        role=attrs.get("role", [None])[0],
        modules=modules,
        status=attrs.get("status", ["active"])[0],
        created_at=datetime.utcfromtimestamp(u["createdTimestamp"] / 1000) if u.get("createdTimestamp") else datetime.utcnow(),
    )


def update_user(tenant_id: str, user_id: str, payload: TenantUserUpdate) -> TenantUserOut:
    import json as _json
    existing = get_user_by_id(tenant_id, user_id)

    if existing.role == "tenant_module_user":
        existing_modules = existing.modules or []
        is_activating = payload.status == "active" and existing.status == "inactive"

        if is_activating:
            modules_to_check = payload.modules if payload.modules is not None else existing_modules
            for module_id in modules_to_check:
                active_count = repository.count_active_users_per_module(tenant_id, module_id)
                if active_count >= 2:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Module limit reached: maximum of 2 active users are already assigned to this module."
                    )

        if payload.modules is not None:
            for module_id in payload.modules:
                if module_id not in existing_modules:
                    active_count = repository.count_active_users_per_module(tenant_id, module_id)
                    if active_count >= 2:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Module limit reached: maximum of 2 active users are already assigned to this module."
                        )

    try:
        admin_token = _get_keycloak_admin_token()
        user_res = httpx.get(
            f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users/{user_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10,
        )
        user_res.raise_for_status()
        user_data = user_res.json()
        attrs = user_data.get("attributes") or {}

        if payload.full_name is not None:
            name_parts = payload.full_name.strip().split(" ", 1)
            user_data["firstName"] = name_parts[0]
            user_data["lastName"] = name_parts[1] if len(name_parts) > 1 else ""
        if payload.status is not None:
            attrs["status"] = [payload.status]
        if payload.modules is not None:
            attrs["modules"] = [_json.dumps(payload.modules)]

        user_data["attributes"] = attrs
        update_res = httpx.put(
            f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users/{user_id}",
            json=user_data,
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10,
        )
        if update_res.status_code not in (200, 204):
            raise HTTPException(status_code=500, detail=f"Failed to update user in Keycloak: {update_res.text}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update user: {str(e)}")

    return get_user_by_id(tenant_id, user_id)


def delete_user(tenant_id: str, user_id: str) -> None:
    existing = get_user_by_id(tenant_id, user_id)

    try:
        admin_token = _get_keycloak_admin_token()
        del_res = httpx.delete(
            f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users/{user_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10,
        )
        if del_res.status_code not in (200, 204):
            raise HTTPException(status_code=500, detail="Failed to delete user from Keycloak.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete user: {str(e)}")