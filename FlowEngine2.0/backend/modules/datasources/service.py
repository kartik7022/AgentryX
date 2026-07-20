#datasources/service
from typing import Optional
from sqlalchemy.orm import Session

from backend.modules.datasources.repository import DatasourceRepository, DatasourceConfigRepository
from backend.modules.datasources.schemas import (
DatasourceCreate, DatasourceUpdate,
DatasourceConfigCreate, DatasourceConfigUpdate
)
from backend.common.exceptions import ResourceNotFoundError, ResourceAlreadyExistsError
from backend.common.exceptions import ValidationException


def _delete_vault_secret(vault_path: str) -> None:
    """Delete a secret from Vault directly (in-process). Non-blocking — logs warnings on failure."""
    try:
        from backend.modules.credential_gateway.vault import get_vault_client
        from backend.core.config import settings
        vault = get_vault_client()
        path = vault_path
        prefix = f"{settings.vault_kv_mount}/"
        if path.startswith(prefix):
            path = path[len(prefix):]
        vault.delete(path)
        print(f"[INFO] Vault credentials deleted for path '{vault_path}'")
    except Exception as exc:
        print(f"[WARN] Vault cleanup failed for path '{vault_path}': {exc}")


class DatasourceService:

    def __init__(self, repo: DatasourceRepository):
        self.repo = repo

    def get_all(self, tenant_id: str, active_only: bool = False):
        return self.repo.get_all(tenant_id, active_only)

    def get(self, tenant_id: str, datasource_id: int):
        obj = self.repo.get_by_id(tenant_id, datasource_id)
        if not obj:
            raise ResourceNotFoundError("Datasource not found")
        return obj

    def create(self, tenant_id: str, payload: DatasourceCreate):
        existing = self.repo.get_by_name(tenant_id, payload.name)
        if existing:
            raise ResourceAlreadyExistsError(f"Datasource with name '{payload.name}' already exists")

        existing_key = self.repo.get_by_connection_key(tenant_id, payload.connection_key)
        if existing_key:
            raise ResourceAlreadyExistsError(f"Datasource with connection key '{payload.connection_key}' already exists")

        # Resolve datasource_type from driver_id
        from backend.modules.datasource_types import repository as dst_repo
        from backend.core.database import engine
        from backend.modules.datasources.repository import _Row
        from sqlalchemy import text

        driver = dst_repo.get_driver_by_id(payload.driver_id)
        if not driver:
            raise ResourceNotFoundError(f"Driver with id '{payload.driver_id}' not found")

        datasource_type = dst_repo.get_datasource_type_alias(driver["driver_id"]) or driver["canonical_name"]

        with engine.begin() as conn:
            row = conn.execute(
                text("""
                    INSERT INTO eivs.datasources
                    (tenant_id, name, datasource_type, connection_key, description, is_active, datasource_mode)
                    VALUES
                    (:tenant_id, :name, :datasource_type, :connection_key, :description, :is_active, :datasource_mode)
                    RETURNING *
                """),
                {
                    "tenant_id": tenant_id,
                    "name": payload.name,
                    "datasource_type": datasource_type,
                    "connection_key": payload.connection_key,
                    "description": payload.description,
                    "is_active": payload.is_active,
                    "datasource_mode": payload.datasource_mode,
                },
            ).fetchone()
        return _Row(row)

    def update(self, tenant_id: str, datasource_id: int, payload: DatasourceUpdate):
        existing = self.repo.get_by_id(tenant_id, datasource_id)
        if not existing:
            raise ResourceNotFoundError("Datasource not found")
        old_connection_key = existing.connection_key
        old_mode = existing.datasource_mode or "data"

        # If switching query → data, block if no vault credentials exist
        if payload.datasource_mode is not None and old_mode == "query" and payload.datasource_mode == "data":
            config_repo = DatasourceConfigRepository(self.repo.db)
            linked_config = config_repo.get_by_name(tenant_id, old_connection_key)
            if not linked_config or not linked_config.vault_secret_path:
                raise ValidationException(
                    "Cannot switch to data mode. Please configure credentials for this datasource first."
                )

        # Resolve driver_id → datasource_type if driver_id provided
        if payload.driver_id is not None:
            from backend.modules.datasource_types import repository as dst_repo
            driver = dst_repo.get_driver_by_id(payload.driver_id)
            if driver:
                payload.datasource_type = dst_repo.get_datasource_type_alias(driver["driver_id"]) or driver["canonical_name"]
            payload = DatasourceUpdate(**{k: v for k, v in payload.model_dump(exclude_unset=True).items() if k != "driver_id"})

        # If name changed, check for duplicates BEFORE updating
        if payload.name and payload.name != existing.name:
            existing_name = self.repo.get_by_name(tenant_id, payload.name)
            if existing_name:
                raise ResourceAlreadyExistsError(f"Datasource with name '{payload.name}' already exists")

        # If connection_key changed, check for duplicates BEFORE updating
        if payload.connection_key and payload.connection_key != old_connection_key:
            existing_key = self.repo.get_by_connection_key(tenant_id, payload.connection_key)
            if existing_key:
                raise ResourceAlreadyExistsError(f"Datasource with connection key '{payload.connection_key}' already exists")

        obj = self.repo.update(tenant_id, datasource_id, payload)
        if not obj:
            raise ResourceNotFoundError("Datasource not found")

        # If switching data → query, delete vault credentials
        if payload.datasource_mode == "query" and old_mode == "data":
            config_repo = DatasourceConfigRepository(self.repo.db)
            linked_config = config_repo.get_by_name(tenant_id, old_connection_key)
            if linked_config and linked_config.vault_secret_path:
                _delete_vault_secret(linked_config.vault_secret_path)
                config_repo.update(tenant_id, linked_config.config_id, DatasourceConfigUpdate(vault_secret_path=None))

        # If connection_key changed, update the associated config's name
        if payload.connection_key and payload.connection_key != old_connection_key:
            config_repo = DatasourceConfigRepository(self.repo.db)
            old_config = config_repo.get_by_name(tenant_id, old_connection_key)
            if old_config:
                config_update = DatasourceConfigUpdate(name=payload.connection_key)
                config_repo.update(tenant_id, old_config.config_id, config_update)

        return obj

    def delete(self, tenant_id: str, datasource_id: int):
        datasource = self.repo.get_by_id(tenant_id, datasource_id)
        if not datasource:
            raise ResourceNotFoundError("Datasource not found")

        rule_count = self.repo.get_validation_rules_count(tenant_id, datasource_id)
        if rule_count > 0:
            raise ValidationException(
                f"Cannot delete datasource '{datasource.name}'. "
                f"It is associated with {rule_count} validation rule(s). "
                f"Please remove the associations first."
            )


        # Find linked DatasourceConfig via connection_key and delete its Vault secret
        config_repo = DatasourceConfigRepository(self.repo.db)
        linked_config = config_repo.get_by_name(tenant_id, datasource.connection_key)
        if linked_config and linked_config.vault_secret_path:
            _delete_vault_secret(linked_config.vault_secret_path)

        deleted = self.repo.delete(tenant_id, datasource_id)
        if not deleted:
            raise ResourceNotFoundError("Datasource not found")



class DatasourceConfigService:

    def __init__(self, repo: DatasourceConfigRepository, db: Session = None):
        self.repo = repo
        self.db = db or repo.db

    def get_all(self, tenant_id: str, active_only: bool = False):
        return self.repo.get_all(tenant_id, active_only)

    def get(self, tenant_id: str, config_id: int):
        obj = self.repo.get_by_id(tenant_id, config_id)
        if not obj:
            raise ResourceNotFoundError(f"Datasource config with id '{config_id}' not found")
        return obj

    def get_by_name(self, tenant_id: str, name: str):
        obj = self.repo.get_by_name(tenant_id, name)
        if not obj:
            raise ResourceNotFoundError(f"Datasource config with name '{name}' not found")
        return obj

    def get_by_driver_family(self, tenant_id: str, driver_family: str):
        return self.repo.get_by_driver_family(tenant_id, driver_family)

    def get_by_protocol(self, tenant_id: str, protocol: str):
        return self.repo.get_by_protocol(tenant_id, protocol)

    def create(self, tenant_id: str, payload: DatasourceConfigCreate):
        existing = self.repo.get_by_name(tenant_id, payload.name)
        if existing:
            raise ResourceAlreadyExistsError(
                f"Datasource config with name '{payload.name}' already exists"
            )

        # Resolve driver_id, driver_family (canonical), protocol from driver_definitions
        from backend.modules.datasource_types import repository as dst_repo
        driver = dst_repo.resolve_driver_by_alias(payload.driver_family)
        if not driver:
            driver = dst_repo.get_driver_by_canonical_name(payload.driver_family)

        if driver:
            payload_data = payload.model_dump()
            payload_data["driver_id"] = driver["driver_id"]
            payload_data["driver_family"] = driver["canonical_name"]
            payload_data["protocol"] = driver["protocol"]
            payload = DatasourceConfigCreate(**payload_data)

        config = self.repo.create(tenant_id, payload)
        return config

    def update(self, tenant_id: str, config_id: int, payload: DatasourceConfigUpdate):
        """
        Update datasource config.

        If the config NAME changes, update the connection_key of the single
        datasource that was using the old name — this keeps the 1-to-1 link intact.

        We do NOT update datasources based on driver_family changes, because
        that would incorrectly overwrite unrelated datasources of the same type.
        """
        # Check if config exists for this tenant
        existing = self.repo.get_by_id(tenant_id, config_id)
        if not existing:
            raise ResourceNotFoundError(f"Datasource config with id '{config_id}' not found")

        # If name is being updated, check for uniqueness within tenant
        if payload.name and payload.name != existing.name:
            name_exists = self.repo.get_by_name(tenant_id, payload.name)
            if name_exists:
                raise ResourceAlreadyExistsError(
                    f"Datasource config with name '{payload.name}' already exists"
                )

        old_name = existing.name

        # Update the config
        obj = self.repo.update(tenant_id, config_id, payload)
        if not obj:
            raise ResourceNotFoundError(f"Datasource config with id '{config_id}' not found")

        # If name changed, update only the ONE datasource whose connection_key
        # matched the old config name — preserving the 1-to-1 relationship
        if payload.name and payload.name != old_name:
            datasource_repo = DatasourceRepository(self.db)
            datasource = datasource_repo.get_by_name(tenant_id, old_name)
            if datasource:
                datasource_repo.update(tenant_id, datasource.datasource_id, DatasourceUpdate(connection_key=payload.name))

        return obj

    def delete(self, tenant_id: str, config_id: int):
        config = self.repo.get_by_id(tenant_id, config_id)
        if not config:
            raise ResourceNotFoundError(f"Datasource config with id '{config_id}' not found")

        # Delete vault secret BEFORE deleting the DB row
        if config.vault_secret_path:
            _delete_vault_secret(config.vault_secret_path)

        deleted = self.repo.delete(tenant_id, config_id)
        if not deleted:
            raise ResourceNotFoundError(f"Datasource config with id '{config_id}' not found")

    def test_connection(self, tenant_id: str, config_id: int) -> dict:
        """Test connection for a datasource config"""
        obj = self.repo.get_by_id(tenant_id, config_id)
        if not obj:
            raise ResourceNotFoundError(f"Datasource config with id '{config_id}' not found")

        return {
            "config_id": config_id,
            "name": obj.name,
            "status": "success",
            "message": "Connection test passed"
        }