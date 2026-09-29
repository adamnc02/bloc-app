#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-booking-weeks.mjs
//
// WHAT IT PROTECTS (v8.47, TECHNICAL §151; migration 0028): a weekly session
// is ONE `booking` publication dated its first occurrence, which BLOC rolls
// forward itself. The coach's diary changes single weeks of it, and the
// phone must show them:
//   · `skip_dates`: a day off, a holiday, or a week cancelled or moved "just
//     this one" (a moved week arrives as its own one-off booking). The next
//     date steps over every skipped week, however many in a row.
//   · `until`: the last date it occurs, inclusive; after it, no next date.
//   · `quiet: true`: applied with no banner (the coach chose not to notify).
//   · A skip date added raises "Session cancelled", one removed "Session back
//     on", a new `until` "Weekly session ending"; skips in the past raise
//     nothing. `title` names a group session on its row.
//
// 🚨 THE TRAP: without this, "Your next session" kept showing a week the coach
// had taken off, and the client turned up.
//
// Runs the real functions from index.html. CONTROL: main before v8.47
// (5d08f66) ignores skip_dates, until and quiet, and must fail.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const current = readFileSync(join(repo, 'index.html'), 'utf8');

function extract(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) return null;
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') { depth--; if (depth === 0) return source.slice(start, i + 1); }
  }
  return null;
}
const FNS = ['pubCopy', 'coachMinToHHMM', 'coachDayFmt', 'coachDateTimeFmt', 'coachBookingWeekly', 'coachBookingSkips',
  'coachBookingNextDate', 'addCoachNotice', 'applyBookingPublication'];
const OPTIONAL = new Set(['coachBookingSkips']);

function load(source) {
  const parts = FNS.map((n) => {
    const s = extract(source, n);
    if (!s && !OPTIONAL.has(n)) throw new Error(`${n} not found`);
    return s || '';
  });
  const body = `
    let TODAY = '2026-10-01';
    const state = { coachNotices: [], coachBookings: {} };
    const COACH_NOTICE_KEEP = 20;
    const getLocalToday = () => TODAY;
    const coachFirstName = () => 'Rowan';
    const toLocalDateStr = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    ${parts.join('\n')}
    return { state, coachBookingNextDate, applyBookingPublication, setToday: (t) => { TODAY = t; } };`;
  return new Function(body)();
}

// Wednesdays at 18:00 from 7 Oct 2026; "today" is Thu 1 Oct.
const WEEKLY = { booking_id: 'b1', date: '2026-10-07', start_min: 1080, duration_min: 60, status: 'booked', kind: 'weekly', location: 'Studio' };
let seq = 0;
const pub = (payload) => ({ id: `p${++seq}`, seq, type: 'booking', payload });

function run(source) {
  const P = load(source);
  const out = [];
  const check = (label, actual, expected) => out.push({ label, ok: JSON.stringify(actual) === JSON.stringify(expected), actual, expected });
  const next = (b, today = '2026-10-01') => P.coachBookingNextDate(b, today);
  const last = () => P.state.coachNotices[P.state.coachNotices.length - 1];

  check('a weekly booking rolls forward as before', next(WEEKLY, '2026-10-08'), '2026-10-14');
  check('a skipped week is stepped over', next({ ...WEEKLY, skip_dates: ['2026-10-07'] }), '2026-10-14');
  check('two skipped weeks in a row are stepped over', next({ ...WEEKLY, skip_dates: ['2026-10-14', '2026-10-07'] }), '2026-10-21');
  check('a skip after the roll-forward is stepped over', next({ ...WEEKLY, skip_dates: ['2026-10-14'] }, '2026-10-08'), '2026-10-21');
  check('until: the last date still counts (inclusive)', next({ ...WEEKLY, until: '2026-10-14' }, '2026-10-08'), '2026-10-14');
  check('until: after it, no next date', next({ ...WEEKLY, until: '2026-10-14' }, '2026-10-15'), null);
  check('until: a skip on the last date leaves none', next({ ...WEEKLY, until: '2026-10-07', skip_dates: ['2026-10-07'] }), null);
  check('a one-off is unchanged', next({ ...WEEKLY, kind: undefined, date: '2026-10-09' }), '2026-10-09');

  P.applyBookingPublication(pub(WEEKLY));
  check('a new weekly booking: "Session confirmed"', last().title, 'Session confirmed');
  let n = P.state.coachNotices.length;
  P.applyBookingPublication(pub({ ...WEEKLY, skip_dates: ['2026-10-14'] }));
  check('a skip date added: "Session cancelled", naming the date', [last().title, /14 Oct/.test(last().body)], ['Session cancelled', true]);
  P.applyBookingPublication(pub({ ...WEEKLY, skip_dates: [] }));
  check('the skip removed (a cancelled session reinstated): "Session back on"', last().title, 'Session back on');
  n = P.state.coachNotices.length;
  P.applyBookingPublication(pub({ ...WEEKLY, skip_dates: ['2026-10-21'], quiet: true }));
  check('quiet: applied, and no banner', [P.state.coachBookings.b1.skip_dates, P.state.coachNotices.length], [['2026-10-21'], n]);
  P.applyBookingPublication(pub({ ...WEEKLY, skip_dates: ['2026-10-21', '2026-09-23'] }));
  check('a skip date in the past raises nothing', P.state.coachNotices.length, n);
  P.applyBookingPublication(pub({ ...WEEKLY, skip_dates: ['2026-10-21', '2026-09-23'], until: '2026-12-16' }));
  check('until set: "Weekly session ending"', last().title, 'Weekly session ending');
  n = P.state.coachNotices.length;
  P.applyBookingPublication(pub({ ...WEEKLY, booking_id: 'b2', status: 'booked', quiet: true }));
  check('quiet on a new booking: no "Session confirmed"', P.state.coachNotices.length, n);
  P.applyBookingPublication(pub({ ...WEEKLY, booking_id: 'b2', status: 'cancelled' }));
  check('a cancelled booking still says so', last().title, 'Session cancelled');

  // Changes (0029): a moved week, an all-future move, a moved one-off, a new length.
  P.applyBookingPublication(pub({ ...WEEKLY, booking_id: 'b3', date: '2026-10-07' }));
  P.applyBookingPublication(pub({ ...WEEKLY, booking_id: 'b3', skip_dates: ['2026-10-14'], quiet: true }));
  P.applyBookingPublication(pub({ booking_id: 'ov1', date: '2026-10-15', start_min: 1080, duration_min: 60, status: 'booked', kind: 'one_off', replaces: { booking_id: 'b3', date: '2026-10-14' } }));
  check('a moved week (replaces): "Session changed", old time → new', [last().title, last().body], ['Session changed', 'Wed 14 Oct, 18:00 with Rowan is now Thu 15 Oct, 18:00.']);
  P.applyBookingPublication(pub({ ...WEEKLY, booking_id: 'b4', date: '2026-10-22', start_min: 1020, replaces: { booking_id: 'b3', date: '2026-10-21' } }));
  check('an all-future move (a new weekly that replaces): "Session changed"', [last().title, /every Thursday at 17:00/.test(last().body)], ['Session changed', true]);
  P.applyBookingPublication(pub({ booking_id: 'o2', date: '2026-10-09', start_min: 600, duration_min: 60, status: 'booked', kind: 'one_off' }));
  check('a new one-off with no replaces is still "Session confirmed"', last().title, 'Session confirmed');
  P.applyBookingPublication(pub({ booking_id: 'o2', date: '2026-10-09', start_min: 660, duration_min: 60, status: 'booked', kind: 'one_off' }));
  check('a one-off moved: "Session changed"', last().title, 'Session changed');
  P.applyBookingPublication(pub({ booking_id: 'o2', date: '2026-10-09', start_min: 660, duration_min: 90, status: 'booked', kind: 'one_off', location: 'Park' }));
  check('a new length and place: "Session changed", naming them', [last().title, last().body], ['Session changed', 'Fri 9 Oct, 11:00 with Rowan: 90 min · Park.']);

  P.applyBookingPublication(pub({ booking_id: 'o2', date: '2026-10-09', start_min: 660, duration_min: 90, status: 'cancelled', kind: 'one_off', location: 'Park' }));
  P.applyBookingPublication(pub({ booking_id: 'o2', date: '2026-10-09', start_min: 660, duration_min: 90, status: 'booked', kind: 'one_off', location: 'Park' }));
  check('a cancelled one-off booked again (a cancelled session reinstated): "Session back on"', [last().title, last().body], ['Session back on', 'Fri 9 Oct, 11:00 with Rowan is back on.']);

  P.applyBookingPublication(pub({ ...WEEKLY, booking_id: 'g1', date: '2026-10-10', start_min: 540, title: 'Saturday bootcamp', location: 'Park' }));
  check('added to a group: "Added to a group session", naming it', [last().title, last().body], ['Added to a group session', 'Rowan added you to Saturday bootcamp: Sat 10 Oct, 09:00, weekly.']);
  P.applyBookingPublication(pub({ ...WEEKLY, booking_id: 'g1', date: '2026-10-10', start_min: 540, title: 'Saturday bootcamp', location: 'Park', status: 'cancelled' }));
  check('taken out of a group (or it ends): "Group session cancelled", naming it', last().title, 'Group session cancelled');
  P.applyBookingPublication(pub({ ...WEEKLY, booking_id: 'g1', date: '2026-10-10', start_min: 540, title: 'Saturday bootcamp', location: 'Park' }));
  check('put back in a group: "Added to a group session" (not "back on")', last().title, 'Added to a group session');

  const rows = extract(source, 'renderCoachSessions') || '';
  check('Your sessions shows a group session\'s title', /b\.title \? coachEsc\(b\.title\)/.test(rows), true);
  return out;
}

let failures = 0;
for (const r of run(current)) {
  console.log(`${r.ok ? '✓' : '✗'} ${r.label}${r.ok ? '' : ` — got ${JSON.stringify(r.actual)}, expected ${JSON.stringify(r.expected)}`}`);
  if (!r.ok) failures++;
}

// CONTROL: v8.46 ignores the new keys, so the skip, until and quiet rows fail.
const old = execFileSync('git', ['show', '5d08f66:index.html'], { cwd: repo, encoding: 'utf8', maxBuffer: 64 << 20 });
const ctl = run(old);
const ctlFails = ctl.filter((r) => !r.ok).map((r) => r.label);
const mustFail = ['a skipped week is stepped over', 'until: after it, no next date', 'quiet on a new booking: no "Session confirmed"', 'a moved week (replaces): "Session changed", old time → new', 'a new length and place: "Session changed", naming them', 'a cancelled one-off booked again (a cancelled session reinstated): "Session back on"', 'added to a group: "Added to a group session", naming it'];
const ctlOk = mustFail.every((l) => ctlFails.includes(l));
console.log(`${ctlOk ? '✓' : '✗'} control: v8.46 (5d08f66) fails ${ctlFails.length} rows, including skip, until and quiet`);
if (!ctlOk) failures++;

console.log(failures ? `\n✗ ${failures} check(s) failed` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
