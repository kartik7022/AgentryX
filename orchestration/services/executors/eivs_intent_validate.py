# services/executors/eivs_intent_validate.py

import json
import logging
import uuid
from typing import Any, Dict, List

from .step_executor import StepExecutor
from ..models.runtime_context import StepExecutionInput, StepExecutionResult
from ..agent.agent_contract import (
    AgentTaskConfig, PromptRef, AgentBudgetConfig,
    AgentApprovalPolicy, AgentFallbackPolicy,
)
from ..agent.agent_runtime import AgentRuntime

logger = logging.getLogger(__name__)


def _create_agent_run_row(conn, agent_run_id, execution_id, tenant_id, plan_name,
                           step_key, config, input_json):
    """orchestration.agent_task_trace_events has a FK to agent_task_runs —
    AgentRuntime._persist_trace() will fail (and poison the whole shared
    connection for the rest of the request) if this row doesn't exist
    first. agent_task_executor.py already does this for real agent_task
    steps; intent_validate needs the same row since it now uses the same
    AgentRuntime engine internally."""
    if conn is None:
        return
    try:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO orchestration.agent_task_runs
                (agent_run_id, execution_id, tenant_id, plan_name, step_key,
                 prompt_id, prompt_version, goal, status, input_json, budgets_json)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'running', %s, %s)
        """, (agent_run_id, execution_id or "", tenant_id, plan_name, step_key,
              config.prompt_ref.prompt_id, config.prompt_ref.version, config.goal,
              json.dumps(input_json, default=str),
              json.dumps(config.budgets.model_dump(), default=str)))
        conn.commit()
    except Exception:
        logger.exception(
            "Failed to create agent_task_runs row for review_id=%s (non-fatal, "
            "but AgentRuntime trace persistence will fail without it)", agent_run_id,
        )
        conn.rollback()


def _update_agent_run_row(conn, agent_run_id, status, output_json, error_json, usage_json, duration_ms):
    if conn is None:
        return
    try:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE orchestration.agent_task_runs
            SET status=%s, output_json=%s, error_json=%s, usage_json=%s,
                duration_ms=%s, completed_at=now()
            WHERE agent_run_id = %s
        """, (status, json.dumps(output_json, default=str),
              json.dumps(error_json, default=str), json.dumps(usage_json, default=str),
              duration_ms, agent_run_id))
        conn.commit()
    except Exception:
        logger.exception("Failed to update agent_task_runs row for agent_run_id=%s (non-fatal)", agent_run_id)
        conn.rollback()

# Kept short and concrete on purpose — this is what lets the AI write
# correct SQL without a live schema-introspection tool. Extend this list
# as new datasources/domains come online; still zero code changes needed
# for the *checklist* itself, only this reference block.
_KNOWN_DATASOURCE_SCHEMAS = """- CRM_DB: crm.customers (customer_id, full_name, email, phone, primary_loan_account)
- LOAN_CORE_DB: loan_core.loans (loan_id, loan_account_number, customer_id, status, principal_amount, currency)
- INSURANCE_DB: ins.customers (customer_id, full_name, email, phone), ins.policies (policy_id, policy_number, customer_id, policy_status), ins.claims (claim_id, claim_number, policy_id, claim_status, claim_type)
- HEALTH_DB: emr.patients (patient_id, mrn, full_name, date_of_birth, phone, email, national_id, country, is_active), emr.encounters (encounter_id, patient_id, encounter_date, encounter_type, department, chief_complaint, status), emr.diagnoses (diagnosis_id, encounter_id, icd10_code, diagnosis_text, is_primary, diagnosis_status), emr.lab_results (lab_result_id, encounter_id, test_code, test_name, result_value, unit, reference_low, reference_high, abnormal_flag)"""

def _build_validation_goal(intent_code: str, confidence: float, subject: str, body: str, sender_email: str) -> str:
    return f"""You are performing pre-processing verification for a request classified as intent '{intent_code}' ({confidence:.0f}% confidence).

Sender email: {sender_email}
Subject: {subject}
Body: {body}

You will be invoked repeatedly, one step at a time, until you give a final_answer. Each time you're called, TOOL OBSERVATIONS shows every check you've already performed and found in THIS SAME run — read it carefully before deciding what to do next.

Follow this process exactly:
1. Decide the 3 most important, genuinely DIFFERENT things a bank/insurer must verify for this specific type of request. Think like a risk/compliance officer: what could go wrong if this request were fraudulent or mistaken?
2. Each turn, perform exactly ONE check you have not already performed, using the datasource_lookup tool to run a real, read-only SQL SELECT.
3. NEVER repeat a query you already ran — check TOOL OBSERVATIONS first. If an earlier check already gave you a piece of information (e.g. an account number, a customer ID), use that value directly in your NEXT check instead of looking it up again.
4. Available datasources and their key tables:
{_KNOWN_DATASOURCE_SCHEMAS}
5. Do not give up early. If you have found information in an earlier check that lets you perform your 2nd or 3rd check (e.g. you found a loan account number, so now go check whether that loan exists and its status), you MUST use it and continue — never call human_review or submit an "insufficient information" final_answer while a clear next check is still available to you with information you already have.
6. CRITICAL — passed must reflect the ACTUAL business condition, not just "a row came back": if your check is "is the loan CLOSED" and the row you got back shows status=OPEN, that check's passed value MUST be false, even though the loan itself does exist. Never phrase a check so loosely (e.g. "loan exists") that a wrong value still counts as passing. Match each check's name to the exact business condition it's actually testing.
7. Severity guidance — get this right, it directly controls whether a fixable mismatch gets a second chance or is rejected outright:
   - CRITICAL = the underlying thing being requested isn't real or isn't eligible at all (e.g. the account/loan/policy doesn't exist, or its status doesn't meet the requirement). A CRITICAL failure means the request itself is invalid — there is nothing to recover.
   - WARNING = the account/loan/policy itself checks out fine, but ONE identifying detail about the person (e.g. sender email, name spelling) doesn't match on its own. This is NOT proof of fraud — people change emails, have typos, etc. Mark this WARNING, not CRITICAL, so it can still be resolved through alternate evidence (phone, name, address) rather than being rejected outright.
   - Concretely: "does this loan/account/policy exist" and "is its status what's required" are CRITICAL. "Does the sender's email match our records" — evaluated BY ITSELF, with nothing else wrong — is WARNING.
8. Every check MUST include a non-empty detail string stating the exact real value you found (e.g. "Loan LN99999 found with status OPEN — required CLOSED status not met"). Never leave detail empty.
9. Once you have completed all 3 DIFFERENT checks, submit final_answer. Your checks array MUST list ALL 3 checks you performed across this entire conversation — not just the most recent one. Go back through every TOOL OBSERVATIONS entry and include each one you actually ran.
10. Decide overall_status: 'SUCCESS' if every CRITICAL check passed, 'FAILED' if ANY CRITICAL check's passed is false, 'PARTIAL' only if every CRITICAL check passed but a WARNING check did not. The severity field you assign each check (step 7) is what this decision is based on — double check it matches your own reasoning before answering; do not write "WARNING" in your reasoning text while marking severity as "CRITICAL" in the same check, or vice versa. Always include a non-empty reasoning string explaining exactly which check(s) drove your decision.
11. Only call human_review if, after genuinely attempting all 3 checks, your results are ambiguous or contradictory — not simply because you're unsure what to check next.

Never guess — only rely on real datasource_lookup results you retrieved yourself."""


_OUTPUT_SCHEMA = {
    "type": "object",
    "required": ["overall_status"],
    "properties": {
        "overall_status": {"type": "string", "enum": ["SUCCESS", "PARTIAL", "FAILED"]},
        "checks": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "severity": {"type": "string", "enum": ["CRITICAL", "WARNING"]},
                    "passed": {"type": "boolean"},
                    "detail": {"type": "string"},
                },
            },
        },
        "reasoning": {"type": "string"},
    },
}


def _normalize_check(c: Dict[str, Any]) -> Dict[str, Any]:
    """The model doesn't always use the exact field names documented in
    _OUTPUT_SCHEMA (name/severity/passed/detail) even when told to — e.g.
    it returned check_name/check_type/status/description in a real run.
    Normalize whatever shape comes back into the canonical one, so a
    correct check never gets silently misread as a failure just because
    of a naming difference."""
    name = c.get("name") or c.get("check_name") or c.get("check") or "unnamed_check"

    severity_raw = str(c.get("severity") or c.get("check_type") or c.get("priority") or "CRITICAL").upper()
    severity = severity_raw if severity_raw in ("CRITICAL", "WARNING") else "CRITICAL"

    detail = c.get("detail") or c.get("description") or c.get("reason") or ""

    if isinstance(c.get("passed"), bool):
        passed = c["passed"]
    else:
        status_raw = str(c.get("status") or c.get("result") or "").upper()
        passed = status_raw in ("SUCCESS", "PASS", "PASSED", "TRUE", "OK", "YES")

    return {"name": name, "severity": severity, "passed": passed, "detail": detail}


class IntentValidateExecutor(StepExecutor):
    @property
    def kind(self) -> str:
        return "intent_validate"

    def execute(self, step_input: StepExecutionInput) -> StepExecutionResult:
        start = self._start_timer()
        ctx = step_input.context
        bindings = step_input.step.get("input_bindings_json") or {}
        params = ctx.runtime_params

        classify_step_key = bindings.get("classify_step_key", "classify_email_intent")
        classify_result = ctx.prior_step_results.get(classify_step_key)

        if not isinstance(classify_result, dict):
            return self.failure(
                step_key=ctx.step_key,
                kind=self.kind,
                error={
                    "message": (
                        f"No result found for prior step "
                        f"'{classify_step_key}' — intent_validate must "
                        "depend on an intent_classify step"
                    ),
                    "type": "MissingDependencyError",
                },
                duration_ms=self._elapsed_ms(start),
            )

        intent_code = classify_result.get("primary_intent_code") or "UNKNOWN"
        confidence = classify_result.get("primary_intent_conf") or 0.0

        goal = _build_validation_goal(
            intent_code=intent_code,
            confidence=confidence,
            subject=params.get("subject", ""),
            body=params.get("body", ""),
            sender_email=params.get("sender_email", ""),
        )

        config = AgentTaskConfig(
            prompt_ref=PromptRef(prompt_name=f"intent-validate-{intent_code.lower()}"),
            goal=goal,
            allowed_tools=["datasource_lookup", "human_review"],
            budgets=AgentBudgetConfig(
                max_iterations=10, max_model_calls=10, max_tool_calls=12,
                max_cost_usd=0.75, timeout_ms=60000,
            ),
            output_schema=_OUTPUT_SCHEMA,
            approval_policy=AgentApprovalPolicy(
                mode="auto_for_read_only", require_approval_for=["human_review"],
            ),
            fallback_policy=AgentFallbackPolicy(
                on_output_invalid="human_review", on_budget_exceeded="human_review",
            ),
        )

        agent_run_id = str(uuid.uuid4())

        _create_agent_run_row(
            conn=ctx.db_conn, agent_run_id=agent_run_id, execution_id=ctx.execution_id,
            tenant_id=ctx.tenant_id, plan_name=ctx.plan_name, step_key=ctx.step_key,
            config=config, input_json=params,
        )

        runtime = AgentRuntime(conn=ctx.db_conn)
        run_result = runtime.run(config=config, context=ctx, agent_run_id=agent_run_id)

        if run_result.status == "success":
            final = run_result.output or {}
            raw_checks = final.get("checks") or []
            checks: List[Dict[str, Any]] = [_normalize_check(c) for c in raw_checks]
            success_results = [c for c in checks if c.get("passed")]
            failure_results = [c for c in checks if not c.get("passed")]
            critical_failures = [c for c in failure_results if (c.get("severity") or "").upper() == "CRITICAL"]
            warning_failures = [c for c in failure_results if (c.get("severity") or "").upper() != "CRITICAL"]
            reasoning = final.get("reasoning", "")

            # overall_status is COMPUTED from the actual checks, never
            # trusted verbatim from the AI's own top-level claim. A real
            # live test showed the AI report overall_status="SUCCESS" while
            # its own checks array had 2 CRITICAL checks marked passed=false
            # — that would have let a genuinely failing request through as
            # "safe to auto-process" (is_auto_process_safe derives from
            # this). Deriving the verdict from what the checks actually say
            # closes that gap the same way an auditor would double-check a
            # summary against the underlying evidence, not just take it at
            # face value.
            if not checks:
                overall_status = "PARTIAL"
                failure_results = [{
                    "name": "ai_validation_incomplete",
                    "severity": "CRITICAL",
                    "passed": False,
                    "detail": "Agent returned no checks — cannot confirm anything was actually verified.",
                }]
                critical_failures = failure_results
                reasoning = reasoning or "Agent's final answer contained no checks array."
            elif critical_failures:
                overall_status = "FAILED"
            elif warning_failures:
                overall_status = "PARTIAL"
            else:
                overall_status = "SUCCESS"
        else:
            # Agent couldn't confidently complete verification (escalated to
            # human_review itself, hit a budget limit, or its output failed
            # schema validation). PARTIAL is the safe default here — never
            # silently SUCCESS when nothing was actually confirmed. Downstream
            # plan steps (e.g. an agent_task fallback, or a human_review step)
            # already know how to handle overall_status == 'PARTIAL'.
            checks = []
            success_results = []
            failure_results = [{
                "name": "ai_validation_incomplete",
                "severity": "CRITICAL",
                "passed": False,
                "detail": run_result.error or f"Agent did not complete ({run_result.status})",
            }]
            critical_failures = failure_results
            warning_failures = []
            overall_status = "PARTIAL"
            reasoning = run_result.error or f"Validation agent status: {run_result.status}"

        output: Dict[str, Any] = {
            "status": "success",
            "validation_run_id": agent_run_id,
            "overall_status": overall_status,
            "success_results": success_results,
            "failure_results": failure_results,
            "critical_failures": critical_failures,
            "warning_failures": warning_failures,
            "is_auto_process_safe": overall_status == "SUCCESS",
            "reasoning": reasoning,
            "checks_performed_by_ai": checks,
        }

        _update_agent_run_row(
            conn=ctx.db_conn, agent_run_id=agent_run_id, status=run_result.status,
            output_json=run_result.output, error_json={"message": run_result.error} if run_result.error else {},
            usage_json=run_result.usage, duration_ms=self._elapsed_ms(start),
        )

        evidence = {
            "source": "ai_dynamic_validation",
            "agent_run_id": agent_run_id,
            "check_count": len(checks),
            "agent_status": run_result.status,
        }

        trace_ids = {
            "execution_id": ctx.execution_id,
            "correlation_id": ctx.correlation_id,
            "agent_run_id": agent_run_id,
        }

        return self.success(
            step_key=ctx.step_key,
            kind=self.kind,
            output=output,
            evidence=evidence,
            trace_ids=trace_ids,
            duration_ms=self._elapsed_ms(start),
        )