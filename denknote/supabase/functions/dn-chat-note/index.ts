// dn-chat-note: één beurt in het AI-gesprek bij een notitie. Gesprek wordt opgeslagen.
import {
  buildChatInput,
  CHAT_PRESETS,
  extractOutputText,
  isChatPreset,
  isUuid,
  LIMITS,
  type RelatedContext,
} from '../_shared/logic.ts';
import {
  admin,
  AI_PROVIDER,
  aiConfigured,
  allowRelated,
  authenticate,
  CORS,
  createResponse,
  ensureEmbedding,
  fail,
  handleError,
  json,
  loadNote,
  MODEL,
  readJson,
  takeRate,
} from '../_shared/server.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method === 'GET') return json({ ok: true, service: 'dn-chat-note', ai_configured: aiConfigured(), provider: AI_PROVIDER, model: MODEL });
  if (req.method !== 'POST') return fail('bad_request', 'Alleen POST.', 405);

  try {
    const user = await authenticate(req);
    if (!user) return fail('unauthorized', 'Log opnieuw in.', 401);

    const body = await readJson(req);
    const noteId = body?.note_id;
    const preset = body?.preset;
    const rawMessage = typeof body?.message === 'string' ? body.message.trim() : '';
    if (!isUuid(noteId) || (preset !== undefined && preset !== null && !isChatPreset(preset))) {
      return fail('bad_request', 'Ongeldig verzoek.', 400);
    }
    const visibleMessage = rawMessage || (isChatPreset(preset) ? CHAT_PRESETS[preset].label : '');
    if (!visibleMessage || visibleMessage.length > LIMITS.chatMessageMax) {
      return fail('bad_request', 'Bericht is leeg of te lang.', 400);
    }
    // Wat de AI krijgt: bij een snelknop de uitgebreide instructie.
    const aiMessage = !rawMessage && isChatPreset(preset) ? CHAT_PRESETS[preset].instruction : visibleMessage;

    const note = await loadNote(user.id, noteId);
    if (!note) return fail('not_found', 'Notitie niet gevonden.', 404);

    const allowed = await takeRate(user.id, 'chat', [
      { limit: 40, seconds: 3600 },
      { limit: 250, seconds: 86400 },
    ]);
    if (!allowed) return fail('rate_limited', 'Je hebt even genoeg berichten gestuurd. Probeer het later opnieuw.', 429);

    const { data: historyDesc } = await admin
      .from('dn_ai_messages')
      .select('role,content')
      .eq('note_id', note.id)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);
    const history = ((historyDesc ?? []) as { role: 'user' | 'assistant'; content: string }[]).reverse();

    const relatedAllowed = await allowRelated(user.id);
    let related: RelatedContext[] = [];
    if (relatedAllowed) {
      try {
        await ensureEmbedding(user.id, note);
        const { data } = await user.userClient.rpc('dn_match_notes', {
          p_note_id: note.id,
          p_count: 3,
          p_min_similarity: 0.35,
        });
        related = ((data ?? []) as { note_id: string; title: string; snippet: string }[]).map((r) => ({
          id: r.note_id,
          title: r.title,
          snippet: r.snippet,
        }));
      } catch (e) {
        console.warn('related_failed', e instanceof Error ? e.message : String(e));
      }
    }

    const response = await createResponse({
      input: buildChatInput({
        title: note.title,
        content: note.content,
        related,
        history,
        message: aiMessage,
        relatedAllowed,
      }),
      reasoning: { effort: 'low' },
      max_output_tokens: 1500,
    });
    const answer = extractOutputText(response)?.slice(0, 12000);
    if (!answer) return fail('ai_invalid_output', 'De AI gaf geen antwoord. Probeer het opnieuw.', 502);

    // Pas opslaan als het antwoord er is, zodat een mislukte beurt geen half gesprek achterlaat.
    const now = Date.now();
    const { data: rows, error } = await admin
      .from('dn_ai_messages')
      .insert([
        { user_id: user.id, note_id: note.id, role: 'user', content: visibleMessage, created_at: new Date(now).toISOString() },
        { user_id: user.id, note_id: note.id, role: 'assistant', content: answer, created_at: new Date(now + 1).toISOString() },
      ])
      .select('id,note_id,role,content,created_at');
    if (error) throw new Error(`messages: ${error.message}`);
    return json({ status: 'ok', messages: rows });
  } catch (e) {
    return handleError(e);
  }
});
