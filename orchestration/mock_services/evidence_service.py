# orchestration/orchestration/mock_services/evidence_service.py
import os
import uuid
import hashlib
import json
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Evidence Service", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://orchestration:orchestration@db:5432/orchestration"
)

# In-memory fallback store
evidence_store: Dict[str, Any] = {}

# DB connection
_engine = None


def get_engine():
    global _engine
    if _engine is None:
        try:
            from sqlalchemy import create_engine, text, Column, String, Text, DateTime, Boolean
            from sqlalchemy.dialects.postgresql import UUID as PGUUID, JSONB
            from sqlalchemy.orm import declarative_base
            engine = create_engine(DATABASE_URL, echo=False)
            # Create evidence table if not exists
            with engine.connect() as conn:
                conn.execute(text("CREATE SCHEMA IF NOT EXISTS evidence"))
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS evidence.bundles (
                        evidence_id    TEXT PRIMARY KEY,
                        execution_id   TEXT,
                        tenant_id      TEXT NOT NULL,
                        plan_name      TEXT,
                        step_key       TEXT,
                        safety_request_id TEXT,
                        sanitized_sql  TEXT,
                        prompt_hash    TEXT,
                        model_version  TEXT,
                        result_snapshot JSONB,
                        metadata       JSONB,
                        hash           TEXT NOT NULL,
                        signed         BOOLEAN DEFAULT TRUE,
                        created_at     TIMESTAMPTZ DEFAULT now()
                    )
                """))
                conn.commit()
            _engine = engine
        except Exception as e:
            print(f"DB connection failed: {e} — using in-memory store")
            _engine = None
    return _engine


class EvidenceRequest(BaseModel):
    execution_id:      str
    tenant_id:         str
    plan_name:         str
    step_key:          str
    safety_request_id: Optional[str] = None
    sanitized_sql:     Optional[str] = None
    prompt_hash:       Optional[str] = None
    model_version:     Optional[str] = None
    result_snapshot:   Dict[str, Any] = {}
    metadata:          Dict[str, Any] = {}


def save_to_db(bundle: dict) -> bool:
    engine = get_engine()
    if not engine:
        return False
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            conn.execute(text("""
                INSERT INTO evidence.bundles
                (evidence_id, execution_id, tenant_id, plan_name, step_key,
                 safety_request_id, sanitized_sql, prompt_hash, model_version,
                 result_snapshot, metadata, hash, signed, created_at)
                VALUES
                (:evidence_id, :execution_id, :tenant_id, :plan_name, :step_key,
                 :safety_request_id, :sanitized_sql, :prompt_hash, :model_version,
                 :result_snapshot, :metadata, :hash, :signed, :created_at)
                ON CONFLICT (evidence_id) DO NOTHING
            """), {
                "evidence_id":       bundle["evidence_id"],
                "execution_id":      bundle["execution_id"],
                "tenant_id":         bundle["tenant_id"],
                "plan_name":         bundle["plan_name"],
                "step_key":          bundle["step_key"],
                "safety_request_id": bundle.get("safety_request_id"),
                "sanitized_sql":     bundle.get("sanitized_sql"),
                "prompt_hash":       bundle.get("prompt_hash"),
                "model_version":     bundle.get("model_version"),
                "result_snapshot":   json.dumps(bundle.get("result_snapshot", {})),
                "metadata":          json.dumps(bundle.get("metadata", {})),
                "hash":              bundle["hash"],
                "signed":            bundle["signed"],
                "created_at":        bundle["created_at"],
            })
            conn.commit()
        return True
    except Exception as e:
        print(f"DB save failed: {e}")
        return False


def load_from_db(tenant_id: str = None, plan_name: str = None) -> list:
    engine = get_engine()
    if not engine:
        return []
    try:
        from sqlalchemy import text
        query  = "SELECT * FROM evidence.bundles WHERE 1=1"
        params = {}
        if tenant_id:
            query += " AND tenant_id = :tenant_id"
            params["tenant_id"] = tenant_id
        if plan_name:
            query += " AND plan_name = :plan_name"
            params["plan_name"] = plan_name
        query += " ORDER BY created_at DESC LIMIT 500"
        with engine.connect() as conn:
            rows = conn.execute(text(query), params).fetchall()
        result = []
        for row in rows:
            d = dict(row._mapping)
            for k in ["result_snapshot", "metadata"]:
                if isinstance(d[k], str):
                    d[k] = json.loads(d[k])
            result.append(d)
        return result
    except Exception as e:
        print(f"DB load failed: {e}")
        return []


@app.on_event("startup")
def startup():
    get_engine()


@app.get("/health")
def health():
    engine    = get_engine()
    db_status = "connected" if engine else "in-memory"
    return {
        "status":    "ok",
        "service":   "evidence-service",
        "version":   "2.0.0",
        "storage":   db_status,
        "bundles":   len(evidence_store),
    }


@app.post("/v1/evidence/assemble")
def assemble(req: EvidenceRequest):
    evidence_id = str(uuid.uuid4())
    raw         = json.dumps(req.model_dump(), sort_keys=True, default=str)
    hash_value  = hashlib.sha256(raw.encode()).hexdigest()

    bundle = {
        "evidence_id":       evidence_id,
        "execution_id":      req.execution_id,
        "tenant_id":         req.tenant_id,
        "plan_name":         req.plan_name,
        "step_key":          req.step_key,
        "safety_request_id": req.safety_request_id,
        "sanitized_sql":     req.sanitized_sql,
        "prompt_hash":       req.prompt_hash,
        "model_version":     req.model_version,
        "result_snapshot":   req.result_snapshot,
        "metadata":          req.metadata,
        "hash":              hash_value,
        "signed":            True,
        "created_at":        datetime.utcnow().isoformat(),
    }

    # Save to DB first, fallback to memory
    saved_to_db = save_to_db(bundle)
    if not saved_to_db:
        evidence_store[evidence_id] = bundle

    return bundle


@app.get("/v1/evidence/bundles")
def list_bundles(
    tenant_id: Optional[str] = None,
    plan_name: Optional[str] = None,
):
    # Try DB first
    db_bundles = load_from_db(tenant_id, plan_name)
    if db_bundles:
        return db_bundles

    # Fallback to memory
    bundles = list(evidence_store.values())
    if tenant_id:
        bundles = [b for b in bundles if b["tenant_id"] == tenant_id]
    if plan_name:
        bundles = [b for b in bundles if b["plan_name"] == plan_name]
    return bundles


@app.get("/v1/evidence/bundles/{evidence_id}")
def get_bundle(evidence_id: str):
    # Try memory first
    if evidence_id in evidence_store:
        return evidence_store[evidence_id]
    # Try DB
    engine = get_engine()
    if engine:
        try:
            from sqlalchemy import text
            with engine.connect() as conn:
                row = conn.execute(
                    text("SELECT * FROM evidence.bundles WHERE evidence_id = :id"),
                    {"id": evidence_id}
                ).fetchone()
            if row:
                d = dict(row._mapping)
                for k in ["result_snapshot", "metadata"]:
                    if isinstance(d[k], str):
                        d[k] = json.loads(d[k])
                return d
        except Exception:
            pass
    raise HTTPException(status_code=404, detail="Evidence bundle not found")