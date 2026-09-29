import json
import re
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
PROCESSOR_DIR = ROOT / "kwinest" / "docprocessor"
sys.path.insert(0, str(PROCESSOR_DIR))

import app as processor  # noqa: E402
from rapidocr_onnxruntime import RapidOCR as LegacyRapidOCR  # noqa: E402


def canon(value):
    return re.sub(r"[^a-z0-9]", "", str(value).lower())


def evaluate(text):
    c = canon(text)
    fields = {
        "supplier": "stadskoffie" in c,
        "issueDate": "14092026" in c,
        "invoiceNumber": "843719" in c,
        "net": "16833" in c,
        "vat9": "1214" in c,
        "vat21": "702" in c,
        "gross": "18749" in c,
        "iban": "nl00zzzz0000000009" in c,
        "rate9": bool(re.search(r"\b9\s*%", text)),
        "rate21": bool(re.search(r"\b21\s*%", text)),
    }
    fields["mixedRates"] = fields["rate9"] and fields["rate21"]
    return fields


def build_receipt():
    image = Image.new("RGB", (1500, 1800), "white")
    draw = ImageDraw.Draw(image)
    try:
        font = ImageFont.truetype("DejaVuSans.ttf", 52)
        heading = ImageFont.truetype("DejaVuSans-Bold.ttf", 62)
    except Exception:
        font = ImageFont.load_default()
        heading = font
    lines = [
        ("STADSKOFFIE GROOTHANDEL", heading),
        ("FACTUUR 843719", heading),
        ("Datum 14-09-2026", font),
        ("Subtotaal EUR 168,33", font),
        ("BTW 9% EUR 12,14", font),
        ("BTW 21% EUR 7,02", font),
        ("Totaal EUR 187,49", heading),
        ("IBAN NL00ZZZZ0000000009", font),
    ]
    y = 100
    for line, line_font in lines:
        draw.text((90, y), line, fill="black", font=line_font)
        y += 175
    return image


image = build_receipt()
prepared = processor.prepare_ocr_image(image)

modern_started = time.perf_counter()
modern = processor.run_best_ocr(image)
modern_ms = (time.perf_counter() - modern_started) * 1000
modern_text = modern["text"]
modern_fields = evaluate(modern_text)

legacy = LegacyRapidOCR()
legacy_started = time.perf_counter()
legacy_result, _ = legacy(np.asarray(prepared))
legacy_ms = (time.perf_counter() - legacy_started) * 1000
legacy_rows = []
for row in legacy_result or []:
    if isinstance(row, (list, tuple)) and len(row) >= 3:
        legacy_rows.append((str(row[1]), float(row[2])))
legacy_text = "\n".join(x[0] for x in legacy_rows)
legacy_fields = evaluate(legacy_text)

modern_hits = sum(bool(v) for v in modern_fields.values())
legacy_hits = sum(bool(v) for v in legacy_fields.values())
modern_conf = float(modern.get("confidence") or 0)
legacy_conf = sum(x[1] for x in legacy_rows) / len(legacy_rows) if legacy_rows else 0.0

result = {
    "fixture": "synthetic-dutch-mixed-vat-receipt",
    "legacy": {
        "engine": "rapidocr-onnxruntime 1.4.4",
        "timeMs": round(legacy_ms, 2),
        "confidence": round(legacy_conf, 4),
        "criticalFieldHits": legacy_hits,
        "fields": legacy_fields,
    },
    "modern": {
        "engine": "rapidocr 3.9.2 / PP-OCRv6-small / onnxruntime 1.30.0",
        "timeMs": round(modern_ms, 2),
        "confidence": round(modern_conf, 4),
        "criticalFieldHits": modern_hits,
        "fields": modern_fields,
    },
}
print("OCR_AB_BENCHMARK", json.dumps(result, sort_keys=True))
assert modern_fields["supplier"]
assert modern_fields["issueDate"]
assert modern_fields["gross"]
assert modern_fields["mixedRates"]
assert modern_hits >= legacy_hits, result
print("OCR A/B benchmark: PASS")

prepared.close()
image.close()
