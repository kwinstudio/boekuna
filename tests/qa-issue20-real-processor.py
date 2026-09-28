import base64
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROCESSOR_DIR = ROOT / "kwinest" / "docprocessor"
sys.path.insert(0, str(PROCESSOR_DIR))

import app as processor  # noqa: E402

fixture = ROOT / "tests" / "fixtures" / "qa-issue20-mixed.pdf.b64"
raw = base64.b64decode(fixture.read_text().strip())

company = {
    "name": "KWINSTUDIO",
    "tradeName": "KWINSTUDIO",
    "contactName": "Kwin",
    "email": "qa@example.test",
    "kvk": "00000099",
    "vat": "NL000000099B00",
}

doc = processor.extract_document("02_gemengde_btw_9_en_21.pdf", "application/pdf", raw)
result = processor.heuristic_extract(doc, "02_gemengde_btw_9_en_21.pdf", company)
result = processor.validate_result(result, company)

def cents(value):
    return None if value is None else int(round(float(value) * 100))

assert doc["kind"] == "pdf"
assert doc["pageCount"] == 1
assert "KKG/26/09/7741" in (doc.get("text") or "")
assert result.documentType == "purchase_invoice", result.documentType
assert "KeukenKern" in (result.supplier.name or ""), result.supplier.name
print("PROCESSOR_RESULT", json.dumps({
    "supplier": result.supplier.name,
    "invoiceNumber": result.invoice.invoiceNumber,
    "subtotal": result.amounts.subtotal,
    "vatTotal": result.amounts.vatTotal,
    "total": result.amounts.total,
    "vatLines": [v.model_dump() for v in result.amounts.vatLines],
    "processing": result.processing,
    "warnings": result.warnings,
    "confidence": result.confidence,
}, ensure_ascii=False, default=str))

# Feed the browser stage a canonical authoritative processor payload built only
# from the actual PDF ground truth. This isolates the 02A client fix even when
# the deterministic processor check above exposes an upstream extraction defect.
canonical = result.model_dump()
canonical["invoice"]["invoiceNumber"] = "KKG/26/09/7741"
canonical["invoice"]["invoiceDate"] = "2026-09-05"
canonical["invoice"]["dueDate"] = "2026-09-19"
canonical["amounts"]["subtotal"] = 429.95
canonical["amounts"]["vatTotal"] = 52.49
canonical["amounts"]["total"] = 482.44
canonical["amounts"]["currency"] = "EUR"
canonical["amounts"]["vatLines"] = [
    {"rate": 9.0, "taxableAmount": 315.00, "vatAmount": 28.35},
    {"rate": 21.0, "taxableAmount": 114.95, "vatAmount": 24.14},
]
canonical["warnings"] = []
canonical["confidence"].update({
    "supplierName": .99, "invoiceNumber": .99, "invoiceDate": .99,
    "subtotal": .99, "vatTotal": .99, "total": .99, "vatLines": .99,
})
canonical.setdefault("processing", {})
canonical["processing"]["amountDerivation"] = {
    **(canonical["processing"].get("amountDerivation") or {}),
    "mixedRates": True,
}
canonical["processing"]["vatLineSource"] = "explicit-vat-text"
canonical["processing"]["overallConfidence"] = .99
payload = {
    "ok": True,
    "data": canonical,
    "preview": {
        "text": (doc.get("text") or "")[:30000],
        "pages": (doc.get("pages") or [])[:50],
        "tables": (doc.get("tables") or [])[:20],
    },
    "duplicateCandidates": [],
}
out = ROOT / "tests" / ".qa_issue20_processor_output.json"
out.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
print("CANONICAL_CLIENT_PAYLOAD written for independent 02A flow isolation")
assert cents(result.amounts.subtotal) == 42995, result.amounts.subtotal
assert cents(result.amounts.vatTotal) == 5249, result.amounts.vatTotal
assert cents(result.amounts.total) == 48244, result.amounts.total
assert cents(result.amounts.subtotal) + cents(result.amounts.vatTotal) == cents(result.amounts.total)

lines = sorted(result.amounts.vatLines, key=lambda v: float(v.rate))
assert [round(float(v.rate)) for v in lines] == [9, 21], [(v.rate, v.taxableAmount, v.vatAmount) for v in lines]
assert cents(lines[0].taxableAmount) == 31500, lines[0]
assert cents(lines[0].vatAmount) == 2835, lines[0]
assert cents(lines[1].taxableAmount) == 11495, lines[1]
assert cents(lines[1].vatAmount) == 2414, lines[1]
assert sum(cents(v.taxableAmount) for v in lines) == 42995
assert sum(cents(v.vatAmount) for v in lines) == 5249
assert bool(((result.processing or {}).get("amountDerivation") or {}).get("mixedRates")) is True

print("03A issue #20 real processor: PASS")
print(json.dumps({
    "documentType": result.documentType,
    "invoiceNumber": result.invoice.invoiceNumber,
    "supplier": result.supplier.name,
    "subtotal": result.amounts.subtotal,
    "vatTotal": result.amounts.vatTotal,
    "total": result.amounts.total,
    "vatLines": [v.model_dump() for v in lines],
    "mixedRates": True,
}, ensure_ascii=False))
