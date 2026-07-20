from __future__ import annotations

import os
import re
import zlib
from pathlib import Path

import numpy as np

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    Image = None

from .base import BaseParser, ParseResult

try:
    import pytesseract
except ImportError:  # pragma: no cover
    pytesseract = None

try:
    from pdf2image import convert_from_path
except ImportError:  # pragma: no cover
    convert_from_path = None

try:
    from pypdf import PdfReader
except ImportError:  # pragma: no cover
    PdfReader = None

try:
    from pdfminer.high_level import extract_text as pdfminer_extract_text
except ImportError:  # pragma: no cover
    pdfminer_extract_text = None

try:
    import fitz
except ImportError:  # pragma: no cover
    fitz = None

try:
    import easyocr
except ImportError:  # pragma: no cover
    easyocr = None


class OCRParser(BaseParser):
    @property
    def parser_name(self) -> str:
        return "ocr"

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

    def _ocr_image(self, image: Image.Image) -> str:
        if pytesseract is None:
            raise ImportError("pytesseract is not installed")
        if Image is None:
            raise ImportError("Pillow is not installed")
        return pytesseract.image_to_string(image)

    def _unescape_pdf_string(self, value: str) -> str:
        value = value.replace(r"\\", "\\")
        value = value.replace(r"\(", "(").replace(r"\)", ")")
        value = value.replace(r"\n", "\n").replace(r"\r", "\r")
        value = value.replace(r"\t", "\t").replace(r"\b", "\b").replace(r"\f", "\f")
        return value

    def _extract_strings_from_content(self, content: str) -> list[str]:
        strings: list[str] = []
        for match in re.finditer(r"\((?:\\.|[^\\)])*\)\s*(?:Tj|TJ)", content, flags=re.DOTALL):
            literal = match.group(0)
            start = literal.find("(")
            end = literal.rfind(")")
            if start == -1 or end == -1 or end <= start:
                continue
            text = literal[start + 1 : end]
            text = self._unescape_pdf_string(text)
            text = re.sub(r"\s+", " ", text).strip()
            if not text:
                continue
            if len(text) < 2:
                continue
            if sum(ch.isalnum() for ch in text) < 2:
                continue
            strings.append(text)
        return strings

    def _extract_pdf_stream_text(self, data: bytes) -> list[str]:
        candidates: list[str] = []
        for stream_match in re.finditer(rb"stream\r?\n(.*?)\r?\nendstream", data, flags=re.DOTALL):
            raw_stream = stream_match.group(1).strip(b"\r\n")
            prefix = data[max(0, stream_match.start() - 300) : stream_match.start()]
            if b"/Subtype /Image" in prefix:
                continue
            is_flate = b"/FlateDecode" in prefix

            decoded_bytes = raw_stream
            if is_flate:
                for wbits in (zlib.MAX_WBITS, -zlib.MAX_WBITS):
                    try:
                        decoded_bytes = zlib.decompress(raw_stream, wbits=wbits)
                        break
                    except Exception:
                        decoded_bytes = raw_stream
            try:
                decoded_text = decoded_bytes.decode("latin1", errors="ignore")
            except Exception:
                continue
            candidates.extend(self._extract_strings_from_content(decoded_text))
        return candidates

    def _extract_pdf_with_pypdf(self, file_path: str) -> str:
        if PdfReader is None:
            return ""
        try:
            reader = PdfReader(file_path)
        except Exception:
            return ""
        pages_text: list[str] = []
        for page in reader.pages:
            try:
                page_text = page.extract_text() or ""
            except Exception:
                page_text = ""
            page_text = re.sub(r"[ \t]+\n", "\n", page_text).strip()
            if page_text:
                pages_text.append(page_text)
        return "\n\n".join(pages_text).strip()

    def _extract_pdf_with_pdfminer(self, file_path: str) -> str:
        if pdfminer_extract_text is None:
            return ""
        try:
            text = pdfminer_extract_text(file_path) or ""
        except Exception:
            return ""
        text = re.sub(r"\n{3,}", "\n\n", text)
        text = re.sub(r"[ \t]+\n", "\n", text)
        return text.strip()

    def _extract_pdf_with_easyocr(self, file_path: str) -> str:
        if fitz is None or easyocr is None:
            return ""
        try:
            reader = easyocr.Reader(["en"], gpu=False, verbose=False)
        except Exception:
            return ""
        try:
            document = fitz.open(file_path)
        except Exception:
            return ""

        pages_text: list[str] = []
        try:
            for page in document:
                try:
                    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
                    image = np.frombuffer(pix.samples, dtype=np.uint8)
                    image = image.reshape(pix.height, pix.width, pix.n)
                    if pix.n == 4:
                        image = image[:, :, :3]
                    if pix.n == 1:
                        image = np.repeat(image, 3, axis=2)
                    lines = reader.readtext(image, detail=0, paragraph=True)
                    page_text = "\n".join(line.strip() for line in lines if str(line).strip())
                    if page_text.strip():
                        pages_text.append(page_text.strip())
                except Exception:
                    continue
        finally:
            document.close()
        return "\n\n".join(pages_text).strip()

    def _pdf_text_fallback(self, file_path: str) -> str:
        try:
            data = Path(file_path).read_bytes()
        except Exception:
            return ""
        stream_chunks = self._extract_pdf_stream_text(data)
        if stream_chunks:
            return "\n".join(chunk for chunk in stream_chunks if chunk)

        decoded = data.decode("latin1", errors="ignore")
        text_chunks = self._extract_strings_from_content(decoded)
        if text_chunks:
            return "\n".join(chunk.strip() for chunk in text_chunks if chunk.strip())

        chunks = []
        for match in re.finditer(rb"[ -~]{4,}", data):
            try:
                chunk = match.group(0).decode("latin1", errors="ignore")
            except Exception:
                continue
            if chunk.startswith("%PDF") or "obj <<" in chunk:
                continue
            chunks.append(chunk)
        return "\n".join(chunks).strip()

    def parse(self, file_path: str) -> ParseResult:
        try:
            ext = os.path.splitext(file_path)[1].lower()
            if ext == ".pdf":
                extracted = self._extract_pdf_with_easyocr(file_path)
                if extracted:
                    return {
                        "parser": self.parser_name,
                        "content": extracted,
                        "tables": [],
                        "metadata": {"page_count": extracted.count("\n\n") + 1, "fallback": "easyocr"},
                        "raw_text": extracted,
                        "confidence": 0.88 if "Invoice" in extracted or "invoice" in extracted else 0.82,
                        "error": None,
                    }

                extracted = self._extract_pdf_with_pdfminer(file_path)
                if extracted:
                    return {
                        "parser": self.parser_name,
                        "content": extracted,
                        "tables": [],
                        "metadata": {"page_count": extracted.count("\n\n") + 1, "fallback": "pdfminer"},
                        "raw_text": extracted,
                        "confidence": 0.93 if "Invoice" in extracted or "invoice" in extracted else 0.9,
                        "error": None,
                    }

                extracted = self._extract_pdf_with_pypdf(file_path)
                if extracted:
                    return {
                        "parser": self.parser_name,
                        "content": extracted,
                        "tables": [],
                        "metadata": {"page_count": extracted.count("\n\n") + 1, "fallback": "pypdf"},
                        "raw_text": extracted,
                        "confidence": 0.92 if "Invoice" in extracted or "invoice" in extracted else 0.88,
                        "error": None,
                    }

                fallback = self._pdf_text_fallback(file_path)
                if fallback:
                    return {
                        "parser": self.parser_name,
                        "content": fallback,
                        "tables": [],
                        "metadata": {"page_count": 1, "fallback": "pdf_text"},
                        "raw_text": fallback,
                        "confidence": 0.9 if "Invoice" in fallback or "invoice" in fallback else 0.85,
                        "error": None,
                    }

                if Image is None:
                    return self._empty_result("ocr_unavailable")

                if convert_from_path is not None:
                    try:
                        pages = convert_from_path(file_path)
                        texts = [self._ocr_image(page) for page in pages]
                        content = "\n".join(texts).strip()
                        metadata = {"page_count": len(pages)}
                    except Exception:
                        content = ""
                        metadata = {}
                else:
                    content = ""
                    metadata = {}
                if not content:
                    content = self._pdf_text_fallback(file_path)
                    metadata = {"page_count": 1, "fallback": "pdf_text"}
            else:
                if Image is None:
                    return self._empty_result("ocr_unavailable")
                with Image.open(file_path) as image:
                    content = self._ocr_image(image).strip()
                metadata = {"page_count": 1}

            return {
                "parser": self.parser_name,
                "content": content,
                "tables": [],
                "metadata": metadata,
                "raw_text": content,
                "confidence": 0.85 if metadata.get("fallback") == "pdf_text" and content else 0.7 if content else 0.0,
                "error": None,
            }
        except Exception as exc:
            return self._empty_result(str(exc))
