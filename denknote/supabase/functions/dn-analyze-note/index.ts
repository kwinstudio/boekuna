// dn-analyze-note: maakt (maximaal) één suggestieset voor een notitie.
// trigger 'done'   = gebruiker drukt op Gereed (alleen in meedenkende modus, alleen bij betekenisvolle wijziging)
// trigger 'manual' = gebruiker drukt op Denk mee (beide modi)
import {
  buildAnalyzeInput,
  extractOutputText,
  isEmptySuggestion,
  isMeaningfulChange,
  isUuid,
  noteText,
  parseJsonSafe,
  SUGGESTION_SCHEMA,
  validateSuggestion,
  type RelatedContext,
} from '../_shared/logic.ts';
import {
  admin,
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

const SUGGESTION_COLUMNS =
  'id,note_id,content_version,question,proposed_action,related_note_ids,dismissed,question_dismissed,action_dismissed,created_at';

async function latestSuggestion(userId: string, noteId: string) {
  const { data } = await admin
    .from('dn_ai_suggestions')
    .select(SUGGESTION_COLUMNS)
    .eq('note_id', noteId)
    .eq('user_id', userId)
    .order('content_version', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method === 'GET') return json({ ok: true, service: 'dn-analyze-note', ai_configured: aiConfigured(), model: MODEL });
  if (req.method !== 'POST') return fail('bad_request', 'Alleen POST.', 405);

  try {
    const user = await authenticate(req);
    if (!user) return fail('unauthorized', 'Log opnieuw in.', 401);

    const body = await readJson(req);
    const noteId = body?.note_id;
    const trigger = body?.trigger;
    if (!isUuid(noteId) || (trigger !== 'done' && trigger !== 'manual')) {
      return fail('bad_request', 'Ongeldig verzoek.', 400);
    }

    const note = await loadNote(user.id, noteId);
    if (!note) return fail('not_found', 'Notitie niet gevonden.', 404);
    const text = noteText(note.title, note.content);

    if (trigger === 'done') {
      // Stille modus: nooit automatisch.
      if (note.ai_mode !== 'thinking') return json({ status: 'skipped_silent' });
      if (note.last_analyzed_version >= note.content_version) {
        return json({ status: 'unchanged', suggestion: await latestSuggestion(user.id, note.id) });
      }
      if (!isMeaningfulChange(note.last_analyzed_content, text)) {
        return json({ status: 'minor_change', suggestion: await latestSuggestion(user.id, note.id) });
      }
    } else if (text.trim().length < 3) {
      return json({ status: 'too_short' });
    }

    const allowed = await takeRate(user.id, 'analyze', [
      { limit: 20, seconds: 3600 },
      { limit: 120, seconds: 86400 },
    ]);
    if (!allowed) return fail('rate_limited', 'Je hebt even genoeg AI-verzoeken gedaan. Probeer het later opnieuw.', 429);

    // Verbanden alleen met toestemming; zoeken gebeurt met de JWT van de gebruiker (auth.uid()).
    let related: RelatedContext[] = [];
    if (await allowRelated(user.id)) {
      try {
        await ensureEmbedding(user.id, note);
        const { data } = await user.userClient.rpc('dn_match_notes', {
          p_note_id: note.id,
          p_count: 5,
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

    const { data: prev } = await admin
      .from('dn_ai_suggestions')
      .select('question')
      .eq('note_id', note.id)
      .eq('user_id', user.id)
      .not('question', 'is', null)
      .order('created_at', { ascending: false })
      .limit(8);
    const previousQuestions = (prev ?? []).map((p) => p.question as string);

    const response = await createResponse({
      input: buildAnalyzeInput({ title: note.title, content: note.content, previousQuestions, related }),
      reasoning: { effort: 'low' },
      text: { format: { type: 'json_schema', name: 'denknote_suggestion', schema: SUGGESTION_SCHEMA, strict: true } },
      max_output_tokens: 1200,
    });

    const suggestion = validateSuggestion(
      parseJsonSafe(extractOutputText(response)),
      related.map((r) => r.id),
      previousQuestions,
    );
    if (!suggestion) return fail('ai_invalid_output', 'De AI gaf geen bruikbaar antwoord. Probeer het opnieuw.', 502);

    if (isEmptySuggestion(suggestion)) {
      await admin.rpc('dn_mark_analyzed', {
        p_user: user.id,
        p_note_id: note.id,
        p_version: note.content_version,
        p_analyzed_content: text,
      });
      return json({ status: 'nothing_to_add', suggestion: null });
    }

    const { data: storedId, error } = await admin.rpc('dn_store_suggestion', {
      p_user: user.id,
      p_note_id: note.id,
      p_version: note.content_version,
      p_question: suggestion.question,
      p_action: suggestion.proposed_action,
      p_related: suggestion.related_note_ids,
      p_analyzed_content: text,
      p_allow_same_version: trigger === 'manual',
    });
    if (error) throw new Error(`store: ${error.message}`);
    if (!storedId) {
      // Er is intussen een resultaat voor een nieuwere versie: niet overschrijven.
      return json({ status: 'stale', suggestion: await latestSuggestion(user.id, note.id) });
    }
    const { data: row } = await admin.from('dn_ai_suggestions').select(SUGGESTION_COLUMNS).eq('id', storedId).single();
    return json({ status: 'ok', suggestion: row });
  } catch (e) {
    return handleError(e);
  }
});
