#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-rpe-progression.mjs
//
// THE RULES THIS PROTECTS (v8.20, TECHNICAL §104):
//   · compliant + RPE ≤ 6 → next mesocycle's step is doubled (2× increment,
//     heavy-leg 1.5×, +2 reps, giant +20);
//   · compliant + RPE 9–10 → next mesocycle holds (no step), for one
//     mesocycle only;
//   · anything else — 7–8, a skip, a miss, a deload either side, maintenance,
//     cardio, ratings switched off — changes nothing;
//   · each microcycle track reads only its own rating (dayKey carries m1/m2).
//
// 🚨 THE TRAPS:
//   · A frozen target must stay frozen. progressionTargets caches the target a
//     week was first judged against (§12, v7.57); a rating given or edited
//     AFTER that must not change the target, nor the step Train displays.
//   · Closing the rating sheet stores { rpeSkipped: true } — never a number.
//   · An absent macro.rpe is OFF. Existing cycles must not start asking.
//   · With no ratings, targets must be byte-identical to v8.19 — checked by
//     running the v8.19 engine (commit d3c824f, what was live before this
//     change) side by side over the same scenarios.
//   · Maintenance look-ahead must not climb (also v8.20): getWeekWeight /
//     getWeekReps / getGiantSetProgression used to add the increment every
//     week on a maintenance cycle whenever there was no log to build on.
//
// It extracts the REAL functions out of index.html and runs them against a
// shared stub `state`.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import './engine-global.mjs'; // v8.34 (§124): the progression leaves are shims calling BlocEngine

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const source = readFileSync(join(repo, 'index.html'), 'utf8');
const V819 = 'd3c824f';
let oldSource = null;
try {
  oldSource = execFileSync('git', ['show', `${V819}:index.html`], { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
} catch (e) {
  console.error(`✗ FAIL: could not read index.html at ${V819} (the v8.19 control). Run from a full clone.`);
  process.exit(1);
}

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) console.log(`    expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function extractFrom(src, marker, optional = false) {
  const start = src.indexOf(marker);
  if (start === -1) {
    if (optional) return '';
    console.error(`✗ FAIL: ${marker} not found.`);
    process.exit(1);
  }
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  return null;
}
function extractLine(src, marker, optional = false) {
  const i = src.indexOf(marker);
  if (i === -1) { if (optional) return ''; console.error(`✗ FAIL: ${marker} not found.`); process.exit(1); }
  return src.slice(i, src.indexOf('\n', i));
}

const ENGINE = ['getDeloadUnitKey', 'isDeloadUnit', 'getPrevTrackUnit', 'getPrevCalendarWeek',
  'isFirstUnitAfterDeload', 'getWeekSets', 'getWeekWeight', 'getWeekReps', 'getGiantSetProgression',
  'parseRepsForVolume', 'getProgKey', 'getProgressionLockKey', 'getLastCompliantWeek',
  'computeRawSuggestedTargets', 'getWeekTargets', 'getWeekComplianceResult', 'evaluateProgressionLock'];
const RPE = ['getRpeKey', 'isRpeOn', 'rpeDrivesProgression', 'rpeStepFromKind', 'computeRpeStepKind',
  'getRpeStep', 'getProgressionStep', 'bumpRepsBy', 'getRpeSessionExercises', 'isTrainSessionComplete',
  'maybeOpenRpeSheet', 'closeRpeSheet', 'buildRpePromptSummary', 'buildRpeTagsHtml',
  'getMacroExtensionInfo', 'getMacroEffectiveMesoCount', 'isMesoMicroValid',
  'roundToIncrement', 'getSessionPreviewTarget'];

function build(src, withRpe) {
  const fns = ENGINE.map(n => extractFrom(src, `function ${n}(`));
  if (withRpe) {
    // v8.35 (§125): RPE_STEP_NONE / PROG_STEP_MAINTENANCE moved into the
    // engine with the functions that read them; the shims read the targets
    // through progressionTargetCache(), BLOC's view of state.progressionTargets.
    RPE.forEach(n => fns.push(extractFrom(src, `function ${n}(`)));
    fns.push(extractFrom(src, 'function progressionTargetCache('));
  }
  const body = `
    let state = null;
    let rpeSheetCtx = null;
    const calls = { openModal: [], closeModal: [], save: 0, render: 0 };
    const save = () => { calls.save++; };
    const openModal = id => calls.openModal.push(id);
    const closeModal = id => calls.closeModal.push(id);
    const renderTrainDay = () => { calls.render++; };
    const renderRpeSheet = () => {};
    const refreshTrainRpeRowSub = (macroId, week, dayKey) => { calls.rowRefresh = (calls.rowRefresh || 0) + 1; };
    const openRpeSheet = (macroId, week, dayKey) => { rpeSheetCtx = { macroId, week, dayKey }; openModal('modal-rpe'); };
    const trainViewCoachOwned = () => false; // v8.42 (§136): Solo here; verify-coached-sessions.mjs covers the coach's session
    ${fns.join('\n')}
    return {
      setState: s => { state = s; rpeSheetCtx = null; calls.openModal = []; calls.closeModal = []; calls.save = 0; },
      getState: () => state, calls, setCtx: c => { rpeSheetCtx = c; },
      ${[...ENGINE, ...(withRpe ? RPE : [])].join(', ')}
    };`;
  return new Function(body)();
}

const E = build(source, true);
const OLD = build(oldSource, false);

// ── Fixtures ─────────────────────────────────────────────────────────────
const clone = o => JSON.parse(JSON.stringify(o));
function makeState({ goalType = 'loss', rpe = true, micro = false, exs, logs = {}, ratings = {}, deloads = {}, weeks = 6 }) {
  const macro = { id: 'mc', goalType, weightIncrement: '2.5', weeks, weeksPerMeso: 1,
    useMicrocycles: micro, days: ['push'], start: '2026-09-07' };
  if (rpe !== undefined && rpe !== 'absent') macro.rpe = rpe;
  const exercises = {};
  const dayKeys = micro ? ['pushm1', 'pushm2'] : ['push'];
  dayKeys.forEach(dk => { exercises['mc_1_' + dk] = clone(exs); });
  return { macrocycles: [macro], exercises, trainLogs: clone(logs), rpe: clone(ratings),
    deloads: clone(deloads), progressionLocks: {}, progressionTargets: {} };
}
const bench = { id: 'bench', name: 'Bench press', type: 'standard', startWeight: 60, reps: '8', setsStart: 3, setsEnd: 3, order: 1 };
const squat = { id: 'squat', name: 'Squat', type: 'standard', startWeight: 100, reps: '5', setsStart: 3, setsEnd: 3, order: 2, isHeavyLeg: true };
const giant = { id: 'gs', name: 'Giant curls', type: 'giant', startWeight: 10, reps: '20', setsStart: 2, setsEnd: 2, order: 3 };
const rangeEx = { id: 'row', name: 'Row', type: 'standard', startWeight: 50, reps: '8–10', setsStart: 2, setsEnd: 2, order: 4 };
const bike = { id: 'bike', name: 'Bike', category: 'cardio', type: 'standard', startWeight: 0, reps: '0', setsStart: 1, setsEnd: 1, order: 5 };

// Log every set of (week, dayKey, ex) as done at the given weight/reps.
function logEx(logs, week, dayKey, ex, weight, reps) {
  for (let s = 0; s < ex.setsStart; s++) logs[`mc_${week}_${dayKey}_${ex.id}_${s}`] = { weight: String(weight), reps: String(reps), done: true };
  return logs;
}
const macroOf = st => st.macrocycles[0];
const target = (eng, st, week, dayKey, ex) => {
  eng.setState(st);
  return eng.getWeekTargets(macroOf(st), week, dayKey, ex);
};
const w0 = t => t.weightTargets[0];
const r0 = t => t.repsTargets[0];

// ── isRpeOn: absent is OFF ───────────────────────────────────────────────
check('isRpeOn: absent → off (existing cycles never start asking)', E.isRpeOn({ id: 'x' }), false);
check('isRpeOn: true → on', E.isRpeOn({ rpe: true }), true);
check('isRpeOn: false → off', E.isRpeOn({ rpe: false }), false);
check('isRpeOn: the string "true" is not on', E.isRpeOn({ rpe: 'true' }), false);

// ── Weight track ─────────────────────────────────────────────────────────
const w1Bench = logEx({}, 1, 'push', bench, 60, 8);
check('no rating → +2.5 (normal)', w0(target(E, makeState({ exs: [bench], logs: w1Bench }), 2, 'push', bench)), '62.5');
check('rated 5 → double step +5', w0(target(E, makeState({ exs: [bench], logs: w1Bench, ratings: { mc_1_push_bench: { rpe: 5 } } }), 2, 'push', bench)), '65.0');
check('rated 6 → double step (≤ 6 inclusive)', w0(target(E, makeState({ exs: [bench], logs: w1Bench, ratings: { mc_1_push_bench: { rpe: 6 } } }), 2, 'push', bench)), '65.0');
check('rated 7 → normal', w0(target(E, makeState({ exs: [bench], logs: w1Bench, ratings: { mc_1_push_bench: { rpe: 7 } } }), 2, 'push', bench)), '62.5');
check('rated 8 → normal', w0(target(E, makeState({ exs: [bench], logs: w1Bench, ratings: { mc_1_push_bench: { rpe: 8 } } }), 2, 'push', bench)), '62.5');
check('rated 9 → hold at last week', w0(target(E, makeState({ exs: [bench], logs: w1Bench, ratings: { mc_1_push_bench: { rpe: 9 } } }), 2, 'push', bench)), '60.0');
check('rated 10 → hold', w0(target(E, makeState({ exs: [bench], logs: w1Bench, ratings: { mc_1_push_bench: { rpe: 10 } } }), 2, 'push', bench)), '60.0');
check('skipped → normal (a skip is neutral, never a number)', w0(target(E, makeState({ exs: [bench], logs: w1Bench, ratings: { mc_1_push_bench: { rpeSkipped: true } } }), 2, 'push', bench)), '62.5');
check('ratings OFF on the cycle, rated 5 → normal', w0(target(E, makeState({ rpe: false, exs: [bench], logs: w1Bench, ratings: { mc_1_push_bench: { rpe: 5 } } }), 2, 'push', bench)), '62.5');
check('rpe absent on the cycle, rated 5 → normal', w0(target(E, makeState({ rpe: 'absent', exs: [bench], logs: w1Bench, ratings: { mc_1_push_bench: { rpe: 5 } } }), 2, 'push', bench)), '62.5');

// Hold releases after one mesocycle: week 2 held at 60 and hit, week 3 unrated → +2.5.
{
  const logs = logEx(logEx({}, 1, 'push', bench, 60, 8), 2, 'push', bench, 60, 8);
  const st = makeState({ exs: [bench], logs, ratings: { mc_1_push_bench: { rpe: 9 } } });
  check('hold releases on its own: week 3 after a held week 2 → +2.5', w0(target(E, st, 3, 'push', bench)), '62.5');
}

// Not compliant + easy rating → no speed-up (and the lock covers the miss).
{
  const logs = logEx({}, 2, 'push', bench, 60, 8); // week 2 target is 62.5; 60 misses it
  logEx(logs, 1, 'push', bench, 60, 8);
  const st = makeState({ exs: [bench], logs, ratings: { mc_2_push_bench: { rpe: 4 } } });
  E.setState(st);
  check('missed target + rated 4 → no double step', E.getProgressionStep(macroOf(st), 3, 'push', bench).kind, 'none');
}

// ── Heavy leg: 1.5× ──────────────────────────────────────────────────────
{
  const logs = logEx({}, 1, 'push', squat, 100, 5);
  check('heavy leg, loss, rated 5 → 1.5 × 5 = +7.5', w0(target(E, makeState({ exs: [squat], logs, ratings: { mc_1_push_squat: { rpe: 5 } } }), 2, 'push', squat)), '107.5');
  check('heavy leg, gain, rated 5 → 1.5 × 10 = +15', w0(target(E, makeState({ goalType: 'gain', exs: [squat], logs, ratings: { mc_1_push_squat: { rpe: 5 } } }), 2, 'push', squat)), '115.0');
  check('heavy leg, gain, unrated → +10', w0(target(E, makeState({ goalType: 'gain', exs: [squat], logs }), 2, 'push', squat)), '110.0');
}

// ── Reps track ───────────────────────────────────────────────────────────
{
  const logs = logEx({}, 1, 'push', bench, 60, 8);
  logs['mc_prog_2_push_bench'] = { progType: 'reps' };
  check('reps track, unrated → +1 rep', r0(target(E, makeState({ exs: [bench], logs }), 2, 'push', bench)), '9');
  check('reps track, rated 5 → +2 reps', r0(target(E, makeState({ exs: [bench], logs, ratings: { mc_1_push_bench: { rpe: 5 } } }), 2, 'push', bench)), '10');
  check('reps track, rated 9 → hold reps', r0(target(E, makeState({ exs: [bench], logs, ratings: { mc_1_push_bench: { rpe: 9 } } }), 2, 'push', bench)), '8');
  check('reps track keeps the weight flat while doubling reps', w0(target(E, makeState({ exs: [bench], logs, ratings: { mc_1_push_bench: { rpe: 5 } } }), 2, 'push', bench)), '60.0');
  const rl = logEx({}, 1, 'push', rangeEx, 50, '8–10');
  rl['mc_prog_2_push_row'] = { progType: 'reps' };
  check('rep range, rated 5 → 8–10 becomes 10–12', r0(target(E, makeState({ exs: [rangeEx], logs: rl, ratings: { mc_1_push_row: { rpe: 5 } } }), 2, 'push', rangeEx)), '10–12');
  const gl = logEx({}, 1, 'push', giant, 10, 20);
  gl['mc_prog_2_push_gs'] = { progType: 'reps' };
  check('giant set, unrated → +10', r0(target(E, makeState({ exs: [giant], logs: gl }), 2, 'push', giant)), '30');
  check('giant set, rated 5 → +20', r0(target(E, makeState({ exs: [giant], logs: gl, ratings: { mc_1_push_gs: { rpe: 5 } } }), 2, 'push', giant)), '40');
}

// ── Exemptions ───────────────────────────────────────────────────────────
{
  const logs = logEx(logEx({}, 1, 'push', bench, 60, 8), 2, 'push', bench, 36, 8);
  const st = makeState({ exs: [bench], logs, ratings: { mc_1_push_bench: { rpe: 5 }, mc_2_push_bench: { rpe: 5 } }, deloads: { mc_2: true } });
  E.setState(st);
  check('deload week itself → no step', E.getProgressionStep(macroOf(st), 2, 'push', bench).kind, 'none');
  check('the session after a deload → no step', E.getProgressionStep(macroOf(st), 3, 'push', bench).kind, 'none');
  const m = makeState({ goalType: 'maintenance', exs: [bench], logs: logEx({}, 1, 'push', bench, 60, 8), ratings: { mc_1_push_bench: { rpe: 5 } } });
  E.setState(m);
  check('maintenance → no RPE step at all', E.getRpeStep(macroOf(m), 2, 'push', bench).kind, 'none');
  const c = makeState({ exs: [bike], logs: logEx({}, 1, 'push', bike, 0, 0), ratings: { mc_1_push_bike: { rpe: 3 } } });
  E.setState(c);
  check('cardio → no step', E.getRpeStep(macroOf(c), 2, 'push', bike).kind, 'none');
}

// ── Microcycle tracks ────────────────────────────────────────────────────
{
  const logs = logEx(logEx({}, 1, 'pushm1', bench, 60, 8), 1, 'pushm2', bench, 60, 8);
  const st = makeState({ micro: true, exs: [bench], logs, ratings: { mc_1_pushm1_bench: { rpe: 5 } } });
  check('m1 rated easy → m1 next mesocycle doubles', w0(target(E, st, 2, 'pushm1', bench)), '65.0');
  check('m2 not rated → m2 next mesocycle normal (tracks are separate)', w0(target(E, st, 2, 'pushm2', bench)), '62.5');
}

// ── Frozen targets ───────────────────────────────────────────────────────
{
  const st = makeState({ exs: [bench], logs: logEx({}, 1, 'push', bench, 60, 8) });
  check('judged with no rating → 62.5', w0(target(E, st, 2, 'push', bench)), '62.5');
  st.rpe.mc_1_push_bench = { rpe: 4 };
  check('a LATE easy rating does not rewrite the frozen target', w0(target(E, st, 2, 'push', bench)), '62.5');
  check('…and the display step stays "none" (reads the frozen entry)', E.getProgressionStep(macroOf(st), 2, 'push', bench).kind, 'none');

  const st2 = makeState({ exs: [bench], logs: logEx({}, 1, 'push', bench, 60, 8), ratings: { mc_1_push_bench: { rpe: 5 } } });
  check('judged after an easy rating → 65.0', w0(target(E, st2, 2, 'push', bench)), '65.0');
  check('the step is frozen onto the cached entry', st2.progressionTargets['mc_push_bench_w2'].rpeStep, 'easy');
  st2.rpe.mc_1_push_bench = { rpe: 8 };
  check('editing the rating afterwards keeps the frozen target', w0(target(E, st2, 2, 'push', bench)), '65.0');
  check('…and the frozen step', E.getProgressionStep(macroOf(st2), 2, 'push', bench).kind, 'easy');

  const st3 = makeState({ exs: [bench], logs: logEx({}, 1, 'push', bench, 60, 8) });
  target(E, st3, 2, 'push', bench);
  check('a no-step cache entry keeps its pre-v8.20 shape (no rpeStep key)',
    Object.keys(st3.progressionTargets['mc_push_bench_w2']).sort(), ['repsTargets', 'weightTargets']);
  const st4 = makeState({ exs: [bench], logs: logEx({}, 1, 'push', bench, 60, 8), ratings: { mc_1_push_bench: { rpe: 5 } } });
  st4.progressionTargets['mc_push_bench_w2'] = { weightTargets: ['62.5', '62.5', '62.5'], repsTargets: ['8', '8', '8'] };
  check('a pre-v8.20 cached entry wins over a rating (existing data untouched)', w0(target(E, st4, 2, 'push', bench)), '62.5');
  E.setState(st4);
  const a = E.getProgressionStep(macroOf(st4), 3, 'push', bench).kind;
  const b = E.getProgressionStep(macroOf(st4), 3, 'push', bench).kind;
  check('the step is idempotent across repeated renders', a, b);
}

// ── Control: with no ratings, identical to v8.19 ─────────────────────────
{
  const scenarios = [];
  for (const goalType of ['loss', 'gain']) {
    for (const ex of [bench, squat, giant, rangeEx]) {
      for (const prog of ['weight', 'reps']) {
        for (const hit of [true, false]) {
          const logs = logEx({}, 1, 'push', ex, ex.startWeight, ex.reps);
          if (hit) logEx(logs, 2, 'push', ex, ex.startWeight + 20, ex.type === 'giant' ? 40 : 12);
          else logEx(logs, 2, 'push', ex, ex.startWeight - 5, ex.reps);
          logs[`mc_prog_2_push_${ex.id}`] = { progType: prog };
          logs[`mc_prog_3_push_${ex.id}`] = { progType: prog };
          scenarios.push({ goalType, ex, logs });
        }
      }
    }
  }
  let same = 0;
  scenarios.forEach(({ goalType, ex, logs }) => {
    const sNew = makeState({ goalType, exs: [ex], logs });
    const sOld = makeState({ goalType, exs: [ex], logs });
    const out = eng => [2, 3].map(w => { eng.evaluateProgressionLock(macroOf(eng.getState()), w, 'push', ex); return eng.getWeekTargets(macroOf(eng.getState()), w, 'push', ex); });
    E.setState(sNew); const a = JSON.stringify([out(E), sNew.progressionLocks]);
    OLD.setState(sOld); const b = JSON.stringify([out(OLD), sOld.progressionLocks]);
    if (a === b) same++;
    else console.log(`    differs: ${goalType} ${ex.id} ${JSON.stringify(logs).slice(0, 80)}…\n      new ${a}\n      old ${b}`);
  });
  check(`CONTROL: no ratings → targets and locks identical to v8.19 (${scenarios.length} scenarios)`, same, scenarios.length);
  const rated = makeState({ exs: [bench], logs: logEx({}, 1, 'push', bench, 60, 8), ratings: { mc_1_push_bench: { rpe: 5 } } });
  OLD.setState(clone(rated));
  const oldVal = w0(OLD.getWeekTargets(macroOf(OLD.getState()), 2, 'push', bench));
  check('CONTROL: v8.19 ignores an easy rating (so the suite can fail)', oldVal !== w0(target(E, rated, 2, 'push', bench)), true);
}

// ── Maintenance look-ahead (v8.20) ───────────────────────────────────────
check('maintenance: look-ahead weight stays at the start weight',
  [2, 3, 6].map(w => E.getWeekWeight(bench, w, 'weight', 'maintenance', '2.5')), [60, 60, 60]);
check('maintenance: heavy-leg look-ahead flat too', E.getWeekWeight(squat, 4, 'weight', 'maintenance', '2.5'), 100);
check('maintenance: look-ahead reps do not climb', E.getWeekReps(bench, 4, 'reps', 'maintenance'), '8');
check('maintenance: giant-set look-ahead reps do not climb', E.getGiantSetProgression(giant, 4, 'maintenance'), '20');
check('loss: look-ahead still climbs (+2.5 × 2)', E.getWeekWeight(bench, 3, 'weight', 'loss', '2.5'), 65);
check('loss: giant look-ahead still +10/week', E.getGiantSetProgression(giant, 3, 'loss'), '40');
{
  // A manual increase carries forward: last week's actual + 0, not the plan.
  const logs = logEx({}, 1, 'push', bench, 60, 8);
  logEx(logs, 2, 'push', bench, 70, 8);
  const st = makeState({ goalType: 'maintenance', exs: [bench], logs });
  check('maintenance: a manual increase to 70 carries into next week', w0(target(E, st, 3, 'push', bench)), '70.0');
  const r = logEx({}, 1, 'push', bench, 60, 8);
  r['mc_prog_2_push_bench'] = { progType: 'reps' };
  check('maintenance: even a stored reps route adds no reps', r0(target(E, makeState({ goalType: 'maintenance', exs: [bench], logs: r }), 2, 'push', bench)), '8');
}

// ── The sheet: when it opens, what closing stores ────────────────────────
{
  const exs = [bench, squat, bike];
  const done = logEx(logEx(logEx({}, 2, 'push', bench, 62.5, 8), 2, 'push', squat, 105, 5), 2, 'push', bike, 0, 0);
  const st = makeState({ exs, logs: done });
  E.setState(st);
  E.maybeOpenRpeSheet(macroOf(st), 2, 'push', false);
  check('opens on the transition to complete', E.calls.openModal, ['modal-rpe']);
  E.setState(st); E.maybeOpenRpeSheet(macroOf(st), 2, 'push', true);
  check('does not open if the session was already complete', E.calls.openModal, []);
  const off = makeState({ rpe: false, exs, logs: done });
  E.setState(off); E.maybeOpenRpeSheet(macroOf(off), 2, 'push', false);
  check('does not open with ratings off', E.calls.openModal, []);
  const absent = makeState({ rpe: 'absent', exs, logs: done });
  E.setState(absent); E.maybeOpenRpeSheet(macroOf(absent), 2, 'push', false);
  check('does not open on an existing cycle with no rpe field', E.calls.openModal, []);
  const dl = makeState({ exs, logs: done, deloads: { mc_2: true } });
  E.setState(dl); E.maybeOpenRpeSheet(macroOf(dl), 2, 'push', false);
  check('does not open for a deload session', E.calls.openModal, []);
  const partial = makeState({ exs, logs: logEx({}, 2, 'push', bench, 62.5, 8) });
  E.setState(partial); E.maybeOpenRpeSheet(macroOf(partial), 2, 'push', false);
  check('does not open while the session is incomplete', E.calls.openModal, []);
  const answered = makeState({ exs, logs: done, ratings: { mc_2_push_bench: { rpe: 7 }, mc_2_push_squat: { rpeSkipped: true } } });
  E.setState(answered); E.maybeOpenRpeSheet(macroOf(answered), 2, 'push', false);
  check('does not re-open once every exercise has an answer', E.calls.openModal, []);

  E.setState(clone(st));
  check('lists every non-cardio exercise, cardio excluded', E.getRpeSessionExercises(macroOf(E.getState()), 'push').map(e => e.id), ['bench', 'squat']);
  const closing = makeState({ exs, logs: done, ratings: { mc_2_push_bench: { rpe: 7 } } });
  E.setState(closing);
  E.setCtx({ macroId: 'mc', week: 2, dayKey: 'push' });
  E.closeRpeSheet();
  check('closing keeps the rating given', closing.rpe.mc_2_push_bench, { rpe: 7 });
  check('closing stores { rpeSkipped: true } for the unrated — never a number', closing.rpe.mc_2_push_squat, { rpeSkipped: true });
  check('closing never rates cardio', closing.rpe.mc_2_push_bike, undefined);
}

// ── AI prompt summary ────────────────────────────────────────────────────
{
  const none = makeState({ exs: [bench], logs: logEx({}, 1, 'push', bench, 60, 8) });
  E.setState(none);
  check('no ratings → empty summary (prompt unchanged)', E.buildRpePromptSummary(macroOf(none)), '');
  // Week 1 rated 6 and hit → week 2's target is the doubled 65, so 65 hits it.
  const logs = logEx(logEx({}, 1, 'push', bench, 60, 8), 2, 'push', bench, 65, 8);
  const st = makeState({ exs: [bench, squat], logs, ratings: { mc_1_push_bench: { rpe: 6 }, mc_2_push_bench: { rpe: 8 }, mc_1_push_squat: { rpeSkipped: true } } });
  E.setState(st);
  const txt = E.buildRpePromptSummary(macroOf(st));
  check('summary names the exercise with its average and latest', txt.includes('- Bench press: avg RPE 7.0 over 2 sessions (latest 8), hit target 1/1'), true);
  check('summary counts skips as "not rated", not as a number', txt.includes('- Squat: 1 not rated'), true);
}

// ── Home Up next matches Train (v8.20) ──
{
  const prev = (logs, goalType = 'loss', extra = {}) => makeState({ goalType, exs: [bench, squat], logs, ...extra });
  const up = (st, week, ex) => { E.setState(st); return E.getSessionPreviewTarget(macroOf(st), week, 'push', ex); };
  const raised = logEx(logEx({}, 1, 'push', bench, 60, 8), 2, 'push', bench, 70, 8);
  check('Up next: a weight raised by hand carries (70 → 72.5), not the plan (65)', up(prev(raised), 3, bench).weight, '72.5');
  check('Up next, maintenance: a raised weight carries flat (70)', up(prev(raised, 'maintenance'), 3, bench).weight, '70.0');
  check('Up next: week 1 shows the starting numbers', up(prev({}), 1, bench), { weight: '60.0', reps: '8' });
  const easy = prev(logEx({}, 1, 'push', bench, 60, 8), 'loss', { ratings: { mc_1_push_bench: { rpe: 5 } } });
  check('Up next: an easy rating shows the double step, as Train does', up(easy, 2, bench).weight, '65.0');
  const st = prev(logEx({}, 1, 'push', bench, 60, 8), 'loss', { ratings: { mc_1_push_bench: { rpe: 5 } } });
  up(st, 2, bench);
  check('Up next never caches the week it previews (a later rating still counts)', st.progressionTargets['mc_push_bench_w2'], undefined);
  const locked = prev(logEx({}, 1, 'push', bench, 60, 8));
  locked.progressionLocks['mc_push_bench'] = { weightTargets: ['62.5', '62.5', '62.5'], repsTargets: ['8', '8', '8'], sets: 3, lockedAtWeek: 2 };
  check('Up next: an On-hold exercise shows its frozen target', up(locked, 3, bench), { weight: '62.5', reps: '8' });
  // Unevaluated miss (a restored backup): week 2 missed its 62.5 target and no
  // lock was ever written. Home must decide it the way Train's sweep would.
  const missed = prev(logEx(logEx({}, 1, 'push', bench, 60, 8), 2, 'push', bench, 60, 8));
  check('Up next: an unevaluated miss is swept into On hold, as Train would', up(missed, 3, bench).weight, '62.5');
  check('…and the lock it found is the one Train will read', missed.progressionLocks['mc_push_bench']?.lockedAtWeek, 2);
  const dl = prev(logEx({}, 1, 'push', bench, 60, 8), 'loss', { deloads: { mc_2: true } });
  check('Up next: a deload shows 60% of last week, rounded to the increment', up(dl, 2, bench).weight, '35.0');
  const reps = logEx({}, 1, 'push', bench, 60, 8); reps['mc_prog_2_push_bench'] = { progType: 'reps' };
  check('Up next: the reps route shows the target reps, not the plan reps', up(prev(reps), 2, bench), { weight: '60.0', reps: '9' });
  E.setState(prev({}));
  check('Up next: cardio has no target (keeps its old line)', E.getSessionPreviewTarget(macroOf(E.getState()), 2, 'push', bike), null);
}

// ── Wiring ───────────────────────────────────────────────────────────────
for (const fn of ['function quickFillComplete(', 'function quickFillCompleteDropset(', 'function quickFillCompleteSuperset(', 'function toggleSetDone(']) {
  const body = extractFrom(source, fn);
  check(`${fn.replace('function ', '').replace('(', '()')} opens the sheet (quick-fill must not skip it)`,
    /maybeOpenRpeSheet\(/.test(body) && /isTrainSessionComplete\(/.test(body), true);
}
// v8.35 (§125): exProgData's calculation is the engine's
// computeExerciseProgression (engine/src/targets.ts), so these read its source;
// renderTrainDay's exProgData() is the wrapper that sweeps and evaluates locks.
const targetsSrc = readFileSync(join(repo, 'engine', 'src', 'targets.ts'), 'utf8');
const renderDay = extractFrom(targetsSrc, 'export function computeExerciseProgression(');
check('computeExerciseProgression reads getProgressionStep (the same step as the judged target)', /const rpeStep = getProgressionStep\(s, cache, macro, week, dayKey, ex\)/.test(renderDay), true);
check('the deload 60% rounding keeps the unscaled weightJump', /roundToIncrement\(baseWeight \* 0\.6, weightJump\)/.test(renderDay), true);
check('no progression site in computeExerciseProgression adds the unscaled weightJump', /\+ weightJump\b/.test(renderDay), false);
check('renderTrainDay\'s exProgData() hands the calculation to the engine', /BlocEngine\.computeExerciseProgression\(/.test(extractFrom(source, 'function renderTrainDay(')), true);
const homeUp = extractFrom(source, 'function renderHomeUpNext(');
check('renderHomeUpNext reads getSessionPreviewTarget (Home matches Train)', /getSessionPreviewTarget\(macro, next\.week, next\.dayKey, ex\)/.test(homeUp), true);
check('renderHomeUpNext prints the target reps, not ex.reps', /\$\{sets\} \\u00d7 \$\{reps\}/.test(homeUp), true);
check('rating refreshes the Session tools row', /refreshTrainRpeRowSub\(/.test(extractFrom(source, 'function setRpeRating(')), true);
check('closing the sheet refreshes the Session tools row', /refreshTrainRpeRowSub\(/.test(extractFrom(source, 'function closeRpeSheet(')), true);
check('the row and the refresh share one text function', /id="train-rpe-row-sub">\$\{rpeRowSubText\(/.test(source), true);
check('no per-exercise Deload tag anywhere in Train (the hero banner says it)', />Deload<\/span>/.test(extractFrom(source, 'function renderTrainDay(')), false);
check('the RPE sheet routes every dismissal through closeRpeSheet', /'modal-rpe': 'closeRpeSheet'/.test(source), true);

console.log(failures ? `\n✗ ${failures} check(s) failed` : '\nALL CHECKS PASS');
process.exit(failures ? 1 : 0);
