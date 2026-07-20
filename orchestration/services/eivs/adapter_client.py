from typing import Any, Dict, Optional

import httpx

from services.eivs.config import settings


class AdapterClientError(Exception):
    pass


async def call_adapter_email_validation_analyze(
    *,
    tenant_id: str,
    prompt: str,
    datasource_name: str,
    correlation_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Calls Adapter /v1/email-validation/analyze and returns its JSON response.

    Expected Adapter response shape:
    {
        "status": "ok" | "blocked",
        "datasource_result": [...],
        "sql_executed": "...",
        "sgate_decision": "ALLOW" | "WARN" | "BLOCK",
        "safety_request_id": "...",
        "evidence_id": "...",
        "request_id": "..."
    }
    """
    base_url = settings.adapter_base_url
    url = f"{base_url.rstrip('/')}/v1/email-validation/analyze"

    headers: Dict[str, str] = {
        "Content-Type": "application/json",
    }
    if correlation_id:
        # Match Adapter's header alias: X-Correlation-ID
        headers["X-Correlation-ID"] = correlation_id

    payload: Dict[str, Any] = {
        "tenant_id": tenant_id,
        "prompt": prompt,
        "datasource_name": datasource_name,
        "event_type": "EMAIL_PROCESSING",
    }

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(url, headers=headers, json=payload)

    if resp.status_code != 200:
        raise AdapterClientError(f"Adapter returned {resp.status_code}: {resp.text}")

    data = resp.json()
    # Basic shape validation
    if "datasource_result" not in data:
        raise AdapterClientError("Adapter response missing 'datasource_result'")

    return data


async def call_adapter_email_search_analyze(
    *,
    tenant_id: str,
    prompt: str,
    datasource_name: str,
    correlation_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Calls Adapter /v1/email-search/analyze for the Email Search feature.

    Expected Adapter response shape:
    {
        "status": "ok" | "blocked",
        "datasource_result": [...],
        "sql_executed": "...",
        "sgate_decision": "ALLOW" | "WARN" | "BLOCK",
        "safety_request_id": "...",
        "evidence_id": "...",
        "request_id": "..."
    }
    """
    base_url = settings.adapter_base_url
    url = f"{base_url.rstrip('/')}/v1/email-search/analyze"

    headers: Dict[str, str] = {
        "Content-Type": "application/json",
    }
    if correlation_id:
        # Match Adapter's header alias: X-Correlation-ID
        headers["X-Correlation-ID"] = correlation_id

    payload: Dict[str, Any] = {
        "tenant_id": tenant_id,
        "prompt": prompt,
        "datasource_name": datasource_name,
        "event_type": "EMAIL_SEARCH",
    }

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(url, headers=headers, json=payload)

    if resp.status_code != 200:
        raise AdapterClientError(f"Adapter returned {resp.status_code}: {resp.text}")

    data = resp.json()
    # Basic shape validation
    if "datasource_result" not in data:
        raise AdapterClientError("Adapter response missing 'datasource_result'")

    return data


class AdapterClient:
    """
    Object-oriented wrapper for Adapter calls.
    Uses settings.adapter_base_url by default.
    """

    def __init__(self, base_url: Optional[str] = None) -> None:
        self.base_url = (base_url or settings.adapter_base_url).rstrip("/")

    async def email_validation_analyze(
        self,
        *,
        tenant_id: str,
        prompt: str,
        datasource_name: str,
        correlation_id: Optional[str] = None,
        event_type: str = "EMAIL_PROCESSING",
    ) -> Dict[str, Any]:
        """
        OO wrapper around /v1/email-validation/analyze.
        """
        url = f"{self.base_url}/v1/email-validation/analyze"

        headers: Dict[str, str] = {
            "Content-Type": "application/json",
        }
        if correlation_id:
            headers["X-Correlation-ID"] = correlation_id

        payload: Dict[str, Any] = {
            "tenant_id": tenant_id,
            "prompt": prompt,
            "datasource_name": datasource_name,
            "event_type": event_type,
        }

        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(url, headers=headers, json=payload)

        if resp.status_code != 200:
            raise AdapterClientError(
                f"Adapter returned {resp.status_code}: {resp.text}"
            )

        data = resp.json()
        if "datasource_result" not in data:
            raise AdapterClientError("Adapter response missing 'datasource_result'")

        return data

    async def email_search_analyze(
        self,
        *,
        tenant_id: str,
        prompt: str,
        datasource_name: str,
        correlation_id: Optional[str] = None,
        event_type: str = "EMAIL_SEARCH",
    ) -> Dict[str, Any]:
        """
        OO wrapper around /v1/email-search/analyze.
        """
        url = f"{self.base_url}/v1/email-search/analyze"

        headers: Dict[str, str] = {
            "Content-Type": "application/json",
        }
        if correlation_id:
            headers["X-Correlation-ID"] = correlation_id

        payload: Dict[str, Any] = {
            "tenant_id": tenant_id,
            "prompt": prompt,
            "datasource_name": datasource_name,
            "event_type": event_type,
        }

        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(url, headers=headers, json=payload)

        if resp.status_code != 200:
            raise AdapterClientError(
                f"Adapter returned {resp.status_code}: {resp.text}"
            )

        data = resp.json()
        if "datasource_result" not in data:
            raise AdapterClientError("Adapter response missing 'datasource_result'")

        return data