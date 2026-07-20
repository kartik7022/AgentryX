from __future__ import annotations

from datetime import timedelta
import asyncio
from types import SimpleNamespace
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

import app.main as main
from app.auth import create_access_token
from app.db import User


pytestmark = pytest.mark.anyio


class FakeQuery:
    def __init__(self, session, model):
        self.session = session
        self.model = model
        self.expr = None

    def filter(self, expr):
        self.expr = expr
        return self

    def all(self):
        if self.model is User:
            return list(self.session.users)
        return []

    def first(self):
        if self.model is User:
            email = getattr(getattr(self.expr, "right", None), "value", None)
            for user in self.session.users:
                if user.email == email:
                    return user
        return None


class FakeSession:
    def __init__(self):
        self.users = []

    def query(self, model):
        return FakeQuery(self, model)

    def add(self, obj):
        if getattr(obj, "id", None) is None:
            obj.id = uuid4()
        self.users.append(obj)

    def commit(self):
        return None

    def refresh(self, obj):
        return None

    def execute(self, stmt):
        return SimpleNamespace()

    def close(self):
        return None


@pytest.fixture
def auth_env(monkeypatch):
    monkeypatch.setenv("AUTH_DISABLED", "false")
    main.TOKEN_BLOCKLIST.clear()
    session = FakeSession()

    monkeypatch.setattr(main, "upsert_document_type", lambda db, request: SimpleNamespace(id=str(uuid4()), doc_type_name=request.doc_type_name))
    monkeypatch.setattr(
        main,
        "vector_store",
        SimpleNamespace(
            embed=lambda text: [0.0] * 384,
            lookup=lambda text, threshold=0.75: {"doc_id": "doc-123", "similarity_score": 0.9},
            register_template=lambda doc_id, text, doc_type_id=None: "template-1",
        ),
    )
    monkeypatch.setattr(main, "ml_registry", SimpleNamespace(register_model=lambda *args, **kwargs: "run-1"))
    monkeypatch.setattr(main, "registry", SimpleNamespace(register=lambda *args, **kwargs: "doc-123", get_model=lambda doc_id, db=None: {"doc_type": "invoice"}))
    monkeypatch.setattr(main, "route_document", lambda path, doc_type_name=None: {"parser": "docling", "content": "Invoice INV-2026-001 for Rs45,000 from ABC Technologies", "tables": [], "metadata": {}, "confidence": 0.95, "error": None})
    monkeypatch.setattr(main, "redact_pii", lambda text: {"redacted_text": text, "entities_found": [], "redaction_count": 0})
    monkeypatch.setattr(main, "redact_pii_from_fields", lambda fields: {**fields, "redaction_summary": {"redacted_keys": [], "redaction_count": 0}})
    monkeypatch.setattr(main, "store_parse_request", lambda *args, **kwargs: SimpleNamespace(id=str(uuid4())))
    monkeypatch.setattr(main, "log_event", lambda *args, **kwargs: str(uuid4()))
    monkeypatch.setattr(main, "list_document_types", lambda db: [{"doc_type_name": "invoice"}])
    monkeypatch.setattr(main, "get_document_type_by_id", lambda db, doc_type_id: {"id": doc_type_id, "doc_type_name": "invoice"})
    monkeypatch.setattr(main, "list_parse_history", lambda db: [{"id": "1"}])
    monkeypatch.setattr(main, "get_audit_trail", lambda db, parse_request_id: [{"id": "1"}])
    main.app.dependency_overrides[main.get_db] = lambda: session
    yield session
    main.app.dependency_overrides.clear()
    main.TOKEN_BLOCKLIST.clear()


async def _register_user(client: AsyncClient, email: str, password: str, role: str):
    return await client.post("/auth/register", json={"email": email, "password": password, "role": role})


async def _login(client: AsyncClient, email: str, password: str):
    return await client.post(
        "/auth/jwt/login",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )


@pytest.mark.anyio
async def test_register_first_user_succeeds(auth_env):
    transport = ASGITransport(app=main.app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await _register_user(client, "admin@example.com", "Secret123!", "admin")
    assert response.status_code == 200
    assert response.json()["email"] == "admin@example.com"


@pytest.mark.anyio
async def test_login_returns_jwt(auth_env):
    transport = ASGITransport(app=main.app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await _register_user(client, "admin@example.com", "Secret123!", "admin")
        response = await _login(client, "admin@example.com", "Secret123!")
    body = response.json()
    assert response.status_code == 200
    assert body["token_type"] == "bearer"
    assert isinstance(body["access_token"], str) and body["access_token"]


@pytest.mark.anyio
async def test_login_wrong_password_returns_401(auth_env):
    transport = ASGITransport(app=main.app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await _register_user(client, "admin@example.com", "Secret123!", "admin")
        response = await _login(client, "admin@example.com", "wrong-password")
    assert response.status_code == 401


@pytest.mark.anyio
async def test_authenticated_upload_succeeds(auth_env):
    transport = ASGITransport(app=main.app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await _register_user(client, "admin@example.com", "Secret123!", "admin")
        login = await _login(client, "admin@example.com", "Secret123!")
        token = login.json()["access_token"]
        response = await client.post(
            "/upload/",
            headers={"Authorization": f"Bearer {token}"},
            files={"file": ("sample.txt", b"hello world", "text/plain")},
        )
    assert response.status_code == 200


@pytest.mark.anyio
async def test_unauthenticated_upload_returns_401(auth_env):
    transport = ASGITransport(app=main.app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/upload/",
            files={"file": ("sample.txt", b"hello world", "text/plain")},
        )
    assert response.status_code == 401


@pytest.mark.anyio
async def test_parser_role_cannot_call_train_returns_403(auth_env):
    transport = ASGITransport(app=main.app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await _register_user(client, "admin@example.com", "Secret123!", "admin")
        admin_login = await _login(client, "admin@example.com", "Secret123!")
        admin_token = admin_login.json()["access_token"]
        await client.post(
            "/auth/register",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"email": "parser@example.com", "password": "Secret123!", "role": "parser"},
        )
        parser_login = await _login(client, "parser@example.com", "Secret123!")
        parser_token = parser_login.json()["access_token"]
        response = await client.post(
            "/train/",
            headers={"Authorization": f"Bearer {parser_token}"},
            json={
                "doc_type_name": "invoice",
                "sample_text": "Invoice INV-2026-001 for Rs45,000 from ABC Technologies",
                "schema_definition": {"invoice_number": "string"},
                "confidence_threshold": 0.8,
            },
        )
    assert response.status_code == 403


@pytest.mark.anyio
async def test_viewer_role_cannot_call_parse_returns_403(auth_env):
    transport = ASGITransport(app=main.app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await _register_user(client, "admin@example.com", "Secret123!", "admin")
        admin_login = await _login(client, "admin@example.com", "Secret123!")
        admin_token = admin_login.json()["access_token"]
        await client.post(
            "/auth/register",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"email": "viewer@example.com", "password": "Secret123!", "role": "viewer"},
        )
        viewer_login = await _login(client, "viewer@example.com", "Secret123!")
        viewer_token = viewer_login.json()["access_token"]
        response = await client.post(
            "/parse/",
            params={"doc_id": "doc-123"},
            headers={"Authorization": f"Bearer {viewer_token}"},
            files={"file": ("sample.pdf", b"%PDF-1.4", "application/pdf")},
        )
    assert response.status_code == 403


@pytest.mark.anyio
async def test_admin_can_access_all_endpoints(auth_env):
    transport = ASGITransport(app=main.app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await _register_user(client, "admin@example.com", "Secret123!", "admin")
        login = await _login(client, "admin@example.com", "Secret123!")
        token = login.json()["access_token"]

        requests = [
            client.get("/health/", headers={"Authorization": f"Bearer {token}"}),
            client.get("/doc-types/", headers={"Authorization": f"Bearer {token}"}),
            client.get("/parse-history/", headers={"Authorization": f"Bearer {token}"}),
            client.get("/audit-trail/parse-1", headers={"Authorization": f"Bearer {token}"}),
            client.get("/metrics", headers={"Authorization": f"Bearer {token}"}),
            client.post(
                "/upload/",
                headers={"Authorization": f"Bearer {token}"},
                files={"file": ("sample.txt", b"hello world", "text/plain")},
            ),
            client.post(
                "/train/",
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "doc_type_name": "invoice",
                    "sample_text": "Invoice INV-2026-001 for Rs45,000 from ABC Technologies",
                    "schema_definition": {"invoice_number": "string"},
                    "confidence_threshold": 0.8,
                },
            ),
            client.post(
                "/auto-detect/",
                headers={"Authorization": f"Bearer {token}"},
                files={"file": ("sample.pdf", b"%PDF-1.4", "application/pdf")},
            ),
        ]
        responses = await asyncio.gather(*requests)
    assert all(response.status_code == 200 for response in responses)


@pytest.mark.anyio
async def test_expired_token_returns_401(auth_env):
    transport = ASGITransport(app=main.app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await _register_user(client, "admin@example.com", "Secret123!", "admin")
        expired_token = create_access_token({"sub": "admin@example.com", "role": "admin"}, expires_delta=timedelta(seconds=-1))
        response = await client.get("/auth/me", headers={"Authorization": f"Bearer {expired_token}"})
    assert response.status_code == 401


@pytest.mark.anyio
async def test_logout_blocklists_token(auth_env):
    transport = ASGITransport(app=main.app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await _register_user(client, "admin@example.com", "Secret123!", "admin")
        login = await _login(client, "admin@example.com", "Secret123!")
        token = login.json()["access_token"]
        logout = await client.post("/auth/logout", headers={"Authorization": f"Bearer {token}"})
        assert logout.status_code == 200
        me = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 401
