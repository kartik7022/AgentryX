# services/intent_plan_mappings_repository.py
from typing import Any, Dict, List, Optional
from uuid import uuid4

from .db import execute, execute_one, execute_write


def create_intent_plan_mapping(
    conn,
    tenant_id: str,
    intent_code: str,
    plan_name: str,
    entity_type: str = "email",
    channel: str = "email",
    locale: str = "multi",
    rank: int = 1,
    is_active: bool = True,
    created_by: Optional[str] = None,
) -> dict:
    mapping_id = str(uuid4())
    execute_write(conn, """
        INSERT INTO orchestration.intent_plan_mappings
            (mapping_id, tenant_id, intent_code, entity_type, plan_name,
             channel, locale, rank, is_active, created_by)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """, (
        mapping_id, tenant_id, intent_code, entity_type, plan_name,
        channel, locale, rank, is_active, created_by,
    ))
    conn.commit()
    return execute_one(conn,
        "SELECT * FROM orchestration.intent_plan_mappings WHERE mapping_id = %s",
        (mapping_id,)
    )


def list_intent_plan_mappings(
    conn,
    tenant_id: Optional[str] = None,
    intent_code: Optional[str] = None,
    is_active: Optional[bool] = None,
) -> List[dict]:
    sql = "SELECT * FROM orchestration.intent_plan_mappings WHERE 1=1"
    params: List[Any] = []
    if tenant_id:
        sql += " AND tenant_id = %s"
        params.append(tenant_id)
    if intent_code:
        sql += " AND intent_code = %s"
        params.append(intent_code)
    if is_active is not None:
        sql += " AND is_active = %s"
        params.append(is_active)
    sql += " ORDER BY tenant_id, intent_code, rank"
    return execute(conn, sql, params or None)


def get_intent_plan_mapping(conn, mapping_id: str) -> Optional[dict]:
    return execute_one(conn,
        "SELECT * FROM orchestration.intent_plan_mappings WHERE mapping_id = %s",
        (mapping_id,)
    )


def update_intent_plan_mapping(
    conn,
    mapping_id: str,
    plan_name: Optional[str] = None,
    channel: Optional[str] = None,
    locale: Optional[str] = None,
    rank: Optional[int] = None,
    is_active: Optional[bool] = None,
) -> Optional[dict]:
    existing = get_intent_plan_mapping(conn, mapping_id)
    if not existing:
        return None

    fields = []
    values: List[Any] = []
    if plan_name is not None:
        fields.append("plan_name = %s")
        values.append(plan_name)
    if channel is not None:
        fields.append("channel = %s")
        values.append(channel)
    if locale is not None:
        fields.append("locale = %s")
        values.append(locale)
    if rank is not None:
        fields.append("rank = %s")
        values.append(rank)
    if is_active is not None:
        fields.append("is_active = %s")
        values.append(is_active)

    if not fields:
        return existing

    values.append(mapping_id)
    execute_write(conn,
        f"UPDATE orchestration.intent_plan_mappings SET {', '.join(fields)} "
        f"WHERE mapping_id = %s",
        values
    )
    conn.commit()
    return get_intent_plan_mapping(conn, mapping_id)


def delete_intent_plan_mapping(conn, mapping_id: str) -> bool:
    existing = get_intent_plan_mapping(conn, mapping_id)
    if not existing:
        return False
    execute_write(conn,
        "DELETE FROM orchestration.intent_plan_mappings WHERE mapping_id = %s",
        (mapping_id,)
    )
    conn.commit()
    return True


def resolve_plan_for_intent(
    conn,
    tenant_id: str,
    intent_code: str,
    entity_type: str = "email",
    channel: str = "email",
    locale: str = "multi",
) -> Optional[str]:
    row = execute_one(conn, """
        SELECT plan_name FROM orchestration.intent_plan_mappings
        WHERE tenant_id = %s AND intent_code = %s AND entity_type = %s
          AND channel = %s AND locale = %s AND is_active = TRUE
        ORDER BY rank ASC
        LIMIT 1
    """, (tenant_id, intent_code, entity_type, channel, locale))
    if row:
        return row["plan_name"]

    if locale != "multi":
        row = execute_one(conn, """
            SELECT plan_name FROM orchestration.intent_plan_mappings
            WHERE tenant_id = %s AND intent_code = %s AND entity_type = %s
              AND channel = %s AND locale = 'multi' AND is_active = TRUE
            ORDER BY rank ASC
            LIMIT 1
        """, (tenant_id, intent_code, entity_type, channel))
        if row:
            return row["plan_name"]

    row = execute_one(conn, """
        SELECT plan_name FROM orchestration.intent_plan_mappings
        WHERE tenant_id = %s AND intent_code = %s AND entity_type = %s
          AND is_active = TRUE
        ORDER BY rank ASC
        LIMIT 1
    """, (tenant_id, intent_code, entity_type))
    return row["plan_name"] if row else None