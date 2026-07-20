from __future__ import annotations

from typing import Any

from .base import BaseParser, ParseResult

try:
    import docling
except ImportError:  # pragma: no cover
    docling = None


class DoclingParser(BaseParser):
    @property
    def parser_name(self) -> str:
        return "docling"

    def _empty_result(self, error: str | None) -> ParseResult:
        return {
            "parser": self.parser_name,
            "content": "",
            "tables": [],
            "metadata": {},
            "raw_text": "",
            "confidence": 0.0,
            "error": error,
        }

    def parse(self, file_path: str) -> ParseResult:
        try:
            if docling is None:
                raise ImportError("docling is not installed")
            doc = docling.parse(file_path)
            content = ""
            raw_text = ""
            tables: list[dict[str, Any]] = []
            metadata: dict[str, Any] = {}

            if hasattr(doc, "to_dict"):
                doc_dict = doc.to_dict()
                content = str(
                    doc_dict.get("content")
                    or doc_dict.get("text")
                    or doc_dict.get("raw_text")
                    or ""
                )
                raw_text = str(doc_dict.get("raw_text") or content)
                tables = list(doc_dict.get("tables") or [])
                metadata = dict(doc_dict.get("metadata") or {})
                if "page_count" not in metadata and doc_dict.get("page_count") is not None:
                    metadata["page_count"] = doc_dict.get("page_count")
            else:
                content = str(getattr(doc, "text", "") or "")
                raw_text = content
                tables = list(getattr(doc, "tables", []) or [])
                metadata = dict(getattr(doc, "metadata", {}) or {})

            return {
                "parser": self.parser_name,
                "content": content,
                "tables": tables,
                "metadata": metadata,
                "raw_text": raw_text,
                "confidence": 0.85 if content else 0.0,
                "error": None,
            }
        except Exception as exc:
            return self._empty_result(str(exc))
