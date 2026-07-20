from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

import app.main as main
from app.auth import create_access_token
from app.db import DocumentType, FieldMapping, ParsingRule, ParsingRuleVersion, User


pytestmark = pytest.mark.anyio


class FakeQuery:
    def __init__(self, session, model):
        self.session = session
        self.model = model
        self.exprs = []

    def filter(self, *exprs):
        self.exprs.extend(exprs)
        return self

    def order_by(self, *args, **kwargs):
        return self

    def _rows(self):
        if self.model is User:
            rows = self.session.users
        elif self.model is DocumentType:
            rows = self.session.document_types
        elif self.model is ParsingRule:
            rows = self.session.parsing_rules
        elif self.model is ParsingRuleVersion:
            rows = self.session.parsing_rule_versions
        elif self.model is FieldMapping:
            rows = self.session.field_mappings
        else:
            rows = []

        if not self.exprs:
            return list(rows)

        filtered = list(rows)
        for expr in self.exprs:
            column = getattr(getattr(expr, "left", None), "name", None)
            value = getattr(getattr(expr, "right", None), "value", None)
            if column is None:
                continue
            filtered = [row for row in filtered if str(getattr(row, column, "")) == str(value)]
        return filtered

    def all(self):
        return self._rows()

    def first(self):
        rows = self._rows()
        return rows[0] if rows else None


class FakeSession:
    def __init__(self):
        self.users = []
        self.document_types = []
        self.parsing_rules = []
        self.parsing_rule_versions = []
        self.field_mappings = []

    def query(self, model):
        return FakeQuery(self, model)

    def add(self, obj):
        if getattr(obj, "id", None) is None:
            obj.id = str(uuid4())
        if getattr(obj, "created_at", None) is None:
            obj.created_at = datetime.now(timezone.utc)
        if hasattr(obj, "updated_at") and getattr(obj, "updated_at", None) is None:
            obj.updated_at = datetime.now(timezone.utc)
        if isinstance(obj, User):
            self.users.append(obj)
        elif isinstance(obj, DocumentType):
            self.document_types.append(obj)
        elif isinstance(obj, ParsingRule):
            self.parsing_rules.append(obj)
        elif isinstance(obj, ParsingRuleVersion):
            self.parsing_rule_versions.append(obj)
        elif isinstance(obj, FieldMapping):
            self.field_mappings.append(obj)
        else:
            self.parsing_rules.append(obj)

    def delete(self, obj):
        for collection in (self.users, self.document_types, self.parsing_rules, self.parsing_rule_versions, self.field_mappings):
            if obj in collection:
                collection.remove(obj)
                return

    def commit(self):
        return None

    def refresh(self, obj):
        return None

    def execute(self, stmt):
        return SimpleNamespace()

    def close(self):
        return None


@pytest.fixture
def rules_env(monkeypatch):
    session = FakeSession()
    admin = User(
        id=str(uuid4()),
        email="admin@example.com",
        hashed_password="hashed",
        role="admin",
        is_active=True,
    )
    session.users.append(admin)
    invoice_type = DocumentType(
        id=str(uuid4()),
        doc_type_name="invoice",
        schema_definition={
            "invoice_number": "string",
            "date": "string",
            "total_amount": "number",
            "vendor_name": "string",
        },
        confidence_threshold=0.8,
        is_active=True,
    )
    session.document_types.append(invoice_type)

    token = create_access_token(
        {
            "sub": admin.email,
            "role": admin.role,
            "user_id": str(admin.id),
        }
    )

    monkeypatch.setattr(
        main,
        "registry",
        SimpleNamespace(
            get_model=lambda doc_id, db=None: {
                "doc_type": "invoice",
                "model": {"doc_type_id": invoice_type.id, "doc_id": doc_id},
            }
        ),
    )
    monkeypatch.setattr(
        main,
        "route_document",
        lambda path, doc_type_name=None: {
            "parser": "docling",
            "content": "Invoice INV-2026-001 dated 2026-06-22 from ABC Technologies. Contact Jane Doe at jane.doe@example.com, phone 555-123-4567. Total amount is 45000.",
            "tables": [],
            "metadata": {},
            "confidence": 0.95,
            "error": None,
        },
    )
    monkeypatch.setattr(main, "connector_dispatcher", SimpleNamespace(dispatch=lambda *args, **kwargs: []))
    monkeypatch.setattr(
        main,
        "vector_store",
        SimpleNamespace(lookup=lambda text, threshold=0.75: {"doc_id": "doc-123", "similarity_score": 0.9}),
    )
    monkeypatch.setattr(
        main,
        "store_parse_request",
        lambda *args, **kwargs: SimpleNamespace(id=str(uuid4())),
    )
    monkeypatch.setattr(
        main,
        "log_event",
        lambda *args, **kwargs: str(uuid4()),
    )
    main.app.dependency_overrides[main.get_db] = lambda: session

    yield {"session": session, "token": token, "invoice_type": invoice_type}

    main.app.dependency_overrides.clear()


async def _auth_client(token: str):
    transport = ASGITransport(app=main.app)
    headers = {"Authorization": f"Bearer {token}"}
    return AsyncClient(transport=transport, base_url="http://test", headers=headers)


@pytest.mark.anyio
async def test_create_and_list_parsing_rule(rules_env):
    async with await _auth_client(rules_env["token"]) as client:
        response = await client.post(
            "/parsing-rules/",
            json={
                "doc_type_id": rules_env["invoice_type"].id,
                "field_name": "contact_email",
                "match_type": "regex",
                "pattern": r"([\w\.-]+@[\w\.-]+\.\w+)",
                "description": "Extract invoice contact email",
            },
        )
        assert response.status_code == 200
        rule = response.json()
        assert rule["field_name"] == "contact_email"

        list_response = await client.get("/parsing-rules/", params={"doc_type_id": rules_env["invoice_type"].id})
        assert list_response.status_code == 200
        assert len(list_response.json()) == 1


@pytest.mark.anyio
async def test_parse_uses_parsing_rule(rules_env):
    async with await _auth_client(rules_env["token"]) as client:
        create_response = await client.post(
            "/parsing-rules/",
            json={
                "doc_type_id": rules_env["invoice_type"].id,
                "field_name": "contact_email",
                "match_type": "regex",
                "pattern": r"([\w\.-]+@[\w\.-]+\.\w+)",
            },
        )
        assert create_response.status_code == 200

        second_rule = await client.post(
            "/parsing-rules/",
            json={
                "doc_type_id": rules_env["invoice_type"].id,
                "field_name": "contact_phone",
                "match_type": "regex",
                "pattern": r"(\d{3}[- ]\d{3}[- ]\d{4})",
            },
        )
        assert second_rule.status_code == 200

        parse_response = await client.post(
            "/parse/",
            params={"doc_id": "doc-123"},
            files={"file": ("sample_invoice.pdf", b"%PDF-1.4", "application/pdf")},
        )
        assert parse_response.status_code == 200
        body = parse_response.json()
        assert body["fields"]["invoice_number"] == "INV-2026-001"
        assert body["fields"]["contact_email"] == "<EMAIL_ADDRESS>"
        assert body["fields"]["contact_phone"] == "<PHONE_NUMBER>"


@pytest.mark.anyio
async def test_delete_parsing_rule_removes_it(rules_env):
    async with await _auth_client(rules_env["token"]) as client:
        create_response = await client.post(
            "/parsing-rules/",
            json={
                "doc_type_id": rules_env["invoice_type"].id,
                "field_name": "contact_email",
                "match_type": "regex",
                "pattern": r"([\w\.-]+@[\w\.-]+\.\w+)",
            },
        )
        rule_id = create_response.json()["id"]

        delete_response = await client.delete(f"/parsing-rules/{rule_id}")
        assert delete_response.status_code == 200

        list_response = await client.get("/parsing-rules/", params={"doc_type_id": rules_env["invoice_type"].id})
        assert list_response.status_code == 200
        assert list_response.json() == []


@pytest.mark.anyio
async def test_rule_version_update_changes_parse_output(rules_env):
    async with await _auth_client(rules_env["token"]) as client:
        create_response = await client.post(
            "/parsing-rules/",
            json={
                "doc_type_id": rules_env["invoice_type"].id,
                "field_name": "custom_marker",
                "match_type": "regex",
                "pattern": r"Invoice (INV-\d{4}-\d{3})",
            },
        )
        assert create_response.status_code == 200
        rule_id = create_response.json()["id"]

        version_response = await client.post(
            f"/parsing-rules/{rule_id}/versions",
            json={
                "pattern": r"Total amount is (\d+)",
                "activate": True,
            },
        )
        assert version_response.status_code == 200
        assert version_response.json()["version_number"] == 2

        versions_response = await client.get(f"/parsing-rules/{rule_id}/versions")
        assert versions_response.status_code == 200
        assert len(versions_response.json()) == 2

        parse_response = await client.post(
            "/parse/",
            params={"doc_id": "doc-123"},
            files={"file": ("sample_invoice.pdf", b"%PDF-1.4", "application/pdf")},
        )
        assert parse_response.status_code == 200
        body = parse_response.json()
        assert body["fields"]["custom_marker"] == "45000"


@pytest.mark.anyio
async def test_inactive_version_requires_activation(rules_env):
    async with await _auth_client(rules_env["token"]) as client:
        create_response = await client.post(
            "/parsing-rules/",
            json={
                "doc_type_id": rules_env["invoice_type"].id,
                "field_name": "custom_marker",
                "match_type": "regex",
                "pattern": r"Invoice (INV-\d{4}-\d{3})",
            },
        )
        rule_id = create_response.json()["id"]

        inactive_version = await client.post(
            f"/parsing-rules/{rule_id}/versions",
            json={
                "pattern": r"Total amount is (\d+)",
                "activate": False,
            },
        )
        assert inactive_version.status_code == 200
        assert inactive_version.json()["is_active"] is False

        before_activate = await client.post(
            "/parse/",
            params={"doc_id": "doc-123"},
            files={"file": ("sample_invoice.pdf", b"%PDF-1.4", "application/pdf")},
        )
        assert before_activate.status_code == 200
        assert before_activate.json()["fields"]["custom_marker"] == "INV-2026-001"

        activate_response = await client.post(
            f"/parsing-rules/{rule_id}/versions/{inactive_version.json()['id']}/activate"
        )
        assert activate_response.status_code == 200
        assert activate_response.json()["is_active"] is True

        after_activate = await client.post(
            "/parse/",
            params={"doc_id": "doc-123"},
            files={"file": ("sample_invoice.pdf", b"%PDF-1.4", "application/pdf")},
        )
        assert after_activate.status_code == 200
        assert after_activate.json()["fields"]["custom_marker"] == "45000"


@pytest.mark.anyio
async def test_field_mapping_maps_raw_field_before_validation(rules_env):
    async with await _auth_client(rules_env["token"]) as client:
        rule_response = await client.post(
            "/parsing-rules/",
            json={
                "doc_type_id": rules_env["invoice_type"].id,
                "field_name": "raw_total",
                "match_type": "regex",
                "pattern": r"Total amount is (\d+)",
            },
        )
        assert rule_response.status_code == 200

        mapping_response = await client.post(
            "/field-mappings/",
            json={
                "doc_type_id": rules_env["invoice_type"].id,
                "source_field": "raw_total",
                "target_field": "total_amount",
                "transform": "number",
            },
        )
        assert mapping_response.status_code == 200

        list_response = await client.get("/field-mappings/", params={"doc_type_id": rules_env["invoice_type"].id})
        assert list_response.status_code == 200
        assert len(list_response.json()) == 1

        parse_response = await client.post(
            "/parse/",
            params={"doc_id": "doc-123"},
            files={"file": ("sample_invoice.pdf", b"%PDF-1.4", "application/pdf")},
        )
        assert parse_response.status_code == 200
        body = parse_response.json()
        assert "raw_total" not in body["fields"]
        assert body["fields"]["total_amount"] == 45000
        assert body["validation"]["valid"] is True


@pytest.mark.anyio
async def test_delete_field_mapping_removes_it(rules_env):
    async with await _auth_client(rules_env["token"]) as client:
        mapping_response = await client.post(
            "/field-mappings/",
            json={
                "doc_type_id": rules_env["invoice_type"].id,
                "source_field": "policy_no",
                "target_field": "policy_number",
            },
        )
        assert mapping_response.status_code == 200

        delete_response = await client.delete(f"/field-mappings/{mapping_response.json()['id']}")
        assert delete_response.status_code == 200

        list_response = await client.get("/field-mappings/", params={"doc_type_id": rules_env["invoice_type"].id})
        assert list_response.status_code == 200
        assert list_response.json() == []
