# orchestration/orchestration/services/executors/sql_executor.py
from typing import Any, Dict, Optional
import logging
import re
import json
import uuid
import hashlib
from datetime import datetime
from decimal import Decimal

from ..config import settings
from ..expression import eval_bindings
from .base import StepContext

logger = logging.getLogger(__name__)


def _get_datasource_config(datasource_name: str) -> Optional[dict]:
    try:
        import psycopg2
        import psycopg2.extras
        conn = psycopg2.connect(settings.DATABASE_URL)
        cur  = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT host, port, database_name, username, password
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


def _serialize_row(row: dict) -> dict:
    result = {}
    for k, v in row.items():
        if hasattr(v, 'isoformat'):
            result[k] = v.isoformat()
        elif isinstance(v, Decimal):
            result[k] = float(v)
        elif v is None:
            result[k] = None
        else:
            result[k] = v
    return result


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
            evidence_id,
            execution_id,
            tenant_id,
            plan_name,
            step_key,
            json.dumps(result_snapshot),
            json.dumps(metadata),
            hash_value,
            True,
            datetime.utcnow().isoformat(),
        ))
        conn.commit()
        cur.close()
        conn.close()
        return evidence_id
    except Exception as e:
        logger.warning("Evidence save failed: %s", e)
        return None


class SqlExecutor:
    def __init__(self):
        pass

    def execute(self, step, ctx: StepContext) -> Any:
        context  = {"params": ctx.params, "results": ctx.results}
        bindings = eval_bindings(step.get("input_bindings_json") or {}, context)

        datasource_config = _get_datasource_config(
            step.get("datasource_name", "")
        )

        if datasource_config:
            logger.info("Executing SQL on REAL datasource: %s", step.get("datasource_name"))
            all_params = {}
            all_params.update(ctx.params or {})
            all_params.update(bindings or {})
            data        = self._execute_real_sql(
                datasource_config,
                step.get("sql_template", ""),
                all_params
            )
            data_source = "real"
        else:
            raise RuntimeError(
                f"No datasource config found for '{step.get('datasource_name')}'. "
                f"Please configure host in Datasources!"
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
                    "kind":            "sql",
                    "data_source":     data_source,
                    "plan_name":       ctx.plan_name,
                },
            )
        except Exception as e:
            logger.warning("Evidence failed: %s", e)

        return data

    def _execute_real_sql(self, datasource_config: dict, sql: str, params: dict) -> Any:
        import psycopg2
        import psycopg2.extras

        host     = datasource_config.get("host")
        port     = datasource_config.get("port") or 5432
        database = datasource_config.get("database_name")
        username = datasource_config.get("username")
        password = datasource_config.get("password") or "orchestration"

        conn_str = (
            f"host={host} port={port} "
            f"dbname={database} "
            f"user={username} "
            f"password={password}"
        )

        conn = psycopg2.connect(conn_str)
        cur  = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        psycopg2_sql = sql
        param_names  = re.findall(r':([a-zA-Z_][a-zA-Z0-9_]*)', psycopg2_sql)
        for param_name in param_names:
            psycopg2_sql = psycopg2_sql.replace(
                f":{param_name}", f"%({param_name})s"
            )

        cur.execute(psycopg2_sql, params if params else None)
        rows = cur.fetchall()
        cur.close()
        conn.close()

        serialized = [_serialize_row(dict(r)) for r in rows]
        return {"data": serialized, "row_count": len(serialized)}