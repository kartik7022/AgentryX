from __future__ import annotations

import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient

import app.main as main
from app.auth import create_access_token
from app.db import User


pytestmark = pytest.mark.anyio

ROOT = Path(__file__).resolve().parents[1]
FIXTURES_DIR = ROOT / "tests" / "fixtures"
GENERATE_FIXTURES_SCRIPT = ROOT / "scripts" / "generate_fixtures.py"

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


def ensure_e2e_fixtures() -> None:
    required_files = [
        FIXTURES_DIR / "sample_invoice.pdf",
        FIXTURES_DIR / "sample_resume.pdf",
        FIXTURES_DIR / "sample_claim.txt",
        FIXTURES_DIR / "sample_medical_record.txt",
        FIXTURES_DIR / "sample_passport.txt",
    ]
    if all(path.exists() for path in required_files):
        return

    result = subprocess.run(
        [sys.executable, str(GENERATE_FIXTURES_SCRIPT)],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert result.returncode == 0, result.stderr or result.stdout


def read_fixture_bytes(filename: str) -> bytes:
    ensure_e2e_fixtures()
    return (FIXTURES_DIR / filename).read_bytes()


@dataclass
class FakeSession:
    users: list

    def query(self, model):
        return FakeQuery(self, model)

    def add(self, obj):
        if getattr(obj, "id", None) is None:
            obj.id = uuid4()
        if isinstance(obj, User):
            self.users.append(obj)

    def commit(self):
        return None

    def refresh(self, obj):
        return None

    def execute(self, stmt):
        return SimpleNamespace()

    def close(self):
        return None


class FakeQuery:
    def __init__(self, session, model):
        self.session = session
        self.model = model
        self.expr = None

    def filter(self, expr):
        self.expr = expr
        return self

    def order_by(self, *args, **kwargs):
        return self

    def all(self):
        if self.model is User:
            return list(self.session.users)
        return []

    def first(self):
        if self.model is User:
            email = getattr(getattr(self.expr, "right", None), "value", None)
            for user in self.session.users:
                if user.email == email:
                    return user
        return None


def _seed_state():
    now = datetime.now(timezone.utc)
    doc_types = {}
    for name in SEED_DOC_TYPES:
        doc_types[name] = {
            "id": str(uuid4()),
            "doc_type_name": name,
            "schema_definition": {"name": "string"},
            "confidence_threshold": 0.8,
            "is_active": True,
            "created_at": now,
            "updated_at": now,
        }
    return {
        "doc_types": doc_types,
        "models": {},
        "templates": {},
        "parse_requests": [],
        "audits": [],
    }


def _serialize_doc_type(row):
    return {
        "id": row["id"],
        "doc_type_name": row["doc_type_name"],
        "schema_definition": row["schema_definition"],
        "confidence_threshold": row["confidence_threshold"],
        "is_active": row.get("is_active", True),
        "created_at": row["created_at"].isoformat(),
        "updated_at": row["updated_at"].isoformat(),
    }


def _fixture_content_for(doc_type_name: str | None, file_name: str) -> str:
    name = (doc_type_name or "").lower()
    file_name = file_name.lower()
    if name == "invoice" or "invoice" in file_name:
        return (
            "Invoice INV-2026-001 dated 2026-06-22 from ABC Technologies. "
            "Contact Jane Doe at jane.doe@example.com, phone 555-123-4567. "
            "Total amount is 45000."
        )
    if name == "insurance_claim" or "claim" in file_name:
        return (
            "Insurance claim for patient John Doe with SSN 123-45-6789 and "
            "policy number POL-9001 after vehicle damage."
        )
    if name == "resume" or "resume" in file_name:
        return "Resume for Asha Verma, senior Python engineer with ML and FastAPI experience."
    if name == "bank_statement":
        return "Bank statement for account ending 7788 with suspicious fraud transaction detected."
    if name == "shipping_note":
        return "Shipping note confirming package delivered to warehouse dock on 2026-06-24."
    if name == "purchase_order":
        return "PO #4521 pending approval from finance team for hardware procurement."
    if name == "passport_scan" or "passport" in file_name:
        return "Passport scan for Vinod Kumar, DOB 1990-01-01, passport number M1234567."
    if name == "support_ticket":
        return "Support ticket: login page broken with error 500 after the latest deployment."
    if name == "email":
        return "I am unhappy with the delayed refund and want this complaint resolved today."
    if name == "medical_record" or "medical" in file_name:
        return "Medical record for patient requiring triage review and diagnosis update."
    return "Generic document content."


def _redact_text(text: str) -> tuple[str, list[dict[str, str]]]:
    replacements = [
        ("John Doe", "<PERSON>", "PERSON"),
        ("Jane Doe", "<PERSON>", "PERSON"),
        ("jane.doe@example.com", "<EMAIL_ADDRESS>", "EMAIL_ADDRESS"),
        ("555-123-4567", "<PHONE_NUMBER>", "PHONE_NUMBER"),
        ("123-45-6789", "<US_SSN>", "US_SSN"),
        ("1990-01-01", "<DATE_TIME>", "DATE_TIME"),
        ("M1234567", "<NRP>", "NRP"),
        ("POL-9001", "<POLICY_NUMBER>", "POLICY_NUMBER"),
    ]
    redacted = text
    entities = []
    for raw, placeholder, entity_type in replacements:
        if raw in redacted:
            redacted = redacted.replace(raw, placeholder)
            entities.append({"entity_type": entity_type, "value": raw})
    return redacted, entities


def _extract_fields(content: str, doc_type_name: str | None = None) -> dict[str, object]:
    key = (doc_type_name or "").lower()
    if key == "invoice":
        return {
            "invoice_number": "INV-2026-001",
            "date": "2026-06-22",
            "total_amount": "45000",
            "vendor_name": "ABC Technologies",
            "contact_name": "<PERSON>",
            "contact_email": "<EMAIL_ADDRESS>",
            "contact_phone": "<PHONE_NUMBER>",
        }
    if key == "insurance_claim":
        return {
            "patient_name": "<PERSON>",
            "ssn": "<US_SSN>",
            "policy_number": "<POLICY_NUMBER>",
            "claim_status": "submitted",
        }
    if key == "resume":
        return {"candidate_name": "Asha Verma", "skills": ["Python", "FastAPI", "ML"]}
    if key == "bank_statement":
        return {"account_name": "Global Holdings", "alert": "suspicious transaction"}
    if key == "shipping_note":
        return {"delivery_status": "delivered", "location": "warehouse dock"}
    if key == "purchase_order":
        return {"purchase_order_number": "4521", "status": "pending approval"}
    if key == "passport_scan":
        return {"full_name": "<PERSON>", "dob": "<DATE_TIME>", "passport_number": "<NRP>"}
    if key == "support_ticket":
        return {"issue_type": "broken login", "severity": "high"}
    if key == "email":
        return {"summary": "refund complaint"}
    if key == "medical_record":
        return {"triage_status": "urgent", "patient_name": "<PERSON>"}
    return {"content": content[:120]}


def _build_intent_classifier():
    mapping = {
        "email": ("complaint", 0.91),
        "support_ticket": ("bug_report", 0.93),
        "bank_statement": ("fraud_detection", 0.92),
        "medical_record": ("triage", 0.82),
        "passport_scan": ("identity_verification", 0.9),
        "shipping_note": ("delivery_confirmation", 0.89),
        "purchase_order": ("approval_required", 0.88),
        "insurance_claim": ("first_notice_of_loss", 0.9),
        "document": ("extraction", 0.87),
        "invoice": ("extraction", 0.87),
        "resume": ("extraction", 0.86),
    }

    def classify(content: str, source_type: str, payload=None):
        detected_intent, confidence = mapping.get(source_type, ("extraction", 0.85))
        return {
            "source_type": source_type,
            "detected_intent": detected_intent,
            "confidence": confidence,
            "content": content,
            "payload": payload or {},
        }

    return classify


@pytest.fixture
def e2e_env(monkeypatch):
    ensure_e2e_fixtures()
    monkeypatch.setenv("AUTH_DISABLED", "false")
    main.TOKEN_BLOCKLIST.clear()

    state = _seed_state()
    session = FakeSession(users=[])

    class FakeRegistry:
        def register(self, doc_type, model_info, doc_type_id=None, db=None):
            doc_id = str(uuid4())
            state["models"][doc_id] = {
                "doc_type": doc_type,
                "model": {**model_info, "doc_type_id": doc_type_id, "doc_id": doc_id},
            }
            return doc_id

        def get_model(self, doc_id, db=None):
            return state["models"].get(doc_id)

    class FakeVectorStore:
        def embed(self, text):
            return [0.0] * 384

        def register_template(self, doc_id, text, doc_type_id=None):
            existing = state["templates"].get(doc_id, "")
            state["templates"][doc_id] = f"{existing}\n{text}".strip()
            return str(uuid4())

        def lookup(self, text, threshold=0.75):
            query_tokens = {
                token
                for token in text.lower().replace("-", " ").replace("#", " ").split()
                if len(token) > 2
            }
            best_doc_id = None
            best_score = 0.0
            for doc_id, sample_text in state["templates"].items():
                sample_tokens = {
                    token
                    for token in sample_text.lower().replace("-", " ").replace("#", " ").split()
                    if len(token) > 2
                }
                overlap = len(query_tokens & sample_tokens)
                if overlap >= 3:
                    score = 0.9
                elif overlap == 2:
                    score = 0.8
                else:
                    score = overlap / max(len(sample_tokens), 1)
                if score > best_score:
                    best_doc_id = doc_id
                    best_score = score
            if best_doc_id and best_score >= threshold:
                return {"doc_id": best_doc_id, "similarity_score": round(best_score, 4)}
            return None

    def upsert_document_type(db, request):
        row = state["doc_types"].get(request.doc_type_name)
        if row is None:
            row = {
                "id": str(uuid4()),
                "doc_type_name": request.doc_type_name,
                "schema_definition": request.schema_definition,
                "confidence_threshold": request.confidence_threshold,
                "is_active": True,
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc),
            }
            state["doc_types"][request.doc_type_name] = row
        else:
            row["schema_definition"] = request.schema_definition
            row["confidence_threshold"] = request.confidence_threshold
            row["is_active"] = True
            row["updated_at"] = datetime.now(timezone.utc)
        return SimpleNamespace(**row)

    def get_document_type_by_id(db, doc_type_id):
        for row in state["doc_types"].values():
            if row["id"] == doc_type_id and row.get("is_active", True):
                return _serialize_doc_type(row)
        return None

    def list_document_types(db):
        return [
            _serialize_doc_type(row)
            for row in state["doc_types"].values()
            if row.get("is_active", True)
        ]

    def soft_delete_document_type(db, doc_type_id):
        for row in state["doc_types"].values():
            if row["id"] == doc_type_id and row.get("is_active", True):
                row["is_active"] = False
                row["updated_at"] = datetime.now(timezone.utc)
                return _serialize_doc_type(row)
        return None

    def list_parse_history(db, limit=50):
        return state["parse_requests"][-limit:][::-1]

    def list_parse_stats(db, days=7):
        start_date = datetime.now(timezone.utc).date() - timedelta(days=days - 1)
        counts = {
            (start_date + timedelta(days=offset)).isoformat(): 0
            for offset in range(days)
        }
        for row in state["parse_requests"]:
            day_key = row["created_at"][:10]
            if day_key in counts:
                counts[day_key] += 1
        return [{"date": day, "parse_count": value} for day, value in counts.items()]

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
            "doc_type_name": state["models"].get(doc_id, {}).get("doc_type"),
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

    def log_event(db, event_type, doc_id, user_id, status, parse_request_id=None, details=None):
        audit_id = str(uuid4())
        state["audits"].append(
            {
                "id": audit_id,
                "event_type": event_type,
                "doc_id": doc_id,
                "user_id": user_id,
                "status": status,
                "parse_request_id": str(parse_request_id) if parse_request_id else None,
                "details": details or {},
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        return audit_id

    def get_audit_trail(db, parse_request_id):
        return [
            row
            for row in state["audits"]
            if row.get("parse_request_id") == str(parse_request_id)
        ]

    def route_document(file_path, doc_type_name=None):
        content = _fixture_content_for(doc_type_name, Path(file_path).name)
        parser = "ocr" if Path(file_path).suffix.lower() in {".png", ".jpg", ".jpeg", ".tiff"} else "docling"
        return {
            "parser": parser,
            "content": content,
            "tables": [],
            "metadata": {},
            "confidence": 0.94 if (doc_type_name or "").lower() == "invoice" else 0.82,
            "error": None,
        }

    def redact_pii(text, language="en"):
        redacted_text, entities = _redact_text(text)
        return {
            "redacted_text": redacted_text,
            "entities_found": entities,
            "redaction_count": len(entities),
        }

    def redact_pii_from_fields(fields, sensitive_keys=None):
        redacted = dict(fields)
        redacted_keys = []
        redaction_count = 0
        for key, value in list(redacted.items()):
            if isinstance(value, str):
                new_value, entities = _redact_text(value)
                if new_value != value:
                    redacted[key] = new_value
                    redacted_keys.append(key)
                    redaction_count += len(entities)
        redacted["redaction_summary"] = {
            "redacted_keys": redacted_keys,
            "redaction_count": redaction_count,
        }
        return redacted

    monkeypatch.setattr(main, "registry", FakeRegistry())
    monkeypatch.setattr(main, "vector_store", FakeVectorStore())
    monkeypatch.setattr(main, "connector_dispatcher", SimpleNamespace(dispatch=lambda *args, **kwargs: []))
    monkeypatch.setattr(main, "upsert_document_type", upsert_document_type)
    monkeypatch.setattr(main, "get_document_type_by_id", get_document_type_by_id)
    monkeypatch.setattr(main, "list_document_types", list_document_types)
    monkeypatch.setattr(main, "soft_delete_document_type", soft_delete_document_type)
    monkeypatch.setattr(main, "list_parse_history", list_parse_history)
    monkeypatch.setattr(main, "list_parse_stats", list_parse_stats)
    monkeypatch.setattr(main, "store_parse_request", store_parse_request)
    monkeypatch.setattr(main, "log_event", log_event)
    monkeypatch.setattr(main, "get_audit_trail", get_audit_trail)
    monkeypatch.setattr(main, "route_document", route_document)
    monkeypatch.setattr(main, "redact_pii", redact_pii)
    monkeypatch.setattr(main, "redact_pii_from_fields", redact_pii_from_fields)
    monkeypatch.setattr(main, "_extract_fields", _extract_fields)
    monkeypatch.setattr(main.IntentClassificationRequest, "classify_intent", staticmethod(_build_intent_classifier()))
    monkeypatch.setitem(main.IntentClassificationRequest.registry, "medical_record", ["triage", "record_review"])
    monkeypatch.setattr(main.ml_registry, "register_model", lambda doc_id, doc_type_name, model_info: "run-123")

    main.app.dependency_overrides[main.get_db] = lambda: session

    yield {"state": state, "session": session}

    main.app.dependency_overrides.clear()
    main.TOKEN_BLOCKLIST.clear()


async def _register_user(client: AsyncClient, email: str, password: str, role: str, token: str | None = None):
    headers = {"Authorization": f"Bearer {token}"} if token else None
    return await client.post(
        "/auth/register",
        json={"email": email, "password": password, "role": role},
        headers=headers,
    )


async def _login(client: AsyncClient, email: str, password: str):
    return await client.post(
        "/auth/jwt/login",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )


async def _bootstrap_admin(client: AsyncClient):
    await _register_user(client, "admin@docai.com", "password", "admin")
    login_response = await _login(client, "admin@docai.com", "password")
    assert login_response.status_code == 200
    token = login_response.json()["access_token"]
    return token


async def _train_doc_type(client: AsyncClient, token: str, doc_type_name: str, sample_text: str, schema_definition: dict):
    response = await client.post(
        "/train/",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "doc_type_name": doc_type_name,
            "sample_text": sample_text,
            "schema_definition": schema_definition,
            "confidence_threshold": 0.85,
        },
    )
    return response


@pytest.mark.anyio
async def test_e2e_invoice_full_flow(e2e_env):
    transport = ASGITransport(app=main.app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        token = await _bootstrap_admin(client)
        train_response = await _train_doc_type(
            client,
            token,
            "invoice",
            "Invoice INV-2026-001 dated 2026-06-22 from ABC Technologies for 45000.",
            {
                "invoice_number": "string",
                "date": "string",
                "total_amount": "string",
                "vendor_name": "string",
            },
        )
        assert train_response.status_code == 200
        train_body = train_response.json()
        UUID(train_body["doc_id"])

        parse_response = await client.post(
            f"/parse/?doc_id={train_body['doc_id']}",
            headers={"Authorization": f"Bearer {token}"},
            files={"file": ("sample_invoice.pdf", read_fixture_bytes("sample_invoice.pdf"), "application/pdf")},
        )

    body = parse_response.json()
    assert parse_response.status_code == 200
    assert {"document_id", "fields", "confidence", "audit_id", "parser_used", "pii_redacted", "intent"}.issubset(body.keys())
    assert body["document_id"] == train_body["doc_id"]
    assert {"invoice_number", "date", "total_amount", "vendor_name"}.issubset(body["fields"].keys())
    assert body["confidence"] >= 0.70
    assert body["pii_redacted"] is True
    assert body["intent"]["detected_intent"] == "extraction"
    audit_events = [row["event_type"] for row in e2e_env["state"]["audits"]]
    assert "TRAIN" in audit_events
    assert "PARSE" in audit_events


@pytest.mark.anyio
async def test_e2e_insurance_claim(e2e_env):
    transport = ASGITransport(app=main.app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        admin_token = await _bootstrap_admin(client)
        register = await _register_user(client, "trainer@docai.com", "password", "trainer", token=admin_token)
        assert register.status_code == 200
        trainer_login = await _login(client, "trainer@docai.com", "password")
        trainer_token = trainer_login.json()["access_token"]

        train_response = await _train_doc_type(
            client,
            trainer_token,
            "insurance_claim",
            "Insurance claim for patient John Doe with SSN 123-45-6789 and policy number POL-9001.",
            {
                "patient_name": "string",
                "ssn": "string",
                "policy_number": "string",
            },
        )
        doc_id = train_response.json()["doc_id"]
        parse_response = await client.post(
            f"/parse/?doc_id={doc_id}",
            headers={"Authorization": f"Bearer {trainer_token}"},
            files={"file": ("sample_claim.txt", read_fixture_bytes("sample_claim.txt"), "text/plain")},
        )

    body = parse_response.json()
    assert parse_response.status_code == 200
    assert body["intent"]["detected_intent"] in ["first_notice_of_loss", "claim_status", "claim_followup", "status_check"]
    assert body["fields"]["patient_name"] == "<PERSON>"
    assert body["fields"]["ssn"] == "<US_SSN>"


@pytest.mark.anyio
async def test_e2e_auto_detect_identifies_trained_doc_type(e2e_env):
    transport = ASGITransport(app=main.app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        token = await _bootstrap_admin(client)
        train_response = await _train_doc_type(
            client,
            token,
            "resume",
            "Resume for Asha Verma with Python, FastAPI, and machine learning experience.",
            {"candidate_name": "string", "skills": "array"},
        )
        assert train_response.status_code == 200

        detect_response = await client.post(
            "/auto-detect/",
            headers={"Authorization": f"Bearer {token}"},
            files={"file": ("sample_resume.pdf", read_fixture_bytes("sample_resume.pdf"), "application/pdf")},
        )

    body = detect_response.json()
    assert detect_response.status_code == 200
    assert body["matched"] is True
    assert body["similarity_score"] >= 0.75


@pytest.mark.anyio
async def test_e2e_viewer_cannot_train(e2e_env):
    transport = ASGITransport(app=main.app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        admin_token = await _bootstrap_admin(client)
        register = await _register_user(client, "viewer@docai.com", "password", "viewer", token=admin_token)
        assert register.status_code == 200
        viewer_login = await _login(client, "viewer@docai.com", "password")
        viewer_token = viewer_login.json()["access_token"]

        train_response = await client.post(
            "/train/",
            headers={"Authorization": f"Bearer {viewer_token}"},
            json={
                "doc_type_name": "invoice",
                "sample_text": "Invoice sample",
                "schema_definition": {"invoice_number": "string"},
                "confidence_threshold": 0.8,
            },
        )
        doc_types_response = await client.get(
            "/doc-types/",
            headers={"Authorization": f"Bearer {viewer_token}"},
        )

    assert train_response.status_code == 403
    assert doc_types_response.status_code == 200


async def _run_intent_parse_scenario(doc_type_name: str, sample_text: str, fixture_name: str, expected_intent: str, e2e_env):
    transport = ASGITransport(app=main.app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        token = await _bootstrap_admin(client)
        training_text = f"{sample_text} {_fixture_content_for(doc_type_name, fixture_name)}"
        train_response = await _train_doc_type(
            client,
            token,
            doc_type_name,
            training_text,
            {"content": "string"},
        )
        doc_id = train_response.json()["doc_id"]
        parse_response = await client.post(
            f"/parse/?doc_id={doc_id}",
            headers={"Authorization": f"Bearer {token}"},
            files={"file": (fixture_name, read_fixture_bytes(fixture_name), "application/octet-stream")},
        )
    assert parse_response.status_code == 200
    assert parse_response.json()["intent"]["detected_intent"] == expected_intent


@pytest.mark.anyio
async def test_e2e_intent_email_complaint(e2e_env):
    await _run_intent_parse_scenario(
        "email",
        "Customer email complaining about refund delay and poor service.",
        "sample_claim.txt",
        "complaint",
        e2e_env,
    )


@pytest.mark.anyio
async def test_e2e_intent_support_ticket_bug(e2e_env):
    await _run_intent_parse_scenario(
        "support_ticket",
        "Support ticket describing broken login behavior.",
        "sample_claim.txt",
        "bug_report",
        e2e_env,
    )


@pytest.mark.anyio
async def test_e2e_intent_bank_statement_fraud(e2e_env):
    await _run_intent_parse_scenario(
        "bank_statement",
        "Bank statement with suspicious fraud transaction.",
        "sample_claim.txt",
        "fraud_detection",
        e2e_env,
    )


@pytest.mark.anyio
async def test_e2e_intent_medical_record_triage(e2e_env):
    await _run_intent_parse_scenario(
        "medical_record",
        "Medical record requiring urgent triage review.",
        "sample_medical_record.txt",
        "triage",
        e2e_env,
    )


@pytest.mark.anyio
async def test_e2e_intent_passport_identity(e2e_env):
    await _run_intent_parse_scenario(
        "passport_scan",
        "Passport scan used for identity verification.",
        "sample_passport.txt",
        "identity_verification",
        e2e_env,
    )


@pytest.mark.anyio
async def test_e2e_intent_shipping_delivery(e2e_env):
    await _run_intent_parse_scenario(
        "shipping_note",
        "Shipping note showing delivered package.",
        "sample_claim.txt",
        "delivery_confirmation",
        e2e_env,
    )


@pytest.mark.anyio
async def test_e2e_intent_purchase_order_approval(e2e_env):
    await _run_intent_parse_scenario(
        "purchase_order",
        "Purchase order pending approval.",
        "sample_claim.txt",
        "approval_required",
        e2e_env,
    )


def _parse_metric_value(metrics_text: str, metric_name: str) -> float:
    values = []
    for line in metrics_text.splitlines():
        if line.startswith(metric_name):
            try:
                values.append(float(line.rsplit(" ", 1)[-1]))
            except ValueError:
                continue
    return sum(values)


@pytest.mark.anyio
async def test_e2e_metrics_increment_after_parse(e2e_env):
    transport = ASGITransport(app=main.app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        token = await _bootstrap_admin(client)
        train_response = await _train_doc_type(
            client,
            token,
            "invoice",
            "Invoice INV-2026-001 dated 2026-06-22 from ABC Technologies for 45000.",
            {
                "invoice_number": "string",
                "date": "string",
                "total_amount": "string",
                "vendor_name": "string",
            },
        )
        doc_id = train_response.json()["doc_id"]

        before_metrics = await client.get("/metrics", headers={"Authorization": f"Bearer {token}"})
        before_value = _parse_metric_value(before_metrics.text, "docai_parse_total")

        parse_response = await client.post(
            f"/parse/?doc_id={doc_id}",
            headers={"Authorization": f"Bearer {token}"},
            files={"file": ("sample_invoice.pdf", read_fixture_bytes("sample_invoice.pdf"), "application/pdf")},
        )
        assert parse_response.status_code == 200

        after_metrics = await client.get("/metrics", headers={"Authorization": f"Bearer {token}"})
        after_value = _parse_metric_value(after_metrics.text, "docai_parse_total")

    assert after_value >= before_value + 1


def test_generate_fixtures_script_creates_expected_files():
    ensure_e2e_fixtures()
    expected = [
        "sample_invoice.pdf",
        "sample_resume.pdf",
        "sample_claim.txt",
        "sample_medical_record.txt",
        "sample_passport.txt",
    ]
    for name in expected:
        assert (FIXTURES_DIR / name).exists(), f"missing fixture: {name}"
