#!/usr/bin/env python3
"""Label/amount association from OCR layout (regression for the 10 October 2026 audit).

RapidOCR returns right-aligned receipt amounts as separate boxes that start a few
pixels above their label, so the plain text came out as

    9,50 / Subtotaal excl. btw EUR / 1,99 / BTW 21% EUR / 11,49 / TOTAAL INCL. BTW EUR

and the parser booked HEMA's 11,49 receipt as 1,99 + 0,42 = 2,41 with no warning.
These checks run on text and boxes only (no OCR engine), so they are fast and exact.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "kwinest" / "docprocessor"))

import app  # noqa: E402
from document_intelligence import NET_TOTAL_LABELS, VAT_TOTAL_LABELS  # noqa: E402

TOTAL_LABELS = ["totaal te betalen", "te voldoen", "amount due", "balance due", "grand total", "eindtotaal",
                "total amount", "totaal incl. btw", "totaal inclusief btw", "total incl. vat", "invoice total",
                "factuurbedrag", "factuurtotaal"]
TOTAL_EXCLUDE = ["subtotaal", "subtotal", "excl"]

# Detector order as RapidOCR emitted it for the synthetic HEMA receipt (amount box first).
HEMA_DETECTOR_ORDER = [
    "HEMA", "Website: www.hema.nl", "KASSABON", "Leverancier: HEMA", "Datum: 10-10-2026",
    "Bonnummer: TEST-2026-003", "ARTIKELEN", "4,99", "Notitieblok", "6,50", "Balpennen",
    "9,50", "Subtotaal excl. btw EUR", "1,99", "BTW 21% EUR", "11,49", "TOTAAL INCL. BTW EUR",
    "11,49", "Betaald per PIN EUR", "Dank voor uw aankoop",
]


def box(x0, y0, x1, y1):
    return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]


def row(text, x0, y0, x1, y1, conf=.95):
    return {"text": text, "box": box(x0, y0, x1, y1), "confidence": conf}


def passed(name):
    print("PASS", name)


# 1. Boxes on one baseline become one line, left to right, even when the amount box
#    starts above the label box and was sorted first.
rows = [
    row("9,50", 880, 955, 965, 990),
    row("Subtotaal excl. btw EUR", 76, 960, 470, 996),
    row("1,99", 880, 1024, 965, 1060),
    row("BTW 21% EUR", 76, 1030, 300, 1066),
    row("11,49", 870, 1131, 965, 1168),
    row("TOTAAL INCL. BTW EUR", 76, 1137, 480, 1174),
    {"text": "Dank voor uw aankoop", "box": None, "confidence": .9},
]
lines = app.ocr_rows_to_lines(rows)
assert lines == [
    "Subtotaal excl. btw EUR 9,50",
    "BTW 21% EUR 1,99",
    "TOTAAL INCL. BTW EUR 11,49",
    "Dank voor uw aankoop",
], lines
# Rows that only touch (overlap below half a box height) stay separate lines.
separate = app.ocr_rows_to_lines([row("Koffie", 76, 100, 200, 136), row("7,38", 880, 130, 965, 166)])
assert separate == ["Koffie", "7,38"], separate
passed("ocr_rows_to_lines merges a right-aligned amount with its label")

# 2. A label without an amount takes the bare amount above it when the line below is
#    not an amount; both neighbours bare (the detector order) means the value is read
#    below the arithmetic anchor threshold, so it can never silently drive the others.
# A lone bare amount above a label-only line is read, but a labelled row with its own amount
# below is no proof that the amount above is ours (it could be an item price above an unread
# bold total), so the read stays below the anchor threshold and goes to review.
net, net_conf = app.labeled_amount(["Balpennen", "9,50", "Subtotaal excl. btw EUR", "BTW 21% EUR 1,99"], NET_TOTAL_LABELS)
assert net == 9.5 and net_conf <= .80, (net, net_conf)
# A labelled row without an amount right below (the column layout came apart) is proof.
net, net_conf = app.labeled_amount(["Balpennen", "9,50", "Subtotaal excl. btw EUR", "BTW 21% EUR", "1,99"], NET_TOTAL_LABELS, [], None)
assert net == 9.5 and net_conf >= .94, (net, net_conf)
# The bare detector order alone is ambiguous (every label has bare amounts on both sides and a
# payment line never votes), so nothing there may anchor: the value stays below 0.80.
net, net_conf = app.labeled_amount(HEMA_DETECTOR_ORDER, NET_TOTAL_LABELS)
assert net_conf <= .80, (net, net_conf)
assert app.amount_line_convention(HEMA_DETECTOR_ORDER) is None
assert app.amount_line_convention(["9,50", "Subtotaal excl. btw EUR", "1,99"]) is None
# With the layout known to be "before" (column OCR), the same lines read 9,50 in full confidence.
net, net_conf = app.labeled_amount(HEMA_DETECTOR_ORDER, NET_TOTAL_LABELS, [], "before")
assert net == 9.5 and net_conf >= .94, (net, net_conf)
# A lone bare amount above a label-only line (an unread bold total on a native PDF) is never
# a confident read: the reviewer's taxi case must not book 12,00.
taxi = ["Rit Schiphol - Utrecht", "84,50", "Wachttijd", "12,00", "Totaal", "Betaald via iDEAL", "Bedankt"]
value, conf = app.labeled_amount(taxi, ["totaal"], [], "after")
assert value is None or conf <= .80, (value, conf)
assert app.strong_total_anchor(taxi, "after") == (None, 0.0)
assert app.strong_total_anchor(["Koffie", "3,50", "Broodje", "4,50", "Totaal", "Betaald per PIN"], None) == (None, 0.0)
value, conf = app.labeled_amount(["Totaal te betalen:", "EUR 121,00"], TOTAL_LABELS, TOTAL_EXCLUDE)
assert value == 121.0 and conf >= .94, (value, conf)
passed("labeled_amount reads the neighbouring bare amount with layout evidence")

# 3. "TOTAAL INCL. BTW" is a gross anchor; a VAT row is still not.
total, total_conf = app.strong_total_anchor(["TOTAAL INCL. BTW EUR 11,49"])
assert total == 11.49 and total_conf >= .96, (total, total_conf)
assert app.strong_total_anchor(["BTW 21% EUR 1,99"]) == (None, 0.0)
assert app.strong_total_anchor(["Totaal excl. btw EUR 9,50"]) == (None, 0.0)
total, total_conf = app.strong_total_anchor(["11,49", "TOTAAL INCL. BTW EUR", "Betaald per PIN EUR"], "before")
assert total == 11.49 and total_conf >= .94, (total, total_conf)
assert app.strong_total_anchor(["11,49", "TOTAAL INCL. BTW EUR", "Betaald per PIN EUR"], None) == (None, 0.0)
assert app.strong_total_anchor(["11,49", "TOTAAL INCL. BTW EUR", "11,49"]) == (None, 0.0)
assert app.strong_total_anchor(HEMA_DETECTOR_ORDER) == (None, 0.0), "ambiguous detector order never anchors"
total, total_conf = app.strong_total_anchor(HEMA_DETECTOR_ORDER, "before")
assert total == 11.49 and total_conf >= .94, (total, total_conf)
passed("strong_total_anchor keeps explicit inclusive totals and rejects VAT rows")

# 4. The full parser on the unmerged detector order never produces a confident wrong
#    booking: the 2,41 of the audit is gone, and whatever is read stays under review.
doc = {"kind": "image", "pageCount": 1, "text": "\n".join(HEMA_DETECTOR_ORDER), "financialText": "", "headerText": "",
       "layout": [], "tables": [], "ocrPages": [1], "processingHints": {}}
result = app.heuristic_extract(doc, "hema.jpg", {"name": "Demo Ondernemer"})
amounts = result.amounts
assert amounts.total != 2.41, amounts.model_dump(exclude_none=True)
if (amounts.subtotal, amounts.vatTotal, amounts.total) != (9.5, 1.99, 11.49):
    assert result.confidence["total"] < .85 and result.confidence["subtotal"] < .94, (amounts.model_dump(exclude_none=True), result.confidence)
    assert not result.processing["amountDerivation"]["used"], result.processing["amountDerivation"]
assert result.supplier.name and "hema" in result.supplier.name.lower(), result.supplier
# The same text with the boxes merged books the printed amounts.
merged = {**doc, "text": "\n".join(HEMA_DETECTOR_ORDER[:11] + ["Subtotaal excl. btw EUR 9,50", "BTW 21% EUR 1,99", "TOTAAL INCL. BTW EUR 11,49", "Betaald per PIN EUR 11,49", "Dank voor uw aankoop"])}
result = app.heuristic_extract(merged, "hema.jpg", {"name": "Demo Ondernemer"})
assert (result.amounts.subtotal, result.amounts.vatTotal, result.amounts.total) == (9.5, 1.99, 11.49), result.amounts.model_dump(exclude_none=True)
assert result.processing["financialBlocks"]["verified"] and not result.warnings, (result.processing["financialBlocks"], result.warnings)
passed("heuristic_extract never books 2,41 for the 11,49 receipt and books it from merged lines")

# 5. A total that was never read and is extrapolated from one net read is flagged and
#    stays below the booking threshold (85) instead of looking certain.
doc_net_only = {**doc, "text": "\n".join(["HEMA", "KASSABON", "Datum: 10-10-2026", "Subtotaal excl. btw EUR 9,50", "BTW 21%"])}
result = app.heuristic_extract(doc_net_only, "hema.jpg", {"name": "Demo Ondernemer"})
derivation = result.processing["amountDerivation"]
assert derivation["used"] and derivation["anchorField"] == "subtotal" and "total" in derivation["derivedFields"], derivation
assert result.confidence["total"] <= .84, result.confidence
assert any("berekend uit het bedrag excl. btw" in w for w in result.warnings), result.warnings
passed("a total derived from a lone net read is marked for review")

# 6. A demo/disclaimer banner above the merchant is never the merchant.
merchant = app.receipt_merchant_name(["DEMO - FICTIEVE PLAATSNAAM", "Geen echt aankoopbewijs", "GAMMA", "KASSABON"], {"name": "Demo Ondernemer"})
assert merchant == "GAMMA", merchant
merchant = app.receipt_merchant_name(["Voorbeeldbon - niet geldig", "Bouwmarkt Jansen", "KASSABON"], {})
assert merchant == "Bouwmarkt Jansen", merchant
passed("disclaimer lines are skipped as merchant names")

print("OK document-ocr-layout-amounts")

# 7. A printed web address in the party block is reported as evidence; e-mail, IDs and
#    file names are not web addresses.
block = ["HEMA", "Website: www.hema.nl", "KASSABON", "info@hema.nl", "IBAN NL91ABNA0417164300", "KvK 12345678"]
assert app.printed_website(block) == "hema.nl", app.printed_website(block)
assert app.printed_website(["Bestand: bon-2026.pdf", "mail: info@shop.nl"]) is None
assert app.printed_website(["Bezoek https://www.Coolblue.nl/klantenservice voor hulp"]) == "coolblue.nl"
doc_site = {"kind": "image", "pageCount": 1, "text": "\n".join(["HEMA", "Website: www.hema.nl", "KASSABON", "Datum: 10-10-2026",
            "Subtotaal excl. btw EUR 9,50", "BTW 21% EUR 1,99", "TOTAAL INCL. BTW EUR 11,49"]), "financialText": "", "headerText": "",
            "layout": [], "tables": [], "ocrPages": [1], "processingHints": {}}
result = app.heuristic_extract(doc_site, "hema.jpg", {"name": "Demo Ondernemer"})
assert result.supplier.website == "hema.nl", result.supplier
passed("a printed website reaches the supplier block as evidence")
print("OK document-ocr-layout-amounts (website)")

# 8. Rotated text (vertical boxes) and oversized boxes never merge into one line, and
#    boxes that overlap horizontally are stacked rows, not one line.
vertical = [row("3511 AB Utrecht", 868, 172, 897, 304), row("SUPERMARKT DE HOEK", 911, 173, 941, 374), row("Kassabon 08-10-2026", 806, 174, 831, 360)]
assert app.ocr_rows_to_lines(vertical) == ["3511 AB Utrecht", "SUPERMARKT DE HOEK", "Kassabon 08-10-2026"], app.ocr_rows_to_lines(vertical)
stacked = [row("Koffie 4,50", 76, 100, 300, 136), row("Melk 1,30", 80, 120, 300, 156)]
assert app.ocr_rows_to_lines(stacked) == ["Koffie 4,50", "Melk 1,30"], app.ocr_rows_to_lines(stacked)
tall_box = [row("KASSABON", 76, 100, 300, 136), row("x", 400, 60, 460, 300), row("9,50", 880, 102, 965, 138)]
assert app.ocr_rows_to_lines(tall_box) == ["x", "KASSABON 9,50"] or app.ocr_rows_to_lines(tall_box) == ["KASSABON 9,50", "x"], app.ocr_rows_to_lines(tall_box)
passed("vertical, oversized and stacked boxes stay separate lines")
print("OK document-ocr-layout-amounts (geometry)")

# 9. An OCR-broken amount on the label line ("86'9") is unreadable, not an invitation to
#    read the next row's amount as this label's value.
from financial_blocks import parse_financial_blocks  # noqa: E402
mangled = ["Subtotaal excl. btw EUR 86'9", "BTW 21% EUR 1,46", "TOTAAL INCL. BTW EUR 8,44"]
assert app.labeled_amount(mangled, NET_TOTAL_LABELS) == (None, 0.0), app.labeled_amount(mangled, NET_TOTAL_LABELS)
primary = parse_financial_blocks(mangled).get("primary")
assert not primary or primary.get("subtotal") != 1.46, primary
doc_mangled = {**doc, "text": "\n".join(["KRUIDVAT", "KASSABON", "Datum: 10-10-2026"] + mangled), "financialText": "\n".join(mangled)}
result = app.heuristic_extract(doc_mangled, "kruidvat.jpg", {"name": "Demo Ondernemer"})
assert result.amounts.subtotal != 1.46, result.amounts.model_dump(exclude_none=True)
# A clean full-text block next to a broken focus block wins without a conflict.
doc_both = {**doc_mangled, "text": "\n".join(["KRUIDVAT", "KASSABON", "Datum: 10-10-2026", "Subtotaal excl. btw EUR 6,98", "BTW 21% EUR 1,46", "TOTAAL INCL. BTW EUR 8,44"])}
result = app.heuristic_extract(doc_both, "kruidvat.jpg", {"name": "Demo Ondernemer"})
assert (result.amounts.subtotal, result.amounts.vatTotal, result.amounts.total) == (6.98, 1.46, 8.44), result.amounts.model_dump(exclude_none=True)
assert not result.warnings, result.warnings
passed("a broken amount on the label line never borrows the next row's amount")
print("OK document-ocr-layout-amounts (mangled)")

# 10. A street line above or below the shop name is the address, not the merchant.
merchant = app.receipt_merchant_name(["Kerkstraat 21", "SUPERMARKT DE HOEK", "3511 AB Utrecht", "Kassabon 08-10-2026"], {"name": "Kwinest"})
assert merchant == "SUPERMARKT DE HOEK", merchant
assert app.receipt_merchant_name(["Dorpsstraat 12a", "1234 AB Dorp"], {}) is None
assert app.receipt_merchant_name(["Demo Media B.V.", "KASSABON"], {}) == "Demo Media B.V.", "a company called Demo is a company"
assert app.receipt_merchant_name(["Sample Solutions", "KASSABON"], {}) == "Sample Solutions"
assert app.receipt_merchant_name(["Albert Heijn 1089", "KASSABON"], {}) == "Albert Heijn 1089", "a store number is not a street"
assert app.receipt_merchant_name(["DEMO - FICTIEF TESTDOCUMENT", "HEMA"], {}) == "HEMA"
passed("street lines are never the merchant")
print("OK document-ocr-layout-amounts (address)")

# 11. A native PDF that prints every amount under its label keeps the "after" convention,
#     even though every label then has bare amounts on both sides (Solid Health regression).
solid = ["Factuur 22486", "Datum 24-11-2025", "Leverancier: Solid Health Club", "Product / Dienst",
         "Solid tennis - MAAND (2025-12-03 - 2026-01-02)", "Totaal exclusief BTW", "27.52", "BTW 9% - 9.00% BTW", "2.48",
         "Totaal inclusief BTW", "30.00", "Te voldoen in EUR", "30.00"]
assert app.amount_line_convention(solid) is None, "one vote is no verdict; native text gets \"after\" from the caller"
doc_solid = {**doc, "text": "\n".join(solid), "ocrPages": []}
result = app.heuristic_extract(doc_solid, "solid.pdf", {"name": "Demo Ondernemer"})
assert (result.amounts.subtotal, result.amounts.vatTotal, result.amounts.total) == (27.52, 2.48, 30.0), result.amounts.model_dump(exclude_none=True)
assert not result.warnings, result.warnings
passed("amount-under-label documents keep their convention")
print("OK document-ocr-layout-amounts (convention)")

# 12. Review probes: a native webshop PDF keeps "after" even though a payment line follows the
#     total, and counts/dates on a label line are not a broken amount.
webshop = ["Koffiebonen 1kg", "2", "3,69", "7,38", "Bezorgkosten", "0,00", "Subtotaal", "100,00", "BTW 21%", "21,00",
           "Totaal", "121,00", "Betaald via iDEAL", "Bedankt voor je bestelling"]
doc_web = {**doc, "text": "\n".join(["FACTUUR", "Leverancier: Webshop BV", "Factuurnummer: WS-2026-77", "Factuurdatum: 01-10-2026"] + webshop), "ocrPages": []}
result = app.heuristic_extract(doc_web, "webshop.pdf", {"name": "Demo Ondernemer"})
assert (result.amounts.subtotal, result.amounts.vatTotal, result.amounts.total) == (100.0, 21.0, 121.0), result.amounts.model_dump(exclude_none=True)
assert not result.warnings, result.warnings
value, conf = app.labeled_amount(["Totaal te betalen (3 artikelen)", "EUR 45,00"], TOTAL_LABELS, TOTAL_EXCLUDE, "after")
assert value == 45.0 and conf >= .94, (value, conf)
value, conf = app.labeled_amount(["Totaal te betalen voor 15-10-2026", "EUR 45,00"], TOTAL_LABELS, TOTAL_EXCLUDE, "after")
assert value == 45.0 and conf >= .94, (value, conf)
passed("native PDFs keep amount-under-label; counts and dates are not broken amounts")
print("OK document-ocr-layout-amounts (review probes)")

# 13. The supplier's web address is read from the whole document (header or footer), never
#     from e-mail addresses, bank lines, the customer, the own company, payment providers or
#     platforms, and only when the host matches the supplier name.
W = app.document_website
assert W(["HEMA", "www.hema.nl", "KASSABON", "Leverancier: HEMA", "Datum: 10-10-2026"], "HEMA") == "hema.nl"
assert W(["HEMA", "KASSABON", "TOTAAL 11,49", "Bedankt voor je bezoek!", "Kijk op www.hema.nl", "Ruilen binnen 30 dagen"], "HEMA") == "hema.nl"
assert W(["HEMA", "KASSABON", "hema.nl"], "HEMA") == "hema.nl"
assert W(["Albert Heijn 1089", "www.ah.nl"], "Albert Heijn 1089") == "ah.nl", "initials of the alphabetic name words"
assert W(["MediaMarkt", "www.mediamarkt.nl/service"], "MediaMarkt") == "mediamarkt.nl"
assert W(["Praxis", "https://www.praxis.nl"], "Praxis Bouwmarkt B.V.") == "praxis.nl"
assert W(["HEMA", "info@hema.nl"], "HEMA") is None, "an e-mail address is not a web address"
assert W(["Bakker Jansen", "Betaald via ideal.nl", "www.marktplaats.nl"], "Bakker Jansen") is None, "payment and platform hosts never count"
assert W(["Bakker Jansen", "www.korenbloem-brood.nl"], "Bakker Jansen") is None, "a host that does not match the name is left to the user"
assert W(["Bahco Tools", "www.ah.nl"], "Bahco Tools") is None, "a two-letter label never matches by containment"
assert W(["HEMA", "IBAN NL91ABNA0417164300 hema.nl"], "HEMA") is None, "bank lines are skipped"
assert W(["HEMA", "bon.pdf", "www.hema.nl"], "HEMA") == "hema.nl"
assert W(["HEMA", "www.demo-ondernemer.nl", "www.hema.nl"], "HEMA", exclude=("demo-ondernemer.nl",)) == "hema.nl"
assert W(["HEMA", "www.demo-ondernemer.nl"], "HEMA", exclude=("demo-ondernemer.nl",)) is None
assert W(["www.hema.nl"], None) is None
# Through the full extractor: a receipt with the address in the footer reports it on the supplier.
receipt_lines = ["HEMA", "KASSABON", "Leverancier: HEMA", "Datum: 10-10-2026", "Bonnummer: TEST-2026-001", "Notitieblok", "4,99",
                 "Subtotaal excl. btw", "9,50", "BTW 21%", "1,99", "TOTAAL INCL. BTW", "11,49", "Betaald via PIN", "11,49",
                 "Bedankt voor je bezoek!", "Kijk op www.hema.nl"]
doc_receipt = {**doc, "text": "\n".join(receipt_lines), "ocrPages": []}
result = app.heuristic_extract(doc_receipt, "hema-bon.jpg", {"name": "Demo Ondernemer", "website": "www.demo-ondernemer.nl"})
assert result.supplier.name == "HEMA" and result.supplier.website == "hema.nl", (result.supplier.name, result.supplier.website)
assert result.amounts.total == 11.49, result.amounts.model_dump(exclude_none=True)
# On a sales invoice the own company's site stays with the issuer; the customer never gets it.
doc_sale = {**doc, "text": "\n".join(["FACTUUR", "Demo Ondernemer", "www.demo-ondernemer.nl", "Factuur aan: Klant BV", "Factuurnummer: 2026-0001", "Factuurdatum: 01-10-2026", "Totaal", "121,00"]), "ocrPages": []}
result = app.heuristic_extract(doc_sale, "verkoop.pdf", {"name": "Demo Ondernemer", "website": "www.demo-ondernemer.nl"})
assert result.documentType == "sales_invoice" and result.customer.name == "Klant BV", (result.documentType, result.customer.name)
assert (result.customer.website or None) is None, result.customer.model_dump(exclude_none=True)
passed("supplier web address from the whole document, matched to the name, never the customer or a platform")
print("OK document-ocr-layout-amounts (website evidence)")
