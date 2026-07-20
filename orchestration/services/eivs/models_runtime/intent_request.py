# services/eivs/models/intent_request.py

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field, model_validator

IntentSourceType = Literal[
    "email",
    "chat",
    "document",
    "api_event",
    "support_ticket",
    "claim",
    "policy",
    "patient_record",
    "webhook_event",
    "batch_row",
    "form_submission",
    "agent_output",
]


class PartyRef(BaseModel):
    role: str
    id: Optional[str] = None
    name: Optional[str] = None
    email: Optional[str] = None


class AttachmentRef(BaseModel):
    attachment_id: Optional[str] = None
    name: Optional[str] = None
    mime_type: Optional[str] = None
    text_content: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class IntentClassificationRequest(BaseModel):
    request_id: str
    tenant_id: str
    source_type: IntentSourceType

    entity_id: Optional[str] = None
    correlation_id: Optional[str] = None
    locale: str = "multi"
    language_hint: Optional[str] = None
    channel: Optional[str] = None

    subject: Optional[str] = None
    title: Optional[str] = None
    text: Optional[str] = None
    body: Optional[str] = None
    summary: Optional[str] = None

    sender_email: Optional[str] = None
    sender_name: Optional[str] = None
    participants: List[PartyRef] = Field(default_factory=list)

    payload_json: Dict[str, Any] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    attachments: List[AttachmentRef] = Field(default_factory=list)

    source_created_at: Optional[str] = None
    source_updated_at: Optional[str] = None

    messages: List[Dict[str, Any]] = Field(default_factory=list)
    claim_id: Optional[str] = None

    @model_validator(mode="after")
    def _validate_by_source_type(self) -> "IntentClassificationRequest":
        st = self.source_type

        if st == "email":
            if not (self.subject and self.body and self.sender_email):
                raise ValueError(
                    "source_type=email requires subject, body, and sender_email"
                )
        elif st == "chat":
            if not (self.text or self.messages):
                raise ValueError(
                    "source_type=chat requires text or a non-empty messages array"
                )
        elif st == "document":
            if not (self.text or self.attachments):
                raise ValueError(
                    "source_type=document requires text or at least one attachment"
                )
        elif st == "api_event":
            if not self.payload_json:
                raise ValueError("source_type=api_event requires payload_json")
        elif st == "support_ticket":
            if not (self.title or self.text):
                raise ValueError("source_type=support_ticket requires title or text")
        elif st == "claim":
            if not (self.payload_json and self.claim_id):
                raise ValueError(
                    "source_type=claim requires payload_json and a claim_id"
                )
        elif st == "policy":
            if not (self.text or self.payload_json):
                raise ValueError("source_type=policy requires text or payload_json")
        elif st == "patient_record":
            if not (self.payload_json or self.attachments):
                raise ValueError(
                    "source_type=patient_record requires payload_json or a document attachment"
                )
        elif st == "webhook_event":
            if not self.payload_json:
                raise ValueError("source_type=webhook_event requires payload_json")
            if not (self.metadata.get("event_type") or self.payload_json.get("event_type")):
                raise ValueError(
                    "source_type=webhook_event requires an event_type in metadata or payload_json"
                )
        elif st == "batch_row":
            if not self.payload_json:
                raise ValueError("source_type=batch_row requires payload_json (the row data)")
        elif st == "form_submission":
            if not self.payload_json:
                raise ValueError(
                    "source_type=form_submission requires payload_json (the submitted form fields)"
                )
        elif st == "agent_output":
            if not (self.summary or self.text or self.payload_json):
                raise ValueError(
                    "source_type=agent_output requires summary, text, or payload_json"
                )

        return self

    def to_legacy_email_request(self) -> Dict[str, Any]:
        """
        Backward-compat helper — produces the exact kwargs shape that
        services.eivs.intent_service.classify_email expects, for
        source_type == "email" requests.
        """
        if self.source_type != "email":
            raise ValueError(
                "to_legacy_email_request() is only valid for "
                f"source_type=email, got source_type={self.source_type!r}"
            )
        return {
            "tenant_id": self.tenant_id,
            "email_id": self.entity_id or self.request_id,
            "subject": self.subject,
            "body": self.body,
            "sender_email": self.sender_email,
            "language_hint": self.language_hint,
            "correlation_id": self.correlation_id,
        }


class IntentExecutionResult(BaseModel):
    """
    Required normalized result contract. Every intent-related executor
    returns exactly this shape.
    """

    status: Literal["success", "skipped", "failed"]
    decision: Optional[str] = None
    confidence: Optional[float] = None
    primary_intent_code: Optional[str] = None
    reasons: List[str] = Field(default_factory=list)
    evidence: Dict[str, Any] = Field(default_factory=dict)
    trace_ids: Dict[str, Any] = Field(default_factory=dict)
    raw_payload: Dict[str, Any] = Field(default_factory=dict)