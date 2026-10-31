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
  if (!state.profile.deviceId) {
    state = { ...state, profile: { ...state.profile, deviceId: uuid() } };
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

export function createLocalList(name: string, currency: string, myName: string, others: string[]): string {
  const id = uuid();
  const ts = nowIso();
  const me: Member = { id: uuid(), name: myName.trim(), claimed: true, updatedAt: ts };
  const members: Member[] = [me, ...others.map((n) => ({ id: uuid(), name: n.trim(), updatedAt: ts }))];
  const local: LocalList = {
    id,
    token: newToken(),
    me: me.id,
    base: {
      list: { id, name: name.trim(), currency, archived: false, rev: 0, updatedAt: ts, createdAt: ts },
      members,
      entries: [],
      activity: [],
    },
    pending: [{ uid: uuid(), op: 'member', data: me }],
    needsCreate: true,
    joinedAt: Date.now(),
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
