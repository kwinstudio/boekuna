#!/usr/bin/env python3
"""
BOEKUNA Qwen3-VL local second-check benchmark.

Benchmark-only. This file does not alter production inference or bookkeeping.
It compares the current deterministic processor (A) with a local Qwen3-VL
semantic verifier (B) and records raw verifier mistakes separately from safely
accepted corrections.
"""
from __future__ import annotations

import argparse
import base64
import importlib.util
import io
import json
import math
import os
import statistics
import sys
import threading
import time
from copy import deepcopy
from pathlib import Path
from typing import Any

import fitz
import psutil
import requests
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
PROCESSOR_DIR = ROOT / "kwinest" / "docprocessor"
sys.path.insert(0, str(PROCESSOR_DIR))
import app as processor  # noqa: E402

BASE_BENCH_PATH = ROOT / "tests" / "document-scan-intelligence-benchmark.test.py"
spec = importlib.util.spec_from_file_location("boekuna_scan_bench", BASE_BENCH_PATH)
scan_bench = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(scan_bench)

MODEL_ID = "Qwen/Qwen3-VL-2B-Instruct-GGUF:Q4_K_M"
FIELDS = (
    "documentType", "supplier", "invoiceNumber", "invoiceDate", "dueDate", "currency",
    "subtotal", "vatTotal", "gross", "vatRate", "vatLines", "mixedRates",
    "iban", "bic", "vatId", "amountPaid", "advancePaid", "amountDue", "paymentReference",
    "factoringFeeTotal", "payoutAmount",
)
MONEY_FIELDS = {"subtotal", "vatTotal", "gross", "amountPaid", "advancePaid", "amountDue", "factoringFeeTotal", "payoutAmount"}
BOOL_FIELDS = {"mixedRates"}
RATE_FIELDS = {"vatRate"}
HIGH_CONF = 0.85
VERIFIER_ACCEPT = 0.85


def cents(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
        d = Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        return int(d * 100)
    except (InvalidOperation, ValueError, TypeError):
        return None


def norm_text(value: Any) -> str:
    return " ".join(
        "".join(ch.lower() if ch.isalnum() else " " for ch in str(value or "")).split()
    )


def norm_date(value: Any) -> str:
    return str(value or "").strip()


def normalize_vat_lines(value: Any) -> list[dict[str, Any]] | None:
    if not isinstance(value, list):
        return None
    out = []
    for row in value:
        if not isinstance(row, dict):
            return None
        rate = row.get("rate")
        vat = row.get("vatAmount")
        taxable = row.get("taxableAmount")
        try:
            nr = round(float(rate), 4)
        except Exception:
            return None
        out.append({
            "rate": nr,
            "taxableAmount": None if taxable is None else cents(taxable),
            "vatAmount": None if vat is None else cents(vat),
        })
    return sorted(out, key=lambda x: (x["rate"], x["taxableAmount"] or -1, x["vatAmount"] or -1))


def status(field: str, value: Any, truth: Any) -> str:
    missing = value is None or value == "" or (isinstance(value, list) and not value)
    truth_missing = truth is None or truth == "" or (isinstance(truth, list) and not truth)
    if missing and not truth_missing:
        return "MISSING"
    if missing and truth_missing:
        return "EXACT"
    if field in MONEY_FIELDS:
        return "EXACT" if cents(value) == cents(truth) else "WRONG"
    if field in RATE_FIELDS:
        try:
            return "EXACT" if round(float(value), 4) == round(float(truth), 4) else "WRONG"
        except Exception:
            return "WRONG"
    if field in BOOL_FIELDS:
        return "EXACT" if bool(value) is bool(truth) else "WRONG"
    if field == "vatLines":
        return "EXACT" if normalize_vat_lines(value) == normalize_vat_lines(truth) else "WRONG"
    if field in {"invoiceDate", "dueDate"}:
        return "EXACT" if norm_date(value) == norm_date(truth) else "WRONG"
    if str(value or "").strip() == str(truth or "").strip():
        return "EXACT"
    return "NORMALIZED" if norm_text(value) == norm_text(truth) and norm_text(truth) else "WRONG"


def single_vat_rate(result) -> float | None:
    rates = sorted({round(float(x.rate), 4) for x in result.amounts.vatLines if x.rate is not None})
    return rates[0] if len(rates) == 1 else None


def parser_fields(result) -> dict[str, Any]:
    deriv = (result.processing or {}).get("amountDerivation") or {}
    rates = list(result.amounts.vatLines or [])
    return {
        "documentType": result.documentType,
        "supplier": result.supplier.name,
        "invoiceNumber": result.invoice.invoiceNumber,
        "invoiceDate": result.invoice.invoiceDate,
        "dueDate": result.invoice.dueDate,
        "currency": result.amounts.currency,
        "subtotal": result.amounts.subtotal,
        "vatTotal": result.amounts.vatTotal,
        "gross": result.amounts.total,
        "vatRate": single_vat_rate(result),
        "vatLines": [
            {"rate": x.rate, "taxableAmount": x.taxableAmount, "vatAmount": x.vatAmount}
            for x in rates
        ],
        "mixedRates": bool(deriv.get("mixedRates") or len({x.rate for x in rates}) > 1),
        "iban": result.supplier.iban,
        # BIC is deliberately included in metrics even though the current
        # ExtractionResult schema does not yet expose it.
        "bic": None,
        "vatId": result.supplier.vatNumber,
        "amountPaid": result.amounts.alreadyPaid,
        "advancePaid": result.amounts.advancePayment,
        "amountDue": result.amounts.amountDue if result.amounts.amountDue is not None else result.amounts.outstandingAmount,
        "paymentReference": result.invoice.paymentReference,
        "factoringFeeTotal": next((x.total for x in (result.adjustments or []) if getattr(x, "type", "") == "factoring_fee"), None),
        "payoutAmount": result.amounts.settlementAmount,
    }


def confidence_for(result, field: str) -> float:
    key = {
        "supplier": "supplierName", "invoiceNumber": "invoiceNumber",
        "invoiceDate": "invoiceDate", "dueDate": "dueDate",
        "subtotal": "subtotal", "vatTotal": "vatTotal", "gross": "total",
        "vatRate": "vatLines", "vatLines": "vatLines", "mixedRates": "vatLines",
        "iban": "iban", "vatId": "vatNumber", "paymentReference": "paymentReference",
    }.get(field, field)
    try:
        return float((result.confidence or {}).get(key) or 0.0)
    except Exception:
        return 0.0


def financial_issues(values: dict[str, Any]) -> list[str]:
    issues = []
    net, vat, gross = cents(values.get("subtotal")), cents(values.get("vatTotal")), cents(values.get("gross"))
    if None not in (net, vat, gross) and net + vat != gross:
        issues.append("subtotal_plus_vat")
    lines = normalize_vat_lines(values.get("vatLines"))
    if values.get("mixedRates") is True and (not lines or len(lines) < 2):
        issues.append("mixed_vat_lines_missing")
    if lines and vat is not None:
        vals = [x["vatAmount"] for x in lines]
        if any(x is None for x in vals) or sum(vals) != vat:
            issues.append("vat_lines_sum")
    amount_paid = cents(values.get("amountPaid"))
    advance = cents(values.get("advancePaid"))
    due = cents(values.get("amountDue"))
    if gross is not None and due is not None and (amount_paid is not None or advance is not None):
        if gross - (amount_paid or 0) - (advance or 0) != due:
            issues.append("amount_due")
    fee = cents(values.get("factoringFeeTotal"))
    payout = cents(values.get("payoutAmount"))
    if gross is not None and fee is not None and payout is not None and gross - fee != payout:
        issues.append("factoring_payout")
    return issues


def parse_proposal_value(field: str, raw: Any) -> tuple[Any, str | None]:
    if raw is None:
        return None, "empty"
    text = str(raw).strip()
    if not text:
        return None, "empty"
    if field in MONEY_FIELDS or field in RATE_FIELDS:
        try:
            return float(text.replace(",", ".")), None
        except Exception:
            return None, "parse"
    if field in BOOL_FIELDS:
        low = text.lower()
        if low in {"1", "true", "yes", "ja"}:
            return True, None
        if low in {"0", "false", "no", "nee"}:
            return False, None
        return None, "parse"
    if field == "vatLines":
        try:
            value = json.loads(text)
        except Exception:
            return None, "parse"
        return (value, None) if isinstance(value, list) else (None, "schema")
    return text, None


def safe_accept(
    base: dict[str, Any],
    proposals: list[dict[str, Any]],
    parser_confidence: dict[str, float],
    protected_fields: set[str] | None = None,
) -> tuple[dict[str, Any], list[str]]:
    """
    Production-safe benchmark semantics.

    The current processor does not expose a complete candidate list for every
    field. Therefore a verifier disagreement is NEVER auto-promoted into a
    bookkeeping value here. Qwen may agree, disagree or be uncertain; a
    disagreement can route human review and its alternative is measured, but
    the deterministic parser value remains the stored candidate unless BOEKUNA
    itself later exposes and validates the same candidate.
    """
    out = deepcopy(base)
    rejected = []
    protected_fields = protected_fields or set()
    for p in proposals:
        field = p.get("field")
        if field not in FIELDS or p.get("verdict") != "disagree":
            continue
        try:
            conf = float(p.get("confidence") or 0)
        except Exception:
            conf = 0
        if conf < VERIFIER_ACCEPT:
            rejected.append(field + ":verifier_low_confidence")
            continue
        if field in protected_fields:
            rejected.append(field + ":user_confirmed")
            continue
        if out.get(field) in (None, ""):
            rejected.append(field + ":ai_only_suggestion")
            continue
        if parser_confidence.get(field, 0.0) >= HIGH_CONF:
            rejected.append(field + ":high_conf_parser")
            continue
        # No complete parser-candidate set exists for this field, so the
        # alternative remains review evidence only.
        rejected.append(field + ":review_only_no_parser_candidate")
    return out, rejected


def should_verify(result, values: dict[str, Any]) -> tuple[bool, list[str]]:
    reasons = []
    if result.documentType == "other":
        reasons.append("document_type")
    for field in ("supplier", "invoiceNumber", "invoiceDate", "subtotal", "vatTotal", "gross", "vatLines"):
        if confidence_for(result, field) < HIGH_CONF:
            reasons.append("confidence:" + field)
    if financial_issues(values):
        reasons.append("financial")
    quality = ((result.processing or {}).get("imageQuality") or {})
    if quality.get("class") not in (None, "", "good"):
        reasons.append("image_quality")
    if result.warnings:
        reasons.append("warnings")
    return bool(reasons), sorted(set(reasons))


def font(size=42, bold=False):
    for name in ("DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf",):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default()


def image_bytes(lines: list[str], *, rotate=0, blur=0, dark=1.0, size=(1500, 1900)) -> bytes:
    img = Image.new("RGB", size, "white")
    draw = ImageDraw.Draw(img)
    y = 65
    for i, line in enumerate(lines):
        draw.text((65, y), line, fill="black", font=font(48 if i else 58, i == 0))
        y += 105
    if blur:
        img = img.filter(ImageFilter.GaussianBlur(blur))
    if dark != 1.0:
        img = ImageEnhance.Brightness(img).enhance(dark)
    if rotate:
        img = img.rotate(rotate, expand=True, fillcolor="white")
    buf = io.BytesIO(); img.save(buf, "JPEG", quality=92); img.close()
    return buf.getvalue()


def special_cases() -> list[dict[str, Any]]:
    vpdf = scan_bench.vector_pdf_pages
    def pdf(id_, lines, truth):
        return {"id": id_, "name": id_ + ".pdf", "mime": "application/pdf", "raw": vpdf([lines]), "truth": truth}
    def jpg(id_, lines, truth, **kw):
        return {"id": id_, "name": id_ + ".jpg", "mime": "image/jpeg", "raw": image_bytes(lines, **kw), "truth": truth}

    cases = []
    cases.append(pdf("zero-vat", [
        "FACTUUR","Leverancier: BOEKUNA ZERO BV","Factuurnummer: ZERO-100","Factuurdatum: 03-10-2026",
        "Subtotaal EUR 100,00","BTW 0% EUR 0,00","Totaal EUR 100,00"
    ], {"documentType":"purchase_invoice","supplier":"BOEKUNA ZERO BV","invoiceNumber":"ZERO-100","invoiceDate":"2026-10-03","currency":"EUR","subtotal":100,"vatTotal":0,"gross":100,"vatRate":0,"mixedRates":False}))
    cases.append(pdf("foreign-vat-gbp", [
        "INVOICE","Supplier: BOEKUNA UK LTD","Invoice number: GB-2026-77","Invoice date: 03-10-2026",
        "Subtotal GBP 100.00","VAT 20% GBP 20.00","Total GBP 120.00"
    ], {"supplier":"BOEKUNA UK LTD","invoiceNumber":"GB-2026-77","invoiceDate":"2026-10-03","currency":"GBP","subtotal":100,"vatTotal":20,"gross":120,"vatRate":20,"mixedRates":False}))
    cases.append(pdf("po-next-to-invoice", [
        "FACTUUR","Leverancier: BOEKUNA PO BV","KVK 87654321","Klantnummer 445566",
        "Ordernummer PO-2026-991","Factuurnummer INV-2026-REAL-991","Factuurdatum 03-10-2026",
        "Subtotaal EUR 100,00","BTW 21% EUR 21,00","Totaal EUR 121,00"
    ], {"supplier":"BOEKUNA PO BV","invoiceNumber":"INV-2026-REAL-991","invoiceDate":"2026-10-03","currency":"EUR","subtotal":100,"vatTotal":21,"gross":121,"vatRate":21,"mixedRates":False}))
    cases.append(pdf("credit-note", [
        "CREDITNOTA","Leverancier: BOEKUNA CREDIT BV","Creditnummer CN-2026-9","Originele factuur INV-2026-8",
        "Datum 03-10-2026","Subtotaal EUR -100,00","BTW 21% EUR -21,00","Totaal EUR -121,00"
    ], {"documentType":"credit_invoice","supplier":"BOEKUNA CREDIT BV","invoiceDate":"2026-10-03","currency":"EUR","subtotal":-100,"vatTotal":-21,"gross":-121,"vatRate":21,"mixedRates":False}))
    cases.append(pdf("self-billing", [
        "SELF-BILLING FACTUUR","Afnemer maakt deze factuur namens leverancier","Leverancier: BOEKUNA MAKER BV",
        "Factuurnummer SB-2026-4","Factuurdatum 03-10-2026","Subtotaal EUR 100,00","BTW 21% EUR 21,00","Totaal EUR 121,00"
    ], {"supplier":"BOEKUNA MAKER BV","invoiceNumber":"SB-2026-4","invoiceDate":"2026-10-03","currency":"EUR","subtotal":100,"vatTotal":21,"gross":121,"vatRate":21,"mixedRates":False}))
    cases.append(pdf("factoring", [
        "FACTUUR","Leverancier: BOEKUNA FACTORING BV","Factuurnummer FAC-2026-12","Factuurdatum 03-10-2026",
        "Subtotaal EUR 1000,00","BTW 21% EUR 210,00","Factuurtotaal EUR 1210,00",
        "Factoring fee EUR 10,00","Uitbetaling EUR 1200,00"
    ], {"supplier":"BOEKUNA FACTORING BV","invoiceNumber":"FAC-2026-12","invoiceDate":"2026-10-03","currency":"EUR","subtotal":1000,"vatTotal":210,"gross":1210,"vatRate":21,"factoringFeeTotal":10,"payoutAmount":1200,"mixedRates":False}))
    cases.append(pdf("advance-due", [
        "FACTUUR","Leverancier: BOEKUNA ADVANCE BV","Factuurnummer ADV-2026-1","Factuurdatum 03-10-2026",
        "Subtotaal EUR 1000,00","BTW 21% EUR 210,00","Totaal EUR 1210,00",
        "Voorschot betaald EUR 300,00","Nog te betalen EUR 910,00"
    ], {"supplier":"BOEKUNA ADVANCE BV","invoiceNumber":"ADV-2026-1","invoiceDate":"2026-10-03","currency":"EUR","subtotal":1000,"vatTotal":210,"gross":1210,"vatRate":21,"advancePaid":300,"amountDue":910,"mixedRates":False}))
    cases.append(pdf("already-paid", [
        "FACTUUR","Leverancier: BOEKUNA PAID BV","Factuurnummer PAID-2026-1","Factuurdatum 03-10-2026",
        "Subtotaal EUR 100,00","BTW 21% EUR 21,00","Totaal EUR 121,00","Reeds betaald EUR 121,00","Nog te betalen EUR 0,00"
    ], {"supplier":"BOEKUNA PAID BV","invoiceNumber":"PAID-2026-1","invoiceDate":"2026-10-03","currency":"EUR","subtotal":100,"vatTotal":21,"gross":121,"vatRate":21,"amountPaid":121,"amountDue":0,"mixedRates":False}))
    cases.append(pdf("identifiers", [
        "FACTUUR","Leverancier: BOEKUNA IDENT BV","Factuurnummer ID-2026-1","Factuurdatum 03-10-2026",
        "BTW-id NL123456789B01","IBAN NL91ABNA0417164300","BIC ABNANL2A","Betalingskenmerk RF18539007547034",
        "Subtotaal EUR 100,00","BTW 21% EUR 21,00","Totaal EUR 121,00"
    ], {"supplier":"BOEKUNA IDENT BV","invoiceNumber":"ID-2026-1","invoiceDate":"2026-10-03","currency":"EUR","subtotal":100,"vatTotal":21,"gross":121,"vatRate":21,"iban":"NL91ABNA0417164300","bic":"ABNANL2A","vatId":"NL123456789B01","paymentReference":"RF18539007547034","mixedRates":False}))
    cases.append(pdf("discount-negative-line", [
        "FACTUUR","Leverancier: BOEKUNA DISCOUNT BV","Factuurnummer DISC-1","Factuurdatum 03-10-2026",
        "Dienst EUR 110,00","Korting EUR -10,00","Subtotaal EUR 100,00","BTW 21% EUR 21,00","Totaal EUR 121,00"
    ], {"supplier":"BOEKUNA DISCOUNT BV","invoiceNumber":"DISC-1","invoiceDate":"2026-10-03","currency":"EUR","subtotal":100,"vatTotal":21,"gross":121,"vatRate":21,"mixedRates":False}))
    cases.append(pdf("missing-fields", [
        "ONVOLLEDIG DOCUMENT","Leverancier: BOEKUNA MISSING BV","Omschrijving zakelijke dienst","Totaal EUR 121,00"
    ], {"supplier":"BOEKUNA MISSING BV","gross":121}))
    cases.append(jpg("rotated-90", [
        "KASSABON","BOEKUNA PARKING BV","Datum 03-10-2026","Subtotaal EUR 10,00","BTW 21% EUR 2,10","Totaal EUR 12,10"
    ], {"supplier":"BOEKUNA PARKING BV","invoiceDate":"2026-10-03","currency":"EUR","subtotal":10,"vatTotal":2.10,"gross":12.10,"vatRate":21,"mixedRates":False}, rotate=90))
    return cases


def base_cases() -> list[dict[str, Any]]:
    out = []
    for c in scan_bench.cases():
        expected = c.get("expected", {})
        truth = {}
        mapping = {
            "supplier":"supplier","invoice_number":"invoiceNumber","date":"invoiceDate",
            "net":"subtotal","vat":"vatTotal","gross":"gross","vat_rate":"vatRate","mixed_vat":"mixedRates",
        }
        for k, v in expected.items():
            if k in mapping:
                truth[mapping[k]] = v
        truth.setdefault("currency", "EUR")
        out.append({**c, "truth":truth})
    return out


def to_verifier_jpeg(case: dict[str, Any]) -> bytes:
    raw, mime = case["raw"], case["mime"]
    if mime == "application/pdf":
        doc = fitz.open(stream=raw, filetype="pdf")
        pages = []
        for page in list(doc)[:3]:
            pix = page.get_pixmap(matrix=fitz.Matrix(1.6,1.6), alpha=False)
            pages.append(Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB"))
        doc.close()
        width = max(x.width for x in pages)
        total_h = sum(x.height for x in pages)
        canvas = Image.new("RGB", (width,total_h), "white")
        y=0
        for img in pages:
            canvas.paste(img,(0,y)); y+=img.height; img.close()
        image=canvas
    else:
        image=Image.open(io.BytesIO(raw)).convert("RGB")
    max_w,max_h=1800,4200
    scale=min(1.0,max_w/image.width,max_h/image.height)
    if scale<1:
        resized=image.resize((max(1,int(image.width*scale)),max(1,int(image.height*scale))),Image.Resampling.LANCZOS)
        image.close(); image=resized
    b=io.BytesIO(); image.save(b,"JPEG",quality=88); image.close()
    return b.getvalue()


def schema_for(fields: list[str]) -> dict[str, Any]:
    return {
        "type":"object",
        "properties":{
            "corrections":{
                "type":"array",
                "items":{
                    "type":"object",
                    "properties":{
                        "field":{"type":"string","enum":fields},
                        "value":{"type":"string"},
                        "confidence":{"type":"number","minimum":0,"maximum":1},
                        "evidence":{"type":"string"},
                    },
                    "required":["field","value","confidence","evidence"],
                    "additionalProperties":False,
                }
            },
            "uncertain":{"type":"array","items":{"type":"string","enum":fields}},
        },
        "required":["corrections","uncertain"],"additionalProperties":False,
    }


def verifier_request(server: str, image: bytes, source_text: str, candidates: dict[str, Any], fields: list[str], timeout=180) -> tuple[dict[str, Any] | None, float, str | None]:
    prompt = (
        "You are BOEKUNA's SECOND CHECK only. Never book, calculate an exchange rate, or invent values. "
        "Use only visible document evidence and the supplied source text. Review every candidate field. "
        "Return only corrections for parser fields that are visibly wrong, plus an uncertain list for fields you cannot verify. "
        "Do not repeat fields that are already supported. Every correction must be exactly supported by the document. "
        "Preserve mixed VAT as multiple VAT lines; never collapse it to one rate. "
        "Amounts must come from printed source evidence, not arithmetic guessing. Keep evidence under 12 words. "
        "Return correction value as a STRING. For booleans use true/false. For vatLines use a compact JSON-array string "
        "with objects containing rate, taxableAmount and vatAmount.\n\n"
        "SOURCE_TEXT:\n" + source_text[:3500] + "\n\nPARSER_CANDIDATES:\n" +
        json.dumps({k:candidates.get(k) for k in fields}, ensure_ascii=False, separators=(",",":"))
    )
    data_url="data:image/jpeg;base64,"+base64.b64encode(image).decode("ascii")
    body={
        "model":MODEL_ID,
        "messages":[{"role":"user","content":[{"type":"image_url","image_url":{"url":data_url}},{"type":"text","text":prompt}]}],
        "temperature":0,
        "max_tokens":450,
        "response_format":{"type":"json_schema","json_schema":{"name":"boekuna_second_check","strict":True,"schema":schema_for(fields)}},
    }
    t=time.perf_counter()
    try:
        r=requests.post(server.rstrip("/")+"/v1/chat/completions",json=body,timeout=timeout)
        elapsed=(time.perf_counter()-t)*1000
        r.raise_for_status()
        payload=r.json()
        content=payload["choices"][0]["message"]["content"]
        return json.loads(content),elapsed,None
    except Exception as exc:
        return None,(time.perf_counter()-t)*1000,type(exc).__name__+":"+str(exc)[:180]


def percentile(values: list[float], p: float) -> float | None:
    if not values:return None
    x=sorted(values); idx=(len(x)-1)*p; lo=math.floor(idx); hi=math.ceil(idx)
    if lo==hi:return x[lo]
    return x[lo]+(x[hi]-x[lo])*(idx-lo)


def find_server_process() -> psutil.Process | None:
    for p in psutil.process_iter(["pid","cmdline"]):
        try:
            cmd=" ".join(p.info.get("cmdline") or [])
            if "llama-server" in cmd:
                return p
        except Exception:
            pass
    return None


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--server",default="http://127.0.0.1:8088")
    ap.add_argument("--out",default="qwen3-vl-benchmark.json")
    ap.add_argument("--cold-start-ms",type=float,default=None)
    ap.add_argument("--model-bytes",type=int,default=0)
    ap.add_argument("--mmproj-bytes",type=int,default=0)
    args=ap.parse_args()

    cases=base_cases()+special_cases()
    # Benchmark policy self-checks: user-confirmed and high-confidence values
    # remain immutable; AI-only fields remain suggestions for human review.
    protected_base={"gross":121.0,"supplier":"Trusted BV","iban":None,"mixedRates":False,"vatLines":[]}
    protected_props=[
        {"field":"gross","verdict":"disagree","value":"999.00","confidence":1.0,"evidence":"test"},
        {"field":"supplier","verdict":"disagree","value":"Wrong BV","confidence":1.0,"evidence":"test"},
        {"field":"iban","verdict":"disagree","value":"NL91ABNA0417164300","confidence":1.0,"evidence":"test"},
    ]
    policy_out,policy_rejected=safe_accept(
        protected_base,protected_props,
        {"gross":0.2,"supplier":0.99,"iban":0.0},
        protected_fields={"gross"},
    )
    assert policy_out==protected_base
    assert "gross:user_confirmed" in policy_rejected
    assert "supplier:high_conf_parser" in policy_rejected
    assert "iban:ai_only_suggestion" in policy_rejected

    proc=find_server_process()
    idle_mem=proc.memory_info().rss if proc else None
    peak={"rss":idle_mem or 0}
    stop=threading.Event()
    def monitor():
        while not stop.is_set():
            if proc:
                try: peak["rss"]=max(peak["rss"],proc.memory_info().rss)
                except Exception: pass
            time.sleep(.2)
    th=threading.Thread(target=monitor,daemon=True); th.start()
    cpu0=sum(proc.cpu_times()[:2]) if proc else None
    wall0=time.perf_counter()

    records=[]; request_ms=[]; calls=0
    counts={f:{"A":{"EXACT":0,"NORMALIZED":0,"MISSING":0,"WRONG":0},"B":{"EXACT":0,"NORMALIZED":0,"MISSING":0,"WRONG":0}} for f in FIELDS}
    transition={"parser_correct_ai_correct":0,"parser_correct_ai_wrong":0,"parser_wrong_ai_corrects":0,"parser_wrong_ai_wrong":0,"parser_uncertain_ai_uncertain":0,"parser_uncertain_ai_hallucinates":0,"parser_wrong_ai_flags":0,"parser_correct_ai_false_challenge":0}
    ai_wrong_introduced=[]; rejected_total=[]

    # One clear control is always verified to measure the hallucination rate on a
    # high-confidence/financially-closing document; all other calls use selective routing.
    sentinel_ids={"receipt-clear-jpeg","digital-pdf","mixed-vat-pdf","identifiers"}
    for case in cases:
        started=time.perf_counter()
        doc=processor.extract_document(case["name"],case["mime"],case["raw"])
        result=processor.heuristic_extract(doc,case["name"],{})
        a=parser_fields(result)
        a_ms=(time.perf_counter()-started)*1000
        truth=case["truth"]
        applicable=[f for f in FIELDS if f in truth]
        a_status={f:status(f,a.get(f),truth.get(f)) for f in applicable}
        for f,s in a_status.items(): counts[f]["A"][s]+=1
        route,reasons=should_verify(result,a)
        verify=route or case["id"] in sentinel_ids
        proposals=[]; raw=None; err=None; vms=None; b=deepcopy(a); rejected=[]
        if verify:
            fields=sorted(set(applicable)|{"documentType","supplier","invoiceNumber","invoiceDate","currency","subtotal","vatTotal","gross","vatRate","mixedRates"})
            image=to_verifier_jpeg(case)
            raw,vms,err=verifier_request(args.server,image,doc.get("text") or "",a,fields)
            request_ms.append(vms); calls+=1
            if raw:
                corrections=raw.get("corrections") if isinstance(raw.get("corrections"),list) else []
                uncertain=raw.get("uncertain") if isinstance(raw.get("uncertain"),list) else []
                proposals=[{**p,"verdict":"disagree"} for p in corrections if isinstance(p,dict)]
                proposals += [{"field":name,"verdict":"uncertain","value":"","confidence":0.0,"evidence":""} for name in uncertain if name in fields]
                parser_conf={f:confidence_for(result,f) for f in FIELDS}
                b,rejected=safe_accept(a,proposals,parser_conf)
                rejected_total.extend(case["id"]+":"+x for x in rejected)
        b_status={f:status(f,b.get(f),truth.get(f)) for f in applicable}
        for f,s in b_status.items(): counts[f]["B"][s]+=1

        by_field={p.get("field"):p for p in proposals if isinstance(p,dict)}
        for f in applicable:
            ps=a_status[f]; p=by_field.get(f)
            parser_uncertain=(a.get(f) in (None,"") or confidence_for(result,f)<HIGH_CONF)
            if p is None:
                if ps in {"EXACT","NORMALIZED"}:
                    transition["parser_correct_ai_correct"]+=1
                continue
            verdict=p.get("verdict")
            proposed=p.get("value")
            parsed_proposed,_=parse_proposal_value(f,proposed)
            proposed_status=status(f,parsed_proposed,truth.get(f)) if verdict=="disagree" else ps
            if ps in {"EXACT","NORMALIZED"}:
                if verdict=="disagree":
                    transition["parser_correct_ai_false_challenge"]+=1
                    if proposed_status not in {"EXACT","NORMALIZED"}:
                        transition["parser_correct_ai_wrong"]+=1
                        ai_wrong_introduced.append({"id":case["id"],"field":f,"parser":a.get(f),"ai":parsed_proposed,"truth":truth.get(f),"confidence":p.get("confidence")})
                    else:
                        transition["parser_correct_ai_correct"]+=1
                else:
                    transition["parser_correct_ai_correct"]+=1
            else:
                if verdict=="disagree":
                    transition["parser_wrong_ai_flags"]+=1
                    if proposed_status in {"EXACT","NORMALIZED"}:
                        transition["parser_wrong_ai_corrects"]+=1
                    elif parser_uncertain:
                        transition["parser_uncertain_ai_hallucinates"]+=1
                    else:
                        transition["parser_wrong_ai_wrong"]+=1
                elif parser_uncertain and verdict=="uncertain":
                    transition["parser_uncertain_ai_uncertain"]+=1
                else:
                    transition["parser_wrong_ai_wrong"]+=1

        records.append({
            "id":case["id"],"aMs":round(a_ms,2),"verified":verify,"verificationReasons":reasons,
            "verifierMs":round(vms,2) if vms is not None else None,"verifierError":err,
            "A":{f:a.get(f) for f in applicable},"B":{f:b.get(f) for f in applicable},
            "truth":truth,"AStatus":a_status,"BStatus":b_status,
            "financialIssuesA":financial_issues(a),"financialIssuesB":financial_issues(b),
            "rejectedVerifierChanges":rejected,
        })

    # Provider/resource failure must fall back to A unchanged.
    unavailable,_,failure_err=verifier_request("http://127.0.0.1:1",b"not-an-image","",{"gross":121},["gross"],timeout=.5)
    assert unavailable is None and failure_err

    stop.set(); th.join(timeout=1)
    wall=time.perf_counter()-wall0
    cpu1=sum(proc.cpu_times()[:2]) if proc else None

    field_metrics={}
    for f in FIELDS:
        if sum(counts[f]["A"].values())==0: continue
        field_metrics[f]=counts[f]

    a_good=sum(v["A"]["EXACT"]+v["A"]["NORMALIZED"] for v in field_metrics.values())
    b_good=sum(v["B"]["EXACT"]+v["B"]["NORMALIZED"] for v in field_metrics.values())
    total=sum(sum(v["A"].values()) for v in field_metrics.values())
    financial_wrong=[x for x in ai_wrong_introduced if x["field"] in MONEY_FIELDS|RATE_FIELDS|{"vatLines","mixedRates"}]

    output={
        "benchmarkVersion":1,
        "sourceMainSha":os.getenv("GITHUB_BASE_SHA") or "unknown",
        "processorVersion":processor.PROCESSOR_VERSION,
        "ocrStack":processor.ocr_stack_info(),
        "model":{"id":MODEL_ID,"modelBytes":args.model_bytes,"mmprojBytes":args.mmproj_bytes,"totalBytes":args.model_bytes+args.mmproj_bytes},
        "documents":len(records),"verifierCalls":calls,"skippedVerifierCalls":len(records)-calls,
        "overall":{"AAccuracy":round(a_good/total,4) if total else None,"BAccuracy":round(b_good/total,4) if total else None},
        "fieldMetrics":field_metrics,
        "hallucination":{
            "aiWrongIntroduced":len(ai_wrong_introduced),
            "aiWrongIntroducedFinancial":len(financial_wrong),
            "details":ai_wrong_introduced,
            **transition,
        },
        "performance":{
            "coldStartMs":args.cold_start_ms,
            "warmP50Ms":round(percentile(request_ms,.5),2) if request_ms else None,
            "warmP95Ms":round(percentile(request_ms,.95),2) if request_ms else None,
            "idleModelRssMb":round(idle_mem/1024/1024,2) if idle_mem else None,
            "peakModelRssMb":round(peak["rss"]/1024/1024,2) if peak["rss"] else None,
            "avgCpuCores":round(((cpu1-cpu0)/wall),3) if cpu0 is not None and cpu1 is not None and wall>0 else None,
            "wallSeconds":round(wall,2),
        },
        "safety":{
            "verifierMutationPolicy":"review_only_without_matching_parser_candidate",
            "providerFailureFallbackUnchanged":True,
            "financialImpossibleAccepted":any(r["financialIssuesB"] and not r["financialIssuesA"] for r in records),
            "mixedVatCollapsed":any(r["truth"].get("mixedRates") is True and r["B"].get("mixedRates") is not True for r in records),
            "rejectedVerifierChanges":rejected_total,
        },
        "records":records,
    }
    # Benchmark evidence, not production authorization. Hard safety gates are
    # intentionally strict; performance target is evaluated against real target hardware.
    verifier_errors=sum(1 for r in records if r["verified"] and r["verifierError"])
    output["qualityGate"]={
        "pass": (
            output["hallucination"]["aiWrongIntroducedFinancial"]==0
            and not output["safety"]["financialImpossibleAccepted"]
            and not output["safety"]["mixedVatCollapsed"]
            and verifier_errors==0
            and (output["overall"]["BAccuracy"] or 0) == (output["overall"]["AAccuracy"] or 0)
            and output["hallucination"]["parser_wrong_ai_flags"] > 0
        ),
        "verifierErrors":verifier_errors,
        "criteria":[
            "AI_WRONG_INTRODUCED_FINANCIAL == 0",
            "no new financial invariant failure",
            "mixed VAT never collapsed",
            "no verifier execution errors",
            "safe B values remain identical to A until BOEKUNA exposes a validated matching parser candidate",
            "at least one parser error is independently flagged by verifier",
        ],
    }
    Path(args.out).write_text(json.dumps(output,indent=2,ensure_ascii=False),encoding="utf-8")
    print("QWEN3_VL_BENCHMARK_JSON="+json.dumps(output,separators=(",",":"),ensure_ascii=False))
    if not output["qualityGate"]["pass"]:
        raise SystemExit(2)


if __name__=="__main__":
    main()
