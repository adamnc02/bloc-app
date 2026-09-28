#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-engine-golden.mjs — the engine's characterisation harness
//
// THE BUG THIS PREVENTS: an engine extraction that "only moves code" and
// quietly changes a number. PROMPT-03 Phase 2 lifts ~90 functions out of
// index.html into a shared TypeScript engine/ that BLOC and BLOC Coach both
// run, and BLOC's behaviour must stay byte-identical while it happens. Nothing
// else would notice a target that moved by 2.5 lb, a Home badge that turned
// red a day early, or a prompt that lost a line: every existing verify script
// tests a handful of rules, not the whole output.
//
// So this records what the CURRENT engine produces over the demo dataset
// (bloc-demo-data.json, anchored at Sunday 2 Aug 2026 as the Demo Tour is,
// TECHNICAL §35) into scripts/golden/engine-golden.json, and fails on any
// difference. TECHNICAL §118 has the full write-up.
//
//   node scripts/verify-engine-golden.mjs           compare against the golden file
//   node scripts/verify-engine-golden.mjs --write   regenerate it (a DELIBERATE change only)
//
// 🚨 THE TRAPS:
//   · Regenerating to make it pass. --write is for an intended behaviour
//     change, named in the PR — Phase 2's H7 (getActivityMultiplier reading
//     the date-active cycle) is the one planned. Anything else that moves is
//     a regression until proven otherwise.
//   · A pass that proves nothing. Two controls must CHANGE the output, or the
//     run fails: one edits a single input (a weigh-in), one edits a single
//     character of engine source. A harness that compares a value with
//     itself passes both of those silently; this one cannot.
//   · Real data. The golden file is generated from the demo dataset ONLY —
//     this repo is public. Never point it at a backup.
//   · Order. Several engine reads WRITE (getWeekTargets fills
//     progressionTargets, H2 in the deep dive). Each case group runs on a
//     fresh copy of the state, and records which top-level state keys it
//     changed ("mutates"), so Phase 2's pure cores can prove the BLOC
//     wrappers still write exactly what they wrote before.
//   · The clock. `new Date()` with no arguments and `Date.now()` are pinned to
//     noon on the case's anchor date, and TZ is Europe/London, so the file is
//     the same on a laptop and in CI.
//
// It extracts the REAL functions out of index.html with a lexer-aware
// extractor (scripts/golden/extract-engine.mjs) that follows references from
// the seed list below, so the closure is whatever the code actually calls.
// ═══════════════════════════════════════════════════════════════════════

process.env.TZ = 'Europe/London';

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mainScript, indexTopLevel, closure } from './golden/extract-engine.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const GOLDEN = join(here, 'golden', 'engine-golden.json');
// v8.32 (§122): functions move out of index.html into the shared engine, and
// index.html keeps a same-named shim calling window.BlocEngine. So the harness
// runs the COMMITTED build too, exactly as the browser does, with the same
// pinned Date and stub document. The golden file itself never changes for a move.
const ENGINE_DIST = readFileSync(join(repo, 'engine', 'dist', 'bloc-engine.js'), 'utf8');
const WRITE = process.argv.includes('--write');
const ANCHOR = '2026-08-02';                                 // the demo dataset's "today" (§35)
const ANCHORS = ['2026-07-12', '2026-08-02', '2026-09-20'];   // mid-cycle, anchor, after the cycle ends (13 Sep)

let failures = 0;
function check(label, ok, detail) {
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok && detail) console.log(`    ${detail}`);
}

// ── The engine ───────────────────────────────────────────────────────────
// Seeds: the deep dive §10 step 0 list, PROMPT-03 1a's additions (RPE, the
// measurement due rule), and the rest of the deep dive §1 inventory that
// Phase 2 moves. The extractor pulls in everything they call.
const SEEDS = [
  'ensureStateDefaults',
  // nutrition, TDEE, insights
  'buildDayMap', 'calcDynamicTDEE', 'calcDynamicTDEE_rawLogPair', 'calcTrendBasedTDEE', 'calcMifflinBMR',
  'calcAge', 'getActivityMultiplier', 'computeWeeklyInsights', 'computeSafetyFloor',
  'computeMaintenanceRecalibration', 'getSustainableWeightRange', 'recommendNextCycle', 'findPeakWindow',
  // Home
  'renderHomeThisWeek', 'getReconciledMacroAdvice', 'getHomeMetricSublabel', 'getWeeklyRequiredDaily',
  // progression
  'getWeekTargets', 'getWeekComplianceResult', 'getSessionPreviewTarget', 'getLastCompliantWeek',
  'computeRawSuggestedTargets', 'getWeekSets', 'getWeekWeight', 'getWeekReps',
  // sessions and volume
  'getAllMacroSessions', 'getNextIncompleteSession', 'getMacroVolumeSeries', 'getMacroTotalVolume',
  'getSessionVolume', 'getSelectedTrainWeekDates', 'getTrainAgendaUnits',
  // AI prompts and their inputs
  'buildBlocAdvicePrompt', 'buildBlocChallengePrompt', 'buildNextCycleAdvicePrompt',
  'computeCycleReviewPayload', 'buildCycleReviewPrompt', 'computeCheckinState', 'isCycleReviewDue',
  'isInFinalWeek', 'isNextCycleAdviceEligible', 'nextCycleAdvicePlanMode', 'buildNextCycleGoalSteps',
  'materialiseDates', 'extractJsonObject',
  // RPE (TECHNICAL §104) and its mirror rows
  'isRpeOn', 'rpeDrivesProgression', 'getRpeStep', 'computeRpeStepKind', 'getProgressionStep',
  'buildRpePromptSummary', 'syncBuildExerciseIdContext', 'syncRowsExerciseRatings',
  // measurements (§103) — Coach's "Measurements not in"
  'getMeasurementStatus',
  // dates, goals, cycles
  'getLocalToday', 'getDateActiveMacroId', 'getActiveGoal', 'getGoalForDate', 'getGoalForDay',
  'getMacroDurationWeeks', 'getMacroEndDate', 'getNextMacroStart', 'getNextMonday', 'getSundayAfterWeeks', 'getMondayAfter',
  'getDayBefore', 'findMacroClash', 'buildGoalShiftPlan', 'isLocalDevHost',
];
// Defined by the harness instead of extracted: persistence, and the DOM.
const STUBS = new Set(['save']);
// Globals the harness sets and reads back.
const HANDLES = ['state', '_tourAnchorDate', '_homeHeroCache', '_nextCycleOverride', '_nextCyclePreviewMacroId'];

function buildEngine(src, engineDist = ENGINE_DIST) {
  const { decls } = indexTopLevel(src);
  const parts = closure(decls, SEEDS, STUBS);
  const names = new Set(parts.map(p => p.name));
  const handles = HANDLES.filter(h => names.has(h));
  const body = `
    let __saves = 0;
    function save() { __saves++; }
    ${parts.map(p => p.text).join('\n')}
    return {
      fns: { ${SEEDS.join(', ')} },
      get: { ${handles.map(h => `${h}: () => ${h}`).join(', ')} },
      set: { ${handles.map(h => `${h}: v => { ${h} = v; }`).join(', ')} },
      saves: () => __saves,
    };`;
  // The engine build is evaluated in its OWN function: it opens with "use
  // strict", which must not spill into the (sloppy, as in the browser)
  // index.html code the way it would if the two were concatenated.
  const loadEngine = (Date, document) => new Function('Date', 'document', `${engineDist}\nreturn BlocEngine;`)(Date, document);
  return { size: parts.length, make: (Date, document) =>
    new Function('Date', 'document', 'BlocEngine', body)(Date, document, loadEngine(Date, document)) };
}

// `new Date()` / `Date.now()` pinned to noon on the anchor; every other form
// of the constructor is the real one.
function fixedDate(anchor) {
  const ms = new Date(`${anchor}T12:00:00`).getTime();
  return class FixedDate extends Date {
    constructor(...a) { if (a.length === 0) super(ms); else super(...a); }
    static now() { return ms; }
  };
}

function makeDocument() {
  // ensureStateDefaults sets the theme on <body>; renderHomeThisWeek writes one element.
  const els = {};
  const bodyAttrs = {};
  return { els, bodyAttrs, body: { setAttribute: (k, v) => { bodyAttrs[k] = String(v); } },
    getElementById: id => (els[id] ||= { id, innerHTML: '' }) };
}

// ── Serialising outputs faithfully ───────────────────────────────────────
// JSON drops undefined, turns NaN into null and a Date into a string that
// hides its type; any of those could hide a change. Keys are sorted, because
// key order is not behaviour and Phase 2's TypeScript may build objects in a
// different order.
function canon(v) {
  if (v === undefined) return '__undefined';
  if (typeof v === 'number') return Number.isNaN(v) ? '__NaN' : Number.isFinite(v) ? v : (v > 0 ? '__Infinity' : '__-Infinity');
  if (typeof v === 'function') return '__function';
  if (v instanceof Date) return `__Date:${Number.isNaN(v.getTime()) ? 'Invalid' : v.toISOString()}`;
  if (v instanceof Set) return { __Set: [...v].map(canon) };
  if (v instanceof Map) return { __Map: [...v].map(([k, x]) => [canon(k), canon(x)]) };
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = canon(v[k]);
    return out;
  }
  return v;
}
const hash = v => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);

// ── Fixtures ─────────────────────────────────────────────────────────────
const demo = JSON.parse(readFileSync(join(repo, 'bloc-demo-data.json'), 'utf8'));

// The demo dataset has no ratings, and RPE is off unless macro.rpe is set
// (§104). This variant switches it on and rates one session per mesocycle in
// a fixed pattern, so every RPE branch (easy, hard, the middle, a skip) is in
// the golden file. Built here, from the demo data, never from real data.
function withRpe(s) {
  const macro = s.macrocycles[0];
  macro.rpe = true;
  s.rpe = {};
  const pattern = [{ rpe: 5 }, { rpe: 9 }, { rpe: 7 }, { rpeSkipped: true }, { rpe: 6 }, { rpe: 10 }, { rpe: 8 }];
  let n = 0;
  for (const key of Object.keys(s.exercises).sort()) {
    const dayKey = key.slice((macro.id + '_1_').length);
    for (const ex of s.exercises[key]) {
      for (let week = 1; week <= 12; week++) {
        if ((week + ex.id.length) % 3 !== 0) continue;
        s.rpe[`${macro.id}_${week}_${dayKey}_${ex.id}`] = pattern[n++ % pattern.length];
      }
    }
  }
  return s;
}

const SCENARIOS = {
  demo: s => s,
  // No cached targets: every target is computed from the logs, not read back.
  'demo-cold': s => { s.progressionTargets = {}; s.progressionLocks = {}; return s; },
  'demo-rpe': s => { withRpe(s); s.progressionTargets = {}; s.progressionLocks = {}; return s; },
  // v8.35 H7 (§126): the person has BROWSED back to an older, lighter cycle
  // (2 sessions a week, finished in April), so state.currentMacroId points at
  // it while the calendar is in the demo cycle. Before H7 the activity
  // multiplier read the browsed cycle; now it reads the calendar's. Added in
  // H7's own commit, with the one deliberate regeneration of this file.
  'demo-browsed': s => {
    s.macrocycles.push({ id: 'golden-past', name: 'Golden past', start: '2026-03-02', weeks: 3, weeksPerMeso: 2,
      sessionsPerWeek: 2, goalType: 'gain', days: ['session0'], useMicrocycles: true });
    s.currentMacroId = 'golden-past';
    return s;
  },
};

// ── The cases ────────────────────────────────────────────────────────────
// Each returns plain data. `E` is a fresh engine whose `state` is a freshly
// normalised copy of the scenario, with the clock at `anchor`.
const macroOf = E => E.get.state().macrocycles[0];
const dayKeys = (E, macro) => Object.keys(E.get.state().exercises)
  .filter(k => k.startsWith(macro.id + '_1_')).map(k => k.slice((macro.id + '_1_').length)).sort();
const weeksOf = (E, macro) => E.fns.getMacroDurationWeeks(macro);

function datesAround(anchor, before, after) {
  const out = [];
  for (let k = -before; k <= after; k++) {
    const d = new Date(`${anchor}T12:00:00`); d.setDate(d.getDate() + k);
    out.push(d.toLocaleDateString('en-CA'));
  }
  return out;
}

const CASES = {
  // State normalisation (becomes normaliseState in Phase 2, H5).
  normalise: { scenarios: ['demo'], anchors: [ANCHOR], run: (E, raw) => {
    const s = E.get.state();
    const changed = {};
    for (const k of Object.keys(s).sort()) if (JSON.stringify(s[k]) !== JSON.stringify(raw[k])) changed[k] = s[k];
    return { changedOrAdded: changed, keys: Object.keys(s).sort(), hash: hash(canon(s)) };
  } },

  nutrition: { scenarios: ['demo', 'demo-browsed'], run: E => {
    const m = macroOf(E);
    const ins = E.fns.computeWeeklyInsights(m);
    return {
      dayMap: E.fns.buildDayMap(),
      tdee: E.fns.calcDynamicTDEE(), tdeeRawLogPair: E.fns.calcDynamicTDEE_rawLogPair(),
      trendTdee: E.fns.calcTrendBasedTDEE(), bmr: E.fns.calcMifflinBMR(),
      age: E.fns.calcAge(E.get.state().profile && E.get.state().profile.birthday),
      activityMultiplier: E.fns.getActivityMultiplier(),
      insights: ins, safetyFloor: E.fns.computeSafetyFloor(m),
      maintenanceRecalibration: E.fns.computeMaintenanceRecalibration(m, ins),
      sustainableRange: E.fns.getSustainableWeightRange(),
      peakWindow: { loss: E.fns.findPeakWindow(E.fns.buildDayMap(), 'loss'), gain: E.fns.findPeakWindow(E.fns.buildDayMap(), 'gain') },
    };
  } },

  nextCycle: { scenarios: ['demo', 'demo-browsed'], run: E => {
    const m = macroOf(E);
    const rec = E.fns.recommendNextCycle(m);
    const out = { rec, eligible: E.fns.isNextCycleAdviceEligible(m, rec), planMode: E.fns.nextCycleAdvicePlanMode(rec),
      goalSteps: rec ? E.fns.buildNextCycleGoalSteps(rec) : null };
    for (const [name, override] of Object.entries({ target: { targetWeight: 160 }, deadline: { deadline: '2026-10-20' }, beyond: { targetWeight: 90 } })) {
      out['override_' + name] = E.fns.recommendNextCycle(m, override);
    }
    return out;
  } },

  // The full-week Home badges: renderHomeThisWeek's own orchestration, run
  // for every day of the anchor's week, read back from _homeHeroCache.
  homeWeek: { anchors: datesAround(ANCHOR, 6, 0), run: (E, raw, doc) => {
    E.fns.renderHomeThisWeek();
    const c = E.get._homeHeroCache();
    const fields = ['kcal', 'protein', 'carbs', 'steps'];
    return {
      cache: c, html: doc.els['home-this-week'] && doc.els['home-this-week'].innerHTML,
      reconciled: c && E.fns.getReconciledMacroAdvice(c.dayMap, c.weekStart, c.today, c.goal),
      sublabels: c && fields.map(f => E.fns.getHomeMetricSublabel(f, c.dayMap, c.weekStart, c.today, c.goal && c.goal[f], '', c.goal && c.goal.kcal)),
      required: c && fields.map(f => E.fns.getWeeklyRequiredDaily(f, c.dayMap, c.weekStart, c.today, c.goal && c.goal[f], c.goal && c.goal.kcal)),
    };
  } },

  // Every (week, day, exercise): the target, the compliance result and the
  // Train preview, in the order Train would reach them.
  targets: { scenarios: ['demo', 'demo-cold', 'demo-rpe'], anchors: [ANCHOR], run: E => {
    const m = macroOf(E);
    const s = E.get.state();
    const rows = {};
    const weeks = weeksOf(E, m);
    for (let week = 1; week <= weeks; week++) {
      for (const dk of dayKeys(E, m)) {
        for (const ex of (s.exercises[`${m.id}_1_${dk}`] || [])) {
          rows[`${week}_${dk}_${ex.id}`] = {
            sets: E.fns.getWeekSets(ex, week, m.weeks),
            weight: E.fns.getWeekWeight(ex, week, 'weight', m.goalType, m.weightIncrement),
            reps: E.fns.getWeekReps(ex, week, 'reps', m.goalType),
            targets: E.fns.getWeekTargets(m, week, dk, ex),
            compliance: E.fns.getWeekComplianceResult(m, week, dk, ex),
            preview: E.fns.getSessionPreviewTarget(m, week, dk, ex),
            raw: E.fns.computeRawSuggestedTargets(m, week, dk, ex),
            lastCompliant: E.fns.getLastCompliantWeek(m, dk, ex, week),
            rpeStep: E.fns.getRpeStep(m, week, dk, ex), rpeKind: E.fns.computeRpeStepKind(m, week, dk, ex),
            step: E.fns.getProgressionStep(m, week, dk, ex),
          };
        }
      }
    }
    return { weeks, rows, cacheAfter: s.progressionTargets, locksAfter: s.progressionLocks };
  } },

  sessions: { run: E => {
    const m = macroOf(E);
    const s = E.get.state();
    return {
      all: E.fns.getAllMacroSessions(m), next: E.fns.getNextIncompleteSession(m),
      agenda: E.fns.getTrainAgendaUnits(m),
      volumeSeries: E.fns.getMacroVolumeSeries(m), totalVolume: E.fns.getMacroTotalVolume(m),
      sessionVolume: dayKeys(E, m).map(dk => [dk, E.fns.getSessionVolume(m, s.currentWeek, dk)]),
      selectedWeekDates: E.fns.getSelectedTrainWeekDates(m),
    };
  } },

  prompts: { scenarios: ['demo', 'demo-browsed'], run: E => {
    const m = macroOf(E);
    const rec = E.fns.recommendNextCycle(m);
    const payload = E.fns.computeCycleReviewPayload(m);
    return {
      advice: E.fns.buildBlocAdvicePrompt(m),
      challenge: E.fns.buildBlocChallengePrompt(m, 'I think my protein target is too high for my training days.'),
      nextCycle: rec ? E.fns.buildNextCycleAdvicePrompt(m, rec, 'Holiday in the second week.', null) : null,
      cycleReviewPayload: payload,
      cycleReview: E.fns.buildCycleReviewPrompt(m, payload, [], []),
      checkin: E.fns.computeCheckinState(m),
      reviewDue: E.fns.isCycleReviewDue(m), finalWeek: E.fns.isInFinalWeek(m),
      rpeSummary: E.fns.buildRpePromptSummary(m),
    };
  } },

  rpe: { scenarios: ['demo', 'demo-rpe'], anchors: [ANCHOR], run: E => {
    const m = macroOf(E);
    const s = E.get.state();
    const coached = { ...m, rpe: true };
    return {
      isRpeOn: E.fns.isRpeOn(m), drives: E.fns.rpeDrivesProgression(m),
      // Phase 4 makes Coached mode return false here (ratings inform the coach
      // only); today there is no coached flag, so a coach-created cycle
      // (rpe on) drives progression like any other.
      drivesWhenOn: E.fns.rpeDrivesProgression(coached), drivesWhenAbsent: E.fns.rpeDrivesProgression({ ...m, rpe: undefined }),
      ratings: s.rpe || {},
      mirrorRows: E.fns.syncRowsExerciseRatings('user-golden', E.fns.syncBuildExerciseIdContext()),
    };
  } },

  measurements: { anchors: [ANCHOR], run: E => {
    const s = E.get.state();
    const out = {};
    for (const d of datesAround(ANCHOR, 21, 21)) out[d] = E.fns.getMeasurementStatus(s.bodyLogs, s.macrocycles, d);
    out.noLogs = E.fns.getMeasurementStatus([], s.macrocycles, ANCHOR);
    out.nextCycleSoon = E.fns.getMeasurementStatus(s.bodyLogs, [...s.macrocycles, { start: '2026-08-03' }], ANCHOR);
    return out;
  } },

  dates: { run: E => {
    const m = macroOf(E);
    const s = E.get.state();
    const goalDates = {};
    for (const d of datesAround(ANCHOR, 70, 21).filter((_, i) => i % 3 === 0)) {
      goalDates[d] = { forDate: E.fns.getGoalForDate(d, m.id), forDay: E.fns.getGoalForDay(d) };
    }
    const clashCandidate = { id: 'golden-new', start: '2026-07-20', weeks: 4, weeksPerMeso: 1 };
    return {
      today: E.fns.getLocalToday(), dateActive: E.fns.getDateActiveMacroId(), activeGoal: E.fns.getActiveGoal(),
      goalDates, macroEnd: E.fns.getMacroEndDate(m), nextMacroStart: E.fns.getNextMacroStart(),
      nextMonday: E.fns.getNextMonday(), sundayAfter6: E.fns.getSundayAfterWeeks(m.start, 6),
      mondayAfter: E.fns.getMondayAfter('2026-08-02'), dayBefore: E.fns.getDayBefore('2026-08-01'),
      clash: E.fns.findMacroClash(clashCandidate, s.macrocycles, null),
      noClash: E.fns.findMacroClash({ ...clashCandidate, start: '2026-09-07' }, s.macrocycles, null),
      shiftPlan: E.fns.buildGoalShiftPlan(m, { start: '2026-06-15' }, s.goals, E.fns.getLocalToday()),
      materialised: E.fns.materialiseDates([{ kcal: 2000, weeks: 2 }, { kcal: 2200, weeks: 3 }], m),
    };
  } },

  pure: { anchors: [ANCHOR], scenarios: ['demo'], run: E => ({
    localDevHosts: Object.fromEntries(['localhost', '127.0.0.1', '::1', '[::1]', '127.4.5.6', 'mac.local', '10.0.0.3',
      '192.168.0.42', '172.16.9.9', '172.32.0.1', '169.254.1.1', 'adamnc02.github.io', 'localhost.evil.com',
      '192.168.0.42.evil.com', ''].map(h => [h, E.fns.isLocalDevHost(h)])),
    json: ['{"a":1}', 'Here you go: {"a":{"b":[1,2]}} thanks', '```json\n{"x":"y"}\n```', 'no json', '{"a": "}"}']
      .map(t => { try { return E.fns.extractJsonObject(t); } catch (e) { return `__throws:${e.message}`; } }),
  }) },
};

// ── Running ──────────────────────────────────────────────────────────────
function runAll(engine, mutateRaw) {
  const out = {};
  for (const [caseName, c] of Object.entries(CASES)) {
    const scenarios = c.scenarios || ['demo'];
    const anchors = c.anchors || ANCHORS;
    for (const sc of scenarios) {
      for (const anchor of anchors) {
        const raw = SCENARIOS[sc](JSON.parse(JSON.stringify(demo)));
        if (mutateRaw) mutateRaw(raw);
        const doc = makeDocument();
        const E = engine.make(fixedDate(anchor), doc);
        E.set.state(JSON.parse(JSON.stringify(raw)));
        E.set._tourAnchorDate(anchor);
        E.fns.ensureStateDefaults();
        const before = E.get.state();
        const beforeKeys = Object.fromEntries(Object.keys(before).map(k => [k, JSON.stringify(before[k])]));
        let value;
        try { value = canon(c.run(E, raw, doc)); }
        catch (e) { value = `__throws:${e.message}`; }
        const after = E.get.state();
        const mutates = Object.keys(after).filter(k => JSON.stringify(after[k]) !== beforeKeys[k]).sort();
        out[`${caseName} · ${sc} · ${anchor}`] = { value, mutates, saves: E.saves() };
      }
    }
  }
  return out;
}

function firstDiff(a, b, path = '') {
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const d = firstDiff(a[k], b[k], `${path}.${k}`);
      if (d) return d;
    }
  }
  const show = v => { const t = JSON.stringify(v); return t === undefined ? 'missing' : t.length > 140 ? t.slice(0, 140) + '…' : t; };
  return `${path || '(root)'}: golden ${show(a)}, now ${show(b)}`;
}

const source = mainScript(readFileSync(join(repo, 'index.html'), 'utf8'));
const engine = buildEngine(source);
console.log(`  engine closure: ${engine.size} top-level declarations from ${SEEDS.length} seeds`);
const current = runAll(engine);

const throwing = Object.entries(current).filter(([, r]) => typeof r.value === 'string' && r.value.startsWith('__throws:'));
check('no case throws', throwing.length === 0, throwing.map(([k, r]) => `${k}: ${r.value}`).slice(0, 5).join('\n    '));

if (WRITE) {
  const file = {
    _about: 'Golden outputs of the BLOC engine over bloc-demo-data.json. Generated by scripts/verify-engine-golden.mjs --write; see TECHNICAL §118. Demo data only: never regenerate from a real backup.',
    _source: { demoDataSha256: createHash('sha256').update(readFileSync(join(repo, 'bloc-demo-data.json'))).digest('hex'), closure: engine.size, seeds: SEEDS.length },
    cases: current,
  };
  // One run per line: small enough to commit, and a git diff still names the
  // runs that moved (the harness itself prints the exact path).
  const lines = Object.entries(file.cases).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`);
  writeFileSync(GOLDEN, `{\n "_about": ${JSON.stringify(file._about)},\n "_source": ${JSON.stringify(file._source)},\n "cases": {\n${lines.join(',\n')}\n }\n}\n`);
  console.log(`  wrote ${GOLDEN.slice(repo.length + 1)}: ${Object.keys(current).length} cases`);
} else {
  const golden = JSON.parse(readFileSync(GOLDEN, 'utf8'));
  const demoSha = createHash('sha256').update(readFileSync(join(repo, 'bloc-demo-data.json'))).digest('hex');
  check('bloc-demo-data.json is the file the golden outputs were recorded from', golden._source.demoDataSha256 === demoSha,
    'the demo data changed — that changes every output. Regenerate deliberately (--write) and say so in the PR.');
  const names = new Set([...Object.keys(golden.cases), ...Object.keys(current)]);
  const byGroup = {};
  for (const k of names) (byGroup[k.split(' · ')[0]] ||= []).push(k);
  for (const [group, keys] of Object.entries(byGroup)) {
    const diffs = keys.map(k => [k, firstDiff(golden.cases[k], current[k])]).filter(([, d]) => d);
    check(`${group}: ${keys.length} run(s) match the golden outputs`, diffs.length === 0,
      diffs.slice(0, 3).map(([k, d]) => `${k} → ${d}`).join('\n    '));
  }

  // ── Controls: each must CHANGE the output ────────────────────────────────
  // 1. One input: the anchor day's weigh-in, 2 lb heavier.
  const heavier = runAll(engine, raw => {
    const log = raw.bodyLogs.filter(l => l.weight && l.date <= ANCHOR).sort((a, b) => a.date < b.date ? -1 : 1).pop();
    log.weight = String(Number(log.weight) + 2);
  });
  const moved1 = Object.keys(current).filter(k => JSON.stringify(current[k]) !== JSON.stringify(heavier[k]));
  check(`control (data): one weigh-in 2 lb heavier changes the output (${moved1.length} runs moved)`,
    moved1.some(k => k.startsWith('nutrition ·')) && moved1.some(k => k.startsWith('prompts ·')));

  // 2. One character of engine source: the weight-increment step in
  //    getWeekWeight. Proves a code change is caught, not just a data change.
  //    v8.34 (§124): getWeekWeight moved to the engine, and index.html keeps
  //    only a shim, so the edit is made in the BUILD. Patching index.html's
  //    shim would change nothing (the §123 rule: a control that patches a
  //    moved function moves with it). A missing function or a changed
  //    expression leaves `patched` equal to the original and fails this.
  const fnStart = ENGINE_DIST.indexOf('function getWeekWeight(');
  const fnText = fnStart < 0 ? '' : ENGINE_DIST.slice(fnStart, ENGINE_DIST.indexOf('\n  }', fnStart) + 4);
  const patched = fnText.replace(/\(week - 1\)/, '(week - 0)');
  const moved2 = fnText && patched !== fnText ? (() => {
    const alt = runAll(buildEngine(source, ENGINE_DIST.replace(fnText, patched)));
    return Object.keys(current).filter(k => JSON.stringify(current[k]) !== JSON.stringify(alt[k]));
  })() : [];
  check(`control (code): a one-character edit to the engine's getWeekWeight changes the output (${moved2.length} runs moved)`,
    moved2.some(k => k.startsWith('targets ·')));

  // 3. One character of the ENGINE BUILD (v8.32, §122): proves the harness
  //    runs engine/dist/bloc-engine.js, not a stale copy of the old in-place
  //    code. The `rpe` default (one of the two the demo data relies on)
  //    becomes an array.
  const patchedDist = ENGINE_DIST.replace('if (!s.rpe) s.rpe = {};', 'if (!s.rpe) s.rpe = [];');
  const moved3 = patchedDist !== ENGINE_DIST ? (() => {
    const alt = runAll(buildEngine(source, patchedDist));
    return Object.keys(current).filter(k => JSON.stringify(current[k]) !== JSON.stringify(alt[k]));
  })() : [];
  check(`control (engine): a one-character edit to the engine build changes the output (${moved3.length} runs moved)`,
    moved3.some(k => k.startsWith('normalise ·')));
}

console.log(failures ? `\n✗ ${failures} check(s) failed` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
