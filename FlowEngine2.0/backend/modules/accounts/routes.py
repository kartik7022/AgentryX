# backend/modules/accounts/routes.py

from fastapi import APIRouter, HTTPException, status, Cookie
from sqlalchemy import text
from backend.modules.admins.service import verify_admin_token
from backend.modules.accounts.schemas import (
    AccountCreateRequest,
    AccountResponse,
    ModulesResponse,
)
from backend.modules.accounts import service, repository
from backend.modules.accounts.service import get_active_modules_from_killbill as _get_active_modules_from_killbill
from backend.core.database import engine

router = APIRouter()


# ── Helper ────────────────────────────────────────────────────────────────────

def get_current_admin(admin_session: str = Cookie(default=None)) -> dict:
    if not admin_session:
        raise HTTPException(status_code=401, detail="Not authenticated.")
    try:
        return verify_admin_token(admin_session)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))


    # ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/api/modules", response_model=ModulesResponse)
def get_available_modules(admin_session: str = Cookie(default=None)):
    get_current_admin(admin_session)
    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT * FROM auth.modules WHERE status = 'active'")
        ).fetchall()
    return ModulesResponse(modules=[
        {
            "id": str(r.id),
            "name": r.name,
            "description": r.description or "",
            "version": r.version or "1.0.0",
            "status": r.status,
            "is_default": r.is_default,
            "sidebar_items": r.sidebar_items or []
        }
        for r in rows
    ])


@router.post("/api/accounts", status_code=status.HTTP_201_CREATED)
async def create_account(request: AccountCreateRequest, admin_session: str = Cookie(default=None)):
    get_current_admin(admin_session)
    try:
        result = await service.create_account(
            email=request.email,
            modules=request.modules,
            account_type=request.account_type,
            expires_at_str=request.expires_at,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create account: {str(e)}")
    return result


@router.get("/api/accounts")
async def list_all_accounts(admin_session: str = Cookie(default=None)):
    get_current_admin(admin_session)
    try:
        import httpx
        from backend.core.config import settings
        async with httpx.AsyncClient() as ac:
            token_res = await ac.post(
                f"{settings.keycloak_url}/realms/master/protocol/openid-connect/token",
                data={"grant_type": "password", "client_id": "admin-cli", "username": settings.keycloak_admin_username, "password": settings.keycloak_admin_password},
                timeout=30,
            )
            admin_token = token_res.json().get("access_token")
            keycloak_users = []
            if admin_token:
                users_res = await ac.get(
                    f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users?max=1000",
                    headers={"Authorization": f"Bearer {admin_token}"},
                    timeout=30,
                )
                keycloak_users = [
                    u for u in users_res.json()
                    if u.get("email")
                    and u.get("username") != "admin"
                    and (u.get("attributes") or {}).get("role", [None])[0] == "tenant_admin"
                ]
    except Exception as e:
        print(f"[WARN] Failed to fetch Keycloak users: {e}")
        keycloak_users = []

    import asyncio
    from backend.modules.accounts.service import get_active_modules_from_killbill_async

    async with httpx.AsyncClient() as kb_client:
        modules_list = await asyncio.gather(*[
            get_active_modules_from_killbill_async(
                kb_client, (u.get("attributes") or {}).get("tenant_id", [None])[0]
            )
            for u in keycloak_users
        ])

    accounts = []
    for u, modules in zip(keycloak_users, modules_list):
        attrs = u.get("attributes") or {}
        accounts.append({
            "email": u.get("email"),
            "tenant_id": attrs.get("tenant_id", [None])[0],
            "modules": modules,
            "status": attrs.get("status", [None])[0],
            "account_type": attrs.get("account_type", [None])[0],
            "created_at": None,
        })

    return {
        "total": len(accounts),
        "accounts": accounts,
    }


@router.get("/api/accounts/{email}", response_model=AccountResponse)
def get_account_by_email(email: str, admin_session: str = Cookie(default=None)):
    get_current_admin(admin_session)
    import httpx, json as _json
    from backend.core.config import settings
    try:
        token_res = httpx.post(
            f"{settings.keycloak_url}/realms/master/protocol/openid-connect/token",
            data={"grant_type": "password", "client_id": "admin-cli",
            "username": settings.keycloak_admin_username,
            "password": settings.keycloak_admin_password},
            timeout=10,
        )
        admin_token = token_res.json().get("access_token")
        users_res = httpx.get(
            f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users?email={email}&exact=true",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10,
        )
        users = users_res.json()
        if not users:
            raise HTTPException(status_code=404, detail=f"Account with email {email} not found")
        u = users[0]
        attrs = u.get("attributes") or {}
        tenant_id_lookup = attrs.get("tenant_id", [None])[0]
        modules = _get_active_modules_from_killbill(tenant_id_lookup)
        return AccountResponse(
            id=u["id"],
            email=u.get("email"),
            tenant_id=attrs.get("tenant_id", [None])[0],
            modules=modules,
            status=attrs.get("status", [None])[0],
            created_at=None,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch account: {str(e)}")

@router.delete("/api/accounts/{email}")
def delete_account_by_email(email: str, admin_session: str = Cookie(default=None)):
    get_current_admin(admin_session)
    try:
        result = service.delete_account(email, db=None)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete account: {str(e)}")
    return result


@router.patch("/api/accounts/{email}/upgrade")
def upgrade_account(email: str, body: dict, admin_session: str = Cookie(default=None)):
    get_current_admin(admin_session)
    try:
        result = service.upgrade_account(email, body.get("expires_at"))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upgrade account: {str(e)}")
    return result


@router.patch("/api/accounts/{email}/edit")
def edit_account(email: str, body: dict, admin_session: str = Cookie(default=None)):
    get_current_admin(admin_session)
    try:
        result = service.edit_account(email, body)
    except ValueError as e:
        msg = str(e)
        if msg in ("Nothing to update", "Account not found", "Account is not a registered tenant"):
            status_code = 400 if msg == "Nothing to update" else 404
        else:
            status_code = 400
        raise HTTPException(status_code=status_code, detail=msg)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update account: {str(e)}")
    return result

@router.get("/api/accounts/{email}/apikey")
def get_api_key(email: str, admin_session: str = Cookie(default=None)):
    get_current_admin(admin_session)
    import httpx, json as _json
    from backend.core.config import settings
    from sqlalchemy import text
    try:
        token_res = httpx.post(
            f"{settings.keycloak_url}/realms/master/protocol/openid-connect/token",
            data={"grant_type": "password", "client_id": "admin-cli",
                "username": settings.keycloak_admin_username,
                "password": settings.keycloak_admin_password},
            timeout=10,
        )
        admin_token = token_res.json().get("access_token")
        users_res = httpx.get(
            f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users?email={email}&exact=true",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10,
        )
        users = users_res.json()
        if not users:
            raise HTTPException(status_code=404, detail="No active API key found.")
        attrs = users[0].get("attributes") or {}
        tenant_id = attrs.get("tenant_id", [None])[0]
        account_type = attrs.get("account_type", [None])[0]
        modules_raw = attrs.get("modules", [None])[0]
        modules = _json.loads(modules_raw) if modules_raw else []
        with engine.connect() as conn:
            row = conn.execute(
                text("SELECT expires_at, status FROM auth.api_clients WHERE tenant_id = :tenant_id"),
                {"tenant_id": tenant_id},
            ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="No active API key found.")
        return {
            "expires_at": row.expires_at.isoformat() if row.expires_at else None,
            "status": row.status,
            "account_type": account_type,
            "modules": modules,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch API key: {str(e)}")



@router.get("/api/public/modules", response_model=ModulesResponse)
def get_default_modules_public():
    result = service.get_default_modules_public()
    return ModulesResponse(**result)