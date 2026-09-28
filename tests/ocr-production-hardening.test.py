import io
import json
import re
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from fastapi.responses import JSONResponse

ROOT = Path(__file__).resolve().parents[1]
PROCESSOR_DIR = ROOT / "kwinest" / "docprocessor"
sys.path.insert(0, str(PROCESSOR_DIR))

import app as processor  # noqa: E402


def _png_bytes(size=(64, 64)):
    img = Image.new("RGB", size, "white")
    out = io.BytesIO()
    img.save(out, format="PNG")
    return out.getvalue()


def test_required_stack_is_pinned_and_legacy_runtime_is_absent():
    requirements = (PROCESSOR_DIR / "requirements.txt").read_text(encoding="utf-8")
    source = (PROCESSOR_DIR / "app.py").read_text(encoding="utf-8")
    assert "rapidocr==3.9.2" in requirements
    assert "onnxruntime==1.30.0" in requirements
    assert "numpy==2.5.3" in requirements
    assert "rapidocr-onnxruntime" not in requirements
    assert "rapidocr_onnxruntime" not in source


def test_runtime_metadata_matches_pinned_stack():
    assert processor.RAPIDOCR_GENERATION == "v3"
    assert processor.RAPIDOCR_VERSION == "3.9.2"
    assert processor.ONNXRUNTIME_VERSION == "1.30.0"
    stack = processor.ocr_stack_info()
    assert stack["engine"] == "RapidOCR"
    assert stack["version"] == "3.9.2"
    assert stack["model"] == "PP-OCRv6-small"
    assert stack["runtime"] == {"engine": "ONNX Runtime", "version": "1.30.0"}


class FakeOutput:
    def __init__(self, boxes, txts, scores):
        self.boxes = boxes
        self.txts = txts
        self.scores = scores


def test_v3_adapter_maps_boxes_text_and_confidence_in_reading_order():
    output = FakeOutput(
        np.asarray([
            [[10, 90], [100, 90], [100, 120], [10, 120]],
            [[10, 10], [100, 10], [100, 40], [10, 40]],
        ], dtype=float),
        ("Totaal EUR 121,00", "BOEKUNA"),
        (0.91, 0.99),
    )
    rows = processor.ocr_rows(lambda _: output, Image.new("RGB", (200, 140), "white"))
    assert [r["text"] for r in rows] == ["BOEKUNA", "Totaal EUR 121,00"]
    assert rows[0]["confidence"] == 0.99
    assert rows[1]["box"][0] == [10.0, 90.0]


def test_v3_adapter_accepts_empty_result_but_rejects_malformed_contract():
    empty = FakeOutput(None, None, None)
    assert processor.ocr_rows(lambda _: empty, Image.new("RGB", (40, 40), "white")) == []
    malformed = FakeOutput(None, ("text",), None)
    try:
        processor.ocr_rows(lambda _: malformed, Image.new("RGB", (40, 40), "white"))
    except RuntimeError as exc:
        assert "output contract" in str(exc)
    else:
        raise AssertionError("Malformed RapidOCR output must fail explicitly")


def test_ocr_singleton_reuses_one_model_instance():
    old_cls = processor.RapidOCR
    old_engine = processor._OCR_ENGINE
    old_error = processor._OCR_ENGINE_ERROR
    calls = {"count": 0}

    class FakeRapidOCR:
        def __init__(self, params=None):
            calls["count"] += 1
            self.params = params

    try:
        processor.RapidOCR = FakeRapidOCR
        processor._OCR_ENGINE = None
        processor._OCR_ENGINE_ERROR = None
        first = processor.get_ocr_engine()
        second = processor.get_ocr_engine()
        assert first is second
        assert calls["count"] == 1
    finally:
        processor.RapidOCR = old_cls
        processor._OCR_ENGINE = old_engine
        processor._OCR_ENGINE_ERROR = old_error


def test_image_dimension_limit_is_checked_before_ocr():
    raw = _png_bytes((20, 20))
    old_limit = processor.MAX_IMAGE_PIXELS
    try:
        processor.MAX_IMAGE_PIXELS = 100
        try:
            processor.extract_image(raw)
        except processor.BoekunaDocumentError as exc:
            assert exc.code == "DOCUMENT_TOO_LARGE"
            assert exc.status == 413
            assert exc.internal_code == "IMAGE_DIMENSION_LIMIT"
        else:
            raise AssertionError("Oversized image dimensions must be rejected before OCR")
    finally:
        processor.MAX_IMAGE_PIXELS = old_limit


def test_mime_extension_mismatch_is_rejected():
    raw = _png_bytes()
    try:
        processor.extract_document("bon.jpg", "image/png", raw)
    except processor.BoekunaDocumentError as exc:
        assert exc.code == "DOCUMENT_UNSUPPORTED_TYPE"
        assert exc.status == 415
        assert exc.internal_code == "MIME_EXTENSION_MISMATCH"
    else:
        raise AssertionError("MIME/extension mismatch must not reach OCR")


def test_corrupt_image_is_rejected_safely():
    try:
        processor.extract_document("bon.png", "image/png", b"not-a-real-image")
    except processor.BoekunaDocumentError as exc:
        assert exc.code == "DOCUMENT_IMAGE_UNREADABLE"
        assert exc.status == 422
    else:
        raise AssertionError("Corrupt image must fail safely")


def test_supported_raster_decoders_keep_contract_without_running_ocr():
    old_run = processor.run_best_ocr
    processor.run_best_ocr = lambda img: {
        "text": "BOEKUNA TEST BON Totaal EUR 12,10",
        "rows": [{"box": [[0,0],[10,0],[10,10],[0,10]], "text": "BOEKUNA TEST BON", "confidence": 0.99}],
        "confidence": 0.99,
        "variant": "test",
        "qualityScore": 100.0,
        "financialText": "Totaal EUR 12,10",
        "financialFocusUsed": False,
        "financialConfidence": 0.99,
        "engine": "RapidOCR 3 / ONNX",
        "model": "PP-OCRv6-small",
    }
    try:
        for fmt, name, mime in [
            ("JPEG", "bon.jpg", "image/jpeg"),
            ("PNG", "bon.png", "image/png"),
            ("WEBP", "bon.webp", "image/webp"),
        ]:
            img = Image.new("RGB", (320, 180), "white")
            out = io.BytesIO()
            img.save(out, format=fmt)
            doc = processor.extract_document(name, mime, out.getvalue())
            assert doc["kind"] == "image"
            assert doc["ocrPages"] == [1]
            assert doc["ocrModel"] == "PP-OCRv6-small"
    finally:
        processor.run_best_ocr = old_run


def test_health_and_ready_expose_safe_exact_runtime_metadata():
    health = processor.health()
    assert health["ok"] is True
    assert health["service"] == "boekuna-document-processor"
    assert health["version"] == processor.PROCESSOR_VERSION
    assert health["ocr"]["version"] == "3.9.2"
    assert health["ocr"]["model"] == "PP-OCRv6-small"
    assert health["ocr"]["runtime"]["version"] == "1.30.0"
    assert "OPENAI_API_KEY" not in json.dumps(health)

    started = time.perf_counter()
    ready = processor.ready()
    cold_ms = (time.perf_counter() - started) * 1000
    if isinstance(ready, JSONResponse):
        raise AssertionError("OCR readiness failed: " + ready.body.decode("utf-8", errors="replace"))
    assert ready["ok"] is True and ready["ready"] is True
    assert ready["ocr"]["version"] == "3.9.2"

    warm_started = time.perf_counter()
    engine = processor.get_ocr_engine()
    warm_ms = (time.perf_counter() - warm_started) * 1000
    infer_started = time.perf_counter()
    blank_rows = processor.ocr_rows(engine, Image.new("RGB", (640, 360), "white"))
    infer_ms = (time.perf_counter() - infer_started) * 1000
    assert isinstance(blank_rows, list)
    print(f"PERF ocr_cold_ready_ms={cold_ms:.2f} ocr_warm_lookup_ms={warm_ms:.2f} blank_inference_ms={infer_ms:.2f}")


def test_synthetic_receipt_image_runs_real_ppocrv6():
    image = Image.new("RGB", (1500, 1500), "white")
    draw = ImageDraw.Draw(image)
    try:
        font = ImageFont.truetype("DejaVuSans.ttf", 52)
        heading = ImageFont.truetype("DejaVuSans-Bold.ttf", 62)
    except Exception:
        font = ImageFont.load_default()
        heading = font
    lines = [
        ("BOEKUNA QA SUPERMARKT", heading),
        ("KASSABON", heading),
        ("Datum 29-09-2026", font),
        ("Subtotaal EUR 100,00", font),
        ("BTW 21% EUR 21,00", font),
        ("Totaal EUR 121,00", heading),
        ("PIN EUR 121,00", font),
        ("Bedankt voor uw bezoek", font),
    ]
    y = 90
    for line, line_font in lines:
        draw.text((90, y), line, fill="black", font=line_font)
        y += 145

    started = time.perf_counter()
    result = processor.run_best_ocr(image)
    elapsed_ms = (time.perf_counter() - started) * 1000
    text = result["text"]
    assert len(re.sub(r"\s+", "", text)) > 40
    assert "121" in text
    assert result["model"] == "PP-OCRv6-small"
    print(
        "PERF synthetic_receipt_ms="
        f"{elapsed_ms:.2f} confidence={float(result.get('confidence') or 0):.4f} "
        f"chars={len(text)} variant={result.get('variant')}"
    )


if __name__ == "__main__":
    tests = [
        test_required_stack_is_pinned_and_legacy_runtime_is_absent,
        test_runtime_metadata_matches_pinned_stack,
        test_v3_adapter_maps_boxes_text_and_confidence_in_reading_order,
        test_v3_adapter_accepts_empty_result_but_rejects_malformed_contract,
        test_ocr_singleton_reuses_one_model_instance,
        test_image_dimension_limit_is_checked_before_ocr,
        test_mime_extension_mismatch_is_rejected,
        test_corrupt_image_is_rejected_safely,
        test_supported_raster_decoders_keep_contract_without_running_ocr,
        test_health_and_ready_expose_safe_exact_runtime_metadata,
        test_synthetic_receipt_image_runs_real_ppocrv6,
    ]
    for test in tests:
        test()
        print(f"PASS {test.__name__}")
    print("OCR production hardening regression: PASS")
