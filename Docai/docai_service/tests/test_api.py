from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4, UUID

import pytest
from httpx import ASGITransport, AsyncClient

from app import main


pytestmark = pytest.mark.anyio


SEED_DOC_TYPES = [
    "invoice",
    "resume",
    "insurance_claim",
    "shipping_note",
    "contract",
    "bank_statement",
    "medical_record",
    "purchase_order",
    "scientific_paper",
    "passport_scan",
    "email",
    "chat",
    "api_event",
    "support_ticket",
    "policy_document",
    "patient_record",
]


@dataclass
class FakeSession:
    executed: list[str]

    def add(self, obj):
        if getattr(obj, "id", None) is None:
            obj.id = str(uuid4())
        if getattr(obj, "created_at", None) is None:
            obj.created_at = datetime.now(timezone.utc)
        if obj.__class__.__name__ == "ParseCorrection":
            _SEED_QUERY_STATE.setdefault("corrections", []).append(obj)

    def commit(self):
        return None

    def refresh(self, obj):
        if getattr(obj, "id", None) is None:
            obj.id = str(uuid4())
        if getattr(obj, "created_at", None) is None:
            obj.created_at = datetime.now(timezone.utc)

    def execute(self, statement):
        self.executed.append(str(statement))
        return SimpleNamespace(scalar=lambda: 1)

    def query(self, model):
        rows = []
        if model.__name__ == "DocumentType":
            rows = list(_SEED_QUERY_STATE.get("doc_types", {}).values())
        elif model.__name__ == "ParseRequest":
            rows = _SEED_QUERY_STATE.get("parse_requests", [])
        elif model.__name__ == "ParseCorrection":
            rows = _SEED_QUERY_STATE.get("corrections", [])
        return FakeQuery(rows, model)

    def close(self):
        return None


class FakeQuery:
    def __init__(self, rows, model):
        self.rows = rows
        self.model = model
        self.exprs = []
        self.limit_value = None

    def filter(self, *exprs):
        self.exprs.extend(exprs)
        return self

    def order_by(self, *args, **kwargs):
        return self

    def limit(self, value):
        self.limit_value = value
        return self

    def all(self):
        rows = list(self.rows)
        for expr in self.exprs:
            column = getattr(getattr(expr, "left", None), "name", None)
            value = getattr(getattr(expr, "right", None), "value", None)
            if column is None:
                continue
            rows = [
                row
                for row in rows
                if str(row.get(column) if isinstance(row, dict) else getattr(row, column, "")) == str(value)
            ]
        if self.limit_value is not None:
            rows = rows[: self.limit_value]
        return [SimpleNamespace(**row) if isinstance(row, dict) else row for row in rows]

    def first(self):
        rows = self.all()
        return rows[0] if rows else None


_SEED_QUERY_STATE = {}


def _seed_state():
    seeded = {}
    for name in SEED_DOC_TYPES:
        seeded[name] = {
            "id": str(uuid4()),
            "doc_type_name": name,
            "schema_definition": {"name": "string"},
            "confidence_threshold": 0.8,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }
    return {
        "doc_types": seeded,
        "models": {},
        "templates": [],
        "parse_requests": [],
        "corrections": [],
        "audits": [],
        "audit_counter": 0,
    }


class FakeRegistry:
    def __init__(self, state):
        self.state = state
        self.registry = {}

    def register(self, doc_type, model_info, doc_type_id=None, db=None):
        doc_id = str(uuid4())
        self.registry[doc_id] = {"doc_type": doc_type, "model": {**model_info, "doc_type_id": doc_type_id}}
        self.state["models"][doc_id] = self.registry[doc_id]
        return doc_id

    def get_model(self, doc_id, db=None):
        return self.registry.get(doc_id) or self.state["models"].get(doc_id)

    def list_models(self, db=None):
        return [
            {"doc_id": doc_id, **model["model"]}
            for doc_id, model in self.state["models"].items()
        ]


class FakeVectorStore:
    def __init__(self, state):
        self.state = state

    def register_template(self, doc_id, sample_text, doc_type_id=None, db=None):
        template_id = str(uuid4())
        self.state["templates"].append(
            {
                "id": template_id,
                "doc_id": doc_id,
                "doc_type_id": str(doc_type_id) if doc_type_id else None,
                "sample_text": sample_text,
            }
        )
        return template_id

    def lookup(self, text, threshold=0.75):
        query_tokens = {
            token
            for token in text.lower().replace("-", " ").replace("#", " ").split()
            if len(token) > 2
        }
        best_match = None
        best_score = 0.0
        for template in self.state["templates"]:
            sample_tokens = {
                token
                for token in template["sample_text"].lower().replace("-", " ").replace("#", " ").split()
                if len(token) > 2
            }
            if not sample_tokens:
                continue
            overlap = len(query_tokens & sample_tokens)
            if overlap >= 3:
                score = 0.9
            elif overlap == 2:
                score = 0.8
            else:
                score = overlap / max(len(sample_tokens), 1)
            if score > best_score:
                best_match = template
                best_score = score
        if best_match and best_score >= threshold:
            return {"doc_id": best_match["doc_id"], "similarity_score": round(best_score, 4)}
        return None


def _serialize_doc_type(row):
    return {
        "id": row["id"],
        "doc_type_name": row["doc_type_name"],
        "schema_definition": row["schema_definition"],
        "confidence_threshold": row["confidence_threshold"],
        "created_at": row["created_at"].isoformat(),
        "updated_at": row["updated_at"].isoformat(),
    }


@pytest.fixture
def api_env(monkeypatch):
    state = _seed_state()
    global _SEED_QUERY_STATE
    _SEED_QUERY_STATE = state
    fake_session = FakeSession(executed=[])

    def upsert_document_type(db, request):
        row = state["doc_types"].get(request.doc_type_name)
        if row is None:
            row = {
                "id": str(uuid4()),
                "doc_type_name": request.doc_type_name,
                "schema_definition": request.schema_definition,
                "confidence_threshold": request.confidence_threshold,
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc),
            }
            state["doc_types"][request.doc_type_name] = row
        else:
            row["schema_definition"] = request.schema_definition
            row["confidence_threshold"] = request.confidence_threshold
            row["updated_at"] = datetime.now(timezone.utc)
        return SimpleNamespace(**row)

    def get_document_type_by_id(db, doc_type_id):
        for row in state["doc_types"].values():
            if row["id"] == doc_type_id:
                return _serialize_doc_type(row)
        return None

    def list_document_types(db):
        return [_serialize_doc_type(row) for row in state["doc_types"].values()]

    def list_parse_history(db, limit=50):
        return state["parse_requests"][-limit:][::-1]

    def store_parse_request(
        db,
        *,
        doc_id,
        file_name,
        parser_used,
        confidence_score,
        extracted_fields,
        pii_redacted,
        status,
        user_id=None,
    ):
        row = {
            "id": str(uuid4()),
            "doc_id": doc_id,
            "file_name": file_name,
            "parser_used": parser_used,
            "confidence_score": confidence_score,
            "extracted_fields": extracted_fields,
            "pii_redacted": pii_redacted,
            "status": status,
            "user_id": user_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        state["parse_requests"].append(row)
        return SimpleNamespace(**row)

    def write_audit_log(
        db,
        event_type,
        doc_id,
        user_id=None,
        status="success",
        details=None,
        parse_request_id=None,
    ):
        audit_id = str(uuid4())
        state["audits"].append(
            {
                "id": audit_id,
                "event_type": event_type,
                "doc_id": doc_id,
                "status": status,
                "details": details or {},
                "parse_request_id": str(parse_request_id) if parse_request_id else None,
            }
        )
        return audit_id

    def fake_route_document(file_path, doc_type_name=None):
        suffix = file_path.lower().rsplit(".", 1)[-1]
        if suffix == "pdf":
            return {
                "parser": "docling",
                "content": "Invoice INV-2026-001 for Rs45,000 from ABC Technologies",
                "tables": [{"rows": 1}],
                "metadata": {},
                "confidence": 0.94,
                "error": None,
            }
        if suffix == "png":
            return {
                "parser": "ocr",
                "content": "Passport scan for Vinod Kumar, expiry 2027-05-01",
                "tables": [],
                "metadata": {},
                "confidence": 0.72,
                "error": None,
            }
        if suffix in {"docx", "doc", "pptx", "html"}:
            return {
                "parser": "unstructured",
                "content": "Purchase order PO #4521 pending approval from finance team",
                "tables": [],
                "metadata": {},
                "confidence": 0.81,
                "error": None,
            }
        return {
            "parser": "unstructured",
            "content": "Generic content",
            "tables": [],
            "metadata": {},
            "confidence": 0.5,
            "error": None,
        }

    def fake_redact_pii(text, metadata=None):
        return text, False

    def fake_classify_intent(content, source_type, payload=None):
        return {
            "source_type": source_type,
            "detected_intent": "extraction",
            "confidence": 0.91,
            "content": content,
            "payload": payload or {},
        }

    monkeypatch.setattr(main, "registry", FakeRegistry(state))
    monkeypatch.setattr(main.ml_registry, "register_model", lambda doc_id, doc_type_name, model_info: "run-123")
    monkeypatch.setattr(main, "vector_store", FakeVectorStore(state))
    monkeypatch.setattr(main, "upsert_document_type", upsert_document_type)
    monkeypatch.setattr(main, "get_document_type_by_id", get_document_type_by_id)
    monkeypatch.setattr(main, "list_document_types", list_document_types)
    monkeypatch.setattr(main, "list_parse_history", list_parse_history)
    monkeypatch.setattr(main, "store_parse_request", store_parse_request)
    monkeypatch.setattr(main, "log_event", write_audit_log)
    monkeypatch.setattr(main, "route_document", fake_route_document)
    monkeypatch.setattr(main, "redact_pii", fake_redact_pii)
    monkeypatch.setattr(main.IntentClassificationRequest, "classify_intent", staticmethod(fake_classify_intent))

    main.app.dependency_overrides[main.get_db] = lambda: fake_session

    yield {"state": state, "session": fake_session}

    main.app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_health_returns_ok(api_env):
    transport = ASGITransport(app=main.app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health/")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "db": "connected", "version": "1.0.0"}


@pytest.mark.anyio
async def test_upload_file_returns_upload_response(api_env):
    transport = ASGITransport(app=main.app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/upload/",
            files={"file": ("sample.txt", b"hello world", "text/plain")},
        )
    payload = response.json()
    assert response.status_code == 200
    assert payload["filename"] == "sample.txt"
    assert payload["parser_used"] == "unstructured"
    assert isinstance(payload["content_preview"], str)
    assert isinstance(payload["tables_found"], int)


@pytest.mark.anyio
async def test_schema_suggest_generates_invoice_schema(api_env, monkeypatch):
    def invoice_route_document(file_path, doc_type_name=None):
        return {
            "parser": "docling",
            "content": (
                "Invoice Number: INV-2026-001\n"
                "Date: 2026-06-22\n"
                "Vendor Name: ABC Technologies\n"
                "Total Amount: 45,000\n"
                "Email: billing@example.com"
            ),
            "tables": [],
            "metadata": {},
            "confidence": 0.94,
            "error": None,
        }

    monkeypatch.setattr(main, "route_document", invoice_route_document)
    transport = ASGITransport(app=main.app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/schema-suggest/",
            files={"file": ("invoice.pdf", b"%PDF-1.4 sample", "application/pdf")},
        )

    body = response.json()
    assert response.status_code == 200
    assert body["parser_used"] == "docling"
    assert body["schema_definition"]["invoice_number"] == "string"
    assert body["schema_definition"]["total_amount"] == "number"
    assert body["schema_definition"]["vendor_name"] == "string"
    assert body["field_count"] >= 4
    assert any(field["field_name"] == "email" for field in body["suggested_fields"])


@pytest.mark.anyio
async def test_schema_suggest_handles_complex_insurance_claim(api_env, monkeypatch):
    def claim_route_document(file_path, doc_type_name=None):
        return {
            "parser": "ocr",
            "content": (
                "Motor Insurance Claim Form\n"
                "Insurer Name: Universal Sompo General Insurance\n"
                "Claim Number: CLM-77881\n"
                "Policy Number: POL-9001\n"
                "Estimated Loss: Rs 120,000\n"
                "Accident Date: 02/07/2026\n"
                "Patient SSN 123-45-6789"
            ),
            "tables": [],
            "metadata": {},
            "confidence": 0.82,
            "error": None,
        }

    monkeypatch.setattr(main, "route_document", claim_route_document)
    transport = ASGITransport(app=main.app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/schema-suggest/",
            files={"file": ("claim.png", b"fake image", "image/png")},
        )

    body = response.json()
    schema = body["schema_definition"]
    assert response.status_code == 200
    assert schema["claim_number"] == "string"
    assert schema["policy_number"] == "string"
    assert schema["estimated_loss"] == "number"
    assert schema["accident_date"] == "string"
    assert schema["ssn"] == "string"


@pytest.mark.anyio
async def test_schema_suggest_finds_unlabeled_patterns(api_env, monkeypatch):
    def messy_route_document(file_path, doc_type_name=None):
        return {
            "parser": "unstructured",
            "content": "Please process PO #PO-4521 for total amount INR 88,000. Contact ops@example.com or 555-123-4567.",
            "tables": [],
            "metadata": {},
            "confidence": 0.74,
            "error": None,
        }

    monkeypatch.setattr(main, "route_document", messy_route_document)
    transport = ASGITransport(app=main.app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/schema-suggest/",
            files={"file": ("purchase_order.docx", b"docx bytes", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
        )

    body = response.json()
    schema = body["schema_definition"]
    assert response.status_code == 200
    assert schema["purchase_order_number"] == "string"
    assert schema["total_amount"] == "number"
    assert schema["email"] == "string"
    assert schema["phone"] == "string"


@pytest.mark.anyio
async def test_train_returns_doc_id_uuid(api_env):
    transport = ASGITransport(app=main.app)
    payload = {
        "doc_type_name": "custom_invoice",
        "sample_text": "Invoice INV-2026-001 for Rs45,000 from ABC Technologies",
        "schema_definition": {"invoice_number": "string", "total_amount": "number"},
        "confidence_threshold": 0.85,
    }
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/train/", json=payload)
    body = response.json()
    assert response.status_code == 200
    UUID(body["doc_id"])
    assert body["doc_type_name"] == "custom_invoice"
    assert body["status"] == "trained"


@pytest.mark.anyio
async def test_train_registers_multiple_template_samples(api_env):
    transport = ASGITransport(app=main.app)
    payload = {
        "doc_type_name": "multi_layout_invoice",
        "sample_text": "Invoice INV-2026-001 for Rs45,000 from ABC Technologies",
        "sample_texts": [
            "Tax invoice number TI-991 total due 88000 supplier Delta Systems",
            "Invoice INV-2026-001 for Rs45,000 from ABC Technologies",
            "   ",
        ],
        "schema_definition": {"invoice_number": "string", "total_amount": "number"},
        "confidence_threshold": 0.85,
    }
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/train/", json=payload)

    body = response.json()
    assert response.status_code == 200
    assert body["template_count"] == 2
    templates = [
        template
        for template in api_env["state"]["templates"]
        if template["doc_id"] == body["doc_id"]
    ]
    assert len(templates) == 2
    assert all(template["doc_type_id"] for template in templates)


@pytest.mark.anyio
async def test_train_same_doc_type_twice_upserts_not_duplicates(api_env):
    transport = ASGITransport(app=main.app)
    payload = {
        "doc_type_name": "invoice",
        "sample_text": "Invoice INV-2026-001 for Rs45,000 from ABC Technologies",
        "schema_definition": {"invoice_number": "string", "total_amount": "number"},
        "confidence_threshold": 0.81,
    }
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        first = await client.post("/train/", json=payload)
        second = await client.post("/train/", json=payload)
        doc_types = await client.get("/doc-types/")
    assert first.status_code == 200
    assert second.status_code == 200
    names = [item["doc_type_name"] for item in doc_types.json()]
    assert names.count("invoice") == 1


@pytest.mark.anyio
async def test_parse_valid_doc_id_returns_json_matching_contract(api_env):
    transport = ASGITransport(app=main.app)
    train_payload = {
        "doc_type_name": "invoice",
        "sample_text": "Invoice Number: INV-2026-001\nDate: 2026-06-22\nTotal Amount: 45000\nVendor: ABC Technologies",
        "schema_definition": {"invoice_number": "string", "total_amount": "number"},
        "confidence_threshold": 0.85,
    }
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        train_response = await client.post("/train/", json=train_payload)
        doc_id = train_response.json()["doc_id"]
        original_extract = main._extract_fields

        def fake_extract_fields(content, doc_type_name=None):
            return {"invoice_number": "INV-2026-001", "total_amount": 45000}

        main._extract_fields = fake_extract_fields
        try:
            parse_response = await client.post(
                "/parse/",
                params={"doc_id": doc_id},
                files={"file": ("invoice.pdf", b"%PDF-1.4 sample", "application/pdf")},
            )
        finally:
            main._extract_fields = original_extract
    body = parse_response.json()
    assert parse_response.status_code == 200
    assert body["document_id"] == doc_id
    assert isinstance(body["fields"], dict)
    assert isinstance(body["confidence"], float)
    assert isinstance(body["audit_id"], str)
    assert {"document_id", "fields", "confidence", "audit_id", "validation"}.issubset(body.keys())
    assert body["validation"]["valid"] is True


@pytest.mark.anyio
async def test_parse_matches_second_training_sample_variant(api_env, monkeypatch):
    monkeypatch.setenv("DOCUMENT_CLASSIFICATION_THRESHOLD", "0.75")
    transport = ASGITransport(app=main.app)
    train_payload = {
        "doc_type_name": "invoice",
        "sample_text": "Invoice INV 2026 001 Total Amount 45000 Vendor ABC Technologies",
        "sample_texts": [
            "Tax invoice TI 991 total due 88000 supplier Delta Systems remit immediately",
            "Statement of unrelated text that should not be selected",
        ],
        "schema_definition": {"invoice_number": "string", "total_amount": "number"},
        "confidence_threshold": 0.85,
    }

    def alternate_invoice_route(file_path, doc_type_name=None):
        return {
            "parser": "docling",
            "content": "Tax invoice TI 991 total due 88000 supplier Delta Systems remit immediately",
            "tables": [],
            "metadata": {},
            "confidence": 0.92,
            "error": None,
        }

    monkeypatch.setattr(main, "route_document", alternate_invoice_route)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        train_response = await client.post("/train/", json=train_payload)
        doc_id = train_response.json()["doc_id"]
        parse_response = await client.post(
            "/parse/",
            params={"doc_id": doc_id},
            files={"file": ("tax-invoice.pdf", b"%PDF-1.4 sample", "application/pdf")},
        )

    body = parse_response.json()
    assert parse_response.status_code == 200
    assert body["document_id"] == doc_id


@pytest.mark.anyio
async def test_parse_validation_reports_missing_and_extra_fields(api_env):
    transport = ASGITransport(app=main.app)
    train_payload = {
        "doc_type_name": "invoice",
        "sample_text": "Invoice INV-2026-001 for Rs45,000 from ABC Technologies",
        "schema_definition": {
            "invoice_number": "string",
            "total_amount": "number",
            "vendor_name": "string",
        },
        "confidence_threshold": 0.85,
    }

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        train_response = await client.post("/train/", json=train_payload)
        doc_id = train_response.json()["doc_id"]

        original_extract = main._extract_fields

        def fake_extract_fields(content, doc_type_name=None):
            return {
                "invoice_number": "INV-2026-001",
                "total_amount": "45000",
                "unexpected_field": "extra",
            }

        main._extract_fields = fake_extract_fields
        try:
            parse_response = await client.post(
                "/parse/",
                params={"doc_id": doc_id},
                files={"file": ("invoice.pdf", b"%PDF-1.4 sample", "application/pdf")},
            )
        finally:
            main._extract_fields = original_extract

    body = parse_response.json()
    assert parse_response.status_code == 200
    assert body["validation"]["valid"] is False
    assert "vendor_name" in body["validation"]["missing_fields"]
    assert "unexpected_field" in body["validation"]["extra_fields"]
    assert any(item["field"] == "total_amount" for item in body["validation"]["type_errors"])


@pytest.mark.anyio
async def test_parse_invalid_doc_id_returns_error(api_env):
    transport = ASGITransport(app=main.app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/parse/",
            params={"doc_id": str(uuid4())},
            files={"file": ("invoice.pdf", b"%PDF-1.4 sample", "application/pdf")},
        )
    assert response.status_code == 404
    assert response.json() == {"error": "Invalid doc_id"}


@pytest.mark.anyio
async def test_parse_rejects_unknown_document_type(api_env, monkeypatch):
    monkeypatch.setenv("DOCUMENT_CLASSIFICATION_THRESHOLD", "0.75")
    transport = ASGITransport(app=main.app)
    train_payload = {
        "doc_type_name": "invoice",
        "sample_text": "Invoice Number INV 2026 001 Total Amount 45000 Vendor ABC Technologies",
        "schema_definition": {"invoice_number": "string", "total_amount": "number"},
        "confidence_threshold": 0.85,
    }

    def unrelated_route_document(file_path, doc_type_name=None):
        return {
            "parser": "docling",
            "content": "University transcript semester GPA course credits academic dean approval",
            "tables": [],
            "metadata": {},
            "confidence": 0.91,
            "error": None,
        }

    monkeypatch.setattr(main, "route_document", unrelated_route_document)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        train_response = await client.post("/train/", json=train_payload)
        doc_id = train_response.json()["doc_id"]
        parse_response = await client.post(
            "/parse/",
            params={"doc_id": doc_id},
            files={"file": ("transcript.pdf", b"%PDF-1.4 sample", "application/pdf")},
        )

    body = parse_response.json()
    assert parse_response.status_code == 422
    assert body["error"] == "unknown_document_type"
    assert any(row["status"] == "rejected" for row in api_env["state"]["audits"])


@pytest.mark.anyio
async def test_parse_rejects_document_type_mismatch(api_env, monkeypatch):
    monkeypatch.setenv("DOCUMENT_CLASSIFICATION_THRESHOLD", "0.75")
    transport = ASGITransport(app=main.app)
    invoice_payload = {
        "doc_type_name": "invoice",
        "sample_text": "Invoice Number INV 2026 001 Total Amount 45000 Vendor ABC Technologies",
        "schema_definition": {"invoice_number": "string", "total_amount": "number"},
        "confidence_threshold": 0.85,
    }
    resume_payload = {
        "doc_type_name": "resume",
        "sample_text": "Resume candidate skills Python FastAPI machine learning work experience",
        "schema_definition": {"candidate_name": "string", "skills": "array"},
        "confidence_threshold": 0.8,
    }

    def resume_route_document(file_path, doc_type_name=None):
        return {
            "parser": "docling",
            "content": "Resume candidate skills Python FastAPI machine learning work experience",
            "tables": [],
            "metadata": {},
            "confidence": 0.91,
            "error": None,
        }

    monkeypatch.setattr(main, "route_document", resume_route_document)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        invoice_response = await client.post("/train/", json=invoice_payload)
        resume_response = await client.post("/train/", json=resume_payload)
        invoice_doc_id = invoice_response.json()["doc_id"]
        resume_doc_id = resume_response.json()["doc_id"]
        parse_response = await client.post(
            "/parse/",
            params={"doc_id": invoice_doc_id},
            files={"file": ("resume.pdf", b"%PDF-1.4 sample", "application/pdf")},
        )

    body = parse_response.json()
    assert parse_response.status_code == 409
    assert body["error"] == "document_type_mismatch"
    assert body["expected_doc_id"] == invoice_doc_id
    assert body["detected_doc_id"] == resume_doc_id


@pytest.mark.anyio
async def test_parse_rejects_unreadable_document(api_env, monkeypatch):
    transport = ASGITransport(app=main.app)
    train_payload = {
        "doc_type_name": "invoice",
        "sample_text": "Invoice Number INV 2026 001 Total Amount 45000 Vendor ABC Technologies",
        "schema_definition": {"invoice_number": "string", "total_amount": "number"},
        "confidence_threshold": 0.85,
    }

    def empty_route_document(file_path, doc_type_name=None):
        return {
            "parser": "ocr",
            "content": "   ",
            "tables": [],
            "metadata": {},
            "confidence": 0.1,
            "error": None,
        }

    monkeypatch.setattr(main, "route_document", empty_route_document)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        train_response = await client.post("/train/", json=train_payload)
        doc_id = train_response.json()["doc_id"]
        parse_response = await client.post(
            "/parse/",
            params={"doc_id": doc_id},
            files={"file": ("blank.png", b"fake image", "image/png")},
        )

    body = parse_response.json()
    assert parse_response.status_code == 422
    assert body["error"] == "unreadable_document"


@pytest.mark.anyio
async def test_list_doc_types_returns_seeded_types(api_env):
    transport = ASGITransport(app=main.app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/doc-types/")
    body = response.json()
    assert response.status_code == 200
    assert len(body) >= 10
    assert any(row["doc_type_name"] == "invoice" for row in body)


@pytest.mark.anyio
async def test_parse_history_returns_list(api_env):
    transport = ASGITransport(app=main.app)
    train_payload = {
        "doc_type_name": "invoice",
        "sample_text": "Invoice INV-2026-001 for Rs45,000 from ABC Technologies",
        "schema_definition": {"invoice_number": "string", "total_amount": "number"},
        "confidence_threshold": 0.85,
    }
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        train_response = await client.post("/train/", json=train_payload)
        doc_id = train_response.json()["doc_id"]
        await client.post(
            "/parse/",
            params={"doc_id": doc_id},
            files={"file": ("invoice.pdf", b"%PDF-1.4 sample", "application/pdf")},
        )
        history_response = await client.get("/parse-history/")
    assert history_response.status_code == 200
    history = history_response.json()
    assert isinstance(history, list)
    assert len(history) >= 1


@pytest.mark.anyio
async def test_low_confidence_parse_is_marked_needs_review(api_env, monkeypatch):
    transport = ASGITransport(app=main.app)
    train_payload = {
        "doc_type_name": "invoice",
        "sample_text": "Invoice INV-2026-001 for Rs45,000 from ABC Technologies",
        "schema_definition": {"invoice_number": "string", "total_amount": "number"},
        "confidence_threshold": 0.85,
    }

    def low_confidence_route(file_path, doc_type_name=None):
        return {
            "parser": "docling",
            "content": "Invoice INV-2026-001 for Rs45,000 from ABC Technologies",
            "tables": [],
            "metadata": {},
            "confidence": 0.72,
            "error": None,
        }

    monkeypatch.setattr(main, "route_document", low_confidence_route)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        train_response = await client.post("/train/", json=train_payload)
        doc_id = train_response.json()["doc_id"]
        parse_response = await client.post(
            "/parse/",
            params={"doc_id": doc_id},
            files={"file": ("invoice.pdf", b"%PDF-1.4 sample", "application/pdf")},
        )
        queue_response = await client.get("/review-queue/")

    body = parse_response.json()
    queue = queue_response.json()
    assert parse_response.status_code == 200
    assert body["status"] == "needs_review"
    assert body["review_required"] is True
    assert body["confidence_threshold"] == 0.85
    assert api_env["state"]["parse_requests"][0]["status"] == "needs_review"
    assert queue_response.status_code == 200
    assert len(queue) == 1
    assert queue[0]["status"] == "needs_review"


@pytest.mark.anyio
async def test_high_confidence_parse_not_added_to_review_queue(api_env):
    transport = ASGITransport(app=main.app)
    train_payload = {
        "doc_type_name": "invoice",
        "sample_text": "Invoice INV-2026-001 for Rs45,000 from ABC Technologies",
        "schema_definition": {"invoice_number": "string", "total_amount": "number"},
        "confidence_threshold": 0.85,
    }
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        train_response = await client.post("/train/", json=train_payload)
        doc_id = train_response.json()["doc_id"]
        parse_response = await client.post(
            "/parse/",
            params={"doc_id": doc_id},
            files={"file": ("invoice.pdf", b"%PDF-1.4 sample", "application/pdf")},
        )
        queue_response = await client.get("/review-queue/")

    assert parse_response.status_code == 200
    assert parse_response.json()["status"] == "completed"
    assert parse_response.json()["review_required"] is False
    assert queue_response.status_code == 200
    assert queue_response.json() == []


@pytest.mark.anyio
async def test_submit_parse_correction_updates_fields_and_audit(api_env):
    transport = ASGITransport(app=main.app)
    train_payload = {
        "doc_type_name": "invoice",
        "sample_text": "Invoice INV-2026-001 for Rs45,000 from ABC Technologies",
        "schema_definition": {"invoice_number": "string", "total_amount": "number"},
        "confidence_threshold": 0.85,
    }
    corrected_fields = {"invoice_number": "INV-2026-001", "total_amount": 45000}
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        train_response = await client.post("/train/", json=train_payload)
        doc_id = train_response.json()["doc_id"]
        await client.post(
            "/parse/",
            params={"doc_id": doc_id},
            files={"file": ("invoice.pdf", b"%PDF-1.4 sample", "application/pdf")},
        )
        parse_request_id = api_env["state"]["parse_requests"][0]["id"]
        template_count_before = len(api_env["state"]["templates"])
        correction_response = await client.post(
            f"/parse-history/{parse_request_id}/corrections",
            json={"corrected_fields": corrected_fields, "notes": "fixed total amount"},
        )

    body = correction_response.json()
    assert correction_response.status_code == 200
    assert body["parse_request_id"] == parse_request_id
    assert body["corrected_fields"] == corrected_fields
    assert body["original_fields"] != corrected_fields
    assert body["reviewer_id"] == "anonymous@docai.local"
    assert body["learning"]["template_registered"] is True
    assert body["learning"]["changed_field_count"] >= 1
    assert any(item["field_name"] == "total_amount" for item in body["learning"]["rules_suggested"])
    assert len(api_env["state"]["templates"]) == template_count_before + 1
    assert "total_amount: 45000" in api_env["state"]["templates"][-1]["sample_text"]
    assert any(row["status"] == "corrected" for row in api_env["state"]["audits"])
    audit_details = api_env["state"]["audits"][-1]["details"]
    assert audit_details["changed_field_count"] >= 1
    assert audit_details["template_registered"] is True
    assert "fixed total amount" not in str(audit_details)


@pytest.mark.anyio
async def test_list_parse_corrections_returns_saved_rows(api_env):
    transport = ASGITransport(app=main.app)
    parse_request_id = str(uuid4())
    api_env["state"]["parse_requests"].append(
        {
            "id": parse_request_id,
            "doc_id": "doc-123",
            "file_name": "invoice.pdf",
            "parser_used": "docling",
            "confidence_score": 0.9,
            "extracted_fields": {"invoice_number": "WRONG"},
            "pii_redacted": False,
            "status": "completed",
            "user_id": "tester",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.post(
            f"/parse-history/{parse_request_id}/corrections",
            json={"corrected_fields": {"invoice_number": "INV-2026-001"}},
        )
        list_response = await client.get(f"/parse-history/{parse_request_id}/corrections")

    body = list_response.json()
    assert list_response.status_code == 200
    assert len(body) == 1
    assert body[0]["corrected_fields"]["invoice_number"] == "INV-2026-001"


@pytest.mark.anyio
async def test_submit_parse_correction_missing_parse_returns_404(api_env):
    transport = ASGITransport(app=main.app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            f"/parse-history/{uuid4()}/corrections",
            json={"corrected_fields": {"field": "value"}},
        )
    assert response.status_code == 404
