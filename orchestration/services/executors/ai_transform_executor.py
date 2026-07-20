# orchestration/orchestration/services/executors/ai_transform_executor.py
from typing import Any
import logging
import json
import uuid
import hashlib
import os
from datetime import datetime

import httpx
from jsonschema import validate, ValidationError

from ..config import settings
from .base import StepContext

logger = logging.getLogger(__name__)

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL   = "llama-3.3-70b-versatile"


def _build_prompt(template: str, inputs: dict) -> str:
    prompt = template
    if inputs:
        inputs_text = json.dumps(inputs, indent=2, default=str)
        prompt = f"{template}\n\nInput Data:\n{inputs_text}"
    prompt += "\n\nRespond with valid JSON only. No explanation, no markdown, just the JSON object."
    return prompt


def _call_groq(prompt: str) -> dict:
    with httpx.Client(timeout=30.0) as client:
        resp = client.post(
            GROQ_API_URL,
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type":  "application/json",
            },
            json={
                "model":   GROQ_MODEL,
                "messages": [
                    {
                        "role":    "system",
                        "content": (
                            "You are a senior AI analyst with deep expertise across "
                            "regulated industries. You analyze data and make intelligent, "
                            "accurate decisions with professional clarity.\n\n"
                            "YOUR RESPONSE MUST ALWAYS INCLUDE:\n"
                            "- 'decision' or 'result': your final verdict clearly stated\n"
                            "- 'summary': brief explanation in simple professional language\n"
                            "- 'key_findings': list of important observations from the data\n"
                            "- 'what_to_do_next': clear step by step actions to take\n"
                            "- 'risk_level': LOW, MEDIUM, HIGH, or CRITICAL\n"
                            "- 'confidence': your confidence score between 0 and 1\n"
                            "- 'flags': any warnings or concerns found\n"
                            "- 'compliance': regulatory or policy checks relevant to the case\n\n"
                            "RESPONSE RULES:\n"
                            "- Always respond with valid JSON only\n"
                            "- No markdown, no code blocks, just clean JSON\n"
                            "- Be specific — use exact numbers, amounts, dates\n"
                            "- Think deeply before responding\n"
                        ),
                    },
                    {
                        "role":    "user",
                        "content": prompt,
                    },
                ],
                "temperature":     0.1,
                "max_tokens":      2048,
                "response_format": {"type": "json_object"},
            },
        )
        resp.raise_for_status()
        data    = resp.json()
        content = data["choices"][0]["message"]["content"]
        return json.loads(content)


def _save_evidence(evidence: dict):
    """Save evidence directly to PostgreSQL."""
    try:
        import psycopg2
        conn = psycopg2.connect(settings.DATABASE_URL)
        cur  = conn.cursor()
        cur.execute("CREATE SCHEMA IF NOT EXISTS evidence")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS evidence.bundles (
                evidence_id      TEXT PRIMARY KEY,
                execution_id     TEXT,
                tenant_id        TEXT NOT NULL,
                plan_name        TEXT,
                step_key         TEXT,
                safety_request_id TEXT,
                sanitized_sql    TEXT,
                prompt_hash      TEXT,
                model_version    TEXT,
                result_snapshot  JSONB,
                metadata         JSONB,
                hash             TEXT NOT NULL,
                signed           BOOLEAN DEFAULT TRUE,
                created_at       TIMESTAMPTZ DEFAULT now()
            )
        """)
        cur.execute("""
            INSERT INTO evidence.bundles
            (evidence_id, execution_id, tenant_id, plan_name, step_key,
             result_snapshot, metadata, hash, signed, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (evidence_id) DO NOTHING
        """, (
            evidence["evidence_id"],
            evidence["execution_id"],
            evidence["tenant_id"],
            evidence["plan_name"],
            evidence["step_key"],
            json.dumps(evidence.get("result_snapshot", {})),
            json.dumps(evidence.get("metadata", {})),
            evidence["hash"],
            True,
            evidence["created_at"],
        ))
        conn.commit()
        cur.close()
        conn.close()
        return evidence["evidence_id"]
    except Exception as e:
        logger.warning("Evidence save failed: %s", e)
        return None


def assemble_evidence(execution_id, tenant_id, plan_name, step_key, result_snapshot, metadata):
    """Assemble and save evidence bundle."""
    evidence_id = str(uuid.uuid4())
    raw         = json.dumps({
        "execution_id": execution_id,
        "tenant_id":    tenant_id,
        "plan_name":    plan_name,
        "step_key":     step_key,
        "result":       result_snapshot,
    }, sort_keys=True, default=str)
    hash_value = hashlib.sha256(raw.encode()).hexdigest()

    bundle = {
        "evidence_id":    evidence_id,
        "execution_id":   execution_id,
        "tenant_id":      tenant_id,
        "plan_name":      plan_name,
        "step_key":       step_key,
        "result_snapshot": result_snapshot,
        "metadata":       metadata,
        "hash":           hash_value,
        "created_at":     datetime.utcnow().isoformat(),
    }
    _save_evidence(bundle)
    return evidence_id


class AiTransformExecutor:
    def __init__(self) -> None:
        self.client = httpx.Client(timeout=60.0)

    def execute(self, step, ctx: StepContext) -> Any:
        # Build inputs from depends_on results
        inputs: dict[str, Any] = {}
        for dep in step.get("depends_on") or []:
            inputs[dep] = ctx.results.get(dep)

        # ── LLM Call — directly to Groq! ───────────────────────────
        result = None
        if GROQ_API_KEY:
            try:
                prompt = _build_prompt(
                    step.get("ai_prompt_template", ""),
                    inputs
                )
                result = _call_groq(prompt)
                logger.info("Groq AI SUCCESS for step: %s", step.get("step_key"))
            except Exception as e:
                logger.error("Groq AI FAILED: %s", e)
                result = {"error": str(e), "status": "AI call failed"}
        else:
            result = {"error": "GROQ_API_KEY not set", "status": "failed"}

        # ── Schema Validation ──────────────────────────────────────
        if step.get("ai_output_schema") and result:
            try:
                validate(instance=result, schema=step.get("ai_output_schema"))
            except ValidationError as e:
                logger.warning("AI output schema validation failed: %s", e)

        # ── Evidence — directly to DB! ────────────────────────────
        try:
            assemble_evidence(
                execution_id    = f"orch-ai-{step.get('step_key')}",
                tenant_id       = ctx.tenant_id,
                plan_name       = ctx.plan_name,
                step_key        = step.get("step_key"),
                result_snapshot = result if isinstance(result, dict) else {"output": result},
                metadata        = {
                    "datasource_name": step.get("datasource_name"),
                    "kind":            "ai_transform",
                    "plan_name":       ctx.plan_name,
                },
            )
        except Exception as e:
            logger.warning("Evidence assembly failed: %s", e)

        return result