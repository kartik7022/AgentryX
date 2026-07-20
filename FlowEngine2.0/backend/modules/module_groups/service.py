# backend/modules/module_groups/service.py

from typing import List, Optional, Dict, Tuple

from backend.modules.module_groups import repository


def get_all_groups(status_filter: Optional[str] = None) -> Tuple[List[Dict], int]:
    return repository.get_all_groups(status_filter=status_filter)


def get_group_by_id(group_id: str) -> Dict:
    return repository.get_group_by_id(group_id=group_id)


def create_group(payload: Dict) -> Dict:
    return repository.create_group(payload=payload)


def update_group(group_id: str, payload: Dict) -> Dict:
    return repository.update_group(group_id=group_id, payload=payload)


def delete_group(group_id: str) -> bool:
    return repository.delete_group(group_id=group_id)