# services/tests/test_loan_noc_email_processing_e2e.py
"""
ORCH-028: integration test for the actual EIVS-integrated
loan_noc_email_processing plan (seeded by schema.sql's ORCH-032 block),
end-to-end through POST /v1/orchestrations/run.

Requires a real, reachable DATABASE_URL (docker-compose up db) since
services.main runs schema.sql at import time and the seeded plan lives
in the real orchestration.plans / plan_steps tables.

The four steps that would otherwise call out to Groq / the Adapter
service / a real webhook receiver are monkeypatched at the executor
level, exactly like the existing customer_360_collections test does
for sql/rest/ai_transform — this test is about proving the DAG wiring
and data flow between EIVS steps and the rest of the plan, not about
re-testing EIVS's own classification logic (which has its own tests).

NOTE: this test requires the schema.sql fix that removes the bogus
".output" segment from validate_customer_and_loan's condition_expr
(results.route_policy.output.routing_decision -> results.route_policy.
routing_decision) — as originally committed, that condition always
evaluated to False (ctx.results['route_policy'] has no 'output' key),
so validate_customer_and_loan, generate_customer_response, and
send_to_n8n_or_webhook never actually ran.
"""
import os
os.environ.setdefault(
    "DATABASE_URL", "postgresql://orchestration:orchestration@localhost:5432/orchestration"
)

import pytest

from services.executors import (
    eivs_intent_classify,
    eivs_policy_route,
    eivs_intent_validate,
    ai_transform_executor,
    webhook_executor,
)
from services.models.runtime_context import StepExecutionResult


@pytest.fixture
def patched_loan_noc_executors(monkeypatch):
    def fake_classify_execute(self, step_input):
        ctx = step_input.context
        return StepExecutionResult(
            step_key=ctx.step_key, kind="intent_classify", status="success",
            output={
                "status": "success",
                "primary_intent_code": "NOC_REQUEST",
                "primary_intent_conf": 0.93,
                "routing_decision": "AUTO_PROCESS",
                "coverage_status": "ALL_CLEAR",
                "language_detected": "en",
                "intents": [{"intent_code": "NOC_REQUEST", "confidence": 93, "coverage": "FULL"}],
                "routing_reasons": [],
                "reroute_email": None,
            },
            evidence={"source": "eivs.email_intent_runs", "intent_run_id": "test-run-1"},
        )

    def fake_route_execute(self, step_input):
        ctx = step_input.context
        return StepExecutionResult(
            step_key=ctx.step_key, kind="policy_route", status="success",
            output={
                "status": "success",
                "routing_decision": "AUTO_PROCESS",
                "primary_intent_code": "NOC_REQUEST",
                "primary_intent_conf": 0.93,
                "coverage_status": "ALL_CLEAR",
                "routing_reasons": [],
                "reroute_email": None,
            },
        )

    def fake_validate_execute(self, step_input):
        ctx = step_input.context
        return StepExecutionResult(
            step_key=ctx.step_key, kind="intent_validate", status="success",
            output={
                "validation_run_id": "test-validation-1",
                "overall_status": "PASS",
                "success_results": [
                    {"rule_code": "sender_email_match"},
                    {"rule_code": "loan_account_exists"},
                    {"rule_code": "loan_status_closed"},
                ],
                "failure_results": [],
                "critical_failures": [],
                "warning_failures": [],
                "is_auto_process_safe": True,
            },
        )

    def fake_ai_execute(self, step, ctx):
        return {"subject": "Your loan NOC is ready", "body": "Please find your NOC letter attached."}

    def fake_webhook_execute(self, step_input):
        ctx = step_input.context
        return StepExecutionResult(
            step_key=ctx.step_key, kind="webhook", status="success",
            output={"status": "success", "webhook_call_id": "test-webhook-1",
                    "url": "http://n8n:5678/webhook/loan-noc-outcome",
                    "method": "POST", "status_code": 200, "response_body": {"ok": True}},
        )

    monkeypatch.setattr(eivs_intent_classify.IntentClassifyExecutor, "execute", fake_classify_execute)
    monkeypatch.setattr(eivs_policy_route.PolicyRouteExecutor, "execute", fake_route_execute)
    monkeypatch.setattr(eivs_intent_validate.IntentValidateExecutor, "execute", fake_validate_execute)
    monkeypatch.setattr(ai_transform_executor.AiTransformExecutor, "execute", fake_ai_execute)
    monkeypatch.setattr(webhook_executor.WebhookExecutor, "execute", fake_webhook_execute)
    yield


def test_loan_noc_email_processing_end_to_end(client, patched_loan_noc_executors):
    body = {
        "plan_name": "loan_noc_email_processing",
        "entity_type": "email",
        "tenant_id": "demo",
        "params": {
            "subject": "Request for loan closure NOC",
            "body": "Hi, my loan LN12345 is fully paid off, please send the NOC letter.",
            "sender_email": "customer@example.com",
            "loan_account_number": "LN12345",
        },
    }

    resp = client.post("/v1/orchestrations/run", json=body)
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert data["plan_name"] == "loan_noc_email_processing"
    assert data["entity_type"] == "email"
    assert data["status"] in ("success", "partial")

    results = data["results"]
    assert "classify_email_intent" in results
    assert results["classify_email_intent"]["routing_decision"] == "AUTO_PROCESS"

    assert "route_policy" in results
    assert results["route_policy"]["routing_decision"] == "AUTO_PROCESS"

    # validate_customer_and_loan is conditional on route_policy's
    # routing_decision — only runs once the schema.sql condition_expr fix
    # is applied.
    assert "validate_customer_and_loan" in results
    assert results["validate_customer_and_loan"]["overall_status"] == "PASS"

    assert "generate_customer_response" in results
    assert results["generate_customer_response"]["subject"]

    assert "send_to_n8n_or_webhook" in results
    assert results["send_to_n8n_or_webhook"]["status_code"] == 200

    # /v1/orchestrations/run (unlike the older /v1/360) writes a per-step
    # trace to orchestration.execution_steps.
    steps_resp = client.get(f"/v1/orchestrations/runs/{data['execution_id']}/steps")
    assert steps_resp.status_code == 200
    step_keys = {s["step_key"] for s in steps_resp.json()}
    assert step_keys == {
        "classify_email_intent", "route_policy", "validate_customer_and_loan",
        "generate_customer_response", "send_to_n8n_or_webhook",
    }