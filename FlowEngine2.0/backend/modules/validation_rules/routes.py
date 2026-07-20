# backend/modules/validation_rules/routes.py

from fastapi import APIRouter, Depends, status, Query, Header
from typing import List, Optional

from backend.modules.validation_rules.schemas import ValidationRuleCreate, ValidationRuleUpdate, ValidationRuleOut
from backend.modules.validation_rules.repository import ValidationRuleRepository
from backend.modules.validation_rules.service import ValidationRuleService
from backend.common.responses import SuccessResponse
from backend.core.middleware.auth import require_permission

router = APIRouter()

def get_service() -> ValidationRuleService:
    return ValidationRuleService(ValidationRuleRepository(db=None))


@router.get("/validation-rules", response_model=List[ValidationRuleOut])
def get_all_validation_rules(
    intent_id: Optional[int] = Query(None, description="Filter by intent ID"),
    language_code: Optional[str] = Query(None, description="Filter by language code"),
    active_only: bool = Query(False, description="Return only active rules"),
    ctx: dict = Depends(require_permission("validation-rules")),
    service: ValidationRuleService = Depends(get_service)
):
    return service.get_all(ctx["tenant_id"], intent_id, language_code, active_only)


@router.get("/validation-rules/{rule_id}", response_model=ValidationRuleOut)
def get_validation_rule(
    rule_id: int,
    ctx: dict = Depends(require_permission("validation-rules")),
    service: ValidationRuleService = Depends(get_service)
):
    return service.get(ctx["tenant_id"], rule_id)


@router.get("/validation-rules/intent/{intent_id}/language/{language_code}", response_model=List[ValidationRuleOut])
def get_rules_by_intent_and_language(
    intent_id: int,
    language_code: str,
    ctx: dict = Depends(require_permission("validation-rules")),
    service: ValidationRuleService = Depends(get_service)
):
    return service.get_by_intent_and_language(ctx["tenant_id"], intent_id, language_code)


@router.get("/validation-rules/next-order/{intent_id}")
def get_next_execution_order(
    intent_id: int,
    language_code: str = Query(default='multi', description="Language code, defaults to 'multi'"),
    ctx: dict = Depends(require_permission("validation-rules")),
    service: ValidationRuleService = Depends(get_service)
):
    next_order = service.get_next_execution_order(ctx["tenant_id"], intent_id, language_code)
    return {
        "intent_id": intent_id,
        "language_code": language_code,
        "next_execution_order": next_order
    }


@router.post("/validation-rules", response_model=ValidationRuleOut, status_code=status.HTTP_201_CREATED)
def create_validation_rule(
    payload: ValidationRuleCreate,
    ctx: dict = Depends(require_permission("validation-rules")),
    service: ValidationRuleService = Depends(get_service)
):
    return service.create(ctx["tenant_id"], payload)


@router.put("/validation-rules/{rule_id}", response_model=ValidationRuleOut)
def update_validation_rule(
    rule_id: int,
    payload: ValidationRuleUpdate,
    ctx: dict = Depends(require_permission("validation-rules")),
    service: ValidationRuleService = Depends(get_service)
):
    return service.update(ctx["tenant_id"], rule_id, payload)


@router.delete("/validation-rules/{rule_id}", response_model=SuccessResponse)
def delete_validation_rule(
    rule_id: int,
    ctx: dict = Depends(require_permission("validation-rules")),
    service: ValidationRuleService = Depends(get_service)
):
    service.delete(ctx["tenant_id"], rule_id)
    return SuccessResponse(message=f"Validation rule {rule_id} deleted successfully")