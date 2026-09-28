#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-coached-sessions.mjs — v8.42, PROMPT-03 Phase 4e-3, TECHNICAL §136
//
// THE RULES THIS PROTECTS (proposal §4.3, §5.6, §11 Q23):
//   · A session assigned to a coach's booking is the COACH'S from that
//     moment: read-only in Train, and never the client's "next": the
//     engine's getNextIncompleteSession() steps over it (so Home's Up next,
//     Train's default and the agenda's Up next all move on). A moved booking
//     keeps it; a CANCELLED one hands it back.
//     🚨 In the ENGINE, so BLOC Coach's "client's next unfinished session"
//     (Phase 5's booking picker default) gives the same answer.
//   · Every Train handler that writes a log refuses on the coach's session.
//   · Home: "Your next session" (the earliest live booking from today) and
//     Request a session; "{coach} suggested a time" when there's an answer due.
//   · Request a session: 1–3 times or one day with a window, from tomorrow,
//     as 0024's session_request_slots_ok() accepts; the client can withdraw,
//     confirm the coach's time, or counter with ONE slot (0024 keeps one).
//
// Control: v8.41 (c67d610) must fail.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { mainScript, indexTopLevel, closure } from './golden/extract-engine.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTROL = 'c67d610';
const git = p => execFileSync('git', ['show', `${CONTROL}:${p}`], { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const demo = JSON.parse(readFileSync(join(repo, 'bloc-demo-data.json'), 'utf8'));
const clone = v => JSON.parse(JSON.stringify(v));
const engineOf = src => { const c = {}; vm.runInNewContext(src + '\n;this.BlocEngine = BlocEngine;', c); return c.BlocEngine; };

// 🚨 The Train writers are DERIVED from the code, never listed by hand: every
// top-level function that writes state.trainLogs or state.rpe (plus the lock
// recheck that runs on blur). A hand list missed quickFillComplete, the card's
// ✓ button, whose onclick is built inside a template expression; Adam ticked a
// coach's session complete in the v8.42 UAT. Plan's delete functions are
// excluded: Plan doesn't exist in Coached mode (§132).
const PLAN_ONLY = new Set(['deleteExercise', 'deleteSupersetGroup', 'deleteMacrocycle']);
function trainWriters(decls) {
  const out = [];
  for (const [name, d] of decls) {
    if (!/^(async\s+)?function\s/.test(d.text) || PLAN_ONLY.has(name)) continue;
    if (/state\.trainLogs\[[^\]]+\]\s*(=|\.)|delete state\.trainLogs|state\.rpe\[[^\]]+\]\s*=|delete state\.rpe/.test(d.text)) out.push(name);
  }
  return out.concat(decls.has('recheckProgressionLockForKey') ? ['recheckProgressionLockForKey'] : []);
}

async function run(label, html, engineSrc) {
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

  // ── 1. The engine ────────────────────────────────────────────────────────
  check('the engine has getCoachAssignment()', typeof E.getCoachAssignment, 'function');
  if (typeof E.getCoachAssignment === 'function') {
    const base = clone(demo);
    const m = base.macrocycles[0];
    const first = E.getNextIncompleteSession(base, m);
    const book = (s, over = {}) => { s.coachBookings = Object.assign(s.coachBookings || {}, { [over.booking_id || 'bk1']: Object.assign({ booking_id: 'bk1', date: '2026-08-04', start_min: 1080, status: 'booked', assigned_session: { macroId: m.id, week: first.week, dayKey: first.dayKey } }, over) }); return s; };
    const s1 = book(clone(demo));
    const second = E.getNextIncompleteSession(s1, s1.macrocycles[0]);
    check('an assigned, unfinished session is stepped over: "next" moves to the following unfinished one',
      [!!second, second && (second.week !== first.week || second.dayKey !== first.dayKey)], [true, true]);
    const all = E.getAllMacroSessions(base, m).filter(x => !x.done);
    check('…and it is exactly the NEXT unfinished one after it', [second.week, second.dayKey], [all[1].week, all[1].dayKey]);
    const s2 = book(clone(demo), { status: 'cancelled' });
    check('a cancelled booking hands it back: it is "next" again', E.getNextIncompleteSession(s2, s2.macrocycles[0]), first);
    const s3 = book(clone(demo), { date: '2026-08-11', start_min: 420 });
    check('a MOVED booking keeps its session (same booking, new date)', E.getCoachAssignment(s3, m.id, first.week, first.dayKey).date, '2026-08-11');
    const s4 = book(book(clone(demo)), { booking_id: 'bk0', date: '2026-08-03', start_min: 600 });
    check('two live bookings on one session: the earliest wins', E.getCoachAssignment(s4, m.id, first.week, first.dayKey).booking_id, 'bk0');
    check('a different session is not assigned', E.getCoachAssignment(s1, m.id, first.week + 1, first.dayKey), null);
    const ag = E.getTrainAgendaUnits(s1, { today: '2026-08-02' }, s1.macrocycles[0], null);
    const rows = ag.units.flatMap(u => u.sessions);
    const theRow = rows.find(x => x.week === first.week && x.dayKey === first.dayKey);
    check('the agenda marks it "with your coach" (date and time) and moves Up next',
      [theRow.withCoach, theRow.upNext, rows.filter(x => x.withCoach).length, rows.find(x => x.upNext).dayKey === second.dayKey && rows.find(x => x.upNext).week === second.week],
      [{ date: '2026-08-04', start_min: 1080 }, false, 1, true]);
    check('no bookings: no agenda row carries withCoach (the golden outputs stay byte-identical)',
      E.getTrainAgendaUnits(base, { today: '2026-08-02' }, m, null).units.flatMap(u => u.sessions).some(x => 'withCoach' in x), false);
  }

  // ── 2. Train is read-only on the coach's session ─────────────────────────
  const writers = trainWriters(decls);
  check('the Train writers found in the code include the card ✓ (quickFillComplete) and the effort sheet',
    ['quickFillComplete', 'quickFillCompleteDropset', 'setRpeRating', 'closeRpeSheet', 'toggleSetDone', 'logSet'].every(n => writers.includes(n)), true);
  for (const fn of writers) {
    const d = decls.get(fn);
    check(`${fn}() refuses on the coach's session`, !!d && /^[^{]*\{\s*(\/\/[^\n]*\n\s*)*if \(trainViewCoachOwned\(\)\)/.test(d.text), true);
  }
  const rtd = decls.get('renderTrainDay');
  check('renderTrainDay() shows the notice and locks the controls', !!rtd && /trainCoachNoticeHTML\(macro\) \+ html/.test(rtd.text) && /applyTrainCoachLock\(\)/.test(rtd.text), true);

  // ── 3. BLOC: Home row, requests ──────────────────────────────────────────
  let F = null;
  try {
    const seeds = ['homeNextSessionHTML', 'nextCoachBooking', 'coachReqSlots', 'sendCoachRequest', 'answerCoachRequest', 'sendCoachCounter',
      'startCoachCounter', 'trainViewCoachOwned', 'coachSessionWhen', 'openCoachRequest', 'coachWaitingCardHTML', 'coachProposedCardHTML', 'coachRequestBooked', 'coachSlotLine', 'coachReqFormHTML'];
    for (const n of seeds) if (!decls.has(n)) throw new Error('missing ' + n);
    const stubs = ['state', 'coachLinkGet', 'coachingAvailable', 'isCoachedMode', 'supabase', '_authResolvedSession', 'getLocalToday',
      'renderHomeHero', 'openModal', 'document', 'getCoachAssignment', 'toLocalDateStr'];
    const parts = closure(decls, seeds, new Set(stubs));
    F = env => new Function('env', `
      let state = env.state;
      const coachLinkGet = () => ({ coachId: 'coach-1', coachName: 'Sam Rivers' });
      const coachingAvailable = () => true, isCoachedMode = () => true;
      const supabase = env.supabase;
      const _authResolvedSession = { user: { id: 'u1' } };
      const getLocalToday = () => '2026-09-28';
      const renderHomeHero = () => {}, openModal = () => {};
      const document = { getElementById: () => null };
      const getCoachAssignment = (m, w, d) => env.E.getCoachAssignment(state, m, w, d);
      const toLocalDateStr = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      ${parts.map(p => p.text).join('\n')}
      return { ${seeds.join(', ')}, setRequests: r => { _coachRequests = r; }, form: () => _coachReqForm, setCounter: c => { _coachCounterFor = c; } };`)(env);
  } catch (e) { F = null; }
  check('the Home row and Request a session exist', !!F, true);
  if (F) {
    const calls = [];
    const chain = table => {
      const q = { table };
      const c = {
        insert: row => { calls.push(['insert', table, row]); return Promise.resolve({ error: null }); },
        update: patch => ({ eq: (col, v) => { calls.push(['update', table, patch, v]); return Promise.resolve({ error: null }); } }),
        select: () => c, eq: () => c, order: () => c, limit: async () => ({ data: [], error: null }),
      };
      void q; return c;
    };
    const mk = st => F({ state: st, E, supabase: { from: chain } });
    const st = { macrocycles: [], coachBookings: {
      old: { booking_id: 'old', date: '2026-09-20', start_min: 600, status: 'booked' },
      c: { booking_id: 'c', date: '2026-09-29', start_min: 540, status: 'cancelled' },
      b2: { booking_id: 'b2', date: '2026-10-02', start_min: 1080, status: 'booked' },
      b1: { booking_id: 'b1', date: '2026-09-30', start_min: 1080, status: 'booked' },
    } };
    const G = mk(st);
    check('Your next session = the earliest live booking from today (past and cancelled ignored)', G.nextCoachBooking().booking_id, 'b1');
    const h = G.homeNextSessionHTML();
    check('…shown in the wireframe\'s short form, "Your next session · Wed 18:00" (within the week), with Request a session', [/Your next session/.test(h), /<b>Wed 18:00<\/b>/.test(h), /Request a session/.test(h)], [true, true, true]);
    G.setRequests([{ id: 'r1', status: 'proposed', proposed: { date: '2026-10-01', start_min: 1080 }, preferences: [] }]);
    check('a proposed time due an answer: "{coach} suggested a time" and "Answer Sam"', [/Sam suggested a time/.test(G.homeNextSessionHTML()), /Answer Sam/.test(G.homeNextSessionHTML())], [true, true]);
    const wk = mk({ macrocycles: [], coachBookings: { w: { booking_id: 'w', date: '2026-09-30', start_min: 1080, status: 'booked', kind: 'weekly' } } }).homeNextSessionHTML();
    check('the row carries the wireframe\'s calendar icon, and a weekly booking says "Weekly" on its second line', [/<svg[^>]*>.*M3 6\.5a2 2/.test(wk), /<span class="sub">Weekly<\/span>/.test(wk)], [true, true]);
    const I = mk({ macrocycles: [], coachBookings: {} });
    // The rebuilt sheet (Adam, UAT: to the wireframe; "Show all that aren't booked").
    check('the wireframe\'s slot format: "Wed 30 Sep · 18:00" / "Thu 1 Oct · any time 17:00–20:00"',
      [/^Wed 30 Sept? · 18:00$/.test(I.coachSlotLine({ date: '2026-09-30', start_min: 1080 })), /^Thu 1 Oct · any time 17:00–20:00$/.test(I.coachSlotLine({ date: '2026-10-01', start_min: 1020, end_min: 1200 }))], [true, true]);
    const prop = I.coachProposedCardHTML({ id: 'p', status: 'proposed', proposed: { date: '2026-09-30', start_min: 1080 }, preferences: [{ date: '2026-10-01', start_min: 1080 }] });
    check('a suggested time is the eye-catching card: "{coach} proposed", "Needs your answer", "✓ Confirm Wed 18:00", Suggest another time',
      [/is-proposed/.test(prop), /Sam proposed/.test(prop), /Needs your answer/.test(prop), /✓ Confirm Wed 18:00/.test(prop), /Suggest another time/.test(prop), /You asked for Thu 1 Oct · 18:00/.test(prop)], [true, true, true, true, true, true]);
    // One row per request: its latest state and a status (Adam, UAT: "seeing the history … is not valuable").
    const row = r => I.coachWaitingCardHTML(r).replace(/\s+/g, ' ');
    const acc = row({ id: 'a', status: 'accepted', proposed: { date: '2026-09-30', start_min: 1080 }, preferences: [{ date: '2026-10-01', start_min: 1080 }], repeat_weekly: true });
    check('confirmed, not yet booked: ONE row, the confirmed time, weekly, a Confirmed chip; not what was first asked',
      [/Wed 30 Sept? · 18:00 · weekly/.test(acc), />Confirmed</.test(acc), /Thu 1 Oct/.test(acc), (acc.match(/coach-reqrow"/g) || []).length], [true, true, false, 1]);
    const I2 = mk({ macrocycles: [], coachBookings: { b: { booking_id: 'b', date: '2026-09-30', start_min: 1080, status: 'booked' } } });
    check('🚨 a request that has been booked leaves this sheet (it is a session now)',
      [I2.coachRequestBooked({ status: 'accepted', proposed: { date: '2026-09-30', start_min: 1080 } }), I.coachRequestBooked({ status: 'accepted', proposed: { date: '2026-09-30', start_min: 1080 } })], [true, false]);
    const ctr = row({ id: 'c', status: 'countered', proposed: { date: '2026-10-06', start_min: 1140 }, counter: { date: '2026-10-07', start_min: 420, end_min: 540 }, preferences: [{ date: '2026-10-06', start_min: 1080 }] });
    check('countered: the row is YOUR latest time only (not your first ask, not the coach\'s), Waiting for {coach}, no Withdraw',
      [/Wed 7 Oct · any time 07:00–09:00/.test(ctr), /Tue 6 Oct/.test(ctr), /Waiting for Sam/.test(ctr), /Withdraw/.test(ctr)], [true, false, true, false]);
    const pend = row({ id: 'w', status: 'pending', preferences: [{ date: '2026-10-01', start_min: 1080 }, { date: '2026-10-02', start_min: 420 }], notes: 'Knees' });
    check('pending: the first choice "+1 more", Waiting, and Withdraw; no notes',
      [/Thu 1 Oct · 18:00 \+1 more/.test(pend), /Waiting for Sam/.test(pend), /Withdraw/.test(pend), /Knees/.test(pend)], [true, true, true, false]);
    check('declined: a Declined chip, no actions', [/>Declined</.test(row({ id: 'd', status: 'declined', preferences: [{ date: '2026-10-01', start_min: 1080 }] })), /<button/.test(row({ id: 'd', status: 'declined', preferences: [{ date: '2026-10-01', start_min: 1080 }] }))], [true, false]);
    const form = I.coachReqFormHTML({ mode: 'times', times: [{ date: '2026-10-01', time: '18:00' }], window: {}, notes: '', repeat: true, busy: false });
    check('the form: "Up to 3 times | A free window", "Choice 1", and Repeat weekly as an iOS-style switch, on',
      [/Up to 3 times/.test(form), /Choice 1/.test(form), /role="switch" class="coach-switch" aria-checked="true"/.test(form)], [true, true, true]);
    const W = mk({ macrocycles: [], coachBookings: { w: { booking_id: 'w', date: '2026-09-02', start_min: 1080, status: 'booked', kind: 'weekly' } } });
    check('🚨 a weekly booking rolls forward: first dated Wed 2 Sep, "next" on 28 Sep is Wed 30 Sep',
      W.nextCoachBooking() && W.nextCoachBooking().date, '2026-09-30');
    check('…and a past one-off is gone', mk({ macrocycles: [], coachBookings: { o: { booking_id: 'o', date: '2026-09-02', start_min: 1080, status: 'booked' } } }).nextCoachBooking(), null);
    const none = mk({ macrocycles: [], coachBookings: {} }).homeNextSessionHTML();
    check('nothing booked: "None booked", and Request a session', /None booked/.test(none) && /Request a session/.test(none), true);

    check('slots: up to 3 times from tomorrow, duplicates dropped, as {date, start_min}',
      G.coachReqSlots('times', [{ date: '2026-09-29', time: '18:00' }, { date: '2026-09-29', time: '18:00' }, { date: '2026-09-30', time: '07:15' }], {}),
      { slots: [{ date: '2026-09-29', start_min: 1080 }, { date: '2026-09-30', start_min: 435 }] });
    check('slots: today or earlier is refused', !!G.coachReqSlots('times', [{ date: '2026-09-28', time: '18:00' }], {}).error, true);
    check('slots: a window is one {date, start_min, end_min}, start before end',
      [G.coachReqSlots('window', [], { date: '2026-09-30', from: '17:00', to: '20:00' }), !!G.coachReqSlots('window', [], { date: '2026-09-30', from: '20:00', to: '17:00' }).error],
      [{ slots: [{ date: '2026-09-30', start_min: 1020, end_min: 1200 }] }, true]);

    const R = mk({ macrocycles: [], coachBookings: {} });
    R.openCoachRequest();
    const f = R.form(); f.times = [{ date: '2026-09-30', time: '18:00' }]; f.notes = '  Deadlift form  '; f.repeat = true;
    await R.sendCoachRequest();
    const ins = calls.find(c => c[0] === 'insert');
    check('Send request: one session_requests row with the client, the coach, the slots, notes and repeat',
      ins && [ins[1], ins[2].client_id, ins[2].coach_id, ins[2].preferences, ins[2].notes, ins[2].repeat_weekly],
      ['session_requests', 'u1', 'coach-1', [{ date: '2026-09-30', start_min: 1080 }], 'Deadlift form', true]);
    check('…and only the columns 0024 lets a client insert', ins && Object.keys(ins[2]).sort(), ['client_id', 'coach_id', 'notes', 'preferences', 'repeat_weekly']);
    await R.answerCoachRequest('r9', 'withdraw');
    await R.answerCoachRequest('r8', 'accept');
    check('Withdraw and Confirm set only the status', calls.filter(c => c[0] === 'update').map(c => [c[2], c[3]]),
      [[{ status: 'withdrawn' }, 'r9'], [{ status: 'accepted' }, 'r8']]);
    R.setCounter({ id: 'r7', mode: 'times', date: '2026-10-03', time: '09:30', from: '', to: '' });
    await R.sendCoachCounter();
    check('Suggest another time: ONE counter slot and status countered', calls.filter(c => c[0] === 'update').pop().slice(2),
      [{ counter: { date: '2026-10-03', start_min: 570 }, status: 'countered' }, 'r7']);
  }
  check('the coach\'s answers arrive live: the Realtime channel also listens to session_requests',
    /table: 'session_requests', filter: 'client_id=eq\.'/.test((decls.get('syncPublicationChannel') || {}).text || ''), true);
  return failures;
}

const failures = await run('now', readFileSync(join(repo, 'index.html'), 'utf8'), readFileSync(join(repo, 'engine', 'dist', 'bloc-engine.js'), 'utf8'));

console.log(`\n— control: v8.41 (${CONTROL}), which must fail —`);
const orig = console.log; const lines = []; console.log = s => lines.push(String(s));
let cf = 0;
try { cf = await run('v8.41', git('index.html'), git('engine/dist/bloc-engine.js')); } catch (e) { cf = 99; lines.push('✗ threw ' + e.message); }
finally { console.log = orig; }
if (cf > 0 && lines.some(l => /✗ .*getCoachAssignment/.test(l)) && lines.some(l => /✗ .*Home row and Request/.test(l))) console.log(`✓ control: v8.41 fails ${cf} checks, including the engine skip and the Home row`);
else { console.log(`✗ control: v8.41 should fail (${cf} failed)`); process.exitCode = 1; }

// CONTROL 2: v8.42's first commit (1a0017e) guarded a hand-made list of ten
// handlers and missed the card's ✓. The derived list must catch it.
{
  const src2 = execFileSync('git', ['show', '1a0017e:index.html'], { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const orig2 = console.log; const l2 = []; console.log = s => l2.push(String(s));
  try { await run('1a0017e', src2, readFileSync(join(repo, 'engine', 'dist', 'bloc-engine.js'), 'utf8')); } finally { console.log = orig2; }
  if (l2.some(l => /✗ .*quickFillComplete\(\) refuses/.test(l))) console.log('✓ control: 1a0017e (the hand-listed guards) fails on quickFillComplete, the card ✓');
  else { console.log('✗ control: 1a0017e should fail on quickFillComplete'); process.exitCode = 1; }
}

if (failures) { console.log(`\nFAIL: ${failures} check(s) failed.`); process.exit(1); }
console.log('\nAll checks passed.');
