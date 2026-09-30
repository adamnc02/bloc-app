// ═══════════════════════════════════════════════════════════════════════
// The demo clients' BLOC states, simulated (PROMPT-04).
//
// buildDemoState(persona, today) runs a client's story from its first day to
// `today`, one day at a time, and logs every set through the engine's own
// progression: the same targets Train suggests (computeExerciseProgression),
// the same lock (computeLockTransition) and the same exercise history
// (recordExerciseHistory) BLOC writes. So a stall, a deload or a missed
// week reads in BLOC and Coach exactly as a real client's would.
//
// 🚨 Everything is placed relative to the Monday of today's week
//    (getHomeWeekStart: today itself on a Monday). Cycles and goal phases
//    start a whole number of weeks from it, so every cycle and phase starts
//    on a Monday and every phase ends on a Sunday, whatever day it is run.
// 🚨 Every random choice is seeded by the persona and the day's place in the
//    story (days since the story started), never the calendar date, so the
//    same weekday of any week produces the same client.
// 🚨 Today is the morning: a weigh-in only. No food, steps or session yet, so
//    there is something to log live in a demo.
// ═══════════════════════════════════════════════════════════════════════
import type { BlocState, Loose, Macrocycle } from '../state.ts';
import { normaliseState } from '../state.ts';
import { getHomeWeekStart, shiftDateStr, dayDiff } from '../dates.ts';
import { getMacroSessionDayKeys } from '../progression.ts';
import { getProgressionLockKey } from '../progression.ts';
import { getNextIncompleteSession } from '../sessions.ts';
import { computeExerciseProgression, computeLockTransition, type TargetCache } from '../targets.ts';
import { recordExerciseHistory, computeRollupEntries } from '../mutators.ts';
import { rng } from './rng.ts';

/** One exercise in a session template. Weights in kg. */
export interface DemoExercise {
  name: string;
  reps: string;
  setsStart: number;
  setsEnd: number;
  startWeight: number;
  type?: 'standard' | 'pause';
  isHeavyLeg?: boolean;
  trackingMode?: 'total' | 'perSide';
}

/** A goal phase, in the cycle's calendar weeks (1-based, inclusive). */
export interface DemoGoal { fromWeek: number; toWeek: number; kcal: number; protein: number; carbs: number; fats: number; steps: number }

export interface DemoCycle {
  key: string;
  name: string;
  goal: string;
  goalType: 'loss' | 'gain' | 'maintenance';
  targetBw: number;
  /** Calendar weeks from the Monday of today's week to the cycle's start (negative: it started earlier). */
  startOffsetWeeks: number;
  /** Mesocycles; with weeksPerMeso the calendar length is weeks × weeksPerMeso. */
  weeks: number;
  weeksPerMeso: 1 | 2;
  useMicrocycles: boolean;
  /** `exercisesB`: the session's microcycle-B version (its m2 key); absent, B repeats A. */
  sessions: { label: string; exercises: DemoExercise[]; exercisesB?: DemoExercise[] }[];
  /** Mesocycle weeks that are deloads. */
  deloadWeeks?: number[];
  goals: DemoGoal[];
  /** Published by the coach (stamped with the coach id at build time). */
  published?: boolean;
  /** Written when the cycle has ended (the client's own cycle review). */
  review?: { complianceScore: number; headline: string; narrative: string; highlights: string[]; improvements: string[]; stickingPoints: string; direction: 'loss' | 'gain' | 'maintenance'; bodyfatNote: string };
}

export interface DemoPersona {
  key: string;
  tz: string;
  profile: { gender: 'male' | 'female'; heightCm: number; birthday: string };
  /** Training weekdays, 0 = Monday. Session n of a calendar week goes on weekdays[n]. */
  weekdays: number[];
  /** Weeks of story before the Monday of today's week. */
  historyWeeks: number;
  startLbs: number;
  /** Weekly bodyweight change, one entry per calendar week of the story (the last repeats). */
  lbsPerWeek: number[];
  startWaist: number;
  startHip: number;
  /** Waist change per calendar week (inches; the last repeats). */
  waistPerWeek: number[];
  steps: { base: number; spread: number };
  /** Share of days with a weigh-in / with food logged. */
  weighInRate: number;
  foodLogRate: number;
  /** kcal logged over the goal, per calendar week (the last repeats). */
  kcalBias: number[];
  /** Share of sessions skipped in finished cycles, and in the running one (default none: a skipped session
   *  stays BLOC's "next", so Train would open weeks back), and of exercises that miss their target. */
  skipRate: number;
  skipRateNow?: number;
  missRate: number;
  /** Exercises that miss every week from the given mesocycle week of the named cycle. */
  stalls?: { cycle: string; exercise: string; fromWeek: number }[];
  /** No logs of any kind on the last N days before today (the phone not opened). */
  quietDays?: number;
  cycles: DemoCycle[];
}

export interface DemoBuildOptions {
  /** The coach's id, stamped on cycles the coach published. */
  coachId?: string | null;
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const quarter = (x: number) => Math.round(x * 4) / 4;
const at = <T>(xs: T[], i: number): T => xs[Math.min(i, xs.length - 1)];
const weekdayOf = (d: string) => dayDiff(getHomeWeekStart(d), d); // 0 = Monday

/** The calendar week (0-based from the cycle's start) → the sessions in it, as (meso week, dayKey). */
function sessionsInWeek(macro: Macrocycle, c: number): { week: number; dayKey: string }[] {
  const wpm = (macro.weeksPerMeso as number) || 1;
  const week = Math.floor(c / wpm) + 1;
  const keys = getMacroSessionDayKeys(macro);
  if (macro.useMicrocycles === false) return keys.map(dayKey => ({ week, dayKey }));
  if (wpm === 2) {
    const mc = (c % 2) + 1;
    return keys.filter(k => k.endsWith('m' + mc)).map(dayKey => ({ week, dayKey }));
  }
  return keys.map(dayKey => ({ week, dayKey })); // microcycles on, one-week mesocycles: A and B in the same week
}

function macroFor(cycle: DemoCycle, persona: DemoPersona, monday: string, coachId: string | null): Macrocycle {
  const days = cycle.sessions.map((_, i) => 'session' + i);
  const dayLabels: Record<string, string> = {};
  cycle.sessions.forEach((s, i) => { dayLabels['session' + i] = s.label; });
  const m: Macrocycle = {
    id: `macro_demo_${persona.key}_${cycle.key}`,
    name: cycle.name,
    weeks: cycle.weeks,
    weeksPerMeso: cycle.weeksPerMeso,
    sessionsPerWeek: cycle.sessions.length,
    start: shiftDateStr(monday, cycle.startOffsetWeeks * 7),
    goal: cycle.goal,
    targetBw: cycle.targetBw,
    goalType: cycle.goalType,
    splitType: 'custom',
    days,
    dayLabels,
    useMicrocycles: cycle.useMicrocycles,
    weightIncrement: '2.5',
  };
  if (cycle.published && coachId) m.publishedBy = coachId;
  return m;
}

/** The exercise templates, keyed `${macroId}_1_${dayKey}` as BLOC holds them. */
function templatesFor(cycle: DemoCycle, macro: Macrocycle): Record<string, Loose[]> {
  const out: Record<string, Loose[]> = {};
  for (const dayKey of getMacroSessionDayKeys(macro)) {
    const idx = parseInt(dayKey.replace(/^session/, ''), 10);
    const key = `${macro.id}_1_${dayKey}`;
    const sess = cycle.sessions[idx];
    const list = dayKey.endsWith('m2') && sess.exercisesB ? sess.exercisesB : sess.exercises;
    out[key] = list.map((e, n) => ({
      name: e.name, reps: e.reps, setsStart: e.setsStart, setsEnd: e.setsEnd, startWeight: e.startWeight,
      type: e.type || 'standard', isHeavyLeg: !!e.isHeavyLeg, trackingMode: e.trackingMode || 'total',
      id: `ex_${macro.id}_1_${dayKey}_${n}`, order: n * 10, supersetId: null, supersetOrder: null,
    }));
  }
  return out;
}

function goalsFor(cycle: DemoCycle, macro: Macrocycle): Loose[] {
  return cycle.goals.map((g, i) => {
    const startDate = shiftDateStr(macro.start as string, (g.fromWeek - 1) * 7);
    return {
      macroId: macro.id, startDate, endDate: shiftDateStr(macro.start as string, g.toWeek * 7 - 1),
      kcal: g.kcal, steps: g.steps, protein: g.protein, carbs: g.carbs, fats: g.fats,
      macroGoalID: `${macro.id}_g${startDate.replace(/-/g, '')}`, _blocLabel: `Step ${i + 1}`,
    };
  });
}

/** Which session each cycle holds on each date: one training day per session, on the persona's weekdays in order. */
function scheduleOf(persona: DemoPersona, macros: Macrocycle[]): Record<string, { m: Macrocycle; week: number; dayKey: string }> {
  const out: Record<string, { m: Macrocycle; week: number; dayKey: string }> = {};
  for (const m of macros) {
    const calWeeks = (m.weeks as number) * ((m.weeksPerMeso as number) || 1);
    for (let c = 0; c < calWeeks; c++) {
      const weekMonday = shiftDateStr(m.start as string, c * 7);
      sessionsInWeek(m, c).forEach((u, i) => {
        out[shiftDateStr(weekMonday, persona.weekdays[i % persona.weekdays.length])] = { m, ...u };
      });
    }
  }
  return out;
}

/** A session's place: its date, and the cycle, mesocycle week and day key it is in the plan. */
export interface DemoSession { date: string; macroId: string; week: number; dayKey: string }

/**
 * Every planned session of the persona's cycles (published ones included, even
 * if they start after today), with the date the story does it on. Coach's side
 * uses it for the in-person client (Eileen): her sessions are the diary's.
 */
export function sessionSchedule(persona: DemoPersona, today: string, opts: DemoBuildOptions = {}): DemoSession[] {
  const monday = getHomeWeekStart(today);
  const macros = persona.cycles.map(c => macroFor(c, persona, monday, opts.coachId ?? null));
  return Object.entries(scheduleOf(persona, macros))
    .map(([date, u]) => ({ date, macroId: u.m.id, week: u.week, dayKey: u.dayKey }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** A publication as inserted: what `stampLedger` needs of it. */
export interface DemoPublication { id: string; seq: number; type: string; coachId: string; createdAt: string; payload: Loose }

/**
 * The state as BLOC holds it once it has applied these `plan` and
 * `goal_phases` publications: each in `coachLedger` as applied and acked, and
 * the coach's cycles and goals stamped with the publication's `seq`
 * (BLOC's applyPublications, TECHNICAL §131). The simulator already built
 * their content, so only the receipt is added. Returns a new state.
 *
 * 🚨 BLOC pulls publications with a `seq` above the highest in its ledger, so
 *    these must be the card's LOWEST seqs: anything published after them
 *    (bookings, replies, photo requests) is left for BLOC to pull and apply
 *    itself when the account is opened.
 */
export function stampLedger(state: BlocState, pubs: DemoPublication[]): BlocState {
  const s: Loose = JSON.parse(JSON.stringify(state));
  if (!s.coachLedger || typeof s.coachLedger !== 'object') s.coachLedger = {};
  for (const p of pubs.filter(x => x.type === 'plan' || x.type === 'goal_phases').sort((a, b) => a.seq - b.seq)) {
    s.coachLedger[p.id] = { seq: p.seq, type: p.type, status: 'applied', note: null, at: p.createdAt, acked: true };
    if (p.type === 'plan') {
      const m = (s.macrocycles as Loose[]).find(x => x.id === p.payload?.macrocycle?.id);
      if (m) { m.publishedBy = p.coachId; m.publishedSeq = p.seq; }
    } else {
      const ids = new Set(((p.payload?.goals || []) as Loose[]).map(g => g.macroGoalID));
      for (const g of s.goals as Loose[]) if (ids.has(g.macroGoalID)) { g.publishedBy = p.coachId; g.publishedSeq = p.seq; }
    }
  }
  return s;
}

/** The client's BLOC state on `today` (their local date), as their phone would hold it that morning. */
export function buildDemoState(persona: DemoPersona, today: string, opts: DemoBuildOptions = {}): BlocState {
  const monday = getHomeWeekStart(today);
  const storyStart = shiftDateStr(monday, -persona.historyWeeks * 7);
  const coachId = opts.coachId ?? null;
  const quietFrom = persona.quietDays ? shiftDateStr(today, -persona.quietDays) : null;

  const s: Loose = {
    macrocycles: [], exercises: {}, trainLogs: {}, bodyLogs: [], nutritionLogs: [], goals: [],
    customLibrary: [], nutritionMeals: {}, nutritionQuickLog: {}, foodLibrary: [], recipes: [], sampleDays: [],
    supersets: {}, deloads: {}, exerciseHistory: {}, exerciseTrackingMode: {}, progressionTargets: {}, progressionLocks: {},
    currentMacroId: null, currentWeek: 1, currentDay: 'session0', currentEditContext: null,
    profile: { ...persona.profile, measureUnit: 'in' },
  };
  const cache: TargetCache = {
    get: key => s.progressionTargets[key],
    set: (key, target) => { s.progressionTargets[key] = target; },
  };

  // Cycles that have started by today, with their templates, goals and deloads.
  const cycles = persona.cycles.map(c => ({ c, m: macroFor(c, persona, monday, coachId) }));
  for (const { c, m } of cycles) {
    if ((m.start as string) > today && !c.published) continue; // a client's own future cycle doesn't exist yet
    s.macrocycles.push(m);
    Object.assign(s.exercises, templatesFor(c, m));
    s.goals.push(...goalsFor(c, m));
    for (const w of c.deloadWeeks || []) {
      if (m.useMicrocycles === false) s.deloads[`${m.id}_${w}`] = true;
      else { s.deloads[`${m.id}_${w}_m1`] = true; if (m.weeksPerMeso === 2) s.deloads[`${m.id}_${w}_m2`] = true; }
    }
  }
  const goalOn = (d: string) => (s.goals as Loose[]).find(g => g.startDate <= d && d <= g.endDate)
    || (s.goals as Loose[]).filter(g => g.endDate < d).sort((a, b) => a.endDate.localeCompare(b.endDate)).pop() || null;

  const sessionOn: Record<string, { m: Macrocycle; week: number; dayKey: string }> = {};
  for (const [d, u] of Object.entries(scheduleOf(persona, s.macrocycles as Macrocycle[]))) sessionOn[d] = u;

  const lockBefore: Record<string, boolean> = {};
  let lbs = persona.startLbs;
  for (let d = storyStart, day = 0; d <= today; d = shiftDateStr(d, 1), day++) {
    const week = Math.floor(day / 7);
    const R = rng(`${persona.key}:${day}`);
    lbs += at(persona.lbsPerWeek, week) / 7;
    const quiet = quietFrom !== null && d > quietFrom && d < today;
    const isToday = d === today;
    if (quiet) continue;

    // Body: a morning weigh-in; steps at the end of the day; measurements on Mondays.
    const body: Loose = { date: d };
    if (R() < persona.weighInRate || isToday) body.weight = r1(lbs + (R() - 0.5) * 1.2 + (weekdayOf(d) === 0 ? 0.4 : 0));
    const g = goalOn(d);
    if (!isToday) body.steps = Math.max(1500, Math.round((g ? g.steps : persona.steps.base) + (R() - 0.55) * persona.steps.spread));
    if (weekdayOf(d) === 0) {
      let waist = persona.startWaist;
      for (let w = 0; w < week; w++) waist += at(persona.waistPerWeek, w);
      body.waist = quarter(waist);
      body.hip = quarter(persona.startHip + (waist - persona.startWaist) * 0.6);
    }
    if (body.weight !== undefined || body.steps !== undefined || body.waist !== undefined) s.bodyLogs.push(body);

    // Food: the day's totals, around the goal plus the week's bias.
    if (!isToday && g && R() < persona.foodLogRate) {
      const kcal = Math.round(g.kcal + at(persona.kcalBias, week) + (R() - 0.5) * 220);
      const protein = Math.round(g.protein * (0.9 + R() * 0.15));
      // Eating over the goal is carbs and fat together (about 40% of the extra from fat), not carbs alone.
      const fats = Math.round(g.fats * (0.85 + R() * 0.3) + Math.max(0, kcal - g.kcal) * 0.4 / 9);
      const carbs = Math.max(40, Math.round((kcal - protein * 4 - fats * 9) / 4));
      s.nutritionLogs.push({ date: d, kcal, protein, carbs, fats });
      s.nutritionQuickLog[d] = { kcal, protein, carbs, fats };
    }

    // Training: the session planned for this date, done in the evening.
    const u = sessionOn[d];
    const running = u && (u.m.start as string) <= today
      && today <= shiftDateStr(u.m.start as string, (u.m.weeks as number) * ((u.m.weeksPerMeso as number) || 1) * 7 - 1);
    if (u && !isToday && R() >= (running ? persona.skipRateNow ?? 0 : persona.skipRate)) logSession(s, cache, persona, u.m, u.week, u.dayKey, d, R, lockBefore);
  }

  // Cycle reviews for the cycles that have ended, and the rollup BLOC keeps of them.
  for (const { c, m } of cycles) {
    if (!c.review || !s.macrocycles.includes(m)) continue;
    const end = shiftDateStr(m.start as string, (m.weeks as number) * ((m.weeksPerMeso as number) || 1) * 7 - 1);
    if (end >= today) continue;
    const inCycle = (s.bodyLogs as Loose[]).filter(l => l.weight && l.date >= (m.start as string) && l.date <= end);
    const first = inCycle.length ? inCycle[0].weight : null, last = inCycle.length ? inCycle[inCycle.length - 1].weight : null;
    m.review = {
      storedAt: shiftDateStr(end, 1), complianceScore: c.review.complianceScore,
      bodyfatEstimate: { direction: c.review.direction, note: c.review.bodyfatNote },
      headline: c.review.headline, narrative: c.review.narrative,
      highlights: c.review.highlights, improvements: c.review.improvements, stickingPoints: c.review.stickingPoints,
      ranTooLong: false, ranTooLongNote: '',
      weightTargetDelta: last !== null ? r1(Math.abs(last - c.targetBw)) : null,
      totalWeightChange: first !== null && last !== null ? r1(last - first) : null,
      beforePhotoCount: 0, afterPhotoCount: 0,
    };
  }
  s.insightsRollup = { completedCycles: computeRollupEntries(s, { today }) };

  // Where Train opens: the running cycle's next unfinished session.
  const running = (s.macrocycles as Macrocycle[]).find(m => (m.start as string) <= today
    && today <= shiftDateStr(m.start as string, (m.weeks as number) * ((m.weeksPerMeso as number) || 1) * 7 - 1));
  const current = running || (s.macrocycles as Macrocycle[]).slice(-1)[0];
  if (current) {
    s.currentMacroId = current.id;
    const next = getNextIncompleteSession(s, current);
    if (next) { s.currentWeek = next.week; s.currentDay = next.dayKey; }
  }
  return normaliseState(s);
}

function logSession(s: Loose, cache: TargetCache, persona: DemoPersona, m: Macrocycle, week: number, dayKey: string,
  date: string, R: () => number, lockBefore: Record<string, boolean>): void {
  const template: Loose[] = (s.exercises[`${m.id}_1_${dayKey}`] || []).slice().sort((a: Loose, b: Loose) => a.order - b.order);
  const cycleKey = m.id.replace(`macro_demo_${persona.key}_`, '');
  for (const ex of template) {
    const lockKey = getProgressionLockKey(m.id, dayKey, ex.id);
    const lockComingIn = s.progressionLocks[lockKey];
    lockBefore[`${lockKey}|${week}`] = !!lockComingIn;
    const p = computeExerciseProgression(s, cache, m, week, dayKey, ex,
      { lockComingIn, prevWasLocked: !!lockBefore[`${lockKey}|${week - 1}`] });
    const stalled = (persona.stalls || []).some(x => x.cycle === cycleKey && x.exercise === ex.name && week >= x.fromWeek);
    const misses = stalled || (week > 1 && R() < persona.missRate);
    for (let i = 0; i < p.sets; i++) {
      const w = parseFloat(p.weightPlaceholders[i] ?? p.weightPlaceholder);
      let reps = parseInt(String(p.repsPlaceholders[i] ?? p.repsPlaceholder), 10);
      if (misses && i === p.sets - 1) reps = Math.max(1, reps - (stalled ? 2 : 1));
      s.trainLogs[`${m.id}_${week}_${dayKey}_${ex.id}_${i}`] = { weight: w.toFixed(1), reps: String(reps), done: true };
    }
    const rec = recordExerciseHistory(s, { today: date }, m, week, dayKey, ex);
    if (rec) {
      if (!s.exerciseHistory[rec.name]) s.exerciseHistory[rec.name] = {};
      s.exerciseHistory[rec.name][rec.type] = rec.entry;
      if (rec.trackingMode) s.exerciseTrackingMode[rec.name] = rec.trackingMode;
    }
    const t = computeLockTransition(s, cache, m, week, dayKey, ex);
    if (t && 'set' in t) s.progressionLocks[t.key] = t.set;
    else if (t) delete s.progressionLocks[t.key];
  }
}
