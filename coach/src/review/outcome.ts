// ═══════════════════════════════════════════════════════════════════════
// The outcome: is this cycle's goal on track? (TECHNICAL §140)
//
// It comes from the engine's computeWeeklyInsights(), at the client's local
// today: weekly buckets from the cycle's start (average weight, the change
// from the week before, calories, steps) and BLOC's flat/moving periods
// (flat = the weekly average moved 0.5 lb or less; a period confirms at 2
// weeks; the flag is sticky until a confirmed period of the other kind). The
// same judgement decides when the client's phone offers a check-in, so Coach
// and BLOC agree.
//
//   No outcome yet  fewer than 2 cycle weeks with a weigh-in
//   Loss            off track when the flat flag is up, OR each of the last 2
//                   weeks rose more than 0.5 lb. 🚨 The engine's "moving" has
//                   no direction: without this rule a loss client gaining a
//                   pound a week reads as on track.
//   Gain            the mirror: flat, or each of the last 2 weeks fell > 0.5 lb
//   Maintenance     weekly averages spanning more than 3 lb (the engine's
//                   maint-unstable), OR attendance under 7/10 over the last 2
//                   finished weeks
//   Waist           a loss cycle flagged flat is ON track when the waist is down
//                   at least 0.5″ since the last measurement on or before the
//                   flat period's start (recomposition: the scale stalls while
//                   the body changes)
//
// 🚨 Weight alone decides. The engine withholds its verdict (insufficientData)
//    until a baseline week has 4 days of food logged; Coach then groups the
//    same buckets with the engine's buildSignalPeriods() from week 1, so a
//    client who weighs in but doesn't log food still gets an outcome.
//
// What explains an off-track verdict, the first that applies: calories (the
// engine's own signal and headline) → weigh-ins (under 4 a week) → steps (more
// than Home's 500 under the goal's target) → training (under 6/10). When the
// outcome is on track the same checks are context, never flags.
// ═══════════════════════════════════════════════════════════════════════
import {
  HOME_STEPS_TOLERANCE, buildSignalPeriods, computeWeeklyInsights, getGoalForDate, getMacroEndDate, shiftDateStr,
  type BlocState, type Loose, type Macrocycle,
} from '@engine';
import type { OutcomeStatus } from '@/domain/types';
import { fmt } from '@/lib/format';
import type { TrainingCompliance } from './training';
import type { NutritionCompliance } from './nutrition';

/** The engine's flat threshold (buildSignalPeriods): a weekly change within ±0.5 lb is flat. */
export const FLAT_LBS = 0.5;
/** The engine's maint-unstable threshold: weekly averages spanning more than this. */
export const MAINT_SPAN_LBS = 3;
/** Maintenance: attendance under this, out of 10, over the last 2 finished weeks is off track. */
export const MAINT_ATTENDANCE_MIN = 7;
/** A loss cycle's flat stretch is recomposition when the waist is down at least this much. */
export const WAIST_RECOMP_IN = 0.5;
/** Fewer weigh-ins a week than this and the trend can't be trusted. */
export const MIN_WEIGH_INS_PER_WEEK = 4;
/** Training compliance under this, out of 10, explains a stall. */
export const TRAINING_EXPLAINS_BELOW = 6;

export type DriverKey = 'calories' | 'weigh-ins' | 'steps' | 'training';
export interface Driver {
  key: DriverKey;
  label: string;
  fact: string;
  bad: boolean;
}

export interface WeightWeek { label: string; start: string; end: string; avg: number | null; delta: number | null; weighIns: number; avgKcal: number | null; avgSteps: number | null }

/**
 * A stretch of the cycle as the engine groups it: the starting week, then
 * each flat or moving period (one week unconfirmed, two or more confirmed).
 * "How the weeks went" in Review's hero, and the story chart's header.
 */
export interface Period {
  kind: 'start' | 'flat' | 'moving';
  from: string;
  to: string;
  start: string;
  end: string;
  /** Average weight the week before the period, and its last week. */
  fromLbs: number | null;
  toLbs: number | null;
  avgKcal: number | null;
  confirmed: boolean;
  /** The engine's sticky flag is on this period. */
  flagged: boolean;
}

export interface Outcome {
  status: OutcomeStatus;
  periods: Period[];
  /** One or two sentences, plain words. */
  verdict: string;
  /** Short, for a list row. */
  reason: string;
  lead: Driver | null;
  context: Driver[];
  /** "Nothing in the logs explains it": the engine's note on the likely causes. */
  unexplained: string | null;
  /** The engine's signal (plateau-creep, gain-deficit, maint-stable…), for the record. */
  signal: string | null;
  weeks: WeightWeek[];
  /** The stretch the verdict is about (the flat period, the last 2 weeks, …). */
  window: { start: string; end: string } | null;
  waist: { from: number; to: number; fromDate: string; toDate: string } | null;
  recomposition: boolean;
}

const num = (v: unknown): number | null => {
  const x = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(x) && x > 0 ? x : null;
};
const lbs = (x: number) => x.toFixed(1);
const signed = (x: number) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(1)}`;
const inch = (x: number) => fmt.inches(Math.abs(x));
const int = (x: number) => Math.round(x).toLocaleString('en-GB');

function noOutcome(verdict: string, reason: string, weeks: WeightWeek[] = [], signal: string | null = null): Outcome {
  return { status: 'no-data', periods: [], verdict, reason, lead: null, context: [], unexplained: null, signal, weeks, window: null, waist: null, recomposition: false };
}

/** Waist on the last measurement on or before a date (any date before it), and the latest up to `end`. */
function waistChange(s: BlocState, since: string, end: string): Outcome['waist'] {
  const logs = (s.bodyLogs || []).filter((l) => num(l.waist) != null && l.date <= end).sort((a, b) => a.date.localeCompare(b.date));
  const before = [...logs].reverse().find((l) => l.date <= since);
  const latest = logs[logs.length - 1];
  if (!before || !latest || latest.date <= before.date) return null;
  return { from: num(before.waist)!, to: num(latest.waist)!, fromDate: before.date, toDate: latest.date };
}

function daysBetweenIncl(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000) + 1;
}

/**
 * The engine's calorie signal, from its own figures, about the client rather
 * than to them (its headline is written for the client's phone: "Your deficit…").
 */
export function calorieFact(signal: string, ins: Loose): string {
  const tdee: number | null = ins.estimatedTDEE ?? null;
  const drift = int(Math.abs(ins.caloricDrift ?? 0));
  const def: number | null = ins.deficitOrSurplus ?? null;
  switch (signal) {
    case 'plateau-creep': {
      if ((ins.caloricDrift ?? 0) > 100) return `Intake has drifted up ~${drift} kcal a day since the baseline weeks`;
      const during: number | null = ins.activePeriod?.avgKcalDuring ?? null;
      if (tdee && during != null) return `The deficit narrowed to ~${int(Math.abs(during - tdee))} kcal a day during the flat weeks (${int(during)} eaten, TDEE ~${int(tdee)})`;
      return `Averaging ${during != null ? int(during) : int(ins.avgKcalRecent)} kcal a day during the flat weeks, against ~${int(ins.avgKcalBaseline)} at the baseline`;
    }
    case 'drift-warning': return `Intake has crept up ~${drift} kcal a day from the baseline weeks`;
    case 'gain-deficit': return `Eating ~${def != null ? int(Math.abs(def)) : '?'} kcal a day below their TDEE on a gain cycle`;
    case 'gain-undereating': return `A surplus of only ~${def != null ? int(def) : '?'} kcal a day, too small for steady gain`;
    case 'gain-excess': return `A surplus of ~${def != null ? int(def) : '?'} kcal a day, more than lean gain needs`;
    default: return String(ins.headline ?? 'Calories are off target');
  }
}

export interface OutcomeInputs {
  training: TrainingCompliance;
  nutrition: NutritionCompliance;
}

export function judgeOutcome(s: BlocState, m: Macrocycle, today: string, inputs: OutcomeInputs): Outcome {
  if (!m.start) return noOutcome('This cycle has no start date.', 'No start date');
  if (m.start > today) return noOutcome('This cycle hasn’t started yet.', 'Not started');
  const ins: Loose = computeWeeklyInsights(s, { today }, m);
  const goalType = String(m.goalType || 'loss');
  const weeks: WeightWeek[] = (ins?.weekBuckets || []).map((b: Loose) => ({
    label: b.label, start: b.bStart, end: b.bEnd, avg: b.avgWeight, delta: b.delta, weighIns: b.weightDayCount, avgKcal: b.avgKcal, avgSteps: b.avgSteps,
  }));
  if (!ins || weeks.filter((w) => w.avg != null).length < 2) {
    return noOutcome('No outcome yet. It needs weigh-ins in at least 2 weeks of the cycle.', 'Too few weigh-ins', weeks, ins?.signal ?? null);
  }
  const end = [getMacroEndDate(m, { today }), today].sort()[0];

  // BLOC's own periods; from week 1 when it withheld its verdict for want of food logs.
  const periods = ins.insufficientData ? buildSignalPeriods(ins.weekBuckets, 0) : { periods: ins.signalPeriods, activePeriod: ins.activePeriod };
  const active: Loose = periods.activePeriod;
  const flat = !!active && active.type === 'flat';
  const deltas = weeks.map((w) => w.delta).filter((d): d is number => d != null);
  const last2 = deltas.slice(-2);
  const withW = weeks.filter((w) => w.avg != null);
  const lastW = withW[withW.length - 1];

  // The stretches, for the narrative: the first week, then BLOC's periods.
  const bucketIdx = (label: string) => weeks.findIndex((w) => w.label === label);
  const out: Period[] = [];
  const first = withW[0];
  out.push({ kind: 'start', from: first.label, to: first.label, start: first.start, end: first.end, fromLbs: null, toLbs: first.avg, avgKcal: first.avgKcal, confirmed: true, flagged: false });
  for (const p of periods.periods as Loose[]) {
    const i = bucketIdx(p.startLabel);
    const prev = [...weeks.slice(0, Math.max(0, i))].reverse().find((w) => w.avg != null);
    const lastWk = [...(p.weeks as Loose[])].reverse().find((w) => w.avgWeight != null);
    out.push({
      kind: p.type, from: p.startLabel, to: p.endLabel, start: p.startDate, end: p.endDate,
      fromLbs: prev?.avg ?? null, toLbs: lastWk?.avgWeight ?? null, avgKcal: p.avgKcalDuring ?? null,
      confirmed: !!p.confirmed, flagged: p === active,
    });
  }
  // Weeks between the first and the first period (the engine's baseline) join the start.
  if (out.length > 1 && bucketIdx(out[1].from) - 1 > bucketIdx(first.label)) {
    const lastBase = [...weeks.slice(0, bucketIdx(out[1].from))].reverse().find((w) => w.avg != null)!;
    out[0] = { ...out[0], to: lastBase.label, end: lastBase.end, fromLbs: first.avg, toLbs: lastBase.avg };
  }

  let off = false;
  let window: Outcome['window'] = null;
  let verdict = '';
  let waist: Outcome['waist'] = null;
  let recomposition = false;
  const signal: string | null = ins.insufficientData ? null : ins.signal ?? null;

  if (goalType === 'maintenance') {
    const avgs = withW.map((w) => w.avg as number);
    const span = Math.max(...avgs) - Math.min(...avgs);
    const closed = inputs.training.cols.filter((c) => c.closed && c.attendance != null).slice(-2);
    const planned = closed.reduce((a, c) => a + c.planned, 0), done = closed.reduce((a, c) => a + c.done, 0);
    const att = closed.length ? closed.reduce((a, c) => a + (c.attendance as number), 0) / closed.length : null;
    if (span > MAINT_SPAN_LBS) {
      off = true;
      window = { start: withW[0].start, end };
      verdict = `Off track. Weight has varied ${span.toFixed(1)} lbs across the cycle, more than the ${MAINT_SPAN_LBS} lbs maintenance allows.`;
    } else if (att != null && att < MAINT_ATTENDANCE_MIN) {
      off = true;
      window = { start: closed[0].start, end: closed[closed.length - 1].end };
      verdict = `Off track. ${done} of ${planned} planned sessions done in the last ${closed.length === 1 ? 'week' : '2 weeks'}.`;
    } else {
      window = { start: withW[Math.max(0, withW.length - 3)].start, end };
      verdict = `On track. Weight is holding within ${span.toFixed(1)} lbs${num(m.targetBw) ? ` around ${lbs(num(m.targetBw)!)}` : ''}${att != null ? `, and ${done} of ${planned} sessions were done in the last 2 weeks` : ''}.`;
    }
  } else {
    const gain = goalType === 'gain';
    const wrongWay = last2.length === 2 && (gain ? last2.every((d) => d < -FLAT_LBS) : last2.every((d) => d > FLAT_LBS));
    if (wrongWay) {
      off = true;
      const two = weeks.filter((w) => w.delta != null).slice(-2);
      window = { start: two[0].start, end };
      verdict = `Off track. Weight has ${gain ? 'fallen' : 'risen'} for 2 weeks (${signed(last2[0] + last2[1])} lbs) on a ${gain ? 'gain' : 'loss'} cycle.`;
    } else if (flat) {
      const startAvg = weeks.find((w) => w.label === active.startLabel)?.avg ?? null;
      window = { start: active.startDate, end };
      const ongoing = active === periods.periods[periods.periods.length - 1];
      const since = ongoing
        ? `Weight has been flat since ${active.startLabel}`
        : `Weight was flat ${active.startLabel}–${active.endLabel} and hasn’t had 2 weeks of ${gain ? 'gain' : 'loss'} since`;
      const fig = startAvg != null && lastW.avg != null ? `: ${lbs(startAvg)} → ${lbs(lastW.avg)} lbs` : '';
      off = true;
      verdict = `Off track. ${since}${fig}.`;
      if (!gain) {
        waist = waistChange(s, active.startDate, end);
        if (waist && waist.to - waist.from <= -WAIST_RECOMP_IN) {
          off = false;
          recomposition = true;
          verdict = `On track. ${since}, but the waist is down ${inch(waist.to - waist.from)} since ${waist.fromDate}.`;
        }
      }
    } else {
      const recent = withW.slice(-3);
      window = { start: recent[0].start, end };
      const change = (recent[recent.length - 1].avg as number) - (recent[0].avg as number);
      verdict = `On track. Weight is ${gain ? 'rising' : 'falling'}: ${lbs(recent[0].avg as number)} → ${lbs(recent[recent.length - 1].avg as number)} lbs over the last ${recent.length} weeks (${signed(change)}).`;
    }
  }

  // ── What explains it (off track), or what's drifting (on track) ──────────
  const win = window ?? { start: m.start, end };
  const drivers: Driver[] = [];

  // Calories: the engine's own signal.
  const calorieSignals = off
    ? ['plateau-creep', 'drift-warning', 'gain-deficit', 'gain-undereating']
    : ['drift-warning', 'gain-deficit', 'gain-excess', 'plateau-creep'];
  if (signal && calorieSignals.includes(signal)) {
    drivers.push({ key: 'calories', label: 'Calories', fact: calorieFact(signal, ins), bad: true });
  } else if (goalType === 'maintenance') {
    const nw = inputs.nutrition.weeks.filter((w) => w.closed && w.end >= win.start).slice(-2);
    const badKcal = nw.filter((w) => w.metrics.find((x) => x.field === 'kcal')?.good === false);
    const k = nw.length ? nw.map((w) => w.metrics.find((x) => x.field === 'kcal')).filter(Boolean) : [];
    if (badKcal.length && badKcal.length === nw.length) {
      const avg = k.reduce((a, x) => a + (x!.avg ?? 0), 0) / k.length, tgt = k[0]!.target;
      drivers.push({ key: 'calories', label: 'Calories', fact: `Calories averaging ${int(avg)} a day${tgt ? ` against ${int(tgt)}` : ''}`, bad: true });
    }
  } else if (ins.avgKcalRecent && !ins.insufficientData) {
    drivers.push({ key: 'calories', label: 'Calories', fact: `Calories averaging ${int(ins.avgKcalRecent)} a day, ${ins.caloricDrift >= 0 ? '+' : '−'}${int(Math.abs(ins.caloricDrift))} from the baseline weeks`, bad: false });
  }

  // Weigh-ins in the window.
  const wDays = (s.bodyLogs || []).filter((l) => num(l.weight) != null && l.date >= win.start && l.date <= win.end).length;
  const winDays = Math.max(1, daysBetweenIncl(win.start, win.end));
  const perWeek = (wDays / winDays) * 7;
  drivers.push({
    key: 'weigh-ins', label: 'Weigh-ins',
    fact: `${wDays} weigh-in${wDays === 1 ? '' : 's'} in ${winDays} days${perWeek < MIN_WEIGH_INS_PER_WEEK ? ', too few to trust the trend' : ''}`,
    bad: perWeek < MIN_WEIGH_INS_PER_WEEK,
  });

  // Steps against the goal phase's target, day by day.
  let stepSum = 0, stepN = 0, tgtSum = 0, tgtN = 0;
  for (let d = win.start; d <= win.end; d = shiftDateStr(d, 1)) {
    const l = (s.bodyLogs || []).find((x) => x.date === d);
    const st = num(l?.steps);
    const g = num(getGoalForDate(s, d, m.id)?.steps);
    if (st != null && g != null) { stepSum += st; stepN++; tgtSum += g; tgtN++; }
  }
  if (stepN) {
    const avg = stepSum / stepN, tgt = tgtSum / tgtN;
    drivers.push({ key: 'steps', label: 'Steps', fact: `Steps averaging ${int(avg)} a day against ${int(tgt)}`, bad: avg < tgt - HOME_STEPS_TOLERANCE });
  }

  // Training over the window's finished weeks.
  const tc = inputs.training.cols.filter((c) => c.closed && c.end >= win.start && c.start <= win.end);
  const tScores = tc.map((c) => (inputs.training.scored ? c.score : c.attendance)).filter((x): x is number => x != null);
  if (tScores.length) {
    const t = tScores.reduce((a, b) => a + b, 0) / tScores.length;
    drivers.push({
      key: 'training', label: 'Training',
      fact: `${inputs.training.scored ? 'Training compliance' : 'Attendance'} ${t.toFixed(1)}/10 over ${tc.length} week${tc.length === 1 ? '' : 's'}`,
      bad: goalType === 'maintenance' ? t < MAINT_ATTENDANCE_MIN : t < TRAINING_EXPLAINS_BELOW,
    });
  }

  const order: DriverKey[] = ['calories', 'weigh-ins', 'steps', 'training'];
  drivers.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));

  if (off) {
    const lead = drivers.find((d) => d.bad) ?? null;
    const unexplained = lead ? null : signal === 'plateau-adaptation' ? String(ins.detail) : 'Nothing in the logs explains it.';
    return {
      status: 'off-track', periods: out, verdict, reason: lead ? lead.fact : 'Nothing in the logs explains it',
      lead, context: drivers.filter((d) => d !== lead), unexplained, signal, weeks, window, waist, recomposition,
    };
  }
  const context = drivers.map((d) => (d.bad ? { ...d, fact: `${d.fact}, but the goal is on track. Nothing to act on.` } : d));
  return { status: 'on-track', periods: out, verdict, reason: recomposition ? 'Waist down, weight flat' : 'On track', lead: null, context, unexplained: null, signal, weeks, window, waist, recomposition };
}
