# orchestration/orchestration/services/executors/rest_executor.py
from typing import Any, Dict, Optional
import logging
import json
import uuid
import hashlib
from datetime import datetime

import httpx

from ..config import settings
from ..expression import eval_bindings
from .base import StepContext

logger = logging.getLogger(__name__)


def _get_datasource_host(datasource_name: str) -> Optional[dict]:
    try:
        import psycopg2
        import psycopg2.extras
        conn = psycopg2.connect(settings.DATABASE_URL)
        cur  = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT host, port, username
            FROM orchestration.datasources
            WHERE name = %s AND is_active = TRUE
        """, (datasource_name,))
        row = cur.fetchone()
        cur.close()
        conn.close()
        if row and row.get("host"):
            return dict(row)
        return None
    except Exception as e:
        logger.warning("Could not check datasource config: %s", e)
        return None


def _save_evidence(execution_id, tenant_id, plan_name, step_key, result_snapshot, metadata):
    """Save evidence directly to PostgreSQL."""
    try:
        import psycopg2
        evidence_id = str(uuid.uuid4())
        raw         = json.dumps({
            "execution_id": execution_id,
            "tenant_id":    tenant_id,
            "plan_name":    plan_name,
            "step_key":     step_key,
        }, sort_keys=True, default=str)
        hash_value = hashlib.sha256(raw.encode()).hexdigest()

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
            evidence_id, execution_id, tenant_id,
            plan_name, step_key,
            json.dumps(result_snapshot),
            json.dumps(metadata),
            hash_value, True,
            datetime.utcnow().isoformat(),
        ))
        conn.commit()
        cur.close()
        conn.close()
        return evidence_id
    except Exception as e:
        logger.warning("Evidence save failed: %s", e)
        return None


class RestExecutor:
    def __init__(self):
        self.client = httpx.Client(timeout=20.0)

    def execute(self, step, ctx: StepContext) -> Any:
        context  = {"params": ctx.params, "results": ctx.results}
        bindings = eval_bindings(step.get("input_bindings_json") or {}, context)

        # ── Render path template ───────────────────────────────────
        path = step.get("path_template") or ""
        path = path.strip()
        for k, v in bindings.items():
            if v is None:
                continue
            path = path.replace("{" + k + "}", str(v))

        # ── Render query params ────────────────────────────────────
        q: Dict[str, str] = {}
        for key, val_template in (step.get("query_params_json") or {}).items():
            q[key] = val_template.format(**bindings)

        # ── Render body ────────────────────────────────────────────
        body = step.get("body_json")
        if body:
            def _fmt(obj):
                if isinstance(obj, str):
                    return obj.format(**bindings)
                if isinstance(obj, dict):
                    return {k: _fmt(v) for k, v in obj.items()}
                if isinstance(obj, list):
                    return [_fmt(x) for x in obj]
                return obj
            body = _fmt(body)

        # ── Check DB for real datasource URL ───────────────────────
        datasource_config = _get_datasource_host(
            step.get("datasource_name", "")
        )

        if datasource_config:
            host     = datasource_config.get("host", "")
            port     = datasource_config.get("port")
            username = datasource_config.get("username")
            base_url = f"{host}:{port}" if port else host
            full_url = f"{base_url}{path}"
            headers  = {"Content-Type": "application/json"}
            if username:
                headers["Authorization"] = f"Bearer {username}"
            real_resp = self.client.request(
                method  = step.get("method") or "GET",
                url     = full_url,
                params  = q or {},
                json    = body,
                headers = headers,
            )
            real_resp.raise_for_status()
            data        = real_resp.json()
            data_source = "real"

        elif path.startswith("http://") or path.startswith("https://"):
            webhook_resp = self.client.request(
                method  = step.get("method") or "GET",
                url     = path,
                json    = {
                    "tenant_id": ctx.tenant_id,
                    "step_key":  step.get("step_key"),
                    "plan_name": ctx.plan_name,
                    "params":    ctx.params,
                    "inputs":    ctx.results,
                },
                headers = {"Content-Type": "application/json"},
                params  = q or {},
            )
            webhook_resp.raise_for_status()
            data        = webhook_resp.json()
            data_source = "webhook"

        else:
            raise RuntimeError(
                f"No URL configured for '{step.get('datasource_name')}'. "
                f"Add host in Datasources or use full URL in path_template!"
            )

        # ── Evidence — directly to DB! ────────────────────────────
        try:
            _save_evidence(
                execution_id    = f"orch-{step.get('step_key')}",
                tenant_id       = ctx.tenant_id,
                plan_name       = ctx.plan_name,
                step_key        = step.get("step_key"),
                result_snapshot = data if isinstance(data, dict) else {"output": data},
                metadata        = {
                    "datasource_name": step.get("datasource_name"),
                    "kind":            "rest",
                    "path":            path,
                    "data_source":     data_source,
                    "plan_name":       ctx.plan_name,
                },
            )
        except Exception as e:
            logger.warning("Evidence failed: %s", e)

        return data