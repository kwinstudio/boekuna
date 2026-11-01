import type { Part } from './types';

/** Vast getal uit een tekst (bijv. het uitgave-id), zodat de verdeling bij elke bewerking gelijk blijft. */
export function seedOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Gelijk verdelen. Restcenten rouleren: welke personen de extra cent krijgen hangt af van `seed`
 * (het uitgave-id), zodat het niet altijd dezelfde mensen zijn.
 */
export function splitEqual(amount: number, ids: string[], seed = 0): Part[] {
  if (ids.length === 0) return [];
  const n = ids.length;
  const base = Math.floor(amount / n);
  const rest = amount - base * n;
  const start = seed % n;
  return ids.map((m, i) => ({ m, a: base + ((i - start + n) % n < rest ? 1 : 0) }));
}

/** Verdelen naar aandelen (bijv. 1, 1, 2) met de grootste-restmethode. */
export function splitShares(amount: number, weights: Record<string, number>, order: string[], seed = 0): Part[] {
  const ids = order.filter((id) => (weights[id] ?? 0) > 0);
  const total = ids.reduce((s, id) => s + weights[id], 0);
  if (total <= 0) return [];
  const raw = ids.map((id) => ({ m: id, exact: (amount * weights[id]) / total }));
  const parts = raw.map((r) => ({ m: r.m, a: Math.floor(r.exact), rem: r.exact - Math.floor(r.exact) }));
  let rest = amount - parts.reduce((s, p) => s + p.a, 0);
  const rot = (m: string) => (ids.indexOf(m) - (seed % ids.length) + ids.length) % ids.length;
  const byRem = [...parts].sort((x, y) => y.rem - x.rem || rot(x.m) - rot(y.m));
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
