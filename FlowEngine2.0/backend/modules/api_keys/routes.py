# backend/modules/api_keys/routes.py

from fastapi import APIRouter, HTTPException, Depends
from typing import Annotated
from backend.modules.api_keys import service
from backend.modules.api_keys.schemas import (
    ApiKeyGenerateRequest,
    ApiKeyOut,
    ApiKeyListOut,
)
from backend.core.middleware.auth import require_permission

router = APIRouter(prefix="/portal/api-keys", tags=["Portal - API Keys"])


@router.post("/generate", response_model=ApiKeyOut)
def generate_api_key(
    request: ApiKeyGenerateRequest,
    tenant_data: Annotated[dict, Depends(require_permission("api-keys"))],
):
    tenant_id = tenant_data["tenant_id"]
    try:
        return service.generate_api_key(tenant_id=tenant_id, roles=["TENANT_APP"])
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate API key: {str(e)}")


@router.get("", response_model=ApiKeyListOut)
def list_api_keys(
    tenant_data: Annotated[dict, Depends(require_permission("api-keys"))],
):
    tenant_id = tenant_data["tenant_id"]
    try:
        keys = service.list_all_api_keys(tenant_id)
        return {"api_keys": keys}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch API keys: {str(e)}")


@router.get("/me", response_model=ApiKeyOut)
def get_my_api_key(
    tenant_data: Annotated[dict, Depends(require_permission("api-keys"))],
):
    tenant_id = tenant_data["tenant_id"]
    try:
        key_data = service.get_api_key_for_tenant(tenant_id)
        if not key_data:
            raise HTTPException(status_code=404, detail="No active API key found")
        return key_data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch API key: {str(e)}")


@router.delete("")
def revoke_api_key(
    tenant_data: Annotated[dict, Depends(require_permission("api-keys"))],
):
    tenant_id = tenant_data["tenant_id"]
    try:
        return service.revoke_api_key(tenant_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to revoke API key: {str(e)}")