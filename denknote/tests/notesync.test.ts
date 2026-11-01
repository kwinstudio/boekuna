import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyPushResult,
  editLocal,
  formatWhen,
  mergeServerNotes,
  newLocalNote,
  retryDelay,
  searchNotes,
  toLocal,
} from '../src/lib/notesync';
import type { LocalNote, ServerNote } from '../src/lib/types';

const ID1 = '11111111-1111-4111-8111-111111111111';
const ID2 = '22222222-2222-4222-8222-222222222222';
const ID3 = '33333333-3333-4333-8333-333333333333';

function server(id: string, patch: Partial<ServerNote> = {}): ServerNote {
  return {
    id,
    title: 'Server',
    content: 'van de server',
    ai_mode: 'silent',
    content_version: 3,
    last_analyzed_version: 0,
    last_analyzed_content: null,
    created_at: '2026-11-01T10:00:00.000Z',
    updated_at: '2026-11-01T10:00:00.000Z',
    ...patch,
  };
}

test('autosave: lokale bewerking markeert notitie als vuil en verhoogt de revisie', () => {
  const n = newLocalNote(ID1, 'thinking', 1000);
  assert.equal(n.dirty, true);
  assert.equal(n.synced, false);
  const e = editLocal(n, { content: 'Hallo' }, 2000);
  assert.equal(e.localRev, n.localRev + 1);
  assert.equal(e.content, 'Hallo');
  assert.equal(e.localEditedAt, 2000);
});

test('autosave offline: niet-verstuurde notitie blijft bewaard bij ophalen', () => {
  const offline = editLocal(newLocalNote(ID1, 'silent'), { content: 'offline geschreven' });
  const merged = mergeServerNotes({ [ID1]: offline }, [], new Set());
  assert.equal(merged[ID1].content, 'offline geschreven');
  assert.equal(merged[ID1].dirty, true);
});

test('autosave: lokale tekst wint van de server zolang hij niet verstuurd is (geen gegevensverlies)', () => {
  const local = editLocal(toLocal(server(ID1)), { content: 'nieuwe lokale tekst' });
  const merged = mergeServerNotes({ [ID1]: local }, [server(ID1, { content_version: 4, content: 'oud' })], new Set());
  assert.equal(merged[ID1].content, 'nieuwe lokale tekst');
  assert.equal(merged[ID1].dirty, true);
  assert.equal(merged[ID1].content_version, 4);
});

test('ophalen: schone notities worden door de server bijgewerkt', () => {
  const local = toLocal(server(ID1));
  const merged = mergeServerNotes({ [ID1]: local }, [server(ID1, { content: 'elders bewerkt', content_version: 5 })], new Set());
  assert.equal(merged[ID1].content, 'elders bewerkt');
  assert.equal(merged[ID1].dirty, false);
});

test('ophalen: elders verwijderd → hier weg; elders verwijderd maar hier bewerkt → opnieuw aanmaken', () => {
  const clean = toLocal(server(ID1));
  const edited = editLocal(toLocal(server(ID2)), { content: 'nog bezig' });
  const merged = mergeServerNotes({ [ID1]: clean, [ID2]: edited }, [], new Set());
  assert.equal(merged[ID1], undefined);
  assert.equal(merged[ID2].synced, false);
  assert.equal(merged[ID2].content, 'nog bezig');
});

test('ophalen: net verstuurde notitie verdwijnt niet als hij nog niet in de serverlijst zat', () => {
  const fresh = toLocal(server(ID3, { updated_at: new Date(5_000_000).toISOString() }));
  const merged = mergeServerNotes({ [ID3]: fresh }, [], new Set(), 4_000_000);
  assert.ok(merged[ID3]);
});

test('ophalen: lokaal verwijderde notities komen niet terug', () => {
  const merged = mergeServerNotes({}, [server(ID1)], new Set([ID1]));
  assert.equal(merged[ID1], undefined);
});

test('versieconflict: push-resultaat overschrijft geen latere lokale bewerking', () => {
  const base = editLocal(toLocal(server(ID1)), { content: 'A' });
  const sentRev = base.localRev;
  const later = editLocal(base, { content: 'AB' }); // typt verder terwijl de push loopt
  const res = applyPushResult(later, sentRev, server(ID1, { content: 'A', content_version: 4 }));
  assert.equal(res.content, 'AB');
  assert.equal(res.dirty, true);
  assert.equal(res.content_version, 4);
});

test('push-resultaat zonder tussentijdse bewerking: notitie is schoon met serverversie', () => {
  const base = editLocal(toLocal(server(ID1)), { content: 'A' });
  const res = applyPushResult(base, base.localRev, server(ID1, { content: 'A', content_version: 4 }));
  assert.equal(res.dirty, false);
  assert.equal(res.synced, true);
  assert.equal(res.content_version, 4);
});

test('zoeken op titel en inhoud, hoofdletter- en accentongevoelig', () => {
  const notes: LocalNote[] = [
    { ...toLocal(server(ID1, { title: 'Pakketje', content: 'DHL en PostNL volgen' })), localEditedAt: 1 },
    { ...toLocal(server(ID2, { title: 'Café-idee', content: 'Koffie en boeken' })), localEditedAt: 2 },
  ];
  assert.deepEqual(searchNotes(notes, 'postnl').map((n) => n.id), [ID1]);
  assert.deepEqual(searchNotes(notes, 'cafe').map((n) => n.id), [ID2]);
  assert.deepEqual(searchNotes(notes, 'koffie boeken').map((n) => n.id), [ID2]);
  assert.deepEqual(searchNotes(notes, '').map((n) => n.id), [ID2, ID1]); // chronologisch, nieuwste eerst
});

test('retry met oplopende wachttijd, gemaximeerd', () => {
  assert.equal(retryDelay(0), 2000);
  assert.equal(retryDelay(2), 8000);
  assert.equal(retryDelay(20), 60000);
});

test('datumweergave', () => {
  const now = new Date(2026, 10, 1, 15, 0).getTime();
  assert.equal(formatWhen(new Date(2026, 10, 1, 9, 5).getTime(), now), 'Vandaag 09:05');
  assert.equal(formatWhen(new Date(2026, 9, 31, 22, 0).getTime(), now), 'Gisteren 22:00');
  assert.equal(formatWhen(new Date(2026, 9, 3).getTime(), now), '3 okt');
});
