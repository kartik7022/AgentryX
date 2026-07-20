# backend/modules/module_groups/repository.py

import uuid
from typing import List, Optional, Dict, Tuple

from fastapi import HTTPException, status
from sqlalchemy import text
from backend.core.database import engine


def _row_to_dict(r) -> Dict:
    return {
        "id": str(r.id),
        "name": r.name,
        "description": r.description,
        "display_order": r.display_order,
        "status": r.status,
        "created_at": r.created_at,
        "updated_at": r.updated_at,
    }


def get_all_groups(status_filter: Optional[str] = None) -> Tuple[List[Dict], int]:
    sql = "SELECT * FROM auth.module_groups"
    params = {}
    if status_filter:
        sql += " WHERE status = :status"
        params["status"] = status_filter
    sql += " ORDER BY display_order ASC, created_at DESC"

    with engine.connect() as conn:
        rows = conn.execute(text(sql), params).fetchall()
        result = [_row_to_dict(r) for r in rows]
        return result, len(result)


def get_group_by_id(group_id: str) -> Dict:
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT * FROM auth.module_groups WHERE id = :id"),
            {"id": str(uuid.UUID(group_id))},
        ).fetchone()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Group {group_id} not found")
        return _row_to_dict(row)


def create_group(payload: Dict) -> Dict:
    group_id = str(uuid.uuid4())
    with engine.begin() as conn:
        conn.execute(
            text("""
                INSERT INTO auth.module_groups (id, name, description, display_order, status)
                VALUES (:id, :name, :description, :display_order, :status)
            """),
            {
                "id": group_id,
                "name": payload["name"],
                "description": payload.get("description"),
                "display_order": payload.get("display_order", 0),
                "status": payload.get("status", "active"),
            },
        )
        row = conn.execute(
            text("SELECT * FROM auth.module_groups WHERE id = :id"),
            {"id": group_id},
        ).fetchone()
        return _row_to_dict(row)


def update_group(group_id: str, payload: Dict) -> Dict:
    with engine.begin() as conn:
        row = conn.execute(
            text("SELECT * FROM auth.module_groups WHERE id = :id"),
            {"id": str(uuid.UUID(group_id))},
        ).fetchone()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Group {group_id} not found")

        updates = {k: v for k, v in payload.items() if v is not None}
        if updates:
            set_clause = ", ".join(f"{k} = :{k}" for k in updates.keys())
            updates["id"] = str(uuid.UUID(group_id))
            conn.execute(
                text(f"UPDATE auth.module_groups SET {set_clause}, updated_at = NOW() WHERE id = :id"),
                updates,
            )

        updated = conn.execute(
            text("SELECT * FROM auth.module_groups WHERE id = :id"),
            {"id": str(uuid.UUID(group_id))},
        ).fetchone()
        return _row_to_dict(updated)


def delete_group(group_id: str) -> bool:
    with engine.begin() as conn:
        row = conn.execute(
            text("SELECT 1 FROM auth.module_groups WHERE id = :id"),
            {"id": str(uuid.UUID(group_id))},
        ).fetchone()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Group {group_id} not found")

        # Unassign all modules from this group before deleting
        conn.execute(
            text("UPDATE auth.modules SET group_id = NULL WHERE group_id = :id"),
            {"id": str(uuid.UUID(group_id))},
        )

        conn.execute(
            text("DELETE FROM auth.module_groups WHERE id = :id"),
            {"id": str(uuid.UUID(group_id))},
        )
        return True