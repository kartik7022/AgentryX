# backend/modules/auth/routes.py

from fastapi import APIRouter, HTTPException, Response, Cookie
from sqlalchemy import text
from backend.core.database import engine
from backend.core.config import settings
import httpx

router = APIRouter()


@router.post("/auth/logout")
def logout(response: Response):
    response.delete_cookie(key="session")
    return {"success": True, "message": "Logged out successfully."}
@router.post("/auth/refresh")
def refresh_session(response: Response, refresh_token: str = Cookie(default=None)):
    if not refresh_token:
        return {"authenticated": False}

    try:
        token_res = httpx.post(
            f"{settings.keycloak_url}/realms/{settings.keycloak_realm}/protocol/openid-connect/token",
            data={
                "grant_type": "refresh_token",
                "client_id": settings.keycloak_client_id,
                "client_secret": settings.keycloak_client_secret,
                "refresh_token": refresh_token,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=10,
        )
        if token_res.status_code != 200:
            return {"authenticated": False}

        token_data = token_res.json()
        new_access_token = token_data.get("access_token")
        new_refresh_token = token_data.get("refresh_token", refresh_token)

        if not new_access_token:
            return {"authenticated": False}

        response.set_cookie(key="session", value=new_access_token, httponly=True, samesite="lax", domain=settings.cookie_domain)
        response.set_cookie(key="refresh_token", value=new_refresh_token, httponly=True, samesite="lax", domain=settings.cookie_domain)
        return {"authenticated": True}

    except Exception:
        return {"authenticated": False}


@router.post("/auth/register")
async def self_register(body: dict):
    email = body.get("email")
    password = body.get("password")
    module_id = body.get("module_id")
    plan = body.get("plan", "basic")

    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password are required.")

    # Resolve module_id to module name
    from backend.modules.platforms_modules import service as mod_service
    all_mods, _ = mod_service.get_all_modules(status_filter="active")
    id_to_name = {m["id"]: m["name"] for m in all_mods}
    module_name = id_to_name.get(module_id)
    modules = [module_name] if module_name else []

    from backend.modules.accounts.service import create_account
    try:
        result = await create_account(
            email=email,
            modules=modules,
            account_type="trial",
            source="self",
            password=password,
        )
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Registration failed: {str(e)}")

    return result

@router.get("/auth/me")
def me(session: str = Cookie(default=None), response: Response = None):
    if not session:
        return {"authenticated": False}

    try:
        userinfo = httpx.get(
            f"{settings.keycloak_url}/realms/{settings.keycloak_realm}/protocol/openid-connect/userinfo",
            headers={"Authorization": f"Bearer {session}"},
            timeout=5,
        )
        if userinfo.status_code == 200:
            info = userinfo.json()
            email = info.get("email")
            if email:
                import json as _json
                tenant_id = info.get("tenant_id")
                role = info.get("role")
                status = info.get("status")
                account_type = info.get("account_type")
                modules_raw = info.get("modules")
                modules = []
                if modules_raw:
                    try:
                        modules = _json.loads(modules_raw) if isinstance(modules_raw, str) else modules_raw
                    except Exception:
                        modules = []

                if tenant_id and role:
                    return {
                        "authenticated": True,
                        "email": email,
                        "tenant_id": tenant_id,
                        "role": role,
                        "modules": modules,
                        "account_type": account_type,
                        "status": status,
                    }
    except Exception:
        pass

    return {"authenticated": False}


@router.post("/auth/payment/verify")
def verify_payment(body: dict):
    payment_success = body.get("payment_success", False)
    return {"payment_success": bool(payment_success)}


@router.post("/auth/upgrade-to-production")
def upgrade_to_production(session: str = Cookie(default=None)):
    if not session:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    try:
        userinfo = httpx.get(
            f"{settings.keycloak_url}/realms/{settings.keycloak_realm}/protocol/openid-connect/userinfo",
            headers={"Authorization": f"Bearer {session}"},
            timeout=5,
        )
        if userinfo.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid session.")
        email = userinfo.json().get("email")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid session.")

    from backend.modules.accounts.service import upgrade_account
    try:
        result = upgrade_account(email, expires_at_str=None)
        return {"success": True, "message": result["message"]}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Upgrade failed: {str(exc)}")



@router.post("/auth/user-token")
def generate_user_token(body: dict):
    email = body.get("email")
    password = body.get("password")
    if not email or not password:
        raise HTTPException(status_code=400, detail="email and password are required.")

    token_res = httpx.post(
        f"{settings.keycloak_internal_external_url}/realms/{settings.keycloak_realm}/protocol/openid-connect/token",
        data={
            "grant_type": "password",
            "client_id": settings.keycloak_client_id,
            "client_secret": settings.keycloak_client_secret,
            "username": email,
            "password": password,
            "scope": "openid email profile",
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=10,
    )
    if token_res.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    access_token = token_res.json().get("access_token")

    userinfo = httpx.get(
        f"{settings.keycloak_internal_external_url}/realms/{settings.keycloak_realm}/protocol/openid-connect/userinfo",
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=5,
    )
    if userinfo.status_code != 200:
        raise HTTPException(status_code=401, detail="Failed to fetch user info.")

    import json as _json, jwt
    from datetime import datetime, timedelta

    info = userinfo.json()
    tenant_id = info.get("tenant_id")
    role = info.get("role")
    status = info.get("status")
    modules_raw = info.get("modules")
    modules = []
    if modules_raw:
        try:
            modules = _json.loads(modules_raw) if isinstance(modules_raw, str) else modules_raw
        except Exception:
            modules = []

    if not tenant_id or not role:
        raise HTTPException(status_code=401, detail="Invalid user attributes.")
    if status == "inactive":
        raise HTTPException(status_code=403, detail="User account is inactive.")
    if role not in ("tenant_module_user", "tenant_co_admin"):
        raise HTTPException(status_code=403, detail="This endpoint is for subusers only. Tenant admins use /auth/token with api_key.")

    payload = {
        "tenant_id": tenant_id,
        "role": role,
        "modules": modules,
        "email": info.get("email"),
        "exp": datetime.utcnow() + timedelta(hours=settings.jwt_ttl_hours),
        "iat": datetime.utcnow(),
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return {"access_token": token, "token_type": "bearer", "expires_in": settings.jwt_ttl_hours * 3600}



@router.post("/auth/token")
def generate_token(body: dict):
    api_key = body.get("api_key")
    if not api_key:
        raise HTTPException(status_code=400, detail="api_key is required.")

    from backend.core.middleware.auth import get_tenant_from_api_key
    try:
        tenant = get_tenant_from_api_key(f"Bearer {api_key}")
    except HTTPException:
        raise

    import jwt
    from datetime import datetime, timedelta

    payload = {
        "tenant_id": tenant["tenant_id"],
        "roles": tenant["roles"],
        "scopes": tenant["scopes"],
        "exp": datetime.utcnow() + timedelta(hours=settings.jwt_ttl_hours),
        "iat": datetime.utcnow(),
    }

    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return {"access_token": token, "token_type": "bearer", "expires_in": settings.jwt_ttl_hours * 3600}

@router.get("/auth/billing-token")
def billing_token(session: str = Cookie(default=None)):
    if not session:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    try:
        userinfo = httpx.get(
            f"{settings.keycloak_url}/realms/{settings.keycloak_realm}/protocol/openid-connect/userinfo",
            headers={"Authorization": f"Bearer {session}"},
            timeout=5,
        )
        if userinfo.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid session.")
        info = userinfo.json()
        tenant_id = info.get("tenant_id")
        email = info.get("email")
        role = info.get("role")
        if not tenant_id or not email:
            raise HTTPException(status_code=401, detail="Invalid session.")
        if role not in ("tenant_admin", "tenant_co_admin"):
            raise HTTPException(status_code=403, detail="Access denied.")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid session.")

    import jwt
    from datetime import datetime, timedelta

    payload = {
        "tenant_id": tenant_id,
        "email": email,
        "exp": datetime.utcnow() + timedelta(minutes=5),
        "iat": datetime.utcnow(),
        "purpose": "billing_portal",
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return {"token": token}


@router.get("/auth/billing-verify")
def billing_verify(token: str):
    if not token:
        raise HTTPException(status_code=400, detail="Token is required.")

    import jwt
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        if payload.get("purpose") != "billing_portal":
            raise HTTPException(status_code=401, detail="Invalid token.")
        return {
            "tenant_id": payload.get("tenant_id"),
            "email": payload.get("email"),
        }
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired.")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token.")