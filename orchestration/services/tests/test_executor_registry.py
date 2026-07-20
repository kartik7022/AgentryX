# services/tests/test_executor_registry.py
"""
ORCH-025: unit tests for the executor registry. Pure Python — no DB or
network needed, since building the registry only instantiates executor
objects (no I/O happens in any executor's __init__).
"""
import pytest

from services.executors.registry import ExecutorRegistry, build_default_registry
from services.executors.step_executor import StepExecutor, UnsupportedStepKindError


class _DummyExecutor(StepExecutor):
    @property
    def kind(self):
        return "dummy"

    def execute(self, step_input):
        return self.success(step_key="s", kind="dummy", output={})


def test_register_and_get():
    registry = ExecutorRegistry()
    executor = _DummyExecutor()
    registry.register("dummy", executor)
    assert registry.get("dummy") is executor


def test_has():
    registry = ExecutorRegistry()
    registry.register("dummy", _DummyExecutor())
    assert registry.has("dummy") is True
    assert registry.has("missing") is False


def test_unregistered_kind_raises():
    registry = ExecutorRegistry()
    with pytest.raises(UnsupportedStepKindError):
        registry.get("does_not_exist")


EXPECTED_KINDS = [
    "sql", "rest", "graphql", "ai_transform",
    "intent_classify", "policy_route", "intent_validate", "adapter_analyze",
    "prompt_run", "document_generate", "human_review", "webhook", "agent_task",
]


def test_default_registry_has_all_13_kinds():
    registry = build_default_registry()
    for kind in EXPECTED_KINDS:
        assert registry.has(kind), f"missing executor for kind={kind}"
        executor = registry.get(kind)
        assert executor.kind == kind