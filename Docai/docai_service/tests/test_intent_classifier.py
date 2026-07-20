from __future__ import annotations

import pytest

from app.intent_classifier import IntentClassificationRequest


@pytest.mark.parametrize(
    "source_type, content, expected",
    [
        ("email", "I am extremely unhappy with the claim settlement...", ["complaint", "inquiry"]),
        ("chat", "Can I reschedule my appointment?", ["appointment_request", "question"]),
        ("document", "Invoice INV-2026-001 for Rs45,000 from ABC Tech", ["extraction"]),
        ("api_event", '{"event": "payment.completed", "amount": 5000}', ["webhook_trigger", "data_sync"]),
        ("support_ticket", "The login button is broken since the last update", ["bug_report"]),
        ("insurance_claim", "Reporting damage to vehicle on 22-Jun-2026", ["first_notice_of_loss"]),
        ("policy_document", "Policy renewal notice for policy #POL-2024-789", ["renewal"]),
        ("patient_record", "Patient requests refill of metformin 500mg", ["prescription_refill"]),
        ("bank_statement", "Monthly statement for account ending 4521, suspicious transaction flagged", ["fraud_detection"]),
        ("purchase_order", "PO #4521 pending approval from finance team", ["approval_required"]),
        ("scientific_paper", "Abstract: We present a novel approach to transformer-based NER...", ["citation_extraction", "summary"]),
        ("shipping_note", "Package delivered to recipient on 24-Jun-2026", ["delivery_confirmation"]),
        ("passport_scan", "Passport scan for Vinod Kumar, expiry 2027-05-01", ["identity_verification", "expiry_alert"]),
    ],
)
def test_classify_intent(source_type, content, expected):
    result = IntentClassificationRequest.classify_intent(content=content, source_type=source_type)
    assert result["source_type"] == source_type
    assert result["detected_intent"] in expected
    assert result["confidence"] > 0.0
