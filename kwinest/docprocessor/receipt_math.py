import math
import re
from typing import Any

VAT_PERCENT_RE = re.compile(r"(?<!\d)(0|9|21)(?:[.,]0+)?\s*%", re.I)
VAT_LABEL_RE = re.compile(r"\b(?:btw|vat|tax)\b", re.I)
COMPLEX_ADJUSTMENT_RE = re.compile(
    r"\b(?:statiegeld|deposit|fooi|tip|service\s*(?:charge|kosten)?|"
    r"korting|discount|coupon|voucher|retour|refund|afrond(?:ing)?|rounding)\b",
    re.I,
)


def detect_vat_rates(lines: list[str]) -> list[float]:
    """Return supported VAT rates that are actually signalled in financial-looking lines."""
    rates: set[float] = set()
    for raw in lines or []:
        line = str(raw or "")
        low = line.lower()
        looks_financial = bool(VAT_LABEL_RE.search(line) or "%" in line)
        if not looks_financial:
            continue
        for m in VAT_PERCENT_RE.finditer(line):
            rates.add(float(m.group(1)))
        # Some Dutch receipts print e.g. "BTW 21" without a percent sign.
        if VAT_LABEL_RE.search(line):
            for m in re.finditer(r"\b(?:btw|vat|tax)(?:\s+tarief)?\s*[:=\-]?\s*(0|9|21)(?!\d)", low, re.I):
                rates.add(float(m.group(1)))
    return sorted(rates)


def has_complex_adjustments(text: str) -> bool:
    return bool(COMPLEX_ADJUSTMENT_RE.search(str(text or "")))


def _finite(v: Any) -> bool:
    try:
        return math.isfinite(float(v))
    except Exception:
        return False


def _close(a: float, b: float) -> bool:
    tol = max(0.05, abs(b) * 0.002)
    return abs(float(a) - float(b)) <= tol


def derive_single_rate_amounts(
    *,
    rate: float | None,
    subtotal: float | None,
    vat_total: float | None,
    total: float | None,
    subtotal_conf: float = 0.0,
    vat_conf: float = 0.0,
    total_conf: float = 0.0,
    allow: bool = True,
    anchor_threshold: float = 0.94,
    replace_below: float = 0.88,
) -> dict[str, Any]:
    """
    Use one very reliable amount plus one unambiguous VAT rate to reconstruct
    the other amounts. Existing high-confidence conflicting values are never
    silently overwritten.
    """
    out = {
        "subtotal": subtotal,
        "vatTotal": vat_total,
        "total": total,
        "subtotalConfidence": float(subtotal_conf or 0),
        "vatConfidence": float(vat_conf or 0),
        "totalConfidence": float(total_conf or 0),
        "derivedFields": [],
        "anchorField": None,
        "rate": rate,
        "conflicts": [],
        "used": False,
    }
    if not allow or rate not in (9, 21):
        return out

    values = {
        "subtotal": (subtotal, float(subtotal_conf or 0)),
        "vatTotal": (vat_total, float(vat_conf or 0)),
        "total": (total, float(total_conf or 0)),
    }
    candidates = [
        (conf, field, value)
        for field, (value, conf) in values.items()
        if value is not None and _finite(value) and conf >= anchor_threshold and float(value) >= 0
    ]
    if not candidates:
        return out

    candidates.sort(reverse=True)
    anchor_conf, anchor_field, anchor_value = candidates[0]
    anchor_value = abs(float(anchor_value))
    r = float(rate) / 100.0

    if anchor_field == "total":
        expected_total = anchor_value
        expected_subtotal = round(expected_total / (1.0 + r), 2)
        expected_vat = round(expected_total - expected_subtotal, 2)
    elif anchor_field == "subtotal":
        expected_subtotal = anchor_value
        expected_vat = round(expected_subtotal * r, 2)
        expected_total = round(expected_subtotal + expected_vat, 2)
    else:
        expected_vat = anchor_value
        expected_subtotal = round(expected_vat / r, 2)
        expected_total = round(expected_subtotal + expected_vat, 2)

    expected = {
        "subtotal": expected_subtotal,
        "vatTotal": expected_vat,
        "total": expected_total,
    }
    conf_key = {
        "subtotal": "subtotalConfidence",
        "vatTotal": "vatConfidence",
        "total": "totalConfidence",
    }

    derived_conf = min(0.99, max(0.90, anchor_conf * 0.985))
    for field, exp in expected.items():
        cur, cur_conf = values[field]
        if field == anchor_field:
            out[field] = round(anchor_value, 2)
            continue
        if cur is None or not _finite(cur) or cur_conf < replace_below:
            out[field] = exp
            out[conf_key[field]] = derived_conf
            out["derivedFields"].append(field)
        elif _close(float(cur), exp):
            out[field] = round(float(cur), 2)
            out[conf_key[field]] = max(float(cur_conf), derived_conf)
        else:
            out["conflicts"].append(
                {
                    "field": field,
                    "read": round(float(cur), 2),
                    "calculated": exp,
                    "confidence": float(cur_conf),
                }
            )

    out["anchorField"] = anchor_field
    out["used"] = bool(out["derivedFields"])
    return out


def enforce_single_rate_consistency(
    *,
    rate: float | None,
    subtotal: float | None,
    vat_total: float | None,
    total: float | None,
    subtotal_conf: float = 0.0,
    vat_conf: float = 0.0,
    total_conf: float = 0.0,
    allow: bool = True,
) -> dict[str, Any]:
    """
    Final accounting guardrail. For a single 9%/21% VAT rate without adjustments,
    an arithmetically impossible trio may not survive merely because OCR/AI gave it
    a high confidence score. Prefer an explicit high-confidence total, then net,
    then VAT as anchor and reconstruct the other two values.
    """
    out = {
        "subtotal": subtotal,
        "vatTotal": vat_total,
        "total": total,
        "subtotalConfidence": float(subtotal_conf or 0),
        "vatConfidence": float(vat_conf or 0),
        "totalConfidence": float(total_conf or 0),
        "correctedFields": [],
        "anchorField": None,
        "used": False,
        "reason": None,
        "rate": rate,
    }
    if not allow or rate not in (9, 21):
        return out

    vals = {
        "subtotal": subtotal,
        "vatTotal": vat_total,
        "total": total,
    }
    confs = {
        "subtotal": float(subtotal_conf or 0),
        "vatTotal": float(vat_conf or 0),
        "total": float(total_conf or 0),
    }
    present = {k: abs(float(v)) for k, v in vals.items() if v is not None and _finite(v)}
    if len(present) < 2:
        return out

    r = float(rate) / 100.0
    tol_money = max(0.05, abs(float(total or 0)) * 0.002)

    # Check both accounting equations, not just subtotal + VAT = total.
    sum_ok = True
    if all(k in present for k in ("subtotal", "vatTotal", "total")):
        sum_ok = abs((present["subtotal"] + present["vatTotal"]) - present["total"]) <= tol_money

    rate_ok = True
    if "subtotal" in present and "vatTotal" in present:
        expected_vat = present["subtotal"] * r
        rate_ok = abs(expected_vat - present["vatTotal"]) <= max(0.05, abs(expected_vat) * 0.02)
    elif "subtotal" in present and "total" in present:
        expected_total = present["subtotal"] * (1.0 + r)
        rate_ok = abs(expected_total - present["total"]) <= max(0.05, abs(expected_total) * 0.002)
    elif "vatTotal" in present and "total" in present:
        expected_vat = present["total"] * r / (1.0 + r)
        rate_ok = abs(expected_vat - present["vatTotal"]) <= max(0.05, abs(expected_vat) * 0.02)

    if sum_ok and rate_ok:
        return out

    # Total is the preferred receipt anchor when reliable because it is what was
    # actually paid. Otherwise use a reliable net amount, then VAT amount.
    if "total" in present and confs["total"] >= 0.90:
        anchor_field = "total"
    elif "subtotal" in present and confs["subtotal"] >= 0.92:
        anchor_field = "subtotal"
    elif "vatTotal" in present and confs["vatTotal"] >= 0.94:
        anchor_field = "vatTotal"
    else:
        # Not enough certainty to auto-correct. Flag only.
        out["reason"] = "inconsistent_single_rate_amounts"
        return out

    anchor = present[anchor_field]
    if anchor_field == "total":
        new_total = round(anchor, 2)
        new_subtotal = round(new_total / (1.0 + r), 2)
        new_vat = round(new_total - new_subtotal, 2)
    elif anchor_field == "subtotal":
        new_subtotal = round(anchor, 2)
        new_vat = round(new_subtotal * r, 2)
        new_total = round(new_subtotal + new_vat, 2)
    else:
        new_vat = round(anchor, 2)
        new_subtotal = round(new_vat / r, 2)
        new_total = round(new_subtotal + new_vat, 2)

    replacements = {
        "subtotal": new_subtotal,
        "vatTotal": new_vat,
        "total": new_total,
    }
    conf_key = {
        "subtotal": "subtotalConfidence",
        "vatTotal": "vatConfidence",
        "total": "totalConfidence",
    }
    anchor_conf = confs[anchor_field]
    derived_conf = min(0.98, max(0.88, anchor_conf * 0.97))
    for field, value in replacements.items():
        old = vals[field]
        out[field] = value
        if field != anchor_field:
            if old is None or not _finite(old) or abs(abs(float(old)) - value) > max(0.05, abs(value) * 0.002):
                out["correctedFields"].append(field)
            out[conf_key[field]] = derived_conf
        else:
            out[conf_key[field]] = max(confs[field], anchor_conf)

    out["anchorField"] = anchor_field
    out["used"] = True
    out["reason"] = "vat_rate_arithmetic_conflict"
    return out
