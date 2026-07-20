# services/executors/step_executor.py
from abc import ABC, abstractmethod
from time import monotonic
from typing import Any, Dict, Optional

from ..models.runtime_context import StepExecutionInput, StepExecutionResult


class UnsupportedStepKindError(Exception):
    pass


class StepExecutor(ABC):
    @property
    @abstractmethod
    def kind(self) -> str:
        ...

    @abstractmethod
    def execute(self, step_input: StepExecutionInput) -> StepExecutionResult:
        ...

    def success(
        self,
        step_key: str,
        kind: str,
        output: Dict[str, Any],
        evidence: Optional[Dict[str, Any]] = None,
        trace_ids: Optional[Dict[str, Any]] = None,
        duration_ms: int = 0,
    ) -> StepExecutionResult:
        return StepExecutionResult(
            step_key=step_key,
            kind=kind,
            status="success",
            output=output,
            evidence=evidence or {},
            trace_ids=trace_ids or {},
            duration_ms=duration_ms,
        )

    def failure(
        self,
        step_key: str,
        kind: str,
        error: Dict[str, Any],
        duration_ms: int = 0,
    ) -> StepExecutionResult:
        return StepExecutionResult(
            step_key=step_key,
            kind=kind,
            status="failed",
            error=error,
            duration_ms=duration_ms,
        )

    def skipped(self, step_key: str, kind: str) -> StepExecutionResult:
        return StepExecutionResult(
            step_key=step_key,
            kind=kind,
            status="skipped",
        )

    def _start_timer(self) -> float:
        return monotonic()

    def _elapsed_ms(self, start: float) -> int:
        return int((monotonic() - start) * 1000)