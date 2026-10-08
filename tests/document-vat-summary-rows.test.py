"""Digital PDF invoices with common Dutch summary rows (release audit 2026-10-08).

"Btw 9% over 75,00 6,75" names the taxable base with "over", a line-item VAT cell can read
"9% 75,00", and "Reeds betaald" next to "Openstaand" means partly paid, not paid.
The documents are generated here; no customer documents are used.
"""
import sys
import warnings
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "kwinest" / "docprocessor"))
warnings.filterwarnings("ignore")

import app as processor  # noqa: E402

COMPANY = {"name": "Bakkerij QA A", "kvk": "12345678", "vat": "NL123456789B01"}


def pdf(rows):
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    for text, x, y in rows:
        page.insert_text((x, 842 - y), text, fontsize=10, fontname="helv")
    raw = doc.tobytes()
    doc.close()
    return raw


HEADER = [
    ("Groothandel Testmeel B.V.", 40, 800), ("Meelweg 12, 5611 AB Eindhoven", 40, 786),
    ("KvK 87654321 Btw NL862345678B01", 40, 772), ("IBAN NL20INGB0001234567", 40, 758),
    ("Factuurnummer: GT-2026-0458", 350, 730), ("Factuurdatum: 02-10-2026", 350, 716),
    ("Vervaldatum: 16-10-2026", 350, 702), ("Factuur aan:", 40, 700), ("Bakkerij QA A", 40, 686),
    ("Omschrijving", 40, 600), ("Aantal", 300, 600), ("Prijs", 360, 600), ("Btw", 420, 600), ("Bedrag", 480, 600),
    ("Tarwebloem 25 kg", 40, 580), ("4", 300, 580), ("18,75", 360, 580), ("9%", 420, 580), ("75,00", 480, 580),
    ("Bakpapier rol", 40, 564), ("2", 300, 564), ("12,50", 360, 564), ("21%", 420, 564), ("25,00", 480, 564),
    ("Subtotaal excl. btw", 300, 520), ("100,00", 480, 520),
    ("Btw 9% over 75,00", 300, 506), ("6,75", 480, 506),
    ("Btw 21% over 25,00", 300, 492), ("5,25", 480, 492),
    ("Totaal incl. btw", 300, 472), ("EUR 112,00", 470, 472),
]


def analyze(rows):
    return processor.analyze_document(pdf(rows), "inkoop.pdf", "application/pdf", COMPANY, allow_external_ai=False)["data"]


def test_mixed_vat_summary_rows_with_over_are_read_per_rate():
    data = analyze(HEADER)
    amounts = data["amounts"]
    lines = sorted((l["rate"], l["taxableAmount"], l["vatAmount"]) for l in amounts["vatLines"])
    assert lines == [(9.0, 75.0, 6.75), (21.0, 25.0, 5.25)], amounts
    assert (amounts["subtotal"], amounts["vatTotal"], amounts["total"]) == (100.0, 12.0, 112.0), amounts
    assert data["supplier"]["name"] == "Groothandel Testmeel B.V.", data["supplier"]
    assert data["invoice"]["invoiceNumber"] == "GT-2026-0458", data["invoice"]


def test_line_item_vat_rate_is_not_glued_to_the_line_amount():
    rates = [item.get("vatRate") for item in analyze(HEADER)["lineItems"]]
    assert all(rate in (None, 9.0, 21.0) for rate in rates), rates


def test_partly_paid_invoice_stays_open():
    data = analyze(HEADER + [("Reeds betaald", 300, 452), ("50,00", 480, 452), ("Openstaand", 300, 438), ("62,00", 480, 438)])
    amounts = data["amounts"]
    assert amounts["total"] == 112.0, amounts
    assert amounts["alreadyPaid"] == 50.0 and amounts["outstandingAmount"] == 62.0, amounts
    assert data["status"] == "open", data["status"]


if __name__ == "__main__":
    for name, test in list(globals().items()):
        if name.startswith("test_") and callable(test):
            test()
    print("VAT summary rows and payment status: PASS")
