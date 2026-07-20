# backend/modules/intents/routes.py

from fastapi import APIRouter, Depends, status, Query
from typing import List

from backend.modules.intents.schemas import (
    IntentCreate, IntentUpdate, IntentOut,
    IntentPolicyCreate, IntentPolicyUpdate, IntentPolicyOut, IntentPolicyWithIntentOut
)
from backend.modules.intents.repository import IntentRepository, IntentPolicyRepository
from backend.modules.intents.service import IntentService, IntentPolicyService
from backend.common.responses import SuccessResponse
from backend.core.middleware.auth import require_permission

router = APIRouter()


def get_intent_service():
    intent_repo = IntentRepository(db=None)
    policy_repo = IntentPolicyRepository(db=None)
    return IntentService(intent_repo, policy_repo)


def get_policy_service():
    intent_repo = IntentRepository(db=None)
    policy_repo = IntentPolicyRepository(db=None)
    return IntentPolicyService(policy_repo, intent_repo)


# ── INTENT ENDPOINTS ──────────────────────────────────────────────────────────

@router.get("/intents", response_model=List[IntentOut])
def get_all_intents(
    active_only: bool = Query(False),
    ctx: dict = Depends(require_permission("intents")),
    service: IntentService = Depends(get_intent_service),
):
    return service.get_all(ctx["tenant_id"], active_only)


# CRITICAL: Policy routes MUST come before /intents/{intent_id} to avoid route conflicts

@router.get("/intents/policies/all", response_model=List[IntentPolicyWithIntentOut])
def get_all_policies_with_intent(
    ctx: dict = Depends(require_permission("intent-policies")),
    service: IntentPolicyService = Depends(get_policy_service),
):
    return service.get_all_with_intent(ctx["tenant_id"])


@router.get("/intents/policies", response_model=List[IntentPolicyOut])
def get_all_policies(
    ctx: dict = Depends(require_permission("intent-policies")),
    service: IntentPolicyService = Depends(get_policy_service),
):
    return service.get_all(ctx["tenant_id"])


@router.get("/intents/{intent_id}/policies", response_model=List[IntentPolicyOut])
def get_intent_policies(
    intent_id: int,
    ctx: dict = Depends(require_permission("intent-policies")),
    service: IntentPolicyService = Depends(get_policy_service),
):
    return service.get_by_intent(ctx["tenant_id"], intent_id)


@router.post("/intents/{intent_id}/policies", response_model=IntentPolicyOut, status_code=status.HTTP_201_CREATED)
def create_intent_policy(
    intent_id: int,
    payload: IntentPolicyCreate,
    ctx: dict = Depends(require_permission("intent-policies")),
    service: IntentPolicyService = Depends(get_policy_service),
):
    return service.create(ctx["tenant_id"], intent_id, payload)


@router.get("/intents/{intent_id}/policies/{language_code}", response_model=IntentPolicyOut)
def get_intent_policy(
    intent_id: int,
    language_code: str,
    ctx: dict = Depends(require_permission("intent-policies")),
    service: IntentPolicyService = Depends(get_policy_service),
):
    return service.get(ctx["tenant_id"], intent_id, language_code)


@router.put("/intents/{intent_id}/policies/{language_code}", response_model=IntentPolicyOut)
def update_intent_policy(
    intent_id: int,
    language_code: str,
    payload: IntentPolicyUpdate,
    ctx: dict = Depends(require_permission("intent-policies")),
    service: IntentPolicyService = Depends(get_policy_service),
):
    return service.update(ctx["tenant_id"], intent_id, language_code, payload)


@router.delete("/intents/{intent_id}/policies/{language_code}", response_model=SuccessResponse)
def delete_intent_policy(
    intent_id: int,
    language_code: str,
    ctx: dict = Depends(require_permission("intent-policies")),
    service: IntentPolicyService = Depends(get_policy_service),
):
    service.delete(ctx["tenant_id"], intent_id, language_code)
    return SuccessResponse(message="Intent policy deleted successfully")


# These routes come AFTER policy routes to avoid conflicts

@router.get("/intents/{intent_id}", response_model=IntentOut)
def get_intent(
    intent_id: int,
    ctx: dict = Depends(require_permission("intents")),
    service: IntentService = Depends(get_intent_service),
):
    return service.get(ctx["tenant_id"], intent_id)


@router.post("/intents", response_model=IntentOut, status_code=status.HTTP_201_CREATED)
def create_intent(
    payload: IntentCreate,
    ctx: dict = Depends(require_permission("intents")),
    service: IntentService = Depends(get_intent_service),
):
    return service.create(ctx["tenant_id"], payload)


@router.put("/intents/{intent_id}", response_model=IntentOut)
def update_intent(
    intent_id: int,
    payload: IntentUpdate,
    ctx: dict = Depends(require_permission("intents")),
    service: IntentService = Depends(get_intent_service),
):
    return service.update(ctx["tenant_id"], intent_id, payload)


@router.delete("/intents/{intent_id}", response_model=SuccessResponse)
def delete_intent(
    intent_id: int,
    ctx: dict = Depends(require_permission("intents")),
    service: IntentService = Depends(get_intent_service),
):
    service.delete(ctx["tenant_id"], intent_id)
    return SuccessResponse(message="Intent deleted successfully")