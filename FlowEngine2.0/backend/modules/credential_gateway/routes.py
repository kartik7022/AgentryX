"""
Credential Gateway Router
Path: backend/modules/credential_gateway/routes.py
"""

from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, field_validator
from backend.common.utils.time import now_ist
from backend.modules.credential_gateway.schemas import (
    SaveRequest, SaveResponse, TestRequest, TestResponse,
)
from backend.modules.datasources.connector import run_test
from backend.modules.credential_gateway.vault import get_vault_client, vault_paths
#from backend.modules.datasources.types import get_all_types
from backend.modules.datasource_types.service import get_all_as_public
from backend.modules.datasources.repository import DatasourceRepository, DatasourceConfigRepository
from backend.modules.datasources.service import DatasourceService, DatasourceConfigService
from backend.modules.datasources.schemas import DatasourceConfigUpdate
from backend.core.middleware.auth import require_permission
from backend.modules.credential_gateway.schemas import (
    SaveRequest, SaveResponse, TestRequest, TestResponse,
    EmailInboxTestRequest, EmailInboxTestResponse,
    EmailInboxSaveRequest, EmailInboxSaveResponse,
)
from backend.modules.datasources.connector import run_test, run_email_test
from backend.modules.email_inboxes.types import get_all_types as get_all_inbox_types
from backend.modules.email_inboxes.repository import EmailInboxRepository
from backend.notifications.email_service import send_metadata_confirmed_email
router = APIRouter()


def get_datasource_service():
    return DatasourceService(DatasourceRepository(db=None))


def get_config_service():
    return DatasourceConfigService(DatasourceConfigRepository(db=None))





# ── FlowEngine datasource list ────────────────────────────────────────────────

@router.get("/flowengine/datasources", response_model=List[Dict[str, Any]])
def list_flowengine_datasources(
    tenant_id: str = Query(...),
    ctx: dict = Depends(require_permission("datasources")),
    service: DatasourceService = Depends(get_datasource_service),
    config_service: DatasourceConfigService = Depends(get_config_service),
):
    try:
        configs_by_name = {c.name: c.config_id for c in config_service.repo.get_all(tenant_id)}
        datasources = service.get_all(tenant_id, active_only=False)
        configs = config_service.repo.get_all(tenant_id)
        config_map = {c.name: c for c in configs}
        return [
        {
            "datasource_id":     ds.datasource_id,
            "name":              ds.name,
            "datasource_type":   ds.datasource_type,
            "connection_key":    ds.connection_key,
            "is_active":         ds.is_active,
            "tenant_id":         ds.tenant_id,
            "datasource_mode":   ds.datasource_mode,
            "config_id":         config_map[ds.connection_key].config_id if ds.connection_key in config_map else None,
            "vault_secret_path": config_map[ds.connection_key].vault_secret_path if ds.connection_key in config_map else None,
        }
        for ds in datasources
        ]
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


    # ── Test connection ───────────────────────────────────────────────────────────

@router.post("/test-connection", response_model=TestResponse)
def test_connection(
    req: TestRequest,
    ctx: dict = Depends(require_permission("vault")),
):
    timestamp = now_ist()

    try:
        run_test(req.datasource_type, req.connection_params)
        test_passed = True
        test_error = None
    except (ValueError, RuntimeError) as exc:
        test_passed = False
        test_error = str(exc)[:500]
    except Exception as exc:
        test_passed = False
        test_error = f"Unexpected error: {str(exc)[:400]}"

    if test_passed:
        return TestResponse(
            connection_status="VERIFIED",
            last_error_summary=None,
            last_test_at=timestamp,
            message=f"Successfully connected to {req.datasource_name}",
        )
    else:
        return TestResponse(
            connection_status="FAILED",
            last_error_summary=test_error,
            last_test_at=timestamp,
        )


    # ── Save credentials to Vault ─────────────────────────────────────────────────

@router.put("/save-credentials", response_model=SaveResponse)
def save_credentials(
    req: SaveRequest,
    ctx: dict = Depends(require_permission("vault")),
    config_service: DatasourceConfigService = Depends(get_config_service),
):
    timestamp = now_ist()
    # Block saving credentials for query-mode datasources
    try:
        from sqlalchemy import text
        from backend.core.database import engine
        with engine.connect() as conn:
            row = conn.execute(
                text("SELECT datasource_mode FROM eivs.datasources WHERE datasource_id = :id"),
                {"id": req.flowengine_datasource_id},
            ).fetchone()
            if row and row.datasource_mode == "query":
                return SaveResponse(status="skipped", vault_secret_path="", saved_at=timestamp)
    except Exception as exc:
        print(f"[WARN] Could not verify datasource mode: {exc}")
    path, full_path = vault_paths(req.tenant_id, req.datasource_name)
    secret_data = req.connection_params

    try:
        vault = get_vault_client()
        vault.write(path, secret_data)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to write to Vault: {str(exc)}")

    if req.config_id is not None:
        try:
            config_payload = DatasourceConfigUpdate(vault_secret_path=full_path)
            config_service.update(req.tenant_id, req.config_id, config_payload)
        except Exception as exc:
            print(f"[WARN] DatasourceConfigService update after save failed: {exc}")

    return SaveResponse(status="saved", vault_secret_path=full_path, saved_at=timestamp)


    # ── Delete credentials from Vault ─────────────────────────────────────────────

class VaultDeleteRequest(BaseModel):
    path: str


@router.delete("/vault/delete")
def delete_vault_credentials(
    req: VaultDeleteRequest,
    ctx: dict = Depends(require_permission("vault")),
) -> dict:
    try:
        from backend.core.config import settings
        vault = get_vault_client()
        path = req.path
        prefix = f"{settings.vault_kv_mount}/"
        if path.startswith(prefix):
            path = path[len(prefix):]
        vault.delete(path)
        return {"status": "deleted", "path": req.path}
    except Exception as exc:
        print(f"[WARN] Vault delete failed for path '{req.path}': {exc}")
        return {"status": "skipped", "path": req.path}




# ── Test email inbox connection ───────────────────────────────────────────────
@router.post("/email-inbox/test-connection", response_model=EmailInboxTestResponse)
def test_email_inbox_connection(
    req: EmailInboxTestRequest,
    ctx: dict = Depends(require_permission("vault")),
):
    timestamp = now_ist()
    params = req.connection_params
    host     = params.get("host", "")
    port     = int(params.get("port", 993))
    use_ssl  = params.get("use_ssl", True)
    protocol = params.get("protocol", "imap").lower()

    try:
        run_email_test(
            provider_type=protocol,
            params=params,
            host=host,
            port=port,
            use_ssl=use_ssl,
        )
        return EmailInboxTestResponse(
            connection_status="VERIFIED",
            last_error_summary=None,
            last_test_at=timestamp,
            message=f"Successfully connected to {req.inbox_name}",
        )
    except (ValueError, RuntimeError) as exc:
        return EmailInboxTestResponse(
            connection_status="FAILED",
            last_error_summary=str(exc)[:500],
            last_test_at=timestamp,
        )
    except Exception as exc:
        return EmailInboxTestResponse(
            connection_status="FAILED",
            last_error_summary=f"Unexpected error: {str(exc)[:400]}",
            last_test_at=timestamp,
        )


# ── Save email inbox credentials to Vault ─────────────────────────────────────

@router.put("/email-inbox/save-credentials", response_model=EmailInboxSaveResponse)
def save_email_inbox_credentials(
    req: EmailInboxSaveRequest,
    ctx: dict = Depends(require_permission("vault")),
):
    timestamp = now_ist()
    from backend.core.config import settings
    email = str(req.connection_params.get("username", req.inbox_name)).replace(" ", "_").replace(":", "-")
    vault_key = f"email_inboxes/{req.tenant_id}/{email}"
    full_path = f"{settings.vault_kv_mount}/{vault_key}"

    try:
        vault = get_vault_client()
        vault.write(vault_key, {
            "username": str(req.connection_params.get("username", "")),
            "password": str(req.connection_params.get("password", "")),
            "host":     str(req.connection_params.get("host", "")),
            "port":     str(req.connection_params.get("port", "")),
            "protocol": str(req.connection_params.get("protocol", "")),
            "use_ssl":  str(req.connection_params.get("use_ssl", True)),
        })
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to write to Vault: {str(exc)}")

    # Update vault_path on the inbox record
    try:
        repo = EmailInboxRepository(db=None)
        repo.update_vault_path(req.tenant_id, req.inbox_id, full_path)
    except Exception as exc:
        print(f"[WARN] Failed to update vault_path on inbox {req.inbox_id}: {exc}")

    return EmailInboxSaveResponse(status="saved", vault_secret_path=full_path, saved_at=timestamp)
# ── Metadata confirmed ────────────────────────────────────────────────────────

class MetadataConfirmedRequest(BaseModel):
    datasource_name: str
    datasource_mode: str = "data"

    @field_validator('datasource_mode')
    @classmethod
    def validate_datasource_mode(cls, v):
        if v not in ['data', 'query']:
            raise ValueError("datasource_mode must be 'data' or 'query'")
        return v

@router.post("/credentials/metadata-confirmed")
def metadata_confirmed(
    req: MetadataConfirmedRequest,
    request: Request,
    ctx: dict = Depends(require_permission("vault")),
):
    import httpx
    from backend.core.config import settings

    tenant_id = ctx.get("tenant_id")
    session = request.cookies.get("session")

    try:
        userinfo = httpx.get(
            f"{settings.keycloak_url}/realms/{settings.keycloak_realm}/protocol/openid-connect/userinfo",
            headers={"Authorization": f"Bearer {session}"},
            timeout=5,
        )
        data = userinfo.json()
        logged_in_email = data.get("email")
    except Exception:
        logged_in_email = None

    # Get tenant admin email from Keycloak
    tenant_admin_email = None
    try:
        token_res = httpx.post(
            f"{settings.keycloak_url}/realms/master/protocol/openid-connect/token",
            data={"grant_type": "password", "client_id": "admin-cli",
                "username": settings.keycloak_admin_username,
                "password": settings.keycloak_admin_password},
            timeout=10,
        )
        admin_token = token_res.json().get("access_token")
        users_res = httpx.get(
            f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users?max=1000",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10,
        )
        for u in users_res.json():
            attrs = u.get("attributes") or {}
            if (attrs.get("tenant_id", [None])[0] == tenant_id and
                attrs.get("role", [None])[0] == "tenant_admin"):
                tenant_admin_email = u.get("email")
                break
    except Exception:
        pass

    recipients = set()
    if logged_in_email:
        recipients.add(logged_in_email)
    if tenant_admin_email:
        recipients.add(tenant_admin_email)

    for email in recipients:
        try:
            send_metadata_confirmed_email(
                email=email,
                tenant_id=tenant_id,
                datasource_name=req.datasource_name,
            )
        except Exception as e:
            print(f"[WARN] Failed to send metadata confirmed email to {email}: {e}")

    # If query mode — delete vault creds and clear vault_secret_path
    if req.datasource_mode == "query":
        try:
            from backend.core.config import settings as _settings
            path, full_path = vault_paths(tenant_id, req.datasource_name)
            vault = get_vault_client()
            vault.delete(path)
            print(f"[INFO] Vault credentials deleted for query-mode datasource '{req.datasource_name}'")
        except Exception as e:
            print(f"[WARN] Failed to delete vault creds for query-mode: {e}")

        try:
            config_service = get_config_service()
            configs = config_service.repo.get_all(tenant_id)
            for c in configs:
                if c.name == req.datasource_name and c.vault_secret_path:
                    config_service.update(tenant_id, c.config_id, DatasourceConfigUpdate(vault_secret_path=None))
                    print(f"[INFO] Cleared vault_secret_path for config '{req.datasource_name}'")
                    break
        except Exception as e:
            print(f"[WARN] Failed to clear vault_secret_path for query-mode: {e}")

    return {"status": "ok"}