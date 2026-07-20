# backend/modules/platforms_modules/service.py

from typing import List, Optional, Dict, Tuple

from backend.modules.platforms_modules import repository


def get_all_modules(status_filter: Optional[str] = None) -> Tuple[List[Dict], int]:
    return repository.get_all_modules(status_filter=status_filter)


def get_default_modules() -> Tuple[List[Dict], int]:
    return repository.get_default_modules()


def get_module_by_id(module_id: str) -> Dict:
    return repository.get_module_by_id(module_id)


def create_module(payload: Dict, created_by_admin_id: Optional[str] = None) -> Dict:
    return repository.create_module(payload=payload, created_by_admin_id=created_by_admin_id)


def update_module(module_id: str, payload: Dict) -> Dict:
    return repository.update_module(module_id=module_id, payload=payload)


def delete_module(module_id: str) -> bool:
    return repository.delete_module(module_id=module_id)


def get_tenant_modules(tenant_id: str, status_filter: Optional[str] = None) -> Tuple[List[Dict], int]:
    return repository.get_tenant_modules(tenant_id=tenant_id, status_filter=status_filter)


def assign_modules_to_tenant(
    tenant_id: str,
    module_ids: List[str],
    admin_id: Optional[str] = None
) -> Tuple[List[Dict], int]:
    return repository.assign_modules_to_tenant(
        tenant_id=tenant_id,
        module_ids=module_ids,
        admin_id=admin_id
    )


def remove_module_from_tenant(tenant_id: str, module_id: str) -> bool:
    return repository.remove_module_from_tenant(tenant_id=tenant_id, module_id=module_id)


def get_default_module_ids() -> List[str]:
    return repository.get_default_module_ids()


def get_tenant_active_modules(tenant_id: str) -> List[Dict]:
    return repository.get_tenant_active_modules(tenant_id=tenant_id)