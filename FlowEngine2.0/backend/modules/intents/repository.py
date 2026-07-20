# backend/modules/intents/repository.py

from typing import List, Optional
from datetime import datetime

from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.core.database import engine
from backend.modules.intents.schemas import (
    IntentCreate, IntentUpdate,
    IntentPolicyCreate, IntentPolicyUpdate,
)


class _Row:
    """Wraps a DB row so service.py can access fields as attributes."""
    def __init__(self, row, extra: dict = None):
        self.__dict__.update(dict(row._mapping))
        if extra:
            self.__dict__.update(extra)


            # =============================================================================
            # IntentRepository
            # =============================================================================

class IntentRepository:

    def __init__(self, db: Session):
        self.db = db

    def get_all(self, tenant_id: str, active_only: bool = False) -> List[_Row]:
        sql = "SELECT * FROM eivs.intents WHERE tenant_id = :tenant_id"
        params = {"tenant_id": tenant_id}
        if active_only:
            sql += " AND is_active = TRUE"
        sql += " ORDER BY intent_code ASC"
        with engine.connect() as conn:
            rows = conn.execute(text(sql), params).fetchall()
        return [_Row(r) for r in rows]

    def get_by_id(self, tenant_id: str, intent_id: int) -> Optional[_Row]:
        with engine.connect() as conn:
            row = conn.execute(
                text("""
                    SELECT * FROM eivs.intents
                    WHERE tenant_id = :tenant_id AND intent_id = :intent_id
                """),
                {"tenant_id": tenant_id, "intent_id": intent_id},
            ).fetchone()
        return _Row(row) if row else None

    def get_by_code(self, tenant_id: str, intent_code: str) -> Optional[_Row]:
        with engine.connect() as conn:
            row = conn.execute(
                text("""
                    SELECT * FROM eivs.intents
                    WHERE tenant_id = :tenant_id AND intent_code = :intent_code
                """),
                {"tenant_id": tenant_id, "intent_code": intent_code},
            ).fetchone()
        return _Row(row) if row else None

    def create(self, tenant_id: str, payload: IntentCreate) -> _Row:
        intent_data = payload.model_dump(exclude={"policies"})
        intent_data["tenant_id"] = tenant_id
        intent_data["created_at"] = datetime.utcnow()
        intent_data["updated_at"] = datetime.utcnow()

        columns = ", ".join(intent_data.keys())
        placeholders = ", ".join(f":{k}" for k in intent_data.keys())

        with engine.begin() as conn:
            intent_row = conn.execute(
                text(f"""
                    INSERT INTO eivs.intents ({columns})
                    VALUES ({placeholders})
                    RETURNING *
                """),
                intent_data,
            ).fetchone()

            for policy_data in payload.policies:
                pd = policy_data.model_dump()
                pd["tenant_id"] = tenant_id
                pd["intent_id"] = intent_row.intent_id
                pd["created_at"] = datetime.utcnow()
                pd["updated_at"] = datetime.utcnow()
                p_columns = ", ".join(pd.keys())
                p_placeholders = ", ".join(f":{k}" for k in pd.keys())
                conn.execute(
                    text(f"""
                        INSERT INTO eivs.intent_policies ({p_columns})
                        VALUES ({p_placeholders})
                    """),
                    pd,
                )

        return _Row(intent_row)

    def update(self, tenant_id: str, intent_id: int, payload: IntentUpdate) -> Optional[_Row]:
        updates = payload.model_dump(exclude_unset=True)
        updates["updated_at"] = datetime.utcnow()
        set_clause = ", ".join(f"{k} = :{k}" for k in updates.keys())
        updates["tenant_id"] = tenant_id
        updates["intent_id"] = intent_id
        with engine.begin() as conn:
            conn.execute(
                text(f"""
                    UPDATE eivs.intents
                    SET {set_clause}
                    WHERE tenant_id = :tenant_id AND intent_id = :intent_id
                """),
                updates,
            )
        return self.get_by_id(tenant_id, intent_id)

    def delete(self, tenant_id: str, intent_id: int) -> bool:
        with engine.begin() as conn:
            result = conn.execute(
                text("""
                    DELETE FROM eivs.intents
                    WHERE tenant_id = :tenant_id AND intent_id = :intent_id
                """),
                {"tenant_id": tenant_id, "intent_id": intent_id},
            )
        return result.rowcount > 0


        # =============================================================================
        # IntentPolicyRepository
        # =============================================================================

class IntentPolicyRepository:

    def __init__(self, db: Session):
        self.db = db

    def get_all_with_intent(self, tenant_id: str) -> List[_Row]:
        with engine.connect() as conn:
            rows = conn.execute(
                text("""
                    SELECT p.*, i.intent_code, i.display_name
                    FROM eivs.intent_policies p
                    JOIN eivs.intents i ON i.intent_id = p.intent_id
                    WHERE p.tenant_id = :tenant_id
                    ORDER BY i.intent_code ASC, p.language_code ASC
                """),
                {"tenant_id": tenant_id},
            ).fetchall()
        return [_Row(r) for r in rows]

    def get_all(self, tenant_id: str) -> List[_Row]:
        with engine.connect() as conn:
            rows = conn.execute(
                text("""
                    SELECT * FROM eivs.intent_policies
                    WHERE tenant_id = :tenant_id
                    ORDER BY intent_id ASC, language_code ASC
                """),
                {"tenant_id": tenant_id},
            ).fetchall()
        return [_Row(r) for r in rows]

    def get_by_intent(self, tenant_id: str, intent_id: int) -> List[_Row]:
        with engine.connect() as conn:
            rows = conn.execute(
                text("""
                    SELECT * FROM eivs.intent_policies
                    WHERE tenant_id = :tenant_id AND intent_id = :intent_id
                    ORDER BY language_code ASC
                """),
                {"tenant_id": tenant_id, "intent_id": intent_id},
            ).fetchall()
        return [_Row(r) for r in rows]

    def get_by_intent_and_language(self, tenant_id: str, intent_id: int, language_code: str) -> Optional[_Row]:
        with engine.connect() as conn:
            row = conn.execute(
                text("""
                    SELECT * FROM eivs.intent_policies
                    WHERE tenant_id = :tenant_id
                        AND intent_id = :intent_id
                        AND language_code = :language_code
                """),
                {"tenant_id": tenant_id, "intent_id": intent_id, "language_code": language_code},
            ).fetchone()
        return _Row(row) if row else None

    def create(self, tenant_id: str, intent_id: int, payload: IntentPolicyCreate) -> _Row:
        data = payload.model_dump()
        data["tenant_id"] = tenant_id
        data["intent_id"] = intent_id
        data["created_at"] = datetime.utcnow()
        data["updated_at"] = datetime.utcnow()
        columns = ", ".join(data.keys())
        placeholders = ", ".join(f":{k}" for k in data.keys())
        with engine.begin() as conn:
            row = conn.execute(
                text(f"""
                    INSERT INTO eivs.intent_policies ({columns})
                    VALUES ({placeholders})
                    RETURNING *
                """),
                data,
            ).fetchone()
        return _Row(row)

    def update(self, tenant_id: str, intent_id: int, language_code: str, payload: IntentPolicyUpdate) -> Optional[_Row]:
        updates = payload.model_dump(exclude_unset=True)
        updates["updated_at"] = datetime.utcnow()
        set_clause = ", ".join(f"{k} = :{k}" for k in updates.keys())
        updates["tenant_id"] = tenant_id
        updates["intent_id"] = intent_id
        updates["language_code"] = language_code
        with engine.begin() as conn:
            conn.execute(
                text(f"""
                    UPDATE eivs.intent_policies
                    SET {set_clause}
                    WHERE tenant_id = :tenant_id
                        AND intent_id = :intent_id
                        AND language_code = :language_code
                """),
                updates,
            )
        return self.get_by_intent_and_language(tenant_id, intent_id, language_code)

    def delete(self, tenant_id: str, intent_id: int, language_code: str) -> bool:
        with engine.begin() as conn:
            result = conn.execute(
                text("""
                    DELETE FROM eivs.intent_policies
                    WHERE tenant_id = :tenant_id
                        AND intent_id = :intent_id
                        AND language_code = :language_code
                """),
                {"tenant_id": tenant_id, "intent_id": intent_id, "language_code": language_code},
            )
        return result.rowcount > 0