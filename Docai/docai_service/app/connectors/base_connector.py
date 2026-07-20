from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import TypedDict


class ConnectorResult(TypedDict):
    connector: str
    success: bool
    external_id: str
    error: str | None
    timestamp: str


class BaseConnector(ABC):
    @property
    @abstractmethod
    def connector_name(self) -> str:
        raise NotImplementedError

    @abstractmethod
    def push(self, parse_result: dict, doc_type_name: str, metadata: dict) -> dict:
        raise NotImplementedError

    @staticmethod
    def build_result(
        connector: str,
        success: bool,
        external_id: str = "",
        error: str | None = None,
    ) -> ConnectorResult:
        return ConnectorResult(
            connector=connector,
            success=success,
            external_id=external_id,
            error=error,
            timestamp=datetime.now(timezone.utc).isoformat(),
        )
