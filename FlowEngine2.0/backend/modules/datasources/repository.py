# backend/modules/datasources/repository.py

from typing import List, Optional
from datetime import datetime

from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.core.database import engine
from backend.modules.datasources.schemas import (
    DatasourceCreate, DatasourceUpdate,
    DatasourceConfigCreate, DatasourceConfigUpdate,
)


# ── Helper: row → plain dict (acts like an ORM object for service.py) ─────────

class _Row:
    """Wraps a DB row so service.py can access fields as attributes."""
    def __init__(self, row):
        self.__dict__.update(dict(row._mapping))

    def __repr__(self):
        return f"<Row {self.__dict__}>"


    # =============================================================================
    # DatasourceRepository
    # =============================================================================

class DatasourceRepository:

    def __init__(self, db: Session):
        self.db = db

    def get_all(self, tenant_id: str, active_only: bool = False) -> List[_Row]:
        sql = "SELECT * FROM eivs.datasources WHERE tenant_id = :tenant_id"
        params = {"tenant_id": tenant_id}
        if active_only:
            sql += " AND is_active = TRUE"
        sql += " ORDER BY name ASC"
        with engine.connect() as conn:
            rows = conn.execute(text(sql), params).fetchall()
        return [_Row(r) for r in rows]

    def get_by_id(self, tenant_id: str, datasource_id: int) -> Optional[_Row]:
        with engine.connect() as conn:
            row = conn.execute(
                text("""
                    SELECT * FROM eivs.datasources
                    WHERE tenant_id = :tenant_id AND datasource_id = :datasource_id
                """),
                {"tenant_id": tenant_id, "datasource_id": datasource_id},
            ).fetchone()
        return _Row(row) if row else None

    def get_by_name(self, tenant_id: str, name: str) -> Optional[_Row]:
        with engine.connect() as conn:
            row = conn.execute(
                text("""
                    SELECT * FROM eivs.datasources
                    WHERE tenant_id = :tenant_id AND name = :name
                """),
                {"tenant_id": tenant_id, "name": name},
            ).fetchone()
        return _Row(row) if row else None

    def get_by_connection_key(self, tenant_id: str, connection_key: str) -> Optional[_Row]:
        with engine.connect() as conn:
            row = conn.execute(
                text("""
                    SELECT * FROM eivs.datasources
                    WHERE tenant_id = :tenant_id AND connection_key = :connection_key
                """),
                {"tenant_id": tenant_id, "connection_key": connection_key},
            ).fetchone()
        return _Row(row) if row else None

    def create(self, tenant_id: str, payload: DatasourceCreate) -> _Row:
        data = payload.model_dump()
        data["tenant_id"] = tenant_id
        columns = ", ".join(data.keys())
        placeholders = ", ".join(f":{k}" for k in data.keys())
        with engine.begin() as conn:
            row = conn.execute(
                text(f"""
                    INSERT INTO eivs.datasources ({columns})
                    VALUES ({placeholders})
                    RETURNING *
                """),
                data,
            ).fetchone()
        return _Row(row)

    def update(self, tenant_id: str, datasource_id: int, payload: DatasourceUpdate) -> Optional[_Row]:
        updates = payload.model_dump(exclude_unset=True)
        if not updates:
            return self.get_by_id(tenant_id, datasource_id)
        set_clause = ", ".join(f"{k} = :{k}" for k in updates.keys())
        updates["tenant_id"] = tenant_id
        updates["datasource_id"] = datasource_id
        with engine.begin() as conn:
            conn.execute(
                text(f"""
                    UPDATE eivs.datasources
                    SET {set_clause}
                    WHERE tenant_id = :tenant_id AND datasource_id = :datasource_id
                """),
                updates,
            )
        return self.get_by_id(tenant_id, datasource_id)

    def delete(self, tenant_id: str, datasource_id: int) -> bool:
        with engine.begin() as conn:
            result = conn.execute(
                text("""
                    DELETE FROM eivs.datasources
                    WHERE tenant_id = :tenant_id AND datasource_id = :datasource_id
                """),
                {"tenant_id": tenant_id, "datasource_id": datasource_id},
            )
        return result.rowcount > 0

    def get_validation_rules_count(self, tenant_id: str, datasource_id: int) -> int:
        with engine.connect() as conn:
            result = conn.execute(
                text("""
                    SELECT COUNT(*) FROM eivs.validation_rules
                    WHERE tenant_id = :tenant_id AND datasource_id = :datasource_id
                """),
                {"tenant_id": tenant_id, "datasource_id": datasource_id},
            ).scalar()
        return result or 0


        # =============================================================================
        # DatasourceConfigRepository
        # =============================================================================

class DatasourceConfigRepository:

    def __init__(self, db: Session):
        self.db = db

    def get_all(self, tenant_id: str, active_only: bool = False) -> List[_Row]:
        sql = "SELECT * FROM eivs.datasource_configs WHERE tenant_id = :tenant_id"
        params = {"tenant_id": tenant_id}
        if active_only:
            sql += " AND is_active = TRUE"
        sql += " ORDER BY name ASC"
        with engine.connect() as conn:
            rows = conn.execute(text(sql), params).fetchall()
        return [_Row(r) for r in rows]

    def get_by_id(self, tenant_id: str, config_id: int) -> Optional[_Row]:
        with engine.connect() as conn:
            row = conn.execute(
                text("""
                    SELECT * FROM eivs.datasource_configs
                    WHERE tenant_id = :tenant_id AND config_id = :config_id
                """),
                {"tenant_id": tenant_id, "config_id": config_id},
            ).fetchone()
        return _Row(row) if row else None

    def get_by_name(self, tenant_id: str, name: str) -> Optional[_Row]:
        with engine.connect() as conn:
            row = conn.execute(
                text("""
                    SELECT * FROM eivs.datasource_configs
                    WHERE tenant_id = :tenant_id AND name = :name
                """),
                {"tenant_id": tenant_id, "name": name},
            ).fetchone()
        return _Row(row) if row else None

    def get_by_driver_family(self, tenant_id: str, driver_family: str) -> List[_Row]:
        with engine.connect() as conn:
            rows = conn.execute(
                text("""
                    SELECT * FROM eivs.datasource_configs
                    WHERE tenant_id = :tenant_id AND driver_family = :driver_family
                    ORDER BY name ASC
                """),
                {"tenant_id": tenant_id, "driver_family": driver_family},
            ).fetchall()
        return [_Row(r) for r in rows]

    def get_by_protocol(self, tenant_id: str, protocol: str) -> List[_Row]:
        with engine.connect() as conn:
            rows = conn.execute(
                text("""
                    SELECT * FROM eivs.datasource_configs
                    WHERE tenant_id = :tenant_id AND protocol = :protocol
                    ORDER BY name ASC
                """),
                {"tenant_id": tenant_id, "protocol": protocol},
            ).fetchall()
        return [_Row(r) for r in rows]

    def create(self, tenant_id: str, payload: DatasourceConfigCreate) -> _Row:
        data = payload.model_dump()
        data["tenant_id"] = tenant_id
        data["created_at"] = datetime.utcnow()
        data["updated_at"] = datetime.utcnow()
        columns = ", ".join(data.keys())
        placeholders = ", ".join(f":{k}" for k in data.keys())
        with engine.begin() as conn:
            row = conn.execute(
                text(f"""
                    INSERT INTO eivs.datasource_configs ({columns})
                    VALUES ({placeholders})
                    RETURNING *
                """),
                data,
            ).fetchone()
        return _Row(row)

    def update(self, tenant_id: str, config_id: int, payload: DatasourceConfigUpdate) -> Optional[_Row]:
        updates = payload.model_dump(exclude_unset=True)
        updates["updated_at"] = datetime.utcnow()
        set_clause = ", ".join(f"{k} = :{k}" for k in updates.keys())
        updates["tenant_id"] = tenant_id
        updates["config_id"] = config_id
        with engine.begin() as conn:
            conn.execute(
                text(f"""
                    UPDATE eivs.datasource_configs
                    SET {set_clause}
                    WHERE tenant_id = :tenant_id AND config_id = :config_id
                """),
                updates,
            )
        return self.get_by_id(tenant_id, config_id)

    def delete(self, tenant_id: str, config_id: int) -> bool:
        with engine.begin() as conn:
            result = conn.execute(
                text("""
                    DELETE FROM eivs.datasource_configs
                    WHERE tenant_id = :tenant_id AND config_id = :config_id
                """),
                {"tenant_id": tenant_id, "config_id": config_id},
            )
        return result.rowcount > 0