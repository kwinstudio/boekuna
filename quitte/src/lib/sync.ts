import * as Crypto from 'expo-crypto';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { getState, updateLocal } from './store';
import type { ListState, Op } from './types';

type RpcError = { message?: string; code?: string } | null;

/** Fouten van de server zelf (validatie, niet gevonden) versus netwerkproblemen. */
function isServerRejection(err: RpcError) {
  if (!err) return false;
  if (err.message?.includes('quitte_')) return true;
  return !!err.code && /^(P0001|P0002|22\w{3}|23\w{3})$/.test(err.code);
}

export class NotFoundError extends Error {}

export async function fetchState(token: string): Promise<ListState> {
  const { data, error } = await supabase.rpc('quitte_get_state', { p_token: token });
  if (error) {
    if (error.message?.includes('quitte_not_found')) throw new NotFoundError('not_found');
    throw new Error(error.message || 'network');
  }
  return data as ListState;
}

function stripOp(op: Op) {
  const { uid, ...rest } = op;
  return rest;
}

const inflight = new Map<string, Promise<void>>();
const channels = new Map<string, RealtimeChannel>();

function actorName(listId: string): string {
  const l = getState().lists[listId];
  if (!l) return '';
  return l.base.members.find((m) => m.id === l.me)?.name ?? getState().profile.name ?? '';
}

async function doSync(listId: string): Promise<void> {
  let l = getState().lists[listId];
  if (!l) return;
  const actor = actorName(listId);
  try {
    if (l.needsCreate) {
      const { data, error } = await supabase.rpc('quitte_create_list', {
        p_token: l.token,
        p_list: { id: l.base.list.id, name: l.base.list.name, currency: l.base.list.currency },
        p_members: l.base.members.map((m) => ({ id: m.id, name: m.name })),
        p_actor: actor,
      });
      if (error) throw error;
      updateLocal(listId, { needsCreate: false, base: data as ListState });
      l = getState().lists[listId];
      if (!l) return;
    }

    if (l.pending.length > 0) {
      const batch = l.pending.slice(0, 100);
      const { data, error } = await supabase.rpc('quitte_apply', {
        p_token: l.token,
        p_ops: batch.map(stripOp),
        p_actor: actor,
      });
      if (error) {
        if (!isServerRejection(error)) throw error;
        // Eén bewerking wordt geweigerd: stuur ze los, sla de foute over zodat de rest niet blijft hangen.
        let last: ListState | null = null;
        for (const op of batch) {
          const r = await supabase.rpc('quitte_apply', { p_token: l.token, p_ops: [stripOp(op)], p_actor: actor });
          if (r.error && !isServerRejection(r.error)) throw r.error;
          if (!r.error) last = r.data as ListState;
        }
        const done = new Set(batch.map((o) => o.uid));
        const cur = getState().lists[listId];
        if (cur) {
          updateLocal(listId, {
            pending: cur.pending.filter((o) => !done.has(o.uid)),
            base: last ?? cur.base,
            lastSyncAt: Date.now(),
            syncError: 'rejected',
          });
        }
      } else {
        const done = new Set(batch.map((o) => o.uid));
        const cur = getState().lists[listId];
        if (cur) {
          updateLocal(listId, {
            pending: cur.pending.filter((o) => !done.has(o.uid)),
            base: data as ListState,
            lastSyncAt: Date.now(),
            syncError: null,
          });
        }
      }
      broadcast(listId);
      const after = getState().lists[listId];
      if (after && after.pending.length > 0) return doSync(listId);
      return;
    }

    const fresh = await fetchState(l.token);
    updateLocal(listId, { base: fresh, lastSyncAt: Date.now(), syncError: null });
  } catch (e) {
    if (e instanceof NotFoundError) {
      updateLocal(listId, { syncError: 'not_found' });
    } else {
      updateLocal(listId, { syncError: 'offline' });
    }
  }
}

const again = new Set<string>();

export function syncList(listId: string): Promise<void> {
  const running = inflight.get(listId);
  if (running) {
    // Na de lopende sync nog één keer, zodat nieuwe wijzigingen niet blijven liggen.
    again.add(listId);
    return running;
  }
  const run = async () => {
    do {
      again.delete(listId);
      await doSync(listId);
    } while (again.has(listId));
  };
  const p = run().finally(() => inflight.delete(listId));
  inflight.set(listId, p);
  return p;
}

export function syncAll() {
  for (const id of Object.keys(getState().lists)) syncList(id);
}

/** Licht pollen: alleen de revisie ophalen en pas bij verschil alles verversen. */
async function checkRev(listId: string) {
  const l = getState().lists[listId];
  if (!l || l.needsCreate) return syncList(listId);
  if (l.pending.length) return syncList(listId);
  const { data, error } = await supabase.rpc('quitte_get_rev', { p_token: l.token });
  if (error) {
    updateLocal(listId, { syncError: error.message?.includes('quitte_not_found') ? 'not_found' : 'offline' });
    return;
  }
  if (typeof data === 'number' && data !== l.base.list.rev) return syncList(listId);
  if (l.syncError) updateLocal(listId, { syncError: null });
}

async function topicFor(token: string) {
  const h = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `quitte:${token}`);
  return `quitte-${h.slice(0, 24)}`;
}

function broadcast(listId: string) {
  const ch = channels.get(listId);
  ch?.send({ type: 'broadcast', event: 'changed', payload: {} }).catch(() => {});
}

/** Houdt een geopende lijst live: realtime-seintjes + af en toe controleren. */
export function useLiveList(listId: string | undefined) {
  useEffect(() => {
    if (!listId) return;
    let cancelled = false;
    let ch: RealtimeChannel | null = null;
    const l = getState().lists[listId];
    if (l) {
      topicFor(l.token).then((topic) => {
        if (cancelled) return;
        ch = supabase.channel(topic, { config: { broadcast: { self: false } } });
        ch.on('broadcast', { event: 'changed' }, () => syncList(listId)).subscribe();
        channels.set(listId, ch);
      });
    }
    syncList(listId);
    const iv = setInterval(() => {
      if (AppState.currentState === 'active') checkRev(listId);
    }, 15000);
    return () => {
      cancelled = true;
      clearInterval(iv);
      if (ch) {
        supabase.removeChannel(ch);
        channels.delete(listId);
      }
    };
  }, [listId]);
}

/** Sync bij openen van de app en bij terugkeren naar de voorgrond; wachtrij periodiek opnieuw proberen. */
export function useBackgroundSync(loaded: boolean) {
  useEffect(() => {
    if (!loaded) return;
    syncAll();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') syncAll();
    });
    const iv = setInterval(() => {
      const lists = getState().lists;
      for (const [id, l] of Object.entries(lists)) {
        if (l.pending.length || l.needsCreate) syncList(id);
      }
    }, 20000);
    return () => {
      sub.remove();
      clearInterval(iv);
    };
  }, [loaded]);
}
