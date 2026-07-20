from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, ClassVar


INTENT_REGISTRY: dict[str, list[str]] = {
    "email": ["complaint", "inquiry", "follow_up", "notification"],
    "chat": ["appointment_request", "question", "escalation", "greeting"],
    "document": ["extraction", "validation", "archival", "routing"],
    "api_event": ["webhook_trigger", "data_sync", "alert", "ingest"],
    "support_ticket": ["bug_report", "feature_request", "question", "billing_issue"],
    "insurance_claim": ["first_notice_of_loss", "claim_followup", "status_check"],
    "policy_document": ["renewal", "policy_update", "coverage_review"],
    "patient_record": ["prescription_refill", "record_review", "appointment_followup"],
    "bank_statement": ["fraud_detection", "transaction_review", "reconciliation"],
    "purchase_order": ["approval_required", "order_status", "procurement_review"],
    "scientific_paper": ["citation_extraction", "summary", "literature_review"],
    "shipping_note": ["delivery_confirmation", "shipment_tracking", "exception_notice"],
    "passport_scan": ["identity_verification", "expiry_alert", "redaction"],
}


@dataclass(slots=True)
class IntentClassificationRequest:
    source_type: str
    intent: str | None = None
    payload: dict[str, Any] = field(default_factory=dict)

    registry: ClassVar[dict[str, list[str]]] = INTENT_REGISTRY

    def validate(self) -> None:
        if self.source_type not in self.registry:
            raise ValueError(f"Unsupported source_type: {self.source_type}")

        if self.intent is None:
            raise ValueError("intent is required for explicit validation")

        allowed_intents = self.registry[self.source_type]
        if self.intent not in allowed_intents:
            raise ValueError(
                f"Unsupported intent '{self.intent}' for source_type '{self.source_type}'"
            )

    @classmethod
    def supported_source_types(cls) -> list[str]:
        return list(cls.registry.keys())

    @classmethod
    def supported_intents(cls, source_type: str) -> list[str]:
        return list(cls.registry.get(source_type, []))

    @classmethod
    def register_intent(cls, source_type: str, intent: str) -> None:
        cls.registry.setdefault(source_type, [])
        if intent not in cls.registry[source_type]:
            cls.registry[source_type].append(intent)

    @classmethod
    def classify_intent(
        cls, content: str, source_type: str, payload: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        text = content.lower()
        payload = payload or {}

        if source_type == "email":
            if any(word in text for word in ["unhappy", "angry", "complaint", "refund", "issue"]):
                detected_intent = "complaint"
            else:
                detected_intent = "inquiry"
        elif source_type == "chat":
            if any(word in text for word in ["reschedule", "appointment", "book", "move"]):
                detected_intent = "appointment_request"
            else:
                detected_intent = "question"
        elif source_type == "document":
            detected_intent = "extraction"
        elif source_type == "api_event":
            if "payment.completed" in text or "webhook" in text:
                detected_intent = "webhook_trigger"
            else:
                detected_intent = "data_sync"
        elif source_type == "support_ticket":
            if any(word in text for word in ["broken", "error", "bug", "does not work", "issue"]):
                detected_intent = "bug_report"
            else:
                detected_intent = "question"
        elif source_type == "insurance_claim":
            detected_intent = "first_notice_of_loss"
        elif source_type == "policy_document":
            detected_intent = "renewal" if "renewal" in text else "policy_update"
        elif source_type == "patient_record":
            detected_intent = "prescription_refill" if "refill" in text else "record_review"
        elif source_type == "bank_statement":
            detected_intent = "fraud_detection" if "suspicious" in text or "fraud" in text else "transaction_review"
        elif source_type == "purchase_order":
            detected_intent = "approval_required" if "approval" in text else "order_status"
        elif source_type == "scientific_paper":
            detected_intent = "citation_extraction" if "references" in text or "cited" in text else "summary"
        elif source_type == "shipping_note":
            detected_intent = "delivery_confirmation" if "delivered" in text else "shipment_tracking"
        elif source_type == "passport_scan":
            detected_intent = "identity_verification" if "passport" in text else "expiry_alert"
        else:
            detected_intent = "unknown"

        return {
            "source_type": source_type,
            "detected_intent": detected_intent,
            "confidence": 0.9 if detected_intent != "unknown" else 0.1,
            "content": content,
            "payload": payload,
        }
