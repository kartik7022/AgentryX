# backend/modules/datasources/types.py

from typing import Any, Dict, List
from backend.modules.datasource_types.service import get_all_as_public


def get_all_types() -> List[Dict[str, Any]]:
    """Return all active datasource type definitions from DB."""
    return get_all_as_public()


def get_type(datasource_type: str) -> Dict[str, Any]:
    """Return a single datasource type definition by type name."""
    for t in get_all_as_public():
        if t["datasource_type"] == datasource_type:
            return t
    raise ValueError(f"Unknown datasource type: '{datasource_type}'")