from __future__ import annotations

import json
import os
from typing import Any

import requests

from .base_connector import BaseConnector, ConnectorResult

try:
    from simple_salesforce import Salesforce
except ImportError:  # pragma: no cover
    Salesforce = None


class SalesforceConnector(BaseConnector):
    def __init__(self) -> None:
        self.username = os.getenv("SF_USERNAME")
        self.password = os.getenv("SF_PASSWORD")
        self.security_token = os.getenv("SF_SECURITY_TOKEN")
        self.domain = os.getenv("SF_DOMAIN", "login")
        self.object_map = self._load_object_map()
        self.sf = None
        if self.is_configured() and Salesforce is not None:
            self.sf = Salesforce(
                username=self.username,
                password=self.password,
                security_token=self.security_token,
                domain=self.domain,
            )

    @property
    def connector_name(self) -> str:
        return "salesforce"

    def is_configured(self) -> bool:
        return all([self.username, self.password, self.security_token, self.domain])

    def _load_object_map(self) -> dict[str, str]:
        raw = os.getenv("SF_OBJECT_MAP", "{}")
        try:
            value = json.loads(raw)
            return value if isinstance(value, dict) else {}
        except json.JSONDecodeError:
            return {}

    def _object_name(self, doc_type_name: str) -> str:
        if doc_type_name in self.object_map:
            return self.object_map[doc_type_name]
        return f"{doc_type_name.replace('_', ' ').title().replace(' ', '')}__c"

    def _map_fields(self, parse_result: dict, metadata: dict) -> dict[str, Any]:
        payload = dict(parse_result.get("fields", parse_result))
        payload.update({k: v for k, v in metadata.items() if v is not None})
        payload.pop("connector_results", None)
        payload.pop("content", None)
        payload.pop("intent", None)
        return payload

    def push(self, parse_result: dict, doc_type_name: str, metadata: dict) -> ConnectorResult:
        if not self.is_configured() or self.sf is None:
            return self.build_result(self.connector_name, False, error="Salesforce connector not configured")

        try:
            object_name = self._object_name(doc_type_name)
            payload = self._map_fields(parse_result, metadata)
            result = getattr(self.sf, object_name).create(payload)
            external_id = ""
            if isinstance(result, dict):
                external_id = str(result.get("id", ""))
            return self.build_result(self.connector_name, True, external_id=external_id)
        except Exception as exc:  # pragma: no cover - exercised in tests via mocks
            return self.build_result(self.connector_name, False, error=str(exc))
