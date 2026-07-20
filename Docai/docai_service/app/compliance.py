from __future__ import annotations

import re
from typing import Any

try:
    from presidio_analyzer import AnalyzerEngine
    from presidio_anonymizer import AnonymizerEngine
except ImportError:  # pragma: no cover
    AnalyzerEngine = None
    AnonymizerEngine = None


PLACEHOLDER_MAP = {
    "PERSON": "<PERSON>",
    "PHONE_NUMBER": "<PHONE_NUMBER>",
    "EMAIL_ADDRESS": "<EMAIL_ADDRESS>",
    "CREDIT_CARD": "<CREDIT_CARD>",
    "US_SSN": "<US_SSN>",
    "IBAN_CODE": "<IBAN_CODE>",
    "DATE_TIME": "<DATE_TIME>",
    "LOCATION": "<LOCATION>",
    "NRP": "<NRP>",
    "MEDICAL_LICENSE": "<MEDICAL_LICENSE>",
    "URL": "<URL>",
    "IP_ADDRESS": "<IP_ADDRESS>",
    "PASSPORT": "<PASSPORT>",
    "ACCOUNT_NUMBER": "<ACCOUNT_NUMBER>",
    "POLICY_NUMBER": "<POLICY_NUMBER>",
}

DEFAULT_ENTITY_TYPES = list(PLACEHOLDER_MAP.keys())

_EMAIL_RE = re.compile(r"\b[\w\.-]+@[\w\.-]+\.\w+\b")
_PHONE_RE = re.compile(r"\b(?:\+?\d{1,3}[- ]?)?(?:\d{10}|\d{3}[- ]\d{3}[- ]\d{4})\b")
_SSN_RE = re.compile(r"\b\d{3}[- ]?\d{2}[- ]?\d{4}\b")
_CC_RE = re.compile(r"\b(?:\d[ -]*?){13,19}\b")
_IBAN_RE = re.compile(r"\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b")
_DATE_RE = re.compile(r"\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[-/][A-Za-z]{3}[-/]\d{4}\b")
_URL_RE = re.compile(r"https?://\S+|www\.\S+")
_IP_RE = re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")
_PASSPORT_RE = re.compile(r"\bpassport(?:\s+number)?\s*[:#]?\s*([A-Z0-9]{6,9})\b", re.IGNORECASE)
_POLICY_RE = re.compile(r"\bpolicy\s*#?\s*([A-Z0-9-]+)\b", re.IGNORECASE)
_ACCOUNT_RE = re.compile(r"\baccount(?:\s+number)?(?:\s+ending)?\s*[:#]?\s*([A-Z0-9-]+)\b", re.IGNORECASE)
_MEDICAL_LICENSE_RE = re.compile(r"\bmedical license\s*[:#]?\s*([A-Z0-9-]+)\b", re.IGNORECASE)
_PERSON_RE = re.compile(r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b")
_LOCATION_RE = re.compile(r"\b(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b")


def _fallback_analyze(text: str) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []

    def add(entity_type: str, match: re.Match[str]) -> None:
        candidates.append(
            {
                "entity_type": entity_type,
                "start": match.start(),
                "end": match.end(),
                "score": 0.99,
                "value": match.group(0),
            }
        )

    for match in _EMAIL_RE.finditer(text):
        add("EMAIL_ADDRESS", match)
    for match in _PHONE_RE.finditer(text):
        add("PHONE_NUMBER", match)
    for match in _SSN_RE.finditer(text):
        add("US_SSN", match)
    for match in _CC_RE.finditer(text):
        add("CREDIT_CARD", match)
    for match in _IBAN_RE.finditer(text):
        add("IBAN_CODE", match)
    for match in _DATE_RE.finditer(text):
        add("DATE_TIME", match)
    for match in _URL_RE.finditer(text):
        add("URL", match)
    for match in _IP_RE.finditer(text):
        add("IP_ADDRESS", match)
    for match in _PASSPORT_RE.finditer(text):
        add("NRP", match)
    for match in _POLICY_RE.finditer(text):
        add("POLICY_NUMBER", match)
    for match in _ACCOUNT_RE.finditer(text):
        add("ACCOUNT_NUMBER", match)
    for match in _MEDICAL_LICENSE_RE.finditer(text):
        add("MEDICAL_LICENSE", match)
    for match in _PERSON_RE.finditer(text):
        add("PERSON", match)
    for match in _LOCATION_RE.finditer(text):
        add("LOCATION", match)

    priority = {
        "EMAIL_ADDRESS": 0,
        "PHONE_NUMBER": 1,
        "US_SSN": 2,
        "CREDIT_CARD": 3,
        "IBAN_CODE": 4,
        "POLICY_NUMBER": 5,
        "ACCOUNT_NUMBER": 6,
        "MEDICAL_LICENSE": 7,
        "DATE_TIME": 8,
        "URL": 9,
        "IP_ADDRESS": 10,
        "NRP": 11,
        "PERSON": 12,
        "LOCATION": 13,
    }

    candidates.sort(key=lambda item: (item["start"], priority.get(item["entity_type"], 99), -(item["end"] - item["start"])))
    entities: list[dict[str, Any]] = []
    occupied: list[tuple[int, int]] = []
    for candidate in candidates:
        start, end = candidate["start"], candidate["end"]
        overlap = any(start < existing_end and end > existing_start for existing_start, existing_end in occupied)
        if overlap:
            continue
        entities.append(candidate)
        occupied.append((start, end))

    entities.sort(key=lambda item: item["start"])
    return entities


def _fallback_anonymize(text: str, entities: list[dict[str, Any]]) -> str:
    redacted_text = text
    for entity in sorted(entities, key=lambda item: item["start"], reverse=True):
        placeholder = PLACEHOLDER_MAP.get(entity["entity_type"], f"<{entity['entity_type']}>")
        redacted_text = redacted_text[: entity["start"]] + placeholder + redacted_text[entity["end"] :]
    return redacted_text


def redact_pii(text: str, language: str = "en") -> dict[str, Any]:
    if AnalyzerEngine is not None and AnonymizerEngine is not None:
        try:
            analyzer = AnalyzerEngine()
            results = analyzer.analyze(text=text, language=language, entities=DEFAULT_ENTITY_TYPES)
            entities_found = [
                {
                    "entity_type": result.entity_type,
                    "start": result.start,
                    "end": result.end,
                    "score": float(result.score),
                    "value": text[result.start:result.end],
                }
                for result in results
            ]
            redaction_count = len(results)
            return {
                "redacted_text": _fallback_anonymize(text, entities_found),
                "entities_found": entities_found,
                "redaction_count": redaction_count,
            }
        except Exception:
            pass

    entities_found = _fallback_analyze(text)
    redacted_text = _fallback_anonymize(text, entities_found)
    return {
        "redacted_text": redacted_text,
        "entities_found": entities_found,
        "redaction_count": len(entities_found),
    }


def redact_pii_from_fields(fields: dict, sensitive_keys: list | None = None) -> dict:
    sensitive_keys = sensitive_keys or [
        "name",
        "email",
        "phone",
        "ssn",
        "dob",
        "address",
        "account_number",
        "policy_number",
        "patient_id",
    ]

    def _normalized(value: str) -> str:
        return re.sub(r"[^a-z0-9]+", "", value.lower())

    def _is_sensitive(field_name: str) -> bool:
        normalized_field = _normalized(field_name)
        for sensitive_key in sensitive_keys:
            normalized_key = _normalized(sensitive_key)
            if normalized_key and (
                normalized_key in normalized_field or normalized_field in normalized_key
            ):
                return True
        return False

    redacted = dict(fields)
    summary = {"redacted_keys": [], "redaction_count": 0}
    for key, value in list(redacted.items()):
        if value is None or not _is_sensitive(key):
            continue
        result = redact_pii(str(value))
        redacted[key] = result["redacted_text"]
        if result["redaction_count"] > 0:
            summary["redacted_keys"].append(key)
            summary["redaction_count"] += result["redaction_count"]
    redacted["redaction_summary"] = summary
    return redacted


def validate_schema(fields: dict, schema_definition: dict) -> dict:
    missing_fields = []
    extra_fields = [key for key in fields.keys() if key not in schema_definition]
    type_errors = []

    for key, expected_type in schema_definition.items():
        if key not in fields:
            missing_fields.append(key)
            continue
        value = fields[key]
        expected = str(expected_type).lower()
        if expected == "string" and not isinstance(value, str):
            type_errors.append({"field": key, "expected": "string", "actual": type(value).__name__})
        elif expected == "number" and not isinstance(value, (int, float)):
            type_errors.append({"field": key, "expected": "number", "actual": type(value).__name__})
        elif expected == "date" and not isinstance(value, str):
            type_errors.append({"field": key, "expected": "date", "actual": type(value).__name__})
        elif expected == "array" and not isinstance(value, list):
            type_errors.append({"field": key, "expected": "array", "actual": type(value).__name__})
        elif expected == "object" and not isinstance(value, dict):
            type_errors.append({"field": key, "expected": "object", "actual": type(value).__name__})

    return {
        "valid": not missing_fields and not extra_fields and not type_errors,
        "missing_fields": missing_fields,
        "extra_fields": extra_fields,
        "type_errors": type_errors,
    }
