// ═══════════════════════════════════════════════════════════════════════
// The printed plan for a client not on the app (TECHNICAL §162). Pure: every date is passed in.
//
// One mesocycle of their coach's cycle: the one holding their next unfinished session. BLOC's week in every key is
// a mesocycle (1 or 2 calendar weeks, M1 and M2 its tracks), and targets step once a mesocycle, each from the
// mesocycle before it, so every target on the sheet is exact. The client writes what they did beside each set,
// ticks it, and circles how hard each exercise felt; the coach records it afterwards (In person, "on their own").
// Print the next mesocycle once this one is recorded: its targets come from these logs.
// ═══════════════════════════════════════════════════════════════════════
import type { BlocState, Loose, Macrocycle } from '@engine';
import { agendaOf, cycleForSession, defaultSession, sessionTargets, type ExerciseTarget } from '@/inperson/model';

export interface PrintSession { week: number; dayKey: string; label: string; done: boolean; exercises: ExerciseTarget[] }
export interface PrintWeek { start: string | null; end: string | null; deload: boolean; sessions: PrintSession[] }
export interface PrintPlan { macro: Macrocycle; mesocycle: number; mesocycles: number; weeks: PrintWeek[] }

/** The sheet for the mesocycle holding the client's next unfinished session (else the last), or null with no coach's cycle. */
export function printPlan(state: BlocState, today: string): PrintPlan | null {
  const macro = cycleForSession(state, today, today);
  if (!macro) return null;
  const units = agendaOf(state, macro, today);
  if (!units.length) return null;
  const next = defaultSession(state, macro, today, null);
  const meso = next?.week ?? units[units.length - 1].week;
  const weeks = units.filter((u) => u.week === meso).map((u): PrintWeek => ({
    start: u.start, end: u.end, deload: u.isDeload,
    sessions: u.sessions.map((s) => ({
      week: s.week, dayKey: s.dayKey, label: s.label, done: s.done,
      // Each session's own copy: sessionTargets sweeps the lock into the state's caches.
      exercises: sessionTargets(structuredClone(state) as BlocState, macro, s.week, s.dayKey),
    })),
  }));
  return { macro, mesocycle: meso, mesocycles: Math.max(...units.map((u) => u.week)), weeks };
}

/** "40 kg × 10" for a set's target; cardio and bodyweight read sensibly. */
export function targetText(t: ExerciseTarget, k: number): string {
  const ex = t.ex as Loose;
  if (ex.category === 'cardio') {
    const secs = Number(ex.targetSeconds) || 0;
    if (ex.metricType === 'distance' && ex.targetDistance) return `${ex.targetDistance} ${ex.distanceUnit || 'km'}`;
    return secs ? `${Math.round(secs / 60)} min` : 'As planned';
  }
  const kg = t.weights[k] ?? t.weights[0] ?? '';
  const reps = t.reps[k] ?? t.reps[0] ?? '';
  const n = parseFloat(kg);
  return `${n ? `${kg.replace(/\.0$/, '')} kg × ` : ''}${reps}${n ? '' : ' reps'}`;
}
