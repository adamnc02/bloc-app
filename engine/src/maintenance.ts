// ═══════════════════════════════════════════════════════════════════════
// Maintenance cycles: the baseline, stability, the hold and the
// recalibration (TECHNICAL §175).
//
// A maintenance cycle has no goal weight. Its reference weight is the
// BASELINE: the average of the weigh-ins in the cycle's first 7 days. It is
// shown from the first weigh-in (over however many days exist so far) and is
// fixed once day 7 has passed, because later weigh-ins fall outside the
// window. Loss and gain cycles keep `targetBw` as the user's own input; nothing
// here reads or writes it.
//
// 🚨 THE TRAPS:
//   · Storing the baseline on the macro. A cycle created before it starts has
//     no weigh-in yet, and BLOC and Coach would both write it. It is derived,
//     and the 7-day window is what fixes it.
//   · Judging stability on a single weigh-in. One day's water can move 3–6 lbs
//     (a high-carb day, a salty meal). Stability compares a complete WEEK's
//     average with the baseline, never the latest weigh-in.
//   · Recalibrating against the current ramp step. A climb out of a deficit is
//     below maintenance on purpose, so losing during it is expected. The
//     recalibration compares the estimate with the HOLD's kcal.
//   · Estimating from an unfinished week, or from one week's change. A
//     part-week's average and a single week-on-week delta are mostly water;
//     at 3,500 kcal per lb every pound moves the answer by 500 kcal/day. The
//     estimate uses complete weeks only (at least 2, at most the last 4) and
//     the least-squares trend across them.
// ═══════════════════════════════════════════════════════════════════════

import type { BlocState, DateStr, GoalPeriod, Loose, Macrocycle } from './state.ts';
import { type EngineContext, dayDiff, getDayBefore, getMacroEndDate, getNextMonday, shiftDateStr } from './dates.ts';
import { buildReverseDietRows } from './nutrition.ts';
import { findMacroClash } from './clash.ts';

/** Within this many lbs of the baseline (a complete week's average): stable. */
export const MAINT_STABLE_LBS = 2;
/** Beyond this many lbs: drifting. Between the two: slipping. */
export const MAINT_DRIFT_LBS = 5;
/** A week's average counts for stability only with at least this many weigh-ins. */
export const MAINT_MIN_WEIGH_INS = 2;
/** The default climb step, kcal per week (the bridge builder's non-aggressive step). */
export const MAINT_CLIMB_STEP_KCAL = 125;
/** The recalibration reads at least this many complete weeks… */
export const RECAL_MIN_WEEKS = 2;
/** …and at most this many, the most recent. */
export const RECAL_MAX_WEEKS = 4;
/** An estimate this close to the hold (kcal AND fraction) needs no recalibration. */
export const RECAL_MIN_KCAL = 150;
export const RECAL_MIN_FRACTION = 0.07;

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;
const lbsOf = (v: unknown): number | null => {
  const n = parseFloat(String(v));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const isMaint = (m: Macrocycle | null | undefined): boolean => !!m && m.goalType === 'maintenance';

export interface MaintenanceBaseline {
  /** The week-1 average, to 0.1 lb. */
  lbs: number;
  /** Weigh-ins it averages. */
  days: number;
  /** True once day 7 has passed: no later weigh-in can change it. */
  locked: boolean;
  start: DateStr;
  end: DateStr;
}

// The average of the weigh-ins dated in the cycle's first 7 days, up to
// today. null on a cycle that isn't maintenance, has no start, or has no
// weigh-in in that window yet.
export function getMaintenanceBaseline(s: BlocState, macro: Macrocycle | null | undefined, ctx: EngineContext): MaintenanceBaseline | null {
  if (!macro || !isMaint(macro) || !macro.start) return null;
  const start = macro.start;
  const end = shiftDateStr(start, 6);
  const upTo = end < ctx.today ? end : ctx.today;
  const ws = (s.bodyLogs || [])
    .filter(l => l.date >= start && l.date <= upTo)
    .map(l => lbsOf(l.weight)).filter((n): n is number => n !== null);
  if (!ws.length) return null;
  return { lbs: r1(ws.reduce((a, b) => a + b, 0) / ws.length), days: ws.length, locked: ctx.today > end, start, end };
}

// The reference weight a cycle is judged against: the baseline on a
// maintenance cycle (whatever `targetBw` an older maintenance cycle carries is
// ignored), the user's own `targetBw` on any other.
export function getCycleReferenceLbs(s: BlocState, macro: Macrocycle | null | undefined, ctx: EngineContext): number | null {
  if (!macro) return null;
  if (isMaint(macro)) return getMaintenanceBaseline(s, macro, ctx)?.lbs ?? null;
  return lbsOf(macro.targetBw);
}

export type MaintenanceStabilityState = 'none' | 'forming' | 'stable' | 'slipping' | 'drifting';
export interface MaintenanceStability {
  state: MaintenanceStabilityState;
  baseline: MaintenanceBaseline | null;
  /** The complete week judged: its number in the cycle, dates and average. */
  week: { n: number; start: DateStr; end: DateStr; lbs: number; weighIns: number } | null;
  /** That week's average minus the baseline, to 0.1 lb. */
  diff: number | null;
  /** One sentence: what was compared and why it reads as it does. */
  reason: string;
}

// Stability = the latest COMPLETE week after week 1 (with at least
// MAINT_MIN_WEIGH_INS weigh-ins) against the baseline. 'forming' until such a
// week exists; 'none' before the first weigh-in.
export function judgeMaintenanceStability(s: BlocState, macro: Macrocycle | null | undefined, ctx: EngineContext): MaintenanceStability | null {
  if (!macro || !isMaint(macro) || !macro.start) return null;
  const baseline = getMaintenanceBaseline(s, macro, ctx);
  if (!baseline) {
    return { state: 'none', baseline: null, week: null, diff: null, reason: 'No weigh-in in the first 7 days of the cycle yet, so there is no baseline.' };
  }
  const cycleEnd = getMacroEndDate(macro, ctx);
  let week: MaintenanceStability['week'] = null;
  for (let n = 2; ; n++) {
    const ws = shiftDateStr(macro.start, (n - 1) * 7);
    const we = shiftDateStr(ws, 6);
    if (we >= ctx.today || ws > cycleEnd) break; // not complete yet
    const lbs = (s.bodyLogs || []).filter(l => l.date >= ws && l.date <= we)
      .map(l => lbsOf(l.weight)).filter((x): x is number => x !== null);
    if (lbs.length >= MAINT_MIN_WEIGH_INS) week = { n, start: ws, end: we, lbs: r1(lbs.reduce((a, b) => a + b, 0) / lbs.length), weighIns: lbs.length };
  }
  const base = `${baseline.lbs} lbs baseline (week 1's average${baseline.locked ? '' : ` so far, ${baseline.days} weigh-in${baseline.days === 1 ? '' : 's'}`})`;
  if (!week) {
    return { state: 'forming', baseline, week: null, diff: null,
      reason: `${base}. Stability is judged from the first complete week after week 1 with ${MAINT_MIN_WEIGH_INS} or more weigh-ins.` };
  }
  const diff = r1(week.lbs - baseline.lbs);
  const abs = Math.abs(diff);
  const state: MaintenanceStabilityState = abs <= MAINT_STABLE_LBS ? 'stable' : abs <= MAINT_DRIFT_LBS ? 'slipping' : 'drifting';
  const rel = abs === 0 ? 'level with' : `${abs.toFixed(1)} lbs ${diff > 0 ? 'above' : 'below'}`;
  const band = state === 'stable' ? `within ${MAINT_STABLE_LBS} lbs is stable`
    : state === 'slipping' ? `${MAINT_STABLE_LBS}–${MAINT_DRIFT_LBS} lbs is slipping` : `more than ${MAINT_DRIFT_LBS} lbs is drifting`;
  return { state, baseline, week, diff,
    reason: `Week ${week.n} averaged ${week.lbs} lbs over ${week.weighIns} weigh-ins, ${rel} the ${base}; ${band}.` };
}

export interface MaintenanceHold {
  goals: GoalPeriod[];
  kcal: number;
  start: DateStr;
  end: DateStr;
  weeks: number;
  /** True when the goals carry `hold: true`; false when found by the fallback. */
  flagged: boolean;
}

// The cycle's hold: the goals marked `hold: true` (the trailing run of them),
// or, on goals written before the flag existed, the trailing run of goals at
// the cycle's final kcal level.
export function getMaintenanceHold(goals: GoalPeriod[] | null | undefined, macro: Macrocycle | null | undefined): MaintenanceHold | null {
  if (!macro || !isMaint(macro)) return null;
  const mine = (goals || []).filter(g => g.macroId === macro.id && g.startDate && g.endDate)
    .slice().sort((a, b) => a.startDate.localeCompare(b.startDate));
  if (!mine.length) return null;
  const flagged = mine.some(g => g.hold === true);
  const run: GoalPeriod[] = [];
  const lastKcal = parseInt(mine[mine.length - 1].kcal);
  for (let i = mine.length - 1; i >= 0; i--) {
    const g = mine[i];
    if (flagged ? g.hold === true : parseInt(g.kcal) === lastKcal) run.unshift(g);
    else break;
  }
  if (!run.length) return null;
  const kcal = parseInt(run[run.length - 1].kcal);
  if (!kcal) return null;
  const start = run[0].startDate, end = run[run.length - 1].endDate;
  return { goals: run, kcal, start, end, weeks: Math.round((dayDiff(start, end) + 1) / 7), flagged };
}

// ── The recalibration ────────────────────────────────────────────────────
// Only on the ACTIVE maintenance cycle. Reads complete weeks (ended before
// today) with a weigh-in and 4+ days of nutrition: the most recent
// RECAL_MAX_WEEKS of them, at least RECAL_MIN_WEEKS.
//   estimate   = mean intake − trend (lbs/week, least squares) × 500
//   climbStart = min(mean intake, estimate): a climb exists only when weight
//                is falling at that intake; otherwise the hold moves at once.
// Fires when the estimate differs from the HOLD's kcal by RECAL_MIN_KCAL or
// more, or by RECAL_MIN_FRACTION or more.
//
// `ins` is computeWeeklyInsights' output for this macro (its weekBuckets).
// Returns null when no recalibration is warranted.
export function computeMaintenanceRecalibration(s: BlocState, ctx: EngineContext, macro: Macrocycle | null | undefined, ins: Loose): Loose {
  if (!macro || !isMaint(macro) || !ins) return null;
  const today = ctx.today;
  const cycleEnd = getMacroEndDate(macro, ctx);
  if (today < (macro.start || today) || today > cycleEnd) return null; // active cycle only

  const complete = (ins.weekBuckets || [])
    .filter((b: Loose) => b.bEnd < today && b.avgWeight !== null && b.nutrDayCount >= 4 && b.avgKcal)
    .slice(-RECAL_MAX_WEEKS);
  if (complete.length < RECAL_MIN_WEEKS) return null;

  const n = complete.length;
  const xs = complete.map((_b: Loose, i: number) => i);
  const ys = complete.map((b: Loose) => b.avgWeight as number);
  const mx = (n - 1) / 2;
  const my = ys.reduce((a: number, b: number) => a + b, 0) / n;
  const sxx = xs.reduce((a: number, x: number) => a + (x - mx) ** 2, 0);
  const slope = xs.reduce((a: number, x: number, i: number) => a + (x - mx) * (ys[i] - my), 0) / sxx;
  const avgKcal = Math.round(complete.reduce((a: number, b: Loose) => a + b.avgKcal, 0) / n);
  const estimate = Math.round(avgKcal - slope * 500);
  if (estimate < 800 || estimate > 6000) return null; // same bounds as calcDynamicTDEE

  const hold = getMaintenanceHold(s.goals, macro);
  if (!hold) return null;
  const effectiveFrom = getNextMonday(ctx);
  if (effectiveFrom > cycleEnd) return null; // nothing left to change

  const discrepancy = estimate - hold.kcal;
  if (Math.abs(discrepancy) < RECAL_MIN_KCAL && Math.abs(discrepancy / hold.kcal) < RECAL_MIN_FRACTION) return null;

  const trendLbsPerWeek = r2(slope);
  const first = complete[0].label, last = complete[n - 1].label;
  const trendText = Math.abs(trendLbsPerWeek) < 0.05 ? 'weight level'
    : `weight ${trendLbsPerWeek > 0 ? 'rising' : 'falling'} ${Math.abs(trendLbsPerWeek).toFixed(2)} lbs/week`;
  const reason = `Complete weeks ${first}–${last} averaged ${avgKcal.toLocaleString('en-GB')} kcal/day with ${trendText}, `
    + `which puts maintenance near ${estimate.toLocaleString('en-GB')} kcal/day: ${Math.abs(discrepancy).toLocaleString('en-GB')} kcal `
    + `${discrepancy > 0 ? 'above' : 'below'} the plan's hold of ${hold.kcal.toLocaleString('en-GB')} kcal.`;

  return {
    estimate, avgKcal, trendLbsPerWeek, weeksUsed: complete.map((b: Loose) => b.label),
    hold: { kcal: hold.kcal, start: hold.start, end: hold.end, weeks: hold.weeks, flagged: hold.flagged },
    discrepancy, direction: discrepancy > 0 ? 'higher' : 'lower',
    climbStart: Math.min(avgKcal, estimate),
    effectiveFrom, reason,
  };
}

export type RecalibrationChoice = 'step' | 'schedule';
export interface RecalibrationPlan {
  choice: RecalibrationChoice;
  /** The weekly kcal from effectiveFrom, before grouping (climb then hold). */
  rows: { start: DateStr; kcal: number; hold: boolean }[];
  /** Goals to write: the running goal trimmed to the Sunday before, then the new ones. */
  goals: GoalPeriod[];
  /** Goals that start on or after effectiveFrom and are not rewritten above. */
  removeGoalIds: string[];
  /** The kcal each climb week adds (choice 'schedule' divides the gap; 'step' is 125). */
  stepKcal: number;
  climbWeeks: number;
  holdWeeks: number;
  /** The macro's new extensionWeeks, when choice 'step' lengthens the cycle; else null. */
  extensionWeeks: number | null;
  newEnd: DateStr;
  /** Set when this choice can't be applied (it would run into the next cycle). */
  blocked: string | null;
}

// The goals a recalibration writes, for either choice:
//   'step'     — +MAINT_CLIMB_STEP_KCAL a week from climbStart to the new hold
//                (buildReverseDietRows: its last week lands on the hold and
//                counts as hold week 1), then the hold for as many weeks as
//                the cycle's own hold had; the cycle is extended by whole
//                weeks (extensionWeeks, as Extend cycle does) when that runs
//                past its end.
//   'schedule' — the hold keeps its planned start; the gap is divided evenly
//                over the weeks before it (the last of them lands on the hold).
//                The cycle's length doesn't change.
// Each new goal keeps the protein of the goal it replaces on that date (the
// hold's beyond the old end), the hold goal's steps, and splits the rest of
// its kcal between carbs and fats in the hold goal's ratio.
export function buildMaintenanceRecalibrationPlan(s: BlocState, ctx: EngineContext, macro: Macrocycle, recal: Loose, choice: RecalibrationChoice): RecalibrationPlan | null {
  if (!isMaint(macro) || !recal) return null;
  const hold = getMaintenanceHold(s.goals, macro);
  if (!hold) return null;
  const from: DateStr = recal.effectiveFrom;
  const target: number = recal.estimate;
  const startKcal: number = recal.climbStart;
  const cycleEnd = getMacroEndDate(macro, ctx);
  const weeksLeft = Math.round((dayDiff(from, cycleEnd) + 1) / 7);

  let climb: number[] = [];
  let stepKcal = 0;
  let extra = 0;
  if (choice === 'step') {
    climb = startKcal < target ? buildReverseDietRows(startKcal, target, MAINT_CLIMB_STEP_KCAL).map(r => r.kcal) : [];
    stepKcal = climb.length ? MAINT_CLIMB_STEP_KCAL : 0;
    // The last climb week is on the hold and counts as its first week.
    const needed = climb.length ? climb.length - 1 + hold.weeks : hold.weeks;
    extra = Math.max(0, needed - weeksLeft);
  } else {
    const before = hold.start > from ? Math.round(dayDiff(from, hold.start) / 7) : 0;
    if (before > 0 && startKcal < target) {
      stepKcal = Math.round((target - startKcal) / before);
      climb = Array.from({ length: before }, (_, i) => i === before - 1 ? target : Math.round(startKcal + (target - startKcal) * (i + 1) / before));
    } else if (before > 0) {
      climb = Array.from({ length: before }, () => target);
    }
  }
  const totalWeeks = weeksLeft + extra;
  const rows: RecalibrationPlan['rows'] = [];
  for (let w = 0; w < totalWeeks; w++) {
    const kcal = w < climb.length ? climb[w] : target;
    rows.push({ start: shiftDateStr(from, w * 7), kcal, hold: kcal === target });
  }
  // Only the trailing run at the target is the hold. Choice 'step': a climb
  // week that lands on it is its first week (the bridge builder's rule).
  // Choice 'schedule': the hold starts on its planned date, so the climb week
  // before it that lands on the target is still a climb week.
  const holdFrom = choice === 'schedule' && hold.start > from ? hold.start : from;
  for (let i = rows.length - 1, inRun = true; i >= 0; i--) {
    inRun = inRun && rows[i].kcal === target && rows[i].start >= holdFrom;
    rows[i].hold = inRun;
  }
  const newEnd = shiftDateStr(from, totalWeeks * 7 - 1);
  let blocked: string | null = null;
  const extensionWeeks = extra ? ((macro.extensionWeeks as number) || 0) + extra : null;
  if (extensionWeeks !== null) {
    const clash = findMacroClash(Object.assign({}, macro, { extensionWeeks }), s.macrocycles, macro.id, ctx);
    if (clash) blocked = `Extending to ${newEnd} runs into ${String(clash.name || 'the next cycle')} (starts ${clash.start}). Cycles can't overlap.`;
  }

  // Group consecutive weeks at the same kcal into one goal.
  const groups: { start: DateStr; end: DateStr; kcal: number; hold: boolean }[] = [];
  for (const r of rows) {
    const g = groups[groups.length - 1];
    if (g && g.kcal === r.kcal && g.hold === r.hold) g.end = shiftDateStr(r.start, 6);
    else groups.push({ start: r.start, end: shiftDateStr(r.start, 6), kcal: r.kcal, hold: r.hold });
  }

  const mine = (s.goals || []).filter(g => g.macroId === macro.id).slice().sort((a, b) => a.startDate.localeCompare(b.startDate));
  const holdGoal = hold.goals[hold.goals.length - 1];
  const hc = parseFloat(holdGoal.carbs) || 0, hf = parseFloat(holdGoal.fats) || 0;
  const carbShare = hc * 4 + hf * 9 > 0 ? (hc * 4) / (hc * 4 + hf * 9) : 0.5;
  const proteinOn = (d: DateStr) => {
    const g = mine.find(x => x.startDate <= d && x.endDate >= d) || holdGoal;
    return parseInt(g.protein) || parseInt(holdGoal.protein) || 0;
  };
  let climbN = 0;
  const fresh: GoalPeriod[] = groups.map(g => {
    const protein = proteinOn(g.start);
    const rest = Math.max(0, g.kcal - protein * 4);
    const label = g.hold ? 'Recalibrated hold' : `Recalibrated climb ${++climbN}`;
    return {
      macroId: macro.id, macroGoalID: `${macro.id}_g${g.start.replace(/-/g, '')}`,
      startDate: g.start, endDate: g.end, kcal: g.kcal, protein,
      carbs: Math.round(rest * carbShare / 4), fats: Math.round(rest * (1 - carbShare) / 9),
      steps: holdGoal.steps ?? 8000, hold: g.hold, _blocLabel: label,
    };
  });

  const out: GoalPeriod[] = [];
  const running = mine.find(g => g.startDate < from && g.endDate >= from);
  if (running) out.push({ ...running, endDate: getDayBefore(from) });
  out.push(...fresh);
  const rewritten = new Set(out.map(g => g.macroGoalID));
  const removeGoalIds = mine.filter(g => g.startDate >= from && !rewritten.has(g.macroGoalID as string))
    .map(g => g.macroGoalID as string).filter(Boolean);

  return {
    choice, rows, goals: out, removeGoalIds, stepKcal,
    climbWeeks: rows.filter(r => !r.hold).length, holdWeeks: rows.filter(r => r.hold).length,
    extensionWeeks, newEnd, blocked,
  };
}
