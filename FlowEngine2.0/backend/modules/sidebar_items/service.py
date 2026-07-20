# backend/modules/sidebar_items/service.py

from typing import List, Optional, Dict, Tuple
from backend.modules.sidebar_items import repository


def get_all_sidebar_items(status_filter: Optional[str] = None) -> Tuple[List[Dict], int]:
    return repository.get_all_sidebar_items(status_filter=status_filter)


def get_sidebar_item_by_id(item_id: str) -> Dict:
    return repository.get_sidebar_item_by_id(item_id)


def get_sidebar_items_by_values(values: List[str]) -> List[Dict]:
    return repository.get_sidebar_items_by_values(values)


def create_sidebar_item(payload: Dict) -> Dict:
    return repository.create_sidebar_item(payload)


def update_sidebar_item(item_id: str, payload: Dict) -> Dict:
    return repository.update_sidebar_item(item_id, payload)


def delete_sidebar_item(item_id: str) -> bool:
    return repository.delete_sidebar_item(item_id)