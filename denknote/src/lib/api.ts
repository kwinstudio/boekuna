// Aanroepen naar de beveiligde Edge Functions en de kleinere tabellen (suggesties, berichten, taken).
import { FunctionsHttpError } from '@supabase/supabase-js';
import type { ChatPreset } from '../../supabase/functions/_shared/logic';
import { supabase } from './supabase';
import type { ChatMessage, Suggestion, Task } from './types';

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const FRIENDLY: Record<string, string> = {
  rate_limited: 'Je hebt even genoeg AI-verzoeken gedaan. Probeer het over een tijdje opnieuw.',
  ai_not_configured: 'De AI is nog niet ingesteld op de server.',
  ai_unavailable: 'De AI is even niet bereikbaar. Probeer het zo opnieuw.',
  ai_invalid_output: 'De AI gaf geen bruikbaar antwoord. Probeer het opnieuw.',
  unauthorized: 'Je sessie is verlopen. Log opnieuw in.',
  not_found: 'Deze notitie staat nog niet op de server. Wacht even tot hij is opgeslagen.',
  network: 'Geen verbinding. Je notitie is lokaal bewaard; de AI werkt weer zodra je online bent.',
};

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (!error) return data as T;
  if (error instanceof FunctionsHttpError) {
    let code = 'server_error';
    let message = 'Er ging iets mis. Probeer het opnieuw.';
    try {
      const j = await (error.context as Response).json();
      code = j?.error?.code ?? code;
      message = FRIENDLY[code] ?? j?.error?.message ?? message;
    } catch {}
    throw new ApiError(code, message);
  }
  throw new ApiError('network', FRIENDLY.network);
}

export type AnalyzeStatus =
  | 'ok'
  | 'unchanged'
  | 'minor_change'
  | 'skipped_silent'
  | 'too_short'
  | 'nothing_to_add'
  | 'stale';

export function analyzeNote(noteId: string, trigger: 'done' | 'manual') {
  return invoke<{ status: AnalyzeStatus; suggestion?: Suggestion | null }>('dn-analyze-note', {
    note_id: noteId,
    trigger,
  });
}

export function sendChat(noteId: string, message: string, preset?: ChatPreset) {
  return invoke<{ status: 'ok'; messages: ChatMessage[] }>('dn-chat-note', {
    note_id: noteId,
    message,
    preset: preset ?? null,
  });
}

export async function latestSuggestion(noteId: string): Promise<Suggestion | null> {
  const { data, error } = await supabase
    .from('dn_ai_suggestions')
    .select('*')
    .eq('note_id', noteId)
    .order('content_version', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new ApiError('network', FRIENDLY.network);
  return (data as Suggestion | null) ?? null;
}

export async function dismissSuggestionPart(s: Suggestion, part: 'question' | 'action' | 'all'): Promise<Suggestion> {
  const patch =
    part === 'all'
      ? { dismissed: true }
      : part === 'question'
        ? { question_dismissed: true, dismissed: s.action_dismissed || !s.proposed_action }
        : { action_dismissed: true, dismissed: s.question_dismissed || !s.question };
  const next = { ...s, ...patch };
  const { error } = await supabase.from('dn_ai_suggestions').update(patch).eq('id', s.id);
  if (error) throw new ApiError('network', 'Wegklikken lukte niet. Probeer het opnieuw.');
  return next;
}

export async function loadMessages(noteId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('dn_ai_messages')
    .select('id,note_id,role,content,created_at')
    .eq('note_id', noteId)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) throw new ApiError('network', FRIENDLY.network);
  return (data ?? []) as ChatMessage[];
}

// ── Taken ───────────────────────────────────────────────────────────────────
const TASK_COLUMNS = 'id,note_id,suggestion_id,title,completed,completed_at,created_at';

export async function loadTasks(): Promise<Task[]> {
  const { data, error } = await supabase.from('dn_tasks').select(TASK_COLUMNS).order('created_at', { ascending: false }).limit(500);
  if (error) throw new ApiError('network', FRIENDLY.network);
  return (data ?? []) as Task[];
}

export async function createTask(input: { title: string; note_id?: string | null; suggestion_id?: string | null }): Promise<Task> {
  const title = input.title.trim().slice(0, 300);
  if (!title) throw new ApiError('bad_request', 'Geef de actie een omschrijving.');
  const { data, error } = await supabase
    .from('dn_tasks')
    .insert({ title, note_id: input.note_id ?? null, suggestion_id: input.suggestion_id ?? null })
    .select(TASK_COLUMNS)
    .single();
  if (error) throw new ApiError('network', 'Opslaan van de actie lukte niet. Controleer je verbinding.');
  return data as Task;
}

export async function setTaskCompleted(id: string, completed: boolean): Promise<Task> {
  const { data, error } = await supabase.from('dn_tasks').update({ completed }).eq('id', id).select(TASK_COLUMNS).single();
  if (error) throw new ApiError('network', 'Bijwerken lukte niet. Controleer je verbinding.');
  return data as Task;
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from('dn_tasks').delete().eq('id', id);
  if (error) throw new ApiError('network', 'Verwijderen lukte niet. Controleer je verbinding.');
}
