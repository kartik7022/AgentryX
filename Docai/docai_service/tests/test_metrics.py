from __future__ import annotations

import re
from types import SimpleNamespace
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

import app.main as main


pytestmark = pytest.mark.anyio


def _metric_value(metrics_text: str, metric_prefix: str, labels: dict[str, str]) -> float:
    pattern = re.compile(rf"^{re.escape(metric_prefix)}(?:\{{([^}}]+)\}})?\s+([0-9\.eE+-]+)$", re.MULTILINE)
    for match in pattern.finditer(metrics_text):
        label_block = match.group(1) or ""
        pairs = {}
        if label_block:
            for item in label_block.split(","):
                key, value = item.split("=", 1)
                pairs[key.strip()] = value.strip('"')
        if all(pairs.get(key) == value for key, value in labels.items()):
            return float(match.group(2))
    raise AssertionError(f"Metric {metric_prefix} with labels {labels} not found")


@pytest.fixture
def fake_db():
    class Query:
        def __init__(self, rows=None):
            self.rows = rows or []
            self.expr = None

        def filter(self, expr):
            self.expr = expr
            return self

        def order_by(self, *args, **kwargs):
            return self

        def limit(self, n):
            return self

        def all(self):
            return self.rows

        def first(self):
            return self.rows[0] if self.rows else None

        def count(self):
            return len(self.rows)

    class FakeSession:
        def __init__(self):
            self.document_types = [
                SimpleNamespace(
                    id=str(uuid4()),
                    doc_type_name="invoice",
                    schema_definition={},
                    confidence_threshold=0.8,
                    created_at=None,
                    updated_at=None,
                )
            ]
            self.parse_requests = []
            self.added = []

        def query(self, model):
            name = getattr(model, "__name__", "")
            if name == "DocumentType":
                return Query(self.document_types)
            if name == "ParseRequest":
                return Query(self.parse_requests)
            if name == "AuditLog":
                return Query([])
            return Query([])

        def add(self, obj):
            self.added.append(obj)

        def commit(self):
            return None

        def refresh(self, obj):
            return None

        def close(self):
            return None

        def execute(self, stmt):
            return SimpleNamespace()

    return FakeSession()


@pytest.fixture
def metrics_env(monkeypatch, fake_db):
    monkeypatch.setattr(
        main,
        "vector_store",
        SimpleNamespace(
            embed=lambda text: [0.0] * 384,
            lookup=lambda text, threshold=0.75: {"doc_id": "doc-123", "similarity_score": 0.9},
        ),
    )
    monkeypatch.setattr(main, "ml_registry", SimpleNamespace(register_model=lambda *args, **kwargs: "run-1"))
    monkeypatch.setattr(main, "registry", SimpleNamespace(get_model=lambda doc_id, db=None: {"doc_type": "invoice"}))
    monkeypatch.setattr(main, "route_document", lambda path, doc_type_name=None: {"parser": "docling", "content": "Invoice INV-2026-001 for Rs45,000 from ABC Technologies", "tables": [], "metadata": {}, "confidence": 0.91, "error": None})
    monkeypatch.setattr(main, "redact_pii", lambda text: {"redacted_text": text, "entities_found": [], "redaction_count": 0})
    monkeypatch.setattr(main, "redact_pii_from_fields", lambda fields: {**fields, "redaction_summary": {"redacted_keys": [], "redaction_count": 0}})
    monkeypatch.setattr(main.IntentClassificationRequest, "classify_intent", staticmethod(lambda content, source_type: {"source_type": source_type, "detected_intent": "extraction", "confidence": 0.9}))
    main.app.dependency_overrides[main.get_db] = lambda: fake_db
    yield fake_db
    main.app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_metrics_endpoint_returns_200(metrics_env):
    transport = ASGITransport(app=main.app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/metrics")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/plain")


@pytest.mark.anyio
async def test_metrics_contains_docai_requests_total(metrics_env):
    transport = ASGITransport(app=main.app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/metrics")
    assert "docai_requests_total" in response.text


@pytest.mark.anyio
async def test_upload_increments_request_counter(metrics_env):
    transport = ASGITransport(app=main.app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        before = await client.get("/metrics")
        before_value = _metric_value(
            before.text,
            "docai_requests_total",
            {"endpoint": "/upload/", "method": "POST", "status_code": "200"},
        ) if 'endpoint="/upload/"' in before.text else 0.0
        await client.post("/upload/", files={"file": ("sample.txt", b"hello", "text/plain")})
        after = await client.get("/metrics")
    after_value = _metric_value(
        after.text,
        "docai_requests_total",
        {"endpoint": "/upload/", "method": "POST", "status_code": "200"},
    )
    assert after_value >= before_value + 1


@pytest.mark.anyio
async def test_parse_failure_increments_failure_counter(metrics_env, monkeypatch):
    monkeypatch.setattr(main.registry, "get_model", lambda doc_id, db=None: None)
    transport = ASGITransport(app=main.app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        before = await client.get("/metrics")
        try:
            before_value = _metric_value(
                before.text,
                "docai_parse_total",
                {"doc_type_name": "unknown", "parser_used": "unknown", "status": "failure"},
            )
        except AssertionError:
            before_value = 0.0
        response = await client.post(
            "/parse/",
            params={"doc_id": "missing"},
            files={"file": ("sample.pdf", b"%PDF-1.4", "application/pdf")},
        )
        after = await client.get("/metrics")
    assert response.status_code == 404
    after_value = _metric_value(
        after.text,
        "docai_parse_total",
        {"doc_type_name": "unknown", "parser_used": "unknown", "status": "failure"},
    )
    assert after_value >= before_value + 1
