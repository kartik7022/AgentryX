# services/executors/ai_transform_executor_adapter.py
from .step_executor import StepExecutor
from .ai_transform_executor import AiTransformExecutor
from .base import StepContext
from ..models.runtime_context import StepExecutionInput, StepExecutionResult


class AiTransformExecutorAdapter(StepExecutor):
    def __init__(self):
        self._inner = AiTransformExecutor()

    @property
    def kind(self) -> str:
        return "ai_transform"

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
            if isinstance(output, dict) and output.get("status") in ("AI call failed", "failed"):
                return self.failure(
                    step_key=ctx.step_key,
                    kind=self.kind,
                    error={"message": output.get("error", "AI call failed"), "type": "AiCallError"},
                    duration_ms=self._elapsed_ms(start),
                )
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