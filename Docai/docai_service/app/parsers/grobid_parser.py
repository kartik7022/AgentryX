from __future__ import annotations

import os
import xml.etree.ElementTree as ET
from typing import Any

try:
    import requests
except ImportError:  # pragma: no cover
    requests = None

from .base import BaseParser, ParseResult


class GrobidParser(BaseParser):
    GROBID_URL = os.getenv(
        "GROBID_URL", "http://localhost:8070/api/processFulltextDocument"
    )

    @property
    def parser_name(self) -> str:
        return "grobid"

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

    def _extract_text(self, root: ET.Element, xpath: str) -> list[str]:
        ns = {"tei": "http://www.tei-c.org/ns/1.0"}
        return [
            "".join(node.itertext()).strip()
            for node in root.findall(xpath, ns)
            if "".join(node.itertext()).strip()
        ]

    def parse(self, file_path: str) -> ParseResult:
        try:
            if requests is None:
                return self._empty_result("grobid_unavailable")
            with open(file_path, "rb") as handle:
                response = requests.post(
                    self.GROBID_URL,
                    files={"input": handle},
                    timeout=20,
                )
            if response.status_code >= 500:
                raise requests.RequestException("grobid_unavailable")
            response.raise_for_status()

            root = ET.fromstring(response.text)
            ns = {"tei": "http://www.tei-c.org/ns/1.0"}

            title = root.findtext(".//tei:titleStmt/tei:title", default="", namespaces=ns).strip()
            authors = [
                " ".join(part for part in [forename, surname] if part).strip()
                for forename, surname in [
                    (
                        node.findtext(".//tei:forename", default="", namespaces=ns),
                        node.findtext(".//tei:surname", default="", namespaces=ns),
                    )
                    for node in root.findall(".//tei:author", ns)
                ]
            ]
            authors = [author for author in authors if author]
            abstract = root.findtext(".//tei:profileDesc/tei:abstract", default="", namespaces=ns).strip()
            references = self._extract_text(root, ".//tei:listBibl/tei:biblStruct")
            sections = self._extract_text(root, ".//tei:text/tei:body/tei:div")

            content_parts = [part for part in [title, abstract, "\n".join(sections)] if part]
            return {
                "parser": self.parser_name,
                "content": "\n".join(content_parts).strip(),
                "tables": [],
                "metadata": {
                    "title": title,
                    "authors": authors,
                    "abstract": abstract,
                    "references": references,
                    "sections": sections,
                },
                "raw_text": response.text,
                "confidence": 0.8 if title or abstract else 0.6,
                "error": None,
            }
        except requests.RequestException:
            return self._empty_result("grobid_unavailable")
        except Exception as exc:
            return self._empty_result(str(exc))
