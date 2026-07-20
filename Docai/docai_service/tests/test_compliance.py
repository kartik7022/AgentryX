from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app import audit
from app.compliance import redact_pii, redact_pii_from_fields, validate_schema


class FakeQuery:
    def __init__(self, rows):
        self.rows = rows
        self.parse_request_id = None

    def filter(self, expr):
        target = getattr(getattr(expr, "right", None), "value", None)
        self.parse_request_id = target
        return self

    def order_by(self, *args, **kwargs):
        return self

    def all(self):
        rows = [
            row
            for row in self.rows
            if self.parse_request_id is None or str(row.parse_request_id) == str(self.parse_request_id)
        ]
        return sorted(rows, key=lambda row: row.created_at)


class FakeSession:
    def __init__(self):
        self.rows = []
        self.commits = 0

    def add(self, obj):
        if getattr(obj, "id", None) is None:
            obj.id = str(uuid4())
        if getattr(obj, "created_at", None) is None:
            obj.created_at = datetime.now(timezone.utc)
        self.rows.append(obj)

    def commit(self):
        self.commits += 1

    def refresh(self, obj):
        return None

    def query(self, model):
        return FakeQuery(self.rows)


def test_redact_pii_masks_person_name():
    result = redact_pii("John Smith reviewed the file")
    assert "<PERSON>" in result["redacted_text"]


def test_redact_pii_masks_phone_number():
    result = redact_pii("Call me at 555-123-4567")
    assert "<PHONE_NUMBER>" in result["redacted_text"]


def test_redact_pii_masks_email():
    result = redact_pii("Write to user@example.com today")
    assert "<EMAIL_ADDRESS>" in result["redacted_text"]


def test_redact_pii_masks_ssn():
    result = redact_pii("SSN 123-45-6789 belongs to customer")
    assert "<US_SSN>" in result["redacted_text"]


def test_redact_pii_masks_credit_card():
    result = redact_pii("Card 4111 1111 1111 1111 was used")
    assert "<CREDIT_CARD>" in result["redacted_text"]


def test_redact_pii_returns_entity_count():
    result = redact_pii("John Smith at john@example.com")
    assert result["redaction_count"] >= 2
    assert isinstance(result["entities_found"], list)


def test_redact_pii_from_fields_masks_sensitive_keys():
    result = redact_pii_from_fields({"name": "John Smith", "email": "user@example.com"})
    assert result["name"] != "John Smith"
    assert result["email"] != "user@example.com"
    assert result["redaction_summary"]["redaction_count"] >= 2


def test_redact_pii_from_fields_leaves_non_sensitive_intact():
    result = redact_pii_from_fields({"invoice_number": "INV-001", "status": "paid"})
    assert result["invoice_number"] == "INV-001"
    assert result["status"] == "paid"


def test_validate_schema_passes_for_correct_fields():
    result = validate_schema(
        {"invoice_number": "INV-001", "total_amount": 45000, "items": []},
        {"invoice_number": "string", "total_amount": "number", "items": "array"},
    )
    assert result["valid"] is True


def test_validate_schema_fails_for_missing_field():
    result = validate_schema(
        {"invoice_number": "INV-001"},
        {"invoice_number": "string", "total_amount": "number"},
    )
    assert result["valid"] is False
    assert "total_amount" in result["missing_fields"]


def test_validate_schema_reports_extra_fields():
    result = validate_schema(
        {"invoice_number": "INV-001", "status": "paid"},
        {"invoice_number": "string"},
    )
    assert result["valid"] is False
    assert "status" in result["extra_fields"]


def test_validate_schema_reports_type_errors():
    result = validate_schema(
        {"invoice_number": 1234, "total_amount": "45000"},
        {"invoice_number": "string", "total_amount": "number"},
    )
    assert result["valid"] is False
    assert any(item["field"] == "invoice_number" for item in result["type_errors"])
    assert any(item["field"] == "total_amount" for item in result["type_errors"])


def test_audit_log_event_inserts_db_row():
    db = FakeSession()
    audit_id = audit.log_event(
        db,
        event_type="PARSE",
        doc_id="doc-1",
        user_id="user-1",
        status="success",
        details={"message": "hello"},
    )
    assert audit_id
    assert len(db.rows) == 1
    assert db.rows[0].event_type == "PARSE"


def test_get_audit_trail_returns_chronological():
    db = FakeSession()
    parse_request_id = str(uuid4())
    first = SimpleNamespace(
        id=str(uuid4()),
        event_type="UPLOAD",
        doc_id="doc-1",
        parse_request_id=parse_request_id,
        user_id="u1",
        status="success",
        details={"step": 1},
        created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
    )
    second = SimpleNamespace(
        id=str(uuid4()),
        event_type="PARSE",
        doc_id="doc-1",
        parse_request_id=parse_request_id,
        user_id="u1",
        status="success",
        details={"step": 2},
        created_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
    )
    db.rows.extend([second, first])
    trail = audit.get_audit_trail(db, parse_request_id)
    assert [item["event_type"] for item in trail] == ["UPLOAD", "PARSE"]


def test_insurance_claim_pii_redaction():
    result = redact_pii("Patient John Smith SSN 123-45-6789 policy #POL-2024-789")
    assert "<US_SSN>" in result["redacted_text"]
    assert "<POLICY_NUMBER>" in result["redacted_text"]


def test_medical_record_pii_redaction():
    result = redact_pii("DOB 2026-06-01 and medical license AB123456")
    assert "<DATE_TIME>" in result["redacted_text"]
    assert "<MEDICAL_LICENSE>" in result["redacted_text"]


def test_bank_statement_pii_redaction():
    result = redact_pii("IBAN GB29NWBK60161331926819 account number 4521")
    assert "<IBAN_CODE>" in result["redacted_text"]
    assert "<ACCOUNT_NUMBER>" in result["redacted_text"]


def test_passport_scan_pii_redaction():
    result = redact_pii("Passport for Vinod Kumar, DOB 2027-05-01, passport number A1234567")
    assert "<PERSON>" in result["redacted_text"]
    assert "<DATE_TIME>" in result["redacted_text"]
    assert "<PASSPORT>" in result["redacted_text"] or "<NRP>" in result["redacted_text"]
