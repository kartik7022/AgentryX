# services/tests/test_agent_contract.py
"""AGENT-015: unit tests for AgentTaskConfig and its nested models."""
import pytest
from pydantic import ValidationError

from services.agent.agent_contract import (
    AgentTaskConfig, PromptRef, AgentApprovalPolicy, AgentFallbackPolicy,
)


def _base_kwargs(**overrides):
    kwargs = dict(
        prompt_ref=PromptRef(prompt_id="p1"),
        goal="do the thing",
        allowed_tools=["datasource_lookup"],
        output_schema={"type": "object"},
    )
    kwargs.update(overrides)
    return kwargs


def test_valid_config_builds():
    cfg = AgentTaskConfig(**_base_kwargs())
    assert cfg.goal == "do the thing"
    assert cfg.budgets.max_iterations == 5  # default
    assert cfg.pass_threshold == 0.8         # AGENT-011 wiring default
    assert cfg.evaluation_suite == []


def test_wildcard_tool_rejected():
    with pytest.raises(ValidationError):
        AgentTaskConfig(**_base_kwargs(allowed_tools=["*"]))


def test_empty_allowed_tools_rejected():
    with pytest.raises(ValidationError):
        AgentTaskConfig(**_base_kwargs(allowed_tools=[]))


def test_empty_output_schema_rejected():
    with pytest.raises(ValidationError):
        AgentTaskConfig(**_base_kwargs(output_schema={}))


def test_prompt_ref_requires_an_identifier():
    with pytest.raises(ValidationError):
        PromptRef()


def test_prompt_ref_accepts_name_only():
    ref = PromptRef(prompt_name="my-prompt")
    assert ref.version == "published"


def test_fallback_policy_defaults():
    fb = AgentFallbackPolicy()
    assert fb.on_budget_exceeded == "fail"
    assert fb.on_output_invalid == "human_review"
    assert fb.on_approval_rejected == "fail"


def test_approval_policy_mode_pattern_rejects_bad_value():
    with pytest.raises(ValidationError):
        AgentApprovalPolicy(mode="sometimes")


def test_evaluation_suite_and_pass_threshold_accepted():
    cfg = AgentTaskConfig(**_base_kwargs(
        evaluation_suite=[{"type": "field_present", "field": "answer"}],
        pass_threshold=0.5,
    ))
    assert cfg.pass_threshold == 0.5
    assert cfg.evaluation_suite[0]["field"] == "answer"


def test_pass_threshold_out_of_range_rejected():
    with pytest.raises(ValidationError):
        AgentTaskConfig(**_base_kwargs(pass_threshold=1.5))