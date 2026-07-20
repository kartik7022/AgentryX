# services/tests/test_intent_classify_executor.py
"""
ORCH-026: unit tests for IntentClassifyExecutor. classify_email /
classify_request and SessionLocal are monkeypatched so no real DB or
LLM call happens — this tests the executor's request-building,
source_type routing, and StepExecutionResult shape, not EIVS's own
classification logic (which has its own tests in the EIVS project).
"""
import uuid
from types import SimpleNamespace

from services.executors.eivs_intent_classify import IntentClassifyExecutor
from services.models.runtime_context import RuntimeContext, StepExecutionInput


class _FakeDB:
    def close(self):
        pass


def _make_ctx(**params):
    return RuntimeContext(
        tenant_id="test-tenant",
        correlation_id="corr-1",
        execution_id=None,
        plan_name="test_plan",
        step_key="classify_email_intent",
        runtime_params=params,
        prior_step_results={},
    )


def test_email_classification_success(monkeypatch):
    fake_run = SimpleNamespace(
        intent_run_id=uuid.uuid4(),
        primary_intent_code="NOC_REQUEST",
        primary_intent_conf=0.91,
        routing_decision="AUTO_PROCESS",
        coverage_status="ALL_CLEAR",
        language_detected="en",
        intents_json=[{"intent_code": "NOC_REQUEST", "confidence": 91, "coverage": "FULL"}],
        routing_reasons_json=[],
        reroute_email=None,
    )

    async def _fake_classify_email(db, **kwargs):
        return fake_run

    monkeypatch.setattr(
        "services.executors.eivs_intent_classify.classify_email", _fake_classify_email
    )
    monkeypatch.setattr(
        "services.executors.eivs_intent_classify.SessionLocal", lambda: _FakeDB()
    )

    ctx = _make_ctx(
        subject="Request for loan closure NOC",
        body="Hi, my loan LN12345 is fully paid off, please send the NOC letter.",
        sender_email="customer@example.com",
    )
    step = {"input_bindings_json": {"source_type": "email"}}
    executor = IntentClassifyExecutor()
    result = executor.execute(StepExecutionInput(context=ctx, step=step))

    assert result.status == "success"
    assert result.output["primary_intent_code"] == "NOC_REQUEST"
    assert result.output["routing_decision"] == "AUTO_PROCESS"
    assert result.evidence["intent_run_id"] == str(fake_run.intent_run_id)


def test_missing_required_email_fields_fails_validation():
    # source_type=email requires subject, body, and sender_email —
    # this ctx only has subject.
    ctx = _make_ctx(subject="only subject, no body or sender")
    step = {"input_bindings_json": {"source_type": "email"}}
    executor = IntentClassifyExecutor()
    result = executor.execute(StepExecutionInput(context=ctx, step=step))

    assert result.status == "failed"
    assert result.error["type"] == "ValidationError"


def test_chat_source_type_routes_to_classify_request(monkeypatch):
    fake_run = SimpleNamespace(
        intent_run_id=uuid.uuid4(),
        primary_intent_code="GENERAL_INQUIRY",
        primary_intent_conf=0.7,
        routing_decision="MANUAL_REVIEW",
        coverage_status="PARTIAL",
        language_detected="en",
        intents_json=[],
        routing_reasons_json=["LOW_CONFIDENCE"],
        reroute_email=None,
    )

    async def _fake_classify_request(db, *, request):
        assert request.source_type == "chat"
        return fake_run

    monkeypatch.setattr(
        "services.executors.eivs_intent_classify.classify_request", _fake_classify_request
    )
    monkeypatch.setattr(
        "services.executors.eivs_intent_classify.SessionLocal", lambda: _FakeDB()
    )

    ctx = _make_ctx(text="Can you help me reset my password?")
    step = {"input_bindings_json": {"source_type": "chat"}}
    executor = IntentClassifyExecutor()
    result = executor.execute(StepExecutionInput(context=ctx, step=step))

    assert result.status == "success"
    assert result.output["primary_intent_code"] == "GENERAL_INQUIRY"