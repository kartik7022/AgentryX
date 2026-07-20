# services/agent/agent_budget.py
from __future__ import annotations
import time
from typing import Any, Dict, Optional
from .agent_contract import AgentBudgetConfig


class AgentBudgetExceeded(Exception):
    def __init__(self, limit_type: str, used: float, limit: float):
        self.limit_type = limit_type
        self.used       = used
        self.limit      = limit
        super().__init__(f"Agent budget exceeded: {limit_type} — used {used}, limit {limit}")


class AgentBudgetManager:
    def __init__(
        self,
        step_budget:   AgentBudgetConfig,
        tenant_budget: Optional[Dict[str, Any]] = None,
        tenant_policy: Optional[Dict[str, Any]] = None,
    ):
        def _strictest(key: str, default: float) -> float:
            candidates = [getattr(step_budget, key, default)]
            if tenant_budget and key in tenant_budget:
                candidates.append(float(tenant_budget[key]))
            if tenant_policy and key in tenant_policy:
                candidates.append(float(tenant_policy[key]))
            return min(candidates)

        self._max_iterations  = int(_strictest("max_iterations",  step_budget.max_iterations))
        self._max_model_calls = int(_strictest("max_model_calls", step_budget.max_model_calls))
        self._max_tool_calls  = int(_strictest("max_tool_calls",  step_budget.max_tool_calls))
        self._max_cost_usd    = _strictest("max_cost_usd",        step_budget.max_cost_usd)
        self._max_rows        = int(_strictest("max_rows",        step_budget.max_rows))
        self._max_bytes_mb    = _strictest("max_bytes_mb",        step_budget.max_bytes_mb)
        self._timeout_ms      = int(_strictest("timeout_ms",      step_budget.timeout_ms))

        self._iterations_used  = 0
        self._model_calls_used = 0
        self._tool_calls_used  = 0
        self._cost_used_usd    = 0.0
        self._rows_used        = 0
        self._bytes_used       = 0.0
        self._start_time_ms    = int(time.time() * 1000)

    def check_before_iteration(self) -> None:
        self._iterations_used += 1
        if self._iterations_used > self._max_iterations:
            raise AgentBudgetExceeded("iterations", self._iterations_used, self._max_iterations)
        elapsed_ms = int(time.time() * 1000) - self._start_time_ms
        if elapsed_ms > self._timeout_ms:
            raise AgentBudgetExceeded("timeout_ms", elapsed_ms, self._timeout_ms)

    def check_before_model_call(self, estimated_cost: float = 0.0) -> None:
        self._model_calls_used += 1
        if self._model_calls_used > self._max_model_calls:
            raise AgentBudgetExceeded("model_calls", self._model_calls_used, self._max_model_calls)
        projected_cost = self._cost_used_usd + estimated_cost
        if projected_cost > self._max_cost_usd:
            raise AgentBudgetExceeded("cost", projected_cost, self._max_cost_usd)

    def check_before_tool_call(self, tool_name: str = "") -> None:
        self._tool_calls_used += 1
        if self._tool_calls_used > self._max_tool_calls:
            raise AgentBudgetExceeded("tool_calls", self._tool_calls_used, self._max_tool_calls)

    def record_model_usage(self, tokens_prompt: int = 0, tokens_completion: int = 0, cost_usd: float = 0.0) -> None:
        self._cost_used_usd += cost_usd

    def record_tool_usage(self, tool_name: str = "", rows: int = 0, bytes_count: int = 0, cost_usd: float = 0.0) -> None:
        self._rows_used     += rows
        self._bytes_used    += bytes_count / (1024 * 1024)
        self._cost_used_usd += cost_usd

    def snapshot(self) -> Dict[str, Any]:
        elapsed_ms = int(time.time() * 1000) - self._start_time_ms
        return {
            "iterations_used":  self._iterations_used,
            "model_calls_used": self._model_calls_used,
            "tool_calls_used":  self._tool_calls_used,
            "cost_used_usd":    round(self._cost_used_usd, 6),
            "rows_used":        self._rows_used,
            "bytes_used_mb":    round(self._bytes_used, 4),
            "elapsed_ms":       elapsed_ms,
            "limits": {
                "max_iterations":  self._max_iterations,
                "max_model_calls": self._max_model_calls,
                "max_tool_calls":  self._max_tool_calls,
                "max_cost_usd":    self._max_cost_usd,
                "max_rows":        self._max_rows,
                "max_bytes_mb":    self._max_bytes_mb,
                "timeout_ms":      self._timeout_ms,
            },
        }