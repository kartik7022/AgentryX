from __future__ import annotations

import os
import re
import shutil
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.responses import JSONResponse, Response
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.auth import (
    RegisterRequest,
    TOKEN_BLOCKLIST,
    authenticate_user,
    create_access_token,
    create_user,
    get_current_user,
    get_current_user_optional,
    oauth2_scheme,
    require_role,
)
from app.audit import get_audit_trail, log_event
from app.connectors.rag_connector import RAGConnector
from app.compliance import redact_pii, redact_pii_from_fields, validate_schema
from app.db import DocumentType, FieldMapping, ParseCorrection, ParseRequest, ParsingRule, ParsingRuleVersion, User, get_db
from app.connectors.dispatcher import ConnectorDispatcher
from app.intent_classifier import IntentClassificationRequest
from app.models.registry import ModelRegistry
from app.router import route_document
from app.schemas import (
    ParseResponse,
    ParseCorrectionRequest,
    ParseCorrectionResponse,
    FieldMappingCreate,
    FieldMappingResponse,
    ParsingRuleCreate,
    ParsingRuleResponse,
    ParsingRuleVersionCreate,
    ParsingRuleVersionResponse,
    TrainRequest,
    TrainResponse,
    UploadResponse,
)
from app.vector_store import VectorStore

try:
    from prometheus_client import CONTENT_TYPE_LATEST, Counter, Gauge, Histogram, generate_latest
except ImportError:  # pragma: no cover
    CONTENT_TYPE_LATEST = "text/plain"
    generate_latest = None
    Counter = Gauge = Histogram = None


app = FastAPI(title="DocAI", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
ml_registry = ModelRegistry()
registry = ml_registry
vector_store = VectorStore()
connector_dispatcher = ConnectorDispatcher()
rag_connector = RAGConnector()

docai_requests_total = Counter(
    "docai_requests_total",
    "Total requests",
    ["endpoint", "method", "status_code"],
)
docai_request_duration_seconds = Histogram(
    "docai_request_duration_seconds",
    "Request duration in seconds",
    ["endpoint"],
    buckets=(0.1, 0.5, 1, 2, 5, 10),
)
docai_parse_total = Counter(
    "docai_parse_total",
    "Total parse attempts",
    ["doc_type_name", "parser_used", "status"],
)
docai_confidence_score = Histogram(
    "docai_confidence_score",
    "Confidence score distribution",
    ["doc_type_name"],
    buckets=(0.5, 0.6, 0.7, 0.8, 0.9, 1.0),
)
docai_pii_redactions_total = Counter(
    "docai_pii_redactions_total",
    "Total PII redactions",
    ["entity_type"],
)
docai_registered_doc_types_total = Gauge(
    "docai_registered_doc_types_total",
    "Registered document types count",
)


@app.middleware("http")
async def metrics_middleware(request, call_next):
    endpoint = request.url.path
    with docai_request_duration_seconds.labels(endpoint=endpoint).time():
        response = await call_next(request)
    docai_requests_total.labels(
        endpoint=endpoint,
        method=request.method,
        status_code=str(response.status_code),
    ).inc()
    return response


@app.post("/auth/register")
async def register_user(
    request: RegisterRequest,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    existing_users = db.query(User).all()
    if existing_users and (current_user is None or current_user.role != "admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    if db.query(User).filter(User.email == request.email).first():
        raise HTTPException(status_code=400, detail="User already exists")
    user = create_user(db, request.email, request.password, request.role)
    return {"id": str(user.id), "email": user.email, "role": user.role, "is_active": user.is_active}


@app.post("/auth/jwt/login")
async def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    access_token = create_access_token(
        {
            "sub": user.email,
            "role": user.role,
            "user_id": str(user.id),
        }
    )
    return {"access_token": access_token, "token_type": "bearer"}


@app.get("/auth/me")
async def read_current_user(current_user: User = Depends(get_current_user)):
    return {
        "id": str(current_user.id),
        "email": current_user.email,
        "role": current_user.role,
        "is_active": current_user.is_active,
    }


@app.post("/auth/logout")
async def logout(current_user: User = Depends(get_current_user), token: str = Depends(oauth2_scheme)):
    TOKEN_BLOCKLIST.add(token)
    return {"status": "logged_out", "user": current_user.email}


def _save_upload_to_temp(file: UploadFile) -> str:
    temp_dir = tempfile.gettempdir()
    temp_path = os.path.join(temp_dir, f"{uuid4()}_{file.filename}")
    with open(temp_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return temp_path


def _clean_ocr_text(text: str) -> str:
    text = text.replace("\u00a0", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\s*\n\s*", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _sanitize_insurance_value(field_name: str, value: str) -> str:
    value = value.strip().strip(" :;,-._[]()")
    if not value:
        return ""
    lower = value.lower()
    if len(value) <= 3:
        return ""
    if lower in {"dd/mm/yyyy", "dd/mm/yyyy_", "am pm", "am", "pm", "yes no", "city", "state", "pin", "if any", "if any and"}:
        return ""
    if re.fullmatch(r"\d{1,2}/\d{1,2}/\d{2,4}", value):
        return value
    if len(value.split()) > 8:
        return ""
    if value.startswith(("a.", "b.", "c.", "d.", "e.", "f.", "g.", "h.", "i.", "j.", "k.")):
        return ""
    if field_name in {"class_of_vehicle", "driver_role", "loss_type"}:
        option_hits = 0
        for option in [
            "pvt car",
            "two wheeler",
            "commercial",
            "owner",
            "paid driver",
            "relative/friend",
            "own damage",
            "theft",
            "third party",
            "bodily injury",
            "death",
            "property damage",
            "personal",
            "official business",
            "hire carriage of goods",
            "any other",
        ]:
            if option in lower:
                option_hits += 1
        if option_hits > 1 or lower.startswith("[") or ";" in value:
            return ""
    if field_name in {"accident_date", "first_registration_date", "fir_date"} and "dd/mm/yyyy" in lower:
        return ""
    if any(token in lower for token in ["insured details", "driver details", "garage details", "accident details", "details of", "driver at the", "of accident", "policy details", "claim form", "if any"]):
        return ""
    if re.search(r"\b(political|commercial|insured details|accident details|garage details|policy details)\b", lower):
        return ""
    if re.search(r"\b(form|claim form|instructions|registered and corporate office|email contactus)\b", lower):
        return ""
    return value


def _serialize_parsing_rule(rule: ParsingRule) -> dict[str, Any]:
    return {
        "id": str(rule.id),
        "doc_type_id": str(rule.doc_type_id),
        "field_name": rule.field_name,
        "match_type": rule.match_type,
        "pattern": rule.pattern,
        "description": rule.description,
        "created_at": rule.created_at.isoformat() if rule.created_at else None,
        "updated_at": rule.updated_at.isoformat() if rule.updated_at else None,
    }


def _serialize_parsing_rule_version(version: ParsingRuleVersion) -> dict[str, Any]:
    return {
        "id": str(version.id),
        "parsing_rule_id": str(version.parsing_rule_id),
        "version_number": int(version.version_number or 1),
        "field_name": version.field_name,
        "match_type": version.match_type,
        "pattern": version.pattern,
        "description": version.description,
        "is_active": bool(getattr(version, "is_active", True)),
        "created_at": version.created_at.isoformat() if version.created_at else None,
        "updated_at": version.updated_at.isoformat() if version.updated_at else None,
    }


def _serialize_field_mapping(mapping: FieldMapping) -> dict[str, Any]:
    return {
        "id": str(mapping.id),
        "doc_type_id": str(mapping.doc_type_id),
        "source_field": mapping.source_field,
        "target_field": mapping.target_field,
        "transform": mapping.transform or "copy",
        "is_active": bool(getattr(mapping, "is_active", True)),
        "created_at": mapping.created_at.isoformat() if mapping.created_at else None,
        "updated_at": mapping.updated_at.isoformat() if mapping.updated_at else None,
    }


def _apply_parsing_rules(content: str, rules: list[ParsingRule]) -> dict[str, Any]:
    extracted: dict[str, Any] = {}
    for rule in rules:
        match_type = (rule.match_type or "regex").lower()
        pattern = rule.pattern or ""
        if match_type == "regex":
            match = re.search(pattern, content, re.IGNORECASE | re.MULTILINE | re.DOTALL)
            if not match:
                continue
            value = next((group for group in match.groups() if group), match.group(0))
        elif match_type == "keyword":
            if pattern.lower() not in content.lower():
                continue
            value = pattern
        else:
            continue

        value = str(value).strip()
        if value:
            extracted[rule.field_name] = value
    return extracted


def _build_validation_report(db: Session, doc_type_id: str | None, fields: dict[str, Any]) -> dict[str, Any]:
    if not doc_type_id:
        return {"valid": True, "missing_fields": [], "extra_fields": [], "type_errors": []}
    document_type = db.query(DocumentType).filter(DocumentType.id == doc_type_id).first()
    if not document_type or not getattr(document_type, "schema_definition", None):
        return {"valid": True, "missing_fields": [], "extra_fields": [], "type_errors": []}
    return validate_schema(fields, document_type.schema_definition or {})


def _strip_internal_fields(fields: dict[str, Any]) -> dict[str, Any]:
    cleaned = dict(fields)
    cleaned.pop("content", None)
    return cleaned


def _snake_case_label(label: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9]+", "_", label or "").strip("_").lower()
    cleaned = re.sub(r"_+", "_", cleaned)
    return cleaned[:80]


def _infer_schema_type(field_name: str, value: Any) -> str:
    name = (field_name or "").lower()
    text = str(value or "").strip()
    lowered = text.lower()
    if name.startswith("is_") or lowered in {"true", "false", "yes", "no"}:
        return "boolean"
    if any(token in name for token in ("date", "dob", "expiry")):
        return "string"
    if any(token in name for token in ("amount", "total", "loss", "balance", "price", "cost")):
        return "number"
    if "," in text and len([part for part in text.split(",") if part.strip()]) > 1:
        return "array"
    if re.fullmatch(r"[-+]?\d+(?:,\d{3})*(?:\.\d+)?", text):
        return "number"
    return "string"


def _add_schema_suggestion(
    suggestions: dict[str, dict[str, Any]],
    field_name: str,
    field_type: str,
    evidence: str,
    confidence: float,
) -> None:
    normalized_name = _snake_case_label(field_name)
    if not normalized_name or len(normalized_name) < 2:
        return
    current = suggestions.get(normalized_name)
    suggestion = {
        "field_name": normalized_name,
        "type": field_type,
        "evidence": str(evidence or "")[:180],
        "confidence": round(min(max(confidence, 0.0), 1.0), 2),
    }
    if current is None or suggestion["confidence"] > current["confidence"]:
        suggestions[normalized_name] = suggestion


def suggest_schema_from_text(text: str) -> dict[str, Any]:
    cleaned_text = _clean_ocr_text(text or "")
    suggestions: dict[str, dict[str, Any]] = {}

    labeled_patterns = [
        r"(?im)^\s*([A-Za-z][A-Za-z0-9 /#().-]{1,60})\s*[:\-]\s*([^\n\r]{1,160})",
        r"(?i)\b(Invoice Number|Claim Number|Policy Number|Registration No|Vehicle No|Passport Number|Purchase Order|PO Number|Total Amount|Estimated Loss|Date of Birth|DOB|Accident Date|Vendor Name|Insurer Name|Patient Name|Account Number)\b\s*[:#-]?\s*([A-Z0-9][A-Z0-9 .,@/#&()-]{1,120})",
    ]
    for pattern in labeled_patterns:
        for match in re.finditer(pattern, cleaned_text):
            raw_label = match.group(1).strip()
            raw_value = match.group(2).strip(" .")
            if not raw_value or raw_value.lower() in {"details", "information", "section"}:
                continue
            field_name = _snake_case_label(raw_label)
            _add_schema_suggestion(
                suggestions,
                field_name,
                _infer_schema_type(field_name, raw_value),
                f"{raw_label}: {raw_value}",
                0.86,
            )

    pattern_suggestions = [
        ("invoice_number", "string", r"\b(INV[-\s]?\d{3,}(?:-\d+)?)\b", 0.9),
        ("claim_number", "string", r"\b(?:claim\s*(?:number|no)\s*[:#-]?\s*)([A-Z0-9-]{3,})", 0.9),
        ("policy_number", "string", r"\b(?:policy\s*(?:number|no)\s*[:#-]?\s*)([A-Z0-9-]{3,})", 0.9),
        ("purchase_order_number", "string", r"\b(?:PO|purchase order)\s*#?\s*([A-Z0-9-]{3,})\b", 0.86),
        ("passport_number", "string", r"\b(?:passport\s*(?:number|no)\s*[:#-]?\s*)([A-Z][0-9]{6,})\b", 0.9),
        ("account_number", "string", r"\b(?:account\s*(?:number|no)\s*[:#-]?\s*)([A-Z0-9-]{4,})\b", 0.88),
        ("ssn", "string", r"\b(\d{3}-\d{2}-\d{4})\b", 0.92),
        ("email", "string", r"\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b", 0.9),
        ("phone", "string", r"\b(\+?\d[\d\s().-]{7,}\d)\b", 0.78),
        ("date", "string", r"\b(\d{4}-\d{2}-\d{2}|\d{2}[/-]\d{2}[/-]\d{4})\b", 0.76),
        ("total_amount", "number", r"\b(?:total|amount|total amount|estimated loss)\s*(?:is|:)?\s*(?:rs\.?|inr|\$)?\s*([\d,]+(?:\.\d{2})?)\b", 0.84),
    ]
    for field_name, field_type, pattern, confidence in pattern_suggestions:
        match = re.search(pattern, cleaned_text, re.IGNORECASE)
        if match:
            _add_schema_suggestion(suggestions, field_name, field_type, match.group(0), confidence)

    extracted = _strip_internal_fields(_extract_fields(cleaned_text))
    for field_name, value in extracted.items():
        if value in (None, "", [], {}):
            continue
        _add_schema_suggestion(
            suggestions,
            field_name,
            _infer_schema_type(field_name, value),
            f"{field_name}: {value}",
            0.72,
        )

    ordered_suggestions = sorted(
        suggestions.values(),
        key=lambda item: (-item["confidence"], item["field_name"]),
    )
    schema_definition = {
        item["field_name"]: item["type"]
        for item in ordered_suggestions
    }
    return {
        "schema_definition": schema_definition,
        "suggested_fields": ordered_suggestions,
        "field_count": len(schema_definition),
        "sample_text": cleaned_text[:3000],
    }


def _document_classification_threshold() -> float:
    try:
        threshold = float(os.getenv("DOCUMENT_CLASSIFICATION_THRESHOLD", "0.75"))
    except ValueError:
        threshold = 0.75
    return min(max(threshold, 0.0), 1.0)


def _training_samples_from_request(request: TrainRequest) -> list[str]:
    candidates = [request.sample_text, *(request.sample_texts or [])]
    samples: list[str] = []
    seen: set[str] = set()
    for candidate in candidates:
        normalized = re.sub(r"\s+", " ", candidate or "").strip()
        if not normalized or normalized.lower() in seen:
            continue
        seen.add(normalized.lower())
        samples.append(normalized)
    return samples


def _verify_document_type(extracted_text: str, expected_doc_id: str | None = None) -> dict[str, Any]:
    normalized_text = re.sub(r"\s+", " ", extracted_text or "").strip()
    try:
        minimum_length = max(int(os.getenv("DOCUMENT_MIN_TEXT_LENGTH", "20")), 1)
    except ValueError:
        minimum_length = 20

    if len(normalized_text) < minimum_length:
        return {
            "verified": False,
            "reason": "unreadable_document",
            "message": "The document did not contain enough readable text to classify safely.",
        }

    threshold = _document_classification_threshold()
    match = vector_store.lookup(normalized_text, threshold=threshold)
    if not match:
        return {
            "verified": False,
            "reason": "unknown_document_type",
            "message": "The document does not match any trained document type.",
            "threshold": threshold,
        }

    detected_doc_id = str(match["doc_id"])
    similarity_score = float(match["similarity_score"])
    if expected_doc_id is not None and detected_doc_id != str(expected_doc_id):
        return {
            "verified": False,
            "reason": "document_type_mismatch",
            "message": "The document matches a different trained document type.",
            "expected_doc_id": str(expected_doc_id),
            "detected_doc_id": detected_doc_id,
            "similarity_score": similarity_score,
            "threshold": threshold,
        }

    return {
        "verified": True,
        "doc_id": detected_doc_id,
        "similarity_score": similarity_score,
        "threshold": threshold,
    }


def _transform_mapped_value(value: Any, transform: str | None) -> Any:
    if value is None:
        return value
    transform_name = (transform or "copy").lower()
    if transform_name == "strip":
        return str(value).strip()
    if transform_name == "uppercase":
        return str(value).strip().upper()
    if transform_name == "lowercase":
        return str(value).strip().lower()
    if transform_name == "number":
        text_value = re.sub(r"[^\d.\-]", "", str(value))
        if not text_value:
            return value
        try:
            number = float(text_value)
            return int(number) if number.is_integer() else number
        except ValueError:
            return value
    return value


def _apply_field_mappings(fields: dict[str, Any], mappings: list[FieldMapping]) -> dict[str, Any]:
    mapped = dict(fields)
    for mapping in mappings:
        if not getattr(mapping, "is_active", True):
            continue
        source = mapping.source_field
        target = mapping.target_field
        if source not in mapped:
            continue
        value = mapped.pop(source)
        mapped[target] = _transform_mapped_value(value, mapping.transform)
    return mapped


def _extract_insurance_claim_fields(content: str) -> dict[str, Any]:
    text = _clean_ocr_text(content)
    normalized = re.sub(r"\s+", " ", text)
    lower = normalized.lower()
    insurer_match = re.search(r"\b(Universal\s+Sompo\s+General\s+Insurance)\b", normalized, re.IGNORECASE)
    form_title_match = re.search(r"\b(MOTOR\s+INSURANCE\s+CLAIM\s+FORM)\b", normalized, re.IGNORECASE)
    marker_specs: list[tuple[str, list[str]]] = [
        ("claim_number", [r"Claim\s*No", r"Claim\s*Number", r"Claim\s*No\."]),
        ("estimated_loss_rs", [r"Estimated\s*loss\s*Rs", r"Estimated\s*loss", r"Loss\s*estimate"]),
        ("registration_no", [r"Registration\s*No", r"Registration\s*Number", r"Reg\s*No"]),
        ("vehicle_no", [r"Vehicle\s*No", r"Vehicle\s*Number"]),
        ("chassis_no", [r"Chasis\s*No", r"Chassis\s*No"]),
        ("date_of_transfer", [r"Date\s*of\s*Transfer"]),
        ("policy_number", [r"Policy\s*No", r"Policy\s*Number"]),
        ("class_of_vehicle", [r"Class\s*of\s*Vehicle"]),
        ("engine_no", [r"Engine\s*No", r"Engine\s*Number"]),
        ("first_registration_date", [r"Date\s*of\s*first\s*Registration"]),
        ("financier_name", [r"Name\s*of\s*Financier\s*if\s*any", r"Name\s*of\s*Financier"]),
        ("insured_name", [r"Insured\s*/\s*Claimant\s*Name", r"Insured\s*Name", r"Claimant\s*Name"]),
        ("address", [r"Address"]),
        ("city", [r"City"]),
        ("pin", [r"Pin", r"Pin\s*Code"]),
        ("state", [r"State"]),
        ("pan", [r"PAN"]),
        ("occupation", [r"Occupation\s*Profession", r"Occupation"]),
        ("driver_name", [r"Name\s*as\s*per\s*Govt[: ]*record/Driving\s*license", r"Name\s*as\s*per\s*Govt[: ]*record", r"Driver\s*Name"]),
        ("driver_role", [r"Driver\s*is"]),
        ("driving_license_no", [r"Driving\s*License\s*No", r"Driving\s*License"]),
        ("garage_name", [r"Name\s*of\s*Garage\s*reported", r"Garage\s*Name"]),
        ("garage_address", [r"Address\s*of\s*Garage", r"Garage\s*Address"]),
        ("garage_contact_numbers", [r"Garage\s*Contact\s*Numbers", r"Contact\s*Numbers"]),
        ("accident_date", [r"Time\s*&\s*Date\s*of\s*Accident\s*Occurrence", r"Date\s*of\s*Accident", r"Accident\s*Date"]),
        ("accident_time", [r"\bTime\b"]),
        ("accident_place", [r"Place\s*of\s*Accident", r"\bPlace\b"]),
        ("purpose_for_use", [r"Purpose\s*for\s*which\s*vehicle\s*was\s*being\s*used"]),
        ("loss_type", [r"Type\s*of\s*Loss"]),
        ("fir_number", [r"Police\s*FIR\s*no", r"FIR\s*no"]),
        ("police_station", [r"Police\s*Station\s*Address", r"Police\s*Station"]),
        ("fir_date", [r"FIR\s*Date"]),
        ("fire_brigade_location", [r"Fire\s*Brigade\s*Location"]),
        ("prior_damage", [r"Was\s*there\s*any\s*damage\s*to\s*your\s*vehicle\s*prior\s*to\s*this\s*loss/damage"]),
        ("speed_at_loss", [r"Approx[: ]*speed\s*at\s*the\s*Time\s*of\s*Loss", r"speed\s*at\s*the\s*Time\s*of\s*Loss"]),
    ]

    matches: list[tuple[int, int, str]] = []
    for field_name, patterns in marker_specs:
        for pattern in patterns:
            match = re.search(pattern, normalized, re.IGNORECASE)
            if match:
                matches.append((match.start(), match.end(), field_name))
                break
    matches.sort(key=lambda item: item[0])

    result: dict[str, Any] = {}
    for index, (start, end, field_name) in enumerate(matches):
        next_start = len(normalized)
        for later_start, _, _ in matches[index + 1 :]:
            if later_start > end:
                next_start = later_start
                break
        chunk = normalized[end:next_start].strip()
        chunk = re.sub(r"^[\s:;,\-_.]+", "", chunk)
        chunk = re.split(r"\s{2,}", chunk, maxsplit=1)[0].strip()

        label_like = re.sub(r"[^A-Za-z]+", " ", chunk).strip().lower()
        if not chunk or len(chunk) < 2:
            value = ""
        elif len(label_like.split()) >= 4 and not re.search(r"\d|\b(yes|no|owner|driver|private|commercial|car|two wheeler|damage|accident)\b", chunk, re.IGNORECASE):
            value = ""
        elif re.fullmatch(r"[:\s\W]+", chunk):
            value = ""
        else:
            value = chunk[:120].strip()
        result[field_name] = _sanitize_insurance_value(field_name, value)

    extracted = {
        "insurer_name": insurer_match.group(1).strip() if insurer_match else "",
        "form_title": form_title_match.group(1).title() if form_title_match else "Motor Insurance Claim Form",
        "is_blank_form": not any(
            result.get(key)
            for key in [
                "claim_number",
                "policy_number",
                "registration_no",
                "insured_name",
                "driver_name",
                "accident_date",
                "accident_place",
            ]
        ),
        "sections_detected": [
            section
            for section, needle in {
                "policy_details": "policy details",
                "insured_details": "insured details",
                "driver_details": "details of the driver",
                "garage_details": "garage details",
                "accident_details": "accident details",
            }.items()
            if needle in lower
        ],
        "claim_number": result.get("claim_number", ""),
        "estimated_loss_rs": result.get("estimated_loss_rs", ""),
        "registration_no": result.get("registration_no", ""),
        "vehicle_no": result.get("vehicle_no", ""),
        "chassis_no": result.get("chassis_no", ""),
        "date_of_transfer": result.get("date_of_transfer", ""),
        "policy_number": result.get("policy_number", ""),
        "class_of_vehicle": result.get("class_of_vehicle", ""),
        "engine_no": result.get("engine_no", ""),
        "first_registration_date": result.get("first_registration_date", ""),
        "financier_name": result.get("financier_name", ""),
        "insured_name": result.get("insured_name", ""),
        "address": result.get("address", ""),
        "city": result.get("city", ""),
        "pin": result.get("pin", ""),
        "state": result.get("state", ""),
        "pan": result.get("pan", ""),
        "occupation": result.get("occupation", ""),
        "driver_name": result.get("driver_name", ""),
        "driver_role": result.get("driver_role", ""),
        "driving_license_no": result.get("driving_license_no", ""),
        "garage_name": result.get("garage_name", ""),
        "garage_address": result.get("garage_address", ""),
        "garage_contact_numbers": result.get("garage_contact_numbers", ""),
        "accident_date": result.get("accident_date", ""),
        "accident_time": result.get("accident_time", ""),
        "accident_place": result.get("accident_place", ""),
        "purpose_for_use": result.get("purpose_for_use", ""),
        "loss_type": result.get("loss_type", ""),
        "fir_number": result.get("fir_number", ""),
        "police_station": result.get("police_station", ""),
        "fir_date": result.get("fir_date", ""),
        "fire_brigade_location": result.get("fire_brigade_location", ""),
        "prior_damage": result.get("prior_damage", ""),
        "speed_at_loss": result.get("speed_at_loss", ""),
    }
    return extracted


def list_parsing_rules(db: Session, doc_type_id: str | None = None) -> list[dict[str, Any]]:
    query = db.query(ParsingRule)
    if doc_type_id:
        query = query.filter(ParsingRule.doc_type_id == doc_type_id)
    return [_serialize_parsing_rule(rule) for rule in query.order_by(ParsingRule.created_at.asc()).all()]


def create_parsing_rule(db: Session, request: ParsingRuleCreate) -> ParsingRule:
    document_type = db.query(DocumentType).filter(DocumentType.id == request.doc_type_id).first()
    if not document_type:
        raise HTTPException(status_code=404, detail="Document type not found")
    rule = ParsingRule(
        doc_type_id=request.doc_type_id,
        field_name=request.field_name,
        match_type=request.match_type,
        pattern=request.pattern,
        description=request.description,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)

    version = ParsingRuleVersion(
        parsing_rule_id=rule.id,
        version_number=1,
        field_name=request.field_name,
        match_type=request.match_type,
        pattern=request.pattern,
        description=request.description,
        is_active=True,
    )
    db.add(version)
    db.commit()
    db.refresh(version)
    return rule


def delete_parsing_rule(db: Session, rule_id: str) -> bool:
    rule = db.query(ParsingRule).filter(ParsingRule.id == rule_id).first()
    if not rule:
        return False
    db.delete(rule)
    db.commit()
    return True


def list_field_mappings(db: Session, doc_type_id: str | None = None) -> list[dict[str, Any]]:
    query = db.query(FieldMapping)
    if doc_type_id:
        query = query.filter(FieldMapping.doc_type_id == doc_type_id)
    mappings = query.order_by(FieldMapping.created_at.asc()).all()
    return [_serialize_field_mapping(mapping) for mapping in mappings]


def create_field_mapping(db: Session, request: FieldMappingCreate) -> FieldMapping:
    document_type = db.query(DocumentType).filter(DocumentType.id == request.doc_type_id).first()
    if not document_type:
        raise HTTPException(status_code=404, detail="Document type not found")
    mapping = FieldMapping(
        doc_type_id=request.doc_type_id,
        source_field=request.source_field.strip(),
        target_field=request.target_field.strip(),
        transform=request.transform or "copy",
        is_active=request.is_active,
    )
    db.add(mapping)
    db.commit()
    db.refresh(mapping)
    return mapping


def delete_field_mapping(db: Session, mapping_id: str) -> bool:
    mapping = db.query(FieldMapping).filter(FieldMapping.id == mapping_id).first()
    if not mapping:
        return False
    db.delete(mapping)
    db.commit()
    return True


def list_parsing_rule_versions(db: Session, rule_id: str) -> list[dict[str, Any]]:
    versions = (
        db.query(ParsingRuleVersion)
        .filter(ParsingRuleVersion.parsing_rule_id == rule_id)
        .order_by(ParsingRuleVersion.version_number.asc())
        .all()
    )
    return [_serialize_parsing_rule_version(version) for version in versions]


def create_parsing_rule_version(db: Session, rule_id: str, request: ParsingRuleVersionCreate) -> ParsingRuleVersion:
    rule = db.query(ParsingRule).filter(ParsingRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Parsing rule not found")

    latest = (
        db.query(ParsingRuleVersion)
        .filter(ParsingRuleVersion.parsing_rule_id == rule_id)
        .order_by(ParsingRuleVersion.version_number.desc())
        .first()
    )
    next_version = int(latest.version_number + 1) if latest else 1

    version = ParsingRuleVersion(
        parsing_rule_id=rule_id,
        version_number=next_version,
        field_name=request.field_name or rule.field_name,
        match_type=request.match_type or rule.match_type,
        pattern=request.pattern,
        description=request.description or rule.description,
        is_active=bool(request.activate),
    )
    db.add(version)

    if request.activate:
        rule.field_name = version.field_name
        rule.match_type = version.match_type
        rule.pattern = version.pattern
        rule.description = version.description
        for existing in db.query(ParsingRuleVersion).filter(ParsingRuleVersion.parsing_rule_id == rule_id).all():
            existing.is_active = False
        version.is_active = True

    db.commit()
    db.refresh(version)
    db.refresh(rule)
    return version


def activate_parsing_rule_version(db: Session, rule_id: str, version_id: str) -> ParsingRuleVersion | None:
    rule = db.query(ParsingRule).filter(ParsingRule.id == rule_id).first()
    version = (
        db.query(ParsingRuleVersion)
        .filter(
            ParsingRuleVersion.id == version_id,
            ParsingRuleVersion.parsing_rule_id == rule_id,
        )
        .first()
    )
    if not rule or not version:
        return None

    for existing in db.query(ParsingRuleVersion).filter(ParsingRuleVersion.parsing_rule_id == rule_id).all():
        existing.is_active = False
    version.is_active = True
    rule.field_name = version.field_name
    rule.match_type = version.match_type
    rule.pattern = version.pattern
    rule.description = version.description
    db.commit()
    db.refresh(version)
    db.refresh(rule)
    return version


def _get_rules_for_doc_type(db: Session, doc_type_name: str | None, doc_type_id: str | None = None) -> list[ParsingRule]:
    query = db.query(ParsingRule)
    if doc_type_id:
        return query.filter(ParsingRule.doc_type_id == doc_type_id).order_by(ParsingRule.created_at.asc()).all()
    if doc_type_name:
        document_type = db.query(DocumentType).filter(DocumentType.doc_type_name == doc_type_name).first()
        if document_type:
            return query.filter(ParsingRule.doc_type_id == str(document_type.id)).order_by(ParsingRule.created_at.asc()).all()
    return []


def _get_mappings_for_doc_type(db: Session, doc_type_name: str | None, doc_type_id: str | None = None) -> list[FieldMapping]:
    query = db.query(FieldMapping)
    if doc_type_id:
        return query.filter(FieldMapping.doc_type_id == doc_type_id).order_by(FieldMapping.created_at.asc()).all()
    if doc_type_name:
        document_type = db.query(DocumentType).filter(DocumentType.doc_type_name == doc_type_name).first()
        if document_type:
            return query.filter(FieldMapping.doc_type_id == str(document_type.id)).order_by(FieldMapping.created_at.asc()).all()
    return []


def _serialize_document_type(document_type: DocumentType) -> dict[str, Any]:
    return {
        "id": str(document_type.id),
        "doc_type_name": document_type.doc_type_name,
        "schema_definition": document_type.schema_definition or {},
        "confidence_threshold": float(document_type.confidence_threshold or 0.0),
        "is_active": bool(getattr(document_type, "is_active", True)),
        "created_at": document_type.created_at.isoformat() if document_type.created_at else None,
        "updated_at": document_type.updated_at.isoformat() if document_type.updated_at else None,
    }


def upsert_document_type(db: Session, request: TrainRequest) -> DocumentType:
    document_type = (
        db.query(DocumentType)
        .filter(DocumentType.doc_type_name == request.doc_type_name)
        .first()
    )
    if document_type is None:
        document_type = DocumentType(
            doc_type_name=request.doc_type_name,
            schema_definition=request.schema_definition,
            confidence_threshold=request.confidence_threshold,
            is_active=True,
        )
        db.add(document_type)
    else:
        document_type.schema_definition = request.schema_definition
        document_type.confidence_threshold = request.confidence_threshold
        if hasattr(document_type, "is_active"):
            document_type.is_active = True
    db.commit()
    db.refresh(document_type)
    try:
        docai_registered_doc_types_total.set(
            sum(1 for item in db.query(DocumentType).all() if getattr(item, "is_active", True))
        )
    except Exception:
        pass
    return document_type


def get_document_type_by_id(db: Session, doc_type_id: str):
    document_type = db.query(DocumentType).filter(DocumentType.id == doc_type_id).first()
    if not document_type or not getattr(document_type, "is_active", True):
        return None
    return _serialize_document_type(document_type)


def list_document_types(db: Session):
    return [
        _serialize_document_type(item)
        for item in db.query(DocumentType).all()
        if getattr(item, "is_active", True)
    ]


def soft_delete_document_type(db: Session, doc_type_id: str):
    document_type = db.query(DocumentType).filter(DocumentType.id == doc_type_id).first()
    if not document_type or not getattr(document_type, "is_active", True):
        return None
    if hasattr(document_type, "is_active"):
        document_type.is_active = False
    db.commit()
    db.refresh(document_type)
    try:
        docai_registered_doc_types_total.set(
            sum(1 for item in db.query(DocumentType).all() if getattr(item, "is_active", True))
        )
    except Exception:
        pass
    return _serialize_document_type(document_type)


def _parse_history_row(row: ParseRequest, db: Session) -> dict[str, Any]:
    created_at = row.created_at
    return {
        "id": str(row.id),
        "doc_id": row.doc_id,
        "doc_type_name": (
            model.get("doc_type")
            if (model := registry.get_model(row.doc_id, db=db))
            else None
        ),
        "file_name": row.file_name,
        "parser_used": row.parser_used,
        "confidence_score": row.confidence_score,
        "extracted_fields": row.extracted_fields or {},
        "pii_redacted": row.pii_redacted,
        "status": row.status,
        "user_id": row.user_id,
        "created_at": created_at.isoformat() if hasattr(created_at, "isoformat") else created_at,
    }


def list_parse_history(db: Session, limit: int = 50):
    rows = (
        db.query(ParseRequest)
        .order_by(ParseRequest.created_at.desc())
        .limit(limit)
        .all()
    )
    return [_parse_history_row(row, db) for row in rows]


def list_review_queue(db: Session, limit: int = 100) -> list[dict[str, Any]]:
    rows = (
        db.query(ParseRequest)
        .filter(ParseRequest.status == "needs_review")
        .order_by(ParseRequest.created_at.desc())
        .limit(limit)
        .all()
    )
    return [_parse_history_row(row, db) for row in rows]


def confidence_threshold_for_doc_type(db: Session, doc_type_id: str | None) -> float:
    if not doc_type_id:
        return 0.80
    document_type = db.query(DocumentType).filter(DocumentType.id == doc_type_id).first()
    if not document_type:
        return 0.80
    try:
        return float(document_type.confidence_threshold or 0.80)
    except (TypeError, ValueError):
        return 0.80


def _serialize_parse_correction(correction: ParseCorrection) -> dict[str, Any]:
    return {
        "id": str(correction.id),
        "parse_request_id": str(correction.parse_request_id),
        "doc_id": correction.doc_id,
        "original_fields": correction.original_fields or {},
        "corrected_fields": correction.corrected_fields or {},
        "reviewer_id": correction.reviewer_id,
        "notes": correction.notes,
        "created_at": correction.created_at.isoformat() if correction.created_at else None,
    }


def _changed_field_names(original_fields: dict[str, Any], corrected_fields: dict[str, Any]) -> list[str]:
    return sorted(
        key
        for key in set(original_fields) | set(corrected_fields)
        if original_fields.get(key) != corrected_fields.get(key)
    )


def _correction_training_sample(corrected_fields: dict[str, Any]) -> str:
    lines = []
    for key, value in sorted((corrected_fields or {}).items()):
        if key == "redaction_summary" or value in (None, "", [], {}):
            continue
        if isinstance(value, (dict, list)):
            value_text = str(value)
        else:
            value_text = str(value)
        lines.append(f"{key}: {value_text}")
    return "\n".join(lines)


def apply_correction_learning(
    db: Session,
    *,
    parse_request: ParseRequest,
    correction: ParseCorrection,
) -> dict[str, Any]:
    original_fields = correction.original_fields or {}
    corrected_fields = correction.corrected_fields or {}
    changed_fields = _changed_field_names(original_fields, corrected_fields)
    learning: dict[str, Any] = {
        "changed_fields": changed_fields,
        "changed_field_count": len(changed_fields),
        "template_registered": False,
        "template_id": None,
        "rules_suggested": [],
    }

    training_sample = _correction_training_sample(corrected_fields)
    if parse_request.doc_id and training_sample:
        try:
            model_info = registry.get_model(parse_request.doc_id, db=db)
            doc_type_id = None
            if model_info:
                doc_type_id = model_info.get("model", {}).get("doc_type_id")
            template_id = vector_store.register_template(
                parse_request.doc_id,
                training_sample,
                doc_type_id=str(doc_type_id) if doc_type_id else None,
            )
            learning["template_registered"] = True
            learning["template_id"] = template_id
        except Exception as exc:
            learning["template_error"] = str(exc)

    for field_name in changed_fields:
        corrected_value = corrected_fields.get(field_name)
        if corrected_value in (None, "", [], {}):
            continue
        learning["rules_suggested"].append(
            {
                "field_name": field_name,
                "type": _infer_schema_type(field_name, corrected_value),
                "strategy": "review_correction",
            }
        )
    return learning


def list_parse_corrections(db: Session, parse_request_id: str) -> list[dict[str, Any]]:
    rows = (
        db.query(ParseCorrection)
        .filter(ParseCorrection.parse_request_id == parse_request_id)
        .order_by(ParseCorrection.created_at.asc())
        .all()
    )
    return [_serialize_parse_correction(row) for row in rows]


def save_parse_correction(
    db: Session,
    *,
    parse_request_id: str,
    corrected_fields: dict[str, Any],
    reviewer_id: str,
    notes: str | None = None,
) -> ParseCorrection | None:
    parse_request = db.query(ParseRequest).filter(ParseRequest.id == parse_request_id).first()
    if not parse_request:
        return None
    original_fields = dict(parse_request.extracted_fields or {})
    correction = ParseCorrection(
        parse_request_id=str(parse_request.id),
        doc_id=parse_request.doc_id,
        original_fields=original_fields,
        corrected_fields=corrected_fields,
        reviewer_id=reviewer_id,
        notes=notes,
    )
    db.add(correction)
    parse_request.extracted_fields = corrected_fields
    parse_request.status = "reviewed"
    db.commit()
    db.refresh(correction)
    db.refresh(parse_request)
    setattr(correction, "_docai_parse_request", parse_request)
    return correction


def list_parse_stats(db: Session, days: int = 7):
    cutoff = datetime.now(timezone.utc) - timedelta(days=days - 1)
    rows = db.query(ParseRequest).all()
    daily_counts: dict[str, int] = {}
    for offset in range(days):
        day = (cutoff + timedelta(days=offset)).date().isoformat()
        daily_counts[day] = 0

    for row in rows:
        created_at = getattr(row, "created_at", None)
        if created_at is None:
            continue
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
        if created_at < cutoff:
            continue
        day_key = created_at.date().isoformat()
        if day_key in daily_counts:
            daily_counts[day_key] += 1

    return [{"date": day, "parse_count": count} for day, count in daily_counts.items()]


def store_parse_request(
    db: Session,
    *,
    doc_id: str,
    file_name: str,
    parser_used: str,
    confidence_score: float,
    extracted_fields: dict[str, Any],
    pii_redacted: bool,
    status: str,
    user_id: str | None = None,
):
    parse_request = ParseRequest(
        doc_id=doc_id,
        file_name=file_name,
        parser_used=parser_used,
        confidence_score=confidence_score,
        extracted_fields=extracted_fields,
        pii_redacted=pii_redacted,
        status=status,
        user_id=user_id,
    )
    db.add(parse_request)
    db.commit()
    db.refresh(parse_request)
    return parse_request


def _extract_fields(content: str, doc_type_name: str | None = None) -> dict[str, Any]:
    text = _clean_ocr_text(content)
    lower = text.lower()
    if doc_type_name == "insurance_claim" or "motor insurance claim form" in lower or "insurance claim" in lower:
        fields = _extract_insurance_claim_fields(text)
        fields["content"] = text[:500]
        return fields
    if doc_type_name == "invoice" or "invoice" in lower:
        invoice_number = re.search(r"invoice\s*number\s*:\s*([A-Z0-9-]+)", text, re.IGNORECASE)
        if not invoice_number:
            invoice_number = re.search(r"\b(INV[-\s]?\d{4,}(?:-\d+)?)\b", text, re.IGNORECASE)
        total_amount = re.search(r"total\s*amount\s*:\s*(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d{2})?)", text, re.IGNORECASE)
        if not total_amount:
            total_amount = re.search(r"amount\s*:\s*(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d{2})?)", text, re.IGNORECASE)
        vendor_match = re.search(r"vendor\s*:\s*(.+?)(?:\n|$)", text, re.IGNORECASE)
        date_match = re.search(r"date\s*:\s*(\d{4}-\d{2}-\d{2})", text, re.IGNORECASE)
        return {
            "invoice_number": (
                invoice_number.group(1).strip()
                if invoice_number and invoice_number.lastindex
                else invoice_number.group(0)
            )
            if invoice_number
            else "",
            "date": date_match.group(1).strip() if date_match else "",
            "total_amount": total_amount.group(1).strip() if total_amount else "",
            "vendor_name": vendor_match.group(1).strip() if vendor_match else "",
        }
    if "purchase order" in lower or "po #" in lower:
        po_match = re.search(r"\bPO\s*#?\s*([A-Z0-9-]+)\b", text, re.IGNORECASE)
        return {
            "purchase_order_number": po_match.group(1) if po_match else "",
            "status": "pending approval" if "approval" in lower else "unknown",
        }
    if "passport" in lower:
        name_match = re.search(r"Passport scan for ([A-Za-z\s]+)", text)
        expiry_match = re.search(r"\b\d{4}-\d{2}-\d{2}\b", text)
        return {
            "full_name": name_match.group(1).strip() if name_match else "",
            "expiry_date": expiry_match.group(0) if expiry_match else "",
        }
    return {"content": text[:500]}


@app.post("/upload/", response_model=UploadResponse)
async def upload_document(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "trainer", "parser")),
):
    temp_path = _save_upload_to_temp(file)
    try:
        parsed = route_document(temp_path)
        audit_id = log_event(
            db,
            event_type="UPLOAD",
            doc_id=file.filename,
            user_id=current_user.email,
            status="success",
            details={"parser_used": parsed.get("parser"), "filename": file.filename},
        )
        return UploadResponse(
            filename=file.filename,
            parser_used=str(parsed.get("parser", "")),
            content_preview=str(parsed.get("content", ""))[:200],
            tables_found=len(parsed.get("tables", []) or []),
        )
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


@app.post("/schema-suggest/")
async def suggest_schema(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "trainer")),
):
    temp_path = _save_upload_to_temp(file)
    try:
        parsed = route_document(temp_path)
        text_content = str(parsed.get("content", ""))
        suggestion = suggest_schema_from_text(text_content)
        audit_id = log_event(
            db,
            event_type="UPLOAD",
            doc_id=file.filename,
            user_id=current_user.email,
            status="schema_suggested",
            details={
                "filename": file.filename,
                "parser_used": parsed.get("parser"),
                "field_count": suggestion["field_count"],
            },
        )
        return {
            "filename": file.filename,
            "parser_used": str(parsed.get("parser", "")),
            "confidence": float(parsed.get("confidence") or 0.0),
            "audit_id": audit_id,
            **suggestion,
        }
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


@app.post("/train/", response_model=TrainResponse)
async def train_document(
    request: TrainRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "trainer")),
):
    training_samples = _training_samples_from_request(request)
    if not training_samples:
        raise HTTPException(status_code=422, detail="At least one non-empty training sample is required")

    document_type = upsert_document_type(db, request)
    doc_id = registry.register(
        request.doc_type_name,
        {
            "status": "trained",
            "model_type": "LayoutLMv3",
        },
        doc_type_id=str(document_type.id),
        db=db,
    )
    for sample in training_samples:
        vector_store.register_template(doc_id, sample, doc_type_id=str(document_type.id))
    ml_registry.register_model(doc_id, request.doc_type_name, {"status": "trained"})
    log_event(
        db,
        event_type="TRAIN",
        doc_id=doc_id,
        user_id=current_user.email,
        status="success",
        details={"doc_type_name": request.doc_type_name, "template_count": len(training_samples)},
    )
    return TrainResponse(
        doc_id=doc_id,
        doc_type_name=request.doc_type_name,
        status="trained",
        template_count=len(training_samples),
    )


@app.get("/parsing-rules/")
async def get_parsing_rules(
    doc_type_id: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "trainer", "parser", "viewer")),
):
    return list_parsing_rules(db, doc_type_id=doc_type_id)


@app.post("/parsing-rules/")
async def add_parsing_rule(
    request: ParsingRuleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "trainer")),
):
    rule = create_parsing_rule(db, request)
    return _serialize_parsing_rule(rule)


@app.delete("/parsing-rules/{rule_id}")
async def remove_parsing_rule(
    rule_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "trainer")),
):
    deleted = delete_parsing_rule(db, rule_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Parsing rule not found")
    return {"status": "deleted", "rule_id": rule_id}


@app.get("/field-mappings/")
async def get_field_mappings(
    doc_type_id: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "trainer", "parser", "viewer")),
):
    return list_field_mappings(db, doc_type_id=doc_type_id)


@app.post("/field-mappings/")
async def add_field_mapping(
    request: FieldMappingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "trainer")),
):
    mapping = create_field_mapping(db, request)
    return _serialize_field_mapping(mapping)


@app.delete("/field-mappings/{mapping_id}")
async def remove_field_mapping(
    mapping_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "trainer")),
):
    deleted = delete_field_mapping(db, mapping_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Field mapping not found")
    return {"status": "deleted", "mapping_id": mapping_id}


@app.get("/parsing-rules/{rule_id}/versions")
async def get_parsing_rule_versions(
    rule_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "trainer", "parser", "viewer")),
):
    return list_parsing_rule_versions(db, rule_id)


@app.post("/parsing-rules/{rule_id}/versions")
async def add_parsing_rule_version(
    rule_id: str,
    request: ParsingRuleVersionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "trainer")),
):
    version = create_parsing_rule_version(db, rule_id, request)
    return _serialize_parsing_rule_version(version)


@app.post("/parsing-rules/{rule_id}/versions/{version_id}/activate")
async def activate_parsing_rule_version_endpoint(
    rule_id: str,
    version_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "trainer")),
):
    version = activate_parsing_rule_version(db, rule_id, version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Parsing rule version not found")
    return _serialize_parsing_rule_version(version)


@app.post("/auto-detect/")
async def auto_detect(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "trainer", "parser")),
):
    temp_path = _save_upload_to_temp(file)
    try:
        parsed = route_document(temp_path)
        extracted_text = str(parsed.get("content", ""))
        verification = _verify_document_type(extracted_text)
        if verification["verified"]:
            matched_model = registry.get_model(verification["doc_id"], db=db)
            matched_doc_type = matched_model.get("doc_type") if matched_model else None
            matched_doc_type_id = matched_model.get("model", {}).get("doc_type_id") if matched_model else None
            extracted_fields = _strip_internal_fields(_extract_fields(extracted_text, matched_doc_type))
            rule_fields = _apply_parsing_rules(
                extracted_text,
                _get_rules_for_doc_type(db, matched_doc_type, matched_doc_type_id),
            )
            extracted_fields.update({k: v for k, v in rule_fields.items() if v})
            extracted_fields = _apply_field_mappings(
                extracted_fields,
                _get_mappings_for_doc_type(db, matched_doc_type, matched_doc_type_id),
            )
            return {
                "matched": True,
                "doc_id": verification["doc_id"],
                "similarity_score": verification["similarity_score"],
                "extracted_fields": extracted_fields,
            }
        return {
            "matched": False,
            "reason": verification["reason"],
            "suggestion": (
                "Please upload a readable document"
                if verification["reason"] == "unreadable_document"
                else "Please train a template for this document type"
            ),
        }
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


@app.post("/parse/", response_model=ParseResponse)
async def parse_document(
    doc_id: str = Query(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "trainer", "parser")),
):
    model = registry.get_model(doc_id, db=db)
    if not model:
        docai_parse_total.labels(
            doc_type_name="unknown",
            parser_used="unknown",
            status="failure",
        ).inc()
        return JSONResponse(status_code=404, content={"error": "Invalid doc_id"})

    temp_path = _save_upload_to_temp(file)
    try:
        doc_type_name = model.get("doc_type")
        doc_type_id = model.get("model", {}).get("doc_type_id")
        parsed = route_document(temp_path, doc_type_name=doc_type_name)
        content = str(parsed.get("content", ""))
        verification = _verify_document_type(content, expected_doc_id=doc_id)
        if not verification["verified"]:
            reason = str(verification["reason"])
            docai_parse_total.labels(
                doc_type_name=doc_type_name or "unknown",
                parser_used=str(parsed.get("parser", "unknown")),
                status="rejected",
            ).inc()
            log_event(
                db,
                event_type="PARSE",
                doc_id=doc_id,
                user_id=current_user.email,
                status="rejected",
                details={
                    key: value
                    for key, value in verification.items()
                    if key not in {"verified", "message"}
                },
            )
            return JSONResponse(
                status_code=409 if reason == "document_type_mismatch" else 422,
                content={"error": reason, **verification},
            )
        redaction_result = redact_pii(content)
        if isinstance(redaction_result, tuple):
            redacted_content, pii_redacted = redaction_result
            entities_found: list[dict[str, Any]] = []
        else:
            redacted_content = redaction_result["redacted_text"]
            pii_redacted = redaction_result["redaction_count"] > 0
            entities_found = redaction_result["entities_found"]
        source_type = doc_type_name if doc_type_name in IntentClassificationRequest.registry else "document"
        intent = IntentClassificationRequest.classify_intent(
            content=redacted_content,
            source_type=source_type,
        )
        fields = _strip_internal_fields(_extract_fields(content, doc_type_name))
        rule_fields = _apply_parsing_rules(content, _get_rules_for_doc_type(db, doc_type_name, doc_type_id))
        fields.update({k: v for k, v in rule_fields.items() if v})
        fields = _apply_field_mappings(fields, _get_mappings_for_doc_type(db, doc_type_name, doc_type_id))
        validation = _build_validation_report(db, doc_type_id, fields)
        redacted_fields = redact_pii_from_fields(fields)
        confidence = float(parsed.get("confidence") or 0.0)
        confidence_threshold = confidence_threshold_for_doc_type(db, doc_type_id)
        parse_status = "needs_review" if confidence < confidence_threshold else "completed"
        parse_result = {
            "document_id": doc_id,
            "fields": redacted_fields,
            "confidence": confidence,
            "parser_used": str(parsed.get("parser", "")),
            "pii_redacted": pii_redacted,
            "intent": intent,
            "validation": validation,
            "content": redacted_content,
            "doc_type_name": doc_type_name or "document",
        }
        connector_results = connector_dispatcher.dispatch(
            parse_result,
            doc_type_name or "document",
            {
                "user_id": current_user.email,
                "file_name": file.filename,
                "parser_used": parsed.get("parser"),
            },
        )
        docai_parse_total.labels(
            doc_type_name=doc_type_name or "document",
            parser_used=str(parsed.get("parser", "")),
            status=parse_status,
        ).inc()
        docai_confidence_score.labels(doc_type_name=doc_type_name or "document").observe(confidence)
        for entity in entities_found:
            docai_pii_redactions_total.labels(entity_type=entity.get("entity_type", "unknown")).inc()
        parse_request = store_parse_request(
            db,
            doc_id=doc_id,
            file_name=file.filename,
            parser_used=str(parsed.get("parser", "")),
            confidence_score=confidence,
            extracted_fields=redacted_fields,
            pii_redacted=pii_redacted,
            status=parse_status,
            user_id=current_user.email,
        )
        audit_id = log_event(
            db,
            event_type="PARSE",
            doc_id=doc_id,
            user_id=current_user.email,
            parse_request_id=parse_request.id,
            status=parse_status,
            details={
                "parser_used": parsed.get("parser"),
                "pii_redacted": pii_redacted,
                "intent": intent,
                "validation": validation,
                "confidence_score": confidence,
                "confidence_threshold": confidence_threshold,
                "review_required": parse_status == "needs_review",
            },
        )
        return ParseResponse(
            document_id=doc_id,
            fields=redacted_fields,
            confidence=confidence,
            audit_id=audit_id,
            parser_used=str(parsed.get("parser", "")),
            pii_redacted=pii_redacted,
            intent=intent,
            validation=validation,
            connector_results=connector_results,
            status=parse_status,
            review_required=parse_status == "needs_review",
            confidence_threshold=confidence_threshold,
        )
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


@app.post("/query-rag/")
async def query_rag(
    payload: dict[str, Any],
    current_user: User = Depends(require_role("admin", "trainer", "parser")),
):
    question = str(payload.get("question", "")).strip()
    if not question:
        raise HTTPException(status_code=400, detail="question is required")
    return {"answer": rag_connector.query_rag(question)}


@app.get("/doc-types/")
async def get_doc_types(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "trainer", "parser", "viewer")),
):
    return list_document_types(db)


@app.get("/doc-types/{doc_type_id}")
async def get_doc_type(
    doc_type_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "trainer", "parser", "viewer")),
):
    document_type = get_document_type_by_id(db, doc_type_id)
    if not document_type:
        raise HTTPException(status_code=404, detail={"error": "Document type not found"})
    return document_type


@app.delete("/doc-types/{doc_type_id}")
async def delete_doc_type(
    doc_type_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "trainer")),
):
    deleted = soft_delete_document_type(db, doc_type_id)
    if not deleted:
        raise HTTPException(status_code=404, detail={"error": "Document type not found"})
    log_event(
        db,
        event_type="DOC_TYPE_DELETE",
        doc_id=doc_type_id,
        user_id=current_user.email,
        status="success",
        details={"doc_type_name": deleted["doc_type_name"]},
    )
    return {"status": "deleted", "document_type": deleted}


@app.get("/parse-history/")
async def get_parse_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    return list_parse_history(db)


@app.get("/review-queue/")
async def get_review_queue(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "trainer", "parser")),
):
    return list_review_queue(db)


@app.get("/parse-history/{parse_request_id}/corrections")
async def get_parse_corrections(
    parse_request_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "trainer", "parser")),
):
    return list_parse_corrections(db, parse_request_id)


@app.post("/parse-history/{parse_request_id}/corrections", response_model=ParseCorrectionResponse)
async def submit_parse_correction(
    parse_request_id: str,
    request: ParseCorrectionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "trainer", "parser")),
):
    if not request.corrected_fields:
        raise HTTPException(status_code=422, detail="corrected_fields cannot be empty")
    correction = save_parse_correction(
        db,
        parse_request_id=parse_request_id,
        corrected_fields=request.corrected_fields,
        reviewer_id=current_user.email,
        notes=request.notes,
    )
    if not correction:
        raise HTTPException(status_code=404, detail="Parse request not found")

    original_fields = correction.original_fields or {}
    corrected_fields = correction.corrected_fields or {}
    changed_fields = _changed_field_names(original_fields, corrected_fields)
    parse_request = getattr(correction, "_docai_parse_request", None) or correction.parse_request
    learning = apply_correction_learning(db, parse_request=parse_request, correction=correction)
    log_event(
        db,
        event_type="PARSE",
        doc_id=correction.doc_id or parse_request_id,
        user_id=current_user.email,
        status="corrected",
        parse_request_id=parse_request_id,
        details={
            "correction_id": str(correction.id),
            "changed_fields": changed_fields,
            "changed_field_count": len(changed_fields),
            "notes_present": bool(request.notes),
            "template_registered": learning.get("template_registered", False),
            "rules_suggested_count": len(learning.get("rules_suggested", [])),
        },
    )
    return {**_serialize_parse_correction(correction), "learning": learning}


@app.get("/parse-stats/")
async def get_parse_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "trainer", "parser")),
):
    return list_parse_stats(db)


@app.get("/audit-trail/{parse_request_id}")
async def audit_trail(
    parse_request_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    return get_audit_trail(db, parse_request_id)


@app.get("/health/")
async def health(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "trainer", "parser", "viewer")),
):
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ok", "db": "connected", "version": "1.0.0"}
    except Exception:
        raise HTTPException(status_code=503, detail={"status": "error", "db": "disconnected"})


@app.get("/metrics")
@app.get("/metrics/")
async def metrics(current_user: User = Depends(require_role("admin"))):
    if generate_latest is None:
        return Response(content="", media_type="text/plain")
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)
