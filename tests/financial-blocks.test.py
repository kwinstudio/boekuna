import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "kwinest" / "docprocessor"))

from financial_blocks import parse_financial_blocks


def eq(a, b, tol=0.01):
    assert a is not None, (a, b)
    assert abs(float(a) - float(b)) <= tol, (a, b)


# Regression from uploaded Reddende Engel document:
# commercial invoice total 347.42, factoring cost 23.12 incl. VAT, payout 324.30.
reddende = [
    "Bedrag excl. 21% btw € 287,12",
    "21% btw € 60,30",
    "Totaal € 347,42",
    "Factoringkosten",
    "5.50% over het totaal bedrag € 23,12",
    "Waarvan BTW € 4,01",
    "Totaal bedrag € 324,30",
]
r = parse_financial_blocks(reddende)
assert r["verified"] is True, r
eq(r["primary"]["subtotal"], 287.12)
eq(r["primary"]["vatTotal"], 60.30)
eq(r["primary"]["total"], 347.42)
assert len(r["adjustments"]) == 1, r
eq(r["adjustments"][0]["subtotal"], 19.11)
eq(r["adjustments"][0]["vatTotal"], 4.01)
eq(r["adjustments"][0]["total"], 23.12)
eq(r["settlementAmount"], 324.30)

# Regression from uploaded self-billing / Payday document:
# 187.55 invoice, -6.58 factoring row, 180.97 final payout.
payday = [
    "Bedrag excl. BTW € 155.00",
    "BTW 21% € 32.55",
    "Factuurbedrag € 187.55",
    "Factoring Y41829623003 YOF-23162528 2.90% € 187.55 Bedrag excl. BTW € -5.44",
    "BTW 21% € -1.14",
    "Factuurbedrag € -6.58",
    "Eindbedrag € 180.97",
]
r = parse_financial_blocks(payday)
assert r["verified"] is True, r
eq(r["primary"]["subtotal"], 155.00)
eq(r["primary"]["vatTotal"], 32.55)
eq(r["primary"]["total"], 187.55)
assert len(r["adjustments"]) == 1, r
eq(r["adjustments"][0]["subtotal"], 5.44)
eq(r["adjustments"][0]["vatTotal"], 1.14)
eq(r["adjustments"][0]["total"], 6.58)
eq(r["settlementAmount"], 180.97)

# Regression from a Stripe/Link tax invoice (Higgsfield): "Total excluding tax"
# repeats the net and must not be read as the VAT amount (was 59.00 instead of 12.39).
link_invoice = [
    "Subtotal €59.00",
    "Total excluding tax €59.00",
    "VAT - Netherlands (21% on €59.00) €12.39",
    "Total €71.39",
    "Amount due €71.39",
]
r = parse_financial_blocks(link_invoice)
assert r["verified"] is True, r
eq(r["primary"]["subtotal"], 59.00)
eq(r["primary"]["vatTotal"], 12.39)
eq(r["primary"]["total"], 71.39)

print("Financial block regressions: PASS")
