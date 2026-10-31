import type { Entry, ListState, Op } from './types';

function sortEntries(entries: Entry[]): Entry[] {
  return [...entries].sort(
    (a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? b.updatedAt).localeCompare(a.createdAt ?? a.updatedAt),
  );
}

/** Past wachtende bewerkingen toe op een staat (optimistische weergave). */
export function applyOps(state: ListState, ops: Op[]): ListState {
  if (ops.length === 0) return state;
  let { list, members, entries } = state;
  let comments = [...(state.comments ?? [])];
  let trash = [...(state.trash ?? [])];
  members = [...members];
  entries = [...entries];
  for (const op of ops) {
    switch (op.op) {
      case 'member': {
        const i = members.findIndex((m) => m.id === op.data.id);
        if (i >= 0) members[i] = { ...members[i], ...op.data };
        else members.push(op.data);
        break;
      }
      case 'entry': {
        const i = entries.findIndex((e) => e.id === op.data.id);
        if (op.data.deleted) {
          if (i >= 0) {
            const [gone] = entries.splice(i, 1);
            if (!gone.batchId) trash = [{ ...gone, deleted: true, deletedAt: op.data.updatedAt }, ...trash];
          }
        } else {
          trash = trash.filter((e) => e.id !== op.data.id);
          if (i >= 0) entries[i] = { ...entries[i], ...op.data };
          else entries.push({ createdAt: op.data.updatedAt, ...op.data });
        }
        break;
      }
      case 'delete_batch':
        entries = entries.filter((e) => e.batchId !== op.batchId);
        break;
      case 'list': {
        const { updatedAt, ...rest } = op.data;
        list = { ...list, ...Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)) };
        break;
      }
      case 'settings':
        list = { ...list, settings: { ...(list.settings ?? {}), ...op.data.settings } };
        break;
      case 'comment': {
        comments = comments.filter((c) => c.id !== op.data.id);
        if (!op.data.deleted) comments.push(op.data);
        break;
      }
      case 'merge': {
        const { from, into } = op.data;
        const remap = (parts: Entry['payers']) => {
          const m = new Map<string, number>();
          for (const p of parts) {
            const id = p.m === from ? into : p.m;
            m.set(id, (m.get(id) ?? 0) + p.a);
          }
          return [...m.entries()].map(([id, a]) => ({ m: id, a }));
        };
        entries = entries.map((e) =>
          e.payers.some((p) => p.m === from) || e.shares.some((p) => p.m === from)
            ? { ...e, payers: remap(e.payers), shares: remap(e.shares) }
            : e,
        );
        members = members.map((m) => (m.id === from ? { ...m, deleted: true } : m));
        comments = comments.map((c) => (c.memberId === from ? { ...c, memberId: into } : c));
        break;
      }
    }
  }
  return { ...state, list, members, comments, trash, entries: sortEntries(entries) };
}
