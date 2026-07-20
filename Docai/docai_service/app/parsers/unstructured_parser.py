from __future__ import annotations

from typing import Any

from .base import BaseParser, ParseResult

try:
    from unstructured.partition.auto import partition
except ImportError:  # pragma: no cover
    partition = None


class UnstructuredParser(BaseParser):
    @property
    def parser_name(self) -> str:
        return "unstructured"

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
            if partition is None:
                raise ImportError("unstructured is not installed")
            elements = partition(filename=file_path)
            texts: list[str] = []
            tables: list[dict[str, Any]] = []
            for element in elements:
                text = getattr(element, "text", "") or ""
                if text:
                    texts.append(str(text))
                element_type = element.__class__.__name__
                if element_type.lower().startswith("table") or hasattr(element, "metadata"):
                    tables.append(
                        {
                            "type": element_type,
                            "text": text,
                            "metadata": getattr(element, "metadata", None),
                        }
                    )

            content = "\n".join(texts).strip()
            return {
                "parser": self.parser_name,
                "content": content,
                "tables": tables,
                "metadata": {"element_count": len(elements)},
                "raw_text": content,
                "confidence": 0.75 if content else 0.0,
                "error": None,
            }
        except Exception as exc:
            return self._empty_result(str(exc))
