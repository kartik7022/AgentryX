# orchestration/orchestration/services/executors/graphql_executor.py
from typing import Any, Dict, Optional
import logging
import httpx

from ..config import settings
from ..expression import eval_bindings
from .base import StepContext

logger = logging.getLogger(__name__)


class GraphqlExecutor:
    def __init__(self):
        self.client = httpx.Client(timeout=20.0)

    def execute(self, step, ctx: StepContext) -> Any:
        context  = {"params": ctx.params, "results": ctx.results}
        bindings = eval_bindings(step.get("input_bindings_json") or {}, context)

        query     = step.get("graphql_query_template")
        variables = step.get("graphql_vars_json") or {}

        def _fmt(obj):
            if isinstance(obj, str):
                return obj.format(**bindings)
            if isinstance(obj, dict):
                return {k: _fmt(v) for k, v in obj.items()}
            if isinstance(obj, list):
                return [_fmt(x) for x in obj]
            return obj

        variables = _fmt(variables)

        # ── Get path template ──────────────────────────────────────
        path = step.get("path_template") or ""

        # ── GraphQL Execution ──────────────────────────────────────
        if path.startswith("http://") or path.startswith("https://"):
            # ✅ Path is full URL → call real GraphQL endpoint!
            logger.info("Calling REAL GraphQL endpoint: %s", path)
            resp = self.client.post(
                path,
                json    = {"query": query, "variables": variables},
                headers = {"Content-Type": "application/json"},
            )
            resp.raise_for_status()
            data        = resp.json()
            data_source = "real"
            logger.info("Real GraphQL SUCCESS: %s", path)

        else:
            # ❌ No URL → use mock service
            logger.info("No GraphQL URL for '%s' — using mock", step.get("datasource_name"))
            resp = self.client.post(
                f"{settings.API_EXECUTOR_URL}/v1/execute-graphql",
                json={
                    "tenant_id":       ctx.tenant_id,
                    "datasource_name": step.get("datasource_name"),
                    "query":           query,
                    "variables":       variables,
                },
            )
            resp.raise_for_status()
            data        = resp.json()
            data_source = "mock"

        # ── Evidence ───────────────────────────────────────────────
        try:
            self.client.post(
                f"{settings.EVIDENCE_API_URL}/v1/evidence/assemble",
                json={
                    "execution_id":    f"orch-{step.get('step_key')}",
                    "tenant_id":       ctx.tenant_id,
                    "plan_name":       ctx.plan_name,
                    "step_key":        step.get("step_key"),
                    "result_snapshot": data if isinstance(data, dict) else {"output": data},
                    "metadata": {
                        "datasource_name": step.get("datasource_name"),
                        "kind":            "graphql",
                        "data_source":     data_source,
                        "plan_name":       ctx.plan_name,
                        "endpoint":        path,
                    },
                },
            )
        except Exception:
            pass

        # ── Metering ───────────────────────────────────────────────
        try:
            self.client.post(
                f"{settings.METERING_API_URL}/v1/metering/events",
                json={
                    "tenant_id":    ctx.tenant_id,
                    "event_type":   "orchestration.graphql_call",
                    "execution_id": f"orch-{step.get('step_key')}",
                    "plan_name":    ctx.plan_name,
                    "step_key":     step.get("step_key"),
                    "usage_type":   "graphql_call",
                    "units":        1,
                    "metadata": {
                        "datasource":  step.get("datasource_name"),
                        "data_source": data_source,
                        "endpoint":    path,
                        "plan_name":   ctx.plan_name,
                    },
                },
            )
        except Exception:
            pass

        return data