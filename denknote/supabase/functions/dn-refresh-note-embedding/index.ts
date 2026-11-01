// dn-refresh-note-embedding: vernieuwt de vectorrepresentatie als de inhoud is gewijzigd.
// Alleen wanneer de gebruiker verbanden met andere notities heeft toegestaan.
import { isUuid } from '../_shared/logic.ts';
import {
  aiConfigured,
  allowRelated,
  authenticate,
  CORS,
  ensureEmbedding,
  fail,
  handleError,
  json,
  loadNote,
  readJson,
  takeRate,
} from '../_shared/server.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method === 'GET') return json({ ok: true, service: 'dn-refresh-note-embedding', ai_configured: aiConfigured() });
  if (req.method !== 'POST') return fail('bad_request', 'Alleen POST.', 405);

  try {
    const user = await authenticate(req);
    if (!user) return fail('unauthorized', 'Log opnieuw in.', 401);
    const body = await readJson(req);
    const noteId = body?.note_id;
    if (!isUuid(noteId)) return fail('bad_request', 'Ongeldig verzoek.', 400);

    if (!(await allowRelated(user.id))) return json({ status: 'disabled' });
    const note = await loadNote(user.id, noteId);
    if (!note) return fail('not_found', 'Notitie niet gevonden.', 404);

    const allowed = await takeRate(user.id, 'embed', [
      { limit: 120, seconds: 3600 },
      { limit: 600, seconds: 86400 },
    ]);
    if (!allowed) return fail('rate_limited', 'Te veel verzoeken. Probeer het later opnieuw.', 429);

    const status = await ensureEmbedding(user.id, note);
    return json({ status, content_version: note.content_version });
  } catch (e) {
    return handleError(e);
  }
});
