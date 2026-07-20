# backend/modules/validation_rules/service.py

from typing import Optional, List

from sqlalchemy import text

from backend.modules.validation_rules.repository import ValidationRuleRepository
from backend.modules.validation_rules.schemas import ValidationRuleCreate, ValidationRuleUpdate
from backend.common.exceptions import ResourceNotFoundError, ResourceAlreadyExistsError
from backend.core.database import engine


class ValidationRuleService:

    def __init__(self, repo: ValidationRuleRepository, db=None):
        self.repo = repo

    def get_all(
        self,
        tenant_id: str,
        intent_id: Optional[int] = None,
        language_code: Optional[str] = None,
        active_only: bool = False,
    ) -> List:
        return self.repo.get_all(tenant_id, intent_id, language_code, active_only)

    def get(self, tenant_id: str, rule_id: int):
        obj = self.repo.get_by_id(tenant_id, rule_id)
        if not obj:
            raise ResourceNotFoundError(f"Validation rule with id '{rule_id}' not found")
        return obj

    def get_by_intent_and_language(self, tenant_id: str, intent_id: int, language_code: str) -> List:
        return self.repo.get_by_intent_and_language(tenant_id, intent_id, language_code)

    def create(self, tenant_id: str, payload: ValidationRuleCreate):
        with engine.connect() as conn:
            # Validate intent exists
            intent = conn.execute(
                text("""
                    SELECT 1 FROM eivs.intents
                    WHERE tenant_id = :tenant_id AND intent_id = :intent_id
                """),
                {"tenant_id": tenant_id, "intent_id": payload.intent_id},
            ).fetchone()
            if not intent:
                raise ResourceNotFoundError(f"Intent with id '{payload.intent_id}' not found")

            # Validate datasource exists and is active
            datasource = conn.execute(
                text("""
                    SELECT name, is_active FROM eivs.datasources
                    WHERE tenant_id = :tenant_id AND datasource_id = :datasource_id
                """),
                {"tenant_id": tenant_id, "datasource_id": payload.datasource_id},
            ).fetchone()
            if not datasource:
                raise ResourceNotFoundError(f"Datasource with id '{payload.datasource_id}' not found")
            if not datasource.is_active:
                raise ValueError(f"Datasource '{datasource.name}' is not active.")

            # Check rule_code uniqueness within same intent
            existing = conn.execute(
                text("""
                    SELECT 1 FROM eivs.validation_rules
                    WHERE tenant_id = :tenant_id
                        AND rule_code = :rule_code
                        AND intent_id = :intent_id
                """),
                {"tenant_id": tenant_id, "rule_code": payload.rule_code, "intent_id": payload.intent_id},
            ).fetchone()
            if existing:
                raise ResourceAlreadyExistsError(
                    f"Validation rule with code '{payload.rule_code}' already exists in this intent"
                )

        if payload.execution_order < 1:
            raise ValueError("execution_order must be >= 1")
        if payload.severity not in ['CRITICAL', 'WARNING']:
            raise ValueError("severity must be either 'CRITICAL' or 'WARNING'")

        return self.repo.create(tenant_id, payload)

    def update(self, tenant_id: str, rule_id: int, payload: ValidationRuleUpdate):
        existing_rule = self.repo.get_by_id(tenant_id, rule_id)
        if not existing_rule:
            raise ResourceNotFoundError(f"Validation rule with id '{rule_id}' not found")

        with engine.connect() as conn:
            if payload.datasource_id is not None:
                datasource = conn.execute(
                    text("""
                        SELECT name, is_active FROM eivs.datasources
                        WHERE tenant_id = :tenant_id AND datasource_id = :datasource_id
                    """),
                    {"tenant_id": tenant_id, "datasource_id": payload.datasource_id},
                ).fetchone()
                if not datasource:
                    raise ResourceNotFoundError(f"Datasource with id '{payload.datasource_id}' not found")
                if not datasource.is_active:
                    raise ValueError(f"Datasource '{datasource.name}' is not active.")

            if payload.intent_id is not None:
                intent = conn.execute(
                    text("""
                        SELECT 1 FROM eivs.intents
                        WHERE tenant_id = :tenant_id AND intent_id = :intent_id
                    """),
                    {"tenant_id": tenant_id, "intent_id": payload.intent_id},
                ).fetchone()
                if not intent:
                    raise ResourceNotFoundError(f"Intent with id '{payload.intent_id}' not found")

        if payload.execution_order is not None and payload.execution_order < 1:
            raise ValueError("execution_order must be >= 1")
        if payload.severity is not None and payload.severity not in ['CRITICAL', 'WARNING']:
            raise ValueError("severity must be either 'CRITICAL' or 'WARNING'")

        # Check rule_code uniqueness within same intent BEFORE updating
        if payload.rule_code and payload.rule_code != existing_rule.rule_code:
            intent_id_to_check = payload.intent_id if payload.intent_id is not None else existing_rule.intent_id
            with engine.connect() as conn:
                dup = conn.execute(
                    text("""
                        SELECT 1 FROM eivs.validation_rules
                        WHERE tenant_id = :tenant_id
                        AND rule_code = :rule_code
                        AND intent_id = :intent_id
                        AND rule_id != :rule_id
                    """),
                    {"tenant_id": tenant_id, "rule_code": payload.rule_code, "intent_id": intent_id_to_check, "rule_id": rule_id},
                ).fetchone()
                if dup:
                    raise ResourceAlreadyExistsError(
                        f"Validation rule with code '{payload.rule_code}' already exists in this intent"
                    )

        obj = self.repo.update(tenant_id, rule_id, payload)
        if not obj:
            raise ResourceNotFoundError(f"Validation rule with id '{rule_id}' not found")
        return obj

    def delete(self, tenant_id: str, rule_id: int) -> None:
        deleted = self.repo.delete(tenant_id, rule_id)
        if not deleted:
            raise ResourceNotFoundError(f"Validation rule with id '{rule_id}' not found")

    def get_next_execution_order(self, tenant_id: str, intent_id: int, language_code: str = 'multi') -> int:
        max_order = self.repo.get_max_execution_order(tenant_id, intent_id, language_code)
        return max_order + 1