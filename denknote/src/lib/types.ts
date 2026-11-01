import type { AiMode } from '../../supabase/functions/_shared/logic';
export type { AiMode };

export type ServerNote = {
  id: string;
  title: string;
  content: string;
  ai_mode: AiMode;
  content_version: number;
  last_analyzed_version: number;
  last_analyzed_content: string | null;
  created_at: string;
  updated_at: string;
};

/** Notitie zoals lokaal bewaard: altijd eerst lokaal, daarna naar de server. */
export type LocalNote = ServerNote & {
  /** Lokale wijzigingen die nog niet op de server staan. */
  dirty: boolean;
  /** Bestaat (voor zover bekend) op de server. */
  synced: boolean;
  /** Teller die oploopt bij elke lokale bewerking (om races met de sync te herkennen). */
  localRev: number;
  /** Tijdstip van de laatste lokale bewerking (ms). */
  localEditedAt: number;
};

export type Suggestion = {
  id: string;
  note_id: string;
  content_version: number;
  question: string | null;
  proposed_action: string | null;
  related_note_ids: string[];
  dismissed: boolean;
  question_dismissed: boolean;
  action_dismissed: boolean;
  created_at: string;
};

export type ChatMessage = {
  id: string;
  note_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
};

export type Task = {
  id: string;
  note_id: string | null;
  suggestion_id: string | null;
  title: string;
  completed: boolean;
  completed_at: string | null;
  created_at: string;
};

export type Profile = {
  default_ai_mode: AiMode;
  allow_related: boolean;
};

export type ThemePref = 'system' | 'light' | 'dark';
