#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-coach-logged.mjs
//
// WHAT IT PROTECTS (v8.43, TECHNICAL §137; PROMPT-03 Phase 4e-4): the last of
// Coached mode. A session the coach logged in person, Swap for today, a group
// session that replaces a planned one, and the three informational banners.
//
// 🚨 THE TRAPS:
//   · D3 — with nothing logged for the planned exercise in a swapped week,
//     the next week's target fell back to the THEORETICAL getWeekWeight
//     (startWeight + jump × (week − 1)) instead of holding, the week read as a
//     miss (lock), getLastCompliantWeek stopped on it, and the history filed
//     the substitute under the planned name. The planned target must HOLD.
//   · I2 — a coach-logged week arriving after the phone cached later weeks'
//     targets left them computed without it, frozen for good. Later UNLOGGED
//     weeks recompute; LOGGED weeks never change (§0); the lock replays.
//   · I3 — a coach's session is the coach's: every set stamped loggedBy
//     'coach', the client's earlier sets in it replaced but kept on record.
//   · A 4d-STORED session_log (seq below the cursor) must still apply once.
//   · Banners: plan / goal phases / booking are informational, so their ✕ is
//     PERMANENT (saved); only "proposed a time" comes back (§136).
//
// Runs the built engine and the real index.html functions on the demo
// dataset. CONTROL: v8.42 (ee1a2b9) has none of it.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { mainScript, indexTopLevel, closure } from './golden/extract-engine.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTROL = 'ee1a2b9';
const git = p => execFileSync('git', ['show', `${CONTROL}:${p}`], { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const DEMO = readFileSync(join(repo, 'bloc-demo-data.json'), 'utf8');
const demo = () => JSON.parse(DEMO);
const engineOf = src => { const c = {}; vm.runInNewContext(src + '\n;this.BlocEngine = BlocEngine;', c); return c.BlocEngine; };
const MID = 'macro_1780859905961', DK = 'session0m1';
const EX = n => `ex_${MID}_1_${DK}_${n}`;
const cold = s => { s.progressionTargets = {}; s.progressionLocks = {}; return s; };
const cacheOf = s => ({ get: k => (s.progressionTargets || {})[k], set: (k, v) => { s.progressionTargets[k] = v; } });
const setKey = (w, n, i) => `${MID}_${w}_${DK}_${EX(n)}_${i}`;

// The BLOC side: the real functions, their closure, and small stubs.
const STUBS = ['state', 'save', 'coachLinkGet', 'coachingAvailable', 'isCoachedMode', 'coachedView', 'getLocalToday', 'document',
  'renderTrain', 'openModal', 'closeModal', 'showConfirm', 'fitListToKeyboard', 'showScreen', 'openCoachSessions', '_coachRequests',
  'engineCtx', 'supabase', '_authResolvedSession', 'expandedExercises', 'BlocEngine'];
const SEEDS = ['applyPublications', 'queueStoredSessionLogs', 'chooseSwapToday', 'undoSwapToday', 'openSwapToday', 'renderSwapTodayList',
  'swapTodayRowHTML', 'renderHomeCoachBanner', 'dismissCoachNotice', 'progressCoachBannerHTML', 'coachOwnedSession', 'trainCoachNoticeHTML',
  'coachGroupSessionsHTML'];
function build(src) {
  const { decls } = indexTopLevel(mainScript(src));
  for (const s of SEEDS) if (!decls.has(s)) return null;
  const parts = closure(decls, SEEDS, new Set(STUBS));
  return new Function('env', `
    let state = env.state;
    const BlocEngine = env.engine;
    const save = () => env.saves++;
    const coachLinkGet = () => ({ coachId: 'coach-1', coachName: 'Sam Rivers' });
    const coachingAvailable = () => true, isCoachedMode = () => true, coachedView = () => true;
    const getLocalToday = () => '2026-08-02', engineCtx = () => ({ today: '2026-08-02' });
    const document = env.document;
    const renderTrain = () => env.log.push('renderTrain'), showScreen = n => env.log.push('show:' + n), openCoachSessions = () => {};
    const openModal = id => env.log.push('open:' + id), closeModal = id => env.log.push('close:' + id), fitListToKeyboard = () => {};
    const showConfirm = (t, m, ok, cb) => { env.confirms.push([t, m]); if (env.confirmYes) cb(); };
    let _coachRequests = env.requests || [];
    const expandedExercises = {};
    const supabase = null, _authResolvedSession = { user: { id: 'u1' } };
    ${parts.map(p => p.text).join('\n')}
    return { get state() { return state; }, ${SEEDS.join(', ')}, coachLedger };`);
}
function envFor(engine, over = {}) {
  const els = new Map();
  const document = {
    getElementById: id => { if (!els.has(id)) els.set(id, { id, innerHTML: '', value: '', style: {}, textContent: '', classList: { contains: () => false } }); return els.get(id); },
    querySelector: sel => (sel === '.screen.active' ? { id: 'screen-home' } : null),
  };
  return Object.assign({ engine, state: demo(), saves: 0, log: [], confirms: [], confirmYes: true, els, document, requests: [] }, over);
}
let seq = 500;
const pub = (type, payload, extra = {}) => Object.assign({ id: 'pub-' + (++seq), seq, coach_id: 'coach-1', type,
  payload: Object.assign({ v: 1 }, payload), created_at: '2026-08-04T18:30:00Z' }, extra);

async function run(label, html, engineSrc, quiet = false) {
  let failures = 0;
  const check = (name, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    if (quiet) return; // the control's own ✗s would fail the sweep's grep
    console.log(`${ok ? '✓' : '✗'} [${label}] ${name}`);
    if (!ok) console.log(`    expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  };
  const E = engineOf(engineSrc);
  check('the engine has the D3 marker and the I2 replay', [typeof E.getSubstitution, typeof E.replayProgressionAfterLog, typeof E.getCoachLoggedSession], ['function', 'function', 'function']);
  if (typeof E.getSubstitution !== 'function') return failures;

  // ── 1. D3: Swap for today in the engine ──────────────────────────────────
  {
    // Week 3 of the first exercise done as a SUBSTITUTE at 10 kg (so, read as the
    // planned exercise, it's a big miss and drags next week's target down).
    const swapped = (mark = true) => {
      const s = cold(demo());
      for (let i = 0; i < 4; i++) s.trainLogs[setKey(3, 0, i)] = { weight: '10', reps: '12', done: true };
      if (mark) s.substitutions = { [`${MID}_${DK}_${EX(0)}_w3`]: { kind: 'swap', name: 'Lying Leg Curl', type: 'standard' } };
      return s;
    };
    const s = swapped(), plain = swapped(false), m = s.macrocycles[0], ex = s.exercises[`${MID}_1_${DK}`][0];
    const t3 = E.getWeekTargets(s, cacheOf(s), m, 3, DK, ex), t4 = E.getWeekTargets(s, cacheOf(s), m, 4, DK, ex);
    check('the week after a swap HOLDS the swapped week\'s target', [t4.weightTargets[0], t4.repsTargets[0]], [t3.weightTargets[0], t3.repsTargets[0]]);
    const p4 = E.getWeekTargets(plain, cacheOf(plain), plain.macrocycles[0], 4, DK, ex);
    check('…where, unmarked, the substitute\'s 10 kg would have set it (the control inside)', p4.weightTargets[0] === t4.weightTargets[0], false);
    const c3 = E.getWeekComplianceResult(s, cacheOf(s), m, 3, DK, ex);
    check('the swapped week is not judged (substituted, not fully logged)', [c3.substituted, c3.fullyLogged], [true, false]);
    check('…so the lock never moves on it', E.computeLockTransition(s, cacheOf(s), m, 3, DK, ex), null);
    check('…where, unmarked, the substitute\'s numbers would lock the exercise', !!(E.computeLockTransition(plain, cacheOf(plain), plain.macrocycles[0], 3, DK, ex) || {}).set, true);
    check('getLastCompliantWeek walks past a swapped week, as past a deload', E.getLastCompliantWeek(s, cacheOf(s), m, DK, ex, 4) !== 3, true);
    const d3 = E.computeExerciseProgression(s, cacheOf(s), m, 3, DK, ex);
    check('Train on the swapped week: no target, no last week', [d3.isSwapped, d3.weightPlaceholders.every(x => x === ''), d3.prevLoggedSets.every(x => x === null), d3.missedTarget],
      [true, true, true, false]);
    const d4 = E.computeExerciseProgression(s, cacheOf(s), m, 4, DK, ex);
    check('Train on the week after: the held target, and the substitute\'s sets hidden from "Last wk"',
      [d4.heldAfterSwap, d4.weightPlaceholders[0], d4.prevLoggedSets.every(x => x === null), d4.prevProgType], [true, t3.weightTargets[0], true, null]);
    const h = E.recordExerciseHistory(s, { today: '2026-08-02' }, m, 3, DK, ex);
    check('history files the swap under the SUBSTITUTE\'s name', h && h.name, 'lying leg curl');
    check('no marker: nothing about the card changes shape', ['isSwapped', 'heldAfterSwap'].some(k => k in E.computeExerciseProgression(plain, cacheOf(plain), plain.macrocycles[0], 4, DK, ex)), false);
  }

  // ── 2. A group session replacing a planned one (§11 Q21) ─────────────────
  {
    const s = demo(), m = s.macrocycles[0];
    const first = E.getNextIncompleteSession(s, m);
    s.substitutions = {};
    for (const ex of s.exercises[`${MID}_1_${first.dayKey}`]) s.substitutions[`${MID}_${first.dayKey}_${ex.id}_w${first.week}`] = { kind: 'group', sessionId: 'g1' };
    const row = E.getAllMacroSessions(s, m).find(x => x.week === first.week && x.dayKey === first.dayKey);
    check('the planned session a group replaced counts as DONE, with nothing logged', row.done, true);
    const next = E.getNextIncompleteSession(s, m);
    check('…and "next" moves on', !!next && (next.week !== first.week || next.dayKey !== first.dayKey), true);
    const ag = E.getTrainAgendaUnits(s, { today: '2026-08-02' }, m, null).units.flatMap(u => u.sessions).find(x => x.week === first.week && x.dayKey === first.dayKey);
    check('the agenda marks it replaced and done', [ag.groupReplaced, ag.done], [true, true]);
    check('a group session never files history for the planned exercise',
      E.recordExerciseHistory(s, { today: '2026-08-02' }, m, first.week, first.dayKey, s.exercises[`${MID}_1_${first.dayKey}`][0]), null);
  }

  // ── 3. I2: the replay after a coach-logged week ─────────────────────────
  {
    // The phone has weeks 1–3 logged; it has viewed week 5 (cached from nothing
    // for week 4, so theoretical). The coach then logs week 4.
    const base = () => {
      const s = cold(demo());
      for (const k of Object.keys(s.trainLogs)) if (/_(4|5)_session0m1_/.test(k.slice(MID.length))) delete s.trainLogs[k];
      return s;
    };
    const s = base(), m = s.macrocycles[0], ex = s.exercises[`${MID}_1_${DK}`][0];
    const before3 = JSON.stringify(E.getWeekTargets(s, cacheOf(s), m, 3, DK, ex));
    const stale5 = E.getWeekTargets(s, cacheOf(s), m, 5, DK, ex).weightTargets[0];
    const t4 = E.getWeekTargets(s, cacheOf(s), m, 4, DK, ex);
    const n4 = E.getWeekSets(ex, 4, m.weeks);
    const hit = String(parseFloat(t4.weightTargets[0]) + 5); // beat the target: compliant
    for (let i = 0; i < n4; i++) s.trainLogs[setKey(4, 0, i)] = { weight: hit, reps: '20', done: true, loggedBy: 'coach' };
    const r = E.replayProgressionAfterLog(s, cacheOf(s), m, 4, DK, [ex]);
    check('I2: a later UNLOGGED week\'s cached target is dropped', r.deleteTargets.includes(`${MID}_${DK}_${EX(0)}_w5`), true);
    for (const k of r.deleteTargets) delete s.progressionTargets[k];
    Object.assign(s.progressionTargets, r.setTargets);
    const fresh5 = E.getWeekTargets(s, cacheOf(s), m, 5, DK, ex).weightTargets[0];
    check('…and recomputes from the coach\'s numbers (not the stale theoretical one)', [fresh5 !== stale5, parseFloat(fresh5) > parseFloat(hit)], [true, true]);
    check('a LOGGED week\'s target never changes (§0)', JSON.stringify(E.getWeekTargets(s, cacheOf(s), m, 3, DK, ex)), before3);

    const s2 = base(), m2 = s2.macrocycles[0];
    E.getWeekTargets(s2, cacheOf(s2), m2, 5, DK, ex);
    s2.trainLogs[setKey(5, 0, 0)] = { weight: '1', reps: '1', done: false }; // the client started week 5
    for (let i = 0; i < n4; i++) s2.trainLogs[setKey(4, 0, i)] = { weight: '5', reps: '1', done: true, loggedBy: 'coach' };
    const r2 = E.replayProgressionAfterLog(s2, cacheOf(s2), m2, 4, DK, [ex]);
    check('a later week the client has STARTED keeps its target', r2.deleteTargets.includes(`${MID}_${DK}_${EX(0)}_w5`), false);
    check('the lock replays: a coach-logged miss locks the exercise at week 4', r2.locks[`${MID}_${DK}_${EX(0)}`] && r2.locks[`${MID}_${DK}_${EX(0)}`].lockedAtWeek, 4);
    check('the replay writes nothing itself', [s2.progressionLocks[`${MID}_${DK}_${EX(0)}`] || null], [null]);
  }

  // ── 4. BLOC: the session_log applier ─────────────────────────────────────
  const factory = build(html);
  check('BLOC has the applier, Swap for today and the banners', !!factory, true);
  if (!factory) return failures;
  {
    const env = envFor(E);
    const B = factory(env);
    env.state.trainLogs[setKey(5, 1, 0)] = { weight: '99', reps: '9', done: true }; // the client's own set, in the session
    const sl = pub('session_log', { session_id: 'ses1', booking_id: 'bk1', macro_id: MID, week: 5, day_key: DK, kind: 'in_person',
      logs: { [EX(0)]: { sets: [{ weight: 62.5, reps: 8 }, { weight: 62.5, reps: 7 }] }, [EX(2)]: [{ weight: 45, reps: 12, done: false }] },
      rpe: { [EX(0)]: 8, [EX(2)]: 'skipped' } });
    const r = B.applyPublications([sl]);
    const lg = B.state.trainLogs[setKey(5, 0, 0)];
    check('applied, with a receipt', [B.coachLedger()[sl.id].status, r.acks.length], ['applied', 1]);
    check('a coach set: strings as Train stores them, done, stamped loggedBy / loggedAt / sessionId',
      lg, { weight: '62.5', reps: '8', done: true, loggedBy: 'coach', loggedAt: '2026-08-04T18:30:00Z', sessionId: 'ses1' });
    check('done:false from the coach is kept', B.state.trainLogs[setKey(5, 2, 0)].done, false);
    check('I3: the whole session is the coach\'s: the client\'s set in it is replaced…', B.state.trainLogs[setKey(5, 1, 0)], undefined);
    check('…and kept on the record', B.state.coachSessionLogs[sl.id].replacedClientLogs[setKey(5, 1, 0)].weight, '99');
    check('§11 Q13: the coach\'s ratings are marked', [B.state.rpe[`${MID}_5_${DK}_${EX(0)}`], B.state.rpe[`${MID}_5_${DK}_${EX(2)}`]],
      [{ rpe: 8, ratedBy: 'coach' }, { rpeSkipped: true, ratedBy: 'coach' }]);
    check('Train reads it as the coach\'s session', B.coachOwnedSession(MID, 5, DK).kind, 'logged');
    Object.assign(B.state, { currentMacroId: MID, currentWeek: 5, currentDay: DK });
    check('…with the wireframe\'s notice', /<b>Logged by your coach · in person<\/b>Sam logged this session with you on Tue 4 Aug/.test(B.trainCoachNoticeHTML(B.state.macrocycles[0])), true);
    const again = pub('session_log', Object.assign({}, sl.payload, { logs: { [EX(0)]: [{ weight: 65, reps: 8 }] } }), { supersedes: sl.id });
    B.applyPublications([again]);
    check('a correction (same session) replaces the coach\'s sets', [B.state.trainLogs[setKey(5, 0, 0)].weight, B.state.trainLogs[setKey(5, 0, 1)]], ['65', undefined]);
    const bad = pub('session_log', { session_id: 'ses2', macro_id: MID, week: 5, day_key: DK, logs: { nope: [{ weight: 1, reps: 1 }] } });
    const before = JSON.stringify(B.state.trainLogs);
    check('an exercise this phone doesn\'t have: held, nothing written', [B.applyPublications([bad]).acks[0].status, JSON.stringify(B.state.trainLogs) === before], ['needs_attention', true]);
    // 🚨 v8.40's unlink left coachSessionLogs as [] (found in the v8.43 UAT): a
    // record keyed onto an array is dropped by JSON.stringify, so it never
    // reached the saved state. It must survive a save after an unlink.
    const envU = envFor(E); envU.state.coachSessionLogs = [];
    const BU = factory(envU);
    const su = pub('session_log', { session_id: 'sesU', macro_id: MID, week: 5, day_key: DK, kind: 'in_person', logs: { [EX(0)]: [{ weight: 60, reps: 8 }] } });
    BU.applyPublications([su]);
    check('after an unlink ([] left behind), the session\'s record survives a save', !!JSON.parse(JSON.stringify(BU.state)).coachSessionLogs[su.id], true);
    check('a cycle this phone doesn\'t have: held', B.applyPublications([pub('session_log', { session_id: 'ses3', macro_id: 'gone', week: 1, day_key: DK, logs: {} })]).acks[0].status, 'needs_attention');
  }
  {
    // 4d stored a session_log without applying it; its seq is below the cursor.
    const env = envFor(E);
    const B = factory(env);
    env.state.coachLedger = { 'pub-old': { seq: 3, type: 'session_log', status: 'stored', note: null, acked: false } };
    env.state.coachSessionLogs = { 'pub-old': { seq: 3, payload: { v: 1, session_id: 'old', macro_id: MID, week: 6, day_key: DK, kind: 'in_person', logs: { [EX(0)]: [{ weight: 50, reps: 10 }] } } } };
    B.queueStoredSessionLogs();
    const pending = [{ id: 'pub-old', seq: 3, type: 'session_log', payload: env.state.coachSessionLogs['pub-old'].payload }];
    B.applyPublications(pending);
    check('a session_log 4d STORED applies once, from its stored copy', [B.coachLedger()['pub-old'].status, B.state.trainLogs[setKey(6, 0, 0)].loggedBy], ['applied', 'coach']);
  }
  {
    const env = envFor(E);
    const B = factory(env);
    env.state.coachBookings = { bkg: { booking_id: 'bkg', date: '2026-08-06', start_min: 1080 } };
    const g = pub('session_log', { session_id: 'grp1', booking_id: 'bkg', kind: 'group', replaces: { macroId: MID, week: 6, dayKey: DK },
      logs: [{ name: 'Kettlebell swing', sets: [{ weight: 24, reps: 15 }] }] });
    B.applyPublications([g]);
    const marks = Object.values(B.state.substitutions || {}).filter(x => x.kind === 'group' && x.sessionId === 'grp1').length;
    check('a group session is an extra session on the record, dated by its booking', [B.state.coachExtraSessions.grp1.date, B.state.coachExtraSessions.grp1.exercises[0].name], ['2026-08-06', 'Kettlebell swing']);
    check('"replaces" marks every exercise of the planned session', marks, env.state.exercises[`${MID}_1_${DK}`].length);
    check('…which Train shows as the group\'s', B.coachOwnedSession(MID, 6, DK).kind, 'group');
    check('Your sessions lists it: "Group session · logged by coach"', /Group session · logged by coach/.test(B.coachGroupSessionsHTML()), true);
    B.applyPublications([pub('session_log', Object.assign({}, g.payload, { replaces: null }), { supersedes: g.id })]);
    check('a correction without "replaces" hands the planned session back', Object.values(B.state.substitutions).filter(x => x.sessionId === 'grp1').length, 0);
  }

  // ── 5. BLOC: Swap for today ──────────────────────────────────────────────
  {
    const env = envFor(E);
    const B = factory(env);
    Object.assign(env.state, { currentMacroId: MID, currentWeek: 6, currentDay: DK });
    env.state.trainLogs[setKey(6, 0, 0)] = { weight: '41' }; // typed, not done
    B.openSwapToday(MID, 6, DK, EX(0));
    check('the sheet opens, and fits the list to the keyboard (§9)', env.log.includes('open:modal-swap-today'), true);
    const list = env.els.get('swap-today-list').innerHTML;
    check('it lists the client\'s own library (getLibrary()), not the planned exercise', [/lib-row/.test(list), /Lat Pull Machine</.test(list)], [true, false]);
    const names = [...list.matchAll(/lib-row-name">([^<]+)</g)].map(m => m[1]);
    const back = names.filter(n => /Row|Pulldown|Pull/.test(n));
    check('alternatives for the planned exercise\'s body part come first, under their own label',
      [/^\s*<div class="swap-group-label">Other back exercises/.test(list), names.indexOf(back[back.length - 1]) < names.length - 1 && names.slice(0, back.length).every(n => back.includes(n))], [true, true]);
    B.chooseSwapToday(0);
    const sub = B.state.substitutions[`${MID}_${DK}_${EX(0)}_w6`];
    check('choosing marks the week (kind swap, the substitute\'s name) and clears what was typed',
      [sub && sub.kind, !!(sub && sub.name), B.state.trainLogs[setKey(6, 0, 0)], env.saves > 0], ['swap', true, undefined, true]);
    env.state.trainLogs[setKey(6, 0, 0)] = { weight: '20', reps: '10', done: true };
    B.undoSwapToday(MID, 6, DK, EX(0));
    check('"Back to …" asks first when sets are logged, then clears them and the marker',
      [env.confirms.length, B.state.trainLogs[setKey(6, 0, 0)], B.state.substitutions[`${MID}_${DK}_${EX(0)}_w6`]], [1, undefined, undefined]);
    const macro = env.state.macrocycles[0], ex0 = env.state.exercises[`${MID}_1_${DK}`][0];
    check('the card offers it before any set is done, and not after', [/Swap for today/.test(B.swapTodayRowHTML(macro, ex0, 0, false)), B.swapTodayRowHTML(macro, ex0, 1, false)], [true, '']);
    check('never on a superset member or cardio', [B.swapTodayRowHTML(macro, Object.assign({}, ex0, { supersetId: 's' }), 0, false), B.swapTodayRowHTML(macro, Object.assign({}, ex0, { category: 'cardio' }), 0, false)], ['', '']);
    env.state.coachBookings = { b: { booking_id: 'b', date: '2026-08-06', start_min: 1080, assigned_session: { macroId: MID, week: 6, dayKey: DK } } };
    B.chooseSwapToday(0);
    check('the coach\'s session refuses a swap', (B.state.substitutions || {})[`${MID}_${DK}_${EX(0)}_w6`], undefined);
  }

  // ── 6. Banners ────────────────────────────────────────────────────────────
  {
    const env = envFor(E);
    const B = factory(env);
    const m = env.state.macrocycles[0];
    B.applyPublications([pub('plan', { macrocycle: { id: 'macro_c9', name: 'Coach block', start: '2026-10-05', weeks: 4 } })]);
    B.applyPublications([pub('goal_phases', { macro_id: m.id, goals: [{ macroGoalID: 'gx', startDate: '2026-10-05', endDate: '2026-10-18', kcal: 1600, steps: 10000, _blocLabel: 'Cut 3' }] })]);
    B.applyPublications([pub('booking', { booking_id: 'bb', date: '2026-10-01', start_min: 1080, status: 'booked' })]);
    const kinds = (env.state.coachNotices || []).map(n => n.kind);
    check('plan, goal phases and a booking each raise a notice', kinds, ['plan', 'phases', 'booking']);
    check('the goal phases copy is the wireframe\'s', env.state.coachNotices[1].body, '“Cut 3” now starts on Mon 5 Oct at 1,600 kcal and 10,000 steps.');
    B.renderHomeCoachBanner();
    const home = () => env.els.get('home-coach-banner').innerHTML;
    check('Home shows one: the newest', /Session confirmed/.test(home()), true);
    B.dismissCoachNotice(env.state.coachNotices[2].id);
    check('✕ is PERMANENT (saved), and the next one shows', [env.state.coachNotices[2].dismissed, /updated your plan|goal phases/.test(home())], [true, true]);
    B.applyPublications([pub('booking', { booking_id: 'bb', date: '2026-10-02', start_min: 1080, status: 'booked' })]);
    check('a moved booking is news again', /Session moved/.test(home()) || env.state.coachNotices.some(n => n.title === 'Session moved' && !n.dismissed), true);
    env.requests.push({ id: 'rq', status: 'proposed', proposed: { date: '2026-10-03', start_min: 600 }, preferences: [] });
    B.renderHomeCoachBanner();
    check('a proposed time still comes first (it needs an answer)', /proposed a different time/.test(home()), true);
    const again = env.state.coachNotices.length;
    B.applyPublications([pub('plan', {}, { id: env.state.coachNotices[0].id })]);
    check('a re-applied publication (after a restore) raises nothing twice', env.state.coachNotices.length, again);
    B.applyPublications([pub('ai_response', { response_id: 'r9', tool: 'check_in', content: { headline: 'Hi' } })]);
    check('a response shows on Progress, above From your coach', /New check-in from Sam/.test(B.progressCoachBannerHTML()), true);
  }
  return failures;
}

const html = readFileSync(join(repo, 'index.html'), 'utf8');
const eng = readFileSync(join(repo, 'engine/dist/bloc-engine.js'), 'utf8');
const failed = await run('now', html, eng);
let cf = 0;
try { cf = await run('control v8.42', git('index.html'), git('engine/dist/bloc-engine.js'), true); } catch (e) { cf = 1; }
console.log(cf > 0 ? '✓ control: v8.42 (ee1a2b9) fails, as it must' : '✗ control: v8.42 passed; the checks prove nothing');
if (failed || !cf) { console.log(`FAIL: ${failed} check(s) failed.`); process.exit(1); }
console.log('All checks passed.');
