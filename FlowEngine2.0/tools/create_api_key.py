#!/usr/bin/env python3
# tools/create_api_key.py

import os
import sys
import uuid
import json
import secrets
import string
import psycopg2
import bcrypt
from datetime import datetime, timedelta

DB_DSN = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/flowengine").replace("postgresql+psycopg://", "postgresql://")
def random_slug(length=8) -> str:
    alphabet = string.ascii_lowercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))

def create_api_key(tenant_id: str, scopes, roles, ttl_days: int = 365):
    conn = psycopg2.connect(DB_DSN)
    cur = conn.cursor()

    cur.execute(
        """
        UPDATE auth.api_clients
        SET status = 'inactive'
        WHERE tenant_id = %s AND status = 'active'
        """,
        (tenant_id,),
    )

    api_client_id = uuid.uuid4()
    key_id = random_slug(10)
    # secret part (not stored, only hashed)
    secret_raw = secrets.token_urlsafe(32)
    # full key external apps will use:
    api_key = f"ak_live_{key_id}_{secret_raw}"

    secret_hash = bcrypt.hashpw(secret_raw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    expires_at = datetime.utcnow() + timedelta(days=ttl_days)

    cur.execute(
        """
        INSERT INTO auth.api_clients
        (id, tenant_id, key_id, key_secret_hash, api_key, status, scopes, roles, rate_limit_per_min, expires_at)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """,
        (
            str(api_client_id),
            tenant_id,
            key_id,
            secret_hash,
            api_key,
            "active",
            json.dumps(scopes),
            json.dumps(roles),
            60,
            expires_at,
        ),
    )
    conn.commit()
    cur.close()
    conn.close()
    return api_key, key_id, api_client_id

def main():
    if len(sys.argv) < 2:
        print("Usage: create_api_key.py TENANT_ID [scope1,scope2,...] [role1,role2,...]", file=sys.stderr)
        sys.exit(1)
    tenant_id = sys.argv[1]
    scopes = sys.argv[2].split(",") if len(sys.argv) > 2 and sys.argv[2] else ["nlp.query"]
    roles = sys.argv[3].split(",") if len(sys.argv) > 3 and sys.argv[3] else ["TENANT_APP"]

    api_key, key_id, api_client_uuid = create_api_key(tenant_id, scopes, roles)
    print("=== API client created ===")
    print(f"tenant_id       : {tenant_id}")
    print(f"api_client_id   : {api_client_uuid}")
    print(f"key_id          : {key_id}")
    print("IMPORTANT: copy the following API key and store it securely;")
    print("it will not be shown again:")
    print("")
    print(api_key)
    print("")

if __name__ == "__main__":
    main()
