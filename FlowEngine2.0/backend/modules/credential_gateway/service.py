"""
Broker client.

Calls the real Credential Broker at BROKER_URL to issue ephemeral credentials.
The Broker reads long-term secrets from Vault and returns short-lived credentials.
"""

from dataclasses import dataclass
from typing import Any, Dict
import httpx

from backend.core.config import settings


@dataclass
class EphemeralCreds:
    credential_id: str
    connector: str
    params: Dict[str, Any]
    expires_at: str


class BrokerClient:
    """
    HTTP client for the Credential Broker service.
    POST /v1/broker/issue → returns ephemeral creds.
    """

    def __init__(self) -> None:
        self._base = settings.broker_url.rstrip("/")

    def issue(self, tenant_id: str, datasource_name: str) -> EphemeralCreds:
       
        url = f"{self._base}/v1/broker/issue"
        payload = {
            "tenantId": tenant_id,
            "datasourceName": datasource_name,
            "requestedTTLSeconds": settings.broker_ttl_seconds,
        }

        try:
            resp = httpx.post(url, json=payload, timeout=15)
            resp.raise_for_status()
        except httpx.ConnectError:
            raise RuntimeError(
        f"Cannot reach Broker at {self._base}. "
        "Check BROKER_URL in .env and ensure the broker service is running."
        )
        except httpx.HTTPStatusError as exc:
            try:
                detail = exc.response.json().get("detail", exc.response.text)
            except Exception:
                detail = exc.response.text
                raise RuntimeError(f"Broker error {exc.response.status_code}: {detail}")

        data = resp.json()
        return EphemeralCreds(
        credential_id=data["credentialId"],
        connector=data.get("connector", "unknown"),
        params=data["credentialValue"],
        expires_at=data["expiresAt"],
    )


def get_broker_client() -> BrokerClient:
    return BrokerClient()