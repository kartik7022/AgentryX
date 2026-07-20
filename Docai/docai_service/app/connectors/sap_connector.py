from __future__ import annotations

import os
from typing import Any

import requests

from .base_connector import BaseConnector, ConnectorResult


class SAPConnector(BaseConnector):
    def __init__(self) -> None:
        self.odata_url = os.getenv("SAP_ODATA_URL")
        self.username = os.getenv("SAP_USERNAME")
        self.password = os.getenv("SAP_PASSWORD")

    @property
    def connector_name(self) -> str:
        return "sap"

    def is_configured(self) -> bool:
        return all([self.odata_url, self.username, self.password])

    def _payload(self, parse_result: dict, doc_type_name: str, metadata: dict) -> dict[str, Any]:
        payload = dict(parse_result.get("fields", parse_result))
        payload.update(
            {
                "doc_type_name": doc_type_name,
                "metadata": metadata,
            }
        )
        payload.pop("connector_results", None)
        payload.pop("content", None)
        payload.pop("intent", None)
        return payload

    def push(self, parse_result: dict, doc_type_name: str, metadata: dict) -> ConnectorResult:
        if not self.is_configured():
            return self.build_result(self.connector_name, False, error="SAP connector not configured")

        try:
            payload = self._payload(parse_result, doc_type_name, metadata)
            response = requests.post(
                self.odata_url,
                json=payload,
                auth=(self.username, self.password),
                timeout=30,
            )
            response.raise_for_status()
            external_id = ""
            if response.headers.get("Location"):
                external_id = response.headers["Location"]
            elif response.headers.get("X-Request-Id"):
                external_id = response.headers["X-Request-Id"]
            else:
                try:
                    body = response.json()
                    if isinstance(body, dict):
                        external_id = str(body.get("id", ""))
                except ValueError:
                    external_id = ""
            return self.build_result(self.connector_name, True, external_id=external_id)
        except Exception as exc:  # pragma: no cover - exercised in tests via mocks
            return self.build_result(self.connector_name, False, error=str(exc))
