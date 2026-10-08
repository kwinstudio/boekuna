"""Party-role benchmark: who issued the invoice, who receives it, and which
identifiers/dates/amounts belong to which role.

All documents are synthetic and generated here (no customer documents). Each
scenario is rendered as a real PDF with positioned text blocks, so the existing
native extraction (and, for the scanned/photo cases, the existing RapidOCR path)
produces the same line order a real invoice would. The documents then go
through the unchanged production entry point `analyze_document` with external
AI disabled, using the same company context the app sends
(name, tradeName, kvk, vat).

Every field is graded CORRECT / NORMALIZED / MISSING / WRONG. MISSING means the
field was left empty for review ("Controle nodig"); WRONG means a value was
filled in that is not the expected one, which is the failure that matters.

Usage:
  python tests/document-party-roles-benchmark.py            # print summary
  BOOKUNA_PARTY_REPORT=out.json python tests/...             # also write JSON
  BOOKUNA_PROCESSOR_DIR=/path/to/old/docprocessor python ... # benchmark another revision
"""
import io
import json
import os
import sys
import time
from pathlib import Path

import fitz
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
PROCESSOR_DIR = Path(os.environ.get("BOOKUNA_PROCESSOR_DIR") or ROOT / "kwinest" / "docprocessor")
sys.path.insert(0, str(PROCESSOR_DIR))

import app as processor  # noqa: E402

OWN = {"name": "Kwinest", "tradeName": "", "kvk": "11223344", "vat": "NL001122334B01"}
OWN_BLOCK = ["Kwinest", "t.a.v. K. Phetmanee", "Teststraat 1", "1234 AB Amsterdam"]

FIELDS = (
    "documentType", "appParty", "supplierName", "customerName", "supplierKvk",
    "invoiceNumber", "invoiceDate", "dueDate", "total", "vatTotal", "amountDue",
    "currency", "vatTreatment",
)


def pdf(pages, *, scanned=False, blur=False):
    """pages: list of block lists; a block is (x, y, lines[, fontsize])."""
    doc = fitz.open()
    for blocks in pages:
        page = doc.new_page(width=595, height=842)
        # A logo is an image without a text layer.
        page.draw_rect(fitz.Rect(40, 25, 150, 60), color=(0.1, 0.4, 0.8), fill=(0.1, 0.4, 0.8))
        for block in blocks:
            x, y, lines = block[:3]
            size = block[3] if len(block) > 3 else 10
            for i, line in enumerate(lines):
                page.insert_text((x, y + i * (size + 4)), line, fontsize=size, fontname="helv")
    if scanned:
        out = fitz.open()
        for page in doc:
            pix = page.get_pixmap(dpi=200)
            img = Image.open(io.BytesIO(pix.tobytes("png"))).convert("L")
            if blur:
                img = img.filter(ImageFilter.GaussianBlur(1.1)).rotate(1.2, expand=True, fillcolor=255)
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=70 if blur else 88)
            if blur:
                return buf.getvalue(), "image/jpeg", "bon.jpg"
            p = out.new_page(width=595, height=842)
            p.insert_image(p.rect, stream=buf.getvalue())
        raw = out.tobytes()
        out.close()
        doc.close()
        return raw, "application/pdf", "scan.pdf"
    raw = doc.tobytes()
    doc.close()
    return raw, "application/pdf", "factuur.pdf"


def totals(sub="206,61", vat="43,38", total="249,99", rate="21", cur="€"):
    return [f"Subtotaal excl. btw   {cur} {sub}", f"Btw {rate}%   {cur} {vat}", f"Totaal   {cur} {total}"]


def expected(**kw):
    base = {
        "documentType": "purchase_invoice", "appParty": None, "supplierName": None, "customerName": None,
        "supplierKvk": None, "invoiceNumber": None, "invoiceDate": None, "dueDate": None,
        "total": None, "vatTotal": None, "amountDue": None, "currency": "EUR", "vatTreatment": "standard",
    }
    base.update(kw)
    if base["appParty"] is None:
        base["appParty"] = base["customerName"] if base["documentType"] == "sales_invoice" else base["supplierName"]
    return base


def scenarios():
    s = []
    # 0. The example from the brief: supplier header, "Factuur aan" own company.
    s.append(("00 Coolblue voorbeeld (Factuur aan)", pdf([[
        (40, 50, ["Coolblue B.V.", "Weena 664", "3012 CN Rotterdam", "KvK 24304000", "Btw NL811959366B01"], 11),
        (40, 160, ["FACTUUR"], 16),
        (40, 200, ["Factuur aan:"] + OWN_BLOCK),
        (360, 200, ["Factuurnummer: CB-2026-184", "Factuurdatum: 08-10-2026", "Vervaldatum: 22-10-2026"]),
        (40, 330, ["Omschrijving                         Bedrag", "Monitor 27 inch                     € 206,61"]),
        (320, 400, totals()),
    ]]), expected(supplierName="Coolblue B.V.", customerName="Kwinest", supplierKvk="24304000",
                  invoiceNumber="CB-2026-184", invoiceDate="2026-10-08", dueDate="2026-10-22",
                  total=249.99, vatTotal=43.38)))
    # 1. Supplier name on top, customer below without any label.
    s.append(("01 Leverancier boven, klant eronder (geen label)", pdf([[
        (40, 50, ["Bakkerij Noord B.V.", "Dorpsstraat 5", "9711 AA Groningen", "KvK 74542893"], 11),
        (40, 150, OWN_BLOCK),
        (40, 230, ["Factuur"], 16),
        (40, 260, ["Factuurnummer: BN-0042", "Factuurdatum: 02-10-2026"]),
        (320, 320, totals("100,00", "9,00", "109,00", "9")),
    ]]), expected(supplierName="Bakkerij Noord B.V.", customerName="Kwinest", supplierKvk="74542893",
                  invoiceNumber="BN-0042", invoiceDate="2026-10-02", total=109.0, vatTotal=9.0)))
    # 2. Own company printed first (window envelope position), supplier top right.
    s.append(("02 Eigen bedrijf bovenaan als ontvanger", pdf([[
        (340, 50, ["Drukkerij Zuid B.V.", "Industrieweg 12", "5611 AB Eindhoven", "KvK 61234567", "Btw NL861234567B01"]),
        (40, 70, OWN_BLOCK),
        (40, 190, ["FACTUUR"], 16),
        (40, 220, ["Factuurnummer: DZ-2026-311", "Factuurdatum: 05-10-2026", "Vervaldatum: 04-11-2026"]),
        (320, 300, totals("400,00", "84,00", "484,00")),
    ]]), expected(supplierName="Drukkerij Zuid B.V.", customerName="Kwinest", supplierKvk="61234567",
                  invoiceNumber="DZ-2026-311", invoiceDate="2026-10-05", dueDate="2026-11-04",
                  total=484.0, vatTotal=84.0)))
    # 3. Supplier only in the footer.
    s.append(("03 Leverancier alleen in footer", pdf([[
        (40, 60, ["FACTUUR"], 16),
        (40, 100, ["Aan:"] + OWN_BLOCK),
        (340, 100, ["Factuurnummer: SL-1009", "Factuurdatum: 01-10-2026"]),
        (320, 260, totals("250,00", "52,50", "302,50")),
        (40, 780, ["Studio Lens B.V. | KvK 87654321 | Btw NL876543210B01 | IBAN NL91ABNA0417164300"], 8),
    ]]), expected(supplierName="Studio Lens B.V.", customerName="Kwinest", supplierKvk="87654321",
                  invoiceNumber="SL-1009", invoiceDate="2026-10-01", total=302.5, vatTotal=52.5)))
    # 4. Two company names side by side (Van / Aan columns on one row).
    s.append(("04 Twee bedrijfsnamen naast elkaar", pdf([[
        (40, 50, ["FACTUUR"], 16),
        (40, 90, ["Van:", "Hosting Plus B.V.", "Serverweg 3", "3542 AD Utrecht", "KvK 30111222"]),
        (320, 90, ["Aan:"] + OWN_BLOCK + ["KvK 11223344"]),
        (40, 200, ["Factuurnummer: HP-77812", "Factuurdatum: 30-09-2026"]),
        (320, 260, totals("50,00", "10,50", "60,50")),
    ]]), expected(supplierName="Hosting Plus B.V.", customerName="Kwinest", supplierKvk="30111222",
                  invoiceNumber="HP-77812", invoiceDate="2026-09-30", total=60.5, vatTotal=10.5)))
    # 5. Two KvK numbers: own KvK printed first in the customer block.
    s.append(("05 Twee KVK-nummers", pdf([[
        (40, 50, ["Factuur aan:"] + OWN_BLOCK + ["KvK 11223344"]),
        (340, 50, ["Leverancier:", "Groen Advies B.V.", "Parklaan 8", "2011 KX Haarlem", "KvK 34567890"]),
        (40, 190, ["FACTUUR"], 16),
        (40, 220, ["Factuurnummer: GA-2026-015", "Factuurdatum: 06-10-2026"]),
        (320, 290, totals("800,00", "168,00", "968,00")),
    ]]), expected(supplierName="Groen Advies B.V.", customerName="Kwinest", supplierKvk="34567890",
                  invoiceNumber="GA-2026-015", invoiceDate="2026-10-06", total=968.0, vatTotal=168.0)))
    # 6. Customer number that looks like an invoice number.
    s.append(("06 Factuurnummer lijkt op klantnummer", pdf([[
        (40, 50, ["Telecom Direct B.V.", "Belweg 1", "1000 AA Amsterdam", "KvK 33445566"], 11),
        (40, 140, ["Factuur aan:"] + OWN_BLOCK),
        (340, 140, ["Klantnummer: 2026-0184", "Factuurnummer: 2026-1093", "Factuurdatum: 01-10-2026",
                    "Betalingskenmerk: 7001 2345 6789 0123"]),
        (320, 280, totals("40,00", "8,40", "48,40")),
    ]]), expected(supplierName="Telecom Direct B.V.", customerName="Kwinest", supplierKvk="33445566",
                  invoiceNumber="2026-1093", invoiceDate="2026-10-01", total=48.4, vatTotal=8.4)))
    # 7. German invoice with German VAT charged (foreign is not reverse charge).
    s.append(("07 Buitenlandse factuur (DE, 19% MwSt)", pdf([[
        (40, 50, ["Rechnungssteller:", "Muster Technik GmbH", "Hauptstrasse 10", "10115 Berlin", "USt-IdNr.: DE123456789"]),
        (340, 50, ["Rechnungsempfänger:"] + OWN_BLOCK),
        (40, 170, ["RECHNUNG"], 16),
        (40, 200, ["Rechnungsnummer: MT-55120", "Rechnungsdatum: 03.10.2026"]),
        (320, 270, ["Nettobetrag   EUR 100,00", "MwSt 19%   EUR 19,00", "Gesamtbetrag   EUR 119,00"]),
    ]]), expected(supplierName="Muster Technik GmbH", customerName="Kwinest", invoiceNumber="MT-55120",
                  invoiceDate="2026-10-03", total=119.0, vatTotal=19.0, vatTreatment=None)))
    # 7b. English invoice in USD, Bill to / From.
    s.append(("07b Buitenlandse factuur (USD, Bill to)", pdf([[
        (40, 50, ["INVOICE"], 16),
        (40, 90, ["From:", "Design Tools Inc.", "100 Market Street", "San Francisco, CA 94105"]),
        (320, 90, ["Bill to:"] + OWN_BLOCK[:1] + ["Amsterdam, Netherlands"]),
        (40, 190, ["Invoice number: DT-2026-8812", "Invoice date: 2026-10-01"]),
        (320, 250, ["Subtotal   USD 15.00", "Tax   USD 0.00", "Total   USD 15.00"]),
    ]]), expected(supplierName="Design Tools Inc.", customerName="Kwinest", invoiceNumber="DT-2026-8812",
                  invoiceDate="2026-10-01", total=15.0, vatTotal=0.0, currency="USD", vatTreatment=None)))
    # 8. Credit note from a supplier.
    s.append(("08 Creditnota", pdf([[
        (40, 50, ["Kantoorshop B.V.", "Papierweg 4", "3800 AA Amersfoort", "KvK 32109876"], 11),
        (40, 140, ["CREDITNOTA"], 16),
        (40, 175, ["Klant:"] + OWN_BLOCK),
        (340, 175, ["Creditnotanummer: CN-2026-007", "Datum: 04-10-2026", "Betreft factuur: KS-2026-140"]),
        (320, 300, ["Subtotaal   € -50,00", "Btw 21%   € -10,50", "Totaal   € -60,50"]),
    ]]), expected(documentType="credit_invoice", supplierName="Kantoorshop B.V.", customerName="Kwinest",
                  supplierKvk="32109876", invoiceNumber="CN-2026-007", invoiceDate="2026-10-04",
                  total=-60.5, vatTotal=-10.5, vatTreatment=None)))
    # 9. Self-billing: the platform (customer) issues the invoice on behalf of Kwinest.
    s.append(("09 Self-billing", pdf([[
        (40, 50, ["Bezorgplatform B.V.", "Logistiekweg 9", "3011 AB Rotterdam", "KvK 55667788"], 11),
        (40, 140, ["SELF-BILLING FACTUUR"], 16),
        (40, 165, ["Factuur uitgereikt door afnemer"]),
        (40, 195, ["Leverancier:"] + OWN_BLOCK + ["KvK 11223344"]),
        (340, 195, ["Factuurnummer: SB-2026-0912", "Factuurdatum: 30-09-2026"]),
        (320, 330, totals("500,00", "105,00", "605,00")),
    ]]), expected(documentType="sales_invoice", supplierName="Kwinest", customerName="Bezorgplatform B.V.",
                  supplierKvk="11223344", invoiceNumber="SB-2026-0912", invoiceDate="2026-09-30", total=605.0, vatTotal=105.0)))
    # 10. Factoring: payment goes to a factoring company, supplier stays the issuer.
    s.append(("10 Factoring (betaling aan factormaatschappij)", pdf([[
        (40, 50, ["Bouwmaterialen Oost B.V.", "Havenweg 2", "7411 AA Deventer", "KvK 08123456"], 11),
        (40, 140, ["Factuur aan:"] + OWN_BLOCK),
        (340, 140, ["Factuurnummer: BO-88001", "Factuurdatum: 29-09-2026"]),
        (320, 260, totals("1.000,00", "210,00", "1.210,00")),
        (40, 360, ["Deze vordering is gecedeerd aan Factor Finance B.V.",
                   "Betaling uitsluitend op IBAN NL20INGB0001234567 t.n.v. Factor Finance B.V."], 9),
    ]]), expected(supplierName="Bouwmaterialen Oost B.V.", customerName="Kwinest", supplierKvk="08123456",
                  invoiceNumber="BO-88001", invoiceDate="2026-09-29", total=1210.0, vatTotal=210.0)))
    # 11. Multiple VAT rates.
    s.append(("11 Meerdere btw-tarieven", pdf([[
        (40, 50, ["Horeca Groothandel B.V.", "Marktplein 1", "6811 AA Arnhem", "KvK 09876543"], 11),
        (40, 140, ["Factuur aan:"] + OWN_BLOCK),
        (340, 140, ["Factuurnummer: HG-4410", "Factuurdatum: 07-10-2026"]),
        (320, 270, ["Subtotaal excl. btw   € 200,00", "Btw 9% over € 100,00   € 9,00", "Btw 21% over € 100,00   € 21,00",
                    "Totaal   € 230,00"]),
    ]]), expected(supplierName="Horeca Groothandel B.V.", customerName="Kwinest", supplierKvk="09876543",
                  invoiceNumber="HG-4410", invoiceDate="2026-10-07", total=230.0, vatTotal=30.0)))
    # 12. Multi-page invoice: parties on page 1, totals on page 2.
    s.append(("12 Factuur met meerdere pagina's", pdf([
        [
            (40, 50, ["Installatiebedrijf West B.V.", "Kanaalweg 7", "2312 AA Leiden", "KvK 28123456"], 11),
            (40, 140, ["Factuur aan:"] + OWN_BLOCK),
            (340, 140, ["Factuurnummer: IW-2026-221", "Factuurdatum: 03-10-2026", "Pagina 1 van 2"]),
            (40, 260, [f"Werkzaamheden regel {i}        € 50,00" for i in range(1, 10)]),
        ],
        [
            (40, 50, ["Installatiebedrijf West B.V. - factuur IW-2026-221 - pagina 2 van 2"], 8),
            (40, 90, [f"Materiaal regel {i}        € 50,00" for i in range(1, 5)]),
            (320, 220, totals("650,00", "136,50", "786,50")),
        ],
    ]), expected(supplierName="Installatiebedrijf West B.V.", customerName="Kwinest", supplierKvk="28123456",
                 invoiceNumber="IW-2026-221", invoiceDate="2026-10-03", total=786.5, vatTotal=136.5)))
    # 13. Poorly scanned receipt photo (OCR path).
    s.append(("13 Slecht gescande bon (foto)", pdf([[
        (150, 60, ["SUPERMARKT DE HOEK", "Kerkstraat 21", "3511 AB Utrecht"], 14),
        (150, 150, ["Kassabon 08-10-2026 14:32"], 12),
        (150, 190, ["Koffie          4,50", "Melk            1,30", "Brood           3,20"], 12),
        (150, 260, ["Totaal         9,00", "Btw 9%          0,74", "PIN            9,00"], 12),
        (150, 340, ["Bedankt en tot ziens"], 12),
    ]], scanned=True, blur=True), expected(documentType="receipt", supplierName="SUPERMARKT DE HOEK",
                                          invoiceDate="2026-10-08", total=9.0, vatTotal=0.74, vatTreatment=None)))
    # 14. Sales invoice: own company is the issuer.
    s.append(("14 Verkoopfactuur, eigen bedrijf is uitgever", pdf([[
        (40, 50, OWN_BLOCK[:1] + ["Teststraat 1", "1234 AB Amsterdam", "KvK 11223344", "Btw NL001122334B01"], 11),
        (40, 150, ["Factuur aan:", "Bakker Media B.V.", "Mediapark 4", "1217 WE Hilversum"]),
        (340, 150, ["Factuurnummer: 2026-031", "Factuurdatum: 06-10-2026", "Vervaldatum: 20-10-2026"]),
        (320, 280, totals("750,00", "157,50", "907,50")),
    ]]), expected(documentType="sales_invoice", supplierName="Kwinest", customerName="Bakker Media B.V.",
                  supplierKvk="11223344", invoiceNumber="2026-031", invoiceDate="2026-10-06", dueDate="2026-10-20",
                  total=907.5, vatTotal=157.5)))
    # 15. No supplier label anywhere: logo name top right, own address left.
    s.append(("15 Geen duidelijk leverancierslabel", pdf([[
        (360, 40, ["SCHILDERSBEDRIJF", "VAN DAM"], 16),
        (360, 85, ["Verfstraat 3", "4811 AA Breda", "info@vandam-schilders.example"]),
        (40, 110, OWN_BLOCK),
        (40, 210, ["Factuurnummer: 1188", "Factuurdatum: 01-10-2026", "Klantnummer: 1187"]),
        (320, 290, totals("1.200,00", "252,00", "1.452,00")),
    ]]), expected(supplierName="Schildersbedrijf Van Dam", customerName="Kwinest", invoiceNumber="1188", invoiceDate="2026-10-01",
                  total=1452.0, vatTotal=252.0)))
    # 16. Amount due differs from invoice total.
    s.append(("16 Openstaand bedrag is geen factuurtotaal", pdf([[
        (40, 50, ["Opleidingen Centrum B.V.", "Leerweg 2", "3584 AA Utrecht", "KvK 30999888"], 11),
        (40, 140, ["Factuur aan:"] + OWN_BLOCK),
        (340, 140, ["Factuurnummer: OC-512", "Factuurdatum: 15-09-2026", "Vervaldatum: 15-10-2026"]),
        (320, 270, totals("1.000,00", "210,00", "1.210,00") + ["Reeds betaald   € 605,00", "Nog te betalen   € 605,00"]),
    ]]), expected(supplierName="Opleidingen Centrum B.V.", customerName="Kwinest", supplierKvk="30999888",
                  invoiceNumber="OC-512", invoiceDate="2026-09-15", dueDate="2026-10-15", total=1210.0,
                  vatTotal=210.0, amountDue=605.0)))
    # 17. Scanned PDF of scenario 2 (own company first) through OCR.
    raw2 = s[2][1]
    s.append(("17 Scan: eigen bedrijf bovenaan als ontvanger", pdf([[
        (340, 50, ["Drukkerij Zuid B.V.", "Industrieweg 12", "5611 AB Eindhoven", "KvK 61234567"]),
        (40, 70, OWN_BLOCK),
        (40, 190, ["FACTUUR"], 16),
        (40, 220, ["Factuurnummer: DZ-2026-311", "Factuurdatum: 05-10-2026"]),
        (320, 300, totals("400,00", "84,00", "484,00")),
    ]], scanned=True), expected(supplierName="Drukkerij Zuid B.V.", customerName="Kwinest", supplierKvk="61234567",
                                invoiceNumber="DZ-2026-311", invoiceDate="2026-10-05", total=484.0, vatTotal=84.0)))
    del raw2
    # 18. Webshop invoice: supplier name only in a logo image and the footer;
    #     own company in "Factuuradres" and "Afleveradres" side by side.
    webshop = [
        (40, 110, ["Factuuradres"] + OWN_BLOCK),
        (300, 110, ["Afleveradres"] + OWN_BLOCK),
        (40, 220, ["Factuur"], 16),
        (40, 250, ["Factuurnummer: CB-2026-184", "Factuurdatum: 08-10-2026", "Klantnummer: 4410293", "Ordernummer: 1000293812"]),
        (320, 330, totals()),
        (40, 790, ["Coolblue B.V. - Weena 664 - 3012 CN Rotterdam - KvK 24304000 - Btw NL811959366B01"], 8),
    ]
    s.append(("18 Webshop: naam alleen in logo en footer", pdf([webshop]),
              expected(supplierName="Coolblue B.V.", customerName="Kwinest", supplierKvk="24304000",
                       invoiceNumber="CB-2026-184", invoiceDate="2026-10-08", total=249.99, vatTotal=43.38)))
    # 19. Same webshop invoice, addressed to the owner as a person.
    person = ["Kwin Phetmanee", "Teststraat 1", "1234 AB Amsterdam"]
    s.append(("19 Webshop: factuur op naam van de eigenaar", pdf([[
        (40, 110, ["Factuuradres"] + person),
        (300, 110, ["Afleveradres"] + person),
        (40, 220, ["Factuur"], 16),
        (40, 250, ["Factuurnummer: CB-2026-185", "Factuurdatum: 08-10-2026", "Klantnummer: 4410293"]),
        (320, 330, totals()),
        (40, 790, ["Coolblue B.V. - Weena 664 - 3012 CN Rotterdam - KvK 24304000 - Btw NL811959366B01"], 8),
    ]]), expected(supplierName="Coolblue B.V.", customerName="Kwin Phetmanee", supplierKvk="24304000",
                  invoiceNumber="CB-2026-185", invoiceDate="2026-10-08", total=249.99, vatTotal=43.38)))
    # 20. Marketplace: "Verkocht door" names the seller, platform name on top.
    s.append(("20 Marktplaats: verkocht door", pdf([[
        (40, 40, ["Online Marktplaats"], 18),
        (40, 90, ["Factuuradres:"] + OWN_BLOCK),
        (330, 90, ["Verkocht door:", "Gadget Store B.V.", "Winkelweg 1", "1011 AA Amsterdam", "Btw NL812345678B01"]),
        (40, 220, ["Factuurnummer: GS-2026-0091", "Factuurdatum: 02-10-2026", "Bestelnummer: 5521-9982"]),
        (320, 300, totals("82,64", "17,36", "100,00")),
    ]]), expected(supplierName="Gadget Store B.V.", customerName="Kwinest", invoiceNumber="GS-2026-0091",
                  invoiceDate="2026-10-02", total=100.0, vatTotal=17.36)))
    # 21. Scanned webshop invoice (OCR path).
    s.append(("21 Scan: webshop, naam in footer", pdf([webshop], scanned=True),
              expected(supplierName="Coolblue B.V.", customerName="Kwinest", supplierKvk="24304000",
                       invoiceNumber="CB-2026-184", invoiceDate="2026-10-08", total=249.99, vatTotal=43.38)))
    # 22. Invoice to / Ship to, supplier header without legal form.
    s.append(("22 Invoice to / Ship to, naam zonder rechtsvorm", pdf([[
        (40, 40, ["Fietsenmaker Jansen"], 18),
        (40, 70, ["Spoorlaan 4, 5038 CB Tilburg  |  KvK 18123456"]),
        (40, 120, ["Invoice to:"] + OWN_BLOCK),
        (320, 120, ["Ship to:"] + OWN_BLOCK),
        (40, 230, ["Invoice number: FJ-311", "Invoice date: 04-10-2026"]),
        (320, 300, totals("300,00", "63,00", "363,00")),
    ]]), expected(supplierName="Fietsenmaker Jansen", customerName="Kwinest", supplierKvk="18123456",
                  invoiceNumber="FJ-311", invoiceDate="2026-10-04", total=363.0, vatTotal=63.0)))
    # 23. Letter layout addressed to the owner as a person (company data does not
    #     contain that name), issuer details only in the signature/footer.
    s.append(("23 Briefstijl op naam van de eigenaar", pdf([[
        (40, 60, ["Kwin Phetmanee", "Teststraat 1", "1234 AB Amsterdam"]),
        (40, 150, ["Factuur"], 16),
        (40, 180, ["Factuurnummer: 2026-78", "Factuurdatum: 04-10-2026"]),
        (320, 240, totals("80,00", "16,80", "96,80")),
        (40, 700, ["Met vriendelijke groet,", "Klusbedrijf Peters", "KvK 70123457 | IBAN NL91ABNA0417164300"]),
    ]]), expected(supplierName=None, customerName="Kwin Phetmanee", supplierKvk="70123457", invoiceNumber="2026-78",
                  invoiceDate="2026-10-04", total=96.8, vatTotal=16.8)))
    s.extend(holdout())
    return s


def holdout():
    """Held-out variants written after the first fix round and not tuned on."""
    h = []
    h.append(("H1 Inline 'Factuur aan', leverancier rechts uitgelijnd", pdf([[
        (420, 50, ["Webdesign Noord"], 12), (440, 66, ["Hoofdstraat 3"]), (430, 80, ["9700 AB Groningen"]),
        (40, 120, ["Factuur aan: Kwinest", "Teststraat 1", "1234 AB Amsterdam"]),
        (40, 200, ["Factuurnummer: WN-2026-12", "Factuurdatum: 01-10-2026"]),
        (320, 260, totals("100,00", "21,00", "121,00")),
    ]]), expected(supplierName="Webdesign Noord", customerName="Kwinest", invoiceNumber="WN-2026-12",
                  invoiceDate="2026-10-01", total=121.0, vatTotal=21.0)))
    h.append(("H2 Eigen naam verkeerd gelezen (Kwlnest)", pdf([[
        (340, 50, ["Copyshop Centrum", "Stationsplein 2", "3511 ED Utrecht", "www.copyshop.example"]),
        (40, 70, ["Kwlnest", "Teststraat 1", "1234 AB Amsterdam"]),
        (40, 170, ["Factuurnummer: CC-901", "Factuurdatum: 03-10-2026"]),
        (320, 240, totals("20,00", "4,20", "24,20")),
    ]]), expected(supplierName="Copyshop Centrum", customerName="Kwlnest", invoiceNumber="CC-901",
                  invoiceDate="2026-10-03", total=24.2, vatTotal=4.2)))
    h.append(("H3 Engelse factuur in GBP", pdf([[
        (40, 50, ["Brightline Software Ltd", "1 King Street", "London EC2V 8AU", "VAT: GB123456789"]),
        (330, 50, ["Invoice to:"] + OWN_BLOCK[:1] + ["Amsterdam, The Netherlands"]),
        (40, 160, ["INVOICE"], 16),
        (40, 190, ["Invoice No: BL-4471", "Date: 2026-10-02"]),
        (320, 250, ["Subtotal   GBP 40.00", "VAT 0%   GBP 0.00", "Total   GBP 40.00"]),
    ]]), expected(supplierName="Brightline Software Ltd", customerName="Kwinest", invoiceNumber="BL-4471",
                  invoiceDate="2026-10-02", total=40.0, vatTotal=0.0, currency="GBP", vatTreatment=None)))
    h.append(("H4 Eigen creditnota aan klant", pdf([[
        (40, 50, ["Kwinest", "Teststraat 1", "1234 AB Amsterdam", "KvK 11223344", "Btw NL001122334B01"], 11),
        (40, 150, ["CREDITNOTA"], 16),
        (40, 180, ["Aan:", "Bakker Media B.V.", "Mediapark 4", "1217 WE Hilversum"]),
        (340, 180, ["Creditnotanummer: 2026-C02", "Datum: 07-10-2026", "Betreft factuur: 2026-031"]),
        (320, 300, ["Subtotaal   € -100,00", "Btw 21%   € -21,00", "Totaal   € -121,00"]),
    ]]), expected(documentType="credit_invoice", supplierName="Kwinest", customerName="Bakker Media B.V.",
                  appParty="Bakker Media B.V.", supplierKvk="11223344", invoiceNumber="2026-C02", invoiceDate="2026-10-07",
                  total=-121.0, vatTotal=-21.0, vatTreatment=None)))
    h.append(("H5 Twee naamblokken zonder bewijs (niet eigen bedrijf)", pdf([[
        (40, 50, ["Jansen Klussen", "Dijkweg 4", "1600 AA Enkhuizen"]),
        (340, 50, ["Pietersen Holding", "Laanweg 9", "1700 AA Heerhugowaard"]),
        (40, 150, ["Factuurnummer: 55", "Factuurdatum: 02-10-2026"]),
        (320, 220, totals("100,00", "21,00", "121,00")),
    ]]), expected(supplierName=None, customerName=None, invoiceNumber="55", invoiceDate="2026-10-02",
                  total=121.0, vatTotal=21.0)))
    h.append(("H6 Klant boven, leverancier-label onderaan", pdf([[
        (40, 50, ["Klant:"] + OWN_BLOCK),
        (40, 140, ["Factuurnummer: TR-88", "Factuurdatum: 06-10-2026"]),
        (320, 210, totals("60,00", "12,60", "72,60")),
        (40, 330, ["Leverancier:", "Tuinservice Ruud", "Bosweg 1", "6700 AA Wageningen", "KvK 09123456"]),
    ]]), expected(supplierName="Tuinservice Ruud", customerName="Kwinest", supplierKvk="09123456",
                  invoiceNumber="TR-88", invoiceDate="2026-10-06", total=72.6, vatTotal=12.6)))
    h.append(("H7 Factoring met begunstigde", pdf([[
        (40, 50, ["Transport Snel B.V.", "Vaartweg 3", "4000 AA Tiel", "KvK 11998877"], 11),
        (40, 140, ["Factuur aan:"] + OWN_BLOCK),
        (340, 140, ["Factuurnummer: TS-2026-77", "Factuurdatum: 02-10-2026"]),
        (320, 250, totals("500,00", "105,00", "605,00")),
        (40, 340, ["Begunstigde: Factor Finance B.V.", "IBAN NL20INGB0001234567"], 9),
    ]]), expected(supplierName="Transport Snel B.V.", customerName="Kwinest", supplierKvk="11998877",
                  invoiceNumber="TS-2026-77", invoiceDate="2026-10-02", total=605.0, vatTotal=105.0)))
    h.append(("H8 Factuur- en afleveradres, merknaam bovenaan", pdf([[
        (40, 70, ["MediaWinkel"], 18),
        (40, 120, ["Factuuradres"] + OWN_BLOCK),
        (300, 120, ["Afleveradres", "Magazijn Kwinest", "Havenstraat 8", "1234 CD Amsterdam"]),
        (40, 230, ["Factuurnummer: MW-310022", "Factuurdatum: 05-10-2026"]),
        (320, 300, totals("165,29", "34,71", "200,00")),
        (40, 790, ["MediaWinkel Nederland B.V. | KvK 34156789 | Btw NL812345679B01"], 8),
    ]]), expected(supplierName="MediaWinkel Nederland B.V.", customerName="Kwinest", supplierKvk="34156789",
                  invoiceNumber="MW-310022", invoiceDate="2026-10-05", total=200.0, vatTotal=34.71)))
    h.append(("H9 Briefstijl: eigen adres boven, leverancier onderaan", pdf([[
        (40, 60, OWN_BLOCK),
        (40, 150, ["Factuur"], 16),
        (40, 180, ["Factuurnummer: 2026-77", "Factuurdatum: 04-10-2026"]),
        (320, 240, totals("80,00", "16,80", "96,80")),
        (40, 700, ["Met vriendelijke groet,", "Fotografie Lisa de Wit", "KvK 70123456 | IBAN NL91ABNA0417164300"]),
    ]]), expected(supplierName="Fotografie Lisa de Wit", customerName="Kwinest", supplierKvk="70123456", invoiceNumber="2026-77",
                  invoiceDate="2026-10-04", total=96.8, vatTotal=16.8)))
    h.append(("H10 Scan: Van/Aan naast elkaar", pdf([[
        (40, 50, ["FACTUUR"], 16),
        (40, 90, ["Van:", "Hosting Plus B.V.", "Serverweg 3", "3542 AD Utrecht", "KvK 30111222"]),
        (320, 90, ["Aan:"] + OWN_BLOCK + ["KvK 11223344"]),
        (40, 200, ["Factuurnummer: HP-77812", "Factuurdatum: 30-09-2026"]),
        (320, 260, totals("50,00", "10,50", "60,50")),
    ]], scanned=True), expected(supplierName="Hosting Plus B.V.", customerName="Kwinest", supplierKvk="30111222",
                                invoiceNumber="HP-77812", invoiceDate="2026-09-30", total=60.5, vatTotal=10.5)))
    return h


def norm_name(v):
    t = "".join(ch for ch in str(v or "").casefold() if ch.isalnum())
    for suffix in ("bv", "gmbh", "inc"):
        if t.endswith(suffix):
            t = t[: -len(suffix)]
    return t


def actual(data):
    d = data
    dtype = d["documentType"]
    # Same mapping as the app (processorAnalysisToCandidate): a sales invoice, or
    # a credit note issued by the own company, shows the customer as counterparty.
    own_credit = dtype == "credit_invoice" and norm_name(d["supplier"]["name"]) == norm_name(OWN["name"])
    party = d["customer"]["name"] if dtype == "sales_invoice" or own_credit else d["supplier"]["name"]
    amounts = d["amounts"]
    return {
        "documentType": dtype,
        "appParty": party,
        "supplierName": d["supplier"]["name"],
        "customerName": d["customer"]["name"],
        "supplierKvk": d["supplier"]["kvk"],
        "invoiceNumber": d["invoice"]["invoiceNumber"],
        "invoiceDate": d["invoice"]["invoiceDate"],
        "dueDate": d["invoice"]["dueDate"],
        "total": amounts["total"],
        "vatTotal": amounts["vatTotal"],
        "amountDue": amounts.get("amountDue") if amounts.get("amountDue") is not None else amounts.get("outstandingAmount"),
        "currency": amounts["currency"],
        "vatTreatment": amounts.get("accountingVatTreatment"),
    }


def grade(field, exp, act):
    if exp is None and field not in ("supplierName", "appParty", "supplierKvk", "amountDue", "dueDate"):
        return None  # not applicable
    if exp is None:
        # Expected "Controle nodig": an empty field is correct, any value is wrong.
        return "CORRECT" if act in (None, "") else "WRONG"
    if act in (None, ""):
        return "MISSING"
    if isinstance(exp, float):
        try:
            return "CORRECT" if abs(float(act) - exp) < 0.005 else "WRONG"
        except Exception:
            return "WRONG"
    if str(act) == str(exp):
        return "CORRECT"
    if field in ("appParty", "supplierName", "customerName") and norm_name(act) == norm_name(exp):
        return "NORMALIZED"
    if field == "supplierKvk" and "".join(ch for ch in str(act) if ch.isdigit()) == exp:
        return "NORMALIZED"
    return "WRONG"


def run(company=OWN):
    processor.EXTERNAL_AI_ENABLED = False
    rows = []
    totals_ = {f: {"CORRECT": 0, "NORMALIZED": 0, "MISSING": 0, "WRONG": 0} for f in FIELDS}
    only = [x for x in os.environ.get("BOOKUNA_PARTY_ONLY", "").split(",") if x]
    for name, (raw, ctype, fname), exp in scenarios():
        if only and not any(name.startswith(x + " ") for x in only):
            continue
        t0 = time.perf_counter()
        out = processor.analyze_document(raw, fname, ctype, dict(company), [], allow_external_ai=False)
        ms = round((time.perf_counter() - t0) * 1000)
        data = out["data"]
        act = actual(data)
        fields = {}
        for f in FIELDS:
            g = grade(f, exp[f], act[f])
            if g is None:
                continue
            totals_[f][g] += 1
            fields[f] = {"grade": g, "expected": exp[f], "actual": act[f]}
        routing = (data.get("processing") or {}).get("reviewRouting") or {}
        rows.append({"scenario": name, "ms": ms, "fields": fields,
                     "reviewFields": routing.get("fields") or [], "warnings": data.get("warnings") or []})
    summary = {k: sum(v[k] for v in totals_.values()) for k in ("CORRECT", "NORMALIZED", "MISSING", "WRONG")}
    own_as_supplier = [r["scenario"] for r in rows
                       if r["fields"].get("appParty", {}).get("grade") == "WRONG"
                       and norm_name(r["fields"]["appParty"]["actual"]) == norm_name(OWN["name"])]
    return {"processorDir": str(PROCESSOR_DIR), "company": {k: bool(v) for k, v in company.items()},
            "summary": summary, "perField": totals_, "ownCompanyShownAsCounterparty": own_as_supplier, "scenarios": rows}


def print_report(rep, title):
    print(f"\n== {title} ({rep['processorDir']})")
    print("summary", rep["summary"], "own company as counterparty:", len(rep["ownCompanyShownAsCounterparty"]))
    for r in rep["scenarios"]:
        bad = {f: (v["expected"], v["actual"]) for f, v in r["fields"].items() if v["grade"] in ("WRONG", "MISSING")}
        flag = "ok " if not bad else "   "
        print(f"{flag}{r['scenario']}: " + "; ".join(f"{f} {g[0]!r}->{g[1]!r}" for f, g in bad.items()))


if __name__ == "__main__":
    reports = {"withCompanyContext": run(OWN), "withoutCompanyContext": run({"name": "", "tradeName": "", "kvk": "", "vat": ""})}
    print_report(reports["withCompanyContext"], "met bedrijfsgegevens")
    print_report(reports["withoutCompanyContext"], "zonder bedrijfsgegevens")
    out = os.environ.get("BOOKUNA_PARTY_REPORT")
    if out:
        Path(out).write_text(json.dumps(reports, indent=2, ensure_ascii=False, default=str))
