# orchestration/orchestration/services/executors/base.py
from dataclasses import dataclass
from typing import Any, Dict


@dataclass
class StepContext:
    tenant_id: str
    params:    Dict[str, str]
    results:   Dict[str, Any]
    plan_name: str = ""  # ← Added!