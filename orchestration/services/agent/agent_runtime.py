# services/agent/agent_runtime.py
from __future__ import annotations
import json
import logging
import os
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import httpx

from .agent_contract import AgentTaskConfig
from .agent_budget import AgentBudgetManager, AgentBudgetExceeded
from .agent_approval import requires_approval, create_approval_request
from .agent_tools import build_default_tool_registry
from .prompt_contract_client import (
    get_published_prompt_contract,
    validate_runtime_params,
    resolve_context,
    compile_agent_prompt,
)
from .agent_output_validation import (
    validate_agent_output,
    run_agent_evaluations,
    determine_final_status,
)

logger = logging.getLogger(__name__)

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL   = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")


@dataclass
class AgentRunResult:
    status:        str
    output:        Dict[str, Any]
    usage:         Dict[str, Any]
    trace_summary: List[Dict[str, Any]]
    approvals:     List[str]
    evidence:      Dict[str, Any]
    error:         Optional[str] = None


class AgentRuntime:
    def __init__(self, conn=None, tenant_budget=None, tenant_policy=None):
        self._conn          = conn
        self._tenant_budget = tenant_budget or {}
        self._tenant_policy = tenant_policy or {}
        self._tool_registry = build_default_tool_registry()

    def run(self, config: AgentTaskConfig, context, agent_run_id: str) -> AgentRunResult:
        budget = AgentBudgetManager(
            step_budget=config.budgets,
            tenant_budget=self._tenant_budget,
            tenant_policy=self._tenant_policy,
        )
        trace_events:       List[Dict[str, Any]] = []
        approvals:          List[str]            = []
        tool_observations:  List[str]            = []
        event_index = 0

        def _add_trace(event_type: str, event_json: Dict[str, Any]) -> None:
            nonlocal event_index
            trace_events.append({
                "agent_run_id": agent_run_id,
                "execution_id": context.execution_id,
                "step_key":     context.step_key,
                "event_index":  event_index,
                "event_type":   event_type,
                "event_json":   event_json,
            })
            self._persist_trace(agent_run_id, context.execution_id,
                                context.step_key, event_index, event_type, event_json)
            event_index += 1

        # ── AGENT-010: resolve the governed prompt contract up front ────────
        # prompt_ref is a required field on every AgentTaskConfig, so we
        # always attempt this. If no Prompt Builder service is reachable
        # (e.g. local/dev stacks without PROMPT_SERVICE_URL configured), we
        # log it, record a guardrail_check trace event, and fall back to the
        # legacy inline prompt so existing plans keep working.
        contract: Optional[Dict[str, Any]] = None
        resolved_ctx: Dict[str, Any] = {}
        ref = config.prompt_ref
        try:
            contract = get_published_prompt_contract(
                ref.prompt_id or ref.prompt_name, ref.version
            )
            param_errors = validate_runtime_params(contract, context.runtime_params)
            if param_errors:
                _add_trace("guardrail_check", {
                    "check": "prompt_contract_params", "passed": False,
                    "errors": param_errors,
                })
                contract = None
            else:
                resolved_ctx = resolve_context(
                    contract, context.runtime_params, context.prior_step_results
                )
                _add_trace("guardrail_check", {
                    "check": "prompt_contract_resolved", "passed": True,
                    "prompt_id": contract.get("prompt_id"),
                    "source": contract.get("source"),
                })
        except Exception as e:
            logger.warning(
                "PromptContractClient could not resolve prompt_ref=%r — "
                "falling back to inline prompt: %s", ref, e,
            )
            _add_trace("guardrail_check", {
                "check": "prompt_contract_resolved", "passed": False, "reason": str(e),
            })
            contract = None

        try:
            while True:
                # Step 1: iteration budget
                try:
                    budget.check_before_iteration()
                except AgentBudgetExceeded as e:
                    _add_trace("budget_check", {"exceeded": True, "reason": str(e)})
                    return AgentRunResult(status=self._budget_status(config), output={}, usage=budget.snapshot(),
                        trace_summary=trace_events, approvals=approvals,
                        evidence={"agent_run_id": agent_run_id}, error=str(e))

                # Step 2: build state
                state = self._build_state(config, context, tool_observations, contract, resolved_ctx)

                # Step 3: model call budget
                try:
                    budget.check_before_model_call(estimated_cost=0.001)
                except AgentBudgetExceeded as e:
                    _add_trace("budget_check", {"exceeded": True, "reason": str(e)})
                    return AgentRunResult(status=self._budget_status(config), output={}, usage=budget.snapshot(),
                        trace_summary=trace_events, approvals=approvals,
                        evidence={"agent_run_id": agent_run_id}, error=str(e))

                # Step 4: call model
                _add_trace("model_request", {"state_len": len(state)})
                try:
                    decision, usage_info = self._call_model(state, config)
                except Exception as e:
                    _add_trace("error", {"message": str(e), "phase": "model_call"})
                    return AgentRunResult(status="failed", output={}, usage=budget.snapshot(),
                        trace_summary=trace_events, approvals=approvals,
                        evidence={"agent_run_id": agent_run_id}, error=str(e))

                budget.record_model_usage(
                    tokens_prompt=usage_info.get("prompt_tokens", 0),
                    tokens_completion=usage_info.get("completion_tokens", 0),
                    cost_usd=usage_info.get("cost_usd", 0.001),
                )
                action     = decision.get("action", "")
                tool_name  = decision.get("tool_name", "")
                tool_input = decision.get("tool_input", {})
                _add_trace("model_response", {"action": action, "tool_name": tool_name,
                                               "reason": decision.get("reason_code")})

                # Step 5: validate tool in allowed_tools
                if action == "tool_call" and tool_name not in config.allowed_tools:
                    _add_trace("error", {"message": f"Tool '{tool_name}' not in allowed_tools"})
                    return AgentRunResult(status="failed", output={}, usage=budget.snapshot(),
                        trace_summary=trace_events, approvals=approvals,
                        evidence={"agent_run_id": agent_run_id},
                        error=f"Tool '{tool_name}' not in allowed_tools")

                # Step 6: approval gate
                if action in ("tool_call", "request_approval"):
                    try:
                        action_type = self._tool_registry.get(tool_name).action_type
                    except ValueError:
                        action_type = "unknown"
                    if requires_approval(action_type, tool_name, config.approval_policy):
                        approval_id = create_approval_request(
                            conn=self._conn, agent_run_id=agent_run_id,
                            execution_id=context.execution_id or "",
                            tenant_id=context.tenant_id, step_key=context.step_key,
                            approval_type=action_type,
                            requested_action_json={"tool_name": tool_name, "tool_input": tool_input},
                        )
                        approvals.append(approval_id)
                        _add_trace("approval_requested", {"approval_id": approval_id, "tool_name": tool_name})
                        return AgentRunResult(status="needs_approval",
                            output={"pending_approval_id": approval_id},
                            usage=budget.snapshot(), trace_summary=trace_events, approvals=approvals,
                            evidence={"agent_run_id": agent_run_id})

                # Step 7: execute tool
                if action == "tool_call":
                    try:
                        budget.check_before_tool_call(tool_name)
                    except AgentBudgetExceeded as e:
                        _add_trace("budget_check", {"exceeded": True, "reason": str(e)})
                        return AgentRunResult(status=self._budget_status(config), output={}, usage=budget.snapshot(),
                            trace_summary=trace_events, approvals=approvals,
                            evidence={"agent_run_id": agent_run_id}, error=str(e))

                    _add_trace("tool_request", {"tool_name": tool_name, "tool_input": tool_input})
                    try:
                        tool_obj    = self._tool_registry.get(tool_name)
                        tool_result = tool_obj.execute(tool_input, context=context)
                        budget.record_tool_usage(tool_name=tool_name, rows=tool_result.rows_count,
                                                  bytes_count=tool_result.bytes_count, cost_usd=tool_result.cost_usd)
                        _add_trace("tool_response", {"tool_name": tool_name, "status": tool_result.status,
                                                      "output": tool_result.output})
                        tool_observations.append(
                            f"Tool '{tool_name}': {json.dumps(tool_result.output, default=str)[:400]}")
                    except Exception as e:
                        _add_trace("error", {"message": str(e), "phase": f"tool:{tool_name}"})
                        return AgentRunResult(status="failed", output={}, usage=budget.snapshot(),
                            trace_summary=trace_events, approvals=approvals,
                            evidence={"agent_run_id": agent_run_id}, error=str(e))

                # Step 8: final answer
                elif action == "final_answer":
                    final_output = decision.get("final_output", {})

                    # AGENT-011: schema validation + evaluation suite, both
                    # via the previously-unwired agent_output_validation module.
                    schema_errors = validate_agent_output(final_output, config.output_schema)
                    _add_trace("output_validation", {"passed": not schema_errors, "errors": schema_errors})

                    eval_result = run_agent_evaluations(
                        final_output, config.evaluation_suite or None,
                        context={"tenant_id": context.tenant_id},
                    )
                    final_status = determine_final_status(
                        schema_errors, eval_result, config.pass_threshold
                    )

                    if final_status == "output_invalid":
                        # fallback_policy.on_output_invalid can route this to
                        # needs_human_review instead of a hard failure.
                        status = ("needs_human_review"
                                  if config.fallback_policy.on_output_invalid == "human_review"
                                  else "output_invalid")
                        _add_trace("final_answer", {"status": status, "schema_errors": schema_errors,
                                                     "evaluation": eval_result})
                        return AgentRunResult(status=status, output=final_output,
                            usage=budget.snapshot(), trace_summary=trace_events, approvals=approvals,
                            evidence={"agent_run_id": agent_run_id, "evaluation": eval_result},
                            error=f"Output schema validation failed: {schema_errors[0]}")

                    if final_status == "needs_human_review":
                        _add_trace("final_answer", {"status": "needs_human_review", "evaluation": eval_result})
                        return AgentRunResult(status="needs_human_review", output=final_output,
                            usage=budget.snapshot(), trace_summary=trace_events, approvals=approvals,
                            evidence={"agent_run_id": agent_run_id, "evaluation": eval_result},
                            error=f"Evaluation score {eval_result.get('score')} below pass_threshold {config.pass_threshold}")

                    _add_trace("final_answer", {"status": "success", "evaluation": eval_result})
                    return AgentRunResult(status="success", output=final_output,
                        usage=budget.snapshot(), trace_summary=trace_events, approvals=approvals,
                        evidence={"agent_run_id": agent_run_id, "evaluation": eval_result})

                else:
                    _add_trace("error", {"message": f"Unknown action: {action}"})
                    return AgentRunResult(status="failed", output={}, usage=budget.snapshot(),
                        trace_summary=trace_events, approvals=approvals,
                        evidence={"agent_run_id": agent_run_id},
                        error=f"Unknown action: {action}")

        except Exception as e:
            logger.exception("AgentRuntime unexpected error: %s", e)
            return AgentRunResult(status="failed", output={}, usage=budget.snapshot(),
                trace_summary=trace_events, approvals=approvals,
                evidence={"agent_run_id": agent_run_id}, error=str(e))

    def _describe_tool_schemas(self, allowed_tools) -> str:
        """Without this, the prompt only ever said the tool's NAME
        ("ALLOWED TOOLS: datasource_lookup") and never what parameters it
        actually needs — the model had to guess the shape of tool_input,
        which is exactly what caused 'datasource_name is a required
        property' failures in practice. Each tool already declares its own
        input_schema (agent_tools.py); just tell the model what it is."""
        lines = ["TOOL PARAMETERS (tool_input must match these exactly):"]
        for name in allowed_tools:
            try:
                tool = self._tool_registry.get(name)
                lines.append(f"- {name}: {json.dumps(tool.input_schema)}")
            except Exception:
                continue
        return "\n".join(lines)

    def _budget_status(self, config: AgentTaskConfig) -> str:
        """AGENT-011 also covers fallback_policy.on_budget_exceeded, which was
        defined on the contract but never consulted anywhere."""
        if config.fallback_policy.on_budget_exceeded == "human_review":
            return "needs_human_review"
        return "budget_exceeded"

    def _build_state(self, config, context, tool_observations, contract=None, resolved_ctx=None):
        # AGENT-010: when a published prompt contract resolved, build the
        # prompt from it (governed template + resolved placeholders) instead
        # of the ad-hoc inline string. Falls back to the legacy inline prompt
        # when no contract is available (e.g. no Prompt Builder service
        # reachable), so existing plans keep behaving exactly as before.
        if contract is not None:
            guardrails = []
            if config.approval_policy.mode != "none":
                guardrails.append(f"Approval mode: {config.approval_policy.mode}")
            if config.approval_policy.require_approval_for:
                guardrails.append(
                    "Requires approval for: " + ", ".join(config.approval_policy.require_approval_for)
                )
            guardrails.append(self._describe_tool_schemas(config.allowed_tools))
            return compile_agent_prompt(
                contract=contract,
                goal=config.goal,
                runtime_params=context.runtime_params,
                resolved_context=resolved_ctx or {},
                tools=config.allowed_tools,
                guardrails=guardrails or None,
                tool_observations=tool_observations,
            )

        parts = [
            f"GOAL: {config.goal}",
            f"ALLOWED TOOLS: {', '.join(config.allowed_tools)}",
            self._describe_tool_schemas(config.allowed_tools),
            f"TENANT: {context.tenant_id}",
        ]
        if context.runtime_params:
            parts.append(f"PARAMS: {json.dumps(context.runtime_params, default=str)[:500]}")
        if context.prior_step_results:
            parts.append(f"PRIOR RESULTS: {json.dumps(context.prior_step_results, default=str)[:1000]}")
        if tool_observations:
            parts.append("TOOL OBSERVATIONS:\n" + "\n".join(tool_observations[-5:]))

        # Hard, code-enforced stop — the model was observed re-running the
        # same 2-3 queries repeatedly instead of stopping once it genuinely
        # had enough real data (see live trace: 3 useful checks in the first
        # 3 turns, then 7 more turns of pure duplicates, never once
        # attempting final_answer). Rather than only ASKING it nicely to
        # stop, once it has made enough tool calls the code itself now
        # forbids another one outright.
        if len(tool_observations) >= 3:
            parts.append(
                "STOP: you have already performed 3 or more checks (see TOOL "
                "OBSERVATIONS above). Do NOT call datasource_lookup again — "
                "you already have everything you need. You MUST respond with "
                'action="final_answer" this turn, summarizing every check '
                "from TOOL OBSERVATIONS above (do not repeat any of them)."
            )

        parts.append(
            '\nRespond with valid JSON only:\n'
            '{"action":"tool_call"|"final_answer"|"request_approval",'
            '"tool_name":"...","tool_input":{...},'
            '"final_output":{...},"reason_code":"..."}'
        )
        return "\n\n".join(parts)

    def _call_model(self, state: str, config: AgentTaskConfig):
        if not GROQ_API_KEY:
            raise RuntimeError("GROQ_API_KEY not configured")

        max_retries = 3
        last_error = None
        for attempt in range(max_retries + 1):
            try:
                with httpx.Client(timeout=60.0) as client:
                    resp = client.post(GROQ_API_URL,
                        headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
                        json={"model": GROQ_MODEL,
                              "messages": [
                                  {"role": "system", "content": "You are a governed AI agent. Respond with valid JSON only. No markdown."},
                                  {"role": "user",   "content": state},
                              ],
                              "temperature": 0.1, "max_tokens": 1024,
                              "response_format": {"type": "json_object"}})

                    if resp.status_code == 429 and attempt < max_retries:
                        # A single agent run can fire up to max_model_calls
                        # requests back-to-back with no gap — that alone can
                        # trip a short, per-minute-style burst limit, which
                        # is what this retry is actually for. But Groq's
                        # Retry-After can also report a much longer wait
                        # (observed: 1177s / ~20 minutes) when a bigger
                        # quota (hourly/daily) is genuinely exhausted — in
                        # that case, silently blocking the whole request for
                        # 20 minutes is worse than just failing clearly and
                        # immediately, so cap how long we're willing to wait.
                        retry_after = resp.headers.get("Retry-After")
                        suggested_wait = float(retry_after) if retry_after else (2.0 * (attempt + 1))
                        max_wait_seconds = 15.0

                        if suggested_wait > max_wait_seconds:
                            raise RuntimeError(
                                f"Groq rate limit exceeded — server asked us to wait "
                                f"{suggested_wait:.0f}s (~{suggested_wait/60:.1f} min), which is "
                                f"longer than this system will block for. This usually means "
                                f"a larger quota (hourly/daily) is exhausted, not just a brief "
                                f"burst limit. Wait a while before retrying, or check your "
                                f"Groq account's usage limits."
                            )

                        logger.warning(
                            "Groq rate-limited (429) — retrying in %.1fs (attempt %d/%d)",
                            suggested_wait, attempt + 1, max_retries,
                        )
                        time.sleep(suggested_wait)
                        continue

                    resp.raise_for_status()
                    data    = resp.json()
                    content = data["choices"][0]["message"]["content"]
                    usage   = data.get("usage", {})
                    return json.loads(content), {
                        "prompt_tokens":     usage.get("prompt_tokens", 0),
                        "completion_tokens": usage.get("completion_tokens", 0),
                        "cost_usd":          0.001,
                    }
            except httpx.HTTPStatusError as e:
                last_error = e
                if e.response.status_code != 429:
                    raise

        raise RuntimeError(
            f"Groq API still rate-limited after {max_retries} retries: {last_error}"
        )

    def _persist_trace(self, agent_run_id, execution_id, step_key, event_index, event_type, event_json):
        if self._conn is None:
            return
        try:
            cursor = self._conn.cursor()
            cursor.execute("""
                INSERT INTO orchestration.agent_task_trace_events
                    (agent_run_id, execution_id, step_key, event_index, event_type, event_json)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (agent_run_id, event_index) DO NOTHING
            """, (agent_run_id, execution_id or "", step_key, event_index, event_type,
                  json.dumps(event_json, default=str)))
            self._conn.commit()
        except Exception:
            logger.exception("Failed to persist trace event (non-fatal)")