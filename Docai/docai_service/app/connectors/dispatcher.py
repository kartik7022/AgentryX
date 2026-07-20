from __future__ import annotations

import os
from typing import Any

from .base_connector import ConnectorResult
from .rag_connector import RAGConnector
from .sap_connector import SAPConnector
from .salesforce_connector import SalesforceConnector


class ConnectorDispatcher:
    def __init__(self) -> None:
        self.connectors = self._initialize_connectors()

    def _env_flag(self, name: str) -> bool:
        return os.getenv(name, "false").lower() == "true"

    def _initialize_connectors(self):
        connectors = []
        if self._env_flag("ENABLE_SALESFORCE"):
            connector = SalesforceConnector()
            if connector.is_configured():
                connectors.append(connector)
        if self._env_flag("ENABLE_SAP"):
            connector = SAPConnector()
            if connector.is_configured():
                connectors.append(connector)
        if self._env_flag("ENABLE_RAG"):
            connectors.append(RAGConnector())
        return connectors

    def dispatch(self, parse_result: dict, doc_type_name: str, metadata: dict) -> list[ConnectorResult]:
        results: list[ConnectorResult] = []
        for connector in self.connectors:
            try:
                result = connector.push(parse_result, doc_type_name, metadata)
                if not isinstance(result, dict):
                    result = connector.build_result(connector.connector_name, False, error="Invalid connector result")
                results.append(result)  # type: ignore[arg-type]
            except Exception as exc:  # pragma: no cover - defensive
                results.append(
                    connector.build_result(
                        connector.connector_name,
                        False,
                        error=str(exc),
                    )
                )
        return results
