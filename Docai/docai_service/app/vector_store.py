from __future__ import annotations

import math
import os
from typing import Any
from uuid import uuid4

import psycopg2

from app.db import SessionLocal, Template

try:
    from sentence_transformers import SentenceTransformer
except ImportError:  # pragma: no cover
    SentenceTransformer = None


class VectorStore:
    def __init__(self) -> None:
        self.model = self._load_model()
        try:
            self.conn = psycopg2.connect(
                dbname=os.getenv("POSTGRES_DB", "docai_db"),
                user=os.getenv("POSTGRES_USER", "docai_user"),
                password=os.getenv("POSTGRES_PASSWORD", "docai_pass"),
                host=os.getenv("POSTGRES_HOST", "localhost"),
                port=os.getenv("POSTGRES_PORT", "5432"),
            )
            self.cur = self.conn.cursor()
        except Exception:
            self.conn = None
            self.cur = None
        self._session_factory = SessionLocal

    def _load_model(self):
        if SentenceTransformer is None:
            return None
        try:
            return SentenceTransformer("all-MiniLM-L6-v2")
        except Exception:
            return None

    def _fallback_embedding(self, text: str) -> list[float]:
        seed = (text or "").encode("utf-8")
        if not seed:
            seed = b"docai"
        values: list[float] = []
        for index in range(384):
            value = seed[index % len(seed)]
            values.append((value / 255.0) * 2.0 - 1.0)
        return values

    def _cosine_similarity(self, a: list[float], b: list[float]) -> float:
        dot = sum(x * y for x, y in zip(a, b))
        norm_a = math.sqrt(sum(x * x for x in a))
        norm_b = math.sqrt(sum(y * y for y in b))
        if norm_a == 0.0 or norm_b == 0.0:
            return 0.0
        return dot / (norm_a * norm_b)

    def embed(self, text: str) -> list[float]:
        if self.model is None:
            return self._fallback_embedding(text)
        embedding = self.model.encode([text])[0]
        if hasattr(embedding, "tolist"):
            values = embedding.tolist()
        else:
            values = list(embedding)
        return [float(value) for value in values]

    def _orm_session(self):
        return self._session_factory()

    def register_template(self, doc_id: str, text: str, doc_type_id: str | None = None) -> str:
        vector = self.embed(text)
        if self.cur is not None and self.conn is not None:
            self.cur.execute(
                "INSERT INTO templates (doc_id, doc_type_id, sample_text, embedding) VALUES (%s, %s, %s, %s) RETURNING id",
                (doc_id, doc_type_id, text, vector),
            )
            template_id = self.cur.fetchone()[0]
            self.conn.commit()
            return str(template_id)

        db = self._orm_session()
        try:
            template = Template(
                id=str(uuid4()),
                doc_id=doc_id,
                doc_type_id=doc_type_id,
                sample_text=text,
                embedding=vector,
            )
            db.add(template)
            db.commit()
            db.refresh(template)
            return str(template.id)
        finally:
            db.close()

    def lookup(self, text: str, threshold: float = 0.75) -> dict[str, Any] | None:
        vector = self.embed(text)
        if self.cur is not None:
            self.cur.execute(
                """
                SELECT doc_id, doc_type_id, 1 - (embedding <-> %s) as similarity
                FROM templates
                ORDER BY embedding <-> %s
                LIMIT 1
                """,
                (vector, vector),
            )
            row = self.cur.fetchone()
            if not row:
                return None
            doc_id, doc_type_id, similarity = row
            similarity_score = float(similarity)
            if similarity_score < threshold:
                return None
            return {
                "doc_id": str(doc_id),
                "similarity_score": similarity_score,
            }

        db = self._orm_session()
        try:
            templates = db.query(Template).all()
            best_doc_id = None
            best_similarity = -1.0
            for template in templates:
                embedding = template.embedding or []
                if isinstance(embedding, str):
                    try:
                        import json

                        embedding = json.loads(embedding)
                    except Exception:
                        embedding = []
                if len(embedding) != len(vector):
                    continue
                similarity = self._cosine_similarity(vector, [float(v) for v in embedding])
                if similarity > best_similarity:
                    best_similarity = similarity
                    best_doc_id = template.doc_id
            if best_doc_id is None or best_similarity < threshold:
                return None
            return {
                "doc_id": str(best_doc_id),
                "similarity_score": float(best_similarity),
            }
        finally:
            db.close()

    def list_templates(self, doc_id: str) -> list[dict[str, Any]]:
        if self.cur is not None:
            self.cur.execute(
                "SELECT id, doc_id, doc_type_id, sample_text, embedding, created_at FROM templates WHERE doc_id = %s ORDER BY created_at ASC",
                (doc_id,),
            )
            rows = self.cur.fetchall() or []
            return [
                {
                    "id": str(row[0]),
                    "doc_id": row[1],
                    "doc_type_id": str(row[2]) if row[2] else None,
                    "sample_text": row[3],
                    "embedding": row[4],
                    "created_at": row[5].isoformat() if hasattr(row[5], "isoformat") else row[5],
                }
                for row in rows
            ]

        db = self._orm_session()
        try:
            rows = db.query(Template).filter(Template.doc_id == doc_id).order_by(Template.created_at.asc()).all()
            return [
                {
                    "id": str(row.id),
                    "doc_id": row.doc_id,
                    "doc_type_id": str(row.doc_type_id) if row.doc_type_id else None,
                    "sample_text": row.sample_text,
                    "embedding": row.embedding,
                    "created_at": row.created_at.isoformat() if row.created_at else None,
                }
                for row in rows
            ]
        finally:
            db.close()

    def delete_templates(self, doc_id: str) -> int:
        if self.cur is not None and self.conn is not None:
            self.cur.execute("DELETE FROM templates WHERE doc_id = %s", (doc_id,))
            deleted = self.cur.rowcount or 0
            self.conn.commit()
            return deleted

        db = self._orm_session()
        try:
            deleted = db.query(Template).filter(Template.doc_id == doc_id).delete()
            db.commit()
            return int(deleted or 0)
        finally:
            db.close()
