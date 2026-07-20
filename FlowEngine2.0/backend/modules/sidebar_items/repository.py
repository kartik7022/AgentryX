# backend/modules/sidebar_items/repository.py

import uuid
from typing import List, Optional, Dict, Tuple

from fastapi import HTTPException, status
from sqlalchemy import text
from backend.core.database import engine


def get_all_sidebar_items(status_filter: Optional[str] = None) -> Tuple[List[Dict], int]:
    sql = "SELECT * FROM auth.sidebar_items"
    params = {}
    if status_filter:
        sql += " WHERE status = :status"
        params["status"] = status_filter
    sql += " ORDER BY display_order ASC, created_at DESC"

    with engine.connect() as conn:
        rows = conn.execute(text(sql), params).fetchall()
        result = [_sidebar_item_to_dict(r) for r in rows]
        return result, len(result)


def get_sidebar_item_by_id(item_id: str) -> Dict:
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT * FROM auth.sidebar_items WHERE id = :id"),
            {"id": str(uuid.UUID(item_id))},
        ).fetchone()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Sidebar item {item_id} not found")
        return _sidebar_item_to_dict(row)


def get_sidebar_items_by_values(values: List[str]) -> List[Dict]:
    if not values:
        return []
    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT * FROM auth.sidebar_items WHERE value = ANY(:values) AND status = 'active' ORDER BY display_order ASC"),
            {"values": values},
        ).fetchall()
        return [_sidebar_item_to_dict(r) for r in rows]


def create_sidebar_item(payload: Dict) -> Dict:
    item_id = str(uuid.uuid4())

    with engine.begin() as conn:
        existing = conn.execute(
            text("SELECT 1 FROM auth.sidebar_items WHERE value = :value"),
            {"value": payload["value"]},
        ).fetchone()
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Sidebar item with value '{payload['value']}' already exists")

        conn.execute(
            text("""
            INSERT INTO auth.sidebar_items
            (id, value, label, icon, href, type, nav_section, open_mode,
            hidden_from_module_user, display_order, status)
            VALUES
            (:id, :value, :label, :icon, :href, :type, :nav_section, :open_mode,
            :hidden_from_module_user, :display_order, :status)
            """),
            {
                "id": item_id,
                "value": payload["value"],
                "label": payload["label"],
                "icon": payload["icon"],
                "href": payload["href"],
                "type": payload.get("type", "internal"),
                "nav_section": payload.get("nav_section", "primary"),
                "open_mode": payload.get("open_mode"),
                "hidden_from_module_user": payload.get("hidden_from_module_user", False),
                "display_order": payload.get("display_order", 0),
                "status": payload.get("status", "active"),
            },
        )
        row = conn.execute(
            text("SELECT * FROM auth.sidebar_items WHERE id = :id"),
            {"id": item_id},
        ).fetchone()
        return _sidebar_item_to_dict(row)


def update_sidebar_item(item_id: str, payload: Dict) -> Dict:
    with engine.begin() as conn:
        row = conn.execute(
            text("SELECT * FROM auth.sidebar_items WHERE id = :id"),
            {"id": str(uuid.UUID(item_id))},
        ).fetchone()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Sidebar item {item_id} not found")

        updates = {k: v for k, v in payload.items() if v is not None}
        if updates:
            updates["updated_at"] = "NOW()"
            set_parts = []
            bind_params = {"id": str(uuid.UUID(item_id))}
            for k, v in updates.items():
                if k == "updated_at":
                    set_parts.append("updated_at = NOW()")
                else:
                    set_parts.append(f"{k} = :{k}")
                    bind_params[k] = v

            set_clause = ", ".join(set_parts)
            conn.execute(
                text(f"UPDATE auth.sidebar_items SET {set_clause} WHERE id = :id"),
                bind_params,
            )
            updated = conn.execute(
                text("SELECT * FROM auth.sidebar_items WHERE id = :id"),
                {"id": str(uuid.UUID(item_id))},
            ).fetchone()
            return _sidebar_item_to_dict(updated)


def delete_sidebar_item(item_id: str) -> bool:
    with engine.begin() as conn:
        row = conn.execute(
            text("SELECT 1 FROM auth.sidebar_items WHERE id = :id"),
            {"id": str(uuid.UUID(item_id))},
        ).fetchone()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Sidebar item {item_id} not found")

        conn.execute(
            text("DELETE FROM auth.sidebar_items WHERE id = :id"),
            {"id": str(uuid.UUID(item_id))},
        )
        return True


def _sidebar_item_to_dict(r) -> Dict:
    return {
"id": str(r.id),
"value": r.value,
"label": r.label,
"icon": r.icon,
"href": r.href,
"type": r.type,
"nav_section": r.nav_section,
"open_mode": r.open_mode,
"hidden_from_module_user": r.hidden_from_module_user,
"display_order": r.display_order,
"status": r.status,
"created_at": r.created_at,
"updated_at": r.updated_at,
}