import sys
import unittest
from pathlib import Path

PROCESSOR_DIR = Path(__file__).resolve().parents[1] / "kwinest" / "docprocessor"
sys.path.insert(0, str(PROCESSOR_DIR))

import app  # noqa: E402


COMPANY = {
    "name": "Eigen Studio",
    "tradeName": "Eigen Studio",
    "contactName": "Eigenaar",
    "email": "owner@example.test",
    "kvk": "12345678",
    "vat": "NL123456789B01",
}


def layout(*fragments):
    words = []
    for y, x, text in fragments:
        cursor = x
        for token in text.split():
            width = max(14, len(token) * 5.5)
            words.append({"x0": cursor, "y0": y, "x1": cursor + width, "y1": y + 10, "text": token})
            cursor += width + 5
    return [{"page": 1, "words": words}]


FIXTURES = [
    {
        "id": "check-simple-21",
        "file": "CHECK-regression.pdf",
        "text": """--- PAGE 1 ---
FACTUUR.
Eigenaar Check Netherlands BV
owner@example.test Van Slingelandtstraat 8C
1051CH, AmsterdamFactuurnummer: CHECK-1DFC85046B
The NetherlandsFactuurdatum: 02-09-2026
support@ridecheck.appBetalen voor: 16-09-2026
KVK nummer: 75507048
Beschrijving Aantal BTW Totaal (Incl.)
Moped ride 1 21% €5.55
Transaction fee 1 21% €1.25
Subtotaal €5.63
BTW €1.17
Totaal €6.80
""",
        "tables": [{"page": 1, "rows": [
            ["Moped ride", "1", "21%", "€5.55"],
            ["Transaction fee", "1", "21%", "€1.25"],
        ]}],
        "layout": layout((172, 22, "Eigenaar"), (172, 455, "Check Netherlands BV")),
        "expected": {
            "documentType": "purchase_invoice", "supplier": "Check Netherlands BV",
            "invoiceNumber": "CHECK-1DFC85046B", "invoiceDate": "2026-09-02",
            "dueDate": "2026-09-16", "subtotal": 5.63, "vatTotal": 1.17,
            "total": 6.80, "status": "overdue", "settlement": None,
        },
    },
    {
        "id": "dhl-paid-confirmation",
        "file": "DHL-regression.pdf",
        "text": """--- PAGE 1 ---
Factuur (betaalbevestiging)
Factuurnummer: 13268012
Datum: 24-02-2023 DHL Parcel (e-Commerce) B.V.
Verzender:
Bonstorm .com
21% €3.26 €0.69 €3.95
Subtotaal €3.26 €0.69
Totaal betaald €3.95
Het totaalbedrag is online betaald.
""",
        "tables": [{"page": 1, "rows": [
            ["21%", "€3.26", "€0.69", "€3.95"],
            ["Subtotaal", "€3.26", "€0.69"],
            ["Totaal betaald", "", "", "€3.95"],
        ]}],
        "layout": layout((120, 420, "DHL Parcel (e-Commerce) B.V."), (170, 20, "Bonstorm .com")),
        "expected": {
            "documentType": "purchase_invoice", "supplier": "DHL Parcel (e-Commerce) B.V.",
            "invoiceNumber": "13268012", "invoiceDate": "2023-02-24",
            "dueDate": None, "subtotal": 3.26, "vatTotal": 0.69,
            "total": 3.95, "status": "paid", "settlement": None,
        },
    },
    {
        "id": "self-billing-payday-23003",
        "file": "self-billing-23003.pdf",
        "text": """--- PAGE 1 ---
Van:
Eigen Studio
BTW-nummer : NL123456789B01 | KVK: 12345678
Factuur uitgereikt door afnemer
Aan:
Restaurant Company Europe Factuurnummer : Y41829623003
Factuurdatum : 03-05-2023
Omschrijving Week Datum Aantal Eenheid Tarief Totaal
Uren tarief 17 30-04-2023 7,75 Uren € 20.00 € 155.00
Bedrag excl. BTW € 155.00
BTW 21% € 32.55
Factuurbedrag € 187.55
Factoring Y41829623003 YOF-23162528 2.90% € 187.55 Bedrag excl. BTW € -5.44
BTW 21% € -1.14
Factuurbedrag € -6.58
Eindbedrag € 180.97
Bedragen op deze factuur zijn reeds betaald via Payday van ABN Amro.
""",
        "tables": [],
        "layout": layout((52, 35, "Eigen Studio"), (144, 35, "Restaurant Company Europe")),
        "expected": {
            "documentType": "sales_invoice", "supplier": "Eigen Studio",
            "invoiceNumber": "Y41829623003", "invoiceDate": "2023-05-03",
            "dueDate": None, "subtotal": 155.00, "vatTotal": 32.55,
            "total": 187.55, "status": "paid", "settlement": 180.97,
            "adjustment": (5.44, 1.14, 6.58),
        },
    },
    {
        "id": "self-billing-payday-26002",
        "file": "self-billing-26002.pdf",
        "text": """--- PAGE 1 ---
Van:
Eigen Studio
Factuur uitgereikt door afnemer
Aan:
Chez Jan B.V. Factuurnummer : Y41829626002
Factuurdatum : 13-01-2026
Bedrag excl. BTW € 134.38
BTW 21% € 28.22
Factuurbedrag € 162.60
Factoring Y41829626002 4.80% € 162.60 Bedrag excl. BTW € -7.80
BTW 21% € -1.64
Factuurbedrag € -9.44
Eindbedrag € 153.16
Bedragen op deze factuur zijn reeds betaald via Payday van ABN Amro.
""",
        "tables": [],
        "layout": layout((52, 35, "Eigen Studio"), (144, 35, "Chez Jan B.V.")),
        "expected": {
            "documentType": "sales_invoice", "supplier": "Eigen Studio",
            "invoiceNumber": "Y41829626002", "invoiceDate": "2026-01-13",
            "subtotal": 134.38, "vatTotal": 28.22, "total": 162.60,
            "status": "paid", "settlement": 153.16, "adjustment": (7.80, 1.64, 9.44),
        },
    },
    {
        "id": "self-billing-payday-26009",
        "file": "self-billing-26009.pdf",
        "text": """--- PAGE 1 ---
Van:
Eigen Studio
Factuur uitgereikt door afnemer
Aan:
Chez Jan B.V. Factuurnummer : Y41829626009
Factuurdatum : 16-02-2026
Bedrag excl. BTW € 166.63
BTW 21% € 34.99
Factuurbedrag € 201.62
Factoring Y41829626009 4.80% € 201.62 Bedrag excl. BTW € -9.68
BTW 21% € -2.03
Factuurbedrag € -11.71
Eindbedrag € 189.91
Bedragen op deze factuur zijn reeds betaald via Payday van ABN Amro.
""",
        "tables": [],
        "layout": layout((52, 35, "Eigen Studio"), (144, 35, "Chez Jan B.V.")),
        "expected": {
            "documentType": "sales_invoice", "supplier": "Eigen Studio",
            "invoiceNumber": "Y41829626009", "invoiceDate": "2026-02-16",
            "subtotal": 166.63, "vatTotal": 34.99, "total": 201.62,
            "status": "paid", "settlement": 189.91, "adjustment": (9.68, 2.03, 11.71),
        },
    },
    {
        "id": "reddende-engel-august",
        "file": "reddende-engel-august.pdf",
        "text": """--- PAGE 1 ---
Reddende Engel Horeca B.V.
Eigenaar
Factuurnummer 6a8c33d331c3e Datum 24 Augustus 2026
Omschrijving Aantal Excl. btw 21% btw Totaal
Werkzaamheden 8.17 € 261,44 € 54,90 € 316,34
Reiskostenvergoeding 216.00 € 49,68 € 10,43 € 60,11
45 minuten pauze -0.75 -€ 24,00 -€ 5,04 -€ 29,04
Bedrag excl. 21% btw € 287,12
21% btw € 60,30
Totaal € 347,42
Factoringkosten
5.50% over het totaal bedrag € 23,12
Waarvan BTW € 4,01
Totaal bedrag € 324,30
""",
        "tables": [{"page": 1, "rows": [
            ["Omschrijving", "Aantal", "Excl. btw", "21% btw", "Totaal"],
            ["Werkzaamheden", "8.17", "€261,44", "€54,90", "€316,34"],
            ["Reiskostenvergoeding", "216.00", "€49,68", "€10,43", "€60,11"],
            ["45 minuten pauze", "-0.75", "-€24,00", "-€5,04", "-€29,04"],
        ]}],
        "layout": layout((98, 36, "Reddende Engel Horeca B.V."), (114, 352, "Eigenaar")),
        "expected": {
            "documentType": "sales_invoice", "supplier": "Eigenaar",
            "invoiceNumber": "6a8c33d331c3e", "invoiceDate": "2026-08-24",
            "subtotal": 287.12, "vatTotal": 60.30, "total": 347.42,
            "status": "open", "settlement": 324.30, "adjustment": (19.11, 4.01, 23.12),
        },
    },
    {
        "id": "reddende-engel-july",
        "file": "reddende-engel-july.pdf",
        "text": """--- PAGE 1 ---
Reddende Engel Horeca B.V.
Eigenaar
Factuurnummer 6a4830ee43c43 Datum 4 Juli 2026
Bedrag excl. 21% btw € 274,77
21% btw € 57,70
Totaal € 332,47
Factoringkosten
5.50% over het totaal bedrag € 22,13
Waarvan BTW € 3,84
Totaal bedrag € 310,34
""",
        "tables": [],
        "layout": layout((98, 36, "Reddende Engel Horeca B.V."), (114, 352, "Eigenaar")),
        "expected": {
            "documentType": "sales_invoice", "supplier": "Eigenaar",
            "invoiceNumber": "6a4830ee43c43", "invoiceDate": "2026-07-04",
            "subtotal": 274.77, "vatTotal": 57.70, "total": 332.47,
            "status": "open", "settlement": 310.34, "adjustment": (18.29, 3.84, 22.13),
        },
    },
]


class DocumentProcessorRegressionTests(unittest.TestCase):
    def assertMoney(self, actual, expected):
        if expected is None:
            self.assertIsNone(actual)
        else:
            self.assertIsNotNone(actual)
            self.assertEqual(app.money_cents(actual), app.money_cents(expected))

    def test_real_document_regression_set(self):
        for fixture in FIXTURES:
            with self.subTest(fixture=fixture["id"]):
                doc = {
                    "kind": "pdf", "pageCount": 1, "text": fixture["text"],
                    "tables": fixture.get("tables", []), "layout": fixture.get("layout", []),
                    "ocrPages": [], "warnings": [],
                }
                result = app.heuristic_extract(doc, fixture["file"], COMPANY)
                exp = fixture["expected"]
                self.assertEqual(result.documentType, exp["documentType"])
                self.assertEqual(result.supplier.name, exp["supplier"])
                self.assertEqual(result.invoice.invoiceNumber, exp["invoiceNumber"])
                self.assertEqual(result.invoice.invoiceDate, exp["invoiceDate"])
                if "dueDate" in exp:
                    self.assertEqual(result.invoice.dueDate, exp["dueDate"])
                self.assertMoney(result.amounts.subtotal, exp["subtotal"])
                self.assertMoney(result.amounts.vatTotal, exp["vatTotal"])
                self.assertMoney(result.amounts.total, exp["total"])
                self.assertEqual(result.status, exp["status"])
                self.assertMoney(result.amounts.settlementAmount, exp.get("settlement"))

                # Core accounting invariant: invoice total remains invoice total,
                # even when a separate payout/settlement exists.
                self.assertEqual(
                    app.money_cents(result.amounts.subtotal) + app.money_cents(result.amounts.vatTotal),
                    app.money_cents(result.amounts.total),
                )

                if exp.get("adjustment"):
                    self.assertTrue(result.adjustments)
                    adj = result.adjustments[0]
                    self.assertMoney(adj.subtotal, exp["adjustment"][0])
                    self.assertMoney(adj.vatTotal, exp["adjustment"][1])
                    self.assertMoney(adj.total, exp["adjustment"][2])
                    self.assertEqual(adj.type, "factoring_fee")
                    self.assertNotEqual(
                        app.money_cents(result.amounts.total),
                        app.money_cents(result.amounts.settlementAmount),
                    )

                # Single-rate fixtures must persist one trusted VAT group derived
                # from validated primary totals, never arbitrary product-row pairs.
                self.assertEqual(len(result.amounts.vatLines), 1)
                vat_group = result.amounts.vatLines[0]
                self.assertEqual(vat_group.rate, 21)
                self.assertMoney(vat_group.taxableAmount, exp["subtotal"])
                self.assertMoney(vat_group.vatAmount, exp["vatTotal"])
                self.assertGreaterEqual(result.confidence.get("vatLines", 0), .95)

    def test_negative_currency_sign_before_euro_is_preserved(self):
        self.assertEqual(app.money_tokens("-€ 24,00"), [-24.0])
        self.assertEqual(app.money_tokens("€ -5,44"), [-5.44])

    def test_explicit_conflicting_amounts_are_not_silently_rewritten(self):
        result = app.enforce_single_rate_consistency(
            rate=21, subtotal=100.00, vat_total=21.00, total=130.00,
            subtotal_conf=.99, vat_conf=.99, total_conf=.99, allow=True,
        )
        self.assertFalse(result["used"])
        self.assertEqual(result["reason"], "inconsistent_single_rate_amounts")
        self.assertEqual(result["total"], 130.00)


if __name__ == "__main__":
    unittest.main()
