# services/agent/agent_tools.py
from __future__ import annotations
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Dict, List, Optional
from jsonschema import validate, ValidationError

logger = logging.getLogger(__name__)


@dataclass
class AgentToolResult:
    status:      str
    output:      Dict[str, Any]
    rows_count:  int   = 0
    bytes_count: int   = 0
    cost_usd:    float = 0.0
    error:       Optional[str] = None


class AgentTool(ABC):
    @property
    @abstractmethod
    def name(self) -> str: ...
    @property
    @abstractmethod
    def action_type(self) -> str: ...
    @property
    @abstractmethod
    def read_only(self) -> bool: ...
    @property
    @abstractmethod
    def requires_approval(self) -> bool: ...
    @property
    def input_schema(self) -> Dict[str, Any]: return {"type": "object"}
    @property
    def output_schema(self) -> Dict[str, Any]: return {"type": "object"}

    def _validate_input(self, tool_input: Dict[str, Any]) -> None:
        try:
            validate(instance=tool_input, schema=self.input_schema)
        except ValidationError as e:
            raise ValueError(f"Tool '{self.name}' input validation failed: {e.message}")

    @abstractmethod
    def execute(self, tool_input: Dict[str, Any], context=None) -> AgentToolResult: ...


class DatasourceLookupTool(AgentTool):
    @property
    def name(self):             return "datasource_lookup"
    @property
    def action_type(self):      return "read"
    @property
    def read_only(self):        return True
    @property
    def requires_approval(self): return False
    @property
    def input_schema(self):
        return {"type": "object", "properties": {"datasource_name": {"type": "string"}, "query": {"type": "string"}, "params": {"type": "object"}}, "required": ["datasource_name", "query"]}
    def execute(self, tool_input, context=None):
        self._validate_input(tool_input)
        datasource_name = tool_input["datasource_name"]
        query = tool_input["query"]
        params = tool_input.get("params") or {}

        # Read-only guard: agent-driven SQL must never be able to mutate
        # state, regardless of what the model asks for.
        if any(kw in query.upper() for kw in ("DROP", "DELETE", "TRUNCATE", "INSERT", "UPDATE", "ALTER", "GRANT")):
            return AgentToolResult(status="failed", output={}, error="Only read-only SELECT queries are allowed for datasource_lookup")

        try:
            # Reuse the same datasource-config lookup and connection pattern
            # as the sql step kind, so there is one place that knows how to
            # resolve an orchestration.datasources row into a connection.
            from ..executors.sql_executor import _get_datasource_config
            import psycopg2
            import psycopg2.extras
            import re as _re

            config = _get_datasource_config(datasource_name)
            if not config:
                return AgentToolResult(status="failed", output={}, error=f"No active datasource config found for '{datasource_name}'")

            conn_str = (
                f"host={config.get('host')} port={config.get('port') or 5432} "
                f"dbname={config.get('database_name')} user={config.get('username')} "
                f"password={config.get('password') or 'orchestration'}"
            )
            conn = psycopg2.connect(conn_str)
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

            pg_sql = query
            for param_name in _re.findall(r':([a-zA-Z_][a-zA-Z0-9_]*)', pg_sql):
                pg_sql = pg_sql.replace(f":{param_name}", f"%({param_name})s")

            cur.execute(pg_sql, params if params else None)
            rows = [dict(r) for r in cur.fetchall()]
            cur.close()
            conn.close()

            def _jsonable(v):
                if hasattr(v, "isoformat"):
                    return v.isoformat()
                return v
            rows = [{k: _jsonable(v) for k, v in r.items()} for r in rows]

            return AgentToolResult(
                status="success",
                output={"datasource": datasource_name, "rows": rows, "row_count": len(rows), "status": "success"},
                rows_count=len(rows),
            )
        except Exception as e:
            logger.exception("datasource_lookup tool failed")
            return AgentToolResult(status="failed", output={}, error=str(e))


class AdapterAnalyzeTool(AgentTool):
    @property
    def name(self):             return "adapter_analyze"
    @property
    def action_type(self):      return "read"
    @property
    def read_only(self):        return True
    @property
    def requires_approval(self): return False
    @property
    def input_schema(self):
        return {"type": "object", "properties": {"operation": {"type": "string", "enum": ["email_validation_analyze","email_search_analyze"]}, "datasource_name": {"type": "string"}, "prompt": {"type": "string"}}, "required": ["operation","datasource_name"]}
    def execute(self, tool_input, context=None):
        self._validate_input(tool_input)
        import asyncio
        from ..eivs.adapter_client import (
            call_adapter_email_validation_analyze,
            call_adapter_email_search_analyze,
            AdapterClientError,
        )

        operation = tool_input["operation"]
        tenant_id = getattr(context, "tenant_id", None) or "global"
        correlation_id = getattr(context, "correlation_id", None)
        prompt = tool_input.get("prompt") or ""

        call = (
            call_adapter_email_validation_analyze
            if operation == "email_validation_analyze"
            else call_adapter_email_search_analyze
        )

        try:
            data = asyncio.run(call(
                tenant_id=tenant_id,
                prompt=prompt,
                datasource_name=tool_input["datasource_name"],
                correlation_id=correlation_id,
            ))
            return AgentToolResult(
                status="success",
                output={"operation": operation, "datasource_result": data.get("datasource_result"),
                        "sgate_decision": data.get("sgate_decision"), "status": "success"},
            )
        except AdapterClientError as e:
            return AgentToolResult(status="failed", output={}, error=f"Adapter call failed: {e}")
        except Exception as e:
            logger.exception("adapter_analyze tool failed")
            return AgentToolResult(status="failed", output={}, error=str(e))


class PromptRunTool(AgentTool):
    @property
    def name(self):             return "prompt_run"
    @property
    def action_type(self):      return "read"
    @property
    def read_only(self):        return True
    @property
    def requires_approval(self): return False
    @property
    def input_schema(self):
        return {"type": "object", "properties": {"prompt_template": {"type": "string"}, "context": {"type": "object"}}, "required": ["prompt_template"]}
    def execute(self, tool_input, context=None):
        self._validate_input(tool_input)
        # Reuse the exact same prompt-building and Groq-calling logic as the
        # prompt_run step kind, so agent-driven prompt calls and
        # orchestration-plan prompt_run steps behave identically.
        from ..executors.prompt_run_executor import _build_prompt, _call_groq

        runtime_params = getattr(context, "runtime_params", None) or {}
        prior_results = getattr(context, "prior_step_results", None) or {}
        extra_context = tool_input.get("context") or {}

        prompt = _build_prompt(
            tool_input["prompt_template"],
            {**runtime_params, **extra_context},
            prior_results,
        )
        try:
            llm_result = _call_groq(prompt)
            return AgentToolResult(
                status="success",
                output={"prompt_run_id": None, "output": llm_result["output"], "status": "success"},
                cost_usd=0.001,
            )
        except Exception as e:
            logger.exception("prompt_run tool failed")
            return AgentToolResult(status="failed", output={}, error=str(e))


class DocumentGenerateTool(AgentTool):
    @property
    def name(self):             return "document_generate"
    @property
    def action_type(self):      return "document_draft"
    @property
    def read_only(self):        return False
    @property
    def requires_approval(self): return False
    @property
    def input_schema(self):
        return {"type": "object", "properties": {"template_id": {"type": "string"}, "placeholder_values": {"type": "object"}}, "required": ["template_id"]}
    def execute(self, tool_input, context=None):
        self._validate_input(tool_input)
        import uuid as _uuid
        # Lazy import to avoid circular import: main.py -> orchestrator.py ->
        # registry.py -> agent_task_executor.py -> agent_runtime.py ->
        # agent_tools.py, so importing from main.py at module load time here
        # would deadlock the import chain (same reason
        # document_generate_executor.py does this lazily).
        from ..main import TEMPLATES, _render_content

        template_id = tool_input["template_id"]
        template = TEMPLATES.get(template_id)
        if not template:
            return AgentToolResult(status="failed", output={}, error=f"Template '{template_id}' not found")

        placeholder_values = tool_input.get("placeholder_values") or {}
        try:
            content = _render_content(template, placeholder_values)
        except Exception as e:
            return AgentToolResult(status="failed", output={}, error=str(e))

        document_job_id = str(_uuid.uuid4())
        return AgentToolResult(
            status="success",
            output={"document_job_id": document_job_id, "template_id": template_id,
                    "content_preview": content, "status": "success"},
        )


class HumanReviewTool(AgentTool):
    @property
    def name(self):             return "human_review"
    @property
    def action_type(self):      return "state_mutation"
    @property
    def read_only(self):        return False
    @property
    def requires_approval(self): return True
    @property
    def input_schema(self):
        return {"type": "object", "properties": {"instructions": {"type": "string"}, "context": {"type": "object"}}, "required": ["instructions"]}
    def execute(self, tool_input, context=None):
        self._validate_input(tool_input)
        return AgentToolResult(status="needs_approval", output={"status": "approval_requested", "instructions": tool_input["instructions"]})


class WebhookTool(AgentTool):
    @property
    def name(self):             return "webhook"
    @property
    def action_type(self):      return "external_webhook"
    @property
    def read_only(self):        return False
    @property
    def requires_approval(self): return True
    @property
    def input_schema(self):
        return {"type": "object", "properties": {"url": {"type": "string"}, "method": {"type": "string", "enum": ["POST","PUT","PATCH"]}, "payload": {"type": "object"}, "headers": {"type": "object"}}, "required": ["url"]}
    def execute(self, tool_input, context=None):
        self._validate_input(tool_input)
        return AgentToolResult(status="needs_approval", output={"status": "approval_requested", "url": tool_input["url"]})


class AgentToolRegistry:
    def __init__(self):
        self._tools: Dict[str, AgentTool] = {}

    def register(self, tool: AgentTool) -> None:
        self._tools[tool.name] = tool

    def get(self, name: str) -> AgentTool:
        tool = self._tools.get(name)
        if tool is None:
            raise ValueError(f"AgentTool '{name}' is not registered")
        return tool

    def list_allowed(self, names: List[str]) -> List[AgentTool]:
        return [self.get(n) for n in names if n in self._tools]

    def has(self, name: str) -> bool:
        return name in self._tools


def build_default_tool_registry() -> AgentToolRegistry:
    registry = AgentToolRegistry()
    registry.register(DatasourceLookupTool())
    registry.register(AdapterAnalyzeTool())
    registry.register(PromptRunTool())
    registry.register(DocumentGenerateTool())
    registry.register(HumanReviewTool())
    registry.register(WebhookTool())
    return registry