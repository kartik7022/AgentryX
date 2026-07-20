# backend/modules/email_inboxes/service.py

import re
import imaplib
import poplib
import email as emaillib
from email.header import decode_header
from datetime import datetime
from typing import List, Optional
from backend.modules.email_inboxes.repository import EmailInboxRepository
from backend.modules.email_inboxes.schemas import EmailInboxCreate, EmailInboxUpdate
from backend.common.exceptions import ResourceNotFoundError, ResourceAlreadyExistsError


def _decode_header(val):
    if not val:
        return ""
    parts = decode_header(val)
    result = ""
    for part, enc in parts:
        if isinstance(part, bytes):
            result += part.decode(enc or "utf-8", errors="replace")
        else:
            result += part
    return result


class EmailInboxService:

    def __init__(self, repo: EmailInboxRepository):
        self.repo = repo

    @staticmethod
    def _validate_email_format(email: str) -> None:
        if not re.match(r'^[^\s@]+@[^\s@]+\.[^\s@]+$', email.strip()):
            raise ValueError(f"Invalid email address format: '{email}'")

    def get_all(self, tenant_id: str, active_only: bool = False):
        return self.repo.get_all(tenant_id, active_only)

    def get(self, tenant_id: str, inbox_id: int):
        obj = self.repo.get_by_id(tenant_id, inbox_id)
        if not obj:
            raise ResourceNotFoundError(f"Email inbox with id '{inbox_id}' not found")
        return obj

    def create(self, tenant_id: str, payload: EmailInboxCreate):
        if payload.email_address and payload.email_address.strip():
            self._validate_email_format(payload.email_address)

        existing = self.repo.get_by_name(tenant_id, payload.inbox_name)
        if existing:
            raise ResourceAlreadyExistsError(
                f"Email inbox with name '{payload.inbox_name}' already exists"
            )
        if payload.email_address and payload.email_address.strip():
            existing_email = self.repo.get_by_email(tenant_id, payload.email_address)
            if existing_email:
                raise ResourceAlreadyExistsError(
                    f"An inbox with email '{payload.email_address}' already exists"
                )
            payload.email_address = payload.email_address.strip().lower()

        obj = self.repo.create(tenant_id, payload)
        return obj

    def update(self, tenant_id: str, inbox_id: int, payload: EmailInboxUpdate):
        existing = self.repo.get_by_id(tenant_id, inbox_id)
        if not existing:
            raise ResourceNotFoundError(f"Email inbox with id '{inbox_id}' not found")

        if payload.email_address and payload.email_address.strip():
            self._validate_email_format(payload.email_address)

        if payload.inbox_name and payload.inbox_name != existing.inbox_name:
            name_check = self.repo.get_by_name(tenant_id, payload.inbox_name)
            if name_check:
                raise ResourceAlreadyExistsError(
                    f"Email inbox with name '{payload.inbox_name}' already exists"
                )

        if payload.email_address and payload.email_address.strip() and payload.email_address.strip().lower() != (existing.email_address or '').lower():
            email_check = self.repo.get_by_email(tenant_id, payload.email_address)
            if email_check:
                raise ResourceAlreadyExistsError(
                    f"An inbox with email '{payload.email_address}' already exists"
                )
            payload.email_address = payload.email_address.strip().lower()

        obj = self.repo.update(tenant_id, inbox_id, payload)
        if not obj:
            raise ResourceNotFoundError(f"Email inbox with id '{inbox_id}' not found")

        return obj

    def delete(self, tenant_id: str, inbox_id: int) -> None:
        existing = self.repo.get_by_id(tenant_id, inbox_id)
        if not existing:
            raise ResourceNotFoundError(f"Email inbox with id '{inbox_id}' not found")
        deleted = self.repo.delete(tenant_id, inbox_id)
        if not deleted:
            raise ResourceNotFoundError(f"Email inbox with id '{inbox_id}' not found")
        if existing.vault_path:
            try:
                from backend.modules.credential_gateway.vault import get_vault_client
                from backend.core.config import settings
                vault = get_vault_client()
                vault_path = existing.vault_path
                prefix = f"{settings.vault_kv_mount}/"
                if vault_path.startswith(prefix):
                    vault_path = vault_path[len(prefix):]
                vault.delete(vault_path)
            except Exception as exc:
                print(f"[WARN] Failed to delete vault secret for inbox {inbox_id}: {exc}")
    def _get_creds(self, obj):
        from backend.modules.credential_gateway.vault import get_vault_client
        from backend.core.config import settings
        vault = get_vault_client()
        vault_path = obj.vault_path
        prefix = f"{settings.vault_kv_mount}/"
        if vault_path.startswith(prefix):
            vault_path = vault_path[len(prefix):]
        creds = vault.read(vault_path)
        if not creds:
            raise ValueError("Credentials not found in vault.")
        return creds
    def _connect(self, obj, creds: dict):
        username = creds.get("username", "")
        password = creds.get("password", "")
        host     = creds.get("host") or obj.server_host or ""
        port     = int(creds.get("port") or obj.server_port or 993)
        protocol = (creds.get("protocol") or obj.protocol or "imap").lower()
        use_ssl  = obj.use_ssl if obj.use_ssl is not None else True

        if protocol == "pop3":
            if use_ssl:
                conn = poplib.POP3_SSL(host, port)
            else:
                conn = poplib.POP3(host, port)
            conn.user(username)
            conn.pass_(password)
            return conn, "pop3"
        else:
            if use_ssl:
                conn = imaplib.IMAP4_SSL(host, port)
            else:
                conn = imaplib.IMAP4(host, port)
            conn.login(username, password)
            return conn, "imap"

    def test_connection(self, tenant_id: str, inbox_id: int) -> dict:
        obj = self.repo.get_by_id(tenant_id, inbox_id)
        if not obj:
            raise ResourceNotFoundError(f"Email inbox with id '{inbox_id}' not found")

        if not obj.vault_path:
            return {
                "inbox_id": inbox_id,
                "inbox_name": obj.inbox_name,
                "status": "warning",
                "message": "Credentials not configured yet.",
            }

        try:
            creds = self._get_creds(obj)
            conn, protocol = self._connect(obj, creds)
            if protocol == "pop3":
                conn.quit()
            else:
                conn.logout()
            return {
                "inbox_id": inbox_id,
                "inbox_name": obj.inbox_name,
                "status": "success",
                "message": f"Connection test passed for '{obj.inbox_name}'",
            }
        except Exception as exc:
            return {
                "inbox_id": inbox_id,
                "inbox_name": obj.inbox_name,
                "status": "failure",
                "message": str(exc)[:500],
            }


