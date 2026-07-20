# services/eivs/validation_orchestrator.py
from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import httpx
from sqlalchemy.orm import Session

from services.eivs.models import (
    EmailIntentRun,
    ValidationRun,
    ValidationRule,
    Datasource,
    Intent,
)
from services.eivs.chart_llm_client import call_llm_with_logging

logger = logging.getLogger(__name__)


@dataclass
class RuleEvaluationResult:
    rule_code: str
    rule_name: str
    severity: str
    status: str  # PASS | FAIL
    reason: str
    datasource_name: Optional[str] = None
    sql_executed: Optional[str] = None


class ValidationOrchestrator:
    """
    Orchestrates validation rules for an intent run.

    For each ValidationRule:
      1. Build an LLM prompt describing the rule and email context.
      2. Call Adapter /v1/email-validation/analyze for the datasource.
      3. Call LLM again to decide PASS/FAIL and reason.
      4. Aggregate results into a ValidationRun.
    """

    def __init__(
        self,
        db: Session,
        tenant_id: str,
        adapter_base_url: Optional[str] = None,
    ) -> None:
        self.db = db
        self.tenant_id = tenant_id
        self.adapter_base_url = adapter_base_url or "http://adapter:8000"

    async def run_validations(
        self,
        intent_run: EmailIntentRun,
        email_subject: str,
        email_body: str,
        sender_email: str,
        correlation_id: str,
    ) -> ValidationRun:
        # Load rules linked to primary intent
        if not intent_run.primary_intent_code:
            logger.info(
                "No primary intent for intent_run_id=%s; skipping validations",
                intent_run.intent_run_id,
            )
            return self._create_empty_validation_run(intent_run)

        # NOTE: ValidationRule has no intent_code column — it is linked via
        # intent_id (FK to Intent.intent_id). Resolve the Intent row by
        # intent_code first, same pattern as
        # intent_service._select_policies_for_intents.
        intent_row: Optional[Intent] = (
            self.db.query(Intent)
            .filter(Intent.intent_code == intent_run.primary_intent_code)
            .one_or_none()
        )

        if intent_row is None:
            logger.warning(
                "No Intent row found for intent_code=%s; skipping validations",
                intent_run.primary_intent_code,
            )
            return self._create_empty_validation_run(intent_run)

        rules: List[ValidationRule] = (
            self.db.query(ValidationRule)
            .filter(
                ValidationRule.intent_id == intent_row.intent_id,
                ValidationRule.is_active.is_(True),
            )
            .order_by(ValidationRule.execution_order.asc())
            .all()
        )

        if not rules:
            logger.info(
                "No active validation rules for intent_code=%s",
                intent_run.primary_intent_code,
            )
            return self._create_empty_validation_run(intent_run)

        success_results: List[RuleEvaluationResult] = []
        failure_results: List[RuleEvaluationResult] = []

        async with httpx.AsyncClient() as client:
            for rule in rules:
                try:
                    result = await self._evaluate_rule(
                        client=client,
                        rule=rule,
                        intent_run=intent_run,
                        email_subject=email_subject,
                        email_body=email_body,
                        sender_email=sender_email,
                        correlation_id=correlation_id,
                    )
                    if result.status == "PASS":
                        success_results.append(result)
                    else:
                        failure_results.append(result)
                except Exception as exc:
                    logger.exception(
                        "Error running validation rule %s for intent_run_id=%s",
                        rule.rule_code,
                        intent_run.intent_run_id,
                    )
                    failure_results.append(
                        RuleEvaluationResult(
                            rule_code=rule.rule_code,
                            rule_name=rule.rule_name,
                            severity=rule.severity or "CRITICAL",
                            status="FAIL",
                            reason=f"Exception during validation: {exc}",
                            datasource_name=None,
                            sql_executed=None,
                        )
                    )

        overall_status = self._compute_overall_status(
            success_results,
            failure_results,
        )

        validation_run = ValidationRun(
            intent_run_id=intent_run.intent_run_id,
            intent_code=intent_run.primary_intent_code,
            overall_status=overall_status,
            validation_success_json=[
                {
                    "rule_code": r.rule_code,
                    "rule_name": r.rule_name,
                    "severity": r.severity,
                    "status": r.status,
                    "reason": r.reason,
                    "datasource_name": r.datasource_name,
                    "sql_executed": r.sql_executed,
                }
                for r in success_results
            ],
            validation_failure_json=[
                {
                    "rule_code": r.rule_code,
                    "rule_name": r.rule_name,
                    "severity": r.severity,
                    "status": r.status,
                    "reason": r.reason,
                    "datasource_name": r.datasource_name,
                    "sql_executed": r.sql_executed,
                }
                for r in failure_results
            ],
        )

        self.db.add(validation_run)
        self.db.commit()
        self.db.refresh(validation_run)
        return validation_run

    async def _evaluate_rule(
        self,
        client: httpx.AsyncClient,
        rule: ValidationRule,
        intent_run: EmailIntentRun,
        email_subject: str,
        email_body: str,
        sender_email: str,
        correlation_id: str,
    ) -> RuleEvaluationResult:
        # Load datasource config
        datasource: Datasource = (
            self.db.query(Datasource)
            .filter(Datasource.datasource_id == rule.datasource_id)
            .one()
        )

        # 1) Build rule prompt for Adapter
        rule_prompt_context: Dict[str, Any] = {
            "tenant_id": self.tenant_id,
            "intent_code": intent_run.primary_intent_code,
            "rule_code": rule.rule_code,
            "rule_name": rule.rule_name,
            "rule_description": rule.rule_description,
            "email": {
                "subject": email_subject,
                "body": email_body,
                "sender_email": sender_email,
            },
        }

        adapter_payload = {
            "tenant_id": self.tenant_id,
            "prompt": rule_prompt_context,
            "datasource_name": datasource.name,
            "event_type": "EMAIL_PROCESSING",
            "correlation_id": correlation_id,
        }

        adapter_url = f"{self.adapter_base_url}/v1/email-validation/analyze"
        adapter_resp = await client.post(
            adapter_url,
            json=adapter_payload,
            timeout=30.0,
        )
        adapter_resp.raise_for_status()
        adapter_body = adapter_resp.json()

        datasource_result = adapter_body.get("datasource_result", [])
        sql_executed = adapter_body.get("sql_executed")
        sgate_decision = adapter_body.get("sgate_decision")

        # 2) Build PASS/FAIL LLM prompt
        pass_fail_context = {
            "tenant_id": self.tenant_id,
            "intent_code": intent_run.primary_intent_code,
            "rule_code": rule.rule_code,
            "rule_name": rule.rule_name,
            "rule_description": rule.rule_description,
            "severity": rule.severity,
            "email": {
                "subject": email_subject,
                "body": email_body,
                "sender_email": sender_email,
            },
            "datasource_name": datasource.name,
            "datasource_result": datasource_result,
            "sgate_decision": sgate_decision,
            "sql_executed": sql_executed,
        }

        system_prompt = (
            "You are a validation engine. Based on the rule description, "
            "email context and datasource_result, decide PASS or FAIL. "
            'Return JSON: {"status":"PASS|FAIL","reason":"..."}.'
        )

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": json.dumps(pass_fail_context)},
        ]

        llm_resp = await call_llm_with_logging(
            db=self.db,
            messages=messages,
            prompt_type="VALIDATION_PASS_FAIL",
            intent_run_id=intent_run.intent_run_id,
            validation_run_id=None,
            model_name=None,
            backend="PRIMARY",
            tenant_id=self.tenant_id,
        )

        status = llm_resp.get("status", "FAIL").upper()
        if status not in ("PASS", "FAIL"):
            status = "FAIL"
        reason = llm_resp.get("reason") or "No reason provided."

        return RuleEvaluationResult(
            rule_code=rule.rule_code,
            rule_name=rule.rule_name,
            severity=rule.severity or "INFO",
            status=status,
            reason=reason,
            datasource_name=datasource.name,
            sql_executed=sql_executed,
        )

    def _compute_overall_status(
        self,
        success_results: List[RuleEvaluationResult],
        failure_results: List[RuleEvaluationResult],
    ) -> str:
        if not failure_results:
            return "SUCCESS"

        # If any CRITICAL failed, mark FAILED; else PARTIAL
        for r in failure_results:
            if r.severity.upper() == "CRITICAL":
                return "FAILED"
        return "PARTIAL"

    def _create_empty_validation_run(
        self, intent_run: EmailIntentRun
    ) -> ValidationRun:
        vr = ValidationRun(
            intent_run_id=intent_run.intent_run_id,
            intent_code=intent_run.primary_intent_code,
            overall_status="SUCCESS",
            validation_success_json=[],
            validation_failure_json=[],
        )
        self.db.add(vr)
        self.db.commit()
        self.db.refresh(vr)
        return vr