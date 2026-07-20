"""
Tenant Purge Service
Path: backend/modules/tenant_purge/service.py

Deletes ALL FlowEngine data for a given tenant_id in strict FK-safe order:
    1. eivs.validation_rules   (FK → intents + datasources — must go first)
    2. eivs.intent_policies    (FK → intents — must go before intents)
    3. eivs.datasource_configs (standalone — safe to delete any time)
    4. eivs.datasources        (FK refs cleared by step 1)
    5. eivs.intents            (FK refs cleared by steps 1 + 2)

    Returns a PurgeSummary with per-entity deleted counts and vault_secret_paths
    of deleted datasources so the caller can optionally clean up Vault.

    Design principles:
        - Single atomic DB transaction: all-or-nothing, rolled back on any failure.
        - Vault paths collected BEFORE deletion so they are never lost.
        - Zero side-effects on other tenants.
        """

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List

from sqlalchemy import text

from backend.core.database import engine


# ── Response DTO ──────────────────────────────────────────────────────────────

@dataclass
class PurgeSummary:
    tenant_id: str
    validation_rules_deleted: int = 0
    intent_policies_deleted: int = 0
    datasource_configs_deleted: int = 0
    datasources_deleted: int = 0
    intents_deleted: int = 0
    vault_secret_paths: List[str] = field(default_factory=list)

    @property
    def total_deleted(self) -> int:
        return (
            self.validation_rules_deleted
            + self.intent_policies_deleted
            + self.datasource_configs_deleted
            + self.datasources_deleted
            + self.intents_deleted
        )


# ── Service ───────────────────────────────────────────────────────────────────

class TenantPurgeService:
    """
    Purges all FlowEngine eivs.* data for a tenant in a single atomic transaction.
    Deletion order strictly respects FK constraints — no constraint violations possible.
    """

    def __init__(self, db=None) -> None:
        # db parameter kept for backward compatibility but not used
        pass

    def purge(self, tenant_id: str) -> PurgeSummary:
        summary = PurgeSummary(tenant_id=tenant_id)

        try:
            with engine.begin() as conn:
                # ── Pre-collect vault paths BEFORE any deletion ───────────────────
                rows = conn.execute(
                    text("""
                        SELECT vault_secret_path FROM eivs.datasource_configs
                        WHERE tenant_id = :tenant_id AND vault_secret_path IS NOT NULL
                    """),
                    {"tenant_id": tenant_id},
                ).fetchall()
                summary.vault_secret_paths = [r.vault_secret_path for r in rows]

                # ── Step 1: validation_rules ──────────────────────────────────────
                result = conn.execute(
                    text("DELETE FROM eivs.validation_rules WHERE tenant_id = :tenant_id"),
                    {"tenant_id": tenant_id},
                )
                summary.validation_rules_deleted = result.rowcount

                # ── Step 2: intent_policies ───────────────────────────────────────
                result = conn.execute(
                    text("DELETE FROM eivs.intent_policies WHERE tenant_id = :tenant_id"),
                    {"tenant_id": tenant_id},
                )
                summary.intent_policies_deleted = result.rowcount

                # ── Step 3: datasource_configs ────────────────────────────────────
                result = conn.execute(
                    text("DELETE FROM eivs.datasource_configs WHERE tenant_id = :tenant_id"),
                    {"tenant_id": tenant_id},
                )
                summary.datasource_configs_deleted = result.rowcount

                # ── Step 4: datasources ───────────────────────────────────────────
                result = conn.execute(
                    text("DELETE FROM eivs.datasources WHERE tenant_id = :tenant_id"),
                    {"tenant_id": tenant_id},
                )
                summary.datasources_deleted = result.rowcount

                # ── Step 5: intents ───────────────────────────────────────────────
                result = conn.execute(
                    text("DELETE FROM eivs.intents WHERE tenant_id = :tenant_id"),
                    {"tenant_id": tenant_id},
                )
                summary.intents_deleted = result.rowcount

        except Exception:
            raise

        return summary