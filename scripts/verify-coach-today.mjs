#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-coach-today.mjs — Coach v0.6, TECHNICAL §154
//
// WHAT IT PROTECTS:
//   · Today's "Coming up" says a client's measurements are due by BLOC's own
//     rule (index.html `getMeasurementStatus`, §103): 7 days after the last
//     waist or hip, or the next cycle's start if sooner, at once with none.
//     Coach carries a COPY (coach/src/lib/measurementStatus.ts), because
//     moving it into the engine would change BLOC's served bytes. A copy that
//     drifts tells the coach "due" while the client's Home says it isn't. This
//     runs both over the same cases and fails on any difference.
//   · In person's publications carry only 0023's keys: a `session_log` key
//     outside the allow-list refuses the whole row on insert.
//   · Nothing in Today's or In person's models reads a clock: a client is
//     judged at their own today, passed in (§139).
// Controls: a copy with `>` for `>=` (due a day late), a session_log key
// outside the list, and a model that calls Date.now().
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(repo, f), 'utf8');
let failures = 0;
function check(label, ok, detail) {
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok && detail) console.log(`    ${detail}`);
}

let esbuild;
try { esbuild = await import(join(repo, 'engine', 'node_modules', 'esbuild', 'lib', 'main.js')); }
catch { console.log('✗ the engine’s esbuild is missing: run npm ci --prefix engine'); process.exit(1); }

// ── 1. The measurement rule: Coach's copy against BLOC's ──────────────────
const html = read('index.html');
const start = html.indexOf('function getMeasurementStatus(');
let depth = 0, end = -1;
for (let i = html.indexOf('{', start); i < html.length; i++) { if (html[i] === '{') depth++; else if (html[i] === '}' && --depth === 0) { end = i + 1; break; } }
const bloc = new Function(`${html.slice(start, end)}\nreturn getMeasurementStatus;`)();
const coachSrc = read('coach/src/lib/measurementStatus.ts');
const toFn = async (src) => new Function(`${(await esbuild.transform(src.replace(/^export /gm, ''), { loader: 'ts' })).code}\nreturn getMeasurementStatus;`)();
const coach = await toFn(coachSrc);

const days = ['2026-07-20', '2026-07-26', '2026-07-27', '2026-07-30', '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-10'];
const logsSets = [
  [], [{ date: '2026-07-27', weight: 180 }], [{ date: '2026-07-27', waist: 32 }], [{ date: '2026-07-27', hip: 38 }],
  [{ date: '2026-07-20', waist: 32 }, { date: '2026-07-27', waist: 31.75 }], [{ date: '2026-07-27', waist: '' }, { date: '2026-07-21', hip: 38 }],
  [{ date: '2026-08-02', waist: 31, hip: 38 }], null,
];
const cycles = [[], [{ start: '2026-07-30' }], [{ start: '2026-08-10' }], [{ start: '2026-07-01' }, { start: '2026-08-03' }], null];
let cases = 0, diffs = [];
for (const l of logsSets) for (const c of cycles) for (const t of days) {
  cases++;
  const a = JSON.stringify(bloc(l, c, t)), b = JSON.stringify(coach(l, c, t));
  if (a !== b) diffs.push(`${JSON.stringify([l, c, t])}: BLOC ${a}, Coach ${b}`);
}
check(`Coach's measurement rule gives BLOC's answer in all ${cases} cases`, diffs.length === 0, diffs.slice(0, 3).join('\n    '));
const drift = await toFn(coachSrc.replace('due: today >= nextDueDate', 'due: today > nextDueDate'));
const caught = logsSets.some((l) => cycles.some((c) => days.some((t) => JSON.stringify(bloc(l, c, t)) !== JSON.stringify(drift(l, c, t)))));
check('control: a copy that is due a day late is caught', caught);

// ── 2. session_log keys: 0023's allow-list ────────────────────────────────
let allowed = null;
try {
  const m = /when 'session_log'\s+then array\[([^\]]+)\]/.exec(readFileSync(join(repo, '..', 'super-duper-octo-barnacle', 'supabase', 'migrations', '20260831000030_booking_removed.sql'), 'utf8'));
  allowed = m && [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
} catch { /* the migration repo isn't beside this one (CI): the documented list */ }
if (!allowed) allowed = ['v', 'session_id', 'booking_id', 'macro_id', 'week', 'day_key', 'kind', 'replaces', 'logs', 'rpe'];
const model = read('coach/src/inperson/model.ts');
const keysOf = (src) => { const m = /export const SESSION_LOG_KEYS = \[([^\]]+)\]/.exec(src); return m ? [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]) : []; };
const outside = (k) => k.filter((x) => !allowed.includes(x));
check(`In person's session_log keys are on the allow-list (${keysOf(model).length})`, keysOf(model).length === 10 && outside(keysOf(model)).length === 0, outside(keysOf(model)).join());
check('control: a key outside it is caught', outside(keysOf(model.replace(/(export const SESSION_LOG_KEYS = \[[^\]]*)\]/, "$1, 'date']"))).join() === 'date');
const payloadFn = /export function sessionLogPayload[\s\S]*?\n\}/.exec(model)?.[0] ?? '';
const written = (src) => { const o = /const out: Loose = \{([^}]*)\}/.exec(src); return [...(o ? o[1].matchAll(/([a-z_]+):/g) : []), ...src.matchAll(/out\.([a-z_]+) =/g)].map((m) => m[1]); };
check(`the payload builder writes only those keys (${written(payloadFn).join(', ')})`, written(payloadFn).length >= 8 && outside(written(payloadFn)).length === 0);
check('control: a builder writing a key outside it is caught', outside(written(payloadFn.replace('out.rpe = rpe', 'out.rpe = rpe; out.date = 1'))).join() === 'date');

// ── 3. No clock in the models ─────────────────────────────────────────────
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
const clock = (src) => /\bDate\.now\(|\bnew Date\(\s*\)|performance\.now\(|resolvedOptions\(\)\.timeZone/.test(strip(src));
for (const f of ['coach/src/inperson/model.ts', 'coach/src/today/model.ts', 'coach/src/lib/measurementStatus.ts']) check(`${f} reads no clock`, !clock(read(f)));
check('control: a Date.now() is caught', clock(`${read('coach/src/today/model.ts')}\nconst t = Date.now();`));

console.log(failures ? `\n✗ ${failures} check(s) failed` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
