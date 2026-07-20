# backend/modules/accounts/service.py
from datetime import datetime, timedelta
from typing import List
import asyncio
import httpx
from backend.modules.auth.keycloak_callback import _check_tenant_id_exists_in_keycloak

from backend.modules.accounts import repository

# ── Internal: purge FlowEngine data for tenant ────────────────────────────────

def purge_flowengine_tenant_internal(tenant_id: str, db) -> None:
    try:
        from backend.modules.tenant_purge.service import TenantPurgeService
        from backend.modules.datasources.service import _delete_vault_secret
        service = TenantPurgeService(db)
        summary = service.purge(tenant_id)
        print(
            f"[INFO] Tenant purge succeeded for {tenant_id}. "
            f"{summary.total_deleted} records deleted. "
            f"Vault paths: {summary.vault_secret_paths or 'none'}"
        )
        for vault_path in (summary.vault_secret_paths or []):
            _delete_vault_secret(vault_path)
    except Exception as exc:
        print(f"[WARN] Tenant purge failed for {tenant_id}: {exc}")


        # ── Business Logic ────────────────────────────────────────────────────────────

def get_available_modules() -> dict:
    from backend.modules.platforms_modules import service
    modules, _ = service.get_all_modules(status_filter="active")
    return {
        "modules": [m["name"] for m in modules],
    }

def get_active_modules_from_killbill(tenant_id: str) -> list:
    import httpx
    from backend.core.config import settings
    from backend.modules.platforms_modules import service as mod_service

    if not tenant_id:
        return []

    try:
        kb_acct_res = httpx.get(
            f"{settings.killbill_gateway_url}/api/v1/accounts?externalKey={tenant_id}",
            headers={
                "X-Killbill-ApiKey": settings.killbill_api_key,
                "X-Killbill-ApiSecret": settings.killbill_api_secret,
            },
            timeout=10,
        )
        if kb_acct_res.status_code != 200:
            return []
        kb_account_id = kb_acct_res.json().get("accountId")
        if not kb_account_id:
            return []

        bundles_res = httpx.get(
            f"{settings.killbill_gateway_url}/api/v1/accounts/{kb_account_id}/bundles",
            headers={
                "X-Killbill-ApiKey": settings.killbill_api_key,
                "X-Killbill-ApiSecret": settings.killbill_api_secret,
            },
            timeout=10,
        )
        if bundles_res.status_code != 200:
            return []

        active_products = set()
        for bundle in bundles_res.json():
            for sub in bundle.get("subscriptions", []):
                if sub.get("state") == "ACTIVE":
                    product = (sub.get("productName") or "").replace(" ", "_").replace("-", "_").lower()
                    if product:
                        active_products.add(product)

        if not active_products:
            return []

        all_mods, _ = mod_service.get_all_modules(status_filter="active")
        result = []
        for m in all_mods:
            normalized = m["name"].replace(" ", "_").replace("-", "_").lower()
            if normalized in active_products:
                result.append(m["name"])
        return result
    except Exception as e:
        print(f"[WARN] Failed to fetch Kill Bill modules for tenant {tenant_id}: {e}")
        return []

async def get_active_modules_from_killbill_async(client: "httpx.AsyncClient", tenant_id: str) -> list:
    from backend.core.config import settings
    from backend.modules.platforms_modules import service as mod_service

    if not tenant_id:
        return []

    try:
        kb_acct_res = await client.get(
            f"{settings.killbill_gateway_url}/api/v1/accounts?externalKey={tenant_id}",
            headers={
                "X-Killbill-ApiKey": settings.killbill_api_key,
                "X-Killbill-ApiSecret": settings.killbill_api_secret,
            },
            timeout=10,
        )
        if kb_acct_res.status_code != 200:
            return []
        kb_account_id = kb_acct_res.json().get("accountId")
        if not kb_account_id:
            return []

        bundles_res = await client.get(
            f"{settings.killbill_gateway_url}/api/v1/accounts/{kb_account_id}/bundles",
            headers={
                "X-Killbill-ApiKey": settings.killbill_api_key,
                "X-Killbill-ApiSecret": settings.killbill_api_secret,
            },
            timeout=10,
        )
        if bundles_res.status_code != 200:
            return []

        active_products = set()
        for bundle in bundles_res.json():
            for sub in bundle.get("subscriptions", []):
                if sub.get("state") == "ACTIVE":
                    product = (sub.get("productName") or "").replace(" ", "_").replace("-", "_").lower()
                    if product:
                        active_products.add(product)

        if not active_products:
            return []

        all_mods, _ = mod_service.get_all_modules(status_filter="active")
        result = []
        for m in all_mods:
            normalized = m["name"].replace(" ", "_").replace("-", "_").lower()
            if normalized in active_products:
                result.append(m["name"])
        return result
    except Exception as e:
        print(f"[WARN] Failed to fetch Kill Bill modules for tenant {tenant_id}: {e}")
        return []

async def create_account(
    email: str,
    modules: List[str],
    account_type: str,
    expires_at_str: str = None,
    source: str = "admin",
    password: str = None,
    keycloak_user_id: str = None,
) -> dict:
    import json as _json
    from backend.core.config import settings

    client = httpx.AsyncClient()

    # Get admin token
    token_res = await client.post(
        f"{settings.keycloak_url}/realms/master/protocol/openid-connect/token",
        data={"grant_type": "password", "client_id": "admin-cli",
            "username": settings.keycloak_admin_username,
            "password": settings.keycloak_admin_password},
        timeout=10,
    )
    admin_token = token_res.json().get("access_token")
    if not admin_token:
        raise RuntimeError("Failed to get Keycloak admin token")

    # Check duplicate against Keycloak (skip for Google — user already exists via federated login)
    if source != "google":
        users_res = await client.get(
            f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users?email={email}&exact=true",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10,
        )
        if users_res.json():
            raise ValueError(f"Account with email {email} already exists")

    # Generate tenant_id
    tenant_id = repository.generate_tenant_id()
    while await _check_tenant_id_exists_in_keycloak(client, tenant_id, admin_token):
        tenant_id = repository.generate_tenant_id()

    # Resolve module names from module name list
    from backend.modules.platforms_modules import service as mod_service
    all_mods, _ = mod_service.get_all_modules(status_filter="active")
    name_to_id = {m["name"]: m["id"] for m in all_mods}
    module_ids = [name_to_id[n] for n in modules if n in name_to_id]
    module_names = [n for n in modules if n in name_to_id]

    if source == "google":
        # User already exists in Keycloak (auto-created by federated Google login).
        # Just attach tenant attributes to the existing user.
        if not keycloak_user_id:
            raise ValueError("keycloak_user_id is required when source='google'")
        user_fetch = await client.get(
            f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users/{keycloak_user_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10,
        )
        user_data = user_fetch.json()
        user_data["attributes"] = {
            "tenant_id": [tenant_id],
            "role": ["tenant_admin"],
            "modules": [_json.dumps(module_names)],
            "status": ["active"],
            "account_type": [account_type],
        }
        update_res = httpx.put(
            f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users/{keycloak_user_id}",
            json=user_data,
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10,
        )
        update_res.raise_for_status()
    else:
        # Create user in Keycloak with permanent attributes
        if source == "self":
            keycloak_user_payload = {
                "email": email,
                "username": email,
                "enabled": True,
                "emailVerified": False,
                "requiredActions": ["VERIFY_EMAIL"],
                "credentials": [{"type": "password", "value": password, "temporary": False}],
                "attributes": {
                    "tenant_id": [tenant_id],
                    "role": ["tenant_admin"],
                    "modules": [_json.dumps(module_names)],
                    "status": ["active"],
                    "account_type": [account_type],
                },
            }
        else:
            keycloak_user_payload = {
                "email": email,
                "username": email,
                "enabled": True,
                "emailVerified": False,
                "requiredActions": ["UPDATE_PASSWORD"],
                "attributes": {
                    "tenant_id": [tenant_id],
                    "role": ["tenant_admin"],
                    "modules": [_json.dumps(module_names)],
                    "status": ["active"],
                    "account_type": [account_type],
                },
            }
        res = await client.post(
            f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users",
            json=keycloak_user_payload,
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10,
        )
        if res.status_code == 409:
            raise ValueError(f"Account with email {email} already exists")
        res.raise_for_status()

        # Get Keycloak user ID
        users_res2 = await client.get(
            f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users?email={email}&exact=true",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10,
        )
        keycloak_user_id = users_res2.json()[0]["id"]

    async def _assign_tenant_admin_role():
        try:
            role_res = await client.get(
                f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/roles/tenant_admin",
                headers={"Authorization": f"Bearer {admin_token}"},
                timeout=15,
            )
            if role_res.status_code == 200:
                role_data = role_res.json()
                await client.post(
                    f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users/{keycloak_user_id}/role-mappings/realm",
                    json=[{"id": role_data["id"], "name": role_data["name"]}],
                    headers={"Authorization": f"Bearer {admin_token}"},
                    timeout=15,
                )
        except Exception as e:
            print(f"[WARN] Failed to assign tenant_admin realm role: {e}")

    async def _create_kb_account():
        return await client.post(
            f"{settings.killbill_gateway_url}/api/v1/accounts",
            json={"email": email, "externalKey": tenant_id},
            headers={
                "X-Killbill-ApiKey": settings.killbill_api_key,
                "X-Killbill-ApiSecret": settings.killbill_api_secret,
                "X-Killbill-CreatedBy": "flowengine",
                "Content-Type": "application/json",
            },
            timeout=15,
        )

    kb_account_res = None
    try:
        _, kb_account_res = await asyncio.gather(
            _assign_tenant_admin_role(),
            _create_kb_account(),
        )
        if kb_account_res.status_code not in (200, 201):
            raise RuntimeError(f"Kill Bill account creation failed: {kb_account_res.status_code} {kb_account_res.text}")
        print(f"[INFO] Kill Bill account created for tenant {tenant_id}")
        # Create free trial subscriptions for all selected modules
        if module_names:
            try:
                kb_plans_res = await client.get(
                    f"{settings.killbill_gateway_url}/api/plans/modules",
                    timeout=10,
                )
                if kb_plans_res.status_code == 200:
                    all_plans = kb_plans_res.json()
                    kb_acct_res = await client.get(
                        f"{settings.killbill_gateway_url}/api/v1/accounts?externalKey={tenant_id}",
                        headers={
                            "X-Killbill-ApiKey": settings.killbill_api_key,
                            "X-Killbill-ApiSecret": settings.killbill_api_secret,
                        },
                        timeout=10,
                    )
                    if kb_acct_res.status_code == 200:
                        kb_account_id = kb_acct_res.json().get("accountId")
                        if kb_account_id:
                            async def _create_sub(mod_name):
                                basic_plan = next((p for p in all_plans.get(mod_name, []) if p["price"] == 0), None)
                                if not basic_plan:
                                    return
                                await client.post(
                                    f"{settings.killbill_gateway_url}/api/v1/subscriptions",
                                    json={"accountId": kb_account_id, "planName": basic_plan["id"]},
                                    headers={
                                        "X-Killbill-ApiKey": settings.killbill_api_key,
                                        "X-Killbill-ApiSecret": settings.killbill_api_secret,
                                        "X-Killbill-CreatedBy": "flowengine",
                                        "Content-Type": "application/json",
                                    },
                                    timeout=15,
                                )
                                print(f"[INFO] Kill Bill subscription created for tenant {tenant_id} module {mod_name}")

                            await asyncio.gather(*[_create_sub(m) for m in module_names if m in all_plans])
            except Exception as sub_err:
                # Rollback — delete Keycloak user
                await client.delete(
                    f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users/{keycloak_user_id}",
                    headers={"Authorization": f"Bearer {admin_token}"},
                    timeout=10,
                )
                raise RuntimeError(f"Kill Bill subscription creation failed — FlowEngine tenant rolled back: {sub_err}")
    except Exception as e:
        # Rollback — delete Keycloak user
        await client.delete(
            f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users/{keycloak_user_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10,
        )
        raise RuntimeError(f"Kill Bill account creation failed — FlowEngine tenant rolled back: {e}")

    # Send email — best effort. Account is already fully created at this point;
    # a slow/failed email must never delete a working tenant.
    if source != "google":
        email_action = "VERIFY_EMAIL" if source == "self" else "UPDATE_PASSWORD"
        try:
            email_res = await client.put(
                f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users/{keycloak_user_id}/execute-actions-email",
                json=[email_action],
                headers={"Authorization": f"Bearer {admin_token}"},
                timeout=20,
            )
            if email_res.status_code != 204:
                print(f"[WARN] Email send returned {email_res.status_code} for {email}: {email_res.text}")
        except Exception as e:
            print(f"[WARN] Email send timed out/failed for {email} (account NOT rolled back): {e}")

    # Track first-login milestone for this new tenant
    try:
        from backend.core.database import engine
        from sqlalchemy import text
        with engine.begin() as conn:
            conn.execute(
                text("""
                    INSERT INTO auth.tenant_milestones (tenant_id, milestone_key, achieved_at)
                    VALUES (:tenant_id, 'first_login', NULL)
                    ON CONFLICT (tenant_id, milestone_key) DO NOTHING
                """),
                {"tenant_id": tenant_id},
            )
    except Exception as e:
        print(f"[WARN] Failed to insert first_login milestone for {tenant_id}: {e}")

    # Auto-generate API key for the new tenant
    try:
        from backend.modules.api_keys.repository import create_api_key
        create_api_key(tenant_id=tenant_id)
        print(f"[INFO] API key auto-generated for tenant {tenant_id}")
    except Exception as e:
        print(f"[WARN] Failed to auto-generate API key for tenant {tenant_id}: {e}")

    await client.aclose()

    return {
        "email": email,
        "tenant_id": tenant_id,
        "message": (
            "Account created. Please check your email to verify your account." if source == "self"
            else "Account created via Google." if source == "google"
            else "Account created. Password setup email has been sent."
        ),    
        }


def delete_account(email: str, db) -> dict:
    import httpx
    from backend.core.config import settings

    # Step 1 — find user in Keycloak and get tenant_id
    token_res = httpx.post(
        f"{settings.keycloak_url}/realms/master/protocol/openid-connect/token",
        data={"grant_type": "password", "client_id": "admin-cli",
            "username": settings.keycloak_admin_username,
            "password": settings.keycloak_admin_password},
        timeout=10,
    )
    admin_token = token_res.json().get("access_token")
    if not admin_token:
        raise RuntimeError("Failed to get Keycloak admin token")

    users_res = httpx.get(
        f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users?email={email}&exact=true",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=10,
    )
    users = users_res.json()
    if not users:
        raise ValueError(f"Account with email {email} not found")

    attrs = users[0].get("attributes") or {}
    tenant_id = attrs.get("tenant_id", [None])[0]
    if not tenant_id:
        raise ValueError(f"Account {email} is not a registered tenant")

    # Step 2 — get all sub-user emails under this tenant from Keycloak
    import httpx as _httpx2
    sub_emails = []
    try:
        all_users_res = _httpx2.get(
            f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users?max=1000",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10,
        )
        for u in all_users_res.json():
            u_attrs = u.get("attributes") or {}
            if (u_attrs.get("tenant_id", [None])[0] == tenant_id and
                u_attrs.get("role", [None])[0] in ("tenant_co_admin", "tenant_module_user")):
                sub_emails.append(u.get("email"))
    except Exception:
        pass
    all_emails = [email] + sub_emails

    # Step 3 — delete ALL users from Keycloak first
    try:
        import httpx
        from backend.core.config import settings

        token_res = httpx.post(
            f"{settings.keycloak_url}/realms/master/protocol/openid-connect/token",
            data={
                "grant_type": "password",
                "client_id": "admin-cli",
                "username": settings.keycloak_admin_username,
                "password": settings.keycloak_admin_password,
            },
            timeout=10,
        )
        admin_token = token_res.json().get("access_token")

        if not admin_token:
            raise RuntimeError("Failed to get Keycloak admin token")

        for user_email in all_emails:
            users_res = httpx.get(
                f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users?email={user_email}&exact=true",
                headers={"Authorization": f"Bearer {admin_token}"},
                timeout=10,
            )
            users = users_res.json()
            if users:
                keycloak_user_id = users[0]["id"]
                httpx.delete(
                    f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users/{keycloak_user_id}",
                    headers={"Authorization": f"Bearer {admin_token}"},
                    timeout=10,
                )
                print(f"[INFO] Deleted {user_email} from Keycloak")

    except Exception as e:
        raise RuntimeError(f"Keycloak deletion failed — aborting: {e}")

    # Step 4 — delete all auth.* data for this tenant
    from backend.core.database import engine
    from sqlalchemy import text
    with engine.begin() as conn:
        conn.execute(text("DELETE FROM auth.api_clients WHERE tenant_id = :tenant_id"), {"tenant_id": tenant_id})

    purge_flowengine_tenant_internal(tenant_id, db)

    # Step 5 — cancel all Kill Bill subscriptions and close account
    try:
        kb_acct_res = httpx.get(
            f"{settings.killbill_gateway_url}/api/v1/accounts?externalKey={tenant_id}",
            headers={
                "X-Killbill-ApiKey": settings.killbill_api_key,
                "X-Killbill-ApiSecret": settings.killbill_api_secret,
            },
            timeout=30,
        )
        if kb_acct_res.status_code == 200:
            kb_account_id = kb_acct_res.json().get("accountId")
            if kb_account_id:
                # Cancel all subscriptions
                bundles_res = httpx.get(
                    f"{settings.killbill_gateway_url}/api/v1/accounts/{kb_account_id}/bundles",
                    headers={
                        "X-Killbill-ApiKey": settings.killbill_api_key,
                        "X-Killbill-ApiSecret": settings.killbill_api_secret,
                    },
                    timeout=30,
                )
                if bundles_res.status_code == 200:
                    for bundle in bundles_res.json():
                        for subscription in bundle.get("subscriptions", []):
                            sub_id = subscription.get("subscriptionId")
                            if sub_id:
                                httpx.delete(
                                    f"{settings.killbill_gateway_url}/api/v1/subscriptions/{sub_id}",
                                    headers={
                                        "X-Killbill-ApiKey": settings.killbill_api_key,
                                        "X-Killbill-ApiSecret": settings.killbill_api_secret,
                                        "X-Killbill-CreatedBy": "flowengine",
                                    },
                                    timeout=30,
                                )
                                print(f"[INFO] Kill Bill subscription {sub_id} cancelled for tenant {tenant_id}")
                print(f"[INFO] Kill Bill subscriptions cancelled for tenant {tenant_id}")
    except Exception as kb_err:
        print(f"[WARN] Kill Bill cleanup failed for tenant {tenant_id}: {kb_err}")

    return {
        "message": f"Account {email} deleted successfully",
        "email": email,
        "tenant_id": tenant_id,
    }




def upgrade_account(email: str, expires_at_str: str = None) -> dict:
    import httpx
    from backend.core.config import settings

    #print(f"[DEBUG] upgrade_account called for {email}")

    # Get admin token
    token_res = httpx.post(
        f"{settings.keycloak_url}/realms/master/protocol/openid-connect/token",
        data={"grant_type": "password", "client_id": "admin-cli",
        "username": settings.keycloak_admin_username,
        "password": settings.keycloak_admin_password},
        timeout=10,
    )
    admin_token = token_res.json().get("access_token")
    if not admin_token:
        raise ValueError("Failed to get Keycloak admin token")

    # Find user in Keycloak
    users_res = httpx.get(
        f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users?email={email}&exact=true",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=10,
    )
    users = users_res.json()
    if not users:
        raise ValueError(f"Account {email} not found in Keycloak")

    keycloak_user_id = users[0]["id"]
    user_data = users[0]
    attrs = user_data.get("attributes") or {}

    if not attrs.get("tenant_id"):
        raise ValueError(f"Account {email} is not a registered tenant")

    #print(f"[DEBUG] Found Keycloak user {keycloak_user_id} for {email}, updating account_type to production")

    # Update account_type in Keycloak
    attrs["account_type"] = ["production"]
    #print(f"[DEBUG] attrs before PUT: {attrs}")
    update_res = httpx.put(
        f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users/{keycloak_user_id}",
        json={
            "email": email,
            "username": email,
            "attributes": attrs,
        },
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=10,
    )
    if update_res.status_code not in (200, 204):
        raise ValueError(f"Failed to update Keycloak attributes: {update_res.text}")

    #print(f"[DEBUG] Successfully upgraded {email} to production in Keycloak")

    # Also update api_clients expiry for API key enforcement
    try:
        from backend.core.database import engine
        from sqlalchemy import text
        expires_at = (
            datetime.fromisoformat(expires_at_str)
            if expires_at_str
            else datetime.utcnow() + timedelta(days=365)
        )
        tenant_id = attrs.get("tenant_id", [None])[0]
        with engine.begin() as conn:
            conn.execute(
                text("""
                    UPDATE auth.api_clients
                    SET expires_at = :expires_at, status = 'active'
                    WHERE tenant_id = :tenant_id
                """),
                {"expires_at": expires_at, "tenant_id": tenant_id},
            )
        #print(f"[DEBUG] Updated api_clients expiry for tenant {tenant_id}")
    except Exception as e:
        print(f"[WARN] Failed to update api_clients expiry: {e}")

    return {"message": f"Account {email} upgraded to production"}


def edit_account(email: str, body: dict) -> dict:
    import httpx
    import json as _json
    from backend.core.config import settings

    # Get admin token
    token_res = httpx.post(
        f"{settings.keycloak_url}/realms/master/protocol/openid-connect/token",
        data={"grant_type": "password", "client_id": "admin-cli",
            "username": settings.keycloak_admin_username,
            "password": settings.keycloak_admin_password},
        timeout=10,
    )
    admin_token = token_res.json().get("access_token")
    if not admin_token:
        raise ValueError("Failed to get Keycloak admin token")

    # Find user in Keycloak
    users_res = httpx.get(
        f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users?email={email}&exact=true",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=10,
    )
    users = users_res.json()
    if not users:
        raise ValueError("Account not found")

    keycloak_user_id = users[0]["id"]
    attrs = users[0].get("attributes") or {}

    if not attrs.get("tenant_id"):
        raise ValueError("Account is not a registered tenant")

    tenant_id = attrs.get("tenant_id", [None])[0]

    # Update Keycloak attributes
    if "status" in body:
        attrs["status"] = [body["status"]]
    if "account_type" in body:
        attrs["account_type"] = [body["account_type"]]
    old_module_names = []
    modules_changed = False
    if "modules" in body:
        # Get OLD modules from Kill Bill (actual subscriptions), not from dead Keycloak attribute
        old_module_names = get_active_modules_from_killbill(tenant_id)
        
        # body["modules"] is list of module_ids — resolve to names
        from backend.modules.platforms_modules import service as mod_service
        all_mods, _ = mod_service.get_all_modules(status_filter="active")
        id_to_name = {m["id"]: m["name"] for m in all_mods}
        module_names = [id_to_name[mid] for mid in body["modules"] if mid in id_to_name]
        modules_changed = True

    update_payload = {
        "email": body.get("new_email", email),
        "username": body.get("new_email", email),
        "attributes": attrs,
    }
    update_res = httpx.put(
        f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users/{keycloak_user_id}",
        json=update_payload,
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=10,
    )
    if update_res.status_code not in (200, 204):
        raise ValueError(f"Failed to update Keycloak: {update_res.text}")

    # ── Sync Kill Bill subscriptions to match the new module list ──────────
    if modules_changed:
        added = [m for m in module_names if m not in old_module_names]
        removed = [m for m in old_module_names if m not in module_names]

        if added or removed:
            try:
                kb_acct_res = httpx.get(
                    f"{settings.killbill_gateway_url}/api/v1/accounts?externalKey={tenant_id}",
                    headers={
                        "X-Killbill-ApiKey": settings.killbill_api_key,
                        "X-Killbill-ApiSecret": settings.killbill_api_secret,
                    },
                    timeout=10,
                )
                if kb_acct_res.status_code != 200:
                    raise RuntimeError(f"Could not resolve Kill Bill account for tenant {tenant_id}")
                kb_account_id = kb_acct_res.json().get("accountId")
                if not kb_account_id:
                    raise RuntimeError(f"No Kill Bill account found for tenant {tenant_id}")

                # Cancel subscriptions for removed modules
                if removed:
                    bundles_res = httpx.get(
                        f"{settings.killbill_gateway_url}/api/v1/accounts/{kb_account_id}/bundles",
                        headers={
                            "X-Killbill-ApiKey": settings.killbill_api_key,
                            "X-Killbill-ApiSecret": settings.killbill_api_secret,
                        },
                        timeout=10,
                    )
                    if bundles_res.status_code == 200:
                        for bundle in bundles_res.json():
                            for sub in bundle.get("subscriptions", []):
                                product = (sub.get("productName") or "").replace(" ", "_").replace("-", "_").lower()
                                removed_norm = [r.replace(" ", "_").lower() for r in removed]
                                if sub.get("state") == "ACTIVE" and product in removed_norm:
                                    sub_id = sub.get("subscriptionId")
                                    if sub_id:
                                        httpx.delete(
                                            f"{settings.killbill_gateway_url}/api/v1/subscriptions/{sub_id}",
                                            headers={
                                                "X-Killbill-ApiKey": settings.killbill_api_key,
                                                "X-Killbill-ApiSecret": settings.killbill_api_secret,
                                                "X-Killbill-CreatedBy": "flowengine",
                                            },
                                            timeout=10,
                                        )
                                        print(f"[INFO] Kill Bill subscription {sub_id} cancelled for tenant {tenant_id} (module removed: {product})")

                # Create subscriptions for added modules
                no_free_plan_modules = []
                failed_modules = []  # NEW — modules whose subscription call failed (e.g. trial already used)
                if added:
                    kb_plans_res = httpx.get(
                        f"{settings.killbill_gateway_url}/api/plans/modules",
                        timeout=10,
                    )
                    if kb_plans_res.status_code == 200:
                        all_plans = kb_plans_res.json()
                        for mod_name in added:
                            if mod_name in all_plans:
                                basic_plan = next((p for p in all_plans[mod_name] if p["price"] == 0), None)
                                if basic_plan:
                                    sub_res = httpx.post(  # CHANGED — capture the response
                                        f"{settings.killbill_gateway_url}/api/v1/subscriptions",
                                        json={
                                            "accountId": kb_account_id,
                                            "planName": basic_plan["id"],
                                        },
                                        headers={
                                            "X-Killbill-ApiKey": settings.killbill_api_key,
                                            "X-Killbill-ApiSecret": settings.killbill_api_secret,
                                            "X-Killbill-CreatedBy": "flowengine",
                                            "Content-Type": "application/json",
                                        },
                                        timeout=10,
                                    )
                                    if sub_res.status_code in (200, 201):  # NEW — check status
                                        print(f"[INFO] Kill Bill subscription created for tenant {tenant_id} (module added: {mod_name})")
                                    else:
                                        detail = sub_res.text
                                        print(f"[WARN] Kill Bill subscription FAILED for tenant {tenant_id} module {mod_name}: {sub_res.status_code} {detail}")
                                        failed_modules.append(f"{mod_name} ({detail})")
                                else:
                                    no_free_plan_modules.append(mod_name)
                            else:
                                no_free_plan_modules.append(mod_name)

                if no_free_plan_modules:
                    raise ValueError(
                        f"These modules have no free plan and require the tenant to subscribe via checkout: {', '.join(no_free_plan_modules)}"
                    )
                if failed_modules:  # NEW
                    raise ValueError(
                        f"Failed to (re)activate the following modules: {', '.join(failed_modules)}"
                    )
            except ValueError:
                raise
            except Exception as kb_err:
                print(f"[WARN] Kill Bill sync failed during edit for tenant {tenant_id}: {kb_err}")
                raise ValueError(f"Keycloak updated but Kill Bill sync failed: {kb_err}")

    # ── Cascade: disabling the tenant_admin also disables all sub-users ────
    if "status" in body and body["status"] == "inactive":
        try:
            httpx.post(
                f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users/{keycloak_user_id}/logout",
                headers={"Authorization": f"Bearer {admin_token}"},
                timeout=10,
            )
        except Exception:
            pass
        try:
            all_kc_users_res = httpx.get(
                f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users?max=1000",
                headers={"Authorization": f"Bearer {admin_token}"},
                timeout=10,
            )
            all_kc_users_res.raise_for_status()
            for u in all_kc_users_res.json():
                u_attrs = u.get("attributes") or {}
                if u_attrs.get("tenant_id", [None])[0] != tenant_id:
                    continue
                if u_attrs.get("role", [None])[0] not in ("tenant_co_admin", "tenant_module_user"):
                    continue
                u_attrs["status"] = ["inactive"]
                u["attributes"] = u_attrs
                httpx.put(
                    f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users/{u['id']}",
                    json=u,
                    headers={"Authorization": f"Bearer {admin_token}"},
                    timeout=10,
                )
                try:
                    httpx.post(
                        f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users/{u['id']}/logout",
                        headers={"Authorization": f"Bearer {admin_token}"},
                        timeout=10,
                    )
                except Exception:
                    pass
                print(f"[INFO] Cascaded disable to sub-user {u.get('email')} for tenant {tenant_id}")
        except Exception as e:
            print(f"[WARN] Failed to cascade-disable sub-users for tenant {tenant_id}: {e}")

    return {"message": f"Account {email} updated successfully"}





def get_default_modules_public() -> dict:
    from backend.modules.platforms_modules import service
    modules, _ = service.get_default_modules()
    return {
        "modules": [
            {
                "id": m["id"],
                "name": m["name"],
                "description": m["description"] or "",
            }
            for m in modules
        ],
    }