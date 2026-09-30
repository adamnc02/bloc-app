// ═══════════════════════════════════════════════════════════════════════
// Nutrition compliance and the nutrition chart's days (TECHNICAL §140).
//
// A week is BLOC's Home week (Mon–Sun), judged by the engine's own
// computeHomeWeek(): the four This-week verdicts the client sees on Home
// (calories, protein, carbs, steps), with `weekClosed` for a finished week.
// Coach adds only which side of target is good for the cycle's goal:
//   · calories: on a loss cycle, under target is good; on a gain cycle, over
//     is; on maintenance, only on target is;
//   · protein and steps: under is bad (Home's own polarity), carbs: over is bad.
// A week counts with at least 4 complete days (no more than 300 kcal short,
// isCompleteNutritionDay). 🚨 On a GAIN cycle every logged day counts, and a
// short day pulls the calorie verdict down rather than being left out: eating
// too little is how a gain cycle fails.
// Scored out of 10: the share of verdicts that are good. Finished weeks only.
// ═══════════════════════════════════════════════════════════════════════
import {
  buildDayMap, calcDynamicTDEE, calcMifflinBMR, computeHomeWeek, getGoalForDay, getHomeMetricTolerance, getHomeWeekStart,
  getMacroEndDate, getWeekDates, isCompleteNutritionDay, shiftDateStr,
  type BlocState, type DayMap, type Macrocycle,
} from '../index.ts';

export type Field = 'kcal' | 'protein' | 'carbs' | 'steps';
export const MIN_COUNTED_DAYS = 4;

export interface MetricVerdict {
  field: Field;
  avg: number | null;
  target: number | null;
  /** Home's label: Falling behind / On track / Exceeding / No data. */
  label: string;
  good: boolean | null;
}

export interface NutritionWeek {
  start: string;
  end: string;
  closed: boolean;
  countedDays: number;
  metrics: MetricVerdict[];
  /** Out of 10; null when the week isn't over or has too few counted days. */
  score: number | null;
  reason: string | null;
}

export interface NutritionCompliance {
  weeks: NutritionWeek[];
  cycleScore: number | null;
}

export interface NutritionDay {
  date: string;
  logged: boolean;
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fats: number | null;
  steps: number | null;
  weight: number | null;
  waist: number | null;
  target: { kcal: number | null; protein: number | null; carbs: number | null; fats: number | null; steps: number | null };
  /** The engine's logged TDEE as of this day, if it has enough data. */
  tdee: number | null;
}

const n = (v: unknown): number | null => {
  const x = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(x) ? x : null;
};

/** Which side of target is good, by metric and the cycle's goal. */
export function isGoodLabel(field: Field, label: string, goalType: string): boolean | null {
  if (label === 'No data') return null;
  if (label === 'On track') return true;
  if (field === 'kcal') {
    if (goalType === 'gain') return label === 'Exceeding';
    if (goalType === 'maintenance') return false;
    return label === 'Falling behind'; // loss (and a cycle with no goal type, which BLOC reads as loss)
  }
  // protein / steps (under is bad, over already reads "On track") and carbs (over is bad)
  return field === 'carbs' ? label === 'Falling behind' : false;
}

/** A finished week's verdict on an average, as the engine's closed-week badge reads it. */
function closedLabel(avg: number, target: number, field: Field): string {
  const tol = getHomeMetricTolerance(field);
  if (avg < target - tol) return 'Falling behind';
  if (avg > target + tol) return 'Exceeding';
  return 'On track';
}

export function computeNutrition(s: BlocState, m: Macrocycle, today: string): NutritionCompliance {
  if (!m.start) return { weeks: [], cycleScore: null };
  const dayMap = buildDayMap(s) as DayMap;
  const goalType = String(m.goalType || 'loss');
  const last = [getMacroEndDate(m, { today }), today].sort()[0];
  const weeks: NutritionWeek[] = [];
  for (let ws = getHomeWeekStart(m.start); ws <= last; ws = shiftDateStr(ws, 7)) {
    const sunday = getWeekDates(ws)[6];
    const closed = sunday < today;
    const hw = computeHomeWeek(s, { today: closed ? sunday : today }, { weekClosed: closed });
    const through = closed ? sunday : today;
    const days = getWeekDates(ws).filter((d) => d <= through && d >= (m.start as string));
    const counted = days.filter((d) => {
      const day = dayMap[d];
      if (!day || !day.hasNutr) return false;
      return goalType === 'gain' ? true : isCompleteNutritionDay(day, n(getGoalForDay(s, d)?.kcal));
    });
    const metrics: MetricVerdict[] = hw.metrics.map((x) => {
      let label = x.badge.label;
      let avg = x.avg;
      if (goalType === 'gain' && x.field === 'kcal' && closed && x.target != null && counted.length) {
        // Every logged day, short ones included.
        avg = counted.reduce((a, d) => a + (dayMap[d].kcal as number), 0) / counted.length;
        label = closedLabel(avg, n(x.target) as number, 'kcal');
      }
      return { field: x.field, avg, target: n(x.target), label, good: isGoodLabel(x.field, label, goalType) };
    });
    let score: number | null = null;
    let reason: string | null = null;
    if (!closed) reason = 'This week isn’t over yet';
    else if (counted.length < MIN_COUNTED_DAYS) reason = `${counted.length} of 7 days logged in full; a week needs ${MIN_COUNTED_DAYS}`;
    else {
      const judged = metrics.filter((x) => x.good != null);
      score = judged.length ? (judged.filter((x) => x.good).length / judged.length) * 10 : null;
    }
    weeks.push({ start: ws, end: sunday, closed, countedDays: counted.length, metrics, score, reason });
  }
  const scored = weeks.map((w) => w.score).filter((x): x is number => x != null);
  return { weeks, cycleScore: scored.length ? scored.reduce((a, b) => a + b, 0) / scored.length : null };
}

/** The days from `from` to `to`, for the chart and the meals sheet. */
export function nutritionDays(s: BlocState, from: string, to: string, withTdee: boolean): NutritionDay[] {
  const dayMap = buildDayMap(s) as DayMap;
  const waistBy = new Map<string, number>();
  for (const l of s.bodyLogs || []) { const w = n(l.waist); if (w != null && w > 0) waistBy.set(l.date, w); }
  const out: NutritionDay[] = [];
  for (let d = from; d <= to; d = shiftDateStr(d, 1)) {
    const x = dayMap[d];
    const g = getGoalForDay(s, d);
    out.push({
      date: d,
      logged: !!x?.hasNutr,
      kcal: x?.hasNutr ? (x.kcal as number) : null,
      protein: x?.hasNutr ? (x.protein as number) : null,
      carbs: x?.hasNutr ? (x.carbs as number) : null,
      fats: x?.hasNutr ? (x.fats as number) : null,
      steps: x?.steps ?? null,
      weight: x?.weight ?? null,
      waist: waistBy.get(d) ?? null,
      target: { kcal: n(g?.kcal), protein: n(g?.protein), carbs: n(g?.carbs), fats: n(g?.fats), steps: n(g?.steps) },
      tdee: withTdee ? (calcDynamicTDEE(s, { today: d })?.tdee ?? null) : null,
    });
  }
  return out;
}

/** BMR for the chart: the profile's Mifflin–St Jeor figure, else the engine's log-based one. */
export function bmrAt(s: BlocState, today: string): number | null {
  return calcMifflinBMR(s, { today }) ?? calcDynamicTDEE(s, { today })?.bmr ?? null;
}

export interface MealLine { meal: string; name: string; kcal: number; protein: number; carbs: number; fats: number }

/** A day's logged foods, meal by meal (the client's `nutritionMeals`). */
export function mealsOn(s: BlocState, date: string): MealLine[] {
  const day = (s.nutritionMeals || {})[date] || {};
  const out: MealLine[] = [];
  for (const [meal, items] of Object.entries(day)) {
    for (const it of items || []) {
      out.push({ meal, name: String(it?.name || 'Food'), kcal: n(it?.kcal) ?? 0, protein: n(it?.protein) ?? 0, carbs: n(it?.carbs) ?? 0, fats: n(it?.fats) ?? 0 });
    }
  }
  return out;
}
