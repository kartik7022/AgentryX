# mock_services/adapter_service.py
"""
Minimal local/dev stand-in for the external "Adapter" service that
services/eivs/adapter_client.py and services/eivs/validation_orchestrator.py
call for semantic/SQL-gated data lookups during EIVS validation.

This is NOT a re-implementation of the real Adapter's safety-gate (SGate)
logic — it does not do prompt-to-SQL generation, injection detection, or
policy enforcement. It exists so the loan_noc_email_processing demo plan
(ORCH-032) and any adapter_analyze / intent_validate step can be exercised
end-to-end locally without a real Adapter deployment, by doing real,
narrow, hardcoded lookups against the banking domain tables
(crm.customers, loan_core.loans) for the specific rule_codes the seeded
demo uses.

Response shape is snake_case (datasource_result, sql_executed,
sgate_decision), matching the canonical contract documented in
services/eivs/adapter_client.py. Both EIVS callers
(adapter_client.py and validation_orchestrator.py) now agree on this
casing — see the item-1 fix in docs/PENDING_CHECKLIST.md.
"""
import logging
import os
import re
import uuid
from typing import Any, Dict, List, Optional

import psycopg2
import psycopg2.extras
from fastapi import FastAPI, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

logger = logging.getLogger("adapter_service")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Adapter Service (dev mock)", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://orchestration:orchestration@db:5432/orchestration",
)

LOAN_ACCOUNT_RE = re.compile(r"\bLN-?\d+\b", re.IGNORECASE)


class AnalyzeRequest(BaseModel):
    tenant_id: str
    prompt: Any = None
    datasource_name: Optional[str] = None
    event_type: Optional[str] = None
    correlation_id: Optional[str] = None


def _get_conn():
    return psycopg2.connect(DATABASE_URL)


def _rule_code_and_email(prompt: Any) -> tuple[str, Dict[str, Any]]:
    """Best-effort extraction from validation_orchestrator's rule_prompt_context
    dict shape: {rule_code, rule_name, rule_description, email: {subject, body, sender_email}, ...}.
    Falls back gracefully if `prompt` is a plain string instead."""
    if isinstance(prompt, dict):
        rule_code = (prompt.get("rule_code") or "").lower()
        email = prompt.get("email") or {}
        return rule_code, email
    return "", {}


def _lookup_customer_by_email(sender_email: str) -> List[Dict[str, Any]]:
    if not sender_email:
        return []
    try:
        conn = _get_conn()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "SELECT customer_id, full_name, email, primary_loan_account "
            "FROM crm.customers WHERE email = %s",
            (sender_email,),
        )
        rows = [dict(r) for r in cur.fetchall()]
        cur.close(); conn.close()
        return rows
    except Exception as e:
        logger.warning("customer lookup failed (crm schema may not be loaded): %s", e)
        return []


def _lookup_loan_by_account(loan_account_number: str) -> List[Dict[str, Any]]:
    if not loan_account_number:
        return []
    try:
        conn = _get_conn()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "SELECT loan_account_number, customer_id, status, principal_amount, currency "
            "FROM loan_core.loans WHERE loan_account_number = %s",
            (loan_account_number,),
        )
        rows = [dict(r) for r in cur.fetchall()]
        cur.close(); conn.close()
        return rows
    except Exception as e:
        logger.warning("loan lookup failed (loan_core schema may not be loaded): %s", e)
        return []


def _extract_loan_account(text: str) -> Optional[str]:
    if not text:
        return None
    m = LOAN_ACCOUNT_RE.search(text)
    return m.group(0).upper().replace("LN-", "LN") if m else None


def _respond(datasource_result: List[Dict[str, Any]], sql_executed: str, sgate_decision: str) -> Dict[str, Any]:
    safety_request_id = str(uuid.uuid4())
    evidence_id = str(uuid.uuid4())
    request_id = str(uuid.uuid4())
    return {
        "status": "ok",
        "datasource_result": datasource_result,
        "sql_executed": sql_executed,
        "sgate_decision": sgate_decision,
        "safety_request_id": safety_request_id,
        "evidence_id": evidence_id,
        "request_id": request_id,
    }


@app.get("/health")
def health():
    return {"status": "ok", "service": "adapter-service-mock"}


@app.post("/v1/email-validation/analyze")
def email_validation_analyze(req: AnalyzeRequest, x_correlation_id: Optional[str] = Header(default=None)):
    rule_code, email = _rule_code_and_email(req.prompt)
    sender_email = email.get("sender_email") or ""
    body = email.get("body") or ""

    if "sender_email" in rule_code or "email_match" in rule_code:
        rows = _lookup_customer_by_email(sender_email)
        sql = "SELECT customer_id, full_name, email, primary_loan_account FROM crm.customers WHERE email = :sender_email"
        return _respond(rows, sql, "ALLOW")

    if "loan_account" in rule_code or "loan_status" in rule_code or "loan" in rule_code:
        loan_account = _extract_loan_account(body)
        rows = _lookup_loan_by_account(loan_account) if loan_account else []
        sql = "SELECT loan_account_number, customer_id, status, principal_amount, currency FROM loan_core.loans WHERE loan_account_number = :loan_account_number"
        return _respond(rows, sql, "ALLOW")

    # Unrecognized rule_code: return an empty-but-valid result rather than
    # guessing, so the downstream PASS/FAIL LLM prompt sees "no evidence"
    # instead of silently-wrong data.
    logger.info("adapter mock: no lookup handler for rule_code=%r, returning empty result", rule_code)
    return _respond([], "", "ALLOW")


@app.post("/v1/email-search/analyze")
def email_search_analyze(req: AnalyzeRequest, x_correlation_id: Optional[str] = Header(default=None)):
    # Not used by the seeded demo plan today; kept minimal but real-shaped
    # so it doesn't 404 if a plan step calls it.
    return _respond([], "", "ALLOW")