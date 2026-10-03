import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
PROCESSOR_DIR = ROOT / "kwinest" / "docprocessor"
sys.path.insert(0, str(PROCESSOR_DIR))

import app as processor  # noqa: E402
from image_quality import inspect_image_quality, quality_advice  # noqa: E402
from receipt_math import derive_single_rate_amounts, detect_vat_rates  # noqa: E402


class FakeOutput:
    def __init__(self, boxes, txts, scores):
        self.boxes = boxes
        self.txts = txts
        self.scores = scores


def _font(size=34):
    try:
        return ImageFont.truetype("DejaVuSans.ttf", size)
    except OSError:
        return ImageFont.load_default()


def test_quality_gate_flags_low_resolution_and_darkness():
    image = Image.new("RGB", (360, 480), (40, 40, 40))
    draw = ImageDraw.Draw(image)
    draw.text((20, 40), "Totaal EUR 121,00", fill=(80, 80, 80), font=_font(24))
    quality = inspect_image_quality(image)
    image.close()
    assert "IMAGE_LOW_RESOLUTION" in quality["flags"], quality
    assert "IMAGE_DARK" in quality["flags"], quality
    assert quality["class"] in {"warning", "poor"}
    advice = " ".join(quality_advice(quality["flags"]))
    assert "licht" in advice.lower() or "dichterbij" in advice.lower()


def test_blur_metric_drops_for_blurred_text():
    sharp = Image.new("RGB", (1000, 700), "white")
    draw = ImageDraw.Draw(sharp)
    for y in range(70, 620, 70):
        draw.text((60, y), "Factuurdatum 03-10-2026 Totaal EUR 121,00", fill="black", font=_font(30))
    blurred = sharp.filter(ImageFilter.GaussianBlur(radius=3.0))
    sharp_q = inspect_image_quality(sharp)
    blur_q = inspect_image_quality(blurred)
    sharp.close(); blurred.close()
    assert blur_q["metrics"]["sharpness"] < sharp_q["metrics"]["sharpness"], (sharp_q, blur_q)


def test_long_receipt_uses_overlapping_tiles_and_preserves_bottom_coordinates():
    image = Image.new("RGB", (800, 3600), "white")
    calls = []

    def fake_engine(arr):
        h, w = arr.shape[:2]
        calls.append((w, h))
        # Every tile emits one row near its bottom. The merge must remap the row
        # into whole-document coordinates rather than stacking all rows at y~h.
        import numpy as np
        boxes = np.asarray([[[20, h-80], [w-20, h-80], [w-20, h-30], [20, h-30]]], dtype=float)
        return FakeOutput(boxes, (f"REGEL-{len(calls)} Totaal EUR 121,00",), (0.98,))

    rows = processor.ocr_tiled_rows(fake_engine, image, tile_height=900, overlap=140)
    image.close()
    assert len(calls) >= 4, calls
    assert len(rows) >= 4, rows
    y_positions = [min(float(p[1]) for p in row["box"]) for row in rows if row.get("box")]
    assert max(y_positions) > 2500, y_positions


def test_explicit_low_confidence_ocr_value_is_not_silently_replaced():
    result = derive_single_rate_amounts(
        rate=21,
        subtotal=100.00,
        vat_total=12.00,
        total=121.00,
        subtotal_conf=.97,
        vat_conf=.40,
        total_conf=.99,
        allow=True,
        allow_replace_explicit=False,
    )
    assert result["vatTotal"] == 12.00, result
    assert result["used"] is False, result
    assert any(x.get("field") == "vatTotal" and x.get("calculated") == 21.0 for x in result["conflicts"]), result


def test_missing_amount_can_still_be_derived_from_two_explicit_amounts():
    guard = processor.enforce_single_rate_consistency(
        rate=21,
        subtotal=100.00,
        vat_total=None,
        total=121.00,
        subtotal_conf=.97,
        vat_conf=0,
        total_conf=.99,
        allow=True,
    )
    assert guard["used"] is True
    assert guard["vatTotal"] == 21.00
    assert guard["reason"] == "derived_missing_amount"


def test_dutch_month_abbreviation_is_parsed():
    assert processor.norm_date("Factuurdatum: 3 okt 2026") == "2026-10-03"
    assert processor.norm_date("Invoice date: 3 Oct 2026") == "2026-10-03"


def test_invoice_number_skips_identifier_labels_on_following_lines():
    doc = {
        "kind":"pdf","pageCount":1,
        "text":"""FACTUUR
Leverancier: Context Test BV
Factuurnummer:
KVK: 87654321
INV-2026-REAL
Factuurdatum: 03-10-2026
Subtotaal EUR 100,00
BTW 21% EUR 21,00
Totaal te betalen EUR 121,00
""",
        "tables":[],"layout":[],"ocrPages":[],"warnings":[],
    }
    result = processor.heuristic_extract(doc, "context-number.pdf", {})
    assert result.invoice.invoiceNumber == "INV-2026-REAL", result.model_dump()


def test_informational_percentage_does_not_create_false_mixed_vat():
    rates = detect_vat_rates([
        "Actie: ontvang 9% korting bij een volgend bezoek",
        "BTW 21% EUR 21,00",
    ])
    assert rates == [21.0], rates


def test_semantic_mixed_vat_description_still_requires_review():
    rates = detect_vat_rates([
        "Omschrijving Product A 9% en Product B 21%",
        "Subtotaal EUR 200,00",
        "Totaal BTW EUR 30,00",
    ])
    assert rates == [9.0, 21.0], rates


def test_eindtotaal_is_a_strong_total_label():
    doc = {
        "kind":"pdf","pageCount":1,
        "text":"""FACTUUR
Leverancier: Eindtotaal Test BV
Factuurnummer: END-2026-1
Factuurdatum: 03-10-2026
Subtotaal EUR 100,00
BTW 21% EUR 21,00
Eindtotaal EUR 121,00
""",
        "tables":[],"layout":[],"ocrPages":[],"warnings":[],
    }
    result = processor.heuristic_extract(doc, "eindtotaal.pdf", {})
    assert processor.money_cents(result.amounts.total) == 12100, result.model_dump()


if __name__ == "__main__":
    tests = [
        test_quality_gate_flags_low_resolution_and_darkness,
        test_blur_metric_drops_for_blurred_text,
        test_long_receipt_uses_overlapping_tiles_and_preserves_bottom_coordinates,
        test_explicit_low_confidence_ocr_value_is_not_silently_replaced,
        test_missing_amount_can_still_be_derived_from_two_explicit_amounts,
        test_dutch_month_abbreviation_is_parsed,
        test_invoice_number_skips_identifier_labels_on_following_lines,
        test_informational_percentage_does_not_create_false_mixed_vat,
        test_semantic_mixed_vat_description_still_requires_review,
        test_eindtotaal_is_a_strong_total_label,
    ]
    for test in tests:
        test()
        print(f"PASS {test.__name__}")
    print("Scan intelligence unit regressions: PASS")
