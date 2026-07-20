# backend/modules/api_keys/repository.py

import uuid
import secrets
import string
import json
from datetime import datetime, timedelta
from typing import Optional, List
import hashlib
import bcrypt

from sqlalchemy import text
from backend.core.database import engine
from tools.create_api_key import create_api_key as tool_create_api_key

def random_slug(length=10) -> str:
    alphabet = string.ascii_lowercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def create_api_key(tenant_id: str, expires_at: datetime = None, roles: list = None) -> tuple:
    ttl_days = 365
    if expires_at:
        ttl_days = max((expires_at - datetime.utcnow()).days, 1)

    api_key, key_id, api_client_id = tool_create_api_key(
        tenant_id=tenant_id,
        scopes=[],
        roles=roles or [],
        ttl_days=ttl_days,
    )
    return api_key, key_id, str(api_client_id)


def get_api_key_by_tenant(tenant_id: str) -> Optional[dict]:
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                SELECT * FROM auth.api_clients
                WHERE tenant_id = :tenant_id AND status = 'active'
                ORDER BY created_at DESC
                LIMIT 1
            """),
            {"tenant_id": tenant_id},
        ).fetchone()

    if not row:
        return None

    return {
        "id": str(row.id),
        "api_key": row.api_key,
        "status": row.status,
        "roles": row.roles or [],
        "created_at": row.created_at,
        "expires_at": row.expires_at,
    }


def get_all_api_keys_for_tenant(tenant_id: str) -> List[dict]:
    with engine.connect() as conn:
        rows = conn.execute(
            text("""
                SELECT * FROM auth.api_clients
                WHERE tenant_id = :tenant_id
                ORDER BY created_at DESC
            """),
            {"tenant_id": tenant_id},
        ).fetchall()

    result = []
    for row in rows:
        result.append({
            "id": str(row.id),
            "api_key": row.api_key,
            "status": row.status if row.status else "inactive",
            "roles": row.roles or [],
            "created_at": row.created_at,
            "expires_at": row.expires_at,
        })
    return result


def revoke_api_key(tenant_id: str) -> bool:
    with engine.begin() as conn:
        existing = conn.execute(
            text("""
                SELECT 1 FROM auth.api_clients
                WHERE tenant_id = :tenant_id AND status = 'active'
            """),
            {"tenant_id": tenant_id},
        ).fetchone()

        if not existing:
            return False

        conn.execute(
            text("""
                UPDATE auth.api_clients
                SET status = 'inactive'
                WHERE tenant_id = :tenant_id AND status = 'active'
            """),
            {"tenant_id": tenant_id},
        )

    return True