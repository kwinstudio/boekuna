import io
import json
import math
import statistics
import sys
import time
from pathlib import Path

try:
    import resource
except ImportError:
    resource = None

import fitz
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
PROCESSOR_DIR = ROOT / "kwinest" / "docprocessor"
sys.path.insert(0, str(PROCESSOR_DIR))

import app as processor  # noqa: E402


FIELDS = ("supplier", "date", "invoice_number", "net", "vat", "gross", "vat_rate", "mixed_vat")


def rss_mb():
    if resource is None:
        return None
    raw = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return raw / (1024 * 1024) if sys.platform == "darwin" else raw / 1024


def font(size=46, bold=False):
    names = ["DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"]
    for name in names:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default()


def encode_image(lines, *, fmt="JPEG", size=(1500, 1800), dark=False, skew=0, blur=0, long=False):
    if long:
        size = (1100, 5200)
    image = Image.new("RGB", size, "white")
    draw = ImageDraw.Draw(image)
    body = font(48 if not long else 43)
    heading = font(60 if not long else 54, True)
    y = 80
    if long:
        # Keep the important financial block at the bottom so a whole-image downscale
        # is measurably punished by the baseline benchmark.
        top = lines[:-4]
        bottom = lines[-4:]
        for idx, line in enumerate(top):
            draw.text((70, y), line, fill="black", font=heading if idx == 0 else body)
            y += 118
        while y < 4100:
            draw.text((70, y), f"Productregel {int(y/100):02d}  EUR 1,00", fill="black", font=body)
            y += 112
        for line in bottom:
            draw.text((70, y), line, fill="black", font=body)
            y += 125
    else:
        for idx, line in enumerate(lines):
            draw.text((80, y), line, fill="black", font=heading if idx == 0 else body)
            y += 118

    if dark:
        image = ImageEnhance.Brightness(image).enhance(0.34)
    if blur:
        image = image.filter(ImageFilter.GaussianBlur(radius=blur))
    if skew:
        rotated = image.rotate(skew, resample=Image.Resampling.BICUBIC, expand=True, fillcolor="white")
        image.close()
        image = rotated

    out = io.BytesIO()
    save_kwargs = {"quality": 91} if fmt.upper() in {"JPEG", "JPG"} else {}
    image.save(out, format=fmt, **save_kwargs)
    image.close()
    return out.getvalue()


def vector_pdf_pages(page_sets):
    doc = fitz.open()
    for page_lines in page_sets:
        page = doc.new_page(width=595, height=842)
        y = 55
        for line in page_lines:
            page.insert_text((42, y), line, fontsize=11)
            y += 29
        filler = "Boekuna synthetische benchmarktekst voor betrouwbare digitale extractie zonder onnodige OCR."
        while y < 620:
            page.insert_text((42, y), filler, fontsize=8)
            y += 22
    raw = doc.tobytes()
    doc.close()
    return raw


def scanned_pdf(lines):
    png = encode_image(lines, fmt="PNG", size=(1800, 2400))
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    page.insert_image(page.rect, stream=png)
    raw = doc.tobytes()
    doc.close()
    return raw


def invoice_lines(number="INV-2026-1001", supplier="Voorbeeld Leverancier BV", gross="121,00"):
    return [
        "FACTUUR",
        f"Leverancier: {supplier}",
        f"Factuurnummer: {number}",
        "Factuurdatum: 03-10-2026",
        "Vervaldatum: 31-10-2026",
        "Omschrijving: Zakelijke dienstverlening",
        "Subtotaal: EUR 100,00",
        "BTW 21%: EUR 21,00",
        f"Totaal te betalen: EUR {gross}",
    ]


def receipt_lines(name, rate=21, net="100,00", vat="21,00", gross="121,00"):
    return [
        name,
        "KASSABON",
        "Datum 03-10-2026",
        "Zakelijke aankoop",
        f"Subtotaal EUR {net}",
        f"BTW {rate}% EUR {vat}",
        f"Totaal EUR {gross}",
        f"PIN EUR {gross}",
    ]


def cases():
    clear_receipt = receipt_lines("BOEKUNA QA SUPERMARKT")
    restaurant = receipt_lines("BOEKUNA QA RESTAURANT", rate=9, vat="9,00", gross="109,00")
    tank = receipt_lines("BOEKUNA QA TANKSTATION")
    formal = invoice_lines(number="F20261003-01", supplier="BOEKUNA QA SOFTWARE BV")
    digital = invoice_lines(number="INV-2026-DIGITAL", supplier="BOEKUNA QA DIGITAL BV")
    multi_page_1 = [
        "FACTUUR",
        "Leverancier: BOEKUNA QA MULTIPAGE BV",
        "Factuurnummer: INV-2026-MULTI",
        "Factuurdatum: 03-10-2026",
        "Vervaldatum: 31-10-2026",
        "Omschrijving: Meerpagina dienstverlening",
    ]
    multi_page_2 = [
        "BTW-overzicht en totalen",
        "Subtotaal: EUR 100,00",
        "BTW 21%: EUR 21,00",
        "Totaal te betalen: EUR 121,00",
    ]
    mixed = [
        "FACTUUR",
        "Leverancier: BOEKUNA QA GEMENGD BV",
        "Factuurnummer: MIX-2026-1003",
        "Factuurdatum: 03-10-2026",
        "Omschrijving: Gemengde levering",
        "BTW 9% belastbaar EUR 100,00 BTW EUR 9,00",
        "BTW 21% belastbaar EUR 50,00 BTW EUR 10,50",
        "Subtotaal: EUR 150,00",
        "Totaal BTW: EUR 19,50",
        "Totaal te betalen: EUR 169,50",
    ]

    common21 = {"date":"2026-10-03","net":100.0,"vat":21.0,"gross":121.0,"vat_rate":21.0,"mixed_vat":False}
    return [
        {
            "id":"receipt-clear-jpeg","name":"receipt-clear.jpg","mime":"image/jpeg",
            "raw":encode_image(clear_receipt, fmt="JPEG"),
            "expected":{"supplier":"BOEKUNA QA SUPERMARKT", **common21},
        },
        {
            "id":"receipt-dark-jpeg","name":"receipt-dark.jpg","mime":"image/jpeg",
            "raw":encode_image(clear_receipt, fmt="JPEG", dark=True),
            "expected":{"supplier":"BOEKUNA QA SUPERMARKT", **common21},
        },
        {
            "id":"restaurant-skew-png","name":"restaurant-skew.png","mime":"image/png",
            "raw":encode_image(restaurant, fmt="PNG", skew=4.2),
            "expected":{"supplier":"BOEKUNA QA RESTAURANT","date":"2026-10-03","net":100.0,"vat":9.0,"gross":109.0,"vat_rate":9.0,"mixed_vat":False},
        },
        {
            "id":"tank-blur-jpeg","name":"tank-blur.jpg","mime":"image/jpeg",
            "raw":encode_image(tank, fmt="JPEG", blur=1.35),
            "expected":{"supplier":"BOEKUNA QA TANKSTATION", **common21},
        },
        {
            "id":"long-receipt-jpeg","name":"long-receipt.jpg","mime":"image/jpeg",
            "raw":encode_image(clear_receipt, fmt="JPEG", long=True),
            "expected":{"supplier":"BOEKUNA QA SUPERMARKT", **common21},
        },
        {
            "id":"invoice-photo-png","name":"invoice-photo.png","mime":"image/png",
            "raw":encode_image(formal, fmt="PNG", size=(1700, 2100)),
            "expected":{"supplier":"BOEKUNA QA SOFTWARE BV","invoice_number":"F20261003-01", **common21},
        },
        {
            "id":"screenshot-png","name":"screenshot.png","mime":"image/png",
            "raw":encode_image(invoice_lines(number="001234", supplier="BOEKUNA QA SCREENSHOT BV"), fmt="PNG", size=(1400, 1600)),
            "expected":{"supplier":"BOEKUNA QA SCREENSHOT BV","invoice_number":"001234", **common21},
        },
        {
            "id":"digital-pdf","name":"digital.pdf","mime":"application/pdf",
            "raw":vector_pdf_pages([digital]),
            "expected":{"supplier":"BOEKUNA QA DIGITAL BV","invoice_number":"INV-2026-DIGITAL", **common21},
            "expect_no_ocr":True,
        },
        {
            "id":"scan-pdf","name":"scan.pdf","mime":"application/pdf",
            "raw":scanned_pdf(invoice_lines(number="SCAN-2026-1003", supplier="BOEKUNA QA SCAN BV")),
            "expected":{"supplier":"BOEKUNA QA SCAN BV","invoice_number":"SCAN-2026-1003", **common21},
        },
        {
            "id":"multipage-pdf","name":"multipage.pdf","mime":"application/pdf",
            "raw":vector_pdf_pages([multi_page_1, multi_page_2]),
            "expected":{"supplier":"BOEKUNA QA MULTIPAGE BV","invoice_number":"INV-2026-MULTI", **common21},
            "expect_no_ocr":True,
        },
        {
            "id":"mixed-vat-pdf","name":"mixed.pdf","mime":"application/pdf",
            "raw":vector_pdf_pages([mixed]),
            "expected":{"supplier":"BOEKUNA QA GEMENGD BV","invoice_number":"MIX-2026-1003","date":"2026-10-03","net":150.0,"vat":19.5,"gross":169.5,"mixed_vat":True},
            "expect_no_ocr":True,
        },
    ]


def norm_supplier(value):
    text = "".join(ch.lower() for ch in str(value or "") if ch.isalnum())
    for suffix in ("beslotenvennootschap", "bv", "b.v"):
        if text.endswith(suffix.replace(".", "")):
            text = text[: -len(suffix.replace(".", ""))]
    return text


def cents(value):
    try:
        return int(round(float(value) * 100))
    except (TypeError, ValueError):
        return None


def actual_fields(result):
    rates = sorted({round(float(v.rate), 4) for v in result.amounts.vatLines if v.rate is not None})
    deriv = (result.processing or {}).get("amountDerivation") or {}
    return {
        "supplier": result.supplier.name,
        "date": result.invoice.invoiceDate,
        "invoice_number": result.invoice.invoiceNumber,
        "net": result.amounts.subtotal,
        "vat": result.amounts.vatTotal,
        "gross": result.amounts.total,
        "vat_rate": rates[0] if len(rates) == 1 else None,
        "mixed_vat": bool(deriv.get("mixedRates") or len(rates) > 1),
    }


def field_confidence(result, field):
    key = {
        "supplier":"supplierName","date":"invoiceDate","invoice_number":"invoiceNumber",
        "net":"subtotal","vat":"vatTotal","gross":"total","vat_rate":"vatLines","mixed_vat":"vatLines",
    }[field]
    return float((result.confidence or {}).get(key) or 0)


def classify(field, expected, actual, confidence):
    if actual is None or actual == "":
        return "missing"
    if field == "supplier":
        if str(actual).strip() == str(expected).strip():
            return "exact"
        if norm_supplier(actual) == norm_supplier(expected):
            return "normalized"
        return "ambiguous" if confidence < 0.6 else "wrong"
    if field in {"net","vat","gross","vat_rate"}:
        if cents(actual) == cents(expected):
            return "exact"
        return "ambiguous" if confidence < 0.6 else "wrong"
    if field == "mixed_vat":
        return "exact" if bool(actual) is bool(expected) else ("ambiguous" if confidence < 0.6 else "wrong")
    if str(actual) == str(expected):
        return "exact"
    return "ambiguous" if confidence < 0.6 else "wrong"


def percentile(values, p):
    if not values:
        return None
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    index = (len(ordered)-1) * p
    lo = math.floor(index)
    hi = math.ceil(index)
    if lo == hi:
        return ordered[lo]
    return ordered[lo] + (ordered[hi]-ordered[lo]) * (index-lo)


def run():
    before_rss = rss_mb()
    records = []
    field_counts = {f:{"exact":0,"normalized":0,"missing":0,"wrong":0,"ambiguous":0,"applicable":0} for f in FIELDS}

    for case in cases():
        started = time.perf_counter()
        error = None
        result = None
        doc = None
        try:
            doc = processor.extract_document(case["name"], case["mime"], case["raw"])
            result = processor.heuristic_extract(doc, case["name"], {})
        except Exception as exc:
            error = f"{type(exc).__name__}:{getattr(exc, 'code', '')}"
        elapsed = (time.perf_counter()-started)*1000
        statuses = {}
        corrections = 0
        if result is None:
            for field in case["expected"]:
                if field in FIELDS:
                    statuses[field] = "missing"
                    field_counts[field]["missing"] += 1
                    field_counts[field]["applicable"] += 1
                    corrections += 1
            actual = {}
        else:
            actual = actual_fields(result)
            for field, expected in case["expected"].items():
                if field not in FIELDS:
                    continue
                status = classify(field, expected, actual.get(field), field_confidence(result, field))
                statuses[field] = status
                field_counts[field][status] += 1
                field_counts[field]["applicable"] += 1
                if status not in {"exact","normalized"}:
                    corrections += 1

        no_ocr_ok = not case.get("expect_no_ocr") or not bool((doc or {}).get("ocrPages"))
        records.append({
            "id":case["id"],
            "duration_ms":round(elapsed,2),
            "error":error,
            "statuses":statuses,
            "corrections":corrections,
            "ocr_pages":len((doc or {}).get("ocrPages") or []),
            "digital_no_ocr_ok":no_ocr_ok,
            "warnings":len(result.warnings) if result is not None else None,
        })

    after_rss = rss_mb()
    accuracies = {}
    for field, stats in field_counts.items():
        denom = stats["applicable"]
        accuracies[field] = round((stats["exact"]+stats["normalized"])/denom, 4) if denom else None

    durations = [r["duration_ms"] for r in records]
    corrections = [r["corrections"] for r in records]
    payload = {
        "processor_version":processor.PROCESSOR_VERSION,
        "processor_revision":processor.PROCESSOR_REVISION,
        "ocr_stack":processor.ocr_stack_info(),
        "documents":len(records),
        "field_accuracy":accuracies,
        "field_status":field_counts,
        "corrections_per_document":round(statistics.mean(corrections),3),
        "documents_zero_corrections":sum(1 for x in corrections if x == 0),
        "p50_ms":round(percentile(durations,.50),2),
        "p95_ms":round(percentile(durations,.95),2),
        "rss_before_mb":round(before_rss,2) if before_rss is not None else None,
        "rss_after_mb":round(after_rss,2) if after_rss is not None else None,
        "digital_pdf_no_ocr":all(r["digital_no_ocr_ok"] for r in records),
        "records":records,
    }
    print("SCAN_BENCHMARK_JSON=" + json.dumps(payload, sort_keys=True))
    assert payload["documents"] >= 10
    assert payload["digital_pdf_no_ocr"] is True
    return payload


if __name__ == "__main__":
    run()
