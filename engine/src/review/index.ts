// ═══════════════════════════════════════════════════════════════════════
// Review's judgement of a client (TECHNICAL §140, §156): training and
// nutrition compliance, and the outcome, "is this cycle's goal on track?".
//
// Two consumers, one copy:
//   · BLOC Coach imports it as source (`@engine/review`): Review, Today's
//     Off track list and Clients' outcome chip;
//   · the `bloc-push` Edge Function (super-duper-octo-barnacle) runs it from
//     dist/bloc-engine-server.mjs for the coach's daily digest of clients
//     newly off track.
//
// 🚨 Not part of dist/bloc-engine.js. BLOC never judges itself this way, so
//    its bundle doesn't carry this code. The same purity rules as ../index.ts
//    apply: "today" and the instant come in as arguments, never the clock.
// ═══════════════════════════════════════════════════════════════════════
import { getDateActiveMacroId, type BlocState } from '../index.ts';
import { computeTraining } from './training.ts';
import { computeNutrition } from './nutrition.ts';
import { judgeOutcome, type OutcomeStatus } from './outcome.ts';

export * from './training.ts';
export * from './nutrition.ts';
export * from './outcome.ts';

/**
 * A zone's calendar date at an instant, 'YYYY-MM-DD'. An unknown zone falls back to UTC.
 * 🚨 A client is judged at THEIR local date (client_state's `tz`), never the coach's.
 */
export function localDateIn(tz: string | null | undefined, atMs: number): string {
  const fmt = (zone: string) => {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(atMs));
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  };
  try { return fmt(tz || 'UTC'); } catch { return fmt('UTC'); }
}

export interface ClientOutcome {
  status: OutcomeStatus;
  /** Short, for a list row or a notification line. */
  reason: string;
  /** The date-active cycle judged, or null when none is running. */
  macroId: string | null;
}

/**
 * The outcome Coach shows for a linked client: the date-active cycle, judged
 * at the client's today. It's what Today's Off track list, the Clients chip
 * and the daily digest all read; coach/src/review/outcome-parity.test.ts
 * holds it equal to Review's own model.
 */
export function clientOutcome(s: BlocState, clientToday: string, noCycleReason = 'No cycle running'): ClientOutcome {
  const id = getDateActiveMacroId(s, { today: clientToday });
  const m = (s.macrocycles || []).find((x) => x.id === id);
  if (!m || !m.start) return { status: 'no-data', reason: noCycleReason, macroId: null };
  const training = computeTraining(s, m, clientToday);
  const nutrition = computeNutrition(s, m, clientToday);
  const o = judgeOutcome(s, m, clientToday, { training, nutrition });
  return { status: o.status, reason: o.reason, macroId: m.id };
}
