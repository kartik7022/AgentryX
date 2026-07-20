"""
Vault service with enterprise-grade canonical schema normalization.

Writes and reads credentials from Vault KV-v2.
Falls back to in-memory stub if VAULT_ADDR / VAULT_TOKEN not set.
"""

from typing import Any, Dict
from backend.core.config import settings

import hvac
class _VaultStub:
    """In-memory stub for local dev without Vault."""


    def __init__(self) -> None:
        self._store: Dict[str, Dict[str, Any]] = {}


    def write(self, path: str, data: Dict[str, Any]) -> None:
        self._store[path] = data.copy()
        print(f"[VaultStub] write → {path}  keys={list(data.keys())}")

    def read(self, path: str) -> Dict[str, Any]:
        if path not in self._store:
            raise KeyError(f"[VaultStub] path not found: {path}")
        return self._store[path].copy()


    def delete(self, path: str) -> None:
        if path in self._store:
            del self._store[path]
            print(f"[VaultStub] delete → {path}")
        else:
            print(f"[VaultStub] delete → {path} (not found, skipping)")

class _VaultClient:
    """Real Vault KV-v2 client via hvac."""

    def __init__(self) -> None:


        self._client = hvac.Client(
            url=settings.vault_addr,
            token=settings.vault_token,
        )

        if not self._client.is_authenticated():
            raise RuntimeError(
        "Vault authentication failed. "
        "Check VAULT_ADDR and VAULT_TOKEN in .env"
        )

    def write(self, path: str, data: Dict[str, Any]) -> None:
        """Write to secret/data/<path> in KV-v2."""
        self._client.secrets.kv.v2.create_or_update_secret(
            mount_point=settings.vault_kv_mount,
            path=path,
            secret=data,
        )

    def read(self, path: str) -> Dict[str, Any]:
        """Read from secret/data/<path> in KV-v2."""
        resp = self._client.secrets.kv.v2.read_secret_version(
            mount_point=settings.vault_kv_mount,
            path=path,
        )
        return resp["data"]["data"]

    def delete(self, path: str) -> None:
        """Delete all versions of a secret from KV-v2."""
        self._client.secrets.kv.v2.delete_metadata_and_all_versions(
            mount_point=settings.vault_kv_mount,
            path=path,
        )


def get_vault_client():
    """Return real Vault client if configured, else stub."""
    if settings.vault_enabled:
        return _VaultClient()
    return _VaultStub()


def vault_paths(tenant_id: str, datasource_name: str) -> tuple[str, str]:
    """Generate canonical Vault paths (NO TIMESTAMP per File 5 requirement)."""
    safe_name = datasource_name.replace(" ", "_").replace(":", "-")
    relative = f"datasources/{tenant_id}/{safe_name}"
    full     = f"{settings.vault_kv_mount}/{relative}"
    return relative, full


# ─────────────────────────────────────────────────────────────────────────
# ENTERPRISE GRADE: CANONICAL SCHEMA NORMALIZATION
# ─────────────────────────────────────────────────────────────────────────

def _get_driver_protocol(datasource_type: str) -> str:
    """
    Map datasource type to canonical driverProtocol string.
    Required by File 5: Universal Metadata Schema.
    """
    mapping = {
        "snowflake": "snowflake",
        "postgres": "postgresql",
        "oracle": "oracle+cx_oracle",
        "oracle_jdbc": "jdbc:oracle:thin:@",
        "sap_hana_client": "hana+pyhdb",
        "sqlserver": "mssql+pyodbc",
        "epicor_sqlserver_odbc": "mssql+pyodbc",
        "epic_sqlserver_odbc": "mssql+pyodbc",
        "cdata_generic_odbc": "cdata+odbc",
        "cdata_salesforce_jdbc": "cdata+jdbc",
        "salesforce": "salesforce+rest",
        "epicor_cdata_odbc": "cdata+odbc",
        "progress_datadirect": "datadirect+odbc",
        "dataverse_odbc": "dataverse+odbc",
        "cerner_oracle_odbc": "oracle+cx_oracle",
    }
    return mapping.get(datasource_type, "unknown")

