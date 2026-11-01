import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { applyOps } from './ops';
import { newToken, nowIso, uuid } from './ids';
import type { ListState, LocalList, Member, Op } from './types';

const KEY = 'quitte:v1';

export type Profile = {
  name: string;
  iban: string;
  payLink?: string;
  deviceId?: string;
  /** Sleutel waarmee dit toestel de Apple-backup bijwerkt (na eenmalig inloggen met Apple). */
  backupKey?: string | null;
  backupAt?: number | null;
  monthlyDigest?: boolean;
  firstOpenAt?: number;
  reviewedVersion?: string;
  ownEntries?: number;
  /** Pushmeldingen: undefined = nog niet gevraagd. */
  pushOn?: boolean;
  pushToken?: string | null;
  pushAskedAt?: number;
  /** Stille uren 22:00–08:00 (standaard aan). */
  quietHours?: boolean;
};

type State = {
  loaded: boolean;
  lists: Record<string, LocalList>;
  profile: Profile;
};

let state: State = { loaded: false, lists: {}, profile: { name: '', iban: '' } };
const listeners = new Set<() => void>();
const viewCache = new Map<string, { src: LocalList; view: ListState }>();

function emit() {
  for (const l of listeners) l();
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function persist() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const { lists, profile } = state;
    AsyncStorage.setItem(KEY, JSON.stringify({ lists, profile })).catch(() => {});
  }, 150);
}

export function setState(update: (s: State) => State) {
  state = update(state);
  persist();
  emit();
}

export function getState(): State {
  return state;
}

export async function loadStore() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const data = JSON.parse(raw);
      state = { loaded: true, lists: data.lists ?? {}, profile: { name: '', iban: '', ...(data.profile ?? {}) } };
    } else {
      state = { ...state, loaded: true };
    }
  } catch {
    state = { ...state, loaded: true };
  }
  if (!state.profile.deviceId || !state.profile.firstOpenAt) {
    state = { ...state, profile: { ...state.profile, deviceId: state.profile.deviceId ?? uuid(), firstOpenAt: state.profile.firstOpenAt ?? Date.now() } };
    persist();
  }
  emit();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(state),
    () => selector(state),
  );
}

/** Optimistische staat van een lijst: serverstaat + wachtrij. Gecachet zodat React niet onnodig rendert. */
export function viewOf(local: LocalList | undefined): ListState | undefined {
  if (!local) return undefined;
  const c = viewCache.get(local.id);
  if (c && c.src === local) return c.view;
  const view = applyOps(local.base, local.pending);
  viewCache.set(local.id, { src: local, view });
  return view;
}

export function useList(id: string | undefined) {
  const local = useStore((s) => (id ? s.lists[id] : undefined));
  return { local, view: viewOf(local) };
}

// ---- Acties ---------------------------------------------------------------

export function setProfile(p: Partial<Profile>) {
  setState((s) => ({ ...s, profile: { ...s.profile, ...p } }));
}

export function createLocalList(name: string, currency: string, myName: string, others: string[], look?: { color: string; icon: string }): string {
  const id = uuid();
  const ts = nowIso();
  const me: Member = { id: uuid(), name: myName.trim(), claimed: true, updatedAt: ts };
  const members: Member[] = [me, ...others.map((n) => ({ id: uuid(), name: n.trim(), updatedAt: ts }))];
  const local: LocalList = {
    id,
    token: newToken(),
    me: me.id,
    base: {
      list: { id, name: name.trim(), currency, archived: false, rev: 0, updatedAt: ts, createdAt: ts, settings: look ? { ...look } : undefined },
      members,
      entries: [],
      activity: [],
    },
    pending: [
      { uid: uuid(), op: 'member', data: me },
      ...(look ? [{ uid: uuid(), op: 'settings' as const, data: { settings: { ...look }, updatedAt: ts } }] : []),
    ],
    needsCreate: true,
    joinedAt: Date.now(),
  };
  setState((s) => ({ ...s, lists: { ...s.lists, [id]: local } }));
  return id;
}

/** Voorbeeldlijst om meteen te zien hoe Quitte werkt (alleen lokaal). */
export function createDemoList(myName: string, labels: { name: string; items: [string, number, number, string][] }): string {
  const id = uuid();
  const ts = nowIso();
  const names = [myName.trim() || 'Jij', 'Sanne', 'Daan'];
  const members: Member[] = names.map((n) => ({ id: uuid(), name: n, claimed: true, updatedAt: ts }));
  const day = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const entries = labels.items.map(([title, cents, payer, cat], i) => {
    const base = Math.floor(cents / 3);
    const rest = cents - base * 3;
    return {
      id: uuid(),
      kind: 'expense' as const,
      title,
      amount: cents,
      category: cat,
      date: day(i),
      payers: [{ m: members[payer].id, a: cents }],
      shares: members.map((m, k) => ({ m: m.id, a: base + (k < rest ? 1 : 0) })),
      splitMode: 'equal' as const,
      createdBy: members[payer].id,
      createdAt: ts,
      updatedAt: ts,
    };
  });
  const local: LocalList = {
    id,
    token: newToken(),
    me: members[0].id,
    base: { list: { id, name: labels.name, currency: 'EUR', archived: false, rev: 0, updatedAt: ts, createdAt: ts, settings: { color: 'amber', icon: 'sunny-outline' } }, members, entries, activity: [] },
    pending: [],
    needsCreate: false,
    joinedAt: Date.now(),
    invitedAt: Date.now(),
    demo: true,
  };
  setState((s) => ({ ...s, lists: { ...s.lists, [id]: local } }));
  return id;
}

export function addJoinedList(token: string, server: ListState, me: string | null): string {
  const id = server.list.id;
  setState((s) => {
    const existing = s.lists[id];
    const local: LocalList = existing
      ? { ...existing, base: server, me: me ?? existing.me }
      : { id, token, me, base: server, pending: [], needsCreate: false, joinedAt: Date.now(), lastSyncAt: Date.now() };
    return { ...s, lists: { ...s.lists, [id]: local } };
  });
  return id;
}

type NewOp = Op extends infer O ? (O extends Op ? Omit<O, 'uid'> : never) : never;

export function enqueue(listId: string, ops: NewOp[] | NewOp) {
  const arr = (Array.isArray(ops) ? ops : [ops]).map((o) => ({ ...o, uid: uuid() }) as Op);
  setState((s) => {
    const l = s.lists[listId];
    if (!l) return s;
    return { ...s, lists: { ...s.lists, [listId]: { ...l, pending: [...l.pending, ...arr] } } };
  });
}

export function updateLocal(listId: string, patch: Partial<LocalList>) {
  setState((s) => {
    const l = s.lists[listId];
    if (!l) return s;
    return { ...s, lists: { ...s.lists, [listId]: { ...l, ...patch } } };
  });
}

export function removeLocal(listId: string) {
  setState((s) => {
    const { [listId]: _, ...rest } = s.lists;
    return { ...s, lists: rest };
  });
}
