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

payload = {
    "ok": True,
    "data": result.model_dump(),
    "preview": {
        "text": (doc.get("text") or "")[:30000],
        "pages": (doc.get("pages") or [])[:50],
        "tables": (doc.get("tables") or [])[:20],
    },
    "duplicateCandidates": [],
}
out = ROOT / "tests" / ".qa_issue20_processor_output.json"
out.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
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
