import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "kwinest" / "docprocessor"))

from receipt_math import detect_vat_rates, derive_single_rate_amounts, has_complex_adjustments


def approx(a, b, tol=0.01):
    assert a is not None
    assert abs(float(a) - float(b)) <= tol, (a, b)


# 21% VAT: one trusted total should reconstruct net and VAT.
r = derive_single_rate_amounts(
    rate=21, subtotal=None, vat_total=None, total=121.00, total_conf=.99
)
assert r["used"] is True
assert r["anchorField"] == "total"
assert set(r["derivedFields"]) == {"subtotal", "vatTotal"}
approx(r["subtotal"], 100.00)
approx(r["vatTotal"], 21.00)

# 9% VAT: trusted net should reconstruct VAT and gross.
r = derive_single_rate_amounts(
    rate=9, subtotal=100.00, vat_total=None, total=None, subtotal_conf=.98
)
approx(r["vatTotal"], 9.00)
approx(r["total"], 109.00)

# Trusted VAT itself is also a valid anchor.
r = derive_single_rate_amounts(
    rate=21, subtotal=None, vat_total=21.00, total=None, vat_conf=.97
)
approx(r["subtotal"], 100.00)
approx(r["total"], 121.00)

# Weak OCR values may be repaired from a stronger anchor.
r = derive_single_rate_amounts(
    rate=21, subtotal=10.00, vat_total=2.10, total=121.00,
    subtotal_conf=.50, vat_conf=.50, total_conf=.99
)
approx(r["subtotal"], 100.00)
approx(r["vatTotal"], 21.00)

# Strong conflicting reads are never silently overwritten.
r = derive_single_rate_amounts(
    rate=21, subtotal=95.00, vat_total=None, total=121.00,
    subtotal_conf=.97, total_conf=.99
)
assert r["subtotal"] == 95.00
assert r["conflicts"], r

# No derivation for ambiguous/mixed or unsupported rates.
r = derive_single_rate_amounts(
    rate=None, subtotal=None, vat_total=None, total=121.00, total_conf=.99
)
assert r["used"] is False

assert detect_vat_rates(["BTW 9% 1,80", "BTW 21% 10,50"]) == [9.0, 21.0]
assert detect_vat_rates(["BTW 21"]) == [21.0]
assert has_complex_adjustments("Totaal 20,00 incl. statiegeld 0,15") is True
assert has_complex_adjustments("Totaal 121,00 BTW 21%") is False

print("Receipt VAT arithmetic tests: PASS")
