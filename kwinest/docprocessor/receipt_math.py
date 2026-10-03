import math
import re
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any

VAT_PERCENT_RE = re.compile(r"(?<!\d)(0|9|21)(?:[.,]0+)?\s*%", re.I)
VAT_LABEL_RE = re.compile(r"\b(?:btw|vat|tax)\b", re.I)
MONEY_CONTEXT_RE = re.compile(r"(?:€|\bEUR\b|\bEURO\b)\s*[-+]?\d|[-+]?\d[\d .]*[,.]\d{2}\b", re.I)
SEMANTIC_VAT_CONTEXT_RE = re.compile(
    r"\b(?:omschrijving|description|product|dienst|service|belast(?:baar|ing)?|grondslag|taxable)\b",
    re.I,
)
COMPLEX_ADJUSTMENT_RE = re.compile(
    r"\b(?:statiegeld|deposit|fooi|tip|service\s*(?:charge|kosten)?|"
    r"korting|discount|coupon|voucher|retour|refund|afrond(?:ing)?|rounding|"
    r"factoring(?:kosten)?|commissie|commission|platformkosten|platform\s*fee|"
    r"inhouding|deduction|verrekening)\b",
    re.I,
)


def detect_vat_rates(lines: list[str]) -> list[float]:
    """Return VAT rates with enough financial/semantic evidence.

    A lone percentage in marketing/footer text must not turn a single-rate
    invoice into mixed VAT. Percentages without an explicit VAT label count
    only when they sit on a money-bearing line, or when one semantic product
    description explicitly carries multiple supported tax rates.
    """
    rates: set[float] = set()
    for raw in lines or []:
        line = str(raw or "")
        low = line.lower()
        matches = list(VAT_PERCENT_RE.finditer(line))
        explicit_vat = bool(VAT_LABEL_RE.search(line))
        supported = {float(m.group(1)) for m in matches}
        money_context = bool(MONEY_CONTEXT_RE.search(line))
        semantic_mixed = len(supported) > 1 and bool(SEMANTIC_VAT_CONTEXT_RE.search(line))

        if explicit_vat or money_context or semantic_mixed:
            rates.update(supported)

        if explicit_vat:
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


def _cents(v: Any) -> int | None:
    if v is None:
        return None
    try:
        d = Decimal(str(v)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        return int(d * 100)
    except (InvalidOperation, ValueError, TypeError):
        return None


def _money_equal(a: Any, b: Any) -> bool:
    ca, cb = _cents(a), _cents(b)
    return ca is not None and cb is not None and ca == cb


def _round_money(v: Decimal) -> float:
    return float(v.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def _rate_expected(subtotal: float, rate: float) -> float:
    return _round_money(Decimal(str(subtotal)) * Decimal(str(rate)) / Decimal("100"))


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
    allow_replace_explicit: bool = False,
) -> dict[str, Any]:
    """
    Candidate-stage arithmetic recovery for one unambiguous VAT rate.

    Missing candidates may be reconstructed from one strong anchor + VAT rate.
    Explicit OCR reads are preserved by default, even at low confidence: if
    arithmetic disagrees they become review conflicts instead of silent edits.
    Legacy callers can opt into replacing weak explicit reads explicitly.
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
        (conf, field, abs(float(value)))
        for field, (value, conf) in values.items()
        if value is not None and _finite(value) and conf >= anchor_threshold and float(value) >= 0
    ]
    if not candidates:
        return out

    candidates.sort(reverse=True)
    anchor_conf, anchor_field, anchor_value = candidates[0]
    r = Decimal(str(rate)) / Decimal("100")
    av = Decimal(str(anchor_value))

    if anchor_field == "total":
        expected_total = _round_money(av)
        expected_subtotal = _round_money(av / (Decimal("1") + r))
        expected_vat = round(expected_total - expected_subtotal, 2)
    elif anchor_field == "subtotal":
        expected_subtotal = _round_money(av)
        expected_vat = _round_money(av * r)
        expected_total = round(expected_subtotal + expected_vat, 2)
    else:
        expected_vat = _round_money(av)
        expected_subtotal = _round_money(av / r)
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
    derived_conf = min(.98, max(.80, anchor_conf * .97))

    for field, exp in expected.items():
        cur, cur_conf = values[field]
        if field == anchor_field:
            out[field] = round(anchor_value, 2)
            continue
        if cur is None or not _finite(cur):
            out[field] = exp
            out[conf_key[field]] = derived_conf
            out["derivedFields"].append(field)
        elif _money_equal(abs(float(cur)), exp):
            out[field] = round(abs(float(cur)), 2)
        elif allow_replace_explicit and cur_conf < replace_below:
            out[field] = exp
            out[conf_key[field]] = derived_conf
            out["derivedFields"].append(field)
        else:
            out["conflicts"].append({
                "field": field,
                "read": round(abs(float(cur)), 2),
                "calculated": exp,
                "confidence": float(cur_conf),
            })

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
    Final accounting guardrail.

    It may fill one missing amount from two explicit amounts, but it never
    rewrites an explicit printed value. Conflicting explicit values are review
    errors, not an invitation to choose a favourite OCR/AI value.
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

    vals = {"subtotal": subtotal, "vatTotal": vat_total, "total": total}
    confs = {
        "subtotal": float(subtotal_conf or 0),
        "vatTotal": float(vat_conf or 0),
        "total": float(total_conf or 0),
    }
    present = {k: abs(float(v)) for k, v in vals.items() if v is not None and _finite(v)}
    if len(present) < 2:
        return out

    if len(present) == 2:
        missing = next(k for k in vals if k not in present)
        if missing == "total":
            value = round(present["subtotal"] + present["vatTotal"], 2)
            source_conf = min(confs["subtotal"], confs["vatTotal"])
        elif missing == "vatTotal":
            value = round(present["total"] - present["subtotal"], 2)
            source_conf = min(confs["subtotal"], confs["total"])
        else:
            value = round(present["total"] - present["vatTotal"], 2)
            source_conf = min(confs["vatTotal"], confs["total"])
        if value < 0 or source_conf < .70:
            out["reason"] = "insufficient_evidence_for_missing_amount"
            return out
        out[missing] = value
        out[{"subtotal":"subtotalConfidence","vatTotal":"vatConfidence","total":"totalConfidence"}[missing]] = min(.97, max(.75, source_conf * .97))
        out["correctedFields"] = [missing]
        out["anchorField"] = "+".join(k for k in present)
        out["used"] = True
        out["reason"] = "derived_missing_amount"
        return out

    sum_ok = (_cents(present["subtotal"]) or 0) + (_cents(present["vatTotal"]) or 0) == _cents(present["total"])
    expected_vat = _rate_expected(present["subtotal"], float(rate))
    rate_ok = abs((_cents(expected_vat) or 0) - (_cents(present["vatTotal"]) or 0)) <= 1

    if sum_ok and rate_ok:
        return out

    out["reason"] = "inconsistent_single_rate_amounts"
    return out
