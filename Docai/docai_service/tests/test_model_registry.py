from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

import app.main as main
import app.models.registry as registry_module
from app.db import DocumentType, ModelRegistryEntry
from app.models.registry import ModelRegistry


class FakeLatestVersion:
    def __init__(self, version="1"):
        self.version = version


class FakeClient:
    def __init__(self):
        self.registered_models = [SimpleNamespace(name="doc-123", latest_versions=[SimpleNamespace(version="1")])]
        self.transitions = []

    def list_registered_models(self):
        return self.registered_models

    def get_latest_versions(self, name):
        return [FakeLatestVersion("1")]

    def transition_model_version_stage(self, name, version, stage):
        self.transitions.append((name, version, stage))


class FakePyfunc:
    class PythonModel:
        def predict(self, context, model_input):
            return model_input

    def __init__(self):
        self.logged = []
        self.loaded = []

    def log_model(self, artifact_path, python_model, registered_model_name=None):
        self.logged.append((artifact_path, registered_model_name, python_model))
        return SimpleNamespace(model_uri=f"runs:/run-123/{artifact_path}")

    def load_model(self, model_uri):
        self.loaded.append(model_uri)
        return SimpleNamespace(model_uri=model_uri)


class FakeRun:
    def __init__(self, run_id="run-123"):
        self.info = SimpleNamespace(run_id=run_id)

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class FakeMlflow:
    def __init__(self):
        self.pyfunc = FakePyfunc()
        self.tracking_uri = None
        self.experiment = None
        self.params = []
        self.metrics = []
        self.registered = []
        self.run = FakeRun()

    def set_tracking_uri(self, uri):
        self.tracking_uri = uri

    def set_experiment(self, name):
        self.experiment = name

    def start_run(self):
        return self.run

    def log_params(self, params):
        self.params.append(params)

    def log_metric(self, key, value):
        self.metrics.append((key, value))

    def register_model(self, model_uri, name):
        self.registered.append((model_uri, name))
        return SimpleNamespace(name=name, version="1")


class FakeQuery:
    def __init__(self, session, model):
        self.session = session
        self.model = model
        self.expr = None

    def filter(self, expr):
        self.expr = expr
        return self

    def first(self):
        if self.model is DocumentType:
            target = getattr(getattr(self.expr, "right", None), "value", None)
            return self.session.document_types.get(target)
        if self.model is ModelRegistryEntry:
            target = getattr(getattr(self.expr, "right", None), "value", None)
            return self.session.model_registry_entries.get(target)
        return None

    def all(self):
        if self.model is ModelRegistryEntry:
            return list(self.session.model_registry_entries.values())
        return []


class FakeSession:
    def __init__(self):
        doc_type = SimpleNamespace(
            id=str(uuid4()),
            doc_type_name="invoice",
            schema_definition={},
            confidence_threshold=0.8,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        entry = SimpleNamespace(
            id=str(uuid4()),
            doc_type_id=doc_type.id,
            doc_id="doc-123",
            mlflow_run_id=None,
            mlflow_model_uri=None,
            model_type="LayoutLMv3",
            status="registered",
            document_type=doc_type,
        )
        self.document_types = {doc_type.doc_type_name: doc_type}
        self.model_registry_entries = {entry.doc_id: entry}
        self.added = []
        self.commits = 0

    def query(self, model):
        return FakeQuery(self, model)

    def add(self, obj):
        self.added.append(obj)
        if getattr(obj, "__class__", None).__name__ == "ModelRegistryEntry" or hasattr(obj, "doc_id"):
            self.model_registry_entries[obj.doc_id] = obj

    def commit(self):
        self.commits += 1

    def refresh(self, obj):
        return None

    def close(self):
        return None


def make_registry(monkeypatch):
    fake_mlflow = FakeMlflow()
    monkeypatch.setattr(registry_module, "mlflow", fake_mlflow)
    monkeypatch.setattr(registry_module, "MlflowClient", FakeClient)
    session = FakeSession()
    registry = ModelRegistry(session_factory=lambda: session)
    return registry, fake_mlflow, session


def test_register_model_mock_returns_run_id(monkeypatch):
    monkeypatch.setenv("MOCK_TRAINING", "true")
    registry, fake_mlflow, session = make_registry(monkeypatch)
    run_id = registry.register_model("doc-123", "invoice", {"status": "trained"})
    assert run_id == "run-123"
    assert fake_mlflow.tracking_uri == "http://localhost:5000"
    assert fake_mlflow.experiment == "docai_parsing"
    assert fake_mlflow.metrics == [("accuracy", 0.95)]
    assert fake_mlflow.registered == [("runs:/run-123/doc-123", "doc-123")]
    assert session.model_registry_entries["doc-123"].mlflow_run_id == "run-123"


def test_register_model_creates_mlflow_run_in_experiment(monkeypatch):
    monkeypatch.setenv("MOCK_TRAINING", "true")
    registry, fake_mlflow, _ = make_registry(monkeypatch)
    registry.register_model("doc-123", "invoice", {"status": "trained"})
    assert fake_mlflow.experiment == "docai_parsing"
    assert fake_mlflow.params[0]["doc_type_name"] == "invoice"
    assert fake_mlflow.params[0]["doc_id"] == "doc-123"


def test_load_model_returns_pyfunc_model(monkeypatch):
    registry, fake_mlflow, _ = make_registry(monkeypatch)
    model = registry.load_model("doc-123")
    assert model.model_uri == "models:/doc-123/latest"
    assert fake_mlflow.pyfunc.loaded == ["models:/doc-123/latest"]


def test_list_models_includes_registered_doc_id(monkeypatch):
    registry, _, _ = make_registry(monkeypatch)
    models = registry.list_models()
    assert any(model["name"] == "doc-123" for model in models)


def test_deprecate_model_transitions_to_archived(monkeypatch):
    registry, _, _ = make_registry(monkeypatch)
    client = FakeClient()
    monkeypatch.setattr(registry_module, "MlflowClient", lambda: client)
    assert registry.deprecate_model("doc-123") is True
    assert client.transitions == [("doc-123", "1", "Archived")]


@pytest.mark.anyio
async def test_train_endpoint_triggers_registry(monkeypatch):
    calls = []

    def fake_register_model(doc_id, doc_type_name, model_info):
        calls.append((doc_id, doc_type_name, model_info))
        return "run-123"

    monkeypatch.setattr(main.ml_registry, "register_model", fake_register_model)
    monkeypatch.setattr(main.vector_store, "register_template", lambda doc_id, text, doc_type_id=None: "template-1")
    monkeypatch.setattr(main, "log_event", lambda *args, **kwargs: "audit-1")

    class FakeQuery:
        def __init__(self, session, model):
            self.session = session
            self.model = model
            self.expr = None

        def filter(self, expr):
            self.expr = expr
            return self

        def first(self):
            if self.model is DocumentType:
                target = getattr(getattr(self.expr, "right", None), "value", None)
                return self.session.document_types.get(target)
            if self.model is ModelRegistryEntry:
                return None
            return None

    class FakeSession:
        def __init__(self):
            self.document_types = {
                "invoice": SimpleNamespace(
                    id=str(uuid4()),
                    doc_type_name="invoice",
                    schema_definition={},
                    confidence_threshold=0.8,
                    created_at=datetime.now(timezone.utc),
                    updated_at=datetime.now(timezone.utc),
                )
            }
            self.added = []

        def query(self, model):
            return FakeQuery(self, model)

        def add(self, obj):
            self.added.append(obj)

        def commit(self):
            return None

        def refresh(self, obj):
            return None

        def close(self):
            return None

    fake_session = FakeSession()
    main.app.dependency_overrides[main.get_db] = lambda: fake_session

    transport = ASGITransport(app=main.app)
    payload = {
        "doc_type_name": "invoice",
        "sample_text": "Invoice INV-2026-001 for Rs45,000 from ABC Technologies",
        "schema_definition": {"invoice_number": "string", "total_amount": "number"},
        "confidence_threshold": 0.85,
    }
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/train/", json=payload)

    assert response.status_code == 200
    assert len(calls) == 1
    assert calls[0][1] == "invoice"
    main.app.dependency_overrides.clear()
