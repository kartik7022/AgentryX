from __future__ import annotations

from pathlib import Path


INVOICE_LINES = [
    "DocAI Sample Invoice",
    "Invoice Number: INV-2026-001",
    "Date: 2026-06-22",
    "Vendor: ABC Technologies",
    "Contact: Jane Doe",
    "Email: jane.doe@example.com",
    "Phone: 555-123-4567",
    "Total Amount: 45000",
]

RESUME_LINES = [
    "Asha Verma",
    "Email: asha.verma@example.com",
    "Skills: Python, FastAPI, Machine Learning, PostgreSQL",
    "Experience: 5 years building enterprise document processing systems",
]

CLAIM_TEXT = (
    "Insurance claim for patient John Doe with SSN 123-45-6789 and "
    "policy number POL-9001 after vehicle damage."
)

MEDICAL_RECORD_TEXT = (
    "Medical record for patient John Doe. DOB: 1990-01-01. "
    "Medical license: MED-7781. Diagnosis: follow-up triage required."
)

PASSPORT_TEXT = (
    "Passport scan for Vinod Kumar. DOB: 1990-01-01. Passport number: M1234567."
)


def create_pdf(path: Path, lines: list[str]) -> None:
    try:
        from reportlab.lib.pagesizes import letter
        from reportlab.pdfgen import canvas
    except ImportError:  # pragma: no cover
        _create_basic_pdf(path, lines)
        return

    pdf = canvas.Canvas(str(path), pagesize=letter)
    y = 750
    for line in lines:
        pdf.drawString(72, y, line)
        y -= 22
    pdf.save()


def _escape_pdf_text(value: str) -> str:
    return value.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _create_basic_pdf(path: Path, lines: list[str]) -> None:
    text_stream = ["BT", "/F1 12 Tf", "72 760 Td"]
    first = True
    for line in lines:
        escaped = _escape_pdf_text(line)
        if first:
            text_stream.append(f"({escaped}) Tj")
            first = False
        else:
            text_stream.append("0 -20 Td")
            text_stream.append(f"({escaped}) Tj")
    text_stream.append("ET")
    content = "\n".join(text_stream).encode("utf-8")

    objects = [
        b"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
        b"2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
        b"3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
        b"4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
        f"5 0 obj << /Length {len(content)} >> stream\n".encode("utf-8") + content + b"\nendstream endobj",
    ]

    pdf = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for obj in objects:
        offsets.append(len(pdf))
        pdf.extend(obj)
        pdf.extend(b"\n")

    xref_offset = len(pdf)
    pdf.extend(f"xref\n0 {len(objects) + 1}\n".encode("utf-8"))
    pdf.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        pdf.extend(f"{offset:010d} 00000 n \n".encode("utf-8"))
    pdf.extend(
        (
            f"trailer << /Size {len(objects) + 1} /Root 1 0 R >>\n"
            f"startxref\n{xref_offset}\n%%EOF\n"
        ).encode("utf-8")
    )
    path.write_bytes(pdf)


def write_text(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    fixtures = root / "tests" / "fixtures"
    fixtures.mkdir(parents=True, exist_ok=True)

    create_pdf(fixtures / "sample_invoice.pdf", INVOICE_LINES)
    create_pdf(fixtures / "sample_resume.pdf", RESUME_LINES)
    write_text(fixtures / "sample_claim.txt", CLAIM_TEXT)
    write_text(fixtures / "sample_medical_record.txt", MEDICAL_RECORD_TEXT)
    write_text(fixtures / "sample_passport.txt", PASSPORT_TEXT)

    print("Generated fixtures:")
    for path in sorted(fixtures.glob("sample_*")):
        print(f"- {path.name}")


if __name__ == "__main__":
    main()
