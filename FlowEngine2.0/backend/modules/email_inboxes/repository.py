# backend/modules/email_inboxes/repository.py

from typing import List, Optional
from datetime import datetime

from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.core.database import engine
from backend.modules.email_inboxes.schemas import (
    EmailInboxCreate, EmailInboxUpdate,
)


class _Row:
    """Wraps a DB row so service.py can access fields as attributes."""
    def __init__(self, row):
        self.__dict__.update(dict(row._mapping))


        # =============================================================================
        # EmailInboxRepository
        # =============================================================================

class EmailInboxRepository:

    def __init__(self, db: Session):
        self.db = db

    def get_all(self, tenant_id: str, active_only: bool = False) -> List[_Row]:
        sql = "SELECT * FROM eivs.email_inboxes WHERE tenant_id = :tenant_id"
        params = {"tenant_id": tenant_id}
        if active_only:
            sql += " AND status = 'active'"
        sql += " ORDER BY inbox_name ASC"
        with engine.connect() as conn:
            rows = conn.execute(text(sql), params).fetchall()
        return [_Row(r) for r in rows]

    def get_by_id(self, tenant_id: str, inbox_id: int) -> Optional[_Row]:
        with engine.connect() as conn:
            row = conn.execute(
                text("""
                    SELECT * FROM eivs.email_inboxes
                    WHERE tenant_id = :tenant_id AND inbox_id = :inbox_id
                """),
                {"tenant_id": tenant_id, "inbox_id": inbox_id},
            ).fetchone()
        return _Row(row) if row else None

    def get_by_name(self, tenant_id: str, inbox_name: str) -> Optional[_Row]:
        with engine.connect() as conn:
            row = conn.execute(
                text("""
                    SELECT * FROM eivs.email_inboxes
                    WHERE tenant_id = :tenant_id AND inbox_name = :inbox_name
                """),
                {"tenant_id": tenant_id, "inbox_name": inbox_name},
            ).fetchone()
        return _Row(row) if row else None
    
    def get_by_email(self, tenant_id: str, email: str) -> Optional[_Row]:
        with engine.connect() as conn:
            row = conn.execute(
                text("""
                SELECT * FROM eivs.email_inboxes
                WHERE tenant_id = :tenant_id AND LOWER(email_address) = :email
                """),
                {"tenant_id": tenant_id, "email": email.strip().lower()},
            ).fetchone()
        return _Row(row) if row else None

    def create(self, tenant_id: str, payload: EmailInboxCreate) -> _Row:
        data = payload.model_dump()
        data["tenant_id"] = tenant_id
        data["created_at"] = datetime.utcnow()
        data["updated_at"] = datetime.utcnow()

        columns = ", ".join(data.keys())
        placeholders = ", ".join(f":{k}" for k in data.keys())

        with engine.begin() as conn:
            row = conn.execute(
                text(f"""
                    INSERT INTO eivs.email_inboxes ({columns})
                    VALUES ({placeholders})
                    RETURNING *
                """),
                data,
            ).fetchone()
        return _Row(row)

    def update(self, tenant_id: str, inbox_id: int, payload: EmailInboxUpdate) -> Optional[_Row]:
        updates = payload.model_dump(exclude_unset=True)
        updates["updated_at"] = datetime.utcnow()
        set_clause = ", ".join(f"{k} = :{k}" for k in updates.keys())
        updates["tenant_id"] = tenant_id
        updates["inbox_id"] = inbox_id

        with engine.begin() as conn:
            conn.execute(
                text(f"""
                    UPDATE eivs.email_inboxes
                    SET {set_clause}
                    WHERE tenant_id = :tenant_id AND inbox_id = :inbox_id
                """),
                updates,
            )
        return self.get_by_id(tenant_id, inbox_id)


    def update_vault_path(self, tenant_id: str, inbox_id: int, vault_path: str) -> None:
        with engine.begin() as conn:
            conn.execute(
                text("""
                    UPDATE eivs.email_inboxes
                    SET vault_path = :vault_path, updated_at = :updated_at
                    WHERE tenant_id = :tenant_id AND inbox_id = :inbox_id
                """),
                {
                    "vault_path": vault_path,
                    "updated_at": datetime.utcnow(),
                    "tenant_id": tenant_id,
                    "inbox_id": inbox_id,
                },
        )
    def delete(self, tenant_id: str, inbox_id: int) -> bool:
        with engine.begin() as conn:
            result = conn.execute(
                text("""
                DELETE FROM eivs.email_inboxes
                WHERE tenant_id = :tenant_id AND inbox_id = :inbox_id
                """),
                {"tenant_id": tenant_id, "inbox_id": inbox_id},
            )
            return result.rowcount > 0

