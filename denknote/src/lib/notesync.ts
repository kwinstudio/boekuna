// Pure sync-logica voor notities (zonder React Native-afhankelijkheden, zodat het testbaar is).
import type { AiMode, LocalNote, ServerNote } from './types';

export function toLocal(s: ServerNote, prev?: LocalNote): LocalNote {
  return {
    ...s,
    dirty: false,
    synced: true,
    localRev: prev?.localRev ?? 0,
    localEditedAt: Date.parse(s.updated_at) || Date.now(),
  };
}

export function newLocalNote(id: string, aiMode: AiMode, now = Date.now()): LocalNote {
  const iso = new Date(now).toISOString();
  return {
    id,
    title: '',
    content: '',
    ai_mode: aiMode,
    content_version: 0,
    last_analyzed_version: 0,
    last_analyzed_content: null,
    created_at: iso,
    updated_at: iso,
    dirty: true,
    synced: false,
    localRev: 1,
    localEditedAt: now,
  };
}

export function editLocal(
  note: LocalNote,
  patch: Partial<Pick<LocalNote, 'title' | 'content' | 'ai_mode'>>,
  now = Date.now(),
): LocalNote {
  return { ...note, ...patch, dirty: true, localRev: note.localRev + 1, localEditedAt: now };
}

export function isBlank(note: Pick<LocalNote, 'title' | 'content'>): boolean {
  return !note.title.trim() && !note.content.trim();
}

/**
 * Serverlijst samenvoegen met de lokale cache. Lokale, nog niet verstuurde tekst
 * gaat nooit verloren: bij een vuile notitie blijft de lokale tekst staan.
 */
export function mergeServerNotes(
  local: Record<string, LocalNote>,
  server: ServerNote[],
  pendingDeletes: ReadonlySet<string>,
  /** Notities die na dit tijdstip (ms) nog zijn opgeslagen, zaten mogelijk niet in de serverlijst. */
  keepIfUpdatedAfter = Infinity,
): Record<string, LocalNote> {
  const out: Record<string, LocalNote> = {};
  const seen = new Set<string>();
  for (const s of server) {
    seen.add(s.id);
    if (pendingDeletes.has(s.id)) continue;
    const l = local[s.id];
    if (l && l.dirty) {
      out[s.id] = {
        ...s,
        title: l.title,
        content: l.content,
        ai_mode: l.ai_mode,
        dirty: true,
        synced: true,
        localRev: l.localRev,
        localEditedAt: l.localEditedAt,
      };
    } else {
      out[s.id] = toLocal(s, l);
    }
  }
  for (const [id, l] of Object.entries(local)) {
    if (seen.has(id) || pendingDeletes.has(id)) continue;
    if (!l.synced) out[id] = l; // nog nooit verstuurd
    else if (l.dirty) out[id] = { ...l, synced: false }; // elders verwijderd terwijl hier bewerkt: opnieuw aanmaken
    else if (Date.parse(l.updated_at) >= keepIfUpdatedAfter) out[id] = l; // net verstuurd tijdens het ophalen
    // anders: elders verwijderd → hier ook weg
  }
  return out;
}

/** Resultaat van een push verwerken zonder tussentijdse lokale bewerkingen te overschrijven. */
export function applyPushResult(current: LocalNote, sentRev: number, server: ServerNote): LocalNote {
  if (current.localRev === sentRev) {
    return { ...toLocal(server, current), localEditedAt: current.localEditedAt };
  }
  return {
    ...current,
    synced: true,
    dirty: true,
    content_version: server.content_version,
    last_analyzed_version: server.last_analyzed_version,
    last_analyzed_content: server.last_analyzed_content,
    created_at: server.created_at,
    updated_at: server.updated_at,
  };
}

function norm(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
}

export function sortNotes(notes: LocalNote[]): LocalNote[] {
  return [...notes].sort((a, b) => b.localEditedAt - a.localEditedAt);
}

export function searchNotes(notes: LocalNote[], query: string): LocalNote[] {
  const q = norm(query.trim());
  const sorted = sortNotes(notes);
  if (!q) return sorted;
  const terms = q.split(/\s+/).filter(Boolean);
  return sorted.filter((n) => {
    const hay = norm(`${n.title}\n${n.content}`);
    return terms.every((t) => hay.includes(t));
  });
}

export function retryDelay(attempt: number): number {
  return Math.min(60_000, 2_000 * 2 ** Math.max(0, attempt));
}

export function previewText(content: string, max = 140): string {
  const s = content.replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s;
}

const MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

export function formatWhen(ms: number, now = Date.now()): string {
  const d = new Date(ms);
  const n = new Date(now);
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(n) - startOf(d)) / 86_400_000);
  if (days === 0) return `Vandaag ${time}`;
  if (days === 1) return `Gisteren ${time}`;
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === n.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}
