# backend/modules/platforms_modules/routes.py

from fastapi import APIRouter, HTTPException, status, Cookie, Request
from typing import List, Optional
from sqlalchemy import text
from backend.modules.platforms_modules.schemas import (
    ModuleCreate, ModuleUpdate, ModuleOut, ModuleListResponse,
    TenantModuleAssignRequest, TenantModuleOut, DefaultModulesResponse
)
from backend.modules.platforms_modules import service
from backend.common.responses import SuccessResponse
from backend.modules.admins.service import verify_admin_token
from backend.modules.auth.jwt_service import verify_tenant_token
import httpx
from backend.core.config import settings
router = APIRouter(prefix="/admin/modules", tags=["Admin - Modules Management"])
portal_router = APIRouter(prefix="/portal", tags=["Portal - Tenant Modules"])


# ── Helper: require admin session ────────────────────────────────────────────

def get_current_admin(admin_session: str = Cookie(default=None)) -> dict:
    if not admin_session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        return verify_admin_token(admin_session)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))


    # ── MODULE MANAGEMENT ENDPOINTS ──────────────────────────────────────────────

@router.get("", response_model=ModuleListResponse)
def list_modules(
    status_filter: Optional[str] = None,
    admin_session: str = Cookie(default=None)
):
    admin = get_current_admin(admin_session)
    modules, count = service.get_all_modules(status_filter=status_filter)
    return ModuleListResponse(
        modules=[ModuleOut(**m) for m in modules],
        count=count
    )


@router.get("/default", response_model=DefaultModulesResponse)
def get_default_modules(
    admin_session: str = Cookie(default=None)
):
    admin = get_current_admin(admin_session)
    modules, count = service.get_default_modules()
    return DefaultModulesResponse(
        modules=[ModuleOut(**m) for m in modules],
        count=count
    )


@router.get("/public/list", response_model=ModuleListResponse)
def list_active_modules_public(
    status_filter: str = "active"
):
    """List all active modules — public endpoint, no auth required."""
    modules, count = service.get_all_modules(status_filter=status_filter)
    return ModuleListResponse(
        modules=[ModuleOut(**m) for m in modules],
        count=count
    )


@router.get("/public/list-all", response_model=ModuleListResponse)
def list_all_modules_public():
    """List modules of every status — used by the admin-side plan creation form."""
    modules, count = service.get_all_modules(status_filter=None)
    return ModuleListResponse(
        modules=[ModuleOut(**m) for m in modules],
        count=count
    )


@router.get("/{module_id}", response_model=ModuleOut)
def get_module(
    module_id: str,
    admin_session: str = Cookie(default=None)
):
    admin = get_current_admin(admin_session)
    module = service.get_module_by_id(module_id)
    return ModuleOut(**module)


@router.post("", response_model=ModuleOut, status_code=status.HTTP_201_CREATED)
def create_module(
    body: ModuleCreate,
    admin_session: str = Cookie(default=None)
):
    admin = get_current_admin(admin_session)
    module = service.create_module(
        payload=body.dict(),
        created_by_admin_id=admin.get("sub")
    )
    try:
        kb_res = httpx.post(
            f"{settings.killbill_gateway_url}/api/products/sync",
            json={
                "name": module["name"],
                "free_plan": module["free_plan"],
                "trial_weeks": module["trial_weeks"],
                "api_calls_allowed": module["api_calls_allowed"],
            },
            timeout=30
        )
        if kb_res.status_code != 200:
            service.delete_module(module["id"])
            raise HTTPException(status_code=502, detail=f"Kill Bill sync failed: {kb_res.text}")
    except httpx.RequestError as e:
        service.delete_module(module["id"])
        raise HTTPException(status_code=502, detail=f"Kill Bill gateway unreachable: {str(e)}")

    # ── If active but no plan exists yet (no free plan, no paid plan), force inactive ──
    if module["status"] == "active" and not module["free_plan"]:
        has_plan = False
        try:
            plans_res = httpx.get(f"{settings.killbill_gateway_url}/api/plans/modules", timeout=10)
            if plans_res.status_code == 200:
                has_plan = bool(plans_res.json().get(module["name"]))
        except httpx.RequestError:
            has_plan = False
        if not has_plan:
            module = service.update_module(module_id=module["id"], payload={"status": "inactive"})

    return ModuleOut(**module)


@router.patch("/{module_id}", response_model=ModuleOut)
def update_module(
    module_id: str,
    body: ModuleUpdate,
    admin_session: str = Cookie(default=None)
):
    admin = get_current_admin(admin_session)
    old_module = service.get_module_by_id(module_id)
    module = service.update_module(
        module_id=module_id,
        payload=body.dict(exclude_unset=True)
    )
    kb_fields_changed = (
        old_module["free_plan"] != module.get("free_plan", old_module["free_plan"]) or
        old_module["trial_weeks"] != module.get("trial_weeks", old_module["trial_weeks"]) or
        old_module["api_calls_allowed"] != module.get("api_calls_allowed", old_module["api_calls_allowed"]) or
        old_module["name"] != module["name"]
    )

    if kb_fields_changed:
        try:
            kb_res = httpx.post(
                f"{settings.killbill_gateway_url}/api/products/update",
                json={
                    "old_name": old_module["name"],
                    "name": module["name"],
                    "free_plan": module["free_plan"],
                    "trial_weeks": module["trial_weeks"],
                    "api_calls_allowed": module["api_calls_allowed"],
                },
                timeout=30
            )
            if kb_res.status_code != 200:
                service.update_module(module_id=module_id, payload={
                    "name": old_module["name"],
                    "free_plan": old_module["free_plan"],
                    "trial_weeks": old_module["trial_weeks"],
                    "api_calls_allowed": old_module["api_calls_allowed"],
                })
                raise HTTPException(status_code=502, detail=f"Kill Bill sync failed: {kb_res.text}")
        except httpx.RequestError as e:
            service.update_module(module_id=module_id, payload={
                "name": old_module["name"],
                "free_plan": old_module["free_plan"],
                "trial_weeks": old_module["trial_weeks"],
                "api_calls_allowed": old_module["api_calls_allowed"],
            })
            raise HTTPException(status_code=502, detail=f"Kill Bill gateway unreachable: {str(e)}")
    # ── Reject activation if no plan exists yet (no free plan, no paid plan) ──
    if module["status"] == "active" and old_module["status"] != "active" and not module["free_plan"]:
        has_plan = False
        try:
            plans_res = httpx.get(f"{settings.killbill_gateway_url}/api/plans/modules", timeout=10)
            if plans_res.status_code == 200:
                has_plan = bool(plans_res.json().get(module["name"]))
        except httpx.RequestError:
            has_plan = False
        if not has_plan:
            service.update_module(module_id=module_id, payload={"status": old_module["status"]})
            raise HTTPException(
                status_code=400,
                detail="Cannot activate this module — no plan exists in Kill Bill. Add a plan or enable free_plan first."
            )

    return ModuleOut(**module)


@router.delete("/{module_id}", response_model=SuccessResponse)
def delete_module(
    module_id: str,
    admin_session: str = Cookie(default=None)
):
    admin = get_current_admin(admin_session)
    module = service.get_module_by_id(module_id)
    try:
        kb_res = httpx.delete(
            f"{settings.killbill_gateway_url}/api/products/{module['name']}",
            timeout=10
        )
        if kb_res.status_code == 409:
            raise HTTPException(status_code=409, detail=kb_res.json().get("error", "Module has active subscribers"))
        if kb_res.status_code != 200:
            raise HTTPException(status_code=502, detail=f"Kill Bill sync failed: {kb_res.text}")
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Kill Bill gateway unreachable: {str(e)}")
    service.delete_module(module_id)
    return SuccessResponse(message=f"Module {module_id} deleted successfully")


# ── TENANT-MODULE ASSIGNMENT ENDPOINTS ───────────────────────────────────────

@router.get("/tenant/{tenant_id}", response_model=List[TenantModuleOut])
def get_tenant_modules(
    tenant_id: str,
    status_filter: Optional[str] = None,
    admin_session: str = Cookie(default=None)
):
    admin = get_current_admin(admin_session)
    assignments, _ = service.get_tenant_modules(tenant_id, status_filter=status_filter)
    return [TenantModuleOut(**a) for a in assignments]


@router.post("/tenant/{tenant_id}/assign", response_model=List[TenantModuleOut])
def assign_modules_to_tenant(
    tenant_id: str,
    body: TenantModuleAssignRequest,
    admin_session: str = Cookie(default=None)
):
    admin = get_current_admin(admin_session)
    service.assign_modules_to_tenant(
        tenant_id=tenant_id,
        module_ids=body.module_ids,
        admin_id=admin.get("sub")
    )
    all_assignments, _ = service.get_tenant_modules(tenant_id)
    return [TenantModuleOut(**a) for a in all_assignments]


@router.delete("/tenant/{tenant_id}/module/{module_id}", response_model=SuccessResponse)
def remove_module_from_tenant(
    tenant_id: str,
    module_id: str,
    admin_session: str = Cookie(default=None)
):
    admin = get_current_admin(admin_session)
    service.remove_module_from_tenant(tenant_id, module_id)
    return SuccessResponse(message=f"Module {module_id} removed from tenant {tenant_id}")


# ── PORTAL ENDPOINT ──────────────────────────────────────────────────────────


@portal_router.get("/my-modules")
def get_my_modules(request: Request):
    session = request.cookies.get("session")
    if not session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    tenant_id = None
    role = "tenant_admin"
    modules_from_keycloak = []

    try:
        import httpx as _httpx
        from backend.core.config import settings as _settings
        userinfo_res = _httpx.get(
            f"{_settings.keycloak_url}/realms/{_settings.keycloak_realm}/protocol/openid-connect/userinfo",
            headers={"Authorization": f"Bearer {session}"},
            timeout=5,
        )
        if userinfo_res.status_code == 200:
            _data = userinfo_res.json()
            tenant_id = _data.get("tenant_id")
            role = _data.get("role", "tenant_admin")
            _modules_raw = _data.get("modules", [])
            if isinstance(_modules_raw, str):
                import json as _json
                try:
                    modules_from_keycloak = _json.loads(_modules_raw)
                except Exception:
                    modules_from_keycloak = []
            else:
                modules_from_keycloak = _modules_raw if _modules_raw else []
    except Exception:
        pass

    if not tenant_id:
        try:
            payload = verify_tenant_token(session)
            tenant_id = payload["tenant_id"]
            role = payload.get("role", "tenant_module_user")
        except ValueError:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session")

    # Get all active modules from DB (master list with full metadata)
    all_modules, _ = service.get_all_modules(status_filter="active")

    # Get active subscriptions from Kill Bill — this is the source of truth
    active_module_names = []
    try:
        kb_acct_res = httpx.get(
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
                            if sub.get("state") == "ACTIVE":
                                raw = sub.get("productName") or ""
                                active_module_names.append(raw.replace(" ", "_").lower())
    except Exception:
        pass

    # tenant_admin or tenant_co_admin — Kill Bill is source of truth
    if role in ("tenant_admin", "tenant_co_admin"):
        return [m for m in all_modules if m["name"] in active_module_names]

    # sub-user — intersect their Keycloak modules with tenant's active Kill Bill subscriptions
    return [m for m in all_modules if m["name"] in modules_from_keycloak and m["name"] in active_module_names]


@portal_router.get("/available-modules")
def get_available_modules(request: Request):
    session = request.cookies.get("session")
    if not session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    tenant_id = None
    modules_from_keycloak = []

    try:
        import httpx as _httpx
        from backend.core.config import settings as _settings
        userinfo_res = _httpx.get(
            f"{_settings.keycloak_url}/realms/{_settings.keycloak_realm}/protocol/openid-connect/userinfo",
            headers={"Authorization": f"Bearer {session}"},
            timeout=5,
        )
        if userinfo_res.status_code == 200:
            _data = userinfo_res.json()
            tenant_id = _data.get("tenant_id")
            _modules_raw = _data.get("modules", [])
            if isinstance(_modules_raw, str):
                import json as _json
                try:
                    modules_from_keycloak = _json.loads(_modules_raw)
                except Exception:
                    modules_from_keycloak = []
            else:
                modules_from_keycloak = _modules_raw if _modules_raw else []
    except Exception:
        pass

    if not tenant_id:
        try:
            payload = verify_tenant_token(session)
            tenant_id = payload["tenant_id"]
        except ValueError:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session")

    all_modules, _ = service.get_all_modules(status_filter="active")
    # Available = active modules NOT already assigned to this tenant (by name)
    return [m for m in all_modules if m["name"] not in modules_from_keycloak]

@portal_router.post("/add-module")
async def add_module_to_tenant(request: Request):
    session = request.cookies.get("session")
    if not session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    body = await request.json()
    module_id = body.get("module_id")
    if not module_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="module_id is required")

    tenant_id = None
    user_email = None
    modules_from_keycloak = []

    try:
        import httpx as _httpx
        from backend.core.config import settings as _settings
        userinfo_res = _httpx.get(
            f"{_settings.keycloak_url}/realms/{_settings.keycloak_realm}/protocol/openid-connect/userinfo",
            headers={"Authorization": f"Bearer {session}"},
            timeout=5,
        )
        if userinfo_res.status_code == 200:
            _data = userinfo_res.json()
            tenant_id = _data.get("tenant_id")
            user_email = _data.get("email")
            _modules_raw = _data.get("modules", [])
            if isinstance(_modules_raw, str):
                import json as _json
                try:
                    modules_from_keycloak = _json.loads(_modules_raw)
                except Exception:
                    modules_from_keycloak = []
            else:
                modules_from_keycloak = _modules_raw if _modules_raw else []
    except Exception:
        pass

    if not tenant_id:
        try:
            payload = verify_tenant_token(session)
            tenant_id = payload["tenant_id"]
        except ValueError:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session")

    service.assign_modules_to_tenant(
        tenant_id=tenant_id,
        module_ids=[module_id],
        admin_id=None
    )

    return {"success": True, "message": "Module added successfully"}
