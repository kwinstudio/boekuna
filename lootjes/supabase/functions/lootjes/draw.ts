// Same algorithm as the app's DrawEngine.swift: uniform rejection sampling over
// permutations, randomized backtracking fallback, and a matching-based feasibility check.

export type DrawFailure =
  | { kind: "tooFewPeople" }
  | { kind: "nobodyLeft"; person: string }
  | { kind: "impossible" };

export type DrawOk = { pairs: Map<string, string>; repeatedLastYear: boolean };

const pairKey = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`);

function randInt(n: number): number {
  // Unbiased crypto random integer in [0, n).
  const max = Math.floor(0x1_0000_0000 / n) * n;
  const buf = new Uint32Array(1);
  while (true) {
    crypto.getRandomValues(buf);
    if (buf[0] < max) return buf[0] % n;
  }
}

export function shuffle<T>(items: T[]): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function isFeasible(ids: string[], ok: (g: string, r: string) => boolean): boolean {
  const owner = new Map<string, string>();
  const augment = (g: string, seen: Set<string>): boolean => {
    for (const r of ids) {
      if (!ok(g, r) || seen.has(r)) continue;
      seen.add(r);
      const other = owner.get(r);
      if (other === undefined || augment(other, seen)) {
        owner.set(r, g);
        return true;
      }
    }
    return false;
  };
  return ids.every((g) => augment(g, new Set()));
}

function sample(ids: string[], ok: (g: string, r: string) => boolean): Map<string, string> | null {
  for (let t = 0; t < 5000; t++) {
    const rec = shuffle(ids);
    if (ids.every((g, i) => ok(g, rec[i]))) return new Map(ids.map((g, i) => [g, rec[i]]));
  }
  const givers = shuffle(ids);
  const taken = new Set<string>();
  const result = new Map<string, string>();
  const place = (i: number): boolean => {
    if (i === givers.length) return true;
    const g = givers[i];
    for (const r of shuffle(ids)) {
      if (taken.has(r) || !ok(g, r)) continue;
      taken.add(r);
      result.set(g, r);
      if (place(i + 1)) return true;
      taken.delete(r);
      result.delete(g);
    }
    return false;
  };
  return place(0) ? result : null;
}

export function draw(
  people: string[],
  exclusions: Array<[string, string]>,
  lastYear: Map<string, string> = new Map(),
): { ok: DrawOk } | { error: DrawFailure } {
  const ids = [...new Set(people)].sort();
  if (ids.length < 3) return { error: { kind: "tooFewPeople" } };
  const excl = new Set(exclusions.map(([a, b]) => pairKey(a, b)));
  const allowed = (g: string, r: string, avoid: boolean) =>
    g !== r && !excl.has(pairKey(g, r)) && !(avoid && lastYear.get(g) === r);

  for (const p of ids) {
    if (!ids.some((r) => allowed(p, r, false))) return { error: { kind: "nobodyLeft", person: p } };
  }
  const modes = lastYear.size ? [true, false] : [false];
  for (const avoid of modes) {
    const ok = (g: string, r: string) => allowed(g, r, avoid);
    if (!isFeasible(ids, ok)) continue;
    const pairs = sample(ids, ok);
    if (pairs) {
      const repeatedLastYear = [...pairs].some(([g, r]) => lastYear.get(g) === r);
      return { ok: { pairs, repeatedLastYear } };
    }
  }
  return { error: { kind: "impossible" } };
}
