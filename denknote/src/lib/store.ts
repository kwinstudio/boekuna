// App-state + offline-first notitiesync. Notities worden altijd eerst lokaal bewaard
// (AsyncStorage) en daarna naar Supabase gestuurd; mislukt dat, dan wordt het later opnieuw geprobeerd.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import * as Crypto from 'expo-crypto';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { applyPushResult, editLocal, isBlank, mergeServerNotes, newLocalNote, retryDelay } from './notesync';
import { supabase } from './supabase';
import type { AiMode, LocalNote, Profile, ServerNote, ThemePref } from './types';

export const NOTE_COLUMNS =
  'id,title,content,ai_mode,content_version,last_analyzed_version,last_analyzed_content,created_at,updated_at';

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error';

export type State = {
  ready: boolean;
  session: Session | null;
  userId: string | null;
  email: string | null;
  notes: Record<string, LocalNote>;
  pendingDeletes: string[];
  notesLoaded: boolean;
  profile: Profile;
  themePref: ThemePref;
  onboarded: boolean;
  sync: SyncStatus;
  lastSyncedAt: number | null;
};

const DEFAULT_PROFILE: Profile = { default_ai_mode: 'silent', allow_related: false };

let state: State = {
  ready: false,
  session: null,
  userId: null,
  email: null,
  notes: {},
  pendingDeletes: [],
  notesLoaded: false,
  profile: DEFAULT_PROFILE,
  themePref: 'system',
  onboarded: false,
  sync: 'idle',
  lastSyncedAt: null,
};

const listeners = new Set<() => void>();
function set(patch: Partial<State> | ((s: State) => Partial<State>)) {
  const p = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...p };
  listeners.forEach((l) => l());
}
export function getState() {
  return state;
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
export function useStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state), () => selector(state));
}

// ── Persistentie ────────────────────────────────────────────────────────────
const PREFS_KEY = 'dn:prefs';
const cacheKey = (uid: string) => `dn:cache:${uid}`;

let persistTimer: ReturnType<typeof setTimeout> | null = null;
function persistSoon() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(persistNow, 300);
}
export async function persistNow() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = null;
  const { userId, notes, pendingDeletes, profile } = state;
  if (!userId) return;
  try {
    await AsyncStorage.setItem(cacheKey(userId), JSON.stringify({ v: 1, notes, pendingDeletes, profile }));
  } catch {
    // Opslag vol of niet beschikbaar: in het geheugen blijft alles staan.
  }
}
async function savePrefs() {
  await AsyncStorage.setItem(PREFS_KEY, JSON.stringify({ themePref: state.themePref, onboarded: state.onboarded })).catch(
    () => {},
  );
}

// ── Opstarten en auth ───────────────────────────────────────────────────────
let initialized = false;
export async function init() {
  if (initialized) return;
  initialized = true;
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      set({ themePref: p.themePref ?? 'system', onboarded: !!p.onboarded });
    }
  } catch {}
  const { data } = await supabase.auth.getSession();
  await applySession(data.session);
  set({ ready: true });
  supabase.auth.onAuthStateChange((_event, session) => {
    applySession(session).catch(() => {});
  });
  AppState.addEventListener('change', (s) => {
    if (s === 'active' && state.userId) {
      pullAll().catch(() => {});
      schedulePush(0);
    }
    if (s !== 'active') persistNow();
  });
}

async function applySession(session: Session | null) {
  const uid = session?.user?.id ?? null;
  if (uid === state.userId) {
    set({ session, email: session?.user?.email ?? null });
    return;
  }
  await persistNow();
  set({
    session,
    userId: uid,
    email: session?.user?.email ?? null,
    notes: {},
    pendingDeletes: [],
    notesLoaded: false,
    profile: DEFAULT_PROFILE,
    sync: 'idle',
    lastSyncedAt: null,
  });
  if (!uid) return;
  try {
    const raw = await AsyncStorage.getItem(cacheKey(uid));
    if (raw) {
      const c = JSON.parse(raw);
      set({ notes: c.notes ?? {}, pendingDeletes: c.pendingDeletes ?? [], profile: c.profile ?? DEFAULT_PROFILE });
    }
  } catch {}
  set({ notesLoaded: true });
  pullAll().catch(() => {});
  schedulePush(0);
}

export function setOnboarded() {
  set({ onboarded: true });
  savePrefs();
}

export function setThemePref(themePref: ThemePref) {
  set({ themePref });
  savePrefs();
}

// ── Ophalen ─────────────────────────────────────────────────────────────────
function isNetworkError(e: unknown): boolean {
  const msg = String((e as { message?: string })?.message ?? e ?? '');
  return /network|fetch|timeout|offline|abort/i.test(msg);
}

export async function pullAll() {
  const uid = state.userId;
  if (!uid) return;
  const startedAt = Date.now() - 30_000; // marge voor klokverschil met de server
  const [notesRes, profileRes] = await Promise.all([
    supabase.from('dn_notes').select(NOTE_COLUMNS).order('updated_at', { ascending: false }).limit(1000),
    supabase.from('dn_profiles').select('default_ai_mode,allow_related').maybeSingle(),
  ]);
  if (state.userId !== uid) return;
  if (notesRes.error) {
    set({ sync: isNetworkError(notesRes.error) ? 'offline' : 'error' });
    return;
  }
  const serverNotes = (notesRes.data ?? []) as ServerNote[];
  let profile = state.profile;
  if (!profileRes.error) {
    if (profileRes.data) profile = profileRes.data as Profile;
    else {
      const { data } = await supabase
        .from('dn_profiles')
        .insert({ default_ai_mode: state.profile.default_ai_mode, allow_related: state.profile.allow_related })
        .select('default_ai_mode,allow_related')
        .single();
      if (data) profile = data as Profile;
    }
  }
  if (state.userId !== uid) return;
  set((s) => ({
    // Samenvoegen met de actuele lokale staat, zodat bewerkingen tijdens het ophalen blijven staan.
    notes: mergeServerNotes(s.notes, serverNotes, new Set(s.pendingDeletes), startedAt),
    profile,
    sync: s.sync === 'syncing' ? s.sync : 'idle',
    lastSyncedAt: Date.now(),
  }));
  persistSoon();
  if (Object.values(state.notes).some((n) => n.dirty)) schedulePush(0);
}

// ── Notities bewerken ───────────────────────────────────────────────────────
export function createNote(): string {
  const id = Crypto.randomUUID();
  const note = newLocalNote(id, state.profile.default_ai_mode);
  set((s) => ({ notes: { ...s.notes, [id]: note } }));
  persistSoon();
  return id;
}

export function updateNote(id: string, patch: Partial<Pick<LocalNote, 'title' | 'content' | 'ai_mode'>>) {
  const cur = state.notes[id];
  if (!cur) return;
  set((s) => ({ notes: { ...s.notes, [id]: editLocal(cur, patch) } }));
  persistSoon();
  schedulePush();
}

export function deleteNote(id: string) {
  const cur = state.notes[id];
  set((s) => {
    const notes = { ...s.notes };
    delete notes[id];
    return {
      notes,
      pendingDeletes: cur?.synced ? [...s.pendingDeletes.filter((x) => x !== id), id] : s.pendingDeletes,
    };
  });
  persistSoon();
  schedulePush(0);
}

/** Lege, nooit verstuurde notitie opruimen (bijv. bij terugnavigeren). */
export function discardIfBlank(id: string) {
  const n = state.notes[id];
  if (n && isBlank(n)) deleteNote(id);
}

// ── Push-lus ────────────────────────────────────────────────────────────────
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pushing: Promise<boolean> | null = null;
let attempt = 0;
const embedQueue = new Set<string>();
let embedTimer: ReturnType<typeof setTimeout> | null = null;

export function schedulePush(delay = 1200) {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    flush().catch(() => {});
  }, delay);
}

/** Alles wat lokaal openstaat naar de server sturen. Geeft true als alles gelukt is. */
export function flush(): Promise<boolean> {
  if (pushing) return pushing.then(() => flush());
  pushing = doPush().finally(() => {
    pushing = null;
  });
  return pushing;
}

async function pushOne(n: LocalNote): Promise<void> {
  const sentRev = n.localRev;
  const payload = { title: n.title, content: n.content, ai_mode: n.ai_mode };
  let row: ServerNote | null = null;
  if (n.synced) {
    const { data, error } = await supabase.from('dn_notes').update(payload).eq('id', n.id).select(NOTE_COLUMNS).maybeSingle();
    if (error) throw error;
    row = (data as ServerNote | null) ?? null;
  }
  if (!row) {
    // Nieuw (of elders verwijderd): aanmaken met de lokale id.
    const { data, error } = await supabase.from('dn_notes').insert({ id: n.id, ...payload }).select(NOTE_COLUMNS).single();
    if (error && error.code === '23505') {
      const retry = await supabase.from('dn_notes').update(payload).eq('id', n.id).select(NOTE_COLUMNS).single();
      if (retry.error) throw retry.error;
      row = retry.data as ServerNote;
    } else if (error) {
      throw error;
    } else {
      row = data as ServerNote;
    }
  }
  const cur = state.notes[n.id];
  if (!cur || !row) return; // tussentijds lokaal verwijderd
  const contentChanged = !cur.synced || row.content_version !== cur.content_version;
  set((s) => ({ notes: { ...s.notes, [n.id]: applyPushResult(s.notes[n.id] ?? cur, sentRev, row!) } }));
  if (contentChanged) queueEmbedding(n.id);
}

async function doPush(): Promise<boolean> {
  const uid = state.userId;
  if (!uid) return false;
  const dirty = Object.values(state.notes).filter((n) => n.dirty && !isBlank(n));
  const deletes = [...state.pendingDeletes];
  if (!dirty.length && !deletes.length) {
    if (state.sync !== 'idle') set({ sync: 'idle' });
    return true;
  }
  set({ sync: 'syncing' });
  try {
    for (const id of deletes) {
      const { error } = await supabase.from('dn_notes').delete().eq('id', id);
      if (error) throw error;
      set((s) => ({ pendingDeletes: s.pendingDeletes.filter((x) => x !== id) }));
    }
    for (const n of dirty) {
      if (state.userId !== uid) return false;
      await pushOne(n);
    }
    attempt = 0;
    set({ sync: 'idle', lastSyncedAt: Date.now() });
    persistSoon();
    if (Object.values(state.notes).some((n) => n.dirty && !isBlank(n))) schedulePush();
    return true;
  } catch (e) {
    set({ sync: isNetworkError(e) ? 'offline' : 'error' });
    persistSoon();
    schedulePush(retryDelay(attempt++));
    return false;
  }
}

// ── Embeddings (alleen met toestemming) ─────────────────────────────────────
function queueEmbedding(id: string) {
  if (!state.profile.allow_related) return;
  embedQueue.add(id);
  if (embedTimer) clearTimeout(embedTimer);
  embedTimer = setTimeout(async () => {
    const ids = [...embedQueue];
    embedQueue.clear();
    for (const noteId of ids) {
      await supabase.functions.invoke('dn-refresh-note-embedding', { body: { note_id: noteId } }).catch(() => {});
    }
  }, 4000);
}

// ── Profiel / instellingen ──────────────────────────────────────────────────
export async function updateProfile(patch: Partial<Profile>): Promise<boolean> {
  const before = state.profile;
  set({ profile: { ...before, ...patch } });
  persistSoon();
  const uid = state.userId;
  if (!uid) return false;
  const { data, error } = await supabase
    .from('dn_profiles')
    .update(patch)
    .eq('user_id', uid)
    .select('default_ai_mode,allow_related')
    .maybeSingle();
  if (error) {
    set({ profile: before });
    return false;
  }
  if (!data) {
    const ins = await supabase
      .from('dn_profiles')
      .insert({ ...before, ...patch })
      .select('default_ai_mode,allow_related')
      .single();
    if (ins.error) {
      set({ profile: before });
      return false;
    }
  }
  if (patch.allow_related) {
    // Bestaande notities alsnog indexeren voor verbanden.
    Object.values(state.notes)
      .filter((n) => n.synced && !isBlank(n))
      .slice(0, 50)
      .forEach((n) => queueEmbedding(n.id));
  }
  return true;
}

export function setNoteMode(id: string, mode: AiMode) {
  updateNote(id, { ai_mode: mode });
}

// ── Account ─────────────────────────────────────────────────────────────────
export async function signOut() {
  await flush().catch(() => {});
  await persistNow();
  await supabase.auth.signOut();
}

/** Alle eigen DenkNote-gegevens verwijderen (via RLS; raakt geen andere apps). */
export async function deleteMyData(): Promise<boolean> {
  const uid = state.userId;
  if (!uid) return false;
  const tasks = await supabase.from('dn_tasks').delete().eq('user_id', uid);
  if (tasks.error) return false;
  const notes = await supabase.from('dn_notes').delete().eq('user_id', uid);
  if (notes.error) return false;
  const prof = await supabase.from('dn_profiles').delete().eq('user_id', uid);
  if (prof.error) return false;
  await AsyncStorage.removeItem(cacheKey(uid)).catch(() => {});
  set({ notes: {}, pendingDeletes: [], profile: DEFAULT_PROFILE });
  await pullAll().catch(() => {});
  return true;
}

/** Na een geslaagde analyse lokaal bijhouden welke versie is geanalyseerd (voorkomt dubbele AI-verzoeken). */
export function markAnalyzedLocal(id: string, version: number, analyzedText: string) {
  const n = state.notes[id];
  if (!n || n.last_analyzed_version > version) return;
  set((s) => ({ notes: { ...s.notes, [id]: { ...n, last_analyzed_version: version, last_analyzed_content: analyzedText } } }));
  persistSoon();
}
