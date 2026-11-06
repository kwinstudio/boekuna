// Gedeelde serverhulpjes voor de DenkNote Edge Functions (Deno).
// De OpenAI-sleutel leest alleen hier, uit de Edge Function-secrets. Nooit in de app.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { noteText } from './logic.ts';

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json; charset=utf-8' },
  });
}

export type ErrorCode =
  | 'unauthorized'
  | 'bad_request'
  | 'not_found'
  | 'rate_limited'
  | 'ai_not_configured'
  | 'ai_unavailable'
  | 'ai_invalid_output'
  | 'server_error';

export function fail(code: ErrorCode, message: string, status: number): Response {
  return json({ error: { code, message } }, status);
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

export const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export type AuthedUser = { id: string; userClient: SupabaseClient };

/** Gebruiker uit de JWT halen; de user_id komt nooit uit de request-body. */
export async function authenticate(req: Request): Promise<AuthedUser | null> {
  const header = req.headers.get('authorization') ?? '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user?.id) return null;
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  return { id: data.user.id, userClient };
}

export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  const len = Number(req.headers.get('content-length') ?? '0');
  if (len > 64_000) return null;
  try {
    const body = await req.json();
    return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Verzoeklimiet per gebruiker en soort; alle vensters moeten passen. */
export async function takeRate(userId: string, bucket: string, windows: { limit: number; seconds: number }[]) {
  for (const w of windows) {
    const { data, error } = await admin.rpc('dn_take_rate', {
      p_user: userId,
      p_bucket: `${bucket}:${w.seconds}`,
      p_limit: w.limit,
      p_window_seconds: w.seconds,
    });
    if (error) throw new Error(`rate: ${error.message}`);
    if (data !== true) return false;
  }
  return true;
}

export type NoteRow = {
  id: string;
  user_id: string;
  title: string;
  content: string;
  ai_mode: 'silent' | 'thinking';
  content_version: number;
  last_analyzed_version: number;
  last_analyzed_content: string | null;
};

export async function loadNote(userId: string, noteId: string): Promise<NoteRow | null> {
  const { data, error } = await admin
    .from('dn_notes')
    .select('id,user_id,title,content,ai_mode,content_version,last_analyzed_version,last_analyzed_content')
    .eq('id', noteId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(`note: ${error.message}`);
  return (data as NoteRow | null) ?? null;
}

export async function allowRelated(userId: string): Promise<boolean> {
  const { data } = await admin.from('dn_profiles').select('allow_related').eq('user_id', userId).maybeSingle();
  return data?.allow_related === true;
}

// ── OpenAI (direct) of Vercel AI Gateway, net als Boekuna in hetzelfde project ──
const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';
const GATEWAY_KEY = Deno.env.get('AI_GATEWAY_API_KEY') ?? '';
const DIRECT = OPENAI_KEY.length > 0;
const API_KEY = DIRECT ? OPENAI_KEY : GATEWAY_KEY;
const RESPONSES_URL = DIRECT
  ? (Deno.env.get('OPENAI_RESPONSES_URL') ?? 'https://api.openai.com/v1/responses')
  : 'https://ai-gateway.vercel.sh/v1/responses';
const EMBEDDINGS_URL = DIRECT ? 'https://api.openai.com/v1/embeddings' : 'https://ai-gateway.vercel.sh/v1/embeddings';
const BASE_MODEL = Deno.env.get('DENKNOTE_MODEL') ?? 'gpt-5.6-sol';
export const MODEL = DIRECT ? BASE_MODEL : `openai/${BASE_MODEL}`;
export const EMBEDDING_MODEL = DIRECT ? 'text-embedding-3-small' : 'openai/text-embedding-3-small';
export const AI_PROVIDER = DIRECT ? 'openai' : GATEWAY_KEY ? 'vercel_ai_gateway' : 'none';

export function aiConfigured(): boolean {
  return API_KEY.length > 0;
}

export class AiError extends Error {
  constructor(public code: 'ai_not_configured' | 'ai_unavailable', message: string) {
    super(message);
  }
}

async function openaiPost(url: string, payload: unknown, timeoutMs: number): Promise<unknown> {
  if (!aiConfigured()) throw new AiError('ai_not_configured', 'OPENAI_API_KEY / AI_GATEWAY_API_KEY ontbreekt');
  let lastErr = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) return body;
      lastErr = `${res.status} ${(body as { error?: { code?: string; type?: string } })?.error?.code ?? (body as { error?: { type?: string } })?.error?.type ?? ''}`.trim();
      // Alleen tijdelijke fouten opnieuw proberen.
      if (res.status !== 429 && res.status < 500) break;
    } catch (e) {
      lastErr = e instanceof Error ? e.name : 'fetch_failed';
    }
    await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
  }
  console.error('ai_failed', AI_PROVIDER, lastErr);
  throw new AiError('ai_unavailable', lastErr || 'unknown');
}

export async function createResponse(payload: Record<string, unknown>, timeoutMs = 45_000) {
  return openaiPost(RESPONSES_URL, { model: MODEL, store: false, ...payload }, timeoutMs);
}

export async function embed(text: string): Promise<number[]> {
  const out = (await openaiPost(
    EMBEDDINGS_URL,
    { model: EMBEDDING_MODEL, input: text.slice(0, 24_000), dimensions: 1536 },
    20_000,
  )) as { data?: { embedding?: number[] }[] };
  const v = out?.data?.[0]?.embedding;
  if (!Array.isArray(v) || v.length !== 1536) throw new AiError('ai_unavailable', 'embedding_shape');
  return v;
}

/** Embedding alleen vernieuwen als de notitie-inhoud is gewijzigd. */
export async function ensureEmbedding(userId: string, note: NoteRow): Promise<'fresh' | 'updated' | 'empty'> {
  const text = noteText(note.title, note.content);
  if (text.length < 3) return 'empty';
  const { data: existing } = await admin
    .from('dn_note_embeddings')
    .select('content_version')
    .eq('note_id', note.id)
    .eq('user_id', userId)
    .maybeSingle();
  if (existing && existing.content_version >= note.content_version) return 'fresh';
  const vector = await embed(text);
  const { error } = await admin.rpc('dn_upsert_embedding', {
    p_user: userId,
    p_note_id: note.id,
    p_version: note.content_version,
    p_embedding: JSON.stringify(vector),
  });
  if (error) throw new Error(`embedding: ${error.message}`);
  return 'updated';
}

export function handleError(e: unknown): Response {
  if (e instanceof AiError) {
    return e.code === 'ai_not_configured'
      ? fail('ai_not_configured', 'De AI is nog niet ingesteld op de server.', 503)
      : fail('ai_unavailable', 'De AI is even niet bereikbaar. Probeer het zo opnieuw.', 503);
  }
  console.error('server_error', e instanceof Error ? e.message : String(e));
  return fail('server_error', 'Er ging iets mis op de server.', 500);
}
