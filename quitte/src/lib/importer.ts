// Overstappen zonder gedoe: CSV-exports van andere apps omzetten naar een Quitte-lijst.
// Ondersteund: Splitwise (netto per persoon), "betaald door + bedrag per persoon" (Tricount, WieBetaaltWat e.d.)
// en de eigen Quitte-CSV. Bedragen altijd in centen; elke post klopt exact (som van delen = bedrag).

export type ImportPart = { name: string; a: number };
export type ImportEntry = {
  kind: 'expense' | 'transfer' | 'income';
  title: string;
  amount: number;
  date: string;
  payers: ImportPart[];
  shares: ImportPart[];
  category?: string | null;
};
export type ImportResult = { source: 'splitwise' | 'wide' | 'quitte'; currency: string | null; members: string[]; entries: ImportEntry[]; skipped: number };

export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/)[0] ?? '';
  const delim = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : (firstLine.includes('\t') ? '\t' : ',');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((x) => x.trim() !== '')) rows.push(row.map((x) => x.trim()));
      row = [];
      cell = '';
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row.map((x) => x.trim()));
  return rows;
}

/** "1.234,56", "1,234.56", "-12.5", "€ 3,00" → centen. */
export function toCents(v: string): number | null {
  let s = (v ?? '').replace(/[^\d,.\-]/g, '');
  if (!s || !/\d/.test(s)) return null;
  const neg = s.startsWith('-');
  s = s.replace(/-/g, '');
  const lastC = s.lastIndexOf(',');
  const lastD = s.lastIndexOf('.');
  const dec = Math.max(lastC, lastD);
  let whole = s;
  let frac = '';
  if (dec >= 0 && s.length - dec - 1 <= 2 && s.length - dec - 1 > 0) {
    whole = s.slice(0, dec);
    frac = s.slice(dec + 1);
  }
  whole = whole.replace(/[.,]/g, '');
  const cents = parseInt(whole || '0', 10) * 100 + parseInt((frac + '00').slice(0, 2), 10);
  return neg ? -cents : cents;
}

export function toIsoDate(v: string): string {
  const s = (v ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

function fixSum(parts: ImportPart[], total: number): ImportPart[] {
  const out = parts.filter((p) => p.a !== 0).map((p) => ({ ...p }));
  const diff = total - out.reduce((x, p) => x + p.a, 0);
  if (diff !== 0 && out.length) out.sort((a, b) => b.a - a.a)[0].a += diff;
  return out.filter((p) => p.a > 0);
}

function splitwise(rows: string[][]): ImportResult {
  const head = rows[0];
  const names = head.slice(5).filter((n) => n);
  const entries: ImportEntry[] = [];
  let skipped = 0;
  let currency: string | null = null;
  for (const r of rows.slice(1)) {
    const desc = r[1] ?? '';
    if (/total balance|totaal saldo|gesamtsaldo/i.test(desc) || /total balance/i.test(r[0] ?? '')) continue;
    const cost = toCents(r[3]);
    if (!cost || cost <= 0) {
      skipped++;
      continue;
    }
    currency = currency ?? (r[4] || null);
    const nets = names.map((name, i) => ({ name, a: toCents(r[5 + i]) ?? 0 }));
    const isPayment = /^(payment|zahlung|betaling|paiement|pago)$/i.test(r[2] ?? '');
    const pos = nets.filter((n) => n.a > 0);
    const neg = nets.filter((n) => n.a < 0);
    if (isPayment && pos.length === 1 && neg.length === 1) {
      const amt = Math.min(pos[0].a, -neg[0].a);
      entries.push({ kind: 'transfer', title: desc, amount: amt, date: toIsoDate(r[0]), payers: [{ name: pos[0].name, a: amt }], shares: [{ name: neg[0].name, a: amt }] });
      continue;
    }
    // Eén betaler (grootste netto); diens eigen deel = kosten − netto.
    const top = [...pos].sort((a, b) => b.a - a.a)[0];
    if (top && pos.length === 1 && cost - top.a >= 0) {
      const shares = [{ name: top.name, a: cost - top.a }, ...neg.map((n) => ({ name: n.name, a: -n.a }))];
      entries.push({ kind: 'expense', title: desc, amount: cost, date: toIsoDate(r[0]), payers: [{ name: top.name, a: cost }], shares: fixSum(shares, cost) });
    } else if (pos.length) {
      // Meerdere betalers: saldo-gelijke weergave (bedrag = som van de positieve netto's).
      const amt = pos.reduce((x, n) => x + n.a, 0);
      entries.push({ kind: 'expense', title: desc, amount: amt, date: toIsoDate(r[0]), payers: pos, shares: fixSum(neg.map((n) => ({ name: n.name, a: -n.a })), amt) });
    } else skipped++;
  }
  return { source: 'splitwise', currency, members: names, entries, skipped };
}

function quitte(rows: string[][]): ImportResult {
  const entries: ImportEntry[] = [];
  const members = new Set<string>();
  const parts = (s: string) =>
    s
      .split('|')
      .map((x) => x.trim())
      .map((x) => {
        const m = x.match(/^(.*)\s(-?[\d.,]+)$/);
        return m ? { name: m[1].trim(), a: toCents(m[2]) ?? 0 } : null;
      })
      .filter((x): x is ImportPart => !!x && x.a > 0);
  let skipped = 0;
  for (const r of rows.slice(1)) {
    const amount = toCents(r[4]);
    if (!amount) {
      skipped++;
      continue;
    }
    const payers = parts(r[5] ?? '');
    const shares = parts(r[6] ?? '');
    payers.concat(shares).forEach((p) => members.add(p.name));
    const kind = r[1] === 'transfer' ? 'transfer' : r[1] === 'income' ? 'income' : 'expense';
    entries.push({ kind, title: r[2] ?? '', amount, date: toIsoDate(r[0]), payers: fixSum(payers, amount), shares: fixSum(shares, amount), category: r[3] || null });
  }
  return { source: 'quitte', currency: null, members: [...members], entries, skipped };
}

const PAYER = /^(paid by|payer|betaald door|wie betaalde|betaler|bezahlt von|payé par|pagado por)$/i;
const AMOUNT = /^(amount|bedrag|cost|kosten|betrag|montant|importe|amount in default currency|bedrag in standaardvaluta)$/i;
const TITLE = /^(title|description|omschrijving|titel|beschrijving|wat|what|beschreibung|libellé)$/i;
const DATE = /^(date|datum|date & time|datum en tijd|wanneer|when)$/i;
const TYPE = /^(transaction type|type|soort|transactietype)$/i;
const PERSON = /^(?:impacted to|paid for|for|voor|deel|share|aandeel)\s+(.+)$/i;

function wide(rows: string[][]): ImportResult | null {
  const head = rows[0];
  const col = (re: RegExp) => head.findIndex((h) => re.test(norm(h)));
  const iPayer = col(PAYER);
  const iAmount = head.findIndex((h) => /in default currency|in standaardvaluta/i.test(h)) >= 0 ? head.findIndex((h) => /in default currency|in standaardvaluta/i.test(h)) : col(AMOUNT);
  if (iPayer < 0 || iAmount < 0) return null;
  const iTitle = col(TITLE);
  const iDate = col(DATE);
  const iType = col(TYPE);
  const persons = head.map((h, i) => ({ i, m: h.match(PERSON) })).filter((x) => x.m).map((x) => ({ i: x.i, name: x.m![1].trim() }));
  if (!persons.length) return null;
  const members = new Set<string>(persons.map((p) => p.name));
  const entries: ImportEntry[] = [];
  let skipped = 0;
  for (const r of rows.slice(1)) {
    const amount = toCents(r[iAmount]);
    const payer = (r[iPayer] ?? '').trim();
    if (!amount || amount <= 0 || !payer) {
      skipped++;
      continue;
    }
    members.add(payer);
    const type = iType >= 0 ? norm(r[iType] ?? '') : '';
    const shares = persons.map((p) => ({ name: p.name, a: Math.abs(toCents(r[p.i]) ?? 0) })).filter((p) => p.a > 0);
    if (!shares.length) {
      skipped++;
      continue;
    }
    const kind = /transfer|overboeking|terugbetaling|reimbursement|money transfer/.test(type) ? 'transfer' : /income|inkomst/.test(type) ? 'income' : 'expense';
    entries.push({
      kind,
      title: iTitle >= 0 ? r[iTitle] ?? '' : '',
      amount,
      date: toIsoDate(iDate >= 0 ? r[iDate] : ''),
      payers: [{ name: payer, a: amount }],
      shares: fixSum(shares, amount),
    });
  }
  return { source: 'wide', currency: null, members: [...members], entries, skipped };
}

export function importCsv(text: string): ImportResult | null {
  const rows = parseCsv(text);
  if (rows.length < 2) return null;
  const head = rows[0].map(norm);
  if (head[0] === 'date' && head[1] === 'description' && head[3] === 'cost') return splitwise(rows);
  if (head[0] === 'datum' && head[1] === 'soort' && head[4] === 'bedrag') return quitte(rows);
  return wide(rows);
}
