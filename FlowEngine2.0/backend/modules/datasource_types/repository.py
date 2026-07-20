# backend/modules/datasource_types/repository.py

from typing import Optional
from sqlalchemy import text
from backend.core.database import engine


# ── Driver Definitions ────────────────────────────────────────────────────────

def list_drivers() -> list:
    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT * FROM eivs.driver_definitions ORDER BY display_name ASC")
        ).fetchall()
        return [dict(r._mapping) for r in rows]


def list_active_drivers() -> list:
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT * FROM eivs.driver_definitions "
                "WHERE is_active = TRUE ORDER BY display_name ASC"
            )
        ).fetchall()
        return [dict(r._mapping) for r in rows]


def get_driver_by_id(driver_id: int) -> Optional[dict]:
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT * FROM eivs.driver_definitions WHERE driver_id = :driver_id"),
            {"driver_id": driver_id},
        ).fetchone()
        return dict(row._mapping) if row else None


def get_driver_by_canonical_name(canonical_name: str) -> Optional[dict]:
    with engine.connect() as conn:
        row = conn.execute(
            text(
                "SELECT * FROM eivs.driver_definitions "
                "WHERE canonical_name = :canonical_name"
            ),
            {"canonical_name": canonical_name},
        ).fetchone()
        return dict(row._mapping) if row else None


def resolve_driver_by_alias(alias_name: str) -> Optional[dict]:
    with engine.connect() as conn:
        row = conn.execute(
            text(
                """
                SELECT d.* FROM eivs.driver_definitions d
                JOIN eivs.driver_aliases a ON a.driver_id = d.driver_id
                WHERE LOWER(a.alias_name) = LOWER(:alias_name)
                AND a.is_active = TRUE
                """
            ),
            {"alias_name": alias_name},
        ).fetchone()
        return dict(row._mapping) if row else None


def create_driver(
    canonical_name: str,
    display_name: str,
    runtime_owner: str,
    protocol: str,
    dialect_token: str,
    implementation_key: str,
    auth_style: str,
    capabilities: dict,
    config_schema: dict,
    is_active: bool = True,
) -> dict:
    import json
    with engine.begin() as conn:
        row = conn.execute(
            text(
                """
                INSERT INTO eivs.driver_definitions
                (canonical_name, display_name, runtime_owner, protocol,
                dialect_token, implementation_key, auth_style,
                capabilities, config_schema, is_active)
                VALUES
                (:canonical_name, :display_name, :runtime_owner, :protocol,
                :dialect_token, :implementation_key, :auth_style,
                CAST(:capabilities AS jsonb), CAST(:config_schema AS jsonb), :is_active)
                RETURNING *
                """
            ),
            {
                "canonical_name": canonical_name,
                "display_name": display_name,
                "runtime_owner": runtime_owner,
                "protocol": protocol,
                "dialect_token": dialect_token,
                "implementation_key": implementation_key,
                "auth_style": auth_style,
                "capabilities": json.dumps(capabilities),
                "config_schema": json.dumps(config_schema),
                "is_active": is_active,
            },
    ).fetchone()
    return dict(row._mapping)


def update_driver(
    driver_id: int, 
    display_name: str,
    runtime_owner: str,
    protocol: str,
    dialect_token: str,
    implementation_key: str,
    auth_style: str,
    capabilities: dict,
    config_schema: dict,
    is_active: bool,
) -> Optional[dict]:
    import json
    with engine.begin() as conn:
        row = conn.execute(
            text(
                """
                UPDATE eivs.driver_definitions
                SET display_name       = :display_name,
                runtime_owner      = :runtime_owner,
                protocol           = :protocol,
                dialect_token      = :dialect_token,
                implementation_key = :implementation_key,
                auth_style         = :auth_style,
                capabilities       = CAST(:capabilities AS jsonb),
                config_schema      = CAST(:config_schema AS jsonb),
                is_active          = :is_active,
                updated_at         = NOW()
                WHERE driver_id = :driver_id
                RETURNING *
                """
            ),
            {
                "display_name": display_name,
                "runtime_owner": runtime_owner,
                "protocol": protocol,
                "dialect_token": dialect_token,
                "implementation_key": implementation_key,
                "auth_style": auth_style,
                "capabilities": json.dumps(capabilities),
                "config_schema": json.dumps(config_schema),
                "is_active": is_active,
                "driver_id": driver_id,
            },
        ).fetchone()
        return dict(row._mapping) if row else None


def delete_driver(driver_id: int) -> bool:
    with engine.begin() as conn:
        result = conn.execute(
            text("DELETE FROM eivs.driver_definitions WHERE driver_id = :driver_id"),
            {"driver_id": driver_id},
        )
        return result.rowcount == 1


    # ── Driver Aliases ────────────────────────────────────────────────────────────

def list_aliases_for_driver(driver_id: int) -> list:
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT * FROM eivs.driver_aliases "
                "WHERE driver_id = :driver_id ORDER BY alias_name ASC"
            ),
            {"driver_id": driver_id},
        ).fetchall()
        return [dict(r._mapping) for r in rows]


def get_alias_by_id(alias_id: int) -> Optional[dict]:
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT * FROM eivs.driver_aliases WHERE alias_id = :alias_id"),
            {"alias_id": alias_id},
        ).fetchone()
        return dict(row._mapping) if row else None


def create_alias(
    driver_id: int,
    alias_name: str,
    alias_type: str,
    is_active: bool = True,
) -> dict:
    with engine.begin() as conn:
        row = conn.execute(
            text(
                """
                INSERT INTO eivs.driver_aliases
                (driver_id, alias_name, alias_type, is_active)
                VALUES (:driver_id, :alias_name, :alias_type, :is_active)
                RETURNING *
                """
            ),
            {
                "driver_id": driver_id,
                "alias_name": alias_name,
                "alias_type": alias_type,
                "is_active": is_active,
            },
        ).fetchone()
        return dict(row._mapping)


def delete_alias(alias_id: int) -> bool:
    with engine.begin() as conn:
        result = conn.execute(
            text("DELETE FROM eivs.driver_aliases WHERE alias_id = :alias_id"),
            {"alias_id": alias_id},
        )
        return result.rowcount == 1


def get_datasource_type_alias(driver_id: int) -> Optional[str]:
    """Returns the alias_name where alias_type = 'datasource_type' for a driver."""
    with engine.connect() as conn:
        row = conn.execute(
            text(
                """
                SELECT alias_name FROM eivs.driver_aliases
                WHERE driver_id = :driver_id
                AND alias_type = 'datasource_type'
                AND is_active = TRUE
                LIMIT 1
                """
            ),
            {"driver_id": driver_id},
        ).fetchone()
        return row[0] if row else None