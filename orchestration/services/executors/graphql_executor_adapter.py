# services/executors/graphql_executor_adapter.py
from .step_executor import StepExecutor
from .graphql_executor import GraphqlExecutor
from .base import StepContext
from ..models.runtime_context import StepExecutionInput, StepExecutionResult


class GraphqlExecutorAdapter(StepExecutor):
    def __init__(self):
        self._inner = GraphqlExecutor()

    @property
    def kind(self) -> str:
        return "graphql"

    def execute(self, step_input: StepExecutionInput) -> StepExecutionResult:
        start = self._start_timer()
        ctx = step_input.context
        step_context = StepContext(
            tenant_id=ctx.tenant_id,
            params=ctx.runtime_params,
            results=ctx.prior_step_results,
            plan_name=ctx.plan_name,
        )
        try:
            result = self._inner.execute(step_input.step, step_context)
            output = result if isinstance(result, dict) else {"output": result}
            return self.success(
                step_key=ctx.step_key,
                kind=self.kind,
                output=output,
                duration_ms=self._elapsed_ms(start),
            )
        except Exception as e:
            return self.failure(
                step_key=ctx.step_key,
                kind=self.kind,
                error={"message": str(e), "type": type(e).__name__},
                duration_ms=self._elapsed_ms(start),
            )