// Bonnetje omzetten naar items: regels herkennen op hoogte, prijs rechts, totaal apart.
export type Box = { text: string; x: number; y: number; w: number; h: number };
export type ReceiptItem = { name: string; cents: number };

const SKIP = /\b(sub\s*totaal|subtotal|totaal|total|te betalen|btw|vat|tax|pin|pinnen|contant|cash|wisselgeld|change|bancontact|visa|mastercard|maestro|v pay|betaald|terminal|kaart|card|transactie|auth|saldo|bonus\s*box|spaar|zegels)\b/i;
const TOTAL = /\b(totaal|total|te betalen|amount due)\b/i;
const PRICE = /(-?)\s?€?\s?(\d{1,5})[.,](\d{2})\s*(?:€|eur|[a-c])?\s*$/i;

/** Groepeer losse tekstblokken tot regels (zelfde hoogte op de bon). */
export function toLines(boxes: Box[]): string[] {
  const sorted = [...boxes].sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2));
  const lines: Box[][] = [];
  for (const b of sorted) {
    const cy = b.y + b.h / 2;
    const line = lines.find((l) => {
      const ref = l[0];
      const ry = ref.y + ref.h / 2;
      return Math.abs(ry - cy) < Math.max(ref.h, b.h) * 0.6;
    });
    if (line) line.push(b);
    else lines.push([b]);
  }
  return lines.map((l) => l.sort((a, b) => a.x - b.x).map((b) => b.text.trim()).join(' ').replace(/\s+/g, ' ').trim());
}

const MONEY_ANY = /-?\d{1,5}[.,]\d{2}/g;
/** Regel die alleen hoeveelheid/gewicht beschrijft, bijv. "2 x 1,99" of "0,512 kg x 2,99 EUR/kg". */
const DETAIL = /^\s*\d+([.,]\d+)?\s*(kg|g|st|stuks?|x|×|@)\b|^\s*\d+([.,]\d+)?\s*(kg|g)?\s*[x×@]\s*/i;
const STOP = /\b(pin|pinnen|betaald met|contant|cash|bancontact|maestro|v pay|visa|mastercard|wisselgeld|change|btw|vat)\b/i;

function cleanName(name: string): { name: string; qty: number | null } {
  let qty: number | null = null;
  let n = name.replace(MONEY_ANY, ' ').replace(/\b(eur|€)\b|€/gi, ' ');
  const lead = n.match(/^\s*(\d{1,3})\s*[x×]?\s+(?=\D)/i);
  if (lead) {
    qty = parseInt(lead[1], 10);
    n = n.slice(lead[0].length);
  }
  const trail = n.match(/\s(\d{1,3})\s*[x×@]\s*$/i) ?? n.match(/\s[x×@]\s*(\d{1,3})\s*$/i);
  if (trail) {
    qty = qty ?? parseInt(trail[1], 10);
    n = n.slice(0, trail.index);
  }
  n = n.replace(/\s[x×@]\s*$/i, '').replace(/[.:\-–*\s]+$/, '').replace(/^[*\s]+/, '').replace(/\s+/g, ' ').trim();
  return { name: n, qty: qty && qty > 1 ? qty : null };
}

export function parseReceipt(lines: string[]): { items: ReceiptItem[]; total: number | null } {
  const items: ReceiptItem[] = [];
  let total: number | null = null;
  let pendingName: string | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(PRICE);
    if (!m) {
      // Productnaam zonder prijs: de prijs staat vaak op de volgende (gewichts)regel.
      if (/[A-Za-zÀ-ÿ]{3,}/.test(line) && !SKIP.test(line) && !DETAIL.test(line)) pendingName = line.replace(/\s+/g, ' ').slice(0, 60);
      else if (!DETAIL.test(line)) pendingName = null;
      continue;
    }
    const cents = (m[1] ? -1 : 1) * (parseInt(m[2], 10) * 100 + parseInt(m[3], 10));
    if (TOTAL.test(line) && !/sub/i.test(line)) {
      if (cents > 0 && (total === null || cents > total)) total = cents;
      // Na het totaal komen alleen nog betaal- en btw-regels.
      if (items.length) break;
      continue;
    }
    if (SKIP.test(line) || (STOP.test(line) && !/korting|bonus/i.test(line))) {
      pendingName = null;
      continue;
    }
    if (Math.abs(cents) > 500000) continue;
    const { name, qty } = cleanName(line.slice(0, m.index));
    const hasName = /[A-Za-zÀ-ÿ]{2,}/.test(name) && !/^(kg|g|st|stuks?|eur)$/i.test(name);
    if ((!hasName || DETAIL.test(line)) && pendingName) {
      items.push({ name: pendingName, cents });
      pendingName = null;
      continue;
    }
    pendingName = null;
    if (!hasName) continue; // alleen een getal (bijv. aantal × prijs-regel) overslaan
    items.push({ name: (qty ? `${name} (${qty}×)` : name).slice(0, 60), cents });
  }
  if (total === null && items.length) {
    const sum = items.reduce((s, i) => s + i.cents, 0);
    if (sum > 0) total = sum;
  }
  return { items, total };
}
