import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitEqual, splitShares, sumParts } from '../src/lib/split';
import { computeBalances, computeBreakdown, settle } from '../src/lib/balances';
import { formatMoney, parseMoney, keypadInput, centsToInput } from '../src/lib/money';
import { applyOps } from '../src/lib/ops';
import type { Entry, Member, ListState } from '../src/lib/types';

const M = (id: string): Member => ({ id, name: id, updatedAt: '2026-01-01T00:00:00Z' });
const members = ['K', 'S', 'D', 'L'].map(M);
const order = members.map((m) => m.id);
let n = 0;
const E = (kind: Entry['kind'], amount: number, payer: string, shares: { m: string; a: number }[]): Entry => ({
  id: `e${++n}`,
  kind,
  title: '',
  amount,
  date: '2026-10-10',
  payers: [{ m: payer, a: amount }],
  shares,
  splitMode: 'equal',
  updatedAt: '2026-01-01T00:00:00Z',
});

test('gelijk verdelen telt exact op, rest naar de eersten', () => {
  const p = splitEqual(1000, ['a', 'b', 'c']);
  assert.deepEqual(p.map((x) => x.a), [334, 333, 333]);
  assert.equal(sumParts(p), 1000);
  for (let amt = 1; amt < 2000; amt += 7) {
    for (let k = 1; k <= 7; k++) {
      assert.equal(sumParts(splitEqual(amt, Array.from({ length: k }, (_, i) => `m${i}`))), amt);
    }
  }
});

test('aandelen verdelen (1,1,2,0) = 13,50 / 13,50 / 27,00', () => {
  const p = splitShares(5400, { K: 1, S: 1, D: 2, L: 0 }, order);
  assert.deepEqual(p, [
    { m: 'K', a: 1350 },
    { m: 'S', a: 1350 },
    { m: 'D', a: 2700 },
  ]);
  for (let amt = 1; amt < 3000; amt += 13) {
    assert.equal(sumParts(splitShares(amt, { K: 1, S: 2, D: 3 }, order)), amt);
  }
});

test('voorbeeld Weekend Texel klopt met het ontwerp', () => {
  const eq = (amt: number) => splitEqual(amt, order);
  const entries = [
    E('expense', 32000, 'S', eq(32000)),
    E('expense', 8640, 'K', eq(8640)),
    E('expense', 6000, 'D', eq(6000)),
    E('expense', 5400, 'K', eq(5400)),
    E('expense', 4800, 'L', eq(4800)),
  ];
  const b = computeBalances(entries, members);
  assert.deepEqual(b, { K: -170, S: 17790, D: -8210, L: -9410 });
  const t = settle(b, order);
  assert.equal(t.length, 3);
  assert.deepEqual(t[0], { from: 'L', to: 'S', amount: 9410 });
  // Na alle terugbetalingen is iedereen quitte.
  const after = [...entries, ...t.map((x) => E('transfer', x.amount, x.from, [{ m: x.to, a: x.amount }]))];
  assert.deepEqual(Object.values(computeBalances(after, members)), [0, 0, 0, 0]);
  const bd = computeBreakdown(entries, members).K;
  assert.equal(bd.paid, 14040);
  assert.equal(bd.share, 14210);
});

test('inkomsten verlagen het saldo van de ontvanger', () => {
  const b = computeBalances([E('income', 1000, 'K', splitEqual(1000, ['K', 'S']))], members);
  assert.equal(b.K, -500);
  assert.equal(b.S, 500);
});

test('verrekenen: saldi tellen op tot nul, max n-1 betalingen', () => {
  for (let i = 0; i < 200; i++) {
    const ids = Array.from({ length: 2 + (i % 8) }, (_, j) => `p${j}`);
    const bal: Record<string, number> = {};
    let sum = 0;
    ids.slice(1).forEach((id) => {
      const v = Math.round(Math.sin(i * 31 + id.length * 7 + ids.indexOf(id)) * 10000);
      bal[id] = v;
      sum += v;
    });
    bal[ids[0]] = -sum;
    const t = settle(bal, ids);
    assert.ok(t.length <= ids.length - 1);
    const res = { ...bal };
    for (const x of t) {
      res[x.from] += x.amount;
      res[x.to] -= x.amount;
    }
    assert.ok(Object.values(res).every((v) => v === 0));
  }
});

test('geld parsen en tonen', () => {
  assert.equal(parseMoney('54,5'), 5450);
  assert.equal(parseMoney('54.50'), 5450);
  assert.equal(parseMoney('1.234,56'), 123456);
  assert.equal(parseMoney('abc'), null);
  assert.equal(formatMoney(5400), '€ 54,00');
  assert.equal(centsToInput(5450), '54,50');
  let s = '';
  for (const k of ['0', '5', '4', ',', '5', '0', '9']) s = keypadInput(s, k);
  assert.equal(s, '54,50');
  assert.equal(keypadInput('54,50', 'back'), '54,5');
});

test('offline wachtrij wordt optimistisch toegepast', () => {
  const base: ListState = {
    list: { id: 'l', name: 'X', currency: 'EUR', archived: false, rev: 1, updatedAt: '' },
    members,
    entries: [],
    activity: [],
  };
  const e = E('expense', 1000, 'K', splitEqual(1000, ['K', 'S']));
  const s1 = applyOps(base, [{ uid: '1', op: 'entry', data: e }]);
  assert.equal(s1.entries.length, 1);
  const s2 = applyOps(s1, [{ uid: '2', op: 'entry', data: { ...e, deleted: true } }]);
  assert.equal(s2.entries.length, 0);
  const t = { ...E('transfer', 500, 'S', [{ m: 'K', a: 500 }]), batchId: 'b1' };
  const s3 = applyOps(s1, [
    { uid: '3', op: 'entry', data: t },
    { uid: '4', op: 'delete_batch', batchId: 'b1', data: { updatedAt: '' } },
  ]);
  assert.equal(s3.entries.length, 1);
  const s4 = applyOps(base, [{ uid: '5', op: 'list', data: { archived: true, updatedAt: '' } }]);
  assert.equal(s4.list.archived, true);
});
