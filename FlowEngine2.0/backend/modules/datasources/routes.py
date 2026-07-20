# backend/modules/datasources/routes.py

from fastapi import APIRouter, Depends, status, Query
from typing import List

from backend.modules.datasources.schemas import (
    DatasourceCreate, DatasourceUpdate, DatasourceOut,
    DatasourceConfigCreate, DatasourceConfigUpdate, DatasourceConfigOut
)
from backend.modules.datasources.repository import DatasourceRepository, DatasourceConfigRepository
from backend.modules.datasources.service import DatasourceService, DatasourceConfigService
from backend.common.responses import SuccessResponse
from backend.common.exceptions import ResourceNotFoundError
from backend.core.middleware.auth import require_permission

router = APIRouter()


def get_datasource_service():
    return DatasourceService(DatasourceRepository(db=None))


def get_config_service():
    return DatasourceConfigService(DatasourceConfigRepository(db=None))


# ── DATASOURCE ENDPOINTS ──────────────────────────────────────────────────────

@router.get("/datasources", response_model=List[DatasourceOut])
def get_all_datasources(
    active_only: bool = Query(False),
    ctx: dict = Depends(require_permission("datasources")),
    service: DatasourceService = Depends(get_datasource_service),
):
    return service.get_all(ctx["tenant_id"], active_only)


@router.get("/datasources/{datasource_id}", response_model=DatasourceOut)
def get_datasource(
    datasource_id: int,
    ctx: dict = Depends(require_permission("datasources")),
    service: DatasourceService = Depends(get_datasource_service),
):
    return service.get(ctx["tenant_id"], datasource_id)


@router.post("/datasources", response_model=DatasourceOut, status_code=status.HTTP_201_CREATED)
def create_datasource(
    payload: DatasourceCreate,
    ctx: dict = Depends(require_permission("datasources")),
    service: DatasourceService = Depends(get_datasource_service),
):
    return service.create(ctx["tenant_id"], payload)


@router.put("/datasources/{datasource_id}", response_model=DatasourceOut)
def update_datasource(
    datasource_id: int,
    payload: DatasourceUpdate,
    ctx: dict = Depends(require_permission("datasources")),
    service: DatasourceService = Depends(get_datasource_service),
):
    return service.update(ctx["tenant_id"], datasource_id, payload)


@router.delete("/datasources/{datasource_id}", response_model=SuccessResponse)
def delete_datasource(
    datasource_id: int,
    ctx: dict = Depends(require_permission("datasources")),
    service: DatasourceService = Depends(get_datasource_service),
    config_service: DatasourceConfigService = Depends(get_config_service),
):
    datasource = service.get(ctx["tenant_id"], datasource_id)

    if datasource.connection_key:
        try:
            config = config_service.get_by_name(ctx["tenant_id"], datasource.connection_key)
            if config:
                if config.vault_secret_path:
                    from backend.modules.datasources.service import _delete_vault_secret
                    _delete_vault_secret(config.vault_secret_path)
                config_service.delete(ctx["tenant_id"], config.config_id)
        except ResourceNotFoundError:
            pass

    service.delete(ctx["tenant_id"], datasource_id)
    return SuccessResponse(message="Datasource and associated config deleted successfully")


        # ── DATASOURCE CONFIG ENDPOINTS ───────────────────────────────────────────────

@router.get("/datasource-configs", response_model=List[DatasourceConfigOut])
def get_all_configs(
    active_only: bool = Query(False),
    ctx: dict = Depends(require_permission("datasource-configs")),
    service: DatasourceConfigService = Depends(get_config_service),
):
    return service.get_all(ctx["tenant_id"], active_only)


@router.get("/datasource-configs/by-name/{name}", response_model=DatasourceConfigOut)
def get_config_by_name(
    name: str,
    ctx: dict = Depends(require_permission("datasource-configs")),
    service: DatasourceConfigService = Depends(get_config_service),
):
    return service.get_by_name(ctx["tenant_id"], name)


@router.get("/datasource-configs/driver/{driver_family}", response_model=List[DatasourceConfigOut])
def get_configs_by_driver(
    driver_family: str,
    ctx: dict = Depends(require_permission("datasource-configs")),
    service: DatasourceConfigService = Depends(get_config_service),
):
    return service.get_by_driver_family(ctx["tenant_id"], driver_family)


@router.get("/datasource-configs/protocol/{protocol}", response_model=List[DatasourceConfigOut])
def get_configs_by_protocol(
    protocol: str,
    ctx: dict = Depends(require_permission("datasource-configs")),
    service: DatasourceConfigService = Depends(get_config_service),
):
    return service.get_by_protocol(ctx["tenant_id"], protocol)


@router.get("/datasource-configs/{config_id}", response_model=DatasourceConfigOut)
def get_config(
    config_id: int,
    ctx: dict = Depends(require_permission("datasource-configs")),
    service: DatasourceConfigService = Depends(get_config_service),
):
    return service.get(ctx["tenant_id"], config_id)


@router.post("/datasource-configs", response_model=DatasourceConfigOut, status_code=status.HTTP_201_CREATED)
def create_config(
    payload: DatasourceConfigCreate,
    ctx: dict = Depends(require_permission("datasource-configs")),
    service: DatasourceConfigService = Depends(get_config_service),
):
    return service.create(ctx["tenant_id"], payload)


@router.put("/datasource-configs/{config_id}", response_model=DatasourceConfigOut)
def update_config(
    config_id: int,
    payload: DatasourceConfigUpdate,
    ctx: dict = Depends(require_permission("datasource-configs")),
    service: DatasourceConfigService = Depends(get_config_service),
):
    return service.update(ctx["tenant_id"], config_id, payload)


@router.delete("/datasource-configs/{config_id}", response_model=SuccessResponse)
def delete_config(
    config_id: int,
    ctx: dict = Depends(require_permission("datasource-configs")),
    service: DatasourceConfigService = Depends(get_config_service),
):
    service.delete(ctx["tenant_id"], config_id)
    return SuccessResponse(message="Datasource config deleted successfully")


@router.post("/datasource-configs/{config_id}/test", response_model=dict)
def test_connection(
    config_id: int,
    ctx: dict = Depends(require_permission("datasource-configs")),
    service: DatasourceConfigService = Depends(get_config_service),
):
    return service.test_connection(ctx["tenant_id"], config_id)