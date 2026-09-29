#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-publications-apply.mjs
//
// WHAT IT PROTECTS (v8.39, TECHNICAL §131; PROMPT-03 Phase 4d): the coach →
// client path. Every change a coach makes reaches the client's `state`
// through applyPublications(), the one funnel.
//
// 🚨 THE TRAPS (deep dive §5):
//   · I6 — a publication is a PATCH. The client's own fields on a cycle
//     (its `review`, …) must survive a coach's plan.
//   · I10 — a plan whose cycle would overlap another is HELD
//     (needs_attention), never forced, and retried on the next pull.
//   · I8 — the ledger lives in `state`, so an older state (a restore) pulls
//     from an earlier cursor and re-applies; applying twice changes nothing.
//   · I7 — nothing applies while a sheet is open, a Train input has focus,
//     the goal queue runs, or a pretend "today" is set.
//   · I5 — a coach's AI response goes to coachAdvice, never blocAdvice.
//   · §0 — targets for weeks NOT logged may change; logged weeks never do.
//   · A held publication must not re-send the same receipt on every pull.
//   · Unlinked: nothing queued may land afterwards.
//   · Receipts are INSERT-or-UPDATE, never .upsert(): 0023 grants UPDATE on
//     status/note/acked_at only, and an upsert SETs every column (refused
//     live in the 4d UAT). The fake table below refuses an upsert the same way.
//
// Runs the real functions from index.html on the demo dataset. CONTROL:
// v8.38 (c5949c3) has no funnel.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const current = readFileSync(join(repo, 'index.html'), 'utf8');
const demo = JSON.parse(readFileSync(join(repo, 'bloc-demo-data.json'), 'utf8'));

function extract(source, name) {
  for (const marker of [`async function ${name}(`, `function ${name}(`]) {
    const start = source.indexOf(marker);
    if (start === -1) continue;
    let depth = 0;
    for (let i = source.indexOf('{', start); i < source.length; i++) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}') { depth--; if (depth === 0) return source.slice(start, i + 1); }
    }
  }
  return null;
}
function extractConst(source, name) {
  const start = source.indexOf(`const ${name} =`);
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    const c = source[i];
    if (c === '[' || c === '{' || c === '(') depth++;
    else if (c === ']' || c === '}' || c === ')') depth--;
    else if (c === ';' && depth === 0) return source.slice(start, i + 1);
  }
  return null;
}
const FNS = ['coachLedger', 'publicationCursor', 'publicationsMustWait', 'pubCopy', 'applyPlanPublication', 'invalidateUnloggedTargets',
  'applyGoalsPatch', 'applyGoalPhasesPublication', 'applyAiResponsePublication', 'applyBookingPublication', 'applyMeasurementPublication',
  'applyNoteReplyPublication', 'applyPublications', 'drainPublications', 'sendPendingAcks',
  // v8.43 (§137): a coach-logged session applies now, and the appliers raise the banners.
  'trainSetKeysFor', 'coachSessionPlace', 'applySessionLogPublication', 'applyGroupSessionLog', 'queueStoredSessionLogs',
  'addCoachNotice', 'addGoalPhasesNotice',
  // v8.44 (§142): the coach's request for cycle-review photos.
  'applyPhotoRequestPublication', 'dismissPhotoRequestNotices'];
const CONSTS = ['PUB_MACRO_FIELDS', 'COACH_LOG_NUM_FIELDS', 'COACH_NOTICE_KEEP', 'PUB_APPLIERS'];
// Absent from the older builds the controls run (bdb3f58, c5949c3): stubbed
// there, so each control still fails only for the reason it exists.
const OPTIONAL = new Set(['trainSetKeysFor', 'coachSessionPlace', 'applySessionLogPublication', 'applyGroupSessionLog',
  'queueStoredSessionLogs', 'addCoachNotice', 'addGoalPhasesNotice', 'COACH_LOG_NUM_FIELDS', 'COACH_NOTICE_KEEP',
  'applyPhotoRequestPublication', 'dismissPhotoRequestNotices']);

function build(source) {
  const bodies = FNS.map(n => extract(source, n) || (OPTIONAL.has(n) ? `function ${n}() {}` : null));
  const consts = CONSTS.map(n => extractConst(source, n) || (OPTIONAL.has(n) ? `const ${n} = undefined;` : null));
  const legacy = extract(source, 'storeSessionLogPublication'); // v8.39–v8.42's PUB_APPLIERS names it
  if (legacy) bodies.push(legacy);
  if (bodies.some(b => !b) || consts.some(c => !c)) return null;
  // PUB_APPLIERS references the functions, so it goes after them.
  return new Function('env', `
    let state = env.state, _tourAnchorDate = null, _goalQueue = null, supabase = env.supabase, _authResolvedSession = { user: { id: 'u1' } };
    const document = env.document, PUB_RETRY_MS = 1;
    let _pubPending = [], _pubRetryTimer = null;
    const demoTourIsRunning = () => false, coachingAvailable = () => true, isCoachedMode = () => env.coached;
    const save = () => env.saves++, showScreen = n => env.rendered.push(n);
    const setTimeout = () => 0;
    const findMacroClash = (cand, macros, excludeId) => env.engine.findMacroClash(cand, macros, excludeId, { now: () => new Date('2026-09-28T12:00:00') });
    const BlocEngine = env.engine, getLocalToday = () => '2026-09-28', coachFirstName = () => 'Sam';
    const coachDayFmt = d => String(d), coachDateTimeFmt = (d, m) => d + ' ' + m, coachBookingWeekly = b => !!b && b.kind === 'weekly';
    const coachToolMeta = () => ({ label: 'Check-in' });
    const getMacroEffectiveMesoCount = m => env.engine.getMacroEffectiveMesoCount(m), getProgKey = env.engine.getProgKey, getRpeKey = env.engine.getRpeKey;
    const progressionTargetCache = () => ({ get: k => (state.progressionTargets || {})[k], set: (k, v) => { state.progressionTargets[k] = v; } });
    const recordExerciseHistory = () => {};
    ${consts.slice(0, 3).join('\n')}
    ${bodies.join('\n')}
    ${consts[3]}
    return {
      get state() { return state; }, set state(v) { state = v; },
      setGoalQueue: v => { _goalQueue = v; }, setAnchor: v => { _tourAnchorDate = v; },
      queue: pubs => { _pubPending.push(...pubs); }, pending: () => _pubPending.length,
      ${FNS.join(', ')}
    };
  `);
}

// The built engine, as BLOC loads it (the shared loader other scripts use).
async function engine() {
  await import('./engine-global.mjs');
  return globalThis.BlocEngine;
}

function doc(opts = {}) {
  return {
    getElementById: () => null, // v8.42: the request sheet's redraw looks it up
    querySelector(sel) {
      if (sel === '.modal-overlay.open') return opts.sheetOpen ? {} : null;
      // v8.42 (§136): a data-pub-safe sheet (Request a session) doesn't block.
      if (sel === '.modal-overlay.open:not([data-pub-safe])') return opts.sheetOpen && !opts.safeSheet ? {} : null;
      if (sel === '.screen.active') return { id: 'screen-home' };
      return null;
    },
    get activeElement() { return opts.trainInput ? { tagName: 'INPUT', closest: s => (s === '#screen-train' ? {} : null) } : null; },
  };
}
function envFor(eng, over = {}) {
  const e = Object.assign({ state: JSON.parse(JSON.stringify(demo)), engine: eng, saves: 0, rendered: [], coached: true, acks: [], ackFail: false }, over);
  e.document = doc(over);
  // publication_acks as 0023 grants it: INSERT, and UPDATE of status/note/acked_at
  // only. An upsert (ON CONFLICT DO UPDATE SET every column) is REFUSED, exactly
  // as live refused it in the 4d UAT — a fake that accepted it hid the bug.
  const table = new Map();
  e.acksTable = table;
  e.supabase = { from: () => {
    let patch = null; const where = {};
    const chain = {
      upsert: async () => ({ error: { message: 'permission denied for table publication_acks' } }),
      update(p) { patch = p; return chain; },
      eq(c, v) { where[c] = v; return chain; },
      async select() {
        if (e.ackFail) return { data: null, error: { message: 'offline' } };
        if (Object.keys(patch).some(k => !['status', 'note', 'acked_at'].includes(k))) return { data: null, error: { message: 'permission denied for table publication_acks' } };
        const k = where.publication_id + '|' + where.client_id;
        if (!table.has(k)) return { data: [], error: null };
        Object.assign(table.get(k), patch); e.acks.push(Object.assign({ publication_id: where.publication_id }, patch));
        return { data: [{ publication_id: where.publication_id }], error: null };
      },
      async insert(row) {
        if (e.ackFail) return { error: { message: 'offline' } };
        const k = row.publication_id + '|' + row.client_id;
        if (table.has(k)) return { error: { message: 'duplicate key value' } };
        table.set(k, Object.assign({}, row)); e.acks.push(row);
        return { error: null };
      },
    };
    return chain;
  } };
  return e;
}
const COACH = 'coach-1';
let seq = 100;
const pub = (type, payload, extra = {}) => Object.assign({ id: 'pub-' + (++seq), seq, coach_id: COACH, type, payload: Object.assign({ v: 1 }, payload) }, extra);

async function run(source, label) {
  let failures = 0;
  const check = (name, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    console.log(`${ok ? '✓' : '✗'} [${label}] ${name}`);
    if (!ok) console.log(`    expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  };
  const factory = build(source);
  check('the publication funnel exists', !!factory, true);
  if (!factory) return failures;
  const eng = await engine();
  const DEMO_MACRO = demo.macrocycles[0];
  const demoEnd = eng.getMacroEndDate(DEMO_MACRO, { now: () => new Date('2026-09-28T12:00:00') });

  // ── plan: a new cycle, after the demo's
  {
    const e = envFor(eng); const P = factory(e);
    const start = new Date(demoEnd + 'T12:00:00'); start.setDate(start.getDate() + 1 + ((8 - start.getDay()) % 7)); // the Monday after
    const s = start.toISOString().slice(0, 10);
    const p1 = pub('plan', { macrocycle: { id: 'macro_c1', name: 'Coach block', weeks: 2, weeksPerMeso: 2, sessionsPerWeek: 2, start: s, goalType: 'gain', splitType: 'custom', days: ['session0'], dayLabels: { session0: 'Full' } },
      exercises: { macro_c1_1_session0: [{ id: 'ex_c1', name: 'Squat', startWeight: 60, reps: '5', setsStart: 3, setsEnd: 4, order: 0 }] } });
    const r = P.applyPublications([p1]);
    const m = P.state.macrocycles.find(x => x.id === 'macro_c1');
    check('a plan creates the coach\'s cycle, marked as theirs', m && [m.name, m.publishedBy, m.publishedSeq], ['Coach block', COACH, p1.seq]);
    check('…with its session\'s exercises', P.state.exercises.macro_c1_1_session0.map(x => x.name), ['Squat']);
    check('…and an "applied" receipt', r.acks.map(a => a.status), ['applied']);
    check('applying the same batch again changes nothing (idempotent)', [P.applyPublications([p1]).acks.length, P.state.macrocycles.filter(x => x.id === 'macro_c1').length], [0, 1]);
  }

  // ── plan: I6 — a patch keeps the client's own fields
  {
    const e = envFor(eng); const P = factory(e);
    const m0 = P.state.macrocycles[0]; m0.review = { headline: 'Client review' };
    P.applyPublications([pub('plan', { macrocycle: { id: m0.id, name: 'Renamed by coach' } })]);
    const m = P.state.macrocycles[0];
    check("I6: the coach's rename lands, and the client's review survives", [m.name, m.review && m.review.headline, m.start], ['Renamed by coach', 'Client review', m0.start]);
  }

  // ── plan: I10 — a clash is held, not forced; retried later
  {
    const e = envFor(eng); const P = factory(e);
    const before = JSON.stringify(P.state.macrocycles);
    const clashing = pub('plan', { macrocycle: { id: 'macro_x', name: 'Overlapping', weeks: 2, weeksPerMeso: 2, start: DEMO_MACRO.start, days: ['a'] } });
    const r = P.applyPublications([clashing]);
    check('I10: a plan overlapping a cycle is held as needs_attention, with the clash named',
      [r.acks[0].status, /Overlaps/.test(r.acks[0].note || '')], ['needs_attention', true]);
    check('…and nothing about the cycles changed', JSON.stringify(P.state.macrocycles), before);
    check('the cursor stays BELOW a held publication, so the next pull fetches it again', P.publicationCursor() < clashing.seq, true);
    const again = P.applyPublications([clashing]);
    check('held again for the same reason: no fresh receipt is due', P.coachLedger()[clashing.id].acked === false && again.acks.length === 1, true);
    P.state.macrocycles = P.state.macrocycles.filter(m => m.id !== DEMO_MACRO.id); // the client's clash goes away
    check('once the clash is gone, the retry applies it', P.applyPublications([clashing]).acks.map(a => a.status), ['applied']);
    const bad = P.applyPublications([pub('plan', { exercises: { macro_nowhere_1_x: [{ id: 'e' }] } })]);
    check('exercises for a cycle this phone doesn\'t hold are held too', bad.acks[0].status, 'needs_attention');
  }

  // ── §0: unlogged targets reset, logged ones kept
  {
    const e = envFor(eng); const P = factory(e);
    const key = Object.keys(P.state.exercises).find(k => k.startsWith(DEMO_MACRO.id + '_'));
    const ex = P.state.exercises[key][0];
    const dayKey = key.slice(DEMO_MACRO.id.length + 3);
    P.state.progressionTargets = {};
    const tLogged = `${DEMO_MACRO.id}_${dayKey}_${ex.id}_w2`, tFresh = `${DEMO_MACRO.id}_${dayKey}_${ex.id}_w9`;
    P.state.progressionTargets[tLogged] = { weightTargets: ['50'] };
    P.state.progressionTargets[tFresh] = { weightTargets: ['55'] };
    P.state.trainLogs[`${DEMO_MACRO.id}_2_${dayKey}_${ex.id}_0`] = { weight: 50, reps: '8', done: true };
    P.applyPublications([pub('plan', { exercises: { [key]: P.state.exercises[key].map(x => x.id === ex.id ? Object.assign({}, x, { startWeight: 70 }) : x) } })]);
    check('§0: a changed exercise drops the cached target for a week NOT logged, keeps a logged week\'s',
      [tFresh in P.state.progressionTargets, tLogged in P.state.progressionTargets], [false, true]);
  }

  // ── goal_phases, ai_response, booking, measurement, note_reply, session_log
  {
    const e = envFor(eng); const P = factory(e);
    const g = { macroGoalID: 'g_c1', startDate: DEMO_MACRO.start, endDate: DEMO_MACRO.start, kcal: 2000 };
    let r = P.applyPublications([pub('goal_phases', { macro_id: DEMO_MACRO.id, goals: [g] })]);
    check('goal_phases adds the coach\'s phase, marked as theirs', [r.acks[0].status, P.state.goals.find(x => x.macroGoalID === 'g_c1').publishedBy], ['applied', COACH]);
    r = P.applyPublications([pub('goal_phases', { macro_id: DEMO_MACRO.id, goals: [Object.assign({}, g, { kcal: 1900 })], remove_goal_ids: [] })]);
    check('…and a later one replaces it by macroGoalID', [P.state.goals.filter(x => x.macroGoalID === 'g_c1').length, P.state.goals.find(x => x.macroGoalID === 'g_c1').kcal], [1, 1900]);
    r = P.applyPublications([pub('goal_phases', { remove_goal_ids: ['g_c1'] })]);
    check('…or removes it', P.state.goals.some(x => x.macroGoalID === 'g_c1'), false);
    check('goal phases for a cycle not on the phone are held', P.applyPublications([pub('goal_phases', { macro_id: 'macro_nope', goals: [] })]).acks[0].status, 'needs_attention');

    const blocBefore = JSON.stringify(P.state.blocAdvice);
    P.applyPublications([pub('ai_response', { tool: 'check_in', response_id: 'r1', macro_id: DEMO_MACRO.id, content: { headline: 'Good week' } })]);
    P.applyPublications([pub('ai_response', { tool: 'check_in', response_id: 'r1', macro_id: DEMO_MACRO.id, content: { headline: 'Edited' }, updated: true,
      goal_changes: { goals: [{ macroGoalID: 'g_ai', startDate: DEMO_MACRO.start, endDate: DEMO_MACRO.start }] } })]);
    check('I5: the coach\'s response goes to coachAdvice, never blocAdvice', [P.state.coachAdvice.length, P.state.coachAdvice[0].content.headline, P.state.coachAdvice[0].updated, JSON.stringify(P.state.blocAdvice) === blocBefore],
      [1, 'Edited', true, true]);
    check('…and its goal change lands with it (§11 Q9)', P.state.goals.some(x => x.macroGoalID === 'g_ai'), true);

    P.applyPublications([pub('booking', { booking_id: 'b1', date: '2026-10-02', start_min: 1080, duration_min: 60, status: 'booked', assigned_session: { macroId: DEMO_MACRO.id, week: 3, dayKey: 'session0' } })]);
    check('a booking is kept with its assigned session', P.state.coachBookings.b1.assigned_session.week, 3);

    const day = P.state.bodyLogs.find(b => b.steps != null);
    const stepsBefore = day.steps;
    P.applyPublications([pub('measurement', { log_date: day.date, weight: 199.5, waist: null, hip: null })]);
    check('a coach measurement sets the weight and keeps the client\'s steps', [day.weight, day.steps, day.measuredByCoach], [199.5, stepsBefore, true]);

    P.applyPublications([pub('note_reply', { submission_id: 's1', text: 'Nice work' })]);
    check('a reply to a note back is kept', P.state.coachNoteReplies.s1.text, 'Nice work');

    // v8.43 (§137): a coach-logged session now APPLIES (4d stored it). What it
    // writes is verify-coach-logged.mjs's; here, only that the funnel takes it.
    const sl = pub('session_log', { session_id: 'sess1', macro_id: DEMO_MACRO.id, week: 1, day_key: 'session0m1', kind: 'in_person', logs: {} });
    r = P.applyPublications([sl]);
    check('a coach-logged session applies, with its receipt (v8.43; 4d stored it)', [P.state.coachSessionLogs[sl.id].applied, r.acks.length, P.coachLedger()[sl.id].status], [true, 1, 'applied']);
    check('an unknown type is held, not dropped', P.applyPublications([pub('mystery', {})]).acks[0].status, 'needs_attention');

    // v8.44 (§142): a photo request is kept and raises a Home banner; a
    // cancellation (same request_id) closes it; one with no cycle is held.
    const pr = pub('photo_request', { request_id: 'pr1', macro_id: DEMO_MACRO.id });
    r = P.applyPublications([pr]);
    const bannerOf = id => (P.state.coachNotices || []).find(n => n.kind === 'photos' && n.requestId === id);
    check('a photo request is kept, applied, and raises a "photos" Home banner naming the cycle',
      [r.acks[0].status, P.state.coachPhotoRequests.pr1.macroId, P.state.coachPhotoRequests.pr1.cancelled, !!bannerOf('pr1'), (bannerOf('pr1') || {}).dismissed, /“.+”/.test((bannerOf('pr1') || {}).body || '')],
      ['applied', DEMO_MACRO.id, false, true, false, true]);
    P.applyPublications([pub('photo_request', { request_id: 'pr1', macro_id: DEMO_MACRO.id, cancelled: true })]);
    check('…a cancellation closes it and its banner', [P.state.coachPhotoRequests.pr1.cancelled, bannerOf('pr1').dismissed], [true, true]);
    P.state.coachPhotoRequests.pr2 = { macroId: DEMO_MACRO.id, answered: { skipped: true } };
    P.applyPublications([pub('photo_request', { request_id: 'pr2', macro_id: DEMO_MACRO.id })]);
    check('…an answered request is never raised again', !!bannerOf('pr2'), false);
    check('…and one with no cycle is held', P.applyPublications([pub('photo_request', { request_id: 'pr3' })]).acks[0].status, 'needs_attention');
  }

  // ── supersedes
  {
    const e = envFor(eng); const P = factory(e);
    const a = pub('note_reply', { submission_id: 's9', text: 'first' });
    const b = pub('note_reply', { submission_id: 's9', text: 'corrected' }, { supersedes: a.id });
    const r = P.applyPublications([b, a]);
    check('a publication superseded in the same pull is skipped and acked "superseded"', [r.acks.find(x => x.publication_id === a.id).status, P.state.coachNoteReplies.s9.text], ['superseded', 'corrected']);
  }

  // ── I8: the ledger is in state, so an older state re-applies
  {
    const e = envFor(eng); const P = factory(e);
    const old = JSON.parse(JSON.stringify(P.state));
    const n1 = pub('note_reply', { submission_id: 'r8', text: 'hello' });
    P.applyPublications([n1]);
    check('the cursor moves past what was applied', P.publicationCursor(), n1.seq);
    P.state = old; // a restore of an older backup
    check('I8: after a restore the cursor is back where that backup was', P.publicationCursor() < n1.seq, true);
    P.applyPublications([n1]);
    check('…and the pull re-applies what the backup lacked', P.state.coachNoteReplies && P.state.coachNoteReplies.r8.text, 'hello');
  }

  // ── I7: it waits
  for (const [why, over, setup] of [['a sheet is open', { sheetOpen: true }], ['a Train input has focus', { trainInput: true }],
    ['the goal queue is running', {}, P => P.setGoalQueue({ goals: [] })], ['a pretend "today" is set', {}, P => P.setAnchor('2026-08-02')]]) {
    const e = envFor(eng, over); const P = factory(e);
    if (setup) setup(P);
    P.queue([pub('note_reply', { submission_id: 'w1', text: 'x' })]);
    const r = await P.drainPublications();
    check(`I7: nothing applies while ${why}`, [/^waiting:/.test(r), P.pending(), !!(P.state.coachNoteReplies && P.state.coachNoteReplies.w1)], [true, 1, false]);
  }
  {
    // v8.42 (§136): Request a session is data-pub-safe (it never saves state).
    const e = envFor(eng, { sheetOpen: true, safeSheet: true }); const P = factory(e);
    P.queue([pub('note_reply', { submission_id: 'w3', text: 'x' })]);
    const r = await P.drainPublications();
    check('v8.42: a data-pub-safe sheet (Request a session) does not hold it back', [r, !!(P.state.coachNoteReplies && P.state.coachNoteReplies.w3)], ['applied', true]);
  }
  {
    const e = envFor(eng); const P = factory(e);
    P.queue([pub('note_reply', { submission_id: 'w2', text: 'x' })]);
    const r = await P.drainPublications();
    check('when nothing blocks it: applied, saved, the screen re-rendered, and acked', [r, e.saves > 0, e.rendered, e.acks.map(a => a.status)], ['applied', true, ['home'], ['applied']]);
    // The receipt changes later (a held one now applied): an UPDATE, never an upsert.
    const rid = Object.keys(P.coachLedger())[0];
    P.coachLedger()[rid].status = 'needs_attention'; P.coachLedger()[rid].note = 'later'; P.coachLedger()[rid].acked = false;
    await P.sendPendingAcks();
    check('a changed receipt updates the existing row (status/note only), never an upsert', [e.acksTable.size, [...e.acksTable.values()][0].status, P.coachLedger()[rid].acked], [1, 'needs_attention', true]);
    const e2 = envFor(eng, { ackFail: true }); const P2 = factory(e2);
    P2.queue([pub('note_reply', { submission_id: 'w3', text: 'x' })]);
    await P2.drainPublications();
    const id = Object.keys(P2.coachLedger())[0];
    check('a receipt that fails to send stays owed, for the next pull', P2.coachLedger()[id].acked, false);
    const e3 = envFor(eng, { coached: false }); const P3 = factory(e3);
    P3.queue([pub('note_reply', { submission_id: 'w4', text: 'x' })]);
    check('unlinked since the fetch: the queue is dropped, nothing lands', [await P3.drainPublications(), P3.pending(), !!P3.state.coachNoteReplies], ['not-coached', 0, false]);
  }

  // ── Wiring
  const body = n => extract(source, n) || '';
  check('the link cache learns the card id (client_record_id)', /client_record_id/.test(body('refreshCoachLink')), true);
  check('resume and sign-in pull, after the link is re-checked', /requestPublicationPull\('resume'\)/.test(body('maybeRefreshCoachLink')), true);
  check('a new link pulls at once (publications held before the link arrive now)', /requestPublicationPull\('linked'\)/.test(body('coachAgreeAndLink')), true);
  check('unlinking closes the Realtime channel', /syncPublicationChannel\(\)/.test(body('unlinkCoach')), true);
  check('the pull asks only for this card, after the cursor, in order',
    ['client_record_id', "gt('seq', publicationCursor())", "order('seq'"].every(s => body('pullPublicationsOnce').includes(s)), true);
  return failures;
}

const failures = await run(current, 'now');

// CONTROL for the receipt fix: bdb3f58 (v8.39 as first built) sent receipts
// with .upsert(), which the live table refused. Against this file's fake table
// (which refuses an upsert as 0023's grants do) its receipt must stay owed.
{
  const bdb = execFileSync('git', ['show', 'bdb3f58:index.html'], { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const factory = build(bdb);
  const e = envFor(await engine()); const P = factory(e);
  P.queue([pub('note_reply', { submission_id: 'ctl', text: 'x' })]);
  const orig = console.warn; console.warn = () => {};
  try { await P.drainPublications(); } finally { console.warn = orig; }
  const id = Object.keys(P.coachLedger())[0];
  const ok = P.coachLedger()[id].acked === false && e.acksTable.size === 0;
  console.log(`${ok ? '✓' : '✗'} control: bdb3f58's .upsert() receipt is refused by the grant-accurate fake (it stays owed)`);
  if (!ok) process.exitCode = 1;
}

const control = execFileSync('git', ['show', 'c5949c3:index.html'], { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
{
  console.log('\n— control: v8.38 (c5949c3), which must fail —');
  const orig = console.log; const lines = []; console.log = (s) => lines.push(String(s));
  let cf;
  try { cf = await run(control, 'v8.38'); } finally { console.log = orig; }
  if (cf > 0 && lines.some(l => l.startsWith('✗') && /the publication funnel exists/.test(l))) console.log('✓ control: v8.38 has no publication funnel');
  else { console.log('✗ control: v8.38 did not fail'); process.exitCode = 1; }
}

if (failures) { console.log(`\nFAIL: ${failures} check(s)`); process.exitCode = 1; }
else console.log('\nAll checks pass.');
