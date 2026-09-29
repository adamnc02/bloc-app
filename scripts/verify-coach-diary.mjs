#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-coach-diary.mjs — BLOC Coach's Diary sends what BLOC reads
// (Coach v0.5, TECHNICAL §152)
//
// THE TRAPS:
//   · A booking publication's keys are allow-listed by the server (0023 +
//     0028 + 0029's `publication_payload_ok`). A key outside the list makes the
//     server refuse the whole publication; Coach's BOOKING_KEYS must all be
//     on the migration's list.
//   · BLOC rolls a booking forward only when its `kind` is one it reads as
//     weekly (index.html `coachBookingWeekly`); Coach's series must use one of
//     those words, and its skip_dates / until / title / quiet are the keys
//     BLOC v8.47 reads.
//   · Publishing is derived, never done per action: only diary/actions.ts's
//     publishChanges() calls publishBooking, with bookingChanges()'s output.
//     A second caller could send a booking the diff doesn't know about, and
//     the next change would "correct" it.
//   · The diary model reads no clock: its dates are passed in.
// The model, rules, diff and actions themselves are covered by
// coach/src/diary/diary.test.ts, run by verify-coach-build.mjs.
//   · Coach never deletes a diary booking or series: a request names its booking
//     (on delete set null), and a deleted one gets the whole request re-booked.
// Controls: a key outside the allow-list, a second publishBooking caller, a kind
// BLOC doesn't read and a delete are all caught.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = f => readFileSync(join(repo, f), 'utf8');
let failures = 0;
function check(label, ok, detail) {
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok && detail) console.log(`    ${detail}`);
}
const strip = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
const walk = d => readdirSync(join(repo, d)).flatMap(f => statSync(join(repo, d, f)).isDirectory() ? walk(`${d}/${f}`) : [`${d}/${f}`]);

// ── 1. The server's allow-list ───────────────────────────────────────────
const migration = join(repo, '..', 'super-duper-octo-barnacle', 'supabase', 'migrations', '20260831000029_booking_replaces.sql');
let allowed = null;
try {
  const m = /when 'booking'\s+then array\[([^\]]+)\]/.exec(readFileSync(migration, 'utf8'));
  allowed = m && [...m[1].matchAll(/'([a-z_]+)'/g)].map(x => x[1]);
} catch { /* the migration repo isn't beside this one (CI): fall back to the documented list */ }
if (!allowed) allowed = ['v', 'booking_id', 'date', 'start_min', 'duration_min', 'status', 'kind', 'location', 'assigned_session', 'skip_dates', 'until', 'title', 'quiet', 'replaces'];
const publish = read('coach/src/diary/publish.ts');
const keysOf = src => { const m = /export const BOOKING_KEYS = \[([^\]]+)\]/.exec(src); return m ? [...m[1].matchAll(/'([a-z_]+)'/g)].map(x => x[1]) : null; };
const keys = keysOf(publish);
const outside = (k, a) => (k ?? []).filter(x => !a.includes(x));
check(`every booking key Coach sends is on 0029's allow-list (${keys?.length} keys)`, !!keys && keys.length >= 9 && outside(keys, allowed).length === 0, `outside: ${outside(keys, allowed)}`);
const control1 = keysOf(publish.replace(/(export const BOOKING_KEYS = \[[^\]]*)\]/, "$1, 'notes']"));
check('control: a key outside the list is caught', outside(control1, allowed).join() === 'notes');

// ── 2. What BLOC reads ───────────────────────────────────────────────────
const html = read('index.html');
const weeklyWords = (() => { const m = /function coachBookingWeekly\(b\) \{[^}]*\[([^\]]+)\]/.exec(html); return m ? [...m[1].matchAll(/'([a-z]+)'/g)].map(x => x[1]) : []; })();
// The kind seriesPayload() sends.
const seriesKind = src => { const f = /function seriesPayload[\s\S]*?\n\}/.exec(strip(src)); const m = f && /kind: '([a-z_]+)'/.exec(f[0]); return m ? m[1] : null; };
const kindOk = src => weeklyWords.includes(seriesKind(src));
check(`a series is sent with a kind BLOC rolls forward (${seriesKind(publish)} ∈ ${weeklyWords.join('/')})`, weeklyWords.length > 0 && kindOk(publish));
check('control: a series sent as kind \'repeating\' is caught', !kindOk(publish.replaceAll("kind: 'weekly'", "kind: 'repeating'")));
const blocReads = ['skip_dates', 'until', 'title', 'quiet'].filter(k => new RegExp(`\\b(b|p)\\.${k}\\b`).test(html));
check(`BLOC reads skip_dates, until, title and quiet (v8.47): ${blocReads.join(', ')}`, blocReads.length === 4);

// ── 3. One publishing path ───────────────────────────────────────────────
const src = walk('coach/src').filter(f => /\.tsx?$/.test(f) && !/\.test\.ts$/.test(f));
const callers = files => files.filter(f => /\.publishBooking\(/.test(strip(read(f)))).sort();
const found = callers(src);
check('only diary/actions.ts calls publishBooking (derive, then diff)', found.join() === 'coach/src/diary/actions.ts', found.join(', '));
check('…and it publishes bookingChanges()’s output', /const out = bookingChanges\(d, opts\);\s*for \(const o of out\) await repo\.publishBooking\(o\.cardId, o\.payload, o\.supersedes\)/.test(read('coach/src/diary/actions.ts')));
const diaryScreen = 'coach/src/coach/diary/DiaryScreen.tsx';
const withSecond = (() => { const orig = read(diaryScreen); return [...src.filter(f => f !== diaryScreen), diaryScreen].filter(f => /\.publishBooking\(/.test(strip(f === diaryScreen ? `${orig}\nrepo.publishBooking(x, y, null);` : read(f)))); })();
check('control: a second caller is caught', withSecond.length === 2);

// ── 3b. Never delete a booking or a series ────────────────────────────────
// session_requests.booking_id references diary_bookings ON DELETE SET NULL (and a
// series' rows cascade), so a deleted booking leaves an accepted request unbooked and
// autoBook books the whole request again. Coach cancels instead.
const deletes = text => /deleteBooking|deleteSeries|from\('diary_(bookings|series)'\)\s*\.delete\(/.test(strip(text));
const deleting = src.filter(f => deletes(read(f)));
check('no Coach code deletes a diary booking or series (it cancels)', deleting.length === 0, deleting.join(', '));
check('control: a delete of diary_bookings is caught', deletes(`${read('coach/src/data/liveDiary.ts')}\nsb.from('diary_bookings').delete().eq('id', x);`));

// ── 4. No clock in the model ─────────────────────────────────────────────
const model = walk('coach/src/diary').filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'));
const hasClock = text => /new Date\(\)|Date\.now\(|performance\.now\(/.test(strip(text));
const clocked = model.filter(f => hasClock(read(f)));
check(`the diary model reads no clock (${model.length} files)`, clocked.length === 0, clocked.join(', '));
check('control: rules.ts with a clock read is caught', hasClock(`${read('coach/src/diary/rules.ts')}\nconst t = Date.now();`));

// ── 5. Placeholders don't expire (a named constant, off) ─────────────────
check('PLACEHOLDER_EXPIRY_DAYS is null (placeholders never expire)', /export const PLACEHOLDER_EXPIRY_DAYS: number \| null = null;/.test(read('coach/src/diary/model.ts')));

console.log(failures ? `\n✗ ${failures} check(s) failed` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
