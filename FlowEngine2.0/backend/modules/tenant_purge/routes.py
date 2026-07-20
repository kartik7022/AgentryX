"""
Tenant Purge Router
Path: backend/modules/tenant_purge/routes.py

Exposes a single admin endpoint:
  DELETE /admin/tenants/{tenant_id}/purge

Called internally by the Account Creation System when an admin deletes a
registered user. Ensures no orphaned eivs.* data remains for the tenant.

Response includes vault_secret_paths of deleted datasources so the caller
can optionally clean up Vault secrets in a follow-up step.

⚠️  This endpoint is destructive and irreversible.
    In production, protect it with an internal-only network rule or
    an admin API key header check.
"""

from typing import List

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from backend.modules.tenant_purge.service import TenantPurgeService

router = APIRouter(prefix="/admin/tenants", tags=["Tenant Purge"])


# ── Response schema ───────────────────────────────────────────────────────────

class PurgeResponse(BaseModel):
    tenant_id: str
    message: str
    validation_rules_deleted: int
    intent_policies_deleted: int
    datasource_configs_deleted: int
    datasources_deleted: int
    intents_deleted: int
    total_deleted: int
    vault_secret_paths: List[str]


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.delete(
    "/{tenant_id}/purge",
    response_model=PurgeResponse,
    status_code=status.HTTP_200_OK,
    summary="Purge all FlowEngine data for a tenant",
)
def purge_tenant(
    tenant_id: str,
) -> PurgeResponse:
    service = TenantPurgeService()
    summary = service.purge(tenant_id)

    return PurgeResponse(
        tenant_id=summary.tenant_id,
        message=(
            f"Tenant '{tenant_id}' purged successfully. "
            f"{summary.total_deleted} record(s) deleted across all eivs tables."
        ),
        validation_rules_deleted=summary.validation_rules_deleted,
        intent_policies_deleted=summary.intent_policies_deleted,
        datasource_configs_deleted=summary.datasource_configs_deleted,
        datasources_deleted=summary.datasources_deleted,
        intents_deleted=summary.intents_deleted,
        total_deleted=summary.total_deleted,
        vault_secret_paths=summary.vault_secret_paths,
    )