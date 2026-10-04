import math
import re
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any

MONEY_RE = re.compile(
    r"(?<!\w)(?:USD|GBP|CHF|EUR|€|EURO)?\s*[-+]?\d{1,3}(?:,\d{3})+\.\d{2}(?![\w.,])|(?<!\w)(?:EUR|€|EURO)?\s*[-+]?\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})"
    r"|(?<!\w)(?:EUR|€|EURO)?\s*[-+]?\d+(?:[.,]\d{2})(?!\w)",
    re.I,
)
NET_RE = re.compile(
    r"\b(?:bedrag\s*(?:ex|excl)\.?\s*(?:(?:0|9|21)(?:[.,]0+)?\s*%\s*)?(?:btw|vat)|"
    r"totaal\s*(?:ex|excl\.?|exclusief)\s*(?:(?:0|9|21)(?:[.,]0+)?\s*%\s*)?(?:btw|vat)|"
    r"total\s*excl\.?\s*vat|tax\s*exclusive|net\s*amount|subtotaal|subtotal|^\s*excl\.?)\b",
    re.I,
)
VAT_RE = re.compile(r"\b(?:btw|vat|tax)\b", re.I)
VAT_ID_RE = re.compile(r"\b(?:btw[- ]?(?:nummer|nr|id)|vat\s*(?:id|number))\b", re.I)
MAIN_GROSS_RE = re.compile(
    r"\b(?:factuurbedrag|factuurtotaal|invoice\s*(?:amount|total)|"
    r"totaal\s*(?:incl\.?|inclusief)\s*(?:btw|vat)|grand\s*total|total\s*due|"
    r"totaal\s*betaald|total\s*paid|paid\s*total)\b",
    re.I,
)
PLAIN_TOTAL_RE = re.compile(r"^\s*(?:totaal|total)\s*(?:€|EUR|[-+]?\d)", re.I)
ADJUSTMENT_RE = re.compile(
    r"\b(?:factoring(?:kosten)?|factorfee|commissie|commission|platformkosten|"
    r"platform\s*fee|payment\s*fee|servicekosten|service\s*fee|inhouding|"
    r"deduction|verrekening|settlement\s*fee)\b",
    re.I,
)
SETTLEMENT_RE = re.compile(
    r"\b(?:eindbedrag|netto\s*uitbetaling|uitbetaald|"
    r"payout|net\s*payout|amount\s*paid|settlement\s*amount)\b",
    re.I,
)
GENERIC_TOTAL_AMOUNT_RE = re.compile(r"^\s*(?:totaal\s*bedrag|total\s*amount)\b", re.I)


def _norm(s: Any) -> str:
    return re.sub(r"[ \t]+", " ", str(s or "").replace("\u00a0", " ")).strip()


def _money(v: str) -> float | None:
    s = str(v or "").strip().replace("€", "").replace("EUR", "").replace("euro", "").replace(" ", "")
    s = re.sub(r"[^0-9,.+\-]", "", s)
    if not s:
        return None
    if "," in s and "." in s:
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    elif "," in s:
        parts = s.split(",")
        if len(parts[-1]) == 2:
            s = "".join(parts[:-1]).replace(".", "") + "." + parts[-1]
        else:
            s = s.replace(",", "")
    elif s.count(".") > 1:
        parts = s.split(".")
        if len(parts[-1]) == 2:
            s = "".join(parts[:-1]) + "." + parts[-1]
        else:
            s = "".join(parts)
    try:
        n = float(s)
        return n if math.isfinite(n) else None
    except Exception:
        return None


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


def money_tokens(line: str) -> list[float]:
    # Percentages such as 5.50% are not monetary amounts.
    raw = str(line or "")
    clean = re.sub(r"(?<!\d)\d+(?:[.,]\d+)?\s*%", " ", raw)
    out = []
    for m in MONEY_RE.finditer(clean):
        n = _money(m.group(0))
        # PDF text often encodes a negative amount as "-€ 24,00". The legacy
        # regex starts at the currency sign, so preserve a directly preceding sign.
        if n is not None and m.start() > 0 and clean[m.start() - 1] == "-" and n > 0:
            n = -n
        if n is not None and abs(n) < 1e9:
            out.append(n)
    return out


def _amount_on_or_after(lines: list[str], i: int, max_ahead: int = 1, *, prefer_first: bool = False) -> float | None:
    for j in range(i, min(len(lines), i + max_ahead + 1)):
        vals = money_tokens(lines[j])
        if vals:
            return vals[0] if prefer_first else vals[-1]
    return None


def _net_amount(lines: list[str], i: int) -> float | None:
    line = lines[i]
    match = NET_RE.search(line)
    if match:
        # Read values AFTER the net label. This handles both a summary row with
        # net + VAT columns and a factoring row that contains an earlier basis
        # amount before "Bedrag excl. BTW".
        after = money_tokens(line[match.start():])
        if after:
            return after[0]
    vals = money_tokens(line)
    if vals:
        return vals[-1]
    return _amount_on_or_after(lines, i, 1)


def _vat_amount_from_line(line: str) -> float | None:
    if NET_RE.search(line) or MAIN_GROSS_RE.search(line) or re.search(r"verlegd|shifted|reverse charge",line,re.I):
        return None
    vals = money_tokens(line)
    if not vals:
        return None
    # A VAT summary line normally contains one monetary amount. If it contains
    # several table values, do not guess which column is VAT; derive it from
    # explicit net and gross totals instead.
    if len(vals) == 1:
        return vals[0]
    return None


def _rate_from(text: str) -> float | None:
    m = re.search(r"\b(0|9|21)(?:[.,]0+)?\s*%", text or "", re.I)
    return float(m.group(1)) if m else None


def _adjustment_type(text: str) -> str:
    low = (text or "").lower()
    if "factor" in low:
        return "factoring_fee"
    if "commissie" in low or "commission" in low:
        return "commission"
    if "platform" in low:
        return "platform_fee"
    if "payment" in low:
        return "payment_fee"
    if "service" in low:
        return "service_fee"
    if "inhoud" in low or "deduction" in low or "verrekening" in low:
        return "deduction"
    return "other_fee"


def _counterparty(text: str) -> str | None:
    low = (text or "").lower()
    if "payday" in low and "abn" in low:
        return "Payday / ABN AMRO"
    if "payday" in low:
        return "Payday"
    if "abn" in low and "amro" in low:
        return "ABN AMRO"
    return None


def _inclusive_vat_primary(lines: list[str]) -> dict[str, Any] | None:
    """Read explicit inclusive-VAT summaries such as 'incl. 21% VAT (Net amount X) Y'.

    This is stronger than a pre-discount subtotal because the printed net and VAT
    belong to the final gross amount after discounts/returns.
    """
    net_label = re.compile(r"\b(?:netto\s*bedrag|net\s*amount)\b", re.I)
    for i, line in enumerate(lines):
        if not VAT_RE.search(line) or not re.search(r"\b(?:inclusief|including|incl\.?)\b", line, re.I):
            continue
        label = net_label.search(line)
        if not label:
            continue
        after = money_tokens(line[label.start():])
        if not after:
            continue
        net = abs(float(after[0]))
        rate = _rate_from(line) or _infer_rate(net, None)
        vat = abs(float(after[1])) if len(after) > 1 else None
        if vat is None:
            for j in range(i + 1, min(len(lines), i + 3)):
                vals = money_tokens(lines[j])
                if vals and not (NET_RE.search(lines[j]) or MAIN_GROSS_RE.search(lines[j]) or PLAIN_TOTAL_RE.search(lines[j])):
                    vat = abs(float(vals[-1]))
                    break
        if vat is None:
            continue
        gross = None
        expected_cents = (_cents(net) or 0) + (_cents(vat) or 0)
        for j in range(i - 1, max(-1, i - 7), -1):
            if MAIN_GROSS_RE.search(lines[j]) or PLAIN_TOTAL_RE.search(lines[j]):
                candidate = _amount_on_or_after(lines, j, 0)
                if candidate is not None and _cents(abs(float(candidate))) == expected_cents:
                    gross = abs(float(candidate))
                    break
        if gross is None:
            gross = expected_cents / 100
        return {
            "subtotal": round(net, 2),
            "vatTotal": round(vat, 2),
            "total": round(gross, 2),
            "vatRate": rate or _infer_rate(net, vat),
            "context": " ".join(lines[max(0, i - 6): min(len(lines), i + 3)]),
            "start": i,
            "end": i,
            "isAdjustment": False,
            "type": None,
            "counterparty": None,
            "source": "explicit-inclusive-vat-summary",
        }
    return None


def _infer_rate(net: float | None, vat: float | None) -> float | None:
    cn, cv = _cents(net), _cents(vat)
    if not cn or cv is None or cn <= 0:
        return None
    for rate in (9.0, 21.0):
        expected = int((Decimal(cn) * Decimal(str(rate)) / Decimal("100")).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
        if abs(expected - cv) <= 1:
            return rate
    return None


def parse_financial_blocks(raw_lines: list[str]) -> dict[str, Any]:
    lines = [_norm(x) for x in raw_lines if _norm(x)]
    sections: list[dict[str, Any]] = []

    # 1) Find explicit net -> VAT -> gross groups. This catches ordinary invoice
    # totals and negative factoring rows. Table headers are never allowed to
    # supply an amount from the next row as VAT.
    for i, line in enumerate(lines):
        if not NET_RE.search(line):
            continue
        net = _net_amount(lines, i)
        if net is None:
            continue
        vat = None
        gross = None
        rate = _rate_from(line)
        gross_index = -1
        for j in range(i + 1, min(len(lines), i + 8)):
            if j > i + 1 and ADJUSTMENT_RE.search(lines[j]) and not NET_RE.search(lines[j]):
                break
            if vat is None and VAT_RE.search(lines[j]) and not VAT_ID_RE.search(lines[j]):
                candidate_vat = _vat_amount_from_line(lines[j])
                if candidate_vat is not None:
                    vat = candidate_vat
                    rate = _rate_from(lines[j]) or rate
            if MAIN_GROSS_RE.search(lines[j]) or PLAIN_TOTAL_RE.search(lines[j]):
                gross = _amount_on_or_after(lines, j, 1)
                gross_index = j
                break
        if gross is not None and vat is None:
            vat = round(float(gross) - float(net), 2)
        if gross is None and vat is not None:
            gross = round(float(net) + float(vat), 2)
        if gross is None or vat is None:
            continue
        context = " ".join(lines[max(0, i - 5): min(len(lines), (gross_index if gross_index >= 0 else i) + 1)])
        is_adjustment = bool(net < 0 or gross < 0 or ADJUSTMENT_RE.search(context))
        sections.append({
            "subtotal": abs(float(net)),
            "vatTotal": abs(float(vat)),
            "total": abs(float(gross)),
            "vatRate": rate or _infer_rate(abs(float(net)), abs(float(vat))),
            "context": context,
            "start": i,
            "end": gross_index if gross_index >= 0 else i,
            "isAdjustment": is_adjustment,
            "type": _adjustment_type(context) if is_adjustment else None,
            "counterparty": _counterparty(context),
        })

    explicit_inclusive = _inclusive_vat_primary(lines)
    normal = [s for s in sections if not s["isAdjustment"] and s["total"] > 0]
    primary = explicit_inclusive or (sorted(normal, key=lambda s: (-s["total"], s["start"]))[0] if normal else None)

    # 2) Factor/commission sections sometimes only show fee incl. + "waarvan
    # BTW", followed by a payout. Keep the fee separate from invoice total.
    adjustments = [s.copy() for s in sections if s["isAdjustment"]]
    covered_starts = {s["start"] for s in adjustments}
    for i, line in enumerate(lines):
        if not ADJUSTMENT_RE.search(line):
            continue
        if any(abs(i - x) <= 2 for x in covered_starts):
            continue
        end = min(len(lines), i + 9)
        region = lines[i:end]
        fee_gross = None
        fee_vat = None
        rate = None
        fee_line = None
        for off, item in enumerate(region):
            if rate is None:
                rate = _rate_from(item)
            vals = money_tokens(item)
            if VAT_RE.search(item) and not VAT_ID_RE.search(item) and vals:
                if re.search(r"\b(?:waarvan|of which|vat|btw|tax)\b", item, re.I):
                    fee_vat = abs(vals[-1])
                    continue
            if off > 0 and vals and fee_gross is None:
                if "%" in item or re.search(r"\b(?:kosten|fee|commissie|commission|inhouding|deduction|over\s+het\s+totaal\s+bedrag)\b", item, re.I):
                    fee_gross = abs(vals[-1])
                    fee_line = item
        if fee_gross is not None:
            if fee_vat is None and rate in (9, 21):
                gross_cents = _cents(fee_gross) or 0
                divisor = Decimal("1") + Decimal(str(rate)) / Decimal("100")
                net_cents = int((Decimal(gross_cents) / divisor).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
                fee_net = net_cents / 100
                fee_vat = (gross_cents - net_cents) / 100
            else:
                fee_net = round(fee_gross - (fee_vat or 0), 2)
                rate = rate or _infer_rate(fee_net, fee_vat)
            context = " ".join(region)
            adjustments.append({
                "subtotal": fee_net,
                "vatTotal": fee_vat or 0.0,
                "total": fee_gross,
                "vatRate": rate,
                "context": context,
                "start": i,
                "end": end - 1,
                "isAdjustment": True,
                "type": _adjustment_type(context),
                "description": fee_line or line,
                "counterparty": _counterparty(context),
            })
            covered_starts.add(i)

    # De-duplicate equivalent adjustment blocks at cent precision.
    deduped: list[dict[str, Any]] = []
    for a in sorted(adjustments, key=lambda x: x.get("start", 0)):
        if any(
            _money_equal(a["total"], b["total"])
            and _money_equal(a["vatTotal"], b["vatTotal"])
            and a.get("type") == b.get("type")
            for b in deduped
        ):
            continue
        deduped.append(a)
    adjustments = deduped

    # 3) Main totals fallback when no explicit section was found.
    if primary is None:
        gross = net = vat = None
        for i, line in enumerate(lines):
            nearby = " ".join(lines[max(0, i - 3):i + 2])
            if net is None and NET_RE.search(line) and not ADJUSTMENT_RE.search(nearby):
                net = _net_amount(lines, i)
            if vat is None and VAT_RE.search(line) and not VAT_ID_RE.search(line) and not ADJUSTMENT_RE.search(nearby):
                vat = _vat_amount_from_line(line)
            if gross is None and (MAIN_GROSS_RE.search(line) or PLAIN_TOTAL_RE.search(line)) and not ADJUSTMENT_RE.search(nearby):
                gross = _amount_on_or_after(lines, i, 1)
        if gross is not None and net is not None and vat is None:
            vat = round(float(gross) - float(net), 2)
        if net is not None and vat is not None and gross is None:
            gross = round(float(net) + float(vat), 2)
        if gross is not None and vat is not None and net is None:
            net = round(float(gross) - float(vat), 2)
        if gross is not None and net is not None and vat is not None:
            primary = {
                "subtotal": abs(float(net)),
                "vatTotal": abs(float(vat)),
                "total": abs(float(gross)),
                "vatRate": _rate_from(" ".join(lines)) or _infer_rate(abs(float(net)), abs(float(vat))),
                "context": "",
                "start": -1,
                "end": -1,
                "isAdjustment": False,
                "type": None,
                "counterparty": None,
            }

    # 4) Settlement/payout is a separate concept. "Totaal betaald" on a normal
    # invoice is NOT a settlement; a settlement is only recognized from explicit
    # payout language or a generic total after a recognized adjustment block.
    settlement_candidates: list[tuple[float, int, str]] = []
    for i, line in enumerate(lines):
        if SETTLEMENT_RE.search(line):
            v = _amount_on_or_after(lines, i, 1)
            if v is not None:
                settlement_candidates.append((abs(v), i, "explicit"))
        elif adjustments and GENERIC_TOTAL_AMOUNT_RE.search(line):
            v = _amount_on_or_after(lines, i, 1)
            if v is not None:
                settlement_candidates.append((abs(v), i, "generic-after-adjustment"))

    adjustment_cents = sum((_cents(a["total"]) or 0) for a in adjustments)
    adjustment_total = adjustment_cents / 100
    settlement = None
    settlement_source = None
    if primary and settlement_candidates:
        primary_cents = _cents(primary["total"])
        expected_cents = primary_cents - adjustment_cents if primary_cents is not None else None
        matching = [c for c in settlement_candidates if expected_cents is not None and _cents(c[0]) == expected_cents]
        if matching:
            settlement, _, settlement_source = matching[-1]
        else:
            explicit = [c for c in settlement_candidates if c[2] == "explicit"]
            if explicit:
                settlement, _, settlement_source = explicit[-1]

    primary_ok = bool(
        primary
        and (_cents(primary["subtotal"]) or 0) + (_cents(primary["vatTotal"]) or 0) == _cents(primary["total"])
    )
    adjustment_ok = all(
        (_cents(a["subtotal"]) or 0) + (_cents(a["vatTotal"]) or 0) == _cents(a["total"])
        for a in adjustments
    )
    settlement_ok = True
    if settlement is not None and primary is not None:
        pc = _cents(primary["total"])
        sc = _cents(settlement)
        settlement_ok = pc is not None and sc is not None and pc - adjustment_cents == sc

    verified = bool(primary_ok and adjustment_ok and settlement_ok)
    return {
        "primary": primary,
        "adjustments": [
            {
                "type": a.get("type") or "other_fee",
                "description": a.get("description") or a.get("context") or "Kosten/correctie",
                "subtotal": round(float(a["subtotal"]), 2),
                "vatTotal": round(float(a["vatTotal"]), 2),
                "total": round(float(a["total"]), 2),
                "vatRate": a.get("vatRate"),
                "direction": "deduction",
                "counterparty": a.get("counterparty"),
            }
            for a in adjustments
        ],
        "settlementAmount": round(float(settlement), 2) if settlement is not None else None,
        "settlementSource": settlement_source,
        "adjustmentTotal": adjustment_total,
        "verified": verified,
        "primaryArithmeticOk": primary_ok,
        "adjustmentArithmeticOk": adjustment_ok,
        "settlementArithmeticOk": settlement_ok,
    }
