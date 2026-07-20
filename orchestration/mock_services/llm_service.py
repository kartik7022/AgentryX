# orchestration/orchestration/mock_services/llm_service.py
import os
import json
import uuid
from datetime import datetime
from typing import Any, Dict, Optional

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="LLM Service", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL   = "llama-3.3-70b-versatile"

class AITransformRequest(BaseModel):
    tenant_id:       str
    prompt_template: str
    inputs:          Dict[str, Any] = {}
    output_schema:   Optional[Any]  = None


def build_prompt(template: str, inputs: dict) -> str:
    prompt = template
    if inputs:
        inputs_text = json.dumps(inputs, indent=2, default=str)
        prompt = f"{template}\n\nInput Data:\n{inputs_text}"
    prompt += "\n\nRespond with valid JSON only. No explanation, no markdown, just the JSON object."
    return prompt


def call_groq(prompt: str) -> tuple[str, int, int]:
    if not GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY not set")

    with httpx.Client(timeout=30.0) as client:
        resp = client.post(
            GROQ_API_URL,
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type":  "application/json",
            },
            json={
                "model":       GROQ_MODEL,
                "messages": [
                    {
                        "role":    "system",
                        "content": (
                            "You are an AI assistant for a governed banking and financial services "
                            "orchestration platform. You analyze customer data and return structured "
                            "JSON responses for risk assessment, loan decisions, claims processing, "
                            "and other financial operations. Always respond with valid JSON only."
                        ),
                    },
                    {
                        "role":    "user",
                        "content": prompt,
                    },
                ],
                "temperature":     0.1,
                "max_tokens":      1024,
                "response_format": {"type": "json_object"},
            },
        )
        resp.raise_for_status()
        data          = resp.json()
        content       = data["choices"][0]["message"]["content"]
        prompt_tokens = data["usage"]["prompt_tokens"]
        comp_tokens   = data["usage"]["completion_tokens"]
        return content, prompt_tokens, comp_tokens


def mock_response(prompt_template: str, inputs: dict) -> dict:
    prompt_lower = prompt_template.lower()

    if "risk" in prompt_lower or "score" in prompt_lower:
        return {
            "score":      72,
            "risk_level": "MEDIUM",
            "reason":     "Customer has 6 late payments in last 12 months with outstanding balance of INR 45,000. Payment trend is declining. Recommend collections follow-up within 7 days.",
            "confidence": 0.87,
            "factors": [
                "Late payment history",
                "Outstanding overdue balance",
                "Active KYC verified"
            ],
            "recommended_action": "COLLECTIONS_CALL",
        }
    elif "loan" in prompt_lower or "underwr" in prompt_lower or "approv" in prompt_lower:
        return {
            "decision":           "APPROVE_WITH_CONDITIONS",
            "confidence":         0.82,
            "recommended_limit":  250000,
            "interest_rate":      12.5,
            "tenure_months":      36,
            "conditions":         ["Submit income proof", "Clear existing overdue"],
            "reason":             "Applicant has good credit history with minor payment delays. KYC verified. Income sufficient for requested loan amount.",
        }
    elif "claim" in prompt_lower or "fnol" in prompt_lower or "insurance" in prompt_lower:
        return {
            "verdict":          "APPROVE",
            "confidence":       0.91,
            "estimated_payout": 45000,
            "risk_flags":       [],
            "fraud_score":      0.08,
            "reason":           "Claim appears legitimate. Documents verified. No fraud indicators detected.",
            "next_steps":       ["Process payment", "Close ticket"],
        }
    elif "summar" in prompt_lower:
        return {
            "summary":     "Customer Rajesh Kumar (ID: 12345) is an active PREMIUM segment customer since 2021. Currently has overdue balance of INR 45,000 with 17 days past due. KYC verified. Medium risk profile.",
            "key_points":  ["Active customer", "Overdue payment — 17 days", "KYC verified", "Premium segment"],
            "action":      "Schedule collections call",
            "priority":    "HIGH",
        }
    elif "classif" in prompt_lower or "intent" in prompt_lower:
        return {
            "intent":     "PAYMENT_DISPUTE",
            "confidence": 0.91,
            "routing":    "COLLECTIONS_TEAM",
            "priority":   "HIGH",
            "sub_intent": "PARTIAL_PAYMENT_REQUEST",
        }
    else:
        return {
            "result":     "Analysis complete",
            "analysis":   "Based on the provided data, the customer profile indicates medium engagement with some payment delays requiring attention.",
            "confidence": 0.82,
            "action":     "REVIEW",
        }


@app.get("/health")
def health():
    groq_configured = bool(GROQ_API_KEY)
    return {
        "status":           "ok",
        "service":          "llm-service",
        "version":          "2.0.0",
        "groq_configured":  groq_configured,
        "model":            GROQ_MODEL if groq_configured else "mock",
    }


@app.post("/v1/ai-transform")
def ai_transform(req: AITransformRequest):
    start = datetime.utcnow()
    output        = None
    model_used    = "mock"
    prompt_tokens = 0
    comp_tokens   = 0
    error_detail  = None

    # Try Groq first
    if GROQ_API_KEY:
        try:
            prompt        = build_prompt(req.prompt_template, req.inputs)
            content, pt, ct = call_groq(prompt)
            output        = json.loads(content)
            model_used    = GROQ_MODEL
            prompt_tokens = pt
            comp_tokens   = ct
        except Exception as e:
            error_detail = str(e)
            # Fall back to mock
            output = mock_response(req.prompt_template, req.inputs)
            model_used = "mock-fallback"
    else:
        output = mock_response(req.prompt_template, req.inputs)
        model_used = "mock"

    elapsed_ms = int((datetime.utcnow() - start).total_seconds() * 1000)

    return {
        "execution_id":  str(uuid.uuid4()),
        "model":         model_used,
        "model_version": "groq-llama-3.1-70b" if "llama" in model_used else "mock-v2.0",
        "prompt_hash":   uuid.uuid4().hex,
        "output":        output,
        "token_count": {
            "prompt":     prompt_tokens,
            "completion": comp_tokens,
            "total":      prompt_tokens + comp_tokens,
        },
        "elapsed_ms":    elapsed_ms,
        "timestamp_utc": datetime.utcnow().isoformat(),
        "error":         error_detail,
    }