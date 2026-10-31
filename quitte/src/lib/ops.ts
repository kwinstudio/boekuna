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
          if (i >= 0) entries.splice(i, 1);
        } else if (i >= 0) entries[i] = { ...entries[i], ...op.data };
        else entries.push({ createdAt: op.data.updatedAt, ...op.data });
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
    }
  }
  return { ...state, list, members, entries: sortEntries(entries) };
}
