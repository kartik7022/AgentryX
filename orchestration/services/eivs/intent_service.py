# services/eivs/intent_service.py
from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any, Dict, List, Optional
import uuid

from sqlalchemy.orm import Session

from services.eivs.chart_llm_client import call_llm_with_logging
from services.eivs.models import Intent, IntentPolicy, EmailIntentRun
from services.eivs.models_runtime.intent_request import IntentClassificationRequest

LOGGER = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Local dataclasses used by the intent/routing logic
# ---------------------------------------------------------------------------

# Used when an intent_code has no matching eivs.intent_policies row — e.g.
# the model invented an intent_code freely (no pre-registered catalog entry
# yet). Matches the thresholds from the original design: >=85% auto,
# 60-85% manual review, below reroutes.
DEFAULT_AUTO_PROCESS_MIN_CONF = 85.0
DEFAULT_MANUAL_REVIEW_MIN_CONF = 60.0


@dataclass
class ClassifiedIntent:
    intent_code: str
    confidence: float
    coverage: str  # "FULL" | "PARTIAL" | "NONE"


@dataclass
class RoutingDecisionResult:
    routing_decision: str  # "AUTO_PROCESS" | "MANUAL_REVIEW" | "REROUTE"
    coverage_status: str   # "ALL_CLEAR" | "PARTIAL" | "NONE"
    primary_intent_code: Optional[str]
    primary_intent_conf: Optional[float]
    reroute_email: Optional[str]
    routing_reasons: List[str]


# ---------------------------------------------------------------------------
# Prompt construction
# ---------------------------------------------------------------------------

def _build_classification_prompt(
    subject: str,
    body: str,
    sender_email: str,
    intents: List[Intent],
    language_hint: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Build the messages list for the classification LLM call.

    We provide the email content and a machine-readable list of candidate
    intents, and instruct the model to return structured JSON:

      {
        "language_detected": "...",
        "intents": [
          {"intent_code": "...", "confidence": 0-100, "coverage": "FULL|PARTIAL|NONE"}
        ]
      }
    """
    intents_spec = [
        {
            "intent_code": intent.intent_code,
            "description": intent.description,
        }
        for intent in intents
    ]

    if intents_spec:
        system_prompt = (
            "You are an email intent classifier. "
            "Given the email and list of possible intents, "
            "you MUST return JSON with fields: "
            '{"language_detected": "...", '
            '"intents": [{"intent_code": "...", "confidence": <0-100>, '
            '"coverage": "FULL|PARTIAL|NONE"}]}.'
        )
    else:
        # No pre-registered intent catalog exists yet (or none matched) —
        # let the model read the email and decide the intent itself,
        # rather than blocking classification entirely. It picks its own
        # SNAKE_CASE intent_code based on what the email actually says.
        system_prompt = (
            "You are an email intent classifier for a bank/insurer. Read the "
            "email fully and determine what the customer wants, as your own "
            "short SNAKE_CASE code (e.g. NOC_REQUEST, BALANCE_INQUIRY, "
            "COMPLAINT, CLAIM_DISPUTE, LOAN_APPLICATION) — you are not "
            "limited to any predefined list, decide based on the email's "
            "actual content. You MUST return JSON with fields: "
            '{"language_detected": "...", '
            '"intents": [{"intent_code": "...", "confidence": <0-100>, '
            '"coverage": "FULL|PARTIAL|NONE"}]}.'
        )

    user_payload: Dict[str, Any] = {
        "subject": subject,
        "body": body,
        "sender_email": sender_email,
        "intents": intents_spec,
    }
    if language_hint:
        user_payload["language_hint"] = language_hint

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": json.dumps(user_payload)},
    ]


# ---------------------------------------------------------------------------
# Policy selection and routing logic
# ---------------------------------------------------------------------------

def _select_policies_for_intents(
    db: Session,
    classified: List[ClassifiedIntent],
    language_code: Optional[str],
) -> Dict[str, IntentPolicy]:
    """
    For each intent_code in `classified`, select a matching IntentPolicy.

    - First resolve Intent by code to get intent_id.
    - Then, for that intent_id, pick a policy for the requested language_code,
      falling back to 'multi' if no exact language match exists.
    """
    intent_codes = {c.intent_code for c in classified}
    if not intent_codes:
        return {}

    intents: List[Intent] = (
        db.query(Intent)
        .filter(Intent.intent_code.in_(intent_codes))
        .all()
    )
    intent_by_code: Dict[str, Intent] = {i.intent_code: i for i in intents}
    intent_ids = {i.intent_id for i in intents}
    if not intent_ids:
        return {}

    policies: List[IntentPolicy] = (
        db.query(IntentPolicy)
        .filter(IntentPolicy.intent_id.in_(intent_ids))
        .all()
    )

    # Build {intent_id: [policies...]}
    by_intent_id: Dict[int, List[IntentPolicy]] = {}
    for p in policies:
        by_intent_id.setdefault(p.intent_id, []).append(p)

    result: Dict[str, IntentPolicy] = {}
    lang = (language_code or "").lower()

    for code, intent in intent_by_code.items():
        plist = by_intent_id.get(intent.intent_id, [])
        chosen: Optional[IntentPolicy] = None

        # 1) exact language match
        for p in plist:
            if p.language_code.lower() == lang and lang:
                chosen = p
                break
        # 2) fallback to 'multi'
        if chosen is None:
            for p in plist:
                if p.language_code.lower() == "multi":
                    chosen = p
                    break
        # 3) else any policy
        if chosen is None and plist:
            chosen = plist[0]

        if chosen is not None:
            result[code] = chosen

    return result


def apply_routing_logic(
    db: Session,
    *,
    classified: List[ClassifiedIntent],
    language_code: Optional[str],
) -> RoutingDecisionResult:
    """
    Apply per-intent policies to decide routing:

    - auto_process_min_conf
    - manual_review_min_conf
    - multi_intent_mode
    - allow_multi_auto / allow_subset_auto
    - coverage classification (ALL_CLEAR / PARTIAL / NONE)
    """
    if not classified:
        return RoutingDecisionResult(
            routing_decision="MANUAL_REVIEW",
            coverage_status="NONE",
            primary_intent_code=None,
            primary_intent_conf=None,
            reroute_email=None,
            routing_reasons=["NO_INTENT_DETECTED"],
        )

    policy_by_code = _select_policies_for_intents(db, classified, language_code)
    reasons: List[str] = []

    auto_candidates: List[ClassifiedIntent] = []
    manual_candidates: List[ClassifiedIntent] = []
    low_conf: List[ClassifiedIntent] = []

    for ci in classified:
        pol = policy_by_code.get(ci.intent_code)
        if pol is None:
            # No pre-registered policy for this intent_code — fall back to
            # the default thresholds rather than always treating it as
            # low-confidence. Still noted in routing_reasons so it's clear
            # this used the default, not a business-configured rule.
            reasons.append(f"NO_POLICY_FOR_{ci.intent_code}_USED_DEFAULT")
            if ci.confidence >= DEFAULT_AUTO_PROCESS_MIN_CONF:
                auto_candidates.append(ci)
            elif ci.confidence >= DEFAULT_MANUAL_REVIEW_MIN_CONF:
                manual_candidates.append(ci)
            else:
                low_conf.append(ci)
            continue

        auto_thr = float(pol.auto_process_min_conf)
        manual_thr = float(pol.manual_review_min_conf)

        if ci.confidence >= auto_thr:
            auto_candidates.append(ci)
        elif ci.confidence >= manual_thr:
            manual_candidates.append(ci)
        else:
            low_conf.append(ci)

    # coverage_status
    if auto_candidates and not manual_candidates and not low_conf:
        coverage_status = "ALL_CLEAR"
    elif auto_candidates or manual_candidates:
        coverage_status = "PARTIAL"
    else:
        coverage_status = "NONE"

    # primary intent = highest confidence
    primary = sorted(classified, key=lambda c: c.confidence, reverse=True)[0]
    primary_policy = policy_by_code.get(primary.intent_code)

    if primary_policy is None:
        # No registered policy for the primary intent either — route purely
        # by the PRIMARY (highest-confidence) intent's own score against the
        # default thresholds. Unlike STRICT_SINGLE mode below (which exists
        # for business-configured intents that explicitly opt into that
        # strictness), the open/freeform default doesn't require exactly
        # one intent to be returned — Groq may naturally mention a
        # secondary possibility without being uncertain about the top one.
        if primary in auto_candidates:
            routing_decision = "AUTO_PROCESS"
        elif primary in manual_candidates:
            routing_decision = "MANUAL_REVIEW"
        else:
            routing_decision = "REROUTE"
            reasons.append("LOW_CONFIDENCE_REROUTE")
        return RoutingDecisionResult(
            routing_decision=routing_decision,
            coverage_status=coverage_status,
            primary_intent_code=primary.intent_code,
            primary_intent_conf=primary.confidence,
            reroute_email=None,
            routing_reasons=reasons + ["NO_POLICY_FOR_PRIMARY_USED_DEFAULT"],
        )

    mode = (primary_policy.multi_intent_mode or "STRICT_SINGLE").upper()
    routing_decision = "MANUAL_REVIEW"
    reroute_email: Optional[str] = primary_policy.reroute_email

    if mode == "STRICT_SINGLE":
        if len(classified) == 1 and primary in auto_candidates:
            routing_decision = "AUTO_PROCESS"
        else:
            reasons.append("STRICT_SINGLE_MULTI_OR_NOT_AUTO")
    elif mode == "AUTO_ALL":
        if auto_candidates:
            routing_decision = "AUTO_PROCESS"
        else:
            reasons.append("AUTO_ALL_NO_AUTO")
    elif mode == "AUTO_SUBSET":
        if auto_candidates and not manual_candidates:
            routing_decision = "AUTO_PROCESS"
        else:
            reasons.append("AUTO_SUBSET_NOT_SATISFIED")
    else:
        reasons.append(f"UNKNOWN_MULTI_INTENT_MODE_{mode}")

    return RoutingDecisionResult(
        routing_decision=routing_decision,
        coverage_status=coverage_status,
        primary_intent_code=primary.intent_code,
        primary_intent_conf=primary.confidence,
        reroute_email=reroute_email,
        routing_reasons=reasons,
    )


# ---------------------------------------------------------------------------
# Classification orchestration
# ---------------------------------------------------------------------------

def _extract_content_for_source_type(request: "IntentClassificationRequest") -> Dict[str, Any]:
    """
    Pull out whatever fields are actually meaningful to classify, based on
    source_type. Mirrors the per-source-type shapes IntentClassificationRequest
    already validates in services/eivs/models_runtime/intent_request.py.
    """
    st = request.source_type
    if st == "chat":
        text = request.text
        if not text and request.messages:
            text = "\n".join(str(m.get("content", "")) for m in request.messages)
        return {"text": text}
    if st == "document":
        text = request.text
        if not text and request.attachments:
            text = request.attachments[0].text_content
        return {"text": text, "attachment_names": [a.name for a in request.attachments if a.name]}
    if st == "api_event":
        return {"payload_json": request.payload_json}
    if st == "support_ticket":
        return {"title": request.title, "text": request.text, "metadata": request.metadata}
    if st == "claim":
        return {"claim_id": request.claim_id, "payload_json": request.payload_json, "text": request.text}
    if st == "policy":
        return {"text": request.text, "payload_json": request.payload_json}
    if st == "patient_record":
        return {"payload_json": request.payload_json,
                 "attachment_names": [a.name for a in request.attachments if a.name]}
    if st in ("webhook_event", "batch_row", "form_submission", "agent_output"):
        return {"payload_json": request.payload_json, "text": request.text, "summary": request.summary}
    # Fallback for any future/unmapped source_type — best-effort, never crash.
    return {"text": request.text, "payload_json": request.payload_json, "summary": request.summary}


def _build_generic_classification_prompt(
    content: Dict[str, Any],
    source_type: str,
    intents: List[Intent],
    language_hint: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Same JSON-out contract as _build_classification_prompt (email-specific),
    generalized to any source_type via the extracted `content` dict.
    """
    intents_spec = [
        {"intent_code": intent.intent_code, "description": intent.description}
        for intent in intents
    ]

    if intents_spec:
        system_prompt = (
            f"You are an intent classifier for '{source_type}' content. "
            "Given the content and list of possible intents, "
            "you MUST return JSON with fields: "
            '{"language_detected": "...", '
            '"intents": [{"intent_code": "...", "confidence": <0-100>, '
            '"coverage": "FULL|PARTIAL|NONE"}]}.'
        )
    else:
        system_prompt = (
            f"You are an intent classifier for '{source_type}' content. Read "
            "it fully and determine the intent yourself, as your own short "
            "SNAKE_CASE code — you are not limited to any predefined list, "
            "decide based on the content's actual meaning. You MUST return "
            'JSON with fields: {"language_detected": "...", '
            '"intents": [{"intent_code": "...", "confidence": <0-100>, '
            '"coverage": "FULL|PARTIAL|NONE"}]}.'
        )

    user_payload: Dict[str, Any] = {"source_type": source_type, **content, "intents": intents_spec}
    if language_hint:
        user_payload["language_hint"] = language_hint

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": json.dumps(user_payload, default=str)},
    ]


async def classify_request(
    db: Session,
    *,
    request: "IntentClassificationRequest",
) -> EmailIntentRun:
    """
    Generic counterpart to classify_email() for the 11 non-email
    source_types (chat, document, api_event, support_ticket, claim,
    policy, patient_record, webhook_event, batch_row, form_submission,
    agent_output). classify_email() itself is left completely untouched
    per ORCH-002 ("keep old API contract temporarily... old email flow
    still works") — this is a parallel path, not a refactor of it.

    Persists into the same eivs.email_intent_runs table as classify_email
    (no schema migration — that table's name predates the generic request
    model but its shape, one row per classification run with routing
    decision, already fits any source_type). email_id/sender_email are
    NOT NULL on that table, so non-email requests populate them with the
    closest generic equivalent (entity_id/request_id, and a placeholder
    sender_email when the source has no notion of one).
    """
    if request.source_type == "email":
        raise ValueError("classify_request is for non-email source types; use classify_email for email")

    intents: List[Intent] = (
        db.query(Intent)
        .filter(Intent.is_active.is_(True))
        .all()
    )

    run = EmailIntentRun()
    run.tenant_id = request.tenant_id
    run.email_id = request.entity_id or request.request_id
    run.sender_email = request.sender_email or "n/a@source.internal"
    run.correlation_id = request.correlation_id or request.request_id
    run.language_detected = None
    run.intents_json = []
    run.primary_intent_code = None
    run.primary_intent_conf = None
    run.coverage_status = "NONE"
    run.routing_decision = "MANUAL_REVIEW"
    run.reroute_email = None
    run.routing_reasons_json = []

    db.add(run)
    db.commit()
    db.refresh(run)

    if not intents:
        LOGGER.info(
            "No pre-registered intents for request_id=%s — using open/freeform "
            "classification (model decides the intent_code itself)", request.request_id
        )

    content = _extract_content_for_source_type(request)
    messages = _build_generic_classification_prompt(
        content=content,
        source_type=request.source_type,
        intents=intents,
        language_hint=request.language_hint,
    )

    try:
        llm_response = await call_llm_with_logging(
            db=db,
            messages=messages,
            prompt_type=f"{request.source_type.upper()}_INTENT_CLASSIFICATION",
            intent_run_id=run.intent_run_id,
            validation_run_id=None,
            model_name=None,
            backend="PRIMARY",
            tenant_id=request.tenant_id,
        )
    except Exception:
        LOGGER.exception(
            "LLM classification failed for source_type=%s request_id=%s",
            request.source_type, request.request_id,
        )
        return run

    classified: List[ClassifiedIntent] = []
    language_detected: Optional[str] = None
    try:
        language_detected = llm_response.get("language_detected")
        for item in llm_response.get("intents", []) or []:
            intent_code = item.get("intent_code")
            if not intent_code:
                continue
            confidence = float(item.get("confidence", 0.0))
            coverage = item.get("coverage") or "PARTIAL"
            classified.append(
                ClassifiedIntent(intent_code=intent_code, confidence=confidence, coverage=coverage)
            )
    except Exception:
        LOGGER.exception(
            "Failed to parse LLM classification JSON for source_type=%s request_id=%s",
            request.source_type, request.request_id,
        )
        return run

    if not classified:
        LOGGER.info(
            "No intents returned for source_type=%s request_id=%s — MANUAL_REVIEW",
            request.source_type, request.request_id,
        )
        run.language_detected = language_detected
        db.add(run)
        db.commit()
        db.refresh(run)
        return run

    routing = apply_routing_logic(db=db, classified=classified, language_code=language_detected)

    run.language_detected = language_detected
    run.intents_json = [
        {"intent_code": c.intent_code, "confidence": c.confidence, "coverage": c.coverage}
        for c in classified
    ]
    run.primary_intent_code = routing.primary_intent_code
    run.primary_intent_conf = routing.primary_intent_conf
    run.coverage_status = routing.coverage_status
    run.routing_decision = routing.routing_decision
    run.reroute_email = routing.reroute_email
    run.routing_reasons_json = routing.routing_reasons

    db.add(run)
    db.commit()
    db.refresh(run)
    return run


async def classify_email(
    db: Session,
    *,
    tenant_id: str,
    email_id: str,
    subject: str,
    body: str,
    sender_email: str,
    language_hint: Optional[str] = None,
    correlation_id: str,
) -> EmailIntentRun:

    """
    Orchestrate an email intent classification run:

    1. Load active intents.
    2. Build LLM prompt and call call_llm_with_logging.
    3. Parse LLM JSON into ClassifiedIntent objects.
    4. Apply routing logic via apply_routing_logic.
    5. Persist EmailIntentRun row and return it.
    """
    # 1) Load active intents (currently global; you can add tenant scoping later)
    intents: List[Intent] = (
        db.query(Intent)
        .filter(Intent.is_active.is_(True))
        .all()
    )

    # Provisional run with conservative defaults (MANUAL_REVIEW)
    run = EmailIntentRun()
    run.tenant_id = tenant_id
    run.email_id = email_id
    run.sender_email = sender_email
    run.correlation_id = correlation_id
    run.language_detected = None
    run.intents_json = []
    run.primary_intent_code = None
    run.primary_intent_conf = None
    run.coverage_status = "NONE"
    run.routing_decision = "MANUAL_REVIEW"
    run.reroute_email = None
    run.routing_reasons_json = []

    db.add(run)
    db.commit()
    db.refresh(run)

    if not intents:
        LOGGER.info(
            "No pre-registered intents for email_id=%s — using open/freeform "
            "classification (model decides the intent_code itself)", email_id
        )

    # 2) Build prompt and call LLM
    messages = _build_classification_prompt(
        subject=subject,
        body=body,
        sender_email=sender_email,
        intents=intents,
        language_hint=language_hint,
    )

    try:
        llm_response = await call_llm_with_logging(
            db=db,
            messages=messages,
            prompt_type="EMAIL_INTENT_CLASSIFICATION",
            intent_run_id=run.intent_run_id,
            validation_run_id=None,
            model_name=None,
            backend="PRIMARY",
            tenant_id=tenant_id,
        )
    except Exception:
        LOGGER.exception("LLM classification failed for email_id=%s", email_id)
        return run

    # 3) Parse LLM JSON
    classified: List[ClassifiedIntent] = []
    language_detected: Optional[str] = None
    try:
        language_detected = llm_response.get("language_detected")
        for item in llm_response.get("intents", []) or []:
            intent_code = item.get("intent_code")
            if not intent_code:
                continue
            confidence = float(item.get("confidence", 0.0))
            coverage = item.get("coverage") or "PARTIAL"
            classified.append(
                ClassifiedIntent(
                    intent_code=intent_code,
                    confidence=confidence,
                    coverage=coverage,
                )
            )
    except Exception:
        LOGGER.exception("Failed to parse LLM classification JSON for email_id=%s", email_id)
        return run

    # 4) Apply routing logic
    routing = apply_routing_logic(
        db=db,
        classified=classified,
        language_code=language_detected,
    )

    # 5) Persist updates back to EmailIntentRun
    run.language_detected = language_detected
    run.intents_json = [
        {
            "intent_code": c.intent_code,
            "confidence": c.confidence,
            "coverage": c.coverage,
        }
        for c in classified
    ]
    run.primary_intent_code = routing.primary_intent_code
    run.primary_intent_conf = routing.primary_intent_conf
    run.coverage_status = routing.coverage_status
    run.routing_decision = routing.routing_decision
    run.reroute_email = routing.reroute_email
    run.routing_reasons_json = routing.routing_reasons

    db.add(run)
    db.commit()
    db.refresh(run)
    return run