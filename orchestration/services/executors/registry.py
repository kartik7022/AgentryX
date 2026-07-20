# services/executors/registry.py
from typing import Dict

from .step_executor import StepExecutor, UnsupportedStepKindError


class ExecutorRegistry:
    def __init__(self):
        self._executors: Dict[str, StepExecutor] = {}

    def register(self, kind: str, executor: StepExecutor) -> None:
        self._executors[kind] = executor

    def get(self, kind: str) -> StepExecutor:
        executor = self._executors.get(kind)
        if executor is None:
            raise UnsupportedStepKindError(
                f"No executor registered for step kind '{kind}'"
            )
        return executor

    def has(self, kind: str) -> bool:
        return kind in self._executors


def build_default_registry() -> ExecutorRegistry:
    from .sql_executor_adapter import SqlExecutorAdapter
    from .rest_executor_adapter import RestExecutorAdapter
    from .graphql_executor_adapter import GraphqlExecutorAdapter
    from .ai_transform_executor_adapter import AiTransformExecutorAdapter
    from .eivs_intent_classify import IntentClassifyExecutor
    from .eivs_policy_route import PolicyRouteExecutor
    from .eivs_intent_validate import IntentValidateExecutor
    from .eivs_adapter_analyze import AdapterAnalyzeExecutor
    from .agent_task_executor import AgentTaskExecutor        # ← AGENT-009
    from .prompt_run_executor import PromptRunExecutor
    from .document_generate_executor import DocumentGenerateExecutor
    from .human_review_executor import HumanReviewExecutor
    from .webhook_executor import WebhookExecutor

    registry = ExecutorRegistry()
    registry.register("sql", SqlExecutorAdapter())
    registry.register("rest", RestExecutorAdapter())
    registry.register("graphql", GraphqlExecutorAdapter())
    registry.register("ai_transform", AiTransformExecutorAdapter())
    registry.register("intent_classify", IntentClassifyExecutor())
    registry.register("policy_route", PolicyRouteExecutor())
    registry.register("intent_validate", IntentValidateExecutor())
    registry.register("adapter_analyze", AdapterAnalyzeExecutor())
    registry.register("prompt_run", PromptRunExecutor())
    registry.register("document_generate", DocumentGenerateExecutor())
    registry.register("human_review", HumanReviewExecutor())
    registry.register("webhook", WebhookExecutor())
    registry.register("agent_task",        AgentTaskExecutor())  # ← AGENT-009

    return registry