# backend/modules/email_inboxes/routes.py

from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import List, Optional

from backend.modules.email_inboxes.schemas import (
    EmailInboxCreate, EmailInboxUpdate, EmailInboxOut,
    TestConnectionResponse,
)
from backend.core.database import engine
from backend.modules.email_inboxes.repository import EmailInboxRepository
from backend.modules.email_inboxes.service import EmailInboxService
from backend.common.responses import SuccessResponse
from backend.core.middleware.auth import require_permission

router = APIRouter()


# ── Dependency factories ──────────────────────────────────────────────────────

def get_inbox_service() -> EmailInboxService:
    return EmailInboxService(EmailInboxRepository(db=engine))


# ── EMAIL INBOX ENDPOINTS ─────────────────────────────────────────────────────

@router.get("/email-inboxes", response_model=List[EmailInboxOut])
def get_all_inboxes(
    active_only: bool = Query(False, description="Return only active inboxes"),
    ctx: dict = Depends(require_permission("connected-inboxes")),
    service: EmailInboxService = Depends(get_inbox_service),
):
    return service.get_all(ctx["tenant_id"], active_only)


@router.get("/email-inboxes/{inbox_id}", response_model=EmailInboxOut)
def get_inbox(
    inbox_id: int,
    ctx: dict = Depends(require_permission("connected-inboxes")),
    service: EmailInboxService = Depends(get_inbox_service),
):
    return service.get(ctx["tenant_id"], inbox_id)


@router.post("/email-inboxes", response_model=EmailInboxOut, status_code=status.HTTP_201_CREATED)
def create_inbox(
    payload: EmailInboxCreate,
    ctx: dict = Depends(require_permission("connected-inboxes")),
    service: EmailInboxService = Depends(get_inbox_service),
):
    try:
        return service.create(ctx["tenant_id"], payload)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.put("/email-inboxes/{inbox_id}", response_model=EmailInboxOut)
def update_inbox(
    inbox_id: int,
    payload: EmailInboxUpdate,
    ctx: dict = Depends(require_permission("connected-inboxes")),
    service: EmailInboxService = Depends(get_inbox_service),
):
    try:
        return service.update(ctx["tenant_id"], inbox_id, payload)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.delete("/email-inboxes/{inbox_id}", response_model=SuccessResponse)
def delete_inbox(
    inbox_id: int,
    ctx: dict = Depends(require_permission("connected-inboxes")),
    service: EmailInboxService = Depends(get_inbox_service),
):
    service.delete(ctx["tenant_id"], inbox_id)
    return SuccessResponse(message=f"Email inbox {inbox_id} deleted successfully")


@router.post("/email-inboxes/{inbox_id}/test", response_model=TestConnectionResponse)
def test_inbox_connection(
    inbox_id: int,
    ctx: dict = Depends(require_permission("connected-inboxes")),
    service: EmailInboxService = Depends(get_inbox_service),
):
    return service.test_connection(ctx["tenant_id"], inbox_id)






from backend.modules.email_inboxes.types import get_all_types as get_all_inbox_types

@router.get("/email-inbox-types")
def list_email_inbox_types(
    ctx: dict = Depends(require_permission("connected-inboxes")),
):
    return get_all_inbox_types()


