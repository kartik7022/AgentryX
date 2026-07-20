# backend/modules/sidebar_items/routes.py

from fastapi import APIRouter, HTTPException, status, Cookie
from typing import Optional
from backend.modules.sidebar_items.schemas import (
    SidebarItemCreate, SidebarItemUpdate, SidebarItemOut, SidebarItemListResponse
)
from backend.modules.sidebar_items import service
from backend.common.responses import SuccessResponse
from backend.modules.admins.service import verify_admin_token

router = APIRouter(prefix="/admin/sidebar-items", tags=["Admin - Sidebar Items"])
portal_router = APIRouter(prefix="/portal", tags=["Portal - Sidebar Items"])

LEGACY_SIDEBAR_HREFS = {
    "/frontend/portal/dashboard.html": "/app",
    "/frontend/portal/datasources.html": "/app/datasources",
    "/frontend/portal/datasource-configs.html": "/app/datasource-configs",
    "/frontend/portal/intents.html": "/app/intents",
    "/frontend/portal/intent-policies.html": "/app/intent-policies",
    "/frontend/portal/rules.html": "/app/rules",
    "/frontend/credentials/index.html": "/app/credentials",
    "/frontend/portal/playground.html": "/app/playground",
    "/frontend/portal/users.html": "/app/users",
    "/frontend/portal/roles.html": "/app/roles",
    "/frontend/portal/api-keys.html": "/app/api-keys",
    "/frontend/portal/connected-inboxes.html": "/app/connected-inboxes",
}


# ── Helper: require admin session ────────────────────────────────────────────

def get_current_admin(admin_session: str = Cookie(default=None)) -> dict:
    if not admin_session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        return verify_admin_token(admin_session)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))


def serialize_sidebar_item(item: dict) -> SidebarItemOut:
    payload = dict(item)
    payload["href"] = LEGACY_SIDEBAR_HREFS.get(payload.get("href"), payload.get("href"))
    return SidebarItemOut(**payload)


    # ── ADMIN — SIDEBAR ITEM MANAGEMENT ──────────────────────────────────────────

@router.get("", response_model=SidebarItemListResponse)
def list_sidebar_items(
    status_filter: Optional[str] = None,
    admin_session: str = Cookie(default=None)
):
    admin = get_current_admin(admin_session)
    items, count = service.get_all_sidebar_items(status_filter=status_filter)
    return SidebarItemListResponse(
items=[serialize_sidebar_item(i) for i in items],
count=count
)


@router.get("/{item_id}", response_model=SidebarItemOut)
def get_sidebar_item(
    item_id: str,
    admin_session: str = Cookie(default=None)
):
    admin = get_current_admin(admin_session)
    item = service.get_sidebar_item_by_id(item_id)
    return serialize_sidebar_item(item)


@router.post("", response_model=SidebarItemOut, status_code=status.HTTP_201_CREATED)
def create_sidebar_item(
    body: SidebarItemCreate,
    admin_session: str = Cookie(default=None)
):
    admin = get_current_admin(admin_session)
    item = service.create_sidebar_item(payload=body.dict())
    return serialize_sidebar_item(item)


@router.patch("/{item_id}", response_model=SidebarItemOut)
def update_sidebar_item(
    item_id: str,
    body: SidebarItemUpdate,
    admin_session: str = Cookie(default=None)
):
    admin = get_current_admin(admin_session)
    item = service.update_sidebar_item(
        item_id=item_id,
        payload=body.dict(exclude_unset=True)
    )
    return serialize_sidebar_item(item)


@router.delete("/{item_id}", response_model=SuccessResponse)
def delete_sidebar_item(
    item_id: str,
    admin_session: str = Cookie(default=None)
):
    admin = get_current_admin(admin_session)
    service.delete_sidebar_item(item_id)
    return SuccessResponse(message=f"Sidebar item {item_id} deleted successfully")


# ── PORTAL — READ-ONLY, TENANT-FACING ────────────────────────────────────────
# Full metadata list — tenant-side App.jsx filters this against the values
# listed in each of the tenant's assigned modules' sidebar_items (from
# /portal/my-modules), and against the logged-in user's role for
# hidden_from_module_user. No tenant-specific data is exposed here.

@portal_router.get("/sidebar-items", response_model=SidebarItemListResponse)
def list_active_sidebar_items():
    items, count = service.get_all_sidebar_items(status_filter="active")
    return SidebarItemListResponse(
items=[serialize_sidebar_item(i) for i in items],
count=count
)
