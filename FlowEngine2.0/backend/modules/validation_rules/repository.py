# backend/modules/validation_rules/repository.py

from typing import List, Optional
from datetime import datetime

from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.core.database import engine
from backend.modules.validation_rules.schemas import ValidationRuleCreate, ValidationRuleUpdate


class _Row:
    """Wraps a DB row so service.py can access fields as attributes."""
    def __init__(self, row):
        self.__dict__.update(dict(row._mapping))


class ValidationRuleRepository:

    def __init__(self, db: Session):
        self.db = db

    def get_all(
        self,
        tenant_id: str,
        intent_id: Optional[int] = None,
        language_code: Optional[str] = None,
        active_only: bool = False,
    ) -> List[_Row]:
        sql = """
        SELECT vr.*, ds.name AS ds_name, ds.datasource_type, ds.connection_key
        FROM eivs.validation_rules vr
        JOIN eivs.datasources ds ON vr.datasource_id = ds.datasource_id
        WHERE vr.tenant_id = :tenant_id
        """
        params = {"tenant_id": tenant_id}

        if intent_id is not None:
            sql += " AND vr.intent_id = :intent_id"
            params["intent_id"] = intent_id
        if language_code is not None:
            sql += " AND vr.language_code = :language_code"
            params["language_code"] = language_code
        if active_only:
            sql += " AND vr.is_active = TRUE"

        sql += " ORDER BY vr.intent_id, vr.language_code, vr.execution_order"

        with engine.connect() as conn:
            rows = conn.execute(text(sql), params).fetchall()

        result = []
        for row in rows:
            r = _Row(row)
            r.datasource = type('_DS', (), {
                'datasource_id': r.datasource_id,
                'name': r.ds_name,
                'datasource_type': r.datasource_type,
                'connection_key': r.connection_key,
            })()
            result.append(r)
        return result

    def get_by_id(self, tenant_id: str, rule_id: int) -> Optional[_Row]:
        with engine.connect() as conn:
            row = conn.execute(
                text("""
                    SELECT vr.*, ds.name AS ds_name, ds.datasource_type, ds.connection_key
                    FROM eivs.validation_rules vr
                    JOIN eivs.datasources ds ON vr.datasource_id = ds.datasource_id
                    WHERE vr.tenant_id = :tenant_id AND vr.rule_id = :rule_id
                """),
                {"tenant_id": tenant_id, "rule_id": rule_id},
            ).fetchone()

        if not row:
            return None

        r = _Row(row)
        r.datasource = type('_DS', (), {
            'datasource_id': r.datasource_id,
            'name': r.ds_name,
            'datasource_type': r.datasource_type,
            'connection_key': r.connection_key,
        })()
        return r

    def get_by_rule_code(self, tenant_id: str, rule_code: str) -> Optional[_Row]:
        with engine.connect() as conn:
            row = conn.execute(
                text("""
                    SELECT * FROM eivs.validation_rules
                    WHERE tenant_id = :tenant_id AND rule_code = :rule_code
                """),
                {"tenant_id": tenant_id, "rule_code": rule_code},
            ).fetchone()
        return _Row(row) if row else None

    def get_by_intent_and_language(
        self, tenant_id: str, intent_id: int, language_code: str
    ) -> List[_Row]:
        with engine.connect() as conn:
            rows = conn.execute(
                text("""
                    SELECT * FROM eivs.validation_rules
                    WHERE tenant_id = :tenant_id
                        AND intent_id = :intent_id
                        AND language_code = :language_code
                        AND is_active = TRUE
                    ORDER BY execution_order
                """),
                {"tenant_id": tenant_id, "intent_id": intent_id, "language_code": language_code},
            ).fetchall()
            return [_Row(r) for r in rows]

    def get_max_execution_order(
        self, tenant_id: str, intent_id: int, language_code: str
    ) -> int:
        with engine.connect() as conn:
            result = conn.execute(
                text("""
                    SELECT execution_order FROM eivs.validation_rules
                    WHERE tenant_id = :tenant_id
                        AND intent_id = :intent_id
                        AND language_code = :language_code
                    ORDER BY execution_order DESC
                    LIMIT 1
                """),
                {"tenant_id": tenant_id, "intent_id": intent_id, "language_code": language_code},
            ).fetchone()
        return result[0] if result else 0

    def create(self, tenant_id: str, payload: ValidationRuleCreate) -> _Row:
        data = payload.model_dump()
        data["tenant_id"] = tenant_id
        data["created_at"] = datetime.utcnow()
        data["updated_at"] = datetime.utcnow()

        columns = ", ".join(data.keys())
        placeholders = ", ".join(f":{k}" for k in data.keys())

        with engine.begin() as conn:
            row = conn.execute(
                text(f"""
                    INSERT INTO eivs.validation_rules ({columns})
                    VALUES ({placeholders})
                    RETURNING rule_id
                """),
                data,
            ).fetchone()

        return self.get_by_id(tenant_id, row.rule_id)

    def update(self, tenant_id: str, rule_id: int, payload: ValidationRuleUpdate) -> Optional[_Row]:
        updates = payload.model_dump(exclude_unset=True)
        updates["updated_at"] = datetime.utcnow()
        set_clause = ", ".join(f"{k} = :{k}" for k in updates.keys())
        updates["tenant_id"] = tenant_id
        updates["rule_id"] = rule_id

        with engine.begin() as conn:
            conn.execute(
                text(f"""
                    UPDATE eivs.validation_rules
                    SET {set_clause}
                    WHERE tenant_id = :tenant_id AND rule_id = :rule_id
                """),
                updates,
            )

        return self.get_by_id(tenant_id, rule_id)

    def delete(self, tenant_id: str, rule_id: int) -> bool:
        with engine.begin() as conn:
            result = conn.execute(
                text("""
                    DELETE FROM eivs.validation_rules
                    WHERE tenant_id = :tenant_id AND rule_id = :rule_id
                """),
                {"tenant_id": tenant_id, "rule_id": rule_id},
            )
        return result.rowcount > 0