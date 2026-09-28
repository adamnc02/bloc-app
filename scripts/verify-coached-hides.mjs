#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-coached-hides.mjs — v8.40, PROMPT-03 Phase 4e-1, TECHNICAL §132
//
// THE RULES THIS PROTECTS (proposal §4.2 and §4.4):
//   · A coached client has no Plan page. One guard in showScreen() sends
//     every route there to Home, and the nav button hides; the deload toggle,
//     Check-in with BLOC, Last cycle, Next cycle and the plateau narrative go.
//   · Effort ratings never move targets on a coach's cycle. 🚨 The rule is
//     `publishedBy` on the cycle, in the ENGINE, not "is this phone linked":
//     the engine calls rpeDrivesProgression() itself, and BLOC Coach runs the
//     same engine on client_state, which holds no link (Adam, 2026-09-28:
//     "Coach's cycles only").
//   · Unlinking (either side) removes every coach cycle and every coach goal
//     phase (Adam: "Remove every coach cycle", "Remove them all"), with their
//     templates, deloads, supersets, cached targets and locks, and NOTHING the
//     client logged: trainLogs, ratings and exercise history stay.
//
// 🚨 THE TRAPS:
//   · Changing only index.html's rpeDrivesProgression shim. computeRpeStepKind
//     is inside the engine and calls the engine's own copy.
//   · A key test of startsWith(id + '_'): a Solo cycle "macro_c1_x" would lose
//     its keys to a coach cycle "macro_c1". Ownership is the LONGEST id.
//   · Leaving the Coached Progress tour to the engine's skip: the check-in
//     steps' onEnter OPENS the Solo check-in sheet before the target check.
//
// Control: v8.39 (31ec0b7), which has none of it, must fail.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { mainScript, indexTopLevel, closure } from './golden/extract-engine.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const CONTROL = '31ec0b7';
const git = p => execFileSync('git', ['show', `${CONTROL}:${p}`], { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const demo = JSON.parse(readFileSync(join(repo, 'bloc-demo-data.json'), 'utf8'));
const clone = v => JSON.parse(JSON.stringify(v));
const engineOf = src => { const ctx = {}; vm.runInNewContext(src + '\n;this.BlocEngine = BlocEngine;', ctx); return ctx.BlocEngine; };

function run(label, html, engineSrc) {
  let failures = 0;
  const check = (name, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    console.log(`${ok ? '✓' : '✗'} [${label}] ${name}`);
    if (!ok) console.log(`    expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  };
  const E = engineOf(engineSrc);
  const src = mainScript(html);
  const { decls } = indexTopLevel(src);

  // ── 1. The engine's RPE rule ─────────────────────────────────────────────
  check('rpeDrivesProgression: a Solo cycle with ratings on drives', E.rpeDrivesProgression({ id: 'm', rpe: true }), true);
  check('rpeDrivesProgression: a coach\'s cycle never drives', E.rpeDrivesProgression({ id: 'm', rpe: true, publishedBy: 'coach-1' }), false);
  check('rpeDrivesProgression: ratings off never drive', E.rpeDrivesProgression({ id: 'm' }), false);
  // End to end, through computeRpeStepKind: the demo cycle rated 5 everywhere
  // gives real "easy" steps as Solo, and none once the coach published it.
  const kinds = publishedBy => {
    const s = clone(demo);
    const m = s.macrocycles[0];
    m.rpe = true;
    if (publishedBy) m.publishedBy = publishedBy;
    s.rpe = {};
    const tracks = Object.keys(s.exercises).filter(k => k.startsWith(m.id + '_1_')).map(k => [k.slice((m.id + '_1_').length), s.exercises[k]]);
    for (let w = 1; w <= m.weeks; w++) for (const [dk, list] of tracks) for (const ex of list) s.rpe[E.getRpeKey(m.id, w, dk, ex.id)] = { rpe: 5 };
    const cache = new Map();
    const tc = { get: k => cache.get(k), set: (k, v) => cache.set(k, v) };
    const out = { easy: 0, hold: 0, none: 0 };
    for (let w = 2; w <= m.weeks; w++) for (const [dk, list] of tracks) for (const ex of list) out[E.computeRpeStepKind(s, tc, m, w, dk, ex)]++;
    return out;
  };
  const solo = kinds(null), coached = kinds('coach-1');
  check('the demo cycle rated 5 gives "easy" steps as Solo (so the next check means something)', solo.easy > 0, true);
  check('…and not one once the coach published it', [coached.easy, coached.hold], [0, 0]);

  // ── 2. removeCoachPlan() ─────────────────────────────────────────────────
  let fns;
  try {
    const parts = closure(decls, ['removeCoachPlan'], new Set(['state', 'save', 'getDateActiveMacroId']));
    fns = new Function('env', `
      let state = env.state; let __saves = 0;
      function save() { __saves++; }
      function getDateActiveMacroId() { return env.dateActive; }
      ${parts.map(p => p.text).join('\n')}
      return { removeCoachPlan, saves: () => __saves, state: () => state };`);
  } catch (e) { fns = null; }
  check('removeCoachPlan() exists', !!fns, true);
  if (fns) {
    const s = clone(demo);
    const soloId = s.macrocycles[0].id;
    // A Solo cycle whose id starts with the coach cycle's id: the prefix trap.
    const coachId = 'macro_cabc_def_01';
    const soloTwin = { id: coachId + '_x', name: 'Solo twin', start: '2027-01-04', weeks: 4 };
    s.macrocycles.push({ id: coachId, name: 'Coach block', start: '2026-10-05', weeks: 4, rpe: true, publishedBy: 'coach-1', publishedSeq: 3 }, soloTwin);
    s.exercises[coachId + '_1_session0'] = [{ id: 'ex_c1', name: 'Squat', supersetId: 'ss_coach' }, { id: 'ex_c2', name: 'Row', supersetId: 'ss_shared' }];
    s.exercises[soloTwin.id + '_1_session0'] = [{ id: 'ex_t1', name: 'Press', supersetId: 'ss_shared' }];
    s.supersets = Object.assign({}, s.supersets, { ss_coach: { name: null }, ss_shared: { name: 'Shared' } });
    s.deloads = Object.assign({}, s.deloads, { [coachId + '_2_session0']: true, [soloTwin.id + '_2_session0']: true });
    s.progressionTargets = Object.assign({}, s.progressionTargets, { [coachId + '_session0_ex_c1_w2']: { w: 60 }, [soloTwin.id + '_session0_ex_t1_w2']: { w: 40 } });
    s.progressionLocks = Object.assign({}, s.progressionLocks, { [coachId + '_session0_ex_c1']: { week: 3 }, [soloTwin.id + '_session0_ex_t1']: { week: 2 } });
    s.goals.push({ macroGoalID: 'g_coach', macroId: coachId, publishedBy: 'coach-1', startDate: '2026-10-05', endDate: '2026-11-01' },
      { macroGoalID: 'g_coach_on_solo', macroId: soloId, publishedBy: 'coach-1', startDate: '2026-07-01', endDate: '2026-07-10' },
      { macroGoalID: 'g_orphan', macroId: coachId, startDate: '2026-10-05', endDate: '2026-10-10' });
    s.trainLogs[coachId + '_1_session0_ex_c1_0'] = { weight: 60, reps: '8', done: true };
    s.rpe = Object.assign({}, s.rpe, { [coachId + '_1_session0_ex_c1']: { rpe: 7 } });
    s.exerciseHistory = Object.assign({}, s.exerciseHistory, { Squat: [{ date: '2026-10-05', weight: 60 }] });
    s.coachBookings = { b1: { booking_id: 'b1' } };
    s.coachSessionLogs = [{ id: 'p9' }];
    s.coachAdvice = [{ responseId: 'r1' }];
    s.coachLedger = { p1: { seq: 1, status: 'applied' } };
    s.currentMacroId = coachId;
    const before = clone(s);
    const env = { state: s, dateActive: null };
    const F = fns(env);
    const res = F.removeCoachPlan();
    const a = F.state();
    const keys = o => Object.keys(o || {}).sort();
    check('it reports one cycle and three goal phases removed', res, { cycles: 1, goals: 3 });
    check('the coach\'s cycle is gone; the Solo cycles stay, unchanged',
      [a.macrocycles.map(m => m.id), JSON.stringify(a.macrocycles.find(m => m.id === soloId)) === JSON.stringify(before.macrocycles[0])],
      [[soloId, soloTwin.id], true]);
    check('its session template is gone; every Solo template stays',
      keys(a.exercises), keys(before.exercises).filter(k => !k.startsWith(coachId + '_1_')));
    check('🚨 the prefix trap: the Solo twin keeps its template, deload, target and lock',
      [!!a.exercises[soloTwin.id + '_1_session0'], !!a.deloads[soloTwin.id + '_2_session0'],
        !!a.progressionTargets[soloTwin.id + '_session0_ex_t1_w2'], !!a.progressionLocks[soloTwin.id + '_session0_ex_t1']], [true, true, true, true]);
    check('the coach cycle\'s deload, cached target and lock are gone',
      [a.deloads[coachId + '_2_session0'], a.progressionTargets[coachId + '_session0_ex_c1_w2'], a.progressionLocks[coachId + '_session0_ex_c1']],
      [undefined, undefined, undefined]);
    check('a superset only the coach used goes; one a Solo cycle shares stays',
      [!!a.supersets.ss_coach, !!a.supersets.ss_shared], [false, true]);
    check('every coach goal phase goes (its own cycle\'s, one on a Solo cycle, and one left on its cycle); Solo goals stay unchanged',
      JSON.stringify(a.goals), JSON.stringify(before.goals.filter(g => !['g_coach', 'g_coach_on_solo', 'g_orphan'].includes(g.macroGoalID))));
    check('🚨 everything the client logged stays: trainLogs, ratings, exercise history',
      [JSON.stringify(a.trainLogs) === JSON.stringify(before.trainLogs), JSON.stringify(a.rpe) === JSON.stringify(before.rpe),
        JSON.stringify(a.exerciseHistory) === JSON.stringify(before.exerciseHistory)], [true, true, true]);
    check('the link\'s bookings and stored in-person logs are cleared; advice and the ledger stay',
      [a.coachBookings, a.coachSessionLogs, a.coachAdvice.length, keys(a.coachLedger)], [{}, {}, 1, ['p1']]); // v8.43: an object, never [] (§137)
    check('no active cycle: the viewed cycle moves off the removed one', a.currentMacroId !== coachId && a.currentMacroId !== undefined, true);
    check('it saves once', F.saves(), 1);
    F.removeCoachPlan();
    check('run again, it changes nothing and doesn\'t save', F.saves(), 1);
    // A Solo account with nothing from a coach: untouched, not even saved.
    const s2 = clone(demo);
    const G = fns({ state: s2, dateActive: null });
    G.removeCoachPlan();
    check('a Solo account is untouched, and not saved', [JSON.stringify(G.state()) === JSON.stringify(demo), G.saves()], [true, 0]);
  }

  // ── 3. The Coached Progress tour ─────────────────────────────────────────
  let tour;
  try {
    const stubs = ['setTourAnchorDate', '_closeTourSheets', 'renderProgress', 'openCheckinSheet', 'DEMO_TOUR_TODAY', 'DEMO_TOUR_CYCLE_END', 'coachedView'];
    const parts = closure(decls, ['buildProgressTourSteps'], new Set(stubs));
    tour = new Function('env', `
      const setTourAnchorDate = () => {}, _closeTourSheets = () => {}, renderProgress = () => {};
      const openCheckinSheet = () => env.opened.push('checkin');
      const DEMO_TOUR_TODAY = '2026-08-02', DEMO_TOUR_CYCLE_END = '2026-09-06';
      const coachedView = () => env.coached;
      const document = { getElementById: () => null };
      ${parts.map(p => p.text).join('\n')}
      return buildProgressTourSteps;`);
  } catch (e) { tour = null; }
  if (tour) {
    const ids = (coached, demoTour) => { const env = { coached, opened: [] }; return tour(env)(demoTour).map(st => st.targetId); };
    const soloIds = ids(false, false);
    const coachedIds = ids(true, false);
    check('Solo keeps its Progress tour', soloIds.includes('progress-checkin') && soloIds.includes('progress-next-cycle'), true);
    check('the Coached tour has no check-in, Last cycle or Next cycle step',
      coachedIds.filter(t => /checkin|last-cycle|next-cycle/.test(t)), []);
    // v8.41 (§135): From your coach takes the check-in's place.
    check('…and keeps the rest, in order, with From your coach where the check-in was', coachedIds,
      soloIds.map(t => (t === 'progress-checkin' ? 'progress-from-coach' : t)).filter(t => !/checkin|last-cycle|next-cycle/.test(t)));
    check('the Demo Tour is always the Solo one', ids(true, true), ids(false, true));
    const env = { coached: true, opened: [] };
    for (const st of tour(env)(false)) if (st.onEnter) st.onEnter(st);
    check('🚨 no Coached step opens the Solo check-in sheet', env.opened, []);
  } else check('the Progress tour can be built', false, true);

  // ── 4. The guards, where each hide lives ─────────────────────────────────
  const body = name => { const d = decls.get(name); return d ? d.text : ''; };
  check('showScreen() sends Plan to Home when coached, before anything renders',
    /^function showScreen\(name\) \{[\s\S]{0,600}if \(name === 'plan' && coachedView\(\)\) name = 'home';/.test(body('showScreen')), true);
  check('the Plan nav button and its Help tour row hide when coached',
    /nav-plan[\s\S]*'none'[\s\S]*tour-help-plan-row/.test(body('applyCoachedNav')) && html.includes('id="tour-help-plan-row"'), true);
  for (const fn of ['renderProgressLastCycle', 'renderProgressNextCycle'])
    check(`${fn}() draws nothing when coached`, /if \(coachedView\(\)\) \{ el\.innerHTML = ''; return; \}/.test(body(fn)), true);
  // v8.41 (§135): the check-in section becomes From your coach, drawn even
  // with no cycle (the coach's responses don't need one). v8.40 drew nothing.
  check('renderProgressCheckin() draws From your coach when coached, before the no-cycle return (no Solo check-in)',
    /if \(coachedView\(\)\) \{ renderProgressFromCoach\(el, macro\); return; \}\s*if \(!macro\)/.test(body('renderProgressCheckin')), true);
  check('Insights drops the plateau narrative and BLOC\'s calorie target when coached',
    /const trendHtml = coached \? '' : buildInsightsCardHTML\(\)/.test(body('renderProgressInsights')) && /!coached\)/.test(body('renderProgressInsights')), true);
  check('Train\'s deload row is Solo-only, and the toggle refuses when coached',
    /coachedView\(\) \? ''[\s\S]{0,120}deload-toggle-/.test(body('renderTrainTools')) && /^function toggleDeloadWeek[^{]*\{\s*if \(coachedView\(\)\) return;/.test(body('toggleDeloadWeek')), true);
  check('the profile gate opens over Home, and never starts the cycle-creation tour, when coached',
    /showScreen\(coachedView\(\) \? 'home' : 'plan'\)/.test(body('openProfileGate')) && /^function startMacrocycleCreationTour\(\) \{\s*if \(coachedView\(\)\) return;/.test(body('startMacrocycleCreationTour')), true);
  check('unlinking runs the cleanup, and so does a link the coach ended',
    /afterCoachLinkEnded\(\)/.test(body('unlinkCoach')) && /wasLinked\) afterCoachLinkEnded\(\)/.test(body('refreshCoachLink')), true);
  return failures;
}

const html = readFileSync(join(repo, 'index.html'), 'utf8');
const failures = run('now', html, readFileSync(join(repo, 'engine', 'dist', 'bloc-engine.js'), 'utf8'));

console.log(`\n— control: v8.39 (${CONTROL}), which must fail —`);
const orig = console.log; const lines = []; console.log = s => lines.push(String(s));
let cf;
try { cf = run('v8.39', git('index.html'), git('engine/dist/bloc-engine.js')); } finally { console.log = orig; }
const failed = lines.filter(l => l.startsWith('✗'));
const want = [/a coach's cycle never drives/, /removeCoachPlan\(\) exists/, /showScreen\(\) sends Plan to Home/, /no check-in, Last cycle/];
const missing = want.filter(re => !failed.some(l => re.test(l)));
if (cf > 0 && !missing.length) console.log(`✓ control: v8.39 fails ${cf} checks, including the RPE rule, the cleanup, the Plan guard and the tour`);
else { console.log(`✗ control: v8.39 should fail the RPE rule, the cleanup, the Plan guard and the tour (${cf} failed; missing ${missing.join(', ')})`); process.exitCode = 1; }

if (failures) { console.log(`\nFAIL: ${failures} check(s) failed.`); process.exit(1); }
console.log('\nAll checks passed.');
