from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class TrainRequest(BaseModel):
    doc_type_name: str
    sample_text: str
    sample_texts: list[str] | None = None
    schema_definition: dict[str, Any]
    confidence_threshold: float = Field(default=0.80)


class TrainResponse(BaseModel):
    doc_id: str
    doc_type_name: str
    status: str
    template_count: int = 1


class ParseResponse(BaseModel):
    document_id: str
    fields: dict[str, Any]
    confidence: float
    audit_id: str
    parser_used: str = ""
    pii_redacted: bool = False
    intent: dict[str, Any] = Field(default_factory=dict)
    validation: dict[str, Any] = Field(default_factory=dict)
    connector_results: list[dict[str, Any]] = Field(default_factory=list)
    status: str = "completed"
    review_required: bool = False
    confidence_threshold: float | None = None


class ParseCorrectionRequest(BaseModel):
    corrected_fields: dict[str, Any]
    notes: str | None = None


class ParseCorrectionResponse(BaseModel):
    id: str
    parse_request_id: str
    doc_id: str | None = None
    original_fields: dict[str, Any]
    corrected_fields: dict[str, Any]
    reviewer_id: str | None = None
    notes: str | None = None
    created_at: str | None = None
    learning: dict[str, Any] = Field(default_factory=dict)


class UploadResponse(BaseModel):
    filename: str
    parser_used: str
    content_preview: str
    tables_found: int


class ParsingRuleCreate(BaseModel):
    doc_type_id: str
    field_name: str
    match_type: str = "regex"
    pattern: str
    description: str | None = None


class ParsingRuleResponse(BaseModel):
    id: str
    doc_type_id: str
    field_name: str
    match_type: str
    pattern: str
    description: str | None = None
    created_at: str | None = None
    updated_at: str | None = None


class ParsingRuleVersionCreate(BaseModel):
    field_name: str | None = None
    match_type: str | None = None
    pattern: str
    description: str | None = None
    activate: bool = True


class ParsingRuleVersionResponse(BaseModel):
    id: str
    parsing_rule_id: str
    version_number: int
    field_name: str
    match_type: str
    pattern: str
    description: str | None = None
    is_active: bool = True
    created_at: str | None = None
    updated_at: str | None = None


class FieldMappingCreate(BaseModel):
    doc_type_id: str
    source_field: str
    target_field: str
    transform: str = "copy"
    is_active: bool = True


class FieldMappingResponse(BaseModel):
    id: str
    doc_type_id: str
    source_field: str
    target_field: str
    transform: str = "copy"
    is_active: bool = True
    created_at: str | None = None
    updated_at: str | None = None
