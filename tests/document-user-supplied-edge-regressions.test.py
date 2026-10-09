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
    assert [line.rate for line in result.amounts.vatLines] == [20.0], result.model_dump()
    assert processor.money_cents(result.amounts.vatLines[0].taxableAmount) == 135000
    assert processor.money_cents(result.amounts.vatLines[0].vatAmount) == 27000
    assert result.amounts.detectedVatRates == [20.0]
    assert result.amounts.accountingVatTreatment == "review_required"
    assert result.processing["reviewRouting"]["mode"] == "FULL_REVIEW"


def test_total_excluding_tax_row_is_not_read_as_vat_amount():
    # Stripe/Link tax invoice: "Total excluding tax" repeats the net amount and
    # the VAT row also prints its base ("21% on €59.00"). VAT must be 12.39, not 59.00.
    doc = {
        "kind": "pdf",
        "pageCount": 1,
        "text": """--- PAGE 1 ---
Tax Invoice
Invoice number H5H8BFOT-91017
Date of issue October 9, 2026
Date due October 9, 2026
Sold through Link, LLC Bill to
354 Oyster Point Boulevard K Phetmanee
South San Francisco, California 94080 Netherlands
EU OSS VAT EU440000220
€71.39 due October 9, 2026
Description Qty Unit price Tax Amount
Higgsfield Inc. 1 €59.00 21% €59.00
Higgsfield Plus - monthly
Subtotal €59.00
Total excluding tax €59.00
VAT - Netherlands (21% on €59.00) €12.39
Total €71.39
Amount due €71.39
""",
        "tables": [],
        "layout": [],
        "ocrPages": [],
        "warnings": [],
    }
    company = {"name": "K Phetmanee", "country": "NL"}
    result = processor.validate_result(processor.heuristic_extract(doc, "Invoice-H5H8BFOT-91017.pdf", company), company)
    assert processor.money_cents(result.amounts.subtotal) == 5900, result.model_dump()
    assert processor.money_cents(result.amounts.vatTotal) == 1239, result.model_dump()
    assert processor.money_cents(result.amounts.total) == 7139, result.model_dump()
    assert [processor.money_cents(v.vatAmount) for v in result.amounts.vatLines] == [1239], result.model_dump()


def _temper_sales_invoice_pdf():
    # Anonymized layout of a Temper/Finqle invoice: the user's own company issues it
    # (top right, with its own BTW/KvK), the customer sits under "Debiteur:", and the
    # hours table header starts with "Datum: Van: Tot: ...".
    import fitz
    S = 595 / 845
    X = lambda px: (px - 38) * S
    Y = lambda py: (py - 297) * S
    items=[
    (75,370,"temper",18,False),
    (802,350,"Kwinest",6,False),(795,369,"Arica 139",6,False),(654,387,"2903PD CAPELLE AAN DEN IJSSEL",6,False),(780,406,"Netherlands",6,False),
    (708,427,"BTW #: NL002477565B57",6,False),(755,448,"Reg #: 74542893",6,False),
    (74,483,"FACTUUR MAE24C9-000019",8,False),
    (74,523,"Debiteur:",6,False),(267,523,"Besteld door:",6,False),
    (74,544,"Food Fiësta",6,False),(267,544,"Food Fiësta",6,False),(560,540,"WAARSCHUWING AAN DEBITEUR",6,False),
    (74,567,"Livornostraat 34 1",6,False),(267,567,"Tav:",6,False),(590,560,"Graag verzamelfactuur",6,False),
    (74,589,"1055ZZ AMSTERDAM",6,False),(267,589,"Livornostraat 34-1",6,False),(522,580,"C1359057 betalen om deze factuur te vereffenen",6,False),
    (74,611,"Netherlands",6,False),(267,611,"1055 ZZ Amsterdam",6,False),
    (74,633,"BTW #: NL181453198B01",6,False),(267,633,"Netherlands",6,False),
    (74,655,"Reg #: 62368915",6,False),(267,655,"Dept: Food Fiësta",6,False),
    (95,711,"Factuur #:",5,False),(201,711,"MAE24C9-000019",5,False),(542,711,"Verzamelfactuur:",5,False),(650,711,"C1359057",5,False),
    (95,729,"Project:",5,False),(201,729,"Algemeen",5,False),(542,729,"Datum verzamelfactuur:10-09-2026",5,False),
    (95,746,"PO:",5,False),(201,746,"N/A",5,False),(542,746,"Betalingstermijn:",5,False),(650,746,"14 dagen",5,False),
    (95,765,"Uitgiftedatum:",5,False),(201,765,"10-09-2026",5,False),(542,765,"Vervaldatum:",5,False),(650,765,"24-09-2026",5,False),
    (81,811,"Datum:",5,False),(209,811,"Van:",5,False),(289,811,"Tot:",5,False),(348,811,"Pauzes:",5,False),(436,811,"Uren:",5,False),(509,811,"Tarief:",5,False),(573,811,"Totaal ex:",5,False),(658,811,"BTW %:",5,False),(746,811,"BTW:",5,False),(799,811,"Totaal in:",5,False),
    (81,836,"02-09-2026",5,False),(204,836,"16:30",5,False),(281,836,"21:30",5,False),(340,836,"-00h:10m",5,False),(421,836,"04h:50m",5,False),(504,836,"€ 22,00",5,False),(576,836,"€ 106,33",5,False),(673,836,"21%",5,False),(736,836,"€ 22,33",5,False),(800,836,"€ 128,66",5,False),
    (81,859,"Kassamedewerker Caribische foodtruck",5,False),
    (81,885,"Subtotalen (uren):",5,False),(344,885,"00h:10m",5,False),(421,885,"04h:50m",5,False),(576,885,"€ 106,33",5,False),(736,885,"€ 22,33",5,False),(800,885,"€ 128,66",5,False),
    (81,915,"Totalen:",5,False),(576,915,"€ 106,33",5,False),(736,915,"€ 22,33",5,False),(800,915,"€ 128,66",5,False),
    (470,979,"BTW-tarief:",5,False),(602,979,"Grondslag:",5,False),(702,979,"BTW:",5,False),(764,979,"Totaal incl. BTW:",5,False),
    (470,1004,"BTW - 21%",5,False),(611,1004,"€ 106,33",5,False),(690,1004,"€ 22,33",5,False),(797,1004,"€ 128,66",5,False),
    (470,1034,"Totaal te betalen",8,False),(767,1034,"€ 128,66",8,False),
    (74,1415,"Betalingsinstructies",4,False),
    (74,1428,"Opdrachtnemer maakt gebruik van factoring. In verband daarmee is het vorderingsrecht van deze vordering/factuur door opdrachtnemer overgedragen (verkocht en geleverd",4,False),
    (74,1442,"(gecedeerd) als bedoeld in artikel 3:94 BW) aan Finqle B.V. te Amsterdam. Deze factuur kan daarom uitsluitend bevrijdend worden betaald aan Finqle B.V. Betaling dient binnen 14",4,False),
    (74,1456,"dagen na dagtekening van deze factuur te geschieden door overboeking op IBAN NL43ABNA0129383430 ten name van Finqle B.V. te Amsterdam o.v.v. het factuurnummer",4,False),
    (74,1470,"MAE24C9-000019. Voor download- en alternatieve betalingsopties, ga naar my.finqle.com.",4,False),
    ]
    d = fitz.open()
    pg = d.new_page(width=595, height=842)
    for x, y, t, sz, _ in items:
        pg.insert_text((X(x), Y(y)), t, fontsize=sz, fontname="helv")
    return d.tobytes()


def test_table_header_is_never_a_party_name_and_own_issuer_means_sale():
    raw = _temper_sales_invoice_pdf()
    doc = processor.extract_document("MAE24C9-000019.pdf", "application/pdf", raw)
    own = {"name": "Kwinest", "vat": "NL002477565B57", "kvk": "74542893"}
    result = processor.validate_result(processor.heuristic_extract(doc, "MAE24C9-000019.pdf", own), own)
    assert result.documentType == "sales_invoice", result.model_dump()
    assert result.supplier.name == "Kwinest", result.model_dump()
    assert result.customer.name == "Food Fiësta", result.model_dump()
    assert processor.money_cents(result.amounts.total) == 12866, result.model_dump()
    assert processor.money_cents(result.amounts.vatTotal) == 2233, result.model_dump()
    # Without company details the names are still right; only the direction is unknown.
    plain = processor.validate_result(processor.heuristic_extract(doc, "MAE24C9-000019.pdf", {}), {})
    for name in (plain.supplier.name, plain.customer.name):
        assert name and ":" not in name, plain.model_dump()
