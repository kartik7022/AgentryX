# backend/modules/api_keys/service.py

from datetime import datetime

from backend.modules.api_keys import repository

def generate_api_key(tenant_id: str, expires_at: datetime = None, roles: list = None):
    api_key, key_id, api_client_id = repository.create_api_key(
        tenant_id=tenant_id,
        expires_at=expires_at,
        roles=roles,
    )
    return repository.get_api_key_by_tenant(tenant_id)


def get_api_key_for_tenant(tenant_id: str):
    return repository.get_api_key_by_tenant(tenant_id)


def list_all_api_keys(tenant_id: str):
    return repository.get_all_api_keys_for_tenant(tenant_id)


def revoke_api_key(tenant_id: str):
    success = repository.revoke_api_key(tenant_id)
    if not success:
        raise ValueError("No active API key found")
    return {"message": "API key revoked successfully"}