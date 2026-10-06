import io
import sys
from pathlib import Path

import fitz
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
PROCESSOR_DIR = ROOT / "kwinest" / "docprocessor"
sys.path.insert(0, str(PROCESSOR_DIR))

import app as processor  # noqa: E402


def _font(size=44, bold=False):
    try:
        return ImageFont.truetype("DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf", size)
    except OSError:
        return ImageFont.load_default()


def _receipt_image():
    lines = [
        "BOEKUNA QA ROTATIE SUPERMARKT",
        "KASSABON",
        "Datum 03-10-2026",
        "Zakelijke aankoop",
        "Subtotaal EUR 100,00",
        "BTW 21% EUR 21,00",
        "Totaal EUR 121,00",
        "PIN EUR 121,00",
    ]
    image = Image.new("RGB", (1500, 1900), "white")
    draw = ImageDraw.Draw(image)
    for idx, line in enumerate(lines):
        draw.text((70, 70 + idx * 105), line, fill="black", font=_font(54 if idx == 0 else 44, idx == 0))
    return image


def _invoice_image():
    lines = [
        "FACTUUR",
        "Leverancier: BOEKUNA QA PERSPECTIEF BV",
        "BTW-nummer: NL123456789B01",
        "IBAN: NL91ABNA0417164300",
        "Factuurnummer: PERS-2026-001",
        "Factuurdatum: 03-10-2026",
        "Vervaldatum: 31-10-2026",
        "Betalingskenmerk: RF18539007547034",
        "Subtotaal: EUR 100,00",
        "BTW 21%: EUR 21,00",
        "Totaal te betalen: EUR 121,00",
    ]
    image = Image.new("RGB", (1500, 1900), "white")
    draw = ImageDraw.Draw(image)
    for idx, line in enumerate(lines):
        draw.text((70, 70 + idx * 105), line, fill="black", font=_font(54 if idx == 0 else 44, idx == 0))
    w, h = image.size
    quad = (int(w * .08), int(h * .03), 0, int(h * .94), int(w * .92), h, w, int(h * .09))
    warped = image.transform((w, h), Image.Transform.QUAD, quad, resample=Image.Resampling.BICUBIC, fillcolor="white")
    image.close()
    overlay = Image.new("RGBA", warped.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    od.polygon([(int(w*.48),0),(w,0),(w,h),(int(w*.64),h)], fill=(0,0,0,115))
    out = Image.alpha_composite(warped.convert("RGBA"), overlay).convert("RGB")
    warped.close()
    overlay.close()
    return out


def _jpeg_bytes(image):
    buf = io.BytesIO()
    image.save(buf, format="JPEG", quality=90)
    image.close()
    return buf.getvalue()


def _run_image(raw, name):
    doc = processor.extract_document(name, "image/jpeg", raw)
    return doc, processor.heuristic_extract(doc, name, {})


def test_orthogonal_rotation_180_preserves_receipt_supplier():
    image = _receipt_image()
    rotated = image.rotate(180, expand=True, fillcolor="white")
    image.close()
    _, result = _run_image(_jpeg_bytes(rotated), "receipt-180.jpg")
    assert result.supplier.name == "BOEKUNA QA ROTATIE SUPERMARKT", result.model_dump()


def test_orthogonal_rotation_270_preserves_receipt_supplier():
    image = _receipt_image()
    rotated = image.rotate(270, expand=True, fillcolor="white")
    image.close()
    _, result = _run_image(_jpeg_bytes(rotated), "receipt-270.jpg")
    assert result.supplier.name == "BOEKUNA QA ROTATIE SUPERMARKT", result.model_dump()


def test_perspective_shadow_targeted_header_recovers_invoice_number():
    doc, result = _run_image(_jpeg_bytes(_invoice_image()), "perspective-shadow.jpg")
    assert (doc.get("processingHints") or {}).get("headerFocusUsed") is True
    assert result.invoice.invoiceNumber == "PERS-2026-001", result.model_dump()


def test_factoring_primary_totals_are_not_replaced_by_fee_percentage():
    text = """FACTUUR
Leverancier: BOEKUNA QA FACTORING BV
Factuurnummer: FAC-2026-1
Factuurdatum: 03-10-2026
Bedrag ex btw EUR 100,00
BTW 21% EUR 21,00
Factuurbedrag EUR 121,00
Factoring 4.8% EUR 121,00 Bedrag ex btw EUR -4,80
BTW 21% EUR -1,01
Factuurbedrag EUR -5,81
Eindbedrag EUR 115,19
"""
    doc = {
        "kind": "pdf",
        "pageCount": 1,
        "pages": [{"page": 1, "text": text, "charCount": len(text), "ocr": False, "tables": []}],
        "text": text,
        "nativeText": text,
        "layout": [],
        "tables": [],
        "ocrPages": [],
        "warnings": [],
    }
    result = processor.heuristic_extract(doc, "factoring.pdf", {})
    assert processor.money_cents(result.amounts.subtotal) == 10000, result.model_dump()
    assert processor.money_cents(result.amounts.vatTotal) == 2100, result.model_dump()
    assert processor.money_cents(result.amounts.total) == 12100, result.model_dump()
    assert len(result.amounts.vatLines) == 1, result.model_dump()
    assert float(result.amounts.vatLines[0].rate) == 21.0, result.model_dump()
    assert result.adjustments and result.adjustments[0].type == "factoring_fee", result.model_dump()
    assert processor.money_cents(result.adjustments[0].total) == 581, result.model_dump()
    assert processor.money_cents(result.amounts.settlementAmount) == 11519, result.model_dump()


if __name__ == "__main__":
    tests = [
        test_orthogonal_rotation_180_preserves_receipt_supplier,
        test_orthogonal_rotation_270_preserves_receipt_supplier,
        test_perspective_shadow_targeted_header_recovers_invoice_number,
        test_factoring_primary_totals_are_not_replaced_by_fee_percentage,
    ]
    failures = []
    for test in tests:
        try:
            test()
            print("PASS", test.__name__)
        except Exception as exc:
            failures.append((test.__name__, type(exc).__name__, str(exc)))
            print("FAIL", test.__name__, type(exc).__name__, str(exc))
    if failures:
        raise AssertionError("OCR V5 RED regressions: " + " | ".join(f"{name}:{kind}" for name, kind, _ in failures))
