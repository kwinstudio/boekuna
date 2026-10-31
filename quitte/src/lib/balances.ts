import type { Entry, Member } from './types';

export type Breakdown = {
  paid: number; // zelf voorgeschoten voor uitgaven
  share: number; // eigen deel in uitgaven
  received: number; // ontvangen groepsgeld (inkomsten) dat bij jou ligt
  incomeShare: number; // jouw deel van inkomsten
  sent: number; // terugbetaald aan anderen
  got: number; // terugbetaling ontvangen
  balance: number; // > 0: krijgt geld, < 0: moet betalen
};

const empty = (): Breakdown => ({ paid: 0, share: 0, received: 0, incomeShare: 0, sent: 0, got: 0, balance: 0 });

export function computeBreakdown(entries: Entry[], members: Member[]): Record<string, Breakdown> {
  const out: Record<string, Breakdown> = {};
  for (const m of members) out[m.id] = empty();
  const get = (id: string) => (out[id] ??= empty());
  for (const e of entries) {
    if (e.deleted) continue;
    for (const p of e.payers) {
      const b = get(p.m);
      if (e.kind === 'expense') b.paid += p.a;
      else if (e.kind === 'income') b.received += p.a;
      else b.sent += p.a;
    }
    for (const p of e.shares) {
      const b = get(p.m);
      if (e.kind === 'expense') b.share += p.a;
      else if (e.kind === 'income') b.incomeShare += p.a;
      else b.got += p.a;
    }
  }
  for (const b of Object.values(out)) {
    b.balance = b.paid - b.share - b.received + b.incomeShare + b.sent - b.got;
  }
  return out;
}

export function computeBalances(entries: Entry[], members: Member[]): Record<string, number> {
  const bd = computeBreakdown(entries, members);
  return Object.fromEntries(Object.entries(bd).map(([k, v]) => [k, v.balance]));
}

export type Transfer = { from: string; to: string; amount: number };

/**
 * Zo min mogelijk betalingen: steeds de grootste schuldenaar betaalt de grootste ontvanger.
 * Levert hooguit n-1 betalingen op.
 */
export function settle(balances: Record<string, number>, order: string[] = Object.keys(balances)): Transfer[] {
  const idx = (id: string) => {
    const i = order.indexOf(id);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  const creditors = Object.entries(balances)
    .filter(([, v]) => v > 0)
    .map(([id, v]) => ({ id, v }));
  const debtors = Object.entries(balances)
    .filter(([, v]) => v < 0)
    .map(([id, v]) => ({ id, v: -v }));
  const out: Transfer[] = [];
  const sort = (arr: { id: string; v: number }[]) => arr.sort((a, b) => b.v - a.v || idx(a.id) - idx(b.id));
  sort(creditors);
  sort(debtors);
  while (creditors.length && debtors.length) {
    const c = creditors[0];
    const d = debtors[0];
    const amt = Math.min(c.v, d.v);
    if (amt > 0) out.push({ from: d.id, to: c.id, amount: amt });
    c.v -= amt;
    d.v -= amt;
    if (c.v === 0) creditors.shift();
    if (d.v === 0) debtors.shift();
    sort(creditors);
    sort(debtors);
  }
  return out;
}

export function totalSpent(entries: Entry[]): number {
  return entries.filter((e) => !e.deleted && e.kind === 'expense').reduce((s, e) => s + e.amount, 0);
}

/**
 * "Alleen directe schulden": iedereen betaalt terug aan wie er echt voor hem betaalde,
 * zonder schulden via anderen te vereenvoudigen. Per paar wordt netto verrekend.
 */
export function directTransfers(entries: Entry[], order: string[] = []): Transfer[] {
  const owed = new Map<string, number>(); // key "debtor>creditor"
  const add = (debtor: string, creditor: string, cents: number) => {
    if (debtor === creditor || cents === 0) return;
    const k = `${debtor}>${creditor}`;
    owed.set(k, (owed.get(k) ?? 0) + cents);
  };
  for (const e of entries) {
    if (e.deleted || e.amount <= 0) continue;
    if (e.kind === 'transfer') {
      // Van -> aan: de betaler lost schuld bij de ontvanger af.
      for (const p of e.payers) for (const s of e.shares) add(s.m, p.m, Math.round((p.a * s.a) / e.amount));
      continue;
    }
    for (const s of e.shares) {
      // Verdeel elk deel naar rato over de betalers (grootste-restmethode, exact in centen).
      const raw = e.payers.map((p) => ({ m: p.m, exact: (s.a * p.a) / e.amount }));
      const parts = raw.map((r) => ({ m: r.m, a: Math.floor(r.exact), rem: r.exact - Math.floor(r.exact) }));
      let rest = s.a - parts.reduce((x, p) => x + p.a, 0);
      for (const p of [...parts].sort((a, b) => b.rem - a.rem)) {
        if (rest <= 0) break;
        p.a += 1;
        rest -= 1;
      }
      for (const p of parts) {
        if (e.kind === 'income') add(p.m, s.m, p.a);
        else add(s.m, p.m, p.a);
      }
    }
  }
  const idx = (id: string) => (order.indexOf(id) === -1 ? 1e9 : order.indexOf(id));
  const seen = new Set<string>();
  const out: Transfer[] = [];
  for (const k of owed.keys()) {
    const [a, b] = k.split('>');
    const pair = [a, b].sort().join('|');
    if (seen.has(pair)) continue;
    seen.add(pair);
    const net = (owed.get(`${a}>${b}`) ?? 0) - (owed.get(`${b}>${a}`) ?? 0);
    if (net > 0) out.push({ from: a, to: b, amount: net });
    else if (net < 0) out.push({ from: b, to: a, amount: -net });
  }
  return out.sort((x, y) => idx(x.from) - idx(y.from) || y.amount - x.amount);
}

/** Wie is aan de beurt om de volgende rekening te betalen: de persoon met het laagste saldo. */
export function nextPayer(balances: Record<string, number>, activeIds: string[]): string | null {
  const ids = activeIds.filter((id) => id in balances);
  if (ids.length < 2) return null;
  const sorted = [...ids].sort((a, b) => balances[a] - balances[b] || activeIds.indexOf(a) - activeIds.indexOf(b));
  const lowest = sorted[0];
  const highest = sorted[sorted.length - 1];
  return balances[highest] - balances[lowest] >= 100 ? lowest : null;
}

/** Voortgang van het verrekenen: al terugbetaald versus nog open. */
export function settleProgress(entries: Entry[], open: Transfer[]) {
  const paid = entries.filter((e) => !e.deleted && e.kind === 'transfer').reduce((s, e) => s + e.amount, 0);
  const remaining = open.reduce((s, t) => s + t.amount, 0);
  return { paid, remaining, total: paid + remaining };
}
