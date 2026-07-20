from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

import app.main as main
import app.vector_store as vector_store_module
from app.vector_store import VectorStore


class DummyEmbeddingModel:
    def encode(self, texts):
        text = texts[0]
        base = float(len(text) or 1)
        return [[base + float(i) for i in range(384)]]


class FakeCursor:
    def __init__(self):
        self.statements = []
        self.fetchone_result = None
        self.fetchall_result = []
        self.rowcount = 0

    def execute(self, sql, params=None):
        self.statements.append((sql, params))

    def fetchone(self):
        return self.fetchone_result

    def fetchall(self):
        return self.fetchall_result


class FakeConnection:
    def __init__(self, cursor):
        self._cursor = cursor
        self.commits = 0

    def cursor(self):
        return self._cursor

    def commit(self):
        self.commits += 1


def make_store(monkeypatch, cursor=None):
    cursor = cursor or FakeCursor()
    monkeypatch.setattr(vector_store_module, "SentenceTransformer", DummyEmbeddingModel)
    monkeypatch.setattr(vector_store_module.psycopg2, "connect", lambda **kwargs: FakeConnection(cursor))
    store = VectorStore()
    return store, cursor


def test_embed_returns_list_of_384_floats(monkeypatch):
    store, _ = make_store(monkeypatch)
    vector = store.embed("hello world")
    assert isinstance(vector, list)
    assert len(vector) == 384
    assert all(isinstance(value, float) for value in vector)


def test_register_template_inserts_to_db(monkeypatch):
    store, cursor = make_store(monkeypatch)
    cursor.fetchone_result = (str(uuid4()),)
    doc_type_id = str(uuid4())
    template_id = store.register_template("doc-123", "sample template text", doc_type_id=doc_type_id)
    assert isinstance(template_id, str)
    assert len(cursor.statements) == 1
    sql, params = cursor.statements[0]
    assert "INSERT INTO templates" in sql
    assert params[0] == "doc-123"
    assert params[1] == doc_type_id
    assert params[2] == "sample template text"
    assert len(params[3]) == 384


def test_lookup_returns_doc_id_for_similar_text(monkeypatch):
    store, cursor = make_store(monkeypatch)
    cursor.fetchone_result = ("doc-123", uuid4(), 0.92)
    result = store.lookup("similar sample text", threshold=0.75)
    assert result is not None
    assert result["doc_id"] == "doc-123"
    assert result["similarity_score"] >= 0.75
    assert any("<->" in statement[0] for statement in cursor.statements)


def test_lookup_returns_none_below_threshold(monkeypatch):
    store, cursor = make_store(monkeypatch)
    cursor.fetchone_result = ("doc-123", uuid4(), 0.5)
    result = store.lookup("dissimilar text", threshold=0.75)
    assert result is None


def test_list_templates_returns_correct_count(monkeypatch):
    store, cursor = make_store(monkeypatch)
    cursor.fetchall_result = [
        (str(uuid4()), "doc-123", uuid4(), "sample one", [0.1] * 384, datetime.now(timezone.utc)),
        (str(uuid4()), "doc-123", uuid4(), "sample two", [0.2] * 384, datetime.now(timezone.utc)),
    ]
    rows = store.list_templates("doc-123")
    assert len(rows) == 2
    assert rows[0]["doc_id"] == "doc-123"


def test_delete_templates_removes_rows(monkeypatch):
    store, cursor = make_store(monkeypatch)
    cursor.rowcount = 3
    deleted = store.delete_templates("doc-123")
    assert deleted == 3
    assert cursor.statements[0][0].startswith("DELETE FROM templates")


@pytest.mark.anyio
async def test_auto_detect_endpoint_returns_matched_true_for_known_doc(monkeypatch):
    class FakeVector:
        def embed(self, text):
            return [0.1] * 384

        def lookup(self, text, threshold=0.75):
            return {"doc_id": "matched-doc", "similarity_score": 0.91}

    monkeypatch.setattr(main, "vector_store", FakeVector())
    monkeypatch.setattr(main, "registry", type("FakeRegistry", (), {"get_model": lambda self, doc_id, db=None: None})())
    monkeypatch.setattr(
        main,
        "route_document",
        lambda path, doc_type_name=None: {
            "parser": "docling",
            "content": "Invoice INV-2026-001 for Rs45,000 from ABC Technologies",
            "tables": [],
            "metadata": {},
            "confidence": 0.95,
            "error": None,
        },
    )
    transport = ASGITransport(app=main.app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/auto-detect/",
            files={"file": ("sample.pdf", b"%PDF-1.4 sample", "application/pdf")},
        )
    body = response.json()
    assert response.status_code == 200
    assert body["matched"] is True
    assert body["doc_id"] == "matched-doc"
    assert body["similarity_score"] == 0.91
    assert isinstance(body["extracted_fields"], dict)


@pytest.mark.anyio
async def test_auto_detect_endpoint_returns_matched_false_for_unknown_doc(monkeypatch):
    class FakeVector:
        def embed(self, text):
            return [0.1] * 384

        def lookup(self, text, threshold=0.75):
            return None

    monkeypatch.setattr(main, "vector_store", FakeVector())
    monkeypatch.setattr(
        main,
        "route_document",
        lambda path, doc_type_name=None: {
            "parser": "unstructured",
            "content": "Completely unknown document",
            "tables": [],
            "metadata": {},
            "confidence": 0.2,
            "error": None,
        },
    )
    transport = ASGITransport(app=main.app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/auto-detect/",
            files={"file": ("sample.pdf", b"%PDF-1.4 sample", "application/pdf")},
        )
    body = response.json()
    assert response.status_code == 200
    assert body["matched"] is False
    assert "suggestion" in body
