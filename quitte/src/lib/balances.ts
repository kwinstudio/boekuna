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
