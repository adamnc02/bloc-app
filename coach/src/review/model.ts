// ═══════════════════════════════════════════════════════════════════════
// Review's model: everything the tab shows about one client's cycle, from
// the engine, at the client's local today (TECHNICAL §140).
//
// 🚨 `today` is always the client's (lib/clientState.ts → localDateIn with
//    their uploaded `tz`). Nothing in review/ reads a clock: a test pins the
//    date, and scripts/verify-coach-review-clock.mjs fails on one.
//
// Memoised per (upload hash, cycle, today): the engine's weekly insights and
// the grid walk a whole year of logs, and a screen re-renders often.
// ═══════════════════════════════════════════════════════════════════════
import {
  getDateActiveMacroId, getMacroDurationWeeks, getMacroEndDate, shiftDateStr,
  type BlocState, type GoalPeriod, type Macrocycle,
} from '@engine';
import { computeRpePoints, computeTraining, type RpePoint, type TrainingCompliance } from './training';
import { bmrAt, computeNutrition, nutritionDays, type NutritionCompliance, type NutritionDay } from './nutrition';
import { judgeOutcome, type Outcome } from './outcome';
import { buildFindings, type Finding } from './findings';

export type CycleStatus = 'past' | 'active' | 'upcoming';
export interface CycleOption {
  id: string;
  name: string;
  start: string;
  end: string;
  weeks: number;
  goalType: string;
  coachOwned: boolean;
  status: CycleStatus;
}

export interface StoryData {
  start: string;
  end: string;
  /** The last day with data to show: the client's today, or the cycle's end. */
  last: string;
  weighIns: { date: string; lbs: number }[];
  /** The engine's weekly averages, at each week's middle. */
  trend: { date: string; lbs: number }[];
  measurements: { date: string; waist: number | null; hip: number | null }[];
  kcalWeeks: { label: string; start: string; end: string; avgKcal: number | null; targetKcal: number | null }[];
  deloads: { start: string; end: string }[];
  phaseStarts: { date: string; label: string }[];
  /** The first goal phase's label (the phases before the first change). */
  firstPhase: string | null;
  startLbs: number | null;
  targetLbs: number | null;
  goalType: string;
}

export interface ReviewModel {
  today: string;
  cycle: CycleOption;
  /** The calendar week the client is in (1-based), or null outside the cycle. */
  weekNow: number | null;
  outcome: Outcome;
  training: TrainingCompliance;
  nutrition: NutritionCompliance;
  rpe: RpePoint[];
  findings: Finding[];
  story: StoryData;
  /** The last 28 days to the client's yesterday (or the cycle's end), for the nutrition chart. */
  days: NutritionDay[];
  bmr: number | null;
  hasNutrition: boolean;
}

const num = (v: unknown): number | null => {
  const x = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(x) && x > 0 ? x : null;
};
const nameOf = (m: Macrocycle) => String((m as Macrocycle & { name?: string }).name || 'Cycle');

/** Every dated cycle, oldest first, with where it stands at the client's today. */
export function cycleOptions(s: BlocState, today: string): CycleOption[] {
  return (s.macrocycles || [])
    .filter((m) => !!m.start)
    .map((m) => {
      const end = getMacroEndDate(m, { today });
      return {
        id: m.id, name: nameOf(m), start: m.start as string, end, weeks: getMacroDurationWeeks(m),
        goalType: String(m.goalType || 'loss'), coachOwned: !!m.publishedBy,
        status: (end < today ? 'past' : (m.start as string) > today ? 'upcoming' : 'active') as CycleStatus,
      };
    })
    .sort((a, b) => a.start.localeCompare(b.start));
}

/** The cycle Review opens on: the date-active one, else the latest that has started, else the next. */
export function defaultCycleId(s: BlocState, today: string): string | null {
  const active = getDateActiveMacroId(s, { today });
  if (active) return active;
  const opts = cycleOptions(s, today);
  const started = opts.filter((o) => o.start <= today);
  return (started[started.length - 1] ?? opts[0])?.id ?? null;
}

function storyData(s: BlocState, m: Macrocycle, cycle: CycleOption, today: string, o: Outcome, t: TrainingCompliance): StoryData {
  const last = cycle.end < today ? cycle.end : today;
  const logs = (s.bodyLogs || []).filter((l) => l.date >= cycle.start && l.date <= last).sort((a, b) => a.date.localeCompare(b.date));
  const goals = ((s.goals || []) as GoalPeriod[]).filter((g) => g.macroId === m.id).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const kcalTarget = (from: string, to: string) => {
    let sum = 0, k = 0;
    for (let d = from; d <= to; d = shiftDateStr(d, 1)) {
      const g = goals.find((x) => x.startDate <= d && x.endDate >= d);
      const v = num(g?.kcal);
      if (v != null) { sum += v; k++; }
    }
    return k ? sum / k : null;
  };
  return {
    start: cycle.start, end: cycle.end, last,
    weighIns: logs.filter((l) => num(l.weight) != null).map((l) => ({ date: l.date, lbs: num(l.weight)! })),
    trend: o.weeks.filter((w) => w.avg != null).map((w) => ({ date: [shiftDateStr(w.start, 3), last].sort()[0], lbs: w.avg as number })),
    measurements: logs.filter((l) => num(l.waist) != null || num(l.hip) != null).map((l) => ({ date: l.date, waist: num(l.waist), hip: num(l.hip) })),
    kcalWeeks: o.weeks.map((w) => ({ label: w.label, start: w.start, end: w.end, avgKcal: w.avgKcal, targetKcal: kcalTarget(w.start, [w.end, last].sort()[0]) })),
    deloads: t.cols.filter((c) => c.isDeload).map((c) => ({ start: c.start, end: c.end })),
    phaseStarts: goals.slice(1).map((g, i) => ({ date: g.startDate, label: String(g._blocLabel || `Phase ${i + 2}`) })),
    firstPhase: goals[0] ? String(goals[0]._blocLabel || 'Phase 1') : null,
    startLbs: o.weeks.find((w) => w.avg != null)?.avg ?? null,
    targetLbs: num((m as Macrocycle & { targetBw?: unknown }).targetBw),
    goalType: cycle.goalType,
  };
}

export function computeReview(s: BlocState, macroId: string, today: string, firstName: string): ReviewModel | null {
  const m = (s.macrocycles || []).find((x) => x.id === macroId);
  const cycle = cycleOptions(s, today).find((c) => c.id === macroId);
  if (!m || !cycle) return null;
  const training = computeTraining(s, m, today);
  const nutrition = computeNutrition(s, m, today);
  const outcome = judgeOutcome(s, m, today, { training, nutrition });
  const rpe = computeRpePoints(training);
  const missed = training.cols.filter((c) => c.closed).reduce((a, c) => a + c.sessions.filter((x) => !x.done).length, 0);
  const findings = buildFindings(firstName, outcome, training.rows, rpe, missed);
  const yesterday = shiftDateStr(today, -1);
  const to = cycle.end < yesterday ? cycle.end : yesterday;
  const from = [cycle.start, shiftDateStr(to, -27)].sort()[1];
  const days = to >= from ? nutritionDays(s, from, to, true) : [];
  const cur = training.cols.find((c) => c.current);
  return {
    today, cycle, weekNow: cur ? cur.idx + 1 : null,
    outcome, training, nutrition, rpe, findings,
    story: storyData(s, m, cycle, today, outcome, training),
    days, bmr: bmrAt(s, today),
    hasNutrition: days.some((d) => d.logged) || nutrition.weeks.some((w) => w.countedDays > 0),
  };
}

// ---------------------------------------------------------------- memo

const memo = new Map<string, ReviewModel | null>();
const MEMO_MAX = 24;

/** computeReview, memoised per (client, upload hash, cycle, client's today, name). */
export function reviewFor(clientKey: string, hash: string, s: BlocState, macroId: string, today: string, firstName: string): ReviewModel | null {
  const key = `${clientKey}|${hash}|${macroId}|${today}|${firstName}`;
  if (memo.has(key)) return memo.get(key)!;
  const r = computeReview(s, macroId, today, firstName);
  memo.set(key, r);
  if (memo.size > MEMO_MAX) memo.delete(memo.keys().next().value as string);
  return r;
}
