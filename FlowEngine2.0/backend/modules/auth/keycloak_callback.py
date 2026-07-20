# backend/modules/auth/keycloak_callback.py

import base64
import json
from datetime import datetime, timedelta

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse, JSONResponse

from sqlalchemy import text

from backend.core.config import settings
from backend.core.database import engine
from backend.modules.accounts import repository

router = APIRouter()


async def _exchange_code_for_token(client: httpx.AsyncClient, code: str, redirect_uri: str) -> dict:
    token_url = (
        f"{settings.keycloak_url}/realms/{settings.keycloak_realm}"
        f"/protocol/openid-connect/token"
    )
    response = await client.post(
        token_url,
        data={
            "grant_type": "authorization_code",
            "client_id": settings.keycloak_client_id,
            "client_secret": settings.keycloak_client_secret,
            "code": code,
            "redirect_uri": redirect_uri,
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=10,
    )
    response.raise_for_status()
    return response.json()


async def _get_user_info(client: httpx.AsyncClient, access_token: str) -> dict:
    userinfo_url = (
        f"{settings.keycloak_url}/realms/{settings.keycloak_realm}"
        f"/protocol/openid-connect/userinfo"
    )
    response = await client.get(
        userinfo_url,
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=10,
    )
    response.raise_for_status()
    return response.json()


def _decode_state(state: str) -> dict:
    try:
        decoded = base64.b64decode(state.encode()).decode()
        return json.loads(decoded)
    except Exception:
        return {}


def _tenant_url(path: str = "", query: str = "") -> str:
    base = settings.admin_hub_url.rstrip("/")
    suffix = path if path.startswith("/") or not path else f"/{path}"
    return f"{base}{suffix}{query}"

async def _check_tenant_id_exists_in_keycloak(client: httpx.AsyncClient, tenant_id: str, admin_token: str) -> bool:
    try:
        res = await client.get(
            f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users?q=tenant_id:{tenant_id}&max=1",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10,
        )
        users = res.json()
        for user in users:
            attrs = user.get("attributes") or {}
            existing = attrs.get("tenant_id", [])
            if existing and existing[0] == tenant_id:
                return True
        return False
    except Exception:
        return False

@router.get("/auth/keycloak/callback")
async def keycloak_callback(request: Request):
    code  = request.query_params.get("code")
    state = request.query_params.get("state")
    error = request.query_params.get("error")

    if error:
        if error == "login_required":
            return RedirectResponse(url=f"{settings.keycloak_external_url}/realms/{settings.keycloak_realm}/protocol/openid-connect/auth?client_id={settings.keycloak_client_id}&response_type=code&scope=openid email profile&redirect_uri={settings.keycloak_redirect_uri}")
        return RedirectResponse(url=_tenant_url("/"))

    if not code:
        return JSONResponse({"detail": "Missing authorization code"}, status_code=400)

    state_data = _decode_state(state) if state else {}
    module_id  = state_data.get("module_id")
    plan       = state_data.get("plan", "basic")

    redirect_uri = settings.keycloak_redirect_uri

    async with httpx.AsyncClient() as client:
      try:
        token_data   = await _exchange_code_for_token(client, code, redirect_uri)
        access_token = token_data.get("access_token")

        user_info = await _get_user_info(client, access_token)
        email     = user_info.get("email")

        if not email:
            return JSONResponse({"detail": "Could not retrieve email from Keycloak"}, status_code=400)

        verified_role = user_info.get("role")

        # Check admin status using verified subject + Keycloak admin role mappings
        try:
            _admin_check_token = (await client.post(
                f"{settings.keycloak_url}/realms/master/protocol/openid-connect/token",
                data={
                    "grant_type": "password",
                    "client_id": "admin-cli",
                    "username": settings.keycloak_admin_username,
                    "password": settings.keycloak_admin_password,
                },
                timeout=10,
            )).json().get("access_token")
            if _admin_check_token:
                subject = user_info.get("sub")
                roles_res = await client.get(
                    f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users/{subject}/role-mappings/realm",
                    headers={"Authorization": f"Bearer {_admin_check_token}"},
                    timeout=10,
                )
                if roles_res.status_code == 200:
                    role_names = {r.get("name") for r in roles_res.json()}
                    if "superadmin" in role_names or "admin" in role_names:
                        response = RedirectResponse(url=f"{settings.admin_ui_url}/")
                        response.set_cookie(key="admin_session", value=access_token, httponly=True, samesite="lax", domain=settings.cookie_domain)
                        return response
        except Exception:
            pass

        _sub_role = verified_role if verified_role in ("tenant_co_admin", "tenant_module_user") else None
        _sub_tenant_id = user_info.get("tenant_id")
        if _sub_role in ("tenant_co_admin", "tenant_module_user") and _sub_tenant_id:
            status = user_info.get("status", "active")
            if status != "active":
                return JSONResponse({"detail": "Your account is inactive. Contact your admin."}, status_code=403)
            response = RedirectResponse(url=_tenant_url("/app"))
            response.set_cookie(key="session", value=access_token, httponly=True, samesite="lax", domain=settings.cookie_domain)
            response.set_cookie(key="refresh_token", value=token_data.get("refresh_token", ""), httponly=True, samesite="lax", domain=settings.cookie_domain)
            return response

        # Check if tenant_admin — fetch attributes from Keycloak admin API
        admin_token = None
        try:
            token_res = await client.post(
                f"{settings.keycloak_url}/realms/master/protocol/openid-connect/token",
                data={"grant_type": "password", "client_id": "admin-cli",
                    "username": settings.keycloak_admin_username,
                    "password": settings.keycloak_admin_password},
                timeout=10,
            )
            admin_token = token_res.json().get("access_token")
        except Exception:
            pass

        existing_tenant_id = None
        email_verified = False
        tenant_status = "active"
        users = []
        if admin_token:
            try:
                user_res = await client.get(
                    f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users?email={email}&exact=true",
                    headers={"Authorization": f"Bearer {admin_token}"},
                    timeout=10,
                )
                users = user_res.json()
                if users:
                    attrs = users[0].get("attributes") or {}
                    existing_tenant_id = attrs.get("tenant_id", [None])[0]
                    email_verified = users[0].get("emailVerified", False)
                    tenant_status = attrs.get("status", ["active"])[0]
            except Exception:
                pass

        if not existing_tenant_id:
            keycloak_user_id_google = users[0]["id"] if users else None

            google_module_names = []
            if module_id:
                try:
                    from backend.modules.platforms_modules import service as _mod_service
                    all_mods, _ = _mod_service.get_all_modules(status_filter="active")
                    id_to_name = {m["id"]: m["name"] for m in all_mods}
                    if module_id in id_to_name:
                        google_module_names = [id_to_name[module_id]]
                except Exception:
                    pass

            try:
                from backend.modules.accounts.service import create_account
                await create_account(
                    email=email,
                    modules=google_module_names,
                    account_type="trial",
                    source="google",
                    keycloak_user_id=keycloak_user_id_google,
                )
            except Exception as e:
                print(f"[WARN] Failed to auto-provision Google account for {email}: {e}")
                return RedirectResponse(url=_tenant_url("/", "?error=registration_failed"))

            return RedirectResponse(url=f"{settings.keycloak_external_url}/realms/{settings.keycloak_realm}/protocol/openid-connect/auth?client_id={settings.keycloak_client_id}&response_type=code&scope=openid email profile&redirect_uri={settings.keycloak_redirect_uri}&kc_idp_hint=google&prompt=none")

        is_google_user = False
        if admin_token and users:
            federated = users[0].get("federatedIdentities") or []
            is_google_user = any(f.get("identityProvider") == "google" for f in federated)

        if not email_verified and not is_google_user:
            # Registered but not verified — resend verification email and redirect
            try:
                user_res2 = await client.get(
                    f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users?email={email}&exact=true",
                    headers={"Authorization": f"Bearer {admin_token}"},
                    timeout=10,
                )
                users2 = user_res2.json()
                if users2:
                    await client.put(
                        f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users/{users2[0]['id']}/send-verify-email",
                        headers={"Authorization": f"Bearer {admin_token}"},
                        timeout=10,
                    )
            except Exception:
                pass
            return RedirectResponse(url=_tenant_url("/", "?error=email_not_verified&resent=true"))

        if tenant_status != "active":
            try:
                await client.post(
                    f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users/{users[0]['id']}/logout",
                    headers={"Authorization": f"Bearer {admin_token}"},
                    timeout=10,
                )
            except Exception:
                pass
            return RedirectResponse(url=_tenant_url("/", "?error=account_inactive"))

        # Verified tenant — log in
        is_first_login = False
        try:
            with engine.begin() as conn:
                result = conn.execute(
                    text("""
                        UPDATE auth.tenant_milestones
                        SET achieved_at = NOW()
                        WHERE tenant_id = :tenant_id AND milestone_key = 'first_login' AND achieved_at IS NULL
                        RETURNING tenant_id
                    """),
                    {"tenant_id": existing_tenant_id},
                )
                is_first_login = result.fetchone() is not None
        except Exception as e:
            print(f"[WARN] Failed to check/set first_login milestone for {existing_tenant_id}: {e}")

        if module_id:
            module_name = None
            try:
                from backend.modules.platforms_modules import service as _mod_service
                all_mods, _ = _mod_service.get_all_modules(status_filter="active")
                id_to_name = {m["id"]: m["name"] for m in all_mods}
                module_name = id_to_name.get(module_id)
            except Exception:
                pass
            if module_name:
                import jwt as _jwt
                from datetime import datetime, timedelta
                billing_token = _jwt.encode(
                    {
                        "tenant_id": existing_tenant_id,
                        "email": email,
                        "exp": datetime.utcnow() + timedelta(minutes=5),
                        "iat": datetime.utcnow(),
                        "purpose": "billing_portal",
                    },
                    settings.jwt_secret,
                    algorithm=settings.jwt_algorithm,
                )
                product_id = module_name.lower().replace(" ", "_")
                redirect_url = _tenant_url(
                    "/app/checkout",
                    f"?module={module_name}&productId={product_id}&token={billing_token}",
                )
            else:
                redirect_url = _tenant_url("/app")
        else:
            redirect_url = _tenant_url("/app")
            if is_first_login:
                redirect_url += f"?first_login=true&tenant_id={existing_tenant_id}"

        response = RedirectResponse(url=redirect_url)
        response.set_cookie(key="session", value=access_token, httponly=True, samesite="lax", domain=settings.cookie_domain)
        response.set_cookie(key="refresh_token", value=token_data.get("refresh_token", ""), httponly=True, samesite="lax", domain=settings.cookie_domain)
        return response

      except httpx.HTTPError as e:
          print(f"[ERROR] Keycloak token exchange failed: {e}")
          return JSONResponse({"detail": "Keycloak authentication failed"}, status_code=500)
      except Exception as e:
          print(f"[ERROR] Keycloak callback error: {e}")
          return JSONResponse({"detail": "Internal server error"}, status_code=500)
