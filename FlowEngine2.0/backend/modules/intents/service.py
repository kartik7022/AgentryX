# backend/modules/intents/service.py

from backend.modules.intents.repository import IntentRepository, IntentPolicyRepository
from backend.modules.intents.schemas import (
    IntentCreate, IntentUpdate, IntentPolicyCreate, IntentPolicyUpdate, IntentPolicyWithIntentOut
)
from backend.common.exceptions import ResourceNotFoundError, ResourceAlreadyExistsError
from typing import List


class IntentService:
    
    def __init__(self, intent_repo: IntentRepository, policy_repo: IntentPolicyRepository):
        self.intent_repo = intent_repo
        self.policy_repo = policy_repo
    
    def get_all(self, tenant_id: str, active_only: bool = False):
        return self.intent_repo.get_all(tenant_id, active_only)
    
    def get(self, tenant_id: str, intent_id: int):
        obj = self.intent_repo.get_by_id(tenant_id, intent_id)
        if not obj:
            raise ResourceNotFoundError("Intent not found")
        return obj
    
    def create(self, tenant_id: str, payload: IntentCreate):
        # Check if intent_code already exists for this tenant
        existing = self.intent_repo.get_by_code(tenant_id, payload.intent_code)
        if existing:
            raise ResourceAlreadyExistsError(f"Intent with code '{payload.intent_code}' already exists")
        
        return self.intent_repo.create(tenant_id, payload)
    
    def update(self, tenant_id: str, intent_id: int, payload: IntentUpdate):
        existing = self.intent_repo.get_by_id(tenant_id, intent_id)
        if not existing:
            raise ResourceNotFoundError("Intent not found")

        # Check if intent_code already exists for this tenant BEFORE updating
        if payload.intent_code and payload.intent_code != existing.intent_code:
            dup = self.intent_repo.get_by_code(tenant_id, payload.intent_code)
            if dup:
                raise ResourceAlreadyExistsError(f"Intent with code '{payload.intent_code}' already exists")

        obj = self.intent_repo.update(tenant_id, intent_id, payload)
        if not obj:
            raise ResourceNotFoundError("Intent not found")
        return obj
    
    def delete(self, tenant_id: str, intent_id: int):
        deleted = self.intent_repo.delete(tenant_id, intent_id)
        if not deleted:
            raise ResourceNotFoundError("Intent not found")


class IntentPolicyService:
    
    def __init__(self, policy_repo: IntentPolicyRepository, intent_repo: IntentRepository):
        self.policy_repo = policy_repo
        self.intent_repo = intent_repo
    
    def get_all_with_intent(self, tenant_id: str) -> List[IntentPolicyWithIntentOut]:
        policies = self.policy_repo.get_all_with_intent(tenant_id)
        result = []
        for policy in policies:
            result.append(IntentPolicyWithIntentOut(
                intent_id=policy.intent_id,
                intent_code=policy.intent_code,           # flat, no .intent.
                intent_display_name=policy.display_name,  # flat, no .intent.
                language_code=policy.language_code,
                tenant_id=policy.tenant_id,
                n8n_orchestration_url=policy.n8n_orchestration_url,
                auto_process_min_conf=policy.auto_process_min_conf,
                manual_review_min_conf=policy.manual_review_min_conf,
                reroute_email=policy.reroute_email,
                multi_intent_mode=policy.multi_intent_mode,
                allow_multi_auto=policy.allow_multi_auto,
                allow_subset_auto=policy.allow_subset_auto
            ))
        return result
    
    
    def get_all(self, tenant_id: str):
        """Get all policies across all intents for a specific tenant"""
        return self.policy_repo.get_all(tenant_id)
    
    def get_by_intent(self, tenant_id: str, intent_id: int):
        # Verify intent exists for this tenant
        intent = self.intent_repo.get_by_id(tenant_id, intent_id)
        if not intent:
            raise ResourceNotFoundError("Intent not found")
        return self.policy_repo.get_by_intent(tenant_id, intent_id)
    
    def get(self, tenant_id: str, intent_id: int, language_code: str):
        obj = self.policy_repo.get_by_intent_and_language(tenant_id, intent_id, language_code)
        if not obj:
            raise ResourceNotFoundError("Intent policy not found")
        return obj
    
    def create(self, tenant_id: str, intent_id: int, payload: IntentPolicyCreate):
        # Verify intent exists for this tenant
        intent = self.intent_repo.get_by_id(tenant_id, intent_id)
        if not intent:
            raise ResourceNotFoundError("Intent not found")
        
        # Check if policy already exists for this language and tenant
        existing = self.policy_repo.get_by_intent_and_language(tenant_id, intent_id, payload.language_code)
        if existing:
            raise ResourceAlreadyExistsError(
                f"Policy for language '{payload.language_code}' already exists for this intent"
            )
        
        return self.policy_repo.create(tenant_id, intent_id, payload)
    
    def update(self, tenant_id: str, intent_id: int, language_code: str, payload: IntentPolicyUpdate):
        obj = self.policy_repo.update(tenant_id, intent_id, language_code, payload)
        if not obj:
            raise ResourceNotFoundError("Intent policy not found")
        return obj
    
    def delete(self, tenant_id: str, intent_id: int, language_code: str):
        deleted = self.policy_repo.delete(tenant_id, intent_id, language_code)
        if not deleted:
            raise ResourceNotFoundError("Intent policy not found")