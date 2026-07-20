from __future__ import annotations

import os
from dataclasses import dataclass
from types import SimpleNamespace
from uuid import uuid4

from app.db import DocumentType, ModelRegistryEntry, SessionLocal

try:
    import mlflow
    from mlflow import MlflowClient
except ImportError:  # pragma: no cover
    class _StubPyFuncModel:
        class PythonModel:
            def predict(self, context, model_input):  # pragma: no cover
                return model_input

        @staticmethod
        def log_model(artifact_path, python_model, registered_model_name=None):
            return SimpleNamespace(model_uri=f"runs:/stub/{artifact_path}")

        @staticmethod
        def load_model(model_uri):
            return SimpleNamespace(model_uri=model_uri)

    class _StubMlflowClient:
        def list_registered_models(self):
            return []

        def get_latest_versions(self, name):
            return []

        def transition_model_version_stage(self, name, version, stage):
            return None

    class _StubRun:
        def __init__(self, run_id: str):
            self.info = SimpleNamespace(run_id=run_id)

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

    class _StubMlflow:
        pyfunc = _StubPyFuncModel()

        @staticmethod
        def set_tracking_uri(uri):
            return None

        @staticmethod
        def set_experiment(name):
            return None

        @staticmethod
        def start_run():
            return _StubRun("stub-run")

        @staticmethod
        def log_params(params):
            return None

        @staticmethod
        def log_metric(key, value):
            return None

        @staticmethod
        def register_model(model_uri, name):
            return SimpleNamespace(name=name, version="1")

        MlflowClient = _StubMlflowClient

    mlflow = _StubMlflow()
    MlflowClient = _StubMlflowClient


MODEL_REGISTRY: dict[str, dict[str, str]] = {}


def register_model(name: str, model_type: str, version: str) -> None:
    MODEL_REGISTRY[name] = {
        "model_type": model_type,
        "version": version,
    }


@dataclass
class _DocAIStubModel(mlflow.pyfunc.PythonModel):
    doc_type_name: str
    model_info: dict

    def predict(self, context, model_input):  # pragma: no cover
        return {
            "doc_type_name": self.doc_type_name,
            "model_info": self.model_info,
            "input": model_input,
        }


class ModelRegistry:
    def __init__(self, session_factory=SessionLocal):
        self.session_factory = session_factory
        self.registry: dict[str, dict[str, str]] = {}
        tracking_uri = os.getenv("MLFLOW_TRACKING_URI", "http://localhost:5000")
        mlflow.set_tracking_uri(tracking_uri)
        mlflow.set_experiment("docai_parsing")

    def _get_or_create_entry(self, db, doc_id: str, doc_type_name: str | None):
        entry = db.query(ModelRegistryEntry).filter(ModelRegistryEntry.doc_id == doc_id).first()
        if entry:
            return entry

        document_type = None
        if doc_type_name:
            document_type = (
                db.query(DocumentType)
                .filter(DocumentType.doc_type_name == doc_type_name)
                .first()
            )

        entry = ModelRegistryEntry(
            doc_type_id=str(document_type.id) if document_type else None,
            doc_id=doc_id,
            status="registered",
        )
        db.add(entry)
        db.commit()
        db.refresh(entry)
        return entry

    def register(
        self,
        doc_type: str,
        model_info: dict,
        doc_type_id: str | None = None,
        db=None,
    ) -> str:
        doc_id = str(uuid4())
        own_session = db is None
        db = db or self.session_factory()
        try:
            if doc_type_id is None:
                document_type = (
                    db.query(DocumentType).filter(DocumentType.doc_type_name == doc_type).first()
                )
                doc_type_id = str(document_type.id) if document_type else None

            entry = ModelRegistryEntry(
                doc_type_id=doc_type_id,
                doc_id=doc_id,
                mlflow_run_id=model_info.get("mlflow_run_id"),
                mlflow_model_uri=model_info.get("mlflow_model_uri"),
                model_type=model_info.get("model_type", "LayoutLMv3"),
                status=model_info.get("status", "registered"),
            )
            db.add(entry)
            db.commit()
            db.refresh(entry)
            self.registry[doc_id] = {
                "doc_type": doc_type,
                "model": {**model_info, "doc_type_id": doc_type_id},
            }
            return doc_id
        finally:
            if own_session:
                db.close()

    def register_model(self, doc_id: str, doc_type_name: str, model_info: dict) -> str:
        mock_training = os.getenv("MOCK_TRAINING", "true").lower() == "true"
        own_session = False
        db = self.session_factory()
        try:
            own_session = True
            entry = self._get_or_create_entry(db, doc_id, doc_type_name)
            run_id = str(uuid4())
            model_uri = f"runs:/{run_id}/{doc_id}"

            try:
                with mlflow.start_run() as run:
                    run_id = run.info.run_id
                    mlflow.log_params(
                        {
                            "doc_id": doc_id,
                            "doc_type_name": doc_type_name,
                            "model_type": "LayoutLMv3",
                        }
                    )

                    if mock_training:
                        mlflow.log_metric("accuracy", 0.95)
                    else:
                        self._layoutlmv3_training_stub(doc_id, doc_type_name, model_info)
                        mlflow.log_metric("accuracy", 0.70)

                    try:
                        logged_model = mlflow.pyfunc.log_model(
                            artifact_path=doc_id,
                            python_model=_DocAIStubModel(doc_type_name=doc_type_name, model_info=model_info),
                            registered_model_name=doc_id,
                        )
                        model_uri = getattr(logged_model, "model_uri", model_uri)
                        mlflow.register_model(model_uri=model_uri, name=doc_id)
                    except Exception:
                        model_uri = f"runs:/{run_id}/{doc_id}"
            except Exception:
                run_id = str(uuid4())
                model_uri = f"runs:/{run_id}/{doc_id}"

            entry.mlflow_run_id = run_id
            entry.mlflow_model_uri = model_uri
            entry.model_type = "LayoutLMv3"
            entry.status = model_info.get("status", "registered")
            db.add(entry)
            db.commit()

            self.registry[doc_id] = {
                "doc_type": doc_type_name,
                "model": {
                    "doc_type_id": str(entry.doc_type_id) if entry.doc_type_id else None,
                    "doc_id": doc_id,
                    "mlflow_run_id": run_id,
                    "mlflow_model_uri": model_uri,
                    "model_type": "LayoutLMv3",
                    "status": entry.status,
                },
            }
            return run_id
        finally:
            if own_session:
                db.close()

    def _layoutlmv3_training_stub(self, doc_id: str, doc_type_name: str, model_info: dict) -> None:
        _ = {
            "doc_id": doc_id,
            "doc_type_name": doc_type_name,
            "model_info": model_info,
            "training_loop": "placeholder for LayoutLMv3 fine-tuning",
        }

    def load_model(self, doc_id: str) -> object:
        try:
            return mlflow.pyfunc.load_model(f"models:/{doc_id}/latest")
        except Exception:
            return SimpleNamespace(doc_id=doc_id, source="fallback-model")

    def list_models(self) -> list[dict]:
        try:
            client = MlflowClient()
            if hasattr(client, "list_registered_models"):
                models = client.list_registered_models()
            elif hasattr(client, "search_registered_models"):
                models = client.search_registered_models()
            else:
                models = []
        except Exception:
            models = []
        results: list[dict] = []
        for model in models or []:
            if isinstance(model, dict):
                results.append(model)
            else:
                results.append(
                    {
                        "name": getattr(model, "name", None),
                        "latest_versions": getattr(model, "latest_versions", None),
                    }
                )
        if results:
            return results
        return self.list_models_db()

    def deprecate_model(self, doc_id: str) -> bool:
        try:
            client = MlflowClient()
            latest_versions = []
            if hasattr(client, "get_latest_versions"):
                latest_versions = client.get_latest_versions(doc_id) or []
            elif hasattr(client, "search_model_versions"):
                latest_versions = client.search_model_versions(f"name='{doc_id}'") or []

            if not latest_versions:
                return False

            latest = latest_versions[0]
            version = latest.get("version") if isinstance(latest, dict) else getattr(latest, "version", None)
            if version is None:
                return False

            client.transition_model_version_stage(
                name=doc_id,
                version=version,
                stage="Archived",
            )
            return True
        except Exception:
            return False

    def get_model(self, doc_id: str, db=None):
        if doc_id in self.registry:
            return self.registry[doc_id]
        own_session = db is None
        db = db or self.session_factory()
        try:
            entry = db.query(ModelRegistryEntry).filter(ModelRegistryEntry.doc_id == doc_id).first()
            if not entry:
                return None
            return {
                "doc_type": getattr(entry.document_type, "doc_type_name", None),
                "model": {
                    "doc_type_id": str(entry.doc_type_id) if entry.doc_type_id else None,
                    "doc_id": entry.doc_id,
                    "mlflow_run_id": entry.mlflow_run_id,
                    "mlflow_model_uri": entry.mlflow_model_uri,
                    "model_type": entry.model_type,
                    "status": entry.status,
                },
            }
        finally:
            if own_session:
                db.close()

    def list_models_db(self, db=None):
        own_session = db is None
        db = db or self.session_factory()
        try:
            entries = db.query(ModelRegistryEntry).all()
            return [
                {
                    "doc_id": entry.doc_id,
                    "doc_type_id": str(entry.doc_type_id) if entry.doc_type_id else None,
                    "mlflow_run_id": entry.mlflow_run_id,
                    "mlflow_model_uri": entry.mlflow_model_uri,
                    "model_type": entry.model_type,
                    "status": entry.status,
                }
                for entry in entries
            ]
        finally:
            if own_session:
                db.close()
