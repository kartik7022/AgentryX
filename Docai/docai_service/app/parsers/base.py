from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, TypedDict


class ParseResult(TypedDict, total=False):
    parser: str
    content: str
    tables: list[dict[str, Any]]
    metadata: dict[str, Any]
    raw_text: str
    confidence: float
    error: str | None


class BaseParser(ABC):
    @property
    @abstractmethod
    def parser_name(self) -> str:
        raise NotImplementedError

    @abstractmethod
    def parse(self, file_path: str) -> ParseResult:
        raise NotImplementedError
