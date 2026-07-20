# services/tests/test_agent_budget.py
"""AGENT-016: unit tests for AgentBudgetManager."""
import pytest

from services.agent.agent_contract import AgentBudgetConfig
from services.agent.agent_budget import AgentBudgetManager, AgentBudgetExceeded


def _manager(tenant_budget=None, tenant_policy=None, **overrides):
    cfg = AgentBudgetConfig(**overrides) if overrides else AgentBudgetConfig()
    return AgentBudgetManager(step_budget=cfg, tenant_budget=tenant_budget, tenant_policy=tenant_policy)


def test_iteration_budget_allows_up_to_max():
    mgr = _manager(max_iterations=2)
    mgr.check_before_iteration()
    mgr.check_before_iteration()
    with pytest.raises(AgentBudgetExceeded):
        mgr.check_before_iteration()


def test_model_call_budget():
    mgr = _manager(max_model_calls=1, max_cost_usd=10.0)
    mgr.check_before_model_call(estimated_cost=0.001)
    with pytest.raises(AgentBudgetExceeded):
        mgr.check_before_model_call(estimated_cost=0.001)


def test_cost_budget_exceeded_before_call_count():
    mgr = _manager(max_model_calls=10, max_cost_usd=0.001)
    with pytest.raises(AgentBudgetExceeded) as exc_info:
        mgr.check_before_model_call(estimated_cost=0.01)
    assert exc_info.value.limit_type == "cost"


def test_tool_call_budget():
    mgr = _manager(max_tool_calls=1)
    mgr.check_before_tool_call("datasource_lookup")
    with pytest.raises(AgentBudgetExceeded):
        mgr.check_before_tool_call("datasource_lookup")


def test_tenant_budget_is_stricter_than_step_budget():
    step_cfg = AgentBudgetConfig(max_iterations=10)
    mgr = AgentBudgetManager(step_budget=step_cfg, tenant_budget={"max_iterations": 2})
    mgr.check_before_iteration()
    mgr.check_before_iteration()
    with pytest.raises(AgentBudgetExceeded):
        mgr.check_before_iteration()


def test_snapshot_reports_usage_and_limits():
    mgr = _manager(max_iterations=5)
    mgr.check_before_iteration()
    snap = mgr.snapshot()
    assert snap["iterations_used"] == 1
    assert snap["limits"]["max_iterations"] == 5