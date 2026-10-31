#!/usr/bin/env node
// End-to-end check against the live lootjes function: create, join, rules, draw, secrecy,
// wishlist, anonymous chat, drop-out + redraw, next year, delete. Cleans up after itself.
const API = process.env.LOOTJES_API || 'https://vuwfyhtejsxhdfyvkkeq.supabase.co/functions/v1/lootjes';
let failures = 0;
const ok = (cond, msg) => { if (cond) console.log(`ok   ${msg}`); else { failures++; console.log(`::error title=API smoke::${msg}`); } };
async function call(action, params = {}, expectError = false) {
  const r = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ...params }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok && !expectError) throw new Error(`${action}: ${r.status} ${JSON.stringify(j)}`);
  return expectError ? { status: r.status, ...j } : j;
}

const created = await call('createGroup', {
  name: 'CI-test familie', occasion: 'sinterklaas', eventDate: '2026-12-05', budgetCents: 2000,
  organizerName: 'Org', organizerParticipates: true, members: ['Anna', 'Bram', 'Cees', 'Daan'],
});
const admin = created.adminToken;
const tok = Object.fromEntries(created.members.map((m) => [m.name, m.token]));
const id = Object.fromEntries(created.members.map((m) => [m.name, m.id]));
ok(created.members.length === 5 && created.group.joinCode.length === 7, 'group created with 5 people and a 7-char code');

try {
  const dup = await call('createGroup', { name: 'x', organizerName: 'A', members: ['a'] }, true);
  ok(dup.status === 400 && dup.error.code === 'duplicate', 'duplicate names are refused');

  const preview = await call('groupByCode', { joinCode: created.group.joinCode.toLowerCase() });
  ok(preview.memberNames.length === 5, 'join preview by code (case-insensitive)');
  const joined = await call('join', { joinCode: created.group.joinCode, name: 'Eva' });
  tok.Eva = joined.token; id.Eva = joined.member.id;
  const dupJoin = await call('join', { joinCode: created.group.joinCode, name: 'eva' }, true);
  ok(dupJoin.status === 409, 'joining with an existing name is refused');

  await call('setExclusions', { adminToken: admin, exclusions: [[id.Anna, id.Bram], [id.Cees, id.Daan]] });
  const tooEarly = await call('sendMessage', { token: tok.Anna, thread: 'myLootje', body: 'hoi' }, true);
  ok(tooEarly.status === 409, 'no messages before the draw');

  const drawn = await call('draw', { adminToken: admin });
  ok(!!drawn.group.drawnAt && drawn.members.length === 6, 'draw succeeded for 6 people');
  ok(!JSON.stringify(drawn).includes('receiver'), 'organizer status contains no pairs');
  const again = await call('draw', { adminToken: admin }, true);
  ok(again.status === 409, 'second draw needs explicit redraw');
  const lateJoin = await call('join', { joinCode: created.group.joinCode, name: 'Laat' }, true);
  ok(lateJoin.status === 409, 'joining after the draw is refused');

  // Every person sees exactly one receiver; together a valid permutation honoring the rules.
  const me = {};
  for (const n of Object.keys(tok)) me[n] = await call('me', { token: tok[n] });
  const pairs = Object.entries(me).map(([n, d]) => [n, d.receiver?.name]);
  const receivers = new Set(pairs.map((p) => p[1]));
  ok(pairs.every(([g, r]) => r && g !== r), 'everyone has a lootje and nobody drew themselves');
  ok(receivers.size === 6, 'everyone receives exactly one gift');
  const banned = new Set(['Anna|Bram', 'Bram|Anna', 'Cees|Daan', 'Daan|Cees']);
  ok(pairs.every(([g, r]) => !banned.has(`${g}|${r}`)), 'exclusions respected both ways');
  ok(!JSON.stringify(me.Anna).includes(tok.Bram), 'no tokens leak in member data');

  // Wishlist reaches the giver; anonymous chat both ways.
  const giverOfAnna = pairs.find(([, r]) => r === 'Anna')[0];
  await call('setWishlist', { token: tok.Anna, wishlist: 'Een boek https://example.com' });
  const g1 = await call('me', { token: tok[giverOfAnna] });
  ok(g1.receiver.wishlist.includes('Een boek'), 'giver sees the wishlist');
  await call('sendMessage', { token: tok[giverOfAnna], thread: 'myLootje', body: 'Welke kleur?' });
  const a1 = await call('me', { token: tok.Anna });
  const q = a1.messages.find((m) => m.thread === 'mySint');
  ok(q && !q.fromMe && q.body === 'Welke kleur?', 'receiver gets the anonymous question');
  ok(!JSON.stringify(a1.messages).includes(giverOfAnna), 'question does not reveal the giver');
  await call('sendMessage', { token: tok.Anna, thread: 'mySint', body: 'Groen' });
  const g2 = await call('me', { token: tok[giverOfAnna] });
  ok(g2.messages.some((m) => m.thread === 'myLootje' && !m.fromMe && m.body === 'Groen'), 'answer reaches the giver');

  await call('setGiftReady', { token: tok.Anna, ready: true });
  await call('markLinkSent', { adminToken: admin, memberId: id.Anna });
  const st = await call('adminStatus', { adminToken: admin });
  const annaRow = st.members.find((m) => m.name === 'Anna');
  ok(annaRow.giftReady && annaRow.openedAt && annaRow.linkSentAt && annaRow.hasWishlist, 'organizer sees opened/sent/wishlist/ready flags');

  // A renewed link replaces the old one.
  const renewed = await call('renewMemberLink', { adminToken: admin, memberId: id.Daan });
  const oldLink = await call('me', { token: tok.Daan }, true);
  ok(oldLink.status === 404, 'old personal link stops working after renewal');
  tok.Daan = renewed.member.token;

  // Drop-out after the draw -> draw is reset, then redraw works.
  const afterRemove = await call('removeMember', { adminToken: admin, memberId: id.Eva });
  ok(!afterRemove.group.drawnAt && afterRemove.members.length === 5, 'removing someone after the draw resets it');
  const redrawn = await call('draw', { adminToken: admin, redraw: true });
  ok(!!redrawn.group.drawnAt, 'redraw after a drop-out works');

  // Impossible rules are explained, not looped.
  const tight = await call('createGroup', { name: 'CI krap', organizerName: 'X', members: ['Y', 'Z'] });
  const tIds = tight.members.map((m) => m.id);
  await call('setExclusions', { adminToken: tight.adminToken, exclusions: [[tIds[0], tIds[1]]] });
  const imp = await call('draw', { adminToken: tight.adminToken }, true);
  ok(imp.status === 400 && imp.error.code === 'draw_impossible', 'impossible rules give a clear error');
  await call('deleteGroup', { adminToken: tight.adminToken });

  // Next year: new group, last year's pairs avoided where possible.
  const next = await call('nextYear', { adminToken: admin, eventDate: '2027-12-05' });
  const nd = await call('draw', { adminToken: next.adminToken });
  ok(nd.repeatedLastYear === false, 'next year avoids last year\'s pairs');
  await call('deleteGroup', { adminToken: next.adminToken });

  const bad = await call('adminStatus', { adminToken: 'x'.repeat(40) }, true);
  ok(bad.status === 404, 'wrong admin token is refused');
} finally {
  await call('deleteGroup', { adminToken: admin }).catch(() => {});
  const gone = await call('adminStatus', { adminToken: admin }, true);
  ok(gone.status === 404, 'test group deleted');
}
console.log(failures ? `${failures} check(s) failed` : 'all API checks passed');
process.exit(failures ? 1 : 0);
