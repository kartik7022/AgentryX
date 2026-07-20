# backend/core/middleware/auth.py

import bcrypt
from fastapi import Header, HTTPException, Request, Depends
from datetime import datetime, timezone
from sqlalchemy import text
from backend.core.config import settings
from backend.core.database import engine


def get_tenant_from_api_key(authorization: str) -> dict:
    api_key = authorization.replace("Bearer ", "").strip()
    parts = api_key.split("_", 3)
    if len(parts) != 4 or parts[0] != "ak" or parts[1] != "live":
        raise HTTPException(status_code=401, detail="Invalid API key format.")

    key_id = parts[2]
    secret_raw = parts[3]

    with engine.connect() as conn:
        row = conn.execute(
            text(
                """
                SELECT key_id, key_secret_hash, status, expires_at, tenant_id, scopes, roles
                FROM auth.api_clients
                WHERE key_id = :key_id
                """
            ),
            {"key_id": key_id},
        ).fetchone()

        if not row:
            raise HTTPException(status_code=401, detail="Invalid API key.")
        if row._mapping["status"] != "active":
            raise HTTPException(status_code=401, detail="API key is inactive.")
        if row._mapping["expires_at"] and row._mapping["expires_at"] < datetime.now(timezone.utc):
            raise HTTPException(status_code=401, detail="API key has expired.")

        stored_hash = row._mapping["key_secret_hash"]
        if isinstance(stored_hash, str):
            stored_hash = stored_hash.encode("utf-8")

        if not bcrypt.checkpw(secret_raw.encode("utf-8"), stored_hash):
            raise HTTPException(status_code=401, detail="Invalid API key.")


        tenant_id = row._mapping["tenant_id"]
        return {
            "tenant_id": tenant_id,
            "scopes": row._mapping["scopes"],
            "roles": row._mapping["roles"],
        }


def get_tenant_id(request: Request, authorization: str = Header(None)) -> str:
    # if authorization and authorization.startswith("Bearer ak_live_"):
    #     tenant = get_tenant_from_api_key(authorization)
    #     return tenant["tenant_id"]
    raise HTTPException(status_code=401, detail="Authentication required.")


def get_tenant_context(request: Request, authorization: str = Header(None)) -> dict:
    # API key direct access disabled — use /auth/token to get JWT first
    # if authorization and authorization.startswith("Bearer ak_live_"):
    #     tenant = get_tenant_from_api_key(authorization)
    #     return {
    #         "tenant_id": tenant["tenant_id"],
    #         "role": "tenant_admin",
    #         "user_id": None,
    #     }

    # Check for custom JWT in Authorization header
    if authorization and authorization.startswith("Bearer ") and not authorization.startswith("Bearer ak_live_"):
        token = authorization.replace("Bearer ", "").strip()
        try:
            import jwt
            payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
            tenant_id = payload.get("tenant_id")
            if tenant_id:
                return {
                    "tenant_id": tenant_id,
                    "role": payload.get("role", "tenant_api"),
                    "user_id": payload.get("email"),
                    "modules": payload.get("modules", []),
                }
        except Exception:
            raise HTTPException(status_code=401, detail="Invalid or expired token.")

    session = request.cookies.get("session")
    if session:
        try:
            from backend.modules.auth.jwt_service import verify_tenant_token
            payload = verify_tenant_token(session)
            return {
                "tenant_id": payload["tenant_id"],
                "role": payload.get("role", "tenant_module_user"),
                "user_id": payload.get("sub"),
                "modules": payload.get("modules", []),
            }
        except ValueError:
            raise HTTPException(status_code=401, detail="Invalid or expired session.")

    raise HTTPException(status_code=401, detail="Authentication required.")


def get_current_tenant_admin(request: Request) -> dict:
    session = request.cookies.get("session")
    if not session:
        raise HTTPException(status_code=401, detail="Authentication required.")

    from backend.modules.auth.jwt_service import verify_tenant_token
    try:
        payload = verify_tenant_token(session)
        if payload["role"] not in ("tenant_admin", "tenant_co_admin"):
            raise HTTPException(status_code=403, detail="Admin access required.")
        return {
            "tenant_id": payload["tenant_id"],
            "user_id": payload.get("sub"),
            "role": payload["role"],
        }
    except HTTPException:
        raise
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid or expired session.")


def _check_killbill_subscription(tenant_id: str, feature: str) -> bool:
    """Check Kill Bill for active subscription covering this feature/module."""
    import httpx
    try:
        # Get Kill Bill account by tenant_id (externalKey)
        kb_res = httpx.get(
            f"{settings.killbill_gateway_url}/api/v1/accounts?externalKey={tenant_id}",
            headers={
                "X-Killbill-ApiKey": settings.killbill_api_key,
                "X-Killbill-ApiSecret": settings.killbill_api_secret,
            },
            timeout=5,
        )
        if kb_res.status_code != 200:
            return False
        account_id = kb_res.json().get("accountId")
        if not account_id:
            return False

        # Get bundles and check for active subscription matching the feature/module
        bundles_res = httpx.get(
            f"{settings.killbill_gateway_url}/api/v1/accounts/{account_id}/bundles",
            headers={
                "X-Killbill-ApiKey": settings.killbill_api_key,
                "X-Killbill-ApiSecret": settings.killbill_api_secret,
            },
            timeout=5,
        )
        if bundles_res.status_code != 200:
            return False

        active_products = set()
        for bundle in bundles_res.json():
            for sub in bundle.get("subscriptions", []):
                if sub.get("state") == "ACTIVE":
                    product = (sub.get("productName") or "").replace(" ", "_").replace("-", "_").lower()
                    if product:
                        active_products.add(product)

        if not active_products:
            return False

        # Check if any active product's module covers this feature via sidebar_items
        from backend.core.database import engine as _engine
        from sqlalchemy import text as _text
        with _engine.connect() as conn:
            for product in active_products:
                row = conn.execute(
                    _text("""
                        SELECT 1 FROM auth.modules
                        WHERE LOWER(name) = :product
                        AND sidebar_items @> CAST(:feature AS jsonb)
                        AND status = 'active'
                    """),
                    {"product": product, "feature": f'["{feature}"]'},
                ).fetchone()
                if row:
                    return True
        return False
    except Exception:
        return False


def require_permission(feature: str = None):
    def _check(request: Request, authorization: str = Header(None)) -> dict:
        ctx = get_tenant_context(request, authorization)

        if ctx["role"] in ("tenant_admin", "tenant_co_admin", "tenant_api"):
            if feature is None:
                return ctx
            if not _check_killbill_subscription(ctx["tenant_id"], feature):
                raise HTTPException(status_code=403, detail="You do not have access to this module.")
            return ctx

        if ctx["role"] == "tenant_module_user":
            if feature is None:
                return ctx
            if not _check_killbill_subscription(ctx["tenant_id"], feature):
                raise HTTPException(status_code=403, detail="You do not have access to this module.")
            user_modules = ctx.get("modules", [])
            allowed = False
            if user_modules:
                with engine.connect() as conn:
                    for mod_id in user_modules:
                        row = conn.execute(
                            text("""
                                SELECT 1 FROM auth.modules
                                WHERE LOWER(name) = LOWER(:mod_id)
                                AND sidebar_items @> CAST(:feature AS jsonb)
                                AND status = 'active'
                            """),
                            {"mod_id": mod_id, "feature": f'["{feature}"]'},
                        ).fetchone()
                        if row:
                            allowed = True
                            break
            if not allowed:
                raise HTTPException(status_code=403, detail="You do not have access to this module.")

            with engine.connect() as conn:
                row = conn.execute(
                    text("""
                        SELECT hidden_from_module_user FROM auth.sidebar_items
                        WHERE value = :feature
                    """),
                    {"feature": feature},
                ).fetchone()
                if row and row._mapping["hidden_from_module_user"]:
                    raise HTTPException(status_code=403, detail="You do not have access to this module.")

            return ctx

        raise HTTPException(status_code=403, detail="Access denied.")

    return _check
