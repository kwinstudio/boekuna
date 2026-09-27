import math
import re
from typing import Any

MONEY_RE = re.compile(
    r"(?<!\w)(?:EUR|€|EURO)?\s*[-+]?\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})"
    r"|(?<!\w)(?:EUR|€|EURO)?\s*[-+]?\d+(?:[.,]\d{2})(?!\w)",
    re.I,
)
NET_RE = re.compile(
    r"\b(?:bedrag\s*excl\.?\s*(?:(?:0|9|21)(?:[.,]0+)?\s*%\s*)?(?:btw|vat)|"
    r"totaal\s*excl\.?\s*(?:(?:0|9|21)(?:[.,]0+)?\s*%\s*)?(?:btw|vat)|"
    r"total\s*excl\.?\s*vat|tax\s*exclusive|net\s*amount|subtotaal|subtotal)\b",
    re.I,
)
VAT_RE = re.compile(r"\b(?:btw|vat|tax)\b", re.I)
VAT_ID_RE = re.compile(r"\b(?:btw[- ]?(?:nummer|nr|id)|vat\s*(?:id|number))\b", re.I)
MAIN_GROSS_RE = re.compile(
    r"\b(?:factuurbedrag|factuurtotaal|invoice\s*(?:amount|total)|"
    r"totaal\s*incl\.?\s*(?:btw|vat)|grand\s*total|total\s*due)\b",
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
    r"\b(?:eindbedrag|netto\s*uitbetaling|netto\s*bedrag|uitbetaald|"
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


def money_tokens(line: str) -> list[float]:
    # Percentages such as 5.50% are not monetary amounts.
    clean = re.sub(r"(?<!\d)\d+(?:[.,]\d+)?\s*%", " ", str(line or ""))
    out = []
    for m in MONEY_RE.finditer(clean):
        n = _money(m.group(0))
        if n is not None and abs(n) < 1e9:
            out.append(n)
    return out


def _amount_on_or_after(lines: list[str], i: int, max_ahead: int = 1) -> float | None:
    for j in range(i, min(len(lines), i + max_ahead + 1)):
        vals = money_tokens(lines[j])
        if vals:
            return vals[-1]
    return None


def _rate_from(text: str) -> float | None:
    m = re.search(r"\b(0|9|21)(?:[.,]0+)?\s*%", text or "", re.I)
    return float(m.group(1)) if m else None


def _close(a: float, b: float, rel: float = .004) -> bool:
    return abs(float(a) - float(b)) <= max(.08, abs(float(b)) * rel)


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


def parse_financial_blocks(raw_lines: list[str]) -> dict[str, Any]:
    lines = [_norm(x) for x in raw_lines if _norm(x)]
    sections: list[dict[str, Any]] = []

    # 1) Find explicit net -> VAT -> gross groups. This catches normal invoice
    # totals and negative factoring rows such as -5.44 / -1.14 / -6.58.
    for i, line in enumerate(lines):
        if not NET_RE.search(line):
            continue
        net = _amount_on_or_after(lines, i, 1)
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
                vat = _amount_on_or_after(lines, j, 1)
                rate = _rate_from(lines[j]) or rate
            if MAIN_GROSS_RE.search(lines[j]) or PLAIN_TOTAL_RE.search(lines[j]):
                gross = _amount_on_or_after(lines, j, 1)
                gross_index = j
                break
        if gross is None and vat is not None:
            gross = net + vat
        if gross is None:
            continue
        context = " ".join(lines[max(0, i - 5): min(len(lines), (gross_index if gross_index >= 0 else i) + 1)])
        is_adjustment = bool(net < 0 or gross < 0 or ADJUSTMENT_RE.search(context))
        sections.append({
            "subtotal": abs(float(net)),
            "vatTotal": abs(float(vat if vat is not None else gross - net)),
            "total": abs(float(gross)),
            "vatRate": rate,
            "context": context,
            "start": i,
            "end": gross_index if gross_index >= 0 else i,
            "isAdjustment": is_adjustment,
            "type": _adjustment_type(context) if is_adjustment else None,
            "counterparty": _counterparty(context),
        })

    normal = [s for s in sections if not s["isAdjustment"] and s["total"] > 0]
    primary = sorted(normal, key=lambda s: (-s["total"], s["start"]))[0] if normal else None

    # 2) Factor/commission sections sometimes only show "fee incl." + "waarvan
    # BTW", followed by a payout. Recover fee net = fee gross - fee VAT.
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
                fee_net = round(fee_gross / (1 + rate / 100), 2)
                fee_vat = round(fee_gross - fee_net, 2)
            else:
                fee_net = round(fee_gross - (fee_vat or 0), 2)
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

    # De-duplicate equivalent adjustment amounts detected through two paths.
    deduped: list[dict[str, Any]] = []
    for a in sorted(adjustments, key=lambda x: x.get("start", 0)):
        if any(
            _close(a["total"], b["total"], .002)
            and _close(a["vatTotal"], b["vatTotal"], .02)
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
            if net is None and NET_RE.search(line) and not ADJUSTMENT_RE.search(" ".join(lines[max(0, i - 3):i + 2])):
                net = _amount_on_or_after(lines, i, 1)
            if vat is None and VAT_RE.search(line) and not VAT_ID_RE.search(line) and not ADJUSTMENT_RE.search(" ".join(lines[max(0, i - 3):i + 2])):
                vat = _amount_on_or_after(lines, i, 1)
            if gross is None and (MAIN_GROSS_RE.search(line) or PLAIN_TOTAL_RE.search(line)) and not ADJUSTMENT_RE.search(" ".join(lines[max(0, i - 3):i + 2])):
                gross = _amount_on_or_after(lines, i, 1)
        if net is not None and vat is not None and gross is None:
            gross = net + vat
        if gross is not None and net is not None and vat is None:
            vat = gross - net
        if gross is not None and vat is not None and net is None:
            net = gross - vat
        if gross is not None and net is not None and vat is not None:
            primary = {
                "subtotal": abs(float(net)),
                "vatTotal": abs(float(vat)),
                "total": abs(float(gross)),
                "vatRate": _rate_from(" ".join(lines)),
                "context": "",
                "start": -1,
                "end": -1,
                "isAdjustment": False,
                "type": None,
                "counterparty": None,
            }

    # 4) Settlement/payout amount. "Totaal bedrag" is accepted only inside/after
    # a recognized adjustment block and only when the reconciliation proves it.
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

    adjustment_total = round(sum(float(a["total"]) for a in adjustments), 2)
    settlement = None
    settlement_source = None
    if primary and settlement_candidates:
        expected = round(primary["total"] - adjustment_total, 2)
        matching = [c for c in settlement_candidates if _close(c[0], expected, .003)]
        if matching:
            settlement, _, settlement_source = matching[-1]
        else:
            explicit = [c for c in settlement_candidates if c[2] == "explicit"]
            if explicit:
                settlement, _, settlement_source = explicit[-1]

    primary_ok = bool(
        primary
        and _close(primary["subtotal"] + primary["vatTotal"], primary["total"], .003)
    )
    adjustment_ok = all(
        _close(a["subtotal"] + a["vatTotal"], a["total"], .01)
        for a in adjustments
    )
    settlement_ok = True
    if settlement is not None and primary is not None:
        settlement_ok = _close(primary["total"] - adjustment_total, settlement, .003)

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
