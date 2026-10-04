import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROCESSOR_DIR = ROOT / "kwinest" / "docprocessor"
sys.path.insert(0, str(PROCESSOR_DIR))

import app as processor  # noqa: E402


def test_advance_payment_does_not_replace_invoice_total_or_mark_invoice_paid():
    doc = {
        "kind": "pdf",
        "pageCount": 1,
        "text": """--- PAGE 1 ---
FACTUUR
Leverancier: Voorbeeld Elektro B.V.
Aan: Eigen Studio
Factuurnummer: ADV-2026-1001
Factuurdatum: 01-10-2026
Vervaldatum: 31-10-2026
Omschrijving Aantal Excl. btw 21% btw Totaal
Installatiewerk 1 EUR 454,00 EUR 95,34 EUR 549,34
Bedrag excl. 21% btw EUR 454,00
21% btw EUR 95,34
Totaal factuur EUR 549,34
Voorschot EUR 300,00
Nog te betalen EUR 249,34
""",
        "tables": [{"page": 1, "rows": [
            ["Omschrijving", "Aantal", "Excl. btw", "21% btw", "Totaal"],
            ["Installatiewerk", "1", "EUR 454,00", "EUR 95,34", "EUR 549,34"],
        ]}],
        "layout": [],
        "ocrPages": [],
        "warnings": [],
    }

    result = processor.heuristic_extract(
        doc,
        "advance-payment-outstanding-regression.pdf",
        {"name": "Eigen Studio", "country": "NL"},
    )

    assert processor.money_cents(result.amounts.subtotal) == 45400, result.model_dump()
    assert processor.money_cents(result.amounts.vatTotal) == 9534, result.model_dump()
    assert processor.money_cents(result.amounts.total) == 54934, result.model_dump()
    assert result.status != "paid", result.model_dump()
    assert result.amounts.settlementAmount is None, result.model_dump()
