from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from .base_connector import BaseConnector, ConnectorResult

try:
    try:
        from llama_index.core import Document, StorageContext, VectorStoreIndex, load_index_from_storage
    except ImportError:  # pragma: no cover
        from llama_index import SimpleDirectoryReader, VectorStoreIndex  # type: ignore
        Document = None
        StorageContext = None
        load_index_from_storage = None
except ImportError:  # pragma: no cover
    Document = None
    StorageContext = None
    VectorStoreIndex = None
    load_index_from_storage = None


class RAGConnector(BaseConnector):
    def __init__(self, index_dir: str | None = None) -> None:
        self.index_dir = Path(index_dir or os.getenv("RAG_INDEX_DIR", "./rag_index"))
        self.index_dir.mkdir(parents=True, exist_ok=True)
        self.manifest_path = self.index_dir / "documents.json"
        self._index = None

    @property
    def connector_name(self) -> str:
        return "rag"

    def is_configured(self) -> bool:
        return True

    def _load_manifest(self) -> list[dict[str, Any]]:
        if not self.manifest_path.exists():
            return []
        try:
            data = json.loads(self.manifest_path.read_text(encoding="utf-8"))
            return data if isinstance(data, list) else []
        except json.JSONDecodeError:
            return []

    def _save_manifest(self, docs: list[dict[str, Any]]) -> None:
        self.manifest_path.write_text(json.dumps(docs, ensure_ascii=False, indent=2), encoding="utf-8")

    def _document_text(self, parse_result: dict, doc_type_name: str, metadata: dict) -> str:
        fields = parse_result.get("fields", {})
        return json.dumps(
            {
                "doc_type_name": doc_type_name,
                "fields": fields,
                "metadata": metadata,
                "content": parse_result.get("content", ""),
            },
            ensure_ascii=False,
        )

    def _build_index(self):
        docs = self._load_manifest()
        if not docs:
            self._index = None
            return None

        texts = [doc.get("text", "") for doc in docs if doc.get("text")]
        if not texts:
            self._index = None
            return None

        if Document is not None and VectorStoreIndex is not None and StorageContext is not None:
            documents = [Document(text=doc.get("text", ""), metadata=doc.get("metadata", {})) for doc in docs if doc.get("text")]
            storage_context = StorageContext.from_defaults()
            index = VectorStoreIndex.from_documents(documents, storage_context=storage_context)
            index.storage_context.persist(persist_dir=str(self.index_dir))
            self._index = index
            return index

        self._index = {"documents": docs}
        return self._index

    def _load_index(self):
        if self._index is not None:
            return self._index
        if Document is not None and StorageContext is not None and load_index_from_storage is not None:
            try:
                storage_context = StorageContext.from_defaults(persist_dir=str(self.index_dir))
                self._index = load_index_from_storage(storage_context)
                return self._index
            except Exception:
                pass
        return self._build_index()

    def push(self, parse_result: dict, doc_type_name: str, metadata: dict) -> ConnectorResult:
        try:
            docs = self._load_manifest()
            record = {
                "doc_type_name": doc_type_name,
                "metadata": metadata,
                "text": self._document_text(parse_result, doc_type_name, metadata),
            }
            docs.append(record)
            self._save_manifest(docs)
            self._build_index()
            return self.build_result(self.connector_name, True, external_id=str(len(docs)))
        except Exception as exc:  # pragma: no cover - exercised in tests via mocks
            return self.build_result(self.connector_name, False, error=str(exc))

    def query_rag(self, question: str) -> str:
        docs = self._load_manifest()
        if not docs:
            return "No indexed documents available."

        question_lower = question.lower()
        best_match = docs[0]["text"]
        best_score = -1
        for doc in docs:
            text = doc.get("text", "")
            score = sum(1 for token in question_lower.split() if token and token in text.lower())
            if score > best_score:
                best_score = score
                best_match = text

        if Document is not None and VectorStoreIndex is not None:
            try:
                index = self._load_index()
                if index is not None and hasattr(index, "as_query_engine"):
                    query_engine = index.as_query_engine()
                    response = query_engine.query(question)
                    return str(response)
            except Exception:
                pass

        return f"Based on the indexed documents, the most relevant context is: {best_match}"
