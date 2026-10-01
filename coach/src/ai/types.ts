// What Review's AI tools keep and send (TECHNICAL §141). Row shapes are
// super-duper-octo-barnacle's `0023` (publications, publication_acks,
// client_submissions) and `0024` (coach_ai_drafts), camel-cased.
import type { Loose } from '@engine';

/** The three tools, as `coach_ai_drafts.tool` and `ai_response.tool` spell them. */
export type AiTool = 'check_in' | 'cycle_review' | 'next_cycle';

/** One goal phase as the coach sends it: BLOC's goal fields (fats are derived). */
export interface PhaseEdit {
  /** The goal's `macroGoalID`, kept across republishes so BLOC replaces rather than duplicates it. */
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  kcal: number;
  protein: number;
  carbs: number;
  steps: number;
}

/** The coach's version: what the client sees. The original is never changed. */
export interface AiEdit {
  headline: string;
  narrative: string[];
  kcal: number | null;
  steps: number | null;
  /** Cycle review: the calculated score, out of 10. */
  compliance: number | null;
  /** Check-in: 'sustainable' | 'aggressive' | null (no goal change). Next cycle: one of the reply's plan keys. */
  planKey: string | null;
  /** Check-in: the chosen plan's phases, as edited. Empty for the other tools. */
  phases: PhaseEdit[];
  /** The publication that sent exactly this version. A later edit drops it, so the draft reads as unsent. */
  sentAs?: string;
}

/** The calculated compliance a cycle review is given, out of 10 (Review's own scores). */
export interface CalcCompliance {
  training: number | null;
  /** True when training is scored on attendance (maintenance). */
  attendance: boolean;
  nutrition: number | null;
  overall: number | null;
}

/** A response exactly as it came back, with what it was run on. `coach_ai_drafts.original`; never updated. */
export interface AiOriginal {
  v: 1;
  /** The model's reply text, verbatim. */
  raw: string;
  /** BLOC's engine's processing of that text: the same shape BLOC Solo stores for the tool. */
  response: Loose;
  /** The client's date the tool ran at. */
  today: string;
  compliance?: CalcCompliance | null;
  photos?: { before: number; after: number } | null;
  /** Drafts run before v0.16 may name the client's check-in request (`client_submissions.id`) they answered; clients no longer send one. */
  requestId?: string | null;
}

export interface AiDraft {
  id: string;
  cardId: string;
  tool: AiTool;
  macroId: string | null;
  original: AiOriginal;
  edited: AiEdit | null;
  editedAt: string | null;
  /** The latest publication that sent this response. */
  publicationId: string | null;
  createdAt: string;
}

export interface CoachPublication {
  id: string;
  seq: number;
  type: string;
  payload: Loose;
  supersedes: string | null;
  createdAt: string;
  /** The client's receipt (`publication_acks`), once BLOC has pulled it. */
  ack: { status: 'applied' | 'needs_attention' | 'superseded'; note: string | null } | null;
}

/** A `client_submissions` row: a check-in (read `body.purpose`) or a note back. */
export interface Submission {
  id: string;
  kind: 'check_in' | 'note_back';
  publicationId: string | null;
  body: Loose;
  createdAt: string;
}

export interface AiData {
  drafts: AiDraft[];
  /** This card's `ai_response`, `note_reply` and `photo_request` publications. */
  publications: CoachPublication[];
  submissions: Submission[];
}
