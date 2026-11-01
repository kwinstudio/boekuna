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

export function parseReceipt(lines: string[]): { items: ReceiptItem[]; total: number | null } {
  const items: ReceiptItem[] = [];
  let total: number | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    const m = line.match(PRICE);
    if (!m) continue;
    const cents = (m[1] ? -1 : 1) * (parseInt(m[2], 10) * 100 + parseInt(m[3], 10));
    const name = line
      .slice(0, m.index)
      .replace(/^\d+\s*[x×]\s*/i, (q) => q)
      .replace(/[.:\-–\s]+$/, '')
      .trim();
    if (TOTAL.test(line) && !/sub/i.test(line)) {
      if (cents > 0 && (total === null || cents > total)) total = cents;
      continue;
    }
    if (SKIP.test(line)) continue;
    if (!/[A-Za-zÀ-ÿ]{2,}/.test(name)) continue; // alleen een getal (bijv. aantal × prijs-regel) overslaan
    if (Math.abs(cents) > 500000) continue;
    items.push({ name: name.slice(0, 60), cents });
  }
  return { items, total };
}
