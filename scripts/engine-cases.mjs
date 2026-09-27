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
const demo = () => JSON.parse(readFileSync(join(repo, 'bloc-demo-data.json'), 'utf8'));
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

