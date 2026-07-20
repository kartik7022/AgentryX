# backend/modules/platforms_modules/repository.py

import uuid
import json
from typing import List, Optional, Dict, Tuple

from fastapi import HTTPException, status
from sqlalchemy import text
from backend.core.database import engine


def get_all_modules(status_filter: Optional[str] = None) -> Tuple[List[Dict], int]:
    sql = "SELECT * FROM auth.modules"
    params = {}
    if status_filter:
        sql += " WHERE status = :status"
        params["status"] = status_filter
    sql += " ORDER BY display_order ASC, created_at DESC"

    with engine.connect() as conn:
        rows = conn.execute(text(sql), params).fetchall()
        result = [_module_to_dict(r) for r in rows]
        return result, len(result)


def get_default_modules() -> Tuple[List[Dict], int]:
    with engine.connect() as conn:
        rows = conn.execute(
            text("""
            SELECT * FROM auth.modules
            WHERE is_default = TRUE AND status = 'active'
            ORDER BY display_order ASC
            """)
        ).fetchall()
        result = [_module_to_dict(r) for r in rows]
        return result, len(result)


def get_module_by_id(module_id: str) -> Dict:
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT * FROM auth.modules WHERE id = :id"),
            {"id": str(uuid.UUID(module_id))},
        ).fetchone()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Module {module_id} not found")
        return _module_to_dict(row)


def create_module(payload: Dict, created_by_admin_id: Optional[str] = None) -> Dict:
    module_id = str(uuid.uuid4())

    with engine.begin() as conn:
        conn.execute(
            text("""
            INSERT INTO auth.modules
            (id, name, description, icon, version, display_order, features,
            default_permissions, is_default, status, sidebar_items, external_url, created_by, group_id,
            free_plan, trial_weeks, api_calls_allowed)
            VALUES
            (:id, :name, :description, :icon, :version, :display_order, :features,
            :default_permissions, :is_default, :status, :sidebar_items, :external_url, :created_by, :group_id,
            :free_plan, :trial_weeks, :api_calls_allowed)
            """),
            {
                "id": module_id,
                "name": payload["name"],
                "description": payload.get("description"),
                "icon": payload.get("icon"),
                "version": payload.get("version", "1.0.0"),
                "display_order": payload.get("display_order", 0),
                "features": json.dumps(payload.get("features", [])),
                "default_permissions": json.dumps(payload.get("default_permissions", [])),
                "is_default": payload.get("is_default", False),
                "status": payload.get("status", "active"),
                "sidebar_items": json.dumps(payload.get("sidebar_items", [])),
                "external_url": payload.get("external_url"),
                "created_by": str(uuid.UUID(created_by_admin_id)) if created_by_admin_id else None,
                "group_id": str(uuid.UUID(payload["group_id"])) if payload.get("group_id") else None,
                "free_plan": payload.get("free_plan", False),
                "trial_weeks": payload.get("trial_weeks", 2),
                "api_calls_allowed": payload.get("api_calls_allowed", 0),
            },
        )
        row = conn.execute(
            text("SELECT * FROM auth.modules WHERE id = :id"),
            {"id": module_id},
        ).fetchone()
        return _module_to_dict(row)


def update_module(module_id: str, payload: Dict) -> Dict:
    with engine.begin() as conn:
        row = conn.execute(
            text("SELECT * FROM auth.modules WHERE id = :id"),
            {"id": str(uuid.UUID(module_id))},
        ).fetchone()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Module {module_id} not found")


        updates = {k: v for k, v in payload.items() if v is not None or k in ('external_url', 'group_id')}
        for key in ("features", "default_permissions", "sidebar_items"):
            if key in updates and isinstance(updates[key], list):
                updates[key] = json.dumps(updates[key])
        if updates:
            set_clause = ", ".join(f"{k} = :{k}" for k in updates.keys())
            updates["id"] = str(uuid.UUID(module_id))
            conn.execute(
                text(f"UPDATE auth.modules SET {set_clause} WHERE id = :id"),
                updates,
            )
        updated = conn.execute(
            text("SELECT * FROM auth.modules WHERE id = :id"),
            {"id": str(uuid.UUID(module_id))},
        ).fetchone()
        return _module_to_dict(updated)


def delete_module(module_id: str) -> bool:
    with engine.begin() as conn:
        row = conn.execute(
            text("SELECT 1 FROM auth.modules WHERE id = :id"),
            {"id": str(uuid.UUID(module_id))},
        ).fetchone()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Module {module_id} not found")

        conn.execute(
            text("DELETE FROM auth.modules WHERE id = :id"),
            {"id": str(uuid.UUID(module_id))},
        )
        return True


def _get_keycloak_admin_token() -> str:
    import httpx
    from backend.core.config import settings
    res = httpx.post(
        f"{settings.keycloak_url}/realms/master/protocol/openid-connect/token",
        data={"grant_type": "password", "client_id": "admin-cli",
            "username": settings.keycloak_admin_username,
            "password": settings.keycloak_admin_password},
        timeout=10,
    )
    res.raise_for_status()
    return res.json()["access_token"]


def _get_keycloak_user_by_tenant_id(tenant_id: str, admin_token: str) -> Optional[dict]:
    import httpx
    from backend.core.config import settings
    res = httpx.get(
        f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users?q=tenant_id:{tenant_id}&max=10",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=10,
    )
    users = res.json()
    for user in users:
        attrs = user.get("attributes") or {}
        if attrs.get("tenant_id", [None])[0] == tenant_id and attrs.get("role", [None])[0] == "tenant_admin":
            return user
    return None


def get_tenant_modules(tenant_id: str, status_filter: Optional[str] = None) -> Tuple[List[Dict], int]:
    from backend.modules.accounts.service import get_active_modules_from_killbill
    try:
        module_names = get_active_modules_from_killbill(tenant_id)

        # Fetch all modules to map name -> id
        with engine.connect() as conn:
            rows = conn.execute(text("SELECT id, name, display_order FROM auth.modules ORDER BY display_order ASC")).fetchall()
        name_to_module = {r.name: r for r in rows}

        result = []
        for name in module_names:
            mod = name_to_module.get(name)
            if not mod:
                continue
            if status_filter and status_filter != "active":
                continue
            result.append({
                "id": str(mod.id),
                "tenant_id": tenant_id,
                "module_id": str(mod.id),
                "module_name": name,
                "status": "active",
                "assigned_at": None,
            })
        return result, len(result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch tenant modules: {str(e)}")


def assign_modules_to_tenant(
    tenant_id: str,
    module_ids: List[str],
    admin_id: Optional[str] = None,
) -> Tuple[List[Dict], int]:
    import httpx
    from backend.core.config import settings
    try:
        admin_token = _get_keycloak_admin_token()
        user = _get_keycloak_user_by_tenant_id(tenant_id, admin_token)
        if not user:
            raise HTTPException(status_code=404, detail="Tenant not found in Keycloak.")

        attrs = user.get("attributes") or {}
        modules_raw = attrs.get("modules", [None])[0]
        existing_names = json.loads(modules_raw) if modules_raw else []

        # Fetch module names for the given ids
        with engine.connect() as conn:
            rows = conn.execute(text("SELECT id, name FROM auth.modules")).fetchall()
        id_to_name = {str(r.id): r.name for r in rows}

        newly_assigned = []
        for module_id in module_ids:
            mod_name = id_to_name.get(str(uuid.UUID(module_id)))
            if not mod_name:
                raise HTTPException(status_code=404, detail=f"Module {module_id} not found")
            if mod_name in existing_names:
                continue
            existing_names.append(mod_name)
            newly_assigned.append({"module_id": module_id, "module_name": mod_name, "tenant_id": tenant_id, "status": "active", "assigned_at": None})

        user_data = dict(user)
        user_data["attributes"] = {**attrs, "modules": [json.dumps(existing_names)]}
        httpx.put(
            f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users/{user['id']}",
            json=user_data,
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10,
        )
        return newly_assigned, len(newly_assigned)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to assign modules: {str(e)}")


def remove_module_from_tenant(tenant_id: str, module_id: str) -> bool:
    import httpx
    from backend.core.config import settings
    try:
        admin_token = _get_keycloak_admin_token()
        user = _get_keycloak_user_by_tenant_id(tenant_id, admin_token)
        if not user:
            raise HTTPException(status_code=404, detail="Tenant not found in Keycloak.")

        attrs = user.get("attributes") or {}
        modules_raw = attrs.get("modules", [None])[0]
        existing_names = json.loads(modules_raw) if modules_raw else []

        with engine.connect() as conn:
            row = conn.execute(text("SELECT name FROM auth.modules WHERE id = :id"), {"id": str(uuid.UUID(module_id))}).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail=f"Module {module_id} not found")

        mod_name = row.name
        if mod_name in existing_names:
            existing_names.remove(mod_name)

        user_data = dict(user)
        user_data["attributes"] = {**attrs, "modules": [json.dumps(existing_names)]}
        httpx.put(
            f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users/{user['id']}",
            json=user_data,
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10,
        )
        return True
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to remove module: {str(e)}")


def get_default_module_ids() -> List[str]:
    modules, _ = get_default_modules()
    return [m["id"] for m in modules]


def get_tenant_active_modules(tenant_id: str) -> List[Dict]:
    modules, _ = get_tenant_modules(tenant_id, status_filter="active")
    if not modules:
        return []
    module_ids = [m["module_id"] for m in modules]
    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT * FROM auth.modules WHERE id = ANY(:ids) AND status = 'active' ORDER BY display_order ASC"),
            {"ids": module_ids},
        ).fetchall()
    return [_module_to_dict(r) for r in rows]


def _module_to_dict(r) -> Dict:
    group_id = str(r.group_id) if r.group_id else None
    group_name = None
    if group_id:
        try:
            with engine.connect() as conn:
                g = conn.execute(
                    text("SELECT name FROM auth.module_groups WHERE id = :id"),
                    {"id": group_id},
                ).fetchone()
                group_name = g.name if g else None
        except Exception:
            group_name = None
    return {
        "id": str(r.id),
        "name": r.name,
        "description": r.description,
        "icon": r.icon,
        "version": r.version,
        "display_order": r.display_order,
        "features": r.features,
        "default_permissions": r.default_permissions,
        "is_default": r.is_default,
        "status": r.status,
        "sidebar_items": r.sidebar_items,
        "external_url": r.external_url,
        "group_id": group_id,
        "group_name": group_name,
        "created_at": r.created_at,
        "updated_at": r.updated_at,
        "free_plan": r.free_plan if r.free_plan is not None else False,
        "trial_weeks": r.trial_weeks if r.trial_weeks is not None else 2,
        "api_calls_allowed": r.api_calls_allowed if r.api_calls_allowed is not None else 0,
    }