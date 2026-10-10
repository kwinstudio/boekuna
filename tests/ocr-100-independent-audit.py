#!/usr/bin/env python3
"""Independent synthetic 100-document benchmark on the Render-deployed BOEKUNA revision.

Only generates synthetic documents in memory and invokes the existing production
analyze_document entry point. Does not call production HTTP, touch customers or
change any bookkeeping record. This 100-file corpus is NOT the ZIP uploaded to chat:
that binary ZIP is not accessible from GitHub Actions.
"""
import io
import importlib.util
import json
import os
import statistics
import time
from collections import Counter, defaultdict
from decimal import Decimal, InvalidOperation
from pathlib import Path

import fitz
from PIL import Image, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("boekuna_ocr_28", ROOT / "tests/document-ocr-v5-benchmark.test.py")
v5 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v5)
processor = v5.processor
processor.EXTERNAL_AI_ENABLED = False

FIELDS = ("documentType", "supplier", "invoiceNumber", "invoiceDate", "dueDate",
          "subtotal", "vatAmount", "gross", "vatRate", "vatLines", "mixedRates",
          "currency", "iban", "vatId", "paymentReference", "amountPaid",
          "advancePaid", "amountDue")
MONEY = {"subtotal", "vatAmount", "gross", "amountPaid", "advancePaid", "amountDue"}
COMPANY = {"name": "Demo Ondernemer", "tradeName": "", "kvk": "", "vat": ""}

def cents(x):
    if x is None or x == "":
        return None
    try:
        return int((Decimal(str(x)) * 100).quantize(Decimal("1")))
    except (InvalidOperation, ValueError, TypeError):
        return None

def norm(x):
    return "".join(c for c in str(x or "").casefold() if c.isalnum())

def groups(x):
    rows = []
    for v in (x or []):
        if isinstance(v, dict):
            r = v.get("rate"); a = v.get("vatAmount", v.get("vat"))
            n = v.get("taxableAmount", v.get("net"))
        elif isinstance(v, (list, tuple)):
            r, n, a = (list(v) + [None] * 3)[:3]
        else:
            continue
        if r is not None:
            rows.append((str(Decimal(str(r)).normalize()), cents(n), cents(a)))
    return sorted(rows)

def extract(response):
    d = response.get("data") or response
    a = d.get("amounts") or {}
    s = d.get("supplier") or {}
    i = d.get("invoice") or {}
    lines = a.get("vatLines") or []
    rates = sorted({float(x["rate"]) for x in lines if x.get("rate") is not None})
    deriv = (d.get("processing") or {}).get("amountDerivation") or {}
    routing = (d.get("processing") or {}).get("reviewRouting") or {}
    values = {
        "documentType": d.get("documentType"),
        "supplier": s.get("name"),
        "invoiceNumber": i.get("invoiceNumber"),
        "invoiceDate": i.get("invoiceDate"),
        "dueDate": i.get("dueDate"),
        "subtotal": a.get("subtotal"),
        "vatAmount": a.get("vatTotal"),
        "gross": a.get("total"),
        "vatRate": rates[0] if len(rates) == 1 else None,
        "vatLines": lines,
        "mixedRates": bool(deriv.get("mixedRates") or len(rates)>1),
        "currency": a.get("currency"),
        "iban": s.get("iban"),
        "vatId": s.get("vatNumber"),
        "paymentReference": i.get("paymentReference"),
        "amountPaid": a.get("alreadyPaid"),
        "advancePaid": a.get("advancePayment"),
        "amountDue": a.get("amountDue") if a.get("amountDue") is not None else a.get("outstandingAmount")
    }
    return values, {"mode": routing.get("mode"), "fields": routing.get("fields") or []}

def grade(field, exp, act):
    if field == "invoiceNumber" and exp is None:
        return "CORRECT" if act in (None, "") else "WRONG"
    if exp is None:
        return "SKIP"
    if act is None or act == "":
        return "MISSING"
    if field in MONEY:
        return "CORRECT" if cents(exp) == cents(act) else "WRONG"
    if field == "vatLines":
        return "CORRECT" if groups(exp) == groups(act) else "WRONG"
    if field == "mixedRates":
        return "CORRECT" if bool(exp) == bool(act) else "WRONG"
    if field == "vatRate":
        return "CORRECT" if abs(float(exp)-float(act)) < 0.0001 else "WRONG"
    if field in ("supplier", "iban", "vatId", "paymentReference"):
        return "CORRECT" if norm(exp) == norm(act) else "WRONG"
    return "CORRECT" if str(exp).casefold() == str(act).casefold() else "WRONG"

def make_image_variant(src, index):
    with Image.open(io.BytesIO(src["raw"])) as img:
        im = img.convert("RGB")
    mode = index % 7
    if mode == 1:
        im = im.rotate(1.7, expand=True, fillcolor="white")
    elif mode == 2:
        im = ImageEnhance.Contrast(im).enhance(0.82)
    elif mode == 3:
        im = ImageEnhance.Brightness(im).enhance(0.78)
    elif mode == 4:
        im = im.filter(ImageFilter.GaussianBlur(0.45))
    elif mode == 5:
        im = ImageEnhance.Sharpness(im).enhance(1.45)
    elif mode == 6:
        im = im.rotate(-1.1, expand=True, fillcolor="white")
    out = io.BytesIO()
    im.save(out, format="JPEG", quality=[92,86,74,88,85,81,90][mode])
    im.close()
    return out.getvalue()

def pdf_metadata(raw, title):
    doc = fitz.open(stream=raw, filetype="pdf")
    meta = dict(doc.metadata or {})
    meta["title"] = title
    doc.set_metadata(meta)
    data = doc.tobytes()
    doc.close()
    return data

def image_to_pdf(jpeg):
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    page.insert_image(page.rect, stream=jpeg)
    data = doc.tobytes()
    doc.close()
    return data

def corpus():
    seeds = v5.cases()
    image_seeds = [x for x in seeds if x["kind"] == "image" and x["mime"] in ("image/jpeg","image/png")]
    native_seeds = [x for x in seeds if x["kind"] == "pdf" and x.get("expect_no_ocr")]
    scan_seeds = [x for x in seeds if x["kind"] == "pdf" and not x.get("expect_no_ocr")]
    assert len(image_seeds) >= 10 and len(native_seeds) >= 6 and len(scan_seeds) >= 2
    cases = []
    for k in range(80):
        src = image_seeds[k % len(image_seeds)]
        cases.append({"id": "photo-%03d" % (k+1), "group": "photo", "sourceLayout": src["id"],
                      "raw": make_image_variant(src, k), "name": "foto-%03d.jpg" % k,
                      "mime": "image/jpeg", "expected": src["expected"]})
    for k in range(10):
        src = native_seeds[k % len(native_seeds)]
        cases.append({"id": "digital-%03d" % (k+1), "group": "digital-pdf", "sourceLayout": src["id"],
                      "raw": pdf_metadata(src["raw"], "BOEKUNA audit PDF %d" % k),
                      "name": "factuur-%03d.pdf" % k, "mime": "application/pdf", "expected": src["expected"]})
    for k in range(10):
        if k < len(scan_seeds):
            src = scan_seeds[k]
            raw = pdf_metadata(src["raw"], "BOEKUNA audit scan %d" % k)
        else:
            src = image_seeds[(k*2) % len(image_seeds)]
            raw = image_to_pdf(make_image_variant(src, 100+k))
        cases.append({"id": "scan-%03d" % (k+1), "group": "scanned-pdf", "sourceLayout": src["id"],
                      "raw": raw, "name": "scan-%03d.pdf" % k, "mime": "application/pdf",
                      "expected": src["expected"]})
    assert len(cases) == 100
    return cases

def run():
    records = []
    counts = defaultdict(Counter)
    start_all = time.perf_counter()
    for k, item in enumerate(corpus(), 1):
        started = time.perf_counter()
        err = None
        values = {}
        routing = {}
        try:
            reply = processor.analyze_document(item["raw"], item["name"], item["mime"],
                                               COMPANY, [], allow_external_ai=False)
            values, routing = extract(reply)
        except Exception as exc:
            err = type(exc).__name__ + ": " + str(exc)[:300]
        expected = dict(item["expected"])
        if expected.get("documentType") == "receipt":
            expected["invoiceNumber"] = None
        grades = {}
        for field in FIELDS:
            if field not in expected:
                continue
            result = grade(field, expected[field], values.get(field))
            if result == "SKIP":
                continue
            grades[field] = result
            counts[field][result] += 1
        fully = bool(grades) and not err and all(x == "CORRECT" for x in grades.values())
        ms = round((time.perf_counter()-started)*1000)
        records.append({"id": item["id"], "type": item["group"], "layoutSeed": item["sourceLayout"],
                        "durationMs": ms, "error": err, "fullyCorrect": fully, "grades": grades,
                        "expected": {f: expected.get(f) for f in grades},
                        "actual": {f: values.get(f) for f in grades},
                        "review": routing})
        if k % 10 == 0:
            print("PROGRESS %d/100 | fully correct %d | elapsed %.0fs" %
                  (k, sum(r["fullyCorrect"] for r in records), time.perf_counter()-start_all), flush=True)
    durations = sorted(x["durationMs"] for x in records)
    summary = {
        "deployedSourceCommit": "ef257b0e983cfafcf9cefa47b2797e7407e21423",
        "benchmarkType": "100 GENERATED synthetic acquisitions based on existing V5 test fixtures",
        "notOriginalUploadedZip": True,
        "docs": len(records),
        "fullyCorrect": sum(x["fullyCorrect"] for x in records),
        "needCorrection": sum(not x["fullyCorrect"] for x in records),
        "accuracyPct": round(100*sum(x["fullyCorrect"] for x in records)/len(records),2),
        "runtimeErrors": sum(bool(x["error"]) for x in records),
        "p50Ms": durations[len(durations)//2], "p95Ms": durations[94],
        "perField": {k: dict(v) for k,v in counts.items()},
        "groups": {g: {"docs":sum(x["type"]==g for x in records),
                        "fullyCorrect":sum(x["type"]==g and x["fullyCorrect"] for x in records)}
                   for g in ("photo","digital-pdf","scanned-pdf")},
        "distinctLayoutSeeds": len(set(x["layoutSeed"] for x in records))
    }
    target = Path("artifacts/ocr-100-audit.json")
    target.parent.mkdir(exist_ok=True)
    target.write_text(json.dumps({"summary": summary, "records":records},indent=2,ensure_ascii=False),
                      encoding="utf-8")
    print("BOEKUNA_100_AUDIT_SUMMARY="+json.dumps(summary,ensure_ascii=False),flush=True)

if __name__ == "__main__":
    run()
