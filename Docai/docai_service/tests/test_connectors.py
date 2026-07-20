from __future__ import annotations

import json
from types import SimpleNamespace
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

import app.main as main
from app.connectors.dispatcher import ConnectorDispatcher
from app.connectors.rag_connector import RAGConnector
from app.connectors.sap_connector import SAPConnector
from app.connectors.salesforce_connector import SalesforceConnector


pytestmark = pytest.mark.anyio


def test_salesforce_connector_not_initialized_when_env_not_set(monkeypatch):
    monkeypatch.delenv("SF_USERNAME", raising=False)
    monkeypatch.delenv("SF_PASSWORD", raising=False)
    monkeypatch.delenv("SF_SECURITY_TOKEN", raising=False)
    monkeypatch.delenv("SF_DOMAIN", raising=False)
    connector = SalesforceConnector()
    assert connector.connector_name == "salesforce"
    assert connector.sf is None
    assert connector.is_configured() is False


def test_sap_connector_not_initialized_when_env_not_set(monkeypatch):
    monkeypatch.delenv("SAP_ODATA_URL", raising=False)
    monkeypatch.delenv("SAP_USERNAME", raising=False)
    monkeypatch.delenv("SAP_PASSWORD", raising=False)
    connector = SAPConnector()
    assert connector.connector_name == "sap"
    assert connector.is_configured() is False


def test_rag_connector_indexes_document(tmp_path):
    connector = RAGConnector(index_dir=str(tmp_path / "rag_index"))
    result = connector.push(
        {
            "fields": {"invoice_number": "INV-2026-001", "total_amount": 45000},
            "content": "Invoice INV-2026-001 for Rs45,000 from ABC Technologies",
        },
        "invoice",
        {"source": "unit-test"},
    )
    assert result["success"] is True
    manifest = tmp_path / "rag_index" / "documents.json"
    assert manifest.exists()
    stored = json.loads(manifest.read_text(encoding="utf-8"))
    assert len(stored) == 1


def test_rag_connector_query_returns_string(tmp_path):
    connector = RAGConnector(index_dir=str(tmp_path / "rag_index"))
    connector.push(
        {
            "fields": {"invoice_number": "INV-2026-001", "total_amount": 45000},
            "content": "Invoice INV-2026-001 for Rs45,000 from ABC Technologies",
        },
        "invoice",
        {"source": "unit-test"},
    )
    answer = connector.query_rag("What is the invoice total?")
    assert isinstance(answer, str)
    assert answer


def test_dispatcher_runs_all_enabled_connectors():
    dispatcher = ConnectorDispatcher()

    class FakeConnector:
        connector_name = "fake"

        def build_result(self, connector, success, external_id="", error=None):
            return {
                "connector": connector,
                "success": success,
                "external_id": external_id,
                "error": error,
                "timestamp": "2026-06-26T00:00:00Z",
            }

        def push(self, parse_result, doc_type_name, metadata):
            return self.build_result(self.connector_name, True, external_id=str(uuid4()))

    dispatcher.connectors = [FakeConnector(), FakeConnector()]
    results = dispatcher.dispatch({"fields": {}}, "invoice", {"user_id": "tester"})
    assert len(results) == 2
    assert all(result["success"] for result in results)


def test_dispatcher_error_does_not_stop_other_connectors():
    dispatcher = ConnectorDispatcher()

    class BadConnector:
        connector_name = "bad"

        def build_result(self, connector, success, external_id="", error=None):
            return {
                "connector": connector,
                "success": success,
                "external_id": external_id,
                "error": error,
                "timestamp": "2026-06-26T00:00:00Z",
            }

        def push(self, parse_result, doc_type_name, metadata):
            raise RuntimeError("boom")

    class GoodConnector(BadConnector):
        connector_name = "good"

        def push(self, parse_result, doc_type_name, metadata):
            return self.build_result(self.connector_name, True, external_id="ok")

    dispatcher.connectors = [BadConnector(), GoodConnector()]
    results = dispatcher.dispatch({"fields": {}}, "invoice", {"user_id": "tester"})
    assert len(results) == 2
    assert results[0]["success"] is False
    assert "boom" in results[0]["error"]
    assert results[1]["success"] is True


@pytest.mark.anyio
async def test_parse_endpoint_includes_connector_results_in_response(monkeypatch):
    original_get_db = main.get_db
    monkeypatch.setattr(main, "connector_dispatcher", SimpleNamespace(dispatch=lambda *args, **kwargs: [
        {
            "connector": "salesforce",
            "success": True,
            "external_id": "sf-123",
            "error": None,
            "timestamp": "2026-06-26T00:00:00Z",
        }
    ]))
    monkeypatch.setattr(main, "route_document", lambda path, doc_type_name=None: {
        "parser": "docling",
        "content": "Invoice INV-2026-001 for Rs45,000 from ABC Technologies",
        "tables": [],
        "metadata": {},
        "confidence": 0.95,
        "error": None,
    })
    monkeypatch.setattr(main, "redact_pii", lambda text: {"redacted_text": text, "entities_found": [], "redaction_count": 0})
    monkeypatch.setattr(main, "redact_pii_from_fields", lambda fields: {**fields, "redaction_summary": {"redacted_keys": [], "redaction_count": 0}})
    monkeypatch.setattr(main, "store_parse_request", lambda *args, **kwargs: SimpleNamespace(id=str(uuid4())))
    monkeypatch.setattr(main, "log_event", lambda *args, **kwargs: str(uuid4()))
    monkeypatch.setattr(main, "registry", SimpleNamespace(get_model=lambda doc_id, db=None: {"doc_type": "invoice"}))
    monkeypatch.setattr(main, "_get_rules_for_doc_type", lambda *args, **kwargs: [])
    monkeypatch.setattr(main, "_get_mappings_for_doc_type", lambda *args, **kwargs: [])
    monkeypatch.setattr(
        main,
        "vector_store",
        SimpleNamespace(lookup=lambda text, threshold=0.75: {"doc_id": "doc-1", "similarity_score": 0.9}),
    )
    main.app.dependency_overrides[original_get_db] = lambda: SimpleNamespace()

    transport = ASGITransport(app=main.app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/parse/",
                params={"doc_id": "doc-1"},
                files={"file": ("invoice.pdf", b"%PDF-1.4 sample", "application/pdf")},
            )
    finally:
        main.app.dependency_overrides.clear()
    body = response.json()
    assert response.status_code == 200
    assert "connector_results" in body
    assert isinstance(body["connector_results"], list)
    assert body["connector_results"][0]["connector"] == "salesforce"
