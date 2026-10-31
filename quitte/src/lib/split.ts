import type { Part } from './types';

/** Gelijk verdelen; restcenten gaan naar de eerste personen in de lijst. */
export function splitEqual(amount: number, ids: string[]): Part[] {
  if (ids.length === 0) return [];
  const base = Math.floor(amount / ids.length);
  let rest = amount - base * ids.length;
  return ids.map((m) => {
    const extra = rest > 0 ? 1 : 0;
    rest -= extra;
    return { m, a: base + extra };
  });
}

/** Verdelen naar aandelen (bijv. 1, 1, 2) met de grootste-restmethode. */
export function splitShares(amount: number, weights: Record<string, number>, order: string[]): Part[] {
  const ids = order.filter((id) => (weights[id] ?? 0) > 0);
  const total = ids.reduce((s, id) => s + weights[id], 0);
  if (total <= 0) return [];
  const raw = ids.map((id) => ({ m: id, exact: (amount * weights[id]) / total }));
  const parts = raw.map((r) => ({ m: r.m, a: Math.floor(r.exact), rem: r.exact - Math.floor(r.exact) }));
  let rest = amount - parts.reduce((s, p) => s + p.a, 0);
  const byRem = [...parts].sort((x, y) => y.rem - x.rem || ids.indexOf(x.m) - ids.indexOf(y.m));
  for (const p of byRem) {
    if (rest <= 0) break;
    p.a += 1;
    rest -= 1;
  }
  return parts.map(({ m, a }) => ({ m, a }));
}

export function sumParts(parts: Part[]): number {
  return parts.reduce((s, p) => s + p.a, 0);
}

/** Alleen delen met een bedrag > 0, samengevoegd per persoon. */
export function cleanParts(parts: Part[]): Part[] {
  const map = new Map<string, number>();
  for (const p of parts) map.set(p.m, (map.get(p.m) ?? 0) + p.a);
  return [...map.entries()].filter(([, a]) => a > 0).map(([m, a]) => ({ m, a }));
}
