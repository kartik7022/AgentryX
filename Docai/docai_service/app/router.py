from __future__ import annotations

import logging
import os

from app.parsers.docling_parser import DoclingParser
from app.parsers.grobid_parser import GrobidParser
from app.parsers.ocr_parser import OCRParser
from app.parsers.unstructured_parser import UnstructuredParser

logger = logging.getLogger(__name__)


def _scientific_doc_type_match(doc_type_name: str | None) -> bool:
    return bool(doc_type_name and "scientific_paper" in doc_type_name.lower())


def route_document(file_path: str, doc_type_name: str | None = None):
    _, ext = os.path.splitext(file_path)
    ext = ext.lower()

    if ext == ".pdf":
        if _scientific_doc_type_match(doc_type_name):
            logger.info("Routing %s to grobid parser", file_path)
            return GrobidParser().parse(file_path)

        logger.info("Routing %s to docling parser", file_path)
        result = DoclingParser().parse(file_path)
        if not result.get("content"):
            logger.info("Docling returned empty content for %s, falling back to OCR", file_path)
            return OCRParser().parse(file_path)
        return result

    if ext in {".docx", ".doc", ".pptx", ".html"}:
        logger.info("Routing %s to unstructured parser", file_path)
        return UnstructuredParser().parse(file_path)

    if ext in {".jpg", ".jpeg", ".png", ".tiff", ".bmp"}:
        logger.info("Routing %s to ocr parser", file_path)
        return OCRParser().parse(file_path)

    logger.info("Routing %s to default unstructured parser", file_path)
    return UnstructuredParser().parse(file_path)
