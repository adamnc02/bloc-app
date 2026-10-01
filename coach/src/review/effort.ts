// ═══════════════════════════════════════════════════════════════════════
// An exercise that needs the coach (TECHNICAL §163). Pure: no clock.
//
// A coach's cycle runs BLOC's rules by itself (BLOC §161): a 9 or 10 holds next week's target, and a missed target
// locks it. The coach steps in when that has gone on for two weeks, on the same exercise and track (a session's
// dayKey, so M1 and M2 apart), deloads skipped:
//   too_hard  rated 9 or 10 two weeks running, whether or not the target was hit (needs ratings on);
//   missed    the target missed two weeks running (every set logged, and short of the target).
// Needs you raises it with Reset it (new numbers from the next unlogged week, `fromWeek`) and Leave (BLOC's hold
// stands; a row in `coach_flag_dismissals`, 0034).
//
// Only the latest two weeks are looked at, so it clears by itself: a later rating of 8 or lower, a skipped rating,
// a target hit, or a reset (weeks before the exercise's progression start don't count). A Leave covers that run
// only (its last week, `throughWeek`): a third week the same way is a new run, and raises it again.
// Ratings the coach gives in person, or records from a client's sheet, count the same as the client's.
// ═══════════════════════════════════════════════════════════════════════
import {
  getMacroEffectiveMesoCount, getRpeKey, getWeekComplianceResult, isDeloadUnit, isRpeOn, isSubstitutedUnit, progressionStartWeek,
  type BlocState, type Loose, type Macrocycle, type TargetCache,
} from '@engine';

export type FlagKind = 'too_hard' | 'missed';
export interface HighStreak {
  kind: FlagKind;
  macroId: string;
  dayKey: string;
  exId: string;
  name: string;
  weeks: [number, number];
  /** The two ratings (too_hard only). */
  ratings: [number, number] | null;
}
/** A Leave (0034): this run of this exercise, up to `throughWeek`. */
export interface FlagLeave { cardId: string; macroId: string; dayKey: string; exId: string; kind: FlagKind; throughWeek: number }

/** 9 and 10 are "too hard" (BLOC §104's hold). */
export const TOO_HARD = 9;

/** A target cache over a COPY's progressionTargets: judging a week fills it, and the caller's state stays as it was. */
function scratchCache(s: BlocState): TargetCache {
  const t: Record<string, Loose> = { ...(((s as Loose).progressionTargets as Record<string, Loose>) || {}) };
  return { get: (k) => t[k], set: (k, v) => { t[k] = v; } };
}

export function highRatingStreaks(s: BlocState, macro: Macrocycle): HighStreak[] {
  const out: HighStreak[] = [];
  const total = getMacroEffectiveMesoCount(macro);
  const exercises = (s.exercises || {}) as Record<string, Loose[]>;
  const rpe = (s.rpe || {}) as Record<string, Loose>;
  const ratingsOn = isRpeOn(macro);
  const cache = scratchCache(s);
  for (const [key, list] of Object.entries(exercises)) {
    if (!key.startsWith(`${macro.id}_1_`)) continue;
    const dayKey = key.slice(macro.id.length + 3);
    for (const ex of list || []) {
      if (!ex || ex.category === 'cardio') continue;
      const start = progressionStartWeek(ex);
      // The track's weeks from the exercise's progression start: deloads and swapped weeks skipped (nothing to judge).
      const weeks: number[] = [];
      for (let w = start; w <= total; w++) {
        if (isDeloadUnit(s, macro, w, dayKey) || isSubstitutedUnit(s, macro, w, dayKey, ex.id)) continue;
        weeks.push(w);
      }
      const base = { macroId: macro.id, dayKey, exId: String(ex.id), name: String(ex.name ?? 'Exercise') };
      // Rated too hard: the latest two weeks with any answer (a number or a skip), adjacent on the track, both 9+.
      if (ratingsOn) {
        const rated = weeks.map((w, i) => ({ w, i, r: rpe[getRpeKey(macro.id, w, dayKey, ex.id)] }))
          .filter((x) => x.r && (typeof x.r.rpe === 'number' || x.r.rpeSkipped));
        const b = rated[rated.length - 1], a = rated[rated.length - 2];
        if (a && b && b.i === a.i + 1 && typeof a.r.rpe === 'number' && typeof b.r.rpe === 'number' && a.r.rpe >= TOO_HARD && b.r.rpe >= TOO_HARD) {
          out.push({ ...base, kind: 'too_hard', weeks: [a.w, b.w], ratings: [a.r.rpe, b.r.rpe] });
        }
      }
      // Missed: the latest two weeks fully logged (the start week isn't judged, as BLOC's lock), adjacent, both short.
      const judged = weeks.map((w, i) => ({ w, i })).filter((x) => x.w > start)
        .map((x) => ({ ...x, c: getWeekComplianceResult(s, cache, macro, x.w, dayKey, ex) })).filter((x) => x.c.fullyLogged);
      const d = judged[judged.length - 1], c = judged[judged.length - 2];
      if (c && d && d.i === c.i + 1 && !c.c.compliant && !d.c.compliant) out.push({ ...base, kind: 'missed', weeks: [c.w, d.w], ratings: null });
    }
  }
  return out;
}

/** Whether a flag was left (0034): this exercise, this kind, this run. */
export const isLeft = (leaves: FlagLeave[], cardId: string, x: HighStreak) => leaves.some((l) => l.cardId === cardId && l.macroId === x.macroId
  && l.dayKey === x.dayKey && l.exId === x.exId && l.kind === x.kind && l.throughWeek === x.weeks[1]);
