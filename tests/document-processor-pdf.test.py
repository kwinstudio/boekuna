import io
import sys
import time
from pathlib import Path

import fitz
from fastapi import Request
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
PROCESSOR_DIR = ROOT / "kwinest" / "docprocessor"
sys.path.insert(0, str(PROCESSOR_DIR))

import app as processor  # noqa: E402


def request_with_origin(origin: str) -> Request:
    scope = {
        "type": "http",
        "http_version": "1.1",
        "method": "POST",
        "scheme": "https",
        "path": "/analyze",
        "raw_path": b"/analyze",
        "query_string": b"",
        "headers": [(b"origin", origin.encode("utf-8"))],
        "client": ("127.0.0.1", 12345),
        "server": ("processor.test", 443),
    }
    return Request(scope)


def invoice_lines(number="INV-2026-1001", description="Consultancy september"):
    return [
        "FACTUUR",
        "Leverancier: Voorbeeld Leverancier BV",
        "Adres: Teststraat 10, 3011 AA Rotterdam",
        "KVK: 12345678",
        "BTW: NL123456789B01",
        f"Factuurnummer: {number}",
        "Factuurdatum: 28-09-2026",
        "Vervaldatum: 12-10-2026",
        f"Omschrijving: {description}",
        "Werkzaamheden uitgevoerd conform opdracht en overeengekomen projectscope.",
        "Deze digitale factuur bevat selecteerbare tekst voor automatische verwerking.",
        "Betaling graag onder vermelding van het factuurnummer binnen de betaaltermijn.",
        "Subtotaal: EUR 100,00",
        "BTW 21%: EUR 21,00",
        "Totaal te betalen: EUR 121,00",
    ]


def vector_pdf(lines, pages=1):
    doc = fitz.open()
    chunks = [[] for _ in range(pages)]
    for idx, line in enumerate(lines):
        chunks[min(pages - 1, idx * pages // max(1, len(lines)))].append(line)
    for page_lines in chunks:
        page = doc.new_page(width=595, height=842)
        y = 60
        for line in page_lines:
            page.insert_text((45, y), line, fontsize=12)
            y += 34
        # Keep every digital page clearly above the sparse/OCR threshold.
        filler = (
            "Aanvullende digitale factuurtekst voor betrouwbare ingebedde tekstextractie "
            "zonder onnodige OCR. Boekuna moet de bestaande tekstlaag als eerste bron gebruiken."
        )
        while y < 560:
            page.insert_text((45, y), filler, fontsize=9)
            y += 26
    raw = doc.tobytes()
    doc.close()
    return raw


def scanned_pdf(lines):
    image = Image.new("RGB", (1800, 2400), "white")
    draw = ImageDraw.Draw(image)
    try:
        font = ImageFont.truetype("DejaVuSans.ttf", 48)
        heading = ImageFont.truetype("DejaVuSans-Bold.ttf", 58)
    except OSError:
        font = ImageFont.load_default()
        heading = font
    y = 100
    for idx, line in enumerate(lines):
        draw.text((100, y), line, fill="black", font=heading if idx == 0 else font)
        y += 105
    png = io.BytesIO()
    image.save(png, format="PNG", optimize=False)

    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    page.insert_image(page.rect, stream=png.getvalue())
    raw = doc.tobytes()
    doc.close()
    return raw


def assert_core_fields(result, *, number):
    assert result.supplier.name and "Voorbeeld Leverancier" in result.supplier.name
    assert result.invoice.invoiceNumber == number
    assert result.invoice.invoiceDate == "2026-09-28"
    assert result.invoice.description and "Consultancy" in result.invoice.description
    assert result.amounts.subtotal is not None and abs(result.amounts.subtotal - 100.0) < 0.02
    assert result.amounts.vatTotal is not None and abs(result.amounts.vatTotal - 21.0) < 0.02
    assert result.amounts.total is not None and abs(result.amounts.total - 121.0) < 0.02
    assert any(abs(float(v.rate) - 21.0) < 0.01 for v in result.amounts.vatLines)


def test_trusted_origin_contract():
    trusted = [
        "https://boekuna-boekhouding.onrender.com",
        "https://kwinest-boekhouding.onrender.com",
        "https://boekuna.nl",
        "https://www.boekuna.nl",
        "https://boekuna-qa-staging.onrender.com",
    ]
    for origin in trusted:
        assert processor.require_allowed_origin(request_with_origin(origin)) == origin
        assert origin in processor.ALLOWED_ORIGINS

    try:
        processor.require_allowed_origin(request_with_origin("https://attacker.example"))
    except processor.BoekunaDocumentError as exc:
        assert exc.status == 403
        assert exc.code == "PERMISSION_DENIED"
        assert exc.internal_code == "ORIGIN_NOT_ALLOWED"
    else:
        raise AssertionError("Untrusted origins must be rejected")


def test_digital_pdf_prefers_embedded_text():
    raw = vector_pdf(invoice_lines())
    started = time.perf_counter()
    doc = processor.extract_document("digitale-factuur.pdf", "application/pdf", raw)
    elapsed_ms = (time.perf_counter() - started) * 1000
    print(f"PERF digital_pdf_ms={elapsed_ms:.2f} bytes={len(raw)}")
    assert doc["kind"] == "pdf"
    assert doc["pageCount"] == 1
    assert doc["ocrPages"] == [], "A clear digital PDF must not pay the OCR cost"
    assert "INV-2026-1001" in doc["text"]
    assert "Consultancy september" in doc["text"]

    result = processor.heuristic_extract(doc, "digitale-factuur.pdf", {})
    assert_core_fields(result, number="INV-2026-1001")


def test_pdf_mime_detection_without_pdf_extension():
    raw = vector_pdf(invoice_lines(number="INV-2026-MIME"))
    doc = processor.extract_document("upload.bin", "application/pdf", raw)
    assert doc["kind"] == "pdf"
    assert "INV-2026-MIME" in doc["text"]


def test_scanned_pdf_uses_ocr_and_extracts_financial_core():
    raw = scanned_pdf(invoice_lines(number="SCAN-2026-2001"))
    started = time.perf_counter()
    doc = processor.extract_document("scan-factuur.pdf", "application/pdf", raw)
    elapsed_ms = (time.perf_counter() - started) * 1000
    page_conf = next((p.get("ocrConfidence") for p in doc.get("pages", []) if p.get("ocrConfidence") is not None), None)
    print(f"PERF scanned_pdf_ms={elapsed_ms:.2f} bytes={len(raw)} ocr_confidence={float(page_conf or 0):.4f}")
    assert doc["kind"] == "pdf"
    assert doc["pageCount"] == 1
    assert doc["ocrPages"] == [1], "An image-only PDF must use OCR"
    assert len(doc["text"].strip()) > 100

    result = processor.heuristic_extract(doc, "scan-factuur.pdf", {})
    assert_core_fields(result, number="SCAN-2026-2001")


def test_multi_page_pdf_reads_all_pages():
    lines = invoice_lines(number="MULTI-2026-3001") + [
        "Pagina twee bevat de verdere specificatie van de geleverde werkzaamheden.",
        "Extra omschrijving: implementatie, controle en oplevering.",
    ]
    raw = vector_pdf(lines, pages=2)
    started = time.perf_counter()
    doc = processor.extract_document("meer-pagina-factuur.pdf", "application/pdf", raw)
    elapsed_ms = (time.perf_counter() - started) * 1000
    print(f"PERF multipage_digital_pdf_ms={elapsed_ms:.2f} bytes={len(raw)} pages={doc.get('pageCount')}")
    assert doc["pageCount"] == 2
    assert "--- PAGE 1 ---" in doc["text"]
    assert "--- PAGE 2 ---" in doc["text"]
    assert "MULTI-2026-3001" in doc["text"]
    assert "Extra omschrijving" in doc["text"]


def test_multiple_vat_rates_are_preserved_for_review():
    lines = [
        "FACTUUR",
        "Leverancier: Voorbeeld Leverancier BV",
        "Factuurnummer: MIX-2026-4001",
        "Factuurdatum: 28-09-2026",
        "Omschrijving: Gemengde levering",
        "Product A belast tegen 9 procent.",
        "Product B belast tegen 21 procent.",
        "BTW 9% belastbaar EUR 100,00 BTW EUR 9,00",
        "BTW 21% belastbaar EUR 100,00 BTW EUR 21,00",
        "Subtotaal: EUR 200,00",
        "Totaal BTW: EUR 30,00",
        "Totaal te betalen: EUR 230,00",
    ]
    raw = vector_pdf(lines)
    doc = processor.extract_document("gemengde-btw.pdf", "application/pdf", raw)
    result = processor.heuristic_extract(doc, "gemengde-btw.pdf", {})
    rates = {round(float(v.rate)) for v in result.amounts.vatLines}
    assert 9 in rates and 21 in rates
    assert result.amounts.total is not None and abs(result.amounts.total - 230.0) < 0.02


def test_corrupt_pdf_fails_loudly():
    try:
        processor.extract_document("corrupt.pdf", "application/pdf", b"%PDF-corrupt-not-a-real-document")
    except Exception:
        return
    raise AssertionError("A corrupt PDF must fail instead of returning an empty successful extraction")


if __name__ == "__main__":
    tests = [
        test_trusted_origin_contract,
        test_digital_pdf_prefers_embedded_text,
        test_pdf_mime_detection_without_pdf_extension,
        test_scanned_pdf_uses_ocr_and_extracts_financial_core,
        test_multi_page_pdf_reads_all_pages,
        test_multiple_vat_rates_are_preserved_for_review,
        test_corrupt_pdf_fails_loudly,
    ]
    for test in tests:
        test()
        print(f"PASS {test.__name__}")
    print("PDF document processor regression: PASS")
