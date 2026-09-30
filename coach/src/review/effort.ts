// ═══════════════════════════════════════════════════════════════════════
// Rated too hard two weeks running (TECHNICAL §163). Pure: no clock.
//
// A coach's cycle follows BLOC's RPE rule on its own (BLOC §161): a 9 or 10 holds next week's target. The coach
// steps in only when that isn't enough: the same exercise on the same track (a session's dayKey, so M1 and M2
// apart) rated 9 or 10 in two consecutive weeks of that track, deloads skipped, whether or not the target was hit.
// Needs you raises it, and its button opens the exercise in Plan to reset it (new numbers from the next unlogged
// week, `fromWeek`).
//
// It clears by itself: a later rating of 8 or lower, a week not rated (skipped) or a reset (ratings before the
// reset's week don't count) each end the streak, because only the latest two rated weeks are looked at.
// Ratings the coach gives in person count the same as the client's.
// ═══════════════════════════════════════════════════════════════════════
import { getMacroEffectiveMesoCount, getRpeKey, isDeloadUnit, isRpeOn, progressionStartWeek, type BlocState, type Loose, type Macrocycle } from '@engine';

export interface HighStreak { macroId: string; dayKey: string; exId: string; name: string; weeks: [number, number]; ratings: [number, number] }

/** 9 and 10 are "too hard" (BLOC §104's hold). */
export const TOO_HARD = 9;

export function highRatingStreaks(s: BlocState, macro: Macrocycle): HighStreak[] {
  if (!isRpeOn(macro)) return [];
  const out: HighStreak[] = [];
  const total = getMacroEffectiveMesoCount(macro);
  const exercises = (s.exercises || {}) as Record<string, Loose[]>;
  const rpe = (s.rpe || {}) as Record<string, Loose>;
  for (const [key, list] of Object.entries(exercises)) {
    if (!key.startsWith(`${macro.id}_1_`)) continue;
    const dayKey = key.slice(macro.id.length + 3);
    for (const ex of list || []) {
      if (!ex || ex.category === 'cardio') continue;
      const start = progressionStartWeek(ex);
      // The track's weeks from the exercise's progression start, deloads skipped, with what was rated.
      const weeks: { w: number; r: Loose | undefined }[] = [];
      for (let w = start; w <= total; w++) {
        if (isDeloadUnit(s, macro, w, dayKey)) continue;
        weeks.push({ w, r: rpe[getRpeKey(macro.id, w, dayKey, ex.id)] });
      }
      const rated = weeks.map((x, i) => ({ ...x, i })).filter((x) => x.r && (typeof x.r.rpe === 'number' || x.r.rpeSkipped));
      const last = rated[rated.length - 1];
      const prev = rated[rated.length - 2];
      if (!last || !prev || last.i !== prev.i + 1) continue;
      const a = prev.r!.rpe, b = last.r!.rpe;
      if (typeof a === 'number' && typeof b === 'number' && a >= TOO_HARD && b >= TOO_HARD) {
        out.push({ macroId: macro.id, dayKey, exId: String(ex.id), name: String(ex.name ?? 'Exercise'), weeks: [prev.w, last.w], ratings: [a, b] });
      }
    }
  }
  return out;
}
