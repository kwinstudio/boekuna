import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROCESSOR_DIR = ROOT / "kwinest" / "docprocessor"
sys.path.insert(0, str(PROCESSOR_DIR))

import app as processor  # noqa: E402


def test_advance_payment_preserves_invoice_total_and_open_status():
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


def test_foreign_twenty_percent_vat_is_not_silently_rewritten_to_dutch_rate():
    doc = {
        "kind": "pdf",
        "pageCount": 1,
        "text": """--- PAGE 1 ---
FACTUUR
Leverancier: Voorbeeld België N.V.
Aan: Eigen Studio
Factuurnummer: BE-2026-1001
Factuurdatum: 01-10-2026
Vervaldatum: 31-10-2026
Beschrijving Aantal Tarief BTW Totaal
Dienstverlening 1 EUR 1.350,00 20% EUR 270,00 EUR 1.620,00
Bedrag excl. BTW EUR 1.350,00
BTW 20% EUR 270,00
Totaalbedrag EUR 1.620,00
""",
        "tables": [{"page": 1, "rows": [
            ["Beschrijving", "Aantal", "Tarief", "BTW", "Totaal"],
            ["Dienstverlening", "1", "EUR 1.350,00", "20%", "EUR 1.620,00"],
        ]}],
        "layout": [],
        "ocrPages": [],
        "warnings": [],
    }
    result = processor.heuristic_extract(
        doc,
        "foreign-twenty-percent-vat-regression.pdf",
        {"name": "Eigen Studio", "country": "NL"},
    )
    assert processor.money_cents(result.amounts.subtotal) == 135000, result.model_dump()
    assert processor.money_cents(result.amounts.vatTotal) == 27000, result.model_dump()
    assert processor.money_cents(result.amounts.total) == 162000, result.model_dump()
    assert not any(float(line.rate) == 21.0 for line in result.amounts.vatLines), result.model_dump()
    assert result.amounts.vatLines == [], result.model_dump()
    assert result.confidence.get("vatLines", 1) <= 0.35, result.model_dump()
