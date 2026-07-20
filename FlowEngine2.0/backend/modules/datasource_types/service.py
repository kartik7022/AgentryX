# backend/modules/datasource_types/service.py

from typing import Any, Dict, List
from fastapi import HTTPException

from backend.modules.datasource_types import repository


def list_all() -> list:
    return repository.list_drivers()


def list_active() -> list:
    return repository.list_active_drivers()


def get_by_id(driver_id: int) -> dict:
    record = repository.get_driver_by_id(driver_id)
    if not record:
        raise HTTPException(status_code=404, detail="Driver not found.")
    return record


def get_with_aliases(driver_id: int) -> dict:
    record = repository.get_driver_by_id(driver_id)
    if not record:
        raise HTTPException(status_code=404, detail="Driver not found.")
    record["aliases"] = repository.list_aliases_for_driver(driver_id)
    return record


def create(
    canonical_name: str,
    display_name: str,
    runtime_owner: str,
    protocol: str,
    dialect_token: str,
    implementation_key: str,
    auth_style: str,
    capabilities: dict,
    config_schema: dict,
    is_active: bool,
) -> dict:
    canonical_name = canonical_name.strip()
    if not canonical_name:
        raise HTTPException(status_code=400, detail="canonical_name is required.")
    if not display_name.strip():
        raise HTTPException(status_code=400, detail="display_name is required.")

    existing = repository.get_driver_by_canonical_name(canonical_name)
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Driver '{canonical_name}' already exists.",
        )

    return repository.create_driver(
        canonical_name=canonical_name,
        display_name=display_name,
        runtime_owner=runtime_owner,
        protocol=protocol,
        dialect_token=dialect_token,
        implementation_key=implementation_key,
        auth_style=auth_style,
        capabilities=capabilities,
        config_schema=config_schema,
        is_active=is_active,
    )


def update(
    driver_id: int,
    display_name: str,
    runtime_owner: str,
    protocol: str,
    dialect_token: str,
    implementation_key: str,
    auth_style: str,
    capabilities: dict,
    config_schema: dict,
    is_active: bool,
) -> dict:
    if not display_name.strip():
        raise HTTPException(status_code=400, detail="display_name is required.")

    record = repository.update_driver(
        driver_id=driver_id,
        display_name=display_name,
        runtime_owner=runtime_owner,
        protocol=protocol,
        dialect_token=dialect_token,
        implementation_key=implementation_key,
        auth_style=auth_style,
        capabilities=capabilities,
        config_schema=config_schema,
        is_active=is_active,
    )
    if not record:
        raise HTTPException(status_code=404, detail="Driver not found.")
    return record


def delete(driver_id: int) -> None:
    record = repository.get_driver_by_id(driver_id)
    if not record:
        raise HTTPException(status_code=404, detail="Driver not found.")
    repository.delete_driver(driver_id)


    # ── Alias operations ──────────────────────────────────────────────────────────

def list_aliases(driver_id: int) -> list:
    get_by_id(driver_id)
    return repository.list_aliases_for_driver(driver_id)


def add_alias(driver_id: int, alias_name: str, alias_type: str, is_active: bool) -> dict:
    get_by_id(driver_id)
    alias_name = alias_name.strip()
    if not alias_name:
        raise HTTPException(status_code=400, detail="alias_name is required.")
    return repository.create_alias(driver_id, alias_name, alias_type, is_active)


def delete_alias(alias_id: int) -> None:
    existing = repository.get_alias_by_id(alias_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Alias not found.")
    repository.delete_alias(alias_id)


    # ── Public API — used by credential_gateway and tenant UI ────────────────────

def get_all_as_public() -> List[Dict[str, Any]]:
    drivers = repository.list_active_drivers()
    result = []
    for d in drivers:
        required_fields = d.get("config_schema", {}).get("required", [])
        datasource_type = repository.get_datasource_type_alias(d["driver_id"]) or d["canonical_name"]
        optional_fields = d.get("config_schema", {}).get("optional", [])
        result.append({
            "datasource_type": datasource_type,
            "canonical_name": d["canonical_name"],
            "label": d["display_name"],
            "driver_id": d["driver_id"],
            "driver_family": d["canonical_name"],
            "protocol": d["protocol"],
            "required_fields": [
                {"name": f, "label": f.replace("_", " ").title(), "type": "password" if "secret" in f or "password" in f or "token" in f else "text"}
                for f in required_fields
            ],
            "optional_fields": [
                {"name": f, "label": f.replace("_", " ").title(), "type": "password" if "secret" in f or "password" in f or "token" in f else "text"}
                for f in optional_fields
            ],
        })
    return result