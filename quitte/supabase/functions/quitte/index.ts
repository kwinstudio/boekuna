// Quitte edge function: foto's (ondertekende URL's) en backup via Inloggen met Apple.
// Elke actie die lijstdata raakt vereist de geheime lijstcode; backup vereist een geldig Apple-identiteitstoken.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@5';

const BUNDLE_ID = 'nl.zichtwerf.quitte';
const BUCKET = 'quitte-photos';
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});
const appleKeys = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

async function listIdFor(token: unknown): Promise<string> {
  if (typeof token !== 'string' || token.length < 24 || token.length > 64) throw new Error('not_found');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const hash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  const { data, error } = await admin.from('quitte_lists').select('id').eq('token_hash', hash).maybeSingle();
  if (error) console.error('list lookup', error.message);
  if (error || !data) throw new Error('not_found');
  return data.id as string;
}

async function appleOwner(identityToken: unknown): Promise<string> {
  if (typeof identityToken !== 'string') throw new Error('unauthorized');
  const { payload } = await jwtVerify(identityToken, appleKeys, { issuer: 'https://appleid.apple.com', audience: BUNDLE_ID });
  if (!payload.sub) throw new Error('unauthorized');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`quitte-owner:${payload.sub}`));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const uuidRe = /^[0-9a-f-]{36}$/i;

async function sha(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_json' }, 400);
  }
  try {
    switch (body.action) {
      case 'photo_upload': {
        const listId = await listIdFor(body.token);
        if (typeof body.entryId !== 'string' || !uuidRe.test(body.entryId)) return json({ error: 'bad_entry' }, 400);
        const path = `${listId}/${body.entryId}/${crypto.randomUUID()}.jpg`;
        const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
        if (error) throw error;
        return json({ path, signedUrl: data.signedUrl, uploadToken: data.token });
      }
      case 'photo_urls': {
        const listId = await listIdFor(body.token);
        const paths = (Array.isArray(body.paths) ? body.paths : [])
          .filter((p): p is string => typeof p === 'string' && p.startsWith(`${listId}/`) && !p.includes('..'))
          .slice(0, 100);
        if (!paths.length) return json({ urls: {} });
        const { data, error } = await admin.storage.from(BUCKET).createSignedUrls(paths, 3600);
        if (error) throw error;
        const urls: Record<string, string> = {};
        for (const d of data ?? []) if (d.path && d.signedUrl) urls[d.path] = d.signedUrl;
        return json({ urls });
      }
      case 'backup_save': {
        // Eerste keer: met Apple-identiteitstoken (levert een backupsleutel op). Daarna: met die sleutel.
        const lists = (Array.isArray(body.lists) ? body.lists : [])
          .filter((l: any) => l && typeof l.token === 'string' && l.token.length >= 24 && l.token.length <= 64)
          .slice(0, 200)
          .map((l: any) => ({ token: l.token, me: typeof l.me === 'string' && uuidRe.test(l.me) ? l.me : null, name: String(l.name ?? '').slice(0, 80) }));
        let owner: string;
        let key: string | null = null;
        if (typeof body.identityToken === 'string') {
          owner = await appleOwner(body.identityToken);
          const { data: row } = await admin.from('quitte_backups').select('key_hash').eq('owner_hash', owner).maybeSingle();
          key = crypto.randomUUID() + crypto.randomUUID();
          const { error } = await admin.from('quitte_backups').upsert({ owner_hash: owner, lists: row ? undefined : lists, key_hash: await sha(key), updated_at: new Date().toISOString() });
          if (error) throw error;
          if (!row) return json({ ok: true, key, count: lists.length });
        } else if (typeof body.key === 'string' && body.key.length >= 40) {
          const { data: row } = await admin.from('quitte_backups').select('owner_hash').eq('key_hash', await sha(body.key)).maybeSingle();
          if (!row) throw new Error('unauthorized');
          owner = row.owner_hash;
        } else throw new Error('unauthorized');
        // Samenvoegen met wat er al staat (andere toestellen), op token.
        const { data: cur } = await admin.from('quitte_backups').select('lists').eq('owner_hash', owner).maybeSingle();
        const merged = new Map<string, any>();
        for (const l of (cur?.lists ?? []) as any[]) merged.set(l.token, l);
        for (const l of lists) merged.set(l.token, { ...merged.get(l.token), ...l });
        const removed = new Set((Array.isArray(body.removed) ? body.removed : []).filter((t: unknown) => typeof t === 'string'));
        const final = [...merged.values()].filter((l) => !removed.has(l.token)).slice(0, 300);
        const { error } = await admin.from('quitte_backups').update({ lists: final, updated_at: new Date().toISOString() }).eq('owner_hash', owner);
        if (error) throw error;
        return json({ ok: true, key, count: final.length });
      }
      case 'backup_restore': {
        const owner = await appleOwner(body.identityToken);
        const { data, error } = await admin.from('quitte_backups').select('lists, updated_at').eq('owner_hash', owner).maybeSingle();
        if (error) throw error;
        // Nieuwe sleutel voor dit toestel.
        const key = crypto.randomUUID() + crypto.randomUUID();
        if (data) await admin.from('quitte_backups').update({ key_hash: await sha(key) }).eq('owner_hash', owner);
        else await admin.from('quitte_backups').insert({ owner_hash: owner, lists: [], key_hash: await sha(key) });
        return json({ lists: data?.lists ?? [], updatedAt: data?.updated_at ?? null, key });
      }
      default:
        return json({ error: 'unknown_action' }, 400);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error';
    if (msg === 'not_found') return json({ error: 'not_found' }, 404);
    if (msg === 'unauthorized' || /JWS|JWT|signature|claim/i.test(msg)) return json({ error: 'unauthorized' }, 401);
    console.error(msg);
    return json({ error: 'server' }, 500);
  }
});
