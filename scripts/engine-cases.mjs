// ═══════════════════════════════════════════════════════════════════════
// scripts/engine-cases.mjs — the inputs every step-3 engine export is run
// over (PROMPT-03 Phase 2, TECHNICAL §124). Not a verify script itself (the
// sweep's glob is verify*.mjs); imported by:
//   · verify-engine-pure.mjs   — the engine never writes to them, never reads
//                                the clock;
//   · verify-engine-leaves.mjs — v8.33's functions and today's shims give the
//                                same answer for every one.
//
// Each case is a FUNCTION returning a fresh argument list, so no run can see
// another's objects. Cover the branches, not just the happy path: adding a
// function to the engine means adding its cases here.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEMO_TEXT = readFileSync(join(repo, 'bloc-demo-data.json'), 'utf8');
const demo = () => JSON.parse(DEMO_TEXT); // a fresh copy each call
const ctx = today => ({ today });
const macroOf = () => demo().macrocycles[0];

/** Names whose engine signature gained a trailing EngineContext; BLOC's shim keeps the old one. */
export const CTX_LAST = new Set(['macroRange', 'findMacroClash']);

export const LEAF_CASES = {
  // Dates.
  snapToNextMonday: [() => ['2026-10-25'], () => ['2026-10-26'], () => ['2026-03-28']],
  getDayBefore: [() => ['2026-03-30'], () => ['2026-10-26']],
  shiftDateStr: [() => ['2026-10-19', 7], () => ['2026-03-30', -7]],
  dayDiff: [() => ['2026-10-19', '2026-10-26'], () => ['2026-03-23', '2026-03-30']],
  // A macro's shape: plain, extended by whole and partial mesocycles, no microcycles.
  getMacroExtensionInfo: [() => [macroOf()], () => [extMacro(4)], () => [extMacro(3)]],
  getMacroEffectiveMesoCount: [() => [macroOf()], () => [extMacro(3)]],
  isMesoMicroValid: [() => [extMacro(3), 8, 2], () => [extMacro(3), 7, 2], () => [macroOf(), 1, 1]],
  getMacroSessionDayKeys: [() => [macroOf()], () => [{ id: 'x', useMicrocycles: false, days: ['a', 'b'] }], () => [{ id: 'x' }]],
  // Progression, over every exercise type the demo has.
  getWeekSets: [() => [exOf(), 3, 6], () => [exOf(), 9, 6], () => [exOf(), 1, 1]],
  getWeekWeight: [() => [exOf(), 4, 'weight', 'loss', '2.5'], () => [{ ...exOf(), isHeavyLeg: true }, 4, 'weight', 'gain'],
    () => [exOf(), 4, 'weight', 'maintenance', '2.5'], () => [exOf(), 4, 'reps', 'loss', '2.5']],
  getWeekReps: [() => [{ ...exOf(), reps: '8–10' }, 3, 'reps', 'loss'], () => [{ ...exOf(), reps: '8' }, 3, 'reps', 'gain'],
    () => [exOf(), 3, 'reps', 'maintenance'], () => [{ ...exOf(), reps: 'AMRAP' }, 3, 'reps', 'loss']],
  getGiantSetProgression: [() => [{ ...exOf(), type: 'pause', reps: '12' }, 3, 'loss'], () => [{ ...exOf(), type: 'giant', reps: '20' }, 3, 'loss'],
    () => [{ ...exOf(), type: 'giant', reps: '20' }, 3, 'maintenance']],
  getDeloadUnitKey: [() => [macroOf(), 2, 'pushm2'], () => [{ id: 'x', useMicrocycles: false }, 2, 'push']],
  getPrevTrackUnit: [() => [macroOf(), 1, 'pushm1'], () => [macroOf(), 3, 'pushm2']],
  roundToIncrement: [() => [61.3, 2.5], () => [61.3, 0]],
  getPrevCalendarWeek: [() => [macroOf(), 2, 'pushm2'], () => [macroOf(), 2, 'pushm1'], () => [macroOf(), 1, 'pushm1'],
    () => [{ id: 'x', useMicrocycles: false }, 2, 'push']],
  getProgressionLockKey: [() => ['m1', 'pushm1', 'ex1']],
  getProgKey: [() => ['m1', 3, 'pushm1', 'ex1']],
  parseRepsForVolume: [() => ['6-8'], () => [null], () => [12], () => ['none']],
  // Nutrition and next cycle, over a hand-built day map (buildDayMap moves in step 4).
  avgDayMapField: [() => [dayMap(), 'steps', '2026-07-27', '2026-08-02'], () => [dayMap(), 'kcal', '2026-07-27', '2026-08-02'],
    () => [dayMap(), 'kcal', '2027-01-01', '2027-01-07']],
  findPeakWindow: [() => [dayMap(), 'loss'], () => [dayMap(), 'gain'], () => [{}, 'loss']],
  computeTaperCurve: [() => [200, 12], () => [180, 1], () => [0, 8]],
  resolveNextCycleOverride: [
    () => [200, 'loss', { floor: 170, ceiling: 230, source: 'confirmed' }, '2026-08-03', { targetWeight: 160 }],             // beyond the floor
    () => [200, 'loss', { floor: 170, ceiling: 230 }, '2026-08-03', { targetWeight: 185 }],                                  // weight only
    () => [200, 'gain', { floor: 170, ceiling: 230 }, '2026-08-03', { deadline: '2026-10-07' }],                             // deadline only, snapped
    () => [200, 'loss', { floor: 170, ceiling: 230 }, '2026-08-03', { targetWeight: 180, deadline: '2026-08-30' }],          // too fast
    () => [200, 'loss', { floor: 170, ceiling: 230 }, '2026-08-03', { targetWeight: 197, deadline: '2026-11-29' }],          // fine
    () => [200, 'loss', { floor: 170, ceiling: 230 }, '2026-08-03', null],
  ],
  buildReverseDietRows: [() => [1800, 2400, 100], () => [2400, 2400, 100], () => [0, 2400, 100]],
  buildDirectionSteppedRamp: [() => [2600, 1900, 2400, 12, 'loss', 2000], () => [2200, 2700, 2400, 9, 'gain', null], () => [0, 1, 1, 1, 'loss']],
  // Prompt text and response parsing.
  buildSignalPeriods: [() => [buckets(), 0], () => [[], 0]],
  formatSignalPeriodsForPrompt: [
    () => [{ signalPeriods: [{ type: 'flat', startLabel: 'W2', endLabel: 'W3', length: 2, confirmed: true, avgKcalDuring: 2100 },
      { type: 'moving', startLabel: 'W4', endLabel: 'W4', length: 1, confirmed: false, avgKcalDuring: null }],
      activePeriod: { type: 'flat', startLabel: 'W2', endLabel: 'W3', length: 2 }, activePeriodIsOngoing: false }],
    () => [{ signalPeriods: [{ type: 'flat', startLabel: 'W2', endLabel: 'W3', length: 2, confirmed: true, avgKcalDuring: 2100 }],
      activePeriod: { type: 'flat', startLabel: 'W2', endLabel: 'W3', length: 2 }, activePeriodIsOngoing: true }],
    () => [null],
  ],
  extractJsonObject: [() => ['Let me search.\n```json\n{"a":{"b":"x}"}}\n```'], () => ['no json'], () => ['{"a":'], () => [null]],
  condenseBlocAdvicePlans: [() => [adviceResponse()], () => [null]],
  condenseBlocAdviceEntry: [() => [{ response: adviceResponse(), storedAt: '2026-08-02', chosenPath: 'sustainable' }],
    () => [{ response: adviceResponse(), storedAt: '2026-08-02', revisionInfo: { originalSummary: { sustainable: 'x' }, acknowledgment: 'fair' } }],
    () => [{}]],
  formatPriorAdviceEntry: [() => [{ date: '2026-08-02', why: 'w', sustainable: 's', aggressive: '', chosenPath: 'sustainable', chosenAt: '2026-08-03' }, 0],
    () => [{ date: '2026-08-02', why: 'w', revisedFrom: { sustainable: 'a' }, revisionReason: 'r', sustainable: 's' }, 1]],
  buildCycleReviewPrompt: [() => [macroOf(), reviewPayload(), [{ mediaType: 'image/jpeg', base64: 'AAAA' }], [{ mediaType: 'image/jpeg', base64: 'BBBB' }]],
    () => [macroOf(), { ...reviewPayload(), weeklyAverages: [], weeklySwings: [], bestLifts: [], priorReviews: [], finalDaySubstitutions: {} }, [], []]],
  // Home's weekly pace: mid-week with today logged and not, the final day, and the reconciliation's two branches.
  getHomeIsoDow: [() => ['2026-08-02'], () => ['2026-07-27']],
  isCompleteNutritionDay: [() => [{ hasNutr: true, kcal: 1500 }, 2000], () => [{ hasNutr: true, kcal: 1800 }, 2000], () => [{ hasNutr: true, kcal: 1 }, null], () => [null, 2000]],
  getWeeklyRequiredDaily: [() => ['kcal', dayMap(), '2026-07-27', '2026-07-30', 2000, 2000], () => ['steps', dayMap(), '2026-07-27', '2026-07-31', 10000],
    () => ['kcal', dayMap(), '2026-07-27', '2026-08-02', 2000, 2000], () => ['kcal', dayMap(), '2026-07-27', '2026-07-30', null, 2000]],
  computeWeekPlannedAvg: [() => ['steps', dayMap(), '2026-07-27', '2026-07-30', goalOf()], () => ['kcal', dayMap(), '2026-07-27', '2026-07-30', goalOf()],
    () => ['kcal', {}, '2026-07-27', '2026-07-26', { kcal: 2000 }], () => ['kcal', dayMap(), '2026-07-27', '2026-07-30', null]],
  formatAdviceSublabel: [() => [2150.4, 2000, ' kcal', '2026-07-30', 4, false], () => [2000.2, 2000, ' kcal', '2026-07-30', 4, true],
    () => [2150, 2000, ' kcal', '2026-08-02'], () => [9500, 10000, ' steps', '2026-07-29']],
  getHomeMetricSublabel: [() => ['protein', dayMap(), '2026-07-27', '2026-07-30', 180, 'g', 2000], () => ['protein', dayMap(), '2026-07-27', '2026-07-30', null, 'g', 2000]],
  getReconciledMacroAdvice: [() => [dayMap(), '2026-07-27', '2026-07-30', goalOf()], () => [dayMap(), '2026-07-27', '2026-07-30', { ...goalOf(), kcal: 1200, protein: 250 }],
    () => [dayMap(), '2026-07-27', '2026-07-30', { kcal: 2000 }]],
  RECONCILE_CARBS_FLOOR: [], RECONCILE_FATS_FLOOR: [], RECONCILE_PROTEIN_MAX_DROP: [], RECONCILE_KCAL_MAX_OVERSHOOT: [], // numbers: nothing to call
  // Cycle date ranges. An unstarted macro is where ctx matters.
  macroRange: [() => [macroOf(), ctx('2026-08-02')], () => [{ id: 'x', weeks: 4 }, ctx('2026-08-02')]],
  findMacroClash: [() => [{ id: 'n', start: '2026-09-07', weeks: 4 }, demo().macrocycles, 'n', ctx('2026-08-02')],
    () => [{ id: 'n', start: '2027-06-07', weeks: 4 }, demo().macrocycles, null, ctx('2026-08-02')], () => [{ id: 'n' }, null, null, ctx('2026-08-02')]],
  buildGoalShiftPlan: [() => [macroOf(), { start: shiftFrom(macroOf().start, 14) }, demo().goals, '2026-08-02'],
    () => [macroOf(), { start: macroOf().start }, demo().goals, '2026-08-02'],
    () => [macroOf(), { start: shiftFrom(macroOf().start, -7) }, [...demo().goals, { macroId: 'other', startDate: '1900-01-01', endDate: '2999-01-01' }], '2026-08-02']],
  // The dev-bypass predicate, lookalikes included.
  isLocalDevHost: [() => ['localhost'], () => ['192.168.0.42'], () => ['192.168.0.42.evil.com'], () => ['adamnc02.github.io'], () => [undefined]],
};

// ── v8.35 (§125): step 4 onwards, functions that read the state ─────────────
// Each case returns { s, today, engine, bloc }:
//   · s       the state, built fresh for every call;
//   · today   the day it is (EngineContext.today; BLOC's clock is pinned to it);
//   · engine  the argument list for BlocEngine.<name>, built from THIS `s`;
//   · bloc    { fn?, args, globals?, read? } — the BLOC call that must behave
//             exactly as v8.34's did: index.html's function `fn` (default: the
//             same name) with global `state = s`, the named page globals set,
//             and `read` globals compared afterwards. null = engine only (a new
//             capability BLOC doesn't use), checked for purity only.
// verify-engine-leaves.mjs runs `bloc` against v8.34 (8c6451c) and today, and
// compares the result, the state afterwards, the save() count, the `read`
// globals and any HTML written. verify-engine-pure.mjs runs `engine`.
export const STATE_CASES = {};
const state = (fn = x => x) => () => fn(full(demo()));
const at = (stateFn, today, f) => () => { const s = stateFn(); return { s, today, ...f(s, ctx(today)) }; };
const DAYS = ['2026-06-01', '2026-06-08', '2026-07-12', '2026-08-02', '2026-09-08', '2026-09-13', '2026-09-20'];
const add = (name, list) => { (STATE_CASES[name] ||= []).push(...list); };
const eachDay = (stateFn, f, days = DAYS) => days.map(d => at(stateFn, d, f));

// The states: the demo as loaded, then variants that reach the other branches.
const S = {
  demo: state(),
  gain: state(s => { s.macrocycles[0].goalType = 'gain'; return s; }),
  maint: state(s => {
    s.macrocycles[0].goalType = 'maintenance';
    s.insightsRollup = { completedCycles: [rolled('Bulk', 'gain', 3)] };
    return s;
  }),
  maintNoHistory: state(s => { s.macrocycles[0].goalType = 'maintenance'; return s; }),
  // Qualifying maintenance cycles in the rollup (getSustainableWeightRange's
  // "confirmed" branch), the last one a cut.
  rollup: state(s => {
    s.insightsRollup = { completedCycles: [rolled('Maint A', 'maintenance', 4), rolled('Maint B', 'maintenance', 3, 190, 191), rolled('Cut', 'loss', 1)] };
    return s;
  }),
  // A reviewed past cycle, a second reviewed one, and a future one. Both extra
  // cycles train 4 days a week like the demo, so the activity multiplier is
  // the same whichever cycle is read (H7 moves only what it should).
  history: state(s => {
    s.macrocycles.push(
      { id: 'past1', name: 'Bulk 2026', start: '2026-02-02', weeks: 6, weeksPerMeso: 2, sessionsPerWeek: 4, goalType: 'gain', days: ['a'],
        review: { complianceScore: 7, bodyfatEstimate: { direction: 'up' }, weightTargetDelta: 1.5, highlights: ['h'], improvements: ['i'] } },
      { id: 'past0', name: 'Cut 2025', start: '2025-09-01', weeks: 8, sessionsPerWeek: 4, goalType: 'loss', days: ['a'],
        review: { complianceScore: 9, weightTargetDelta: null } },
      { id: 'next', name: 'Next', start: '2026-10-05', weeks: 4, sessionsPerWeek: 4, goalType: 'maintenance', days: ['a'] });
    return s;
  }),
  // Stored check-in advice, with and without a chosen path, and a nextCheckIn
  // far enough out to be capped at the 14-day fallback.
  advice: state(s => { s.blocAdvice = { macroId: s.macrocycles[0].id, storedAt: '2026-07-27', chosenPath: null,
    response: { nextCheckIn: { sustainable: '2026-08-10', aggressive: '2026-09-30' } } }; return s; }),
  adviceChosen: state(s => { s.blocAdvice = { macroId: s.macrocycles[0].id, storedAt: '2026-07-27', chosenPath: 'aggressive',
    response: { nextCheckIn: { sustainable: '2026-08-10', aggressive: '2026-08-03' } } }; return s; }),
  // A drop set and more deloads, for volume and the deload walk.
  training: state(s => {
    const key = Object.keys(s.exercises).find(k => k.endsWith('session1m1'));
    const ex = s.exercises[key][0];
    ex.type = 'dropset';
    for (let set = 0; set < 3; set++) Object.assign(s.trainLogs[`${s.macrocycles[0].id}_2_session1m1_${ex.id}_${set}`] ||= {},
      { weight: '60', reps: '8', dropWeight: '40', dropReps: '6-8', done: true });
    s.deloads[`${s.macrocycles[0].id}_3_m1`] = true;
    return s;
  }),
  // Almost nothing: the early returns and null paths.
  empty: () => full({ macrocycles: [{ id: 'e', start: '2026-07-06', weeks: 4, goalType: 'loss', days: ['a'] }], currentMacroId: 'e',
    exercises: {}, trainLogs: {}, bodyLogs: [], nutritionLogs: [], goals: [], nutritionMeals: {} }),
  // A cycle with no start (BLOC can't create one; the engine must still not read the clock).
  noStart: state(s => { delete s.macrocycles[0].start; return s; }),
  // The final day with nothing logged yet (the review's substitutions).
  finalDayUnlogged: state(s => {
    s.bodyLogs.push({ date: '2026-09-07', weight: 211.2, steps: 9100 }, { date: '2026-09-09', weight: 210.8, steps: 9900 });
    s.nutritionLogs.push({ date: '2026-09-08', kcal: 1900, protein: 200, carbs: 120, fats: 60 }, { date: '2026-09-10', kcal: 1850, protein: 190, carbs: 110, fats: 55 });
    return s;
  }),
};
const m0 = s => s.macrocycles[0];
const X = x => x; // an argument that's the same on both sides

// Cycles and goals.
for (const st of [S.demo, S.history, S.empty]) {
  add('getDateActiveMacroId', eachDay(st, (s, c) => ({ engine: [s, c], bloc: { args: [] } })));
  add('getNextMacroStart', eachDay(st, (s, c) => ({ engine: [s, c], bloc: { args: [] } })));
  add('getActiveGoal', eachDay(st, (s, c) => ({ engine: [s, c], bloc: { args: [] } })));
}
add('getNextMacroStart', [at(state(s => { s.macrocycles = []; return s; }), '2026-08-05', (s, c) => ({ engine: [s, c], bloc: { args: [] } })),
  at(S.noStart, '2026-08-05', (s, c) => ({ engine: [s, c], bloc: { args: [] } }))]);
add('getGoalForDate', ['2026-06-07', '2026-06-08', '2026-07-12', '2026-07-13', '2026-09-13', '2026-09-14'].flatMap(d => [
  at(S.demo, '2026-08-02', s => ({ engine: [s, d, m0(s).id], bloc: { args: [d, m0(s).id] } })),
  at(S.demo, '2026-08-02', s => ({ engine: [s, d, 'nope'], bloc: { args: [d, 'nope'] } }))]));
add('getGoalForDay', ['2026-06-07', '2026-07-12', '2026-07-13', '2026-09-14'].map(d =>
  at(S.demo, '2026-08-02', s => ({ engine: [s, d], bloc: { args: [d] } }))));
add('materialiseDates', eachDay(S.demo, (s, c) => {
  const goals = [{ kcal: 2000, protein: 180, carbs: 190, weeks: 2 }, { kcal: 2200, protein: 180, carbs: 220, startDate: '2026-08-17', endDate: '2026-08-30' }, { kcal: 900, protein: 200, carbs: 100 }];
  return { engine: [goals, m0(s), c], bloc: { args: [goals, m0(s)] } };
}, ['2026-08-02', '2026-08-05']));
for (const st of [S.demo, S.noStart]) {
  add('isCycleReviewDue', eachDay(st, (s, c) => ({ engine: [m0(s), c], bloc: { args: [m0(s)] } })));
  add('isInFinalWeek', eachDay(st, (s, c) => ({ engine: [m0(s), c], bloc: { args: [m0(s)] } })));
}
add('isCycleReviewDue', [at(S.demo, '2026-08-02', (s, c) => ({ engine: [null, c], bloc: { args: [null] } }))]);
add('isInFinalWeek', [at(S.demo, '2026-08-02', (s, c) => ({ engine: [null, c], bloc: { args: [null] } }))]);
add('resolveProgressMacro', [
  at(S.history, '2026-08-02', s => ({ engine: [s, 'past1'], bloc: { args: [], globals: { progressViewMacroId: 'past1' }, read: ['progressViewMacroId'] } })),
  at(S.history, '2026-08-02', s => ({ engine: [s, s.currentMacroId], bloc: { args: [], globals: { progressViewMacroId: 'gone' }, read: ['progressViewMacroId'] } })),
  at(S.history, '2026-08-02', s => ({ engine: [s, s.currentMacroId], bloc: { args: [], globals: { progressViewMacroId: null }, read: ['progressViewMacroId'] } })),
]);

// Training reads.
for (const st of [S.demo, S.training]) {
  const s0 = st(), m = m0(s0);
  for (const dk of ['session0m1', 'session1m1', 'session1m2', 'session3m2']) {
    for (const w of [1, 2, 3, 4, 6, 7]) {
      add('isDeloadUnit', [at(st, '2026-08-02', s => ({ engine: [s, m0(s), w, dk], bloc: { args: [m0(s), w, dk] } }))]);
      add('isFirstUnitAfterDeload', [at(st, '2026-08-02', s => ({ engine: [s, m0(s), w, dk], bloc: { args: [m0(s), w, dk] } }))]);
      add('getSessionVolume', [at(st, '2026-08-02', s => ({ engine: [s, m0(s), w, dk], bloc: { args: [m0(s), w, dk] } }))]);
    }
  }
  void m;
  add('getMacroTotalVolume', [at(st, '2026-08-02', s => ({ engine: [s, m0(s)], bloc: { args: [m0(s)] } }))]);
  add('getAllMacroSessions', [at(st, '2026-08-02', s => ({ engine: [s, m0(s)], bloc: { args: [m0(s)] } }))]);
  add('getNextIncompleteSession', [at(st, '2026-08-02', s => ({ engine: [s, m0(s)], bloc: { args: [m0(s)] } }))]);
}
add('getNextIncompleteSession', [at(state(s => { for (const k of Object.keys(s.trainLogs)) s.trainLogs[k].done = true; return s; }), '2026-08-02',
  s => ({ engine: [s, m0(s)], bloc: { args: [m0(s)] } }))]);
add('getMacroVolumeSeries', [S.demo, S.training, S.noStart].flatMap(st => ['2026-08-02', '2026-09-20'].map(d =>
  at(st, d, (s, c) => ({ engine: [s, m0(s), c], bloc: { args: [m0(s)] } })))));
add('getSelectedTrainWeekDates', [[1, 'session0m1'], [1, 'session0m2'], [5, 'session2m2'], [7, 'session3m1']].map(([w, dk]) =>
  at(state(s => { s.currentWeek = w; s.currentDay = dk; return s; }), '2026-08-02', s => ({ engine: [m0(s), w, dk], bloc: { args: [m0(s)] } }))));
add('getSelectedTrainWeekDates', [at(S.noStart, '2026-08-02', s => ({ engine: [m0(s), 1, 'session0m1'], bloc: { args: [m0(s)] } })),
  at(state(s => { m0(s).weeksPerMeso = 1; s.currentDay = 'session0m2'; return s; }), '2026-08-02', s => ({ engine: [m0(s), s.currentWeek, s.currentDay], bloc: { args: [m0(s)] } }))]);
add('getTrainAgendaUnits', [S.demo, S.training, S.noStart].flatMap(st => DAYS.map(d =>
  at(st, d, (s, c) => ({ engine: [s, c, m0(s), { week: s.currentWeek, dayKey: s.currentDay }], bloc: { args: [m0(s)] } })))));
add('getTrainAgendaUnits', [at(S.demo, '2026-08-02', (s, c) => ({ engine: [s, c, m0(s), null], bloc: null })),
  at(state(s => { m0(s).weeksPerMeso = 1; return s; }), '2026-08-02', (s, c) => ({ engine: [s, c, m0(s), { week: s.currentWeek, dayKey: s.currentDay }], bloc: { args: [m0(s)] } })),
  at(state(s => { m0(s).useMicrocycles = false; return s; }), '2026-08-02', (s, c) => ({ engine: [s, c, m0(s), { week: 1, dayKey: 'x' }], bloc: null }))]);

// Nutrition, TDEE and insights, across the cycle's life and every goal type.
const NUTRITION_STATES = [S.demo, S.gain, S.maint, S.maintNoHistory, S.rollup, S.empty, S.finalDayUnlogged];
for (const st of NUTRITION_STATES) {
  add('buildDayMap', [at(st, '2026-08-02', s => ({ engine: [s], bloc: { args: [] } }))]);
  add('getSustainableWeightRange', [at(st, '2026-08-02', s => ({ engine: [s], bloc: { args: [] } }))]);
  add('getActivityMultiplier', [at(st, '2026-08-02', s => ({ engine: [s], bloc: { args: [] } }))]);
  for (const name of ['calcMifflinBMR', 'calcTrendBasedTDEE', 'calcDynamicTDEE', 'calcDynamicTDEE_rawLogPair']) {
    add(name, eachDay(st, (s, c) => ({ engine: [s, c], bloc: { args: [] } })));
  }
  for (const name of ['computeWeeklyInsights', 'computeSafetyFloor', 'computeCheckinState']) {
    add(name, eachDay(st, (s, c) => ({ engine: [s, c, m0(s)], bloc: { args: [m0(s)] } })));
  }
  add('recommendNextCycle', eachDay(st, (s, c) => ({ engine: [s, c, m0(s), undefined], bloc: { args: [m0(s)] } })));
}
add('buildDayMap', [at(state(s => { s.nutritionMeals = { '2026-08-03': { breakfast: [{ kcal: 400, protein: 30.6, carbs: 40.4, fats: 10.5 }], lunch: null },
  '2026-08-04': { dinner: [{ kcal: 0, protein: 0 }] } }; return s; }), '2026-08-02', s => ({ engine: [s], bloc: { args: [] } }))]);
add('calcMifflinBMR', [at(state(s => { s.profile.gender = 'female'; return s; }), '2026-08-02', (s, c) => ({ engine: [s, c], bloc: { args: [] } })),
  at(state(s => { delete s.profile.heightCm; return s; }), '2026-08-02', (s, c) => ({ engine: [s, c], bloc: { args: [] } }))]);
// The birthday: the day before, on, and after it, and 29 February.
add('calcAge', ['2026-02-08', '2026-02-09', '2026-02-10', '2027-02-28', '2027-03-01'].flatMap(d => ['1995-02-09', '2000-02-29', null].map(b =>
  at(S.demo, d, (s, c) => ({ engine: [b, c], bloc: { args: [b] } })))));
for (const st of [S.demo, S.gain, S.maint, S.maintNoHistory, S.empty]) {
  add('computeSafetyFloor', [at(st, '2026-08-02', (s, c) => ({ engine: [s, c, null], bloc: { args: [null] } }))]);
  add('computeWeeklyInsights', [at(st, '2026-08-02', (s, c) => ({ engine: [s, c, null], bloc: { args: [null] } }))]);
}
add('computeCheckinState', [S.advice, S.adviceChosen].flatMap(st => eachDay(st, (s, c) => ({ engine: [s, c, m0(s)], bloc: { args: [m0(s)] } }),
  ['2026-08-02', '2026-08-05', '2026-08-12'])));
add('computeCheckinState', [at(S.demo, '2026-08-02', (s, c) => ({ engine: [s, c, null], bloc: { args: [null] } }))]);
// The maintenance recalibration: only on an active maintenance cycle, and only
// on a real trend; a gaining and a losing variant.
const trending = dir => state(s => {
  s.macrocycles[0].goalType = 'maintenance';
  s.bodyLogs.forEach((l, i) => { l.weight = 205 + dir * i * 0.25; });
  return s;
});
for (const st of [S.demo, S.maint, trending(1), trending(-1)]) {
  add('computeMaintenanceRecalibration', eachDay(st, (s, c) => {
    const ins = insightsLike(s);
    return { engine: [s, c, m0(s), ins], bloc: { args: [m0(s), ins] } };
  }));
}
// The recommendation's overrides: a target, a deadline, one beyond the floor, a forced direction.
const OVERRIDES = [{ targetWeight: 160 }, { deadline: '2026-10-20' }, { targetWeight: 90 }, { targetWeight: 205, deadline: '2026-11-29' },
  { forcedDirection: 'gain' }, { forcedDirection: 'loss', targetWeight: 200 }];
for (const st of [S.demo, S.gain, S.maint, S.maintNoHistory]) {
  add('recommendNextCycle', OVERRIDES.map(o => at(st, '2026-09-08', (s, c) => ({ engine: [s, c, m0(s), structuredClone(o)], bloc: { args: [m0(s), structuredClone(o)] } }))));
}
add('recommendNextCycle', [
  at(S.demo, '2026-08-02', (s, c) => ({ engine: [s, c, null], bloc: { args: [null] } })),
  at(state(s => { s.macrocycles[0]._synthetic = { startKcal: 1700, depthBandOverride: 'aggressive' }; return s; }), '2026-08-02', (s, c) => ({ engine: [s, c, m0(s)], bloc: { args: [m0(s)] } })),
  at(state(s => { Object.assign(s.macrocycles[0], { goalType: 'gain', _synthetic: { totalGain: 6, gainRatePerWeek: 0.5, surplus: 600 } }); return s; }), '2026-08-02',
    (s, c) => ({ engine: [s, c, m0(s), { targetWeight: 200 }], bloc: { args: [m0(s), { targetWeight: 200 }] } })),
  at(S.noStart, '2026-08-02', (s, c) => ({ engine: [s, c, m0(s)], bloc: { args: [m0(s)] } })),
]);
// Goal steps, eligibility and plan mode are judged on a recommendation: build
// several (every goal type, with overrides) through BLOC's own function first.
const recs = () => [
  { goalType: 'maintenance', latestBw: 212.4, newMacroStart: '2026-09-14', bridge: { fullRows: [{ week: 1, kcal: 1900 }, { week: 2, kcal: 2025 }, { week: 3, kcal: 2150, isHoldWeek: true }, { week: 4, kcal: 2150, isHoldWeek: true }] } },
  { goalType: 'loss', latestBw: 212.4, newMacroStart: '2026-09-14', directionRamp: [{ startWeek: 1, endWeek: 1, kcal: 2100 }, { startWeek: 2, endWeek: 4, kcal: 1950 }] },
  { goalType: 'gain', latestBw: null, newMacroStart: '2026-09-14', dynResult: { tdee: 2600 }, placeholderWeeks: 12 },
  { goalType: 'loss', newMacroStart: '2026-09-14', recentKcal: 1800, newMacroEnd: '2026-11-08' },
  { goalType: 'loss', newMacroStart: '2026-09-14', _llmGoals: [{ kcal: 1, startDate: 'x' }] },
  { goalType: 'loss', isContinuation: true, continuationAlternative: { goalType: 'maintenance' }, needsDirectionChoice: false },
  { goalType: 'loss', isContinuation: true, continuationAlternative: null },
  { goalType: 'gain', needsDirectionChoice: true },
  { goalType: 'loss', overrideConflict: { type: 'x' } },
  null, {},
];
recs().forEach((_, i) => {
  add('buildNextCycleGoalSteps', i < 5 ? eachDay(S.demo, (s, c) => ({ engine: [s, c, recs()[i]], bloc: { args: [recs()[i]] } }), ['2026-07-12', '2026-09-08']) : []);
  for (const today of ['2026-08-02', '2026-08-24', '2026-09-08', '2026-09-20']) {
    for (const preview of [null, 'other']) {
      add('isNextCycleAdviceEligible', [at(S.demo, today, (s, c) => ({ engine: [c, m0(s), recs()[i], preview], bloc: { args: [m0(s), recs()[i]], globals: { _nextCyclePreviewMacroId: preview } } }))]);
    }
  }
  for (const override of [null, {}, { deadline: '2026-10-20' }, { targetWeight: 190 }]) {
    add('nextCycleAdvicePlanMode', [at(S.demo, '2026-08-02', () => ({ engine: [recs()[i], structuredClone(override)], bloc: { args: [recs()[i]], globals: { _nextCycleOverride: structuredClone(override) } } }))]);
  }
});
add('isNextCycleAdviceEligible', [at(S.demo, '2026-08-02', (s, c) => ({ engine: [c, null, recs()[0], null], bloc: { args: [null, recs()[0]] } }))]);

// The cycle review.
for (const st of [S.demo, S.history, S.training, S.finalDayUnlogged, S.empty]) {
  for (const name of ['computeCycleWeeklySwings', 'computeCycleMeasurements', 'computeCycleReviewPayload']) {
    add(name, eachDay(st, (s, c) => ({ engine: [s, c, m0(s)], bloc: { args: [m0(s)] } }), ['2026-08-02', '2026-09-13', '2026-09-20']));
  }
  add('computeCycleBestLifts', [at(st, '2026-08-02', s => ({ engine: [s, m0(s)], bloc: { args: [m0(s)] } }))]);
  add('getPriorCycleReviews', [at(st, '2026-09-20', (s, c) => ({ engine: [s, c, m0(s).id], bloc: { args: [m0(s).id] } })),
    at(st, '2026-09-20', (s, c) => ({ engine: [s, c, 'past1'], bloc: { args: ['past1'] } }))]);
}

// Home: the badge, the tolerance, and the whole week (through
// renderHomeThisWeek, whose HTML and _homeHeroCache must not change).
for (const f of ['kcal', 'protein', 'carbs', 'steps', 'fats', 'other']) add('getHomeMetricTolerance', [at(S.demo, '2026-08-02', () => ({ engine: [f], bloc: { args: [f] } }))]);
const WEEK = ['2026-07-27', '2026-07-28', '2026-07-29', '2026-07-30', '2026-07-31', '2026-08-01', '2026-08-02'];
for (const f of ['kcal', 'protein', 'carbs', 'steps']) {
  for (const avg of [null, 1500, 1990, 2000, 2010, 2100, 9000, 11000]) {
    for (const today of ['2026-07-29', '2026-08-02']) {
      add('getHomeMetricBadge', [
        at(S.demo, today, () => ({ engine: [f, avg, 2000, dayMap(), '2026-07-27', today, 2000], bloc: { args: [f, avg, 2000, dayMap(), '2026-07-27', today, 2000] } })),
        at(S.demo, today, () => ({ engine: [f, avg, 2000, null, null, null], bloc: { args: [f, avg, 2000, null, null, null] } })),
      ]);
    }
  }
  add('getHomeMetricBadge', [at(S.demo, '2026-08-02', () => ({ engine: [f, 1800, null, dayMap(), '2026-07-27', '2026-08-02'], bloc: { args: [f, 1800, null, dayMap(), '2026-07-27', '2026-08-02'] } })),
    at(S.demo, '2026-07-29', () => ({ engine: [f, 1800, 2000, dayMap(), '2026-07-27', '2026-07-29', 2000, true], bloc: null }))]);
}
for (const st of [S.demo, S.gain, S.empty, state(s => { s.goals = []; return s; })]) {
  add('computeHomeWeek', [...WEEK, '2026-06-08', '2026-09-14'].map(d =>
    at(st, d, (s, c) => ({ engine: [s, c], bloc: { fn: 'renderHomeThisWeek', args: [], read: ['_homeHeroCache'] } }))));
  add('computeHomeWeek', ['2026-07-29', '2026-08-02'].map(d => at(st, d, (s, c) => ({ engine: [s, c, { weekClosed: true }], bloc: null }))));
}
add('SAVE_DAY_TOLERANCE', []); add('HOME_STEPS_TOLERANCE', []); add('HOME_METRIC_POLARITY', []); // constants: nothing to call

// ── Fixtures ──────────────────────────────────────────────────────────────
function exOf() {
  const all = Object.values(demo().exercises).flat();
  return all.find(e => e && e.type === 'standard' && e.startWeight) || all[0];
}
function extMacro(extensionWeeks) { return { ...macroOf(), weeks: 8, weeksPerMeso: 2, extensionWeeks, useMicrocycles: true }; }
function shiftFrom(s, days) { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + days); return d.toLocaleDateString('en-CA'); }
function dayMap() {
  // Mon 27 Jul – Sun 2 Aug 2026, plus the week before: weights falling,
  // steps and nutrition on most days, one light day that isn't "complete".
  const m = {};
  const days = ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25', '2026-07-26',
    '2026-07-27', '2026-07-28', '2026-07-29', '2026-07-30', '2026-07-31', '2026-08-01', '2026-08-02'];
  days.forEach((d, i) => {
    m[d] = { weight: i % 3 === 2 ? null : 200 - i * 0.4, steps: i % 4 === 3 ? null : 8000 + i * 150,
      hasNutr: i !== 5, kcal: i === 9 ? 900 : 1900 + (i % 3) * 120, protein: 170 + (i % 4) * 5, carbs: 180, fats: 60 };
  });
  return m;
}
function goalOf() { return { kcal: 2000, protein: 180, carbs: 190, fats: 65, steps: 10000 }; }
function buckets() {
  return [0, -1.2, 0.2, -0.3, -1.0, -0.9, 0.1, null].map((delta, i) => ({ label: `W${i + 1}`, bStart: `2026-06-${String(i + 1).padStart(2, '0')}`,
    bEnd: `2026-06-${String(i + 7).padStart(2, '0')}`, delta, avgKcal: i % 3 ? 2000 + i * 10 : null }));
}
function adviceResponse() {
  return { primaryAction: 'Hold kcal', recommendations: { sustainable: { goals: [{ kcal: 2000, protein: 180, carbs: 190, steps: 10000, startDate: '2026-08-03', endDate: '2026-08-16' }] },
    aggressive: { goals: [{ kcal: 1800, protein: 185, carbs: 150, startDate: '2026-08-03', endDate: '2026-08-16' }] } } };
}
function reviewPayload() {
  return { macroName: 'Cut', goalType: 'loss', start: '2026-06-01', end: '2026-08-02',
    weeklyAverages: [{ label: 'W1', bStart: '2026-06-01', bEnd: '2026-06-07', avgWeight: 200.25, avgKcal: 2000, avgProtein: 180, avgCarbs: null, avgSteps: 9000 }],
    weeklySwings: [{ label: 'W1', weight: { min: 1, max: 2 }, kcal: { min: 50, max: 50 }, steps: { min: null, max: null }, protein: { min: -5, max: 10 } }],
    measurements: { startWeight: 200, endWeight: 190, totalWeightChange: -10, targetWeight: 188, weightTargetDelta: 2, startWaist: 36, endWaist: 34.5, startHip: null, endHip: null },
    bestLifts: [{ name: 'Bench', startWeight: 60, endWeight: 70, pctIncrease: 17 }],
    priorReviews: [{ name: 'Bulk', goalType: 'gain', start: '2026-01-05', end: '2026-03-29', complianceScore: 8, bodyfatDirection: null, weightTargetDelta: null }],
    finalDaySubstitutions: { kcal: 2000, protein: 180, carbs: 190, steps: 9500, weight: 190.2 } };
}
// The state as BLOC holds it after load(): the demo file carries every
// normaliseState default except these two.
function full(s) {
  if (!s.rpe) s.rpe = {};
  if (!Array.isArray(s.nextCycleAdviceHistory)) s.nextCycleAdviceHistory = [];
  for (const k of ['exerciseHistory', 'exerciseTrackingMode', 'deloads', 'progressionLocks', 'progressionTargets', 'supersets', 'nutritionQuickLog'])
    if (!s[k]) s[k] = {};
  if (!s.insightsRollup) s.insightsRollup = { completedCycles: [] };
  if (!s.profile) s.profile = {};
  if (s.blocAdvice === undefined) s.blocAdvice = null;
  return s;
}
// A rollup entry of the shape updateInsightsRollup() writes.
function rolled(name, goalType, plateauWeeksDetected, startBw = 205, endBw = 203) {
  return { name, goalType, start: '2025-01-06', end: '2025-03-02', startBw, endBw, avgKcal: 2300, plateauWeeksDetected };
}
// Enough of computeWeeklyInsights' shape for the recalibration to read: the
// weekly averages from the state's own logs (so a trend really is a trend).
function insightsLike(s) {
  const byWeek = {};
  for (const l of s.bodyLogs) { const w = weekOf(l.date); (byWeek[w] ||= { w: [], k: [] }).w.push(Number(l.weight)); }
  for (const l of s.nutritionLogs) { const w = weekOf(l.date); (byWeek[w] ||= { w: [], k: [] }).k.push(Number(l.kcal)); }
  return { weekBuckets: Object.keys(byWeek).sort().map(w => ({ bStart: w,
    avgWeight: byWeek[w].w.length ? byWeek[w].w.reduce((a, b) => a + b, 0) / byWeek[w].w.length : null,
    avgKcal: byWeek[w].k.length ? Math.round(byWeek[w].k.reduce((a, b) => a + b, 0) / byWeek[w].k.length) : null,
    nutrDayCount: byWeek[w].k.length })) };
}
function weekOf(date) { const d = new Date(date + 'T12:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toLocaleDateString('en-CA'); }

