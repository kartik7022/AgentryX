from __future__ import annotations

from pathlib import Path

import pytest

from app.parsers.docling_parser import DoclingParser
from app.parsers.ocr_parser import OCRParser
from app.parsers.unstructured_parser import UnstructuredParser
from app.parsers.grobid_parser import GrobidParser
from app.router import route_document


FIXTURES = Path(__file__).resolve().parent / "fixtures"


def _assert_parse_result(result: dict) -> None:
    assert isinstance(result, dict)
    assert "parser" in result
    assert "error" in result


def test_docling_parser_returns_parse_result_dict():
    result = DoclingParser().parse(str(FIXTURES / "sample.pdf"))
    _assert_parse_result(result)


def test_unstructured_parser_returns_parse_result_dict():
    result = UnstructuredParser().parse(str(FIXTURES / "sample.docx"))
    _assert_parse_result(result)


def test_ocr_parser_returns_parse_result_dict():
    result = OCRParser().parse(str(FIXTURES / "sample.png"))
    _assert_parse_result(result)


def test_grobid_parser_unavailable_returns_error_not_exception():
    result = GrobidParser().parse(str(FIXTURES / "sample.pdf"))
    _assert_parse_result(result)
    assert result["error"] in {"grobid_unavailable", None} or isinstance(result["error"], str)


def test_router_pdf_routes_to_docling(monkeypatch):
    monkeypatch.setattr(
        "app.parsers.docling_parser.DoclingParser.parse",
        lambda self, file_path: {
            "parser": "docling",
            "content": "x",
            "tables": [],
            "metadata": {},
            "raw_text": "x",
            "confidence": 1.0,
            "error": None,
        },
    )
    result = route_document(str(FIXTURES / "sample.pdf"))
    _assert_parse_result(result)
    assert result["parser"] == "docling"


def test_router_png_routes_to_ocr():
    result = route_document(str(FIXTURES / "sample.png"))
    _assert_parse_result(result)
    assert result["parser"] == "ocr"


def test_router_docx_routes_to_unstructured():
    result = route_document(str(FIXTURES / "sample.docx"))
    _assert_parse_result(result)
    assert result["parser"] == "unstructured"


def test_router_unknown_extension_defaults_to_unstructured():
    result = route_document(str(FIXTURES / "sample.unknown"))
    _assert_parse_result(result)
    assert result["parser"] == "unstructured"
