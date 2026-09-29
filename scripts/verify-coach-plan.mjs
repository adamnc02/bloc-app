#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-coach-plan.mjs — BLOC Coach's Plan writes what BLOC reads
// (Coach v0.4, TECHNICAL §144)
//
// THE TRAPS:
//   · Coach's exercise library is a COPY of index.html's DEFAULT_LIBRARY
//     (moving it into the engine would change BLOC's served bytes). A copy
//     that drifts offers the coach names BLOC's Swap for today doesn't know.
//   · A plan's macrocycle may carry only the fields a coach owns: 0023's
//     allow-list, which BLOC patches as PUB_MACRO_FIELDS. A field outside it
//     makes the server refuse the whole publication; a field BLOC doesn't
//     patch is silently lost on the phone. Coach's MACRO_FIELDS must be
//     exactly BLOC's list plus `id`.
//   · Nothing in the plan code reads the clock for a client's date: the
//     client's today comes in (their `tz`), as everywhere in Coach.
// The model itself (fold, edits, diff, templates, round trip through BLOC's
// patch rules) is covered by coach/src/plan/plan.test.ts, run by
// verify-coach-build.mjs.
// Controls: a library copy missing one entry, and a field list with an extra
// field, are both caught.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync } from 'node:fs';
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
const html = read('index.html');

// ── The library copy ─────────────────────────────────────────────────────
const entries = src => [...src.matchAll(/\{\s*name:\s*'([^']+)',\s*bodyPart:\s*'([^']+)'(?:,\s*category:\s*'([^']+)')?\s*\}/g)].map(m => `${m[1]}|${m[2]}|${m[3] || ''}`);
const blocLib = (() => { const s = html.indexOf('const DEFAULT_LIBRARY = ['); return entries(html.slice(s, html.indexOf('];', s))); })();
const libSrc = read('coach/src/plan/library.ts');
const coachLib = (() => { const s = libSrc.indexOf('export const BUILT_IN'); return entries(libSrc.slice(s, libSrc.indexOf('];', s))); })();
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
check(`Coach's library equals BLOC's DEFAULT_LIBRARY, entry by entry (${blocLib.length})`, blocLib.length > 20 && same(blocLib, coachLib),
  `BLOC only: ${blocLib.filter(x => !coachLib.includes(x)).join(', ')}; Coach only: ${coachLib.filter(x => !blocLib.includes(x)).join(', ')}`);

// ── The macrocycle fields ────────────────────────────────────────────────
const list = (src, name) => { const m = new RegExp(`const ${name} = \\[([^\\]]*)\\]`).exec(src); return m ? [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]) : null; };
const bloc = list(html, 'PUB_MACRO_FIELDS');
const coach = list(read('coach/src/plan/doc.ts'), 'MACRO_FIELDS');
const want = bloc && ['id', ...bloc].sort().join();
check(`Coach sends exactly BLOC's PUB_MACRO_FIELDS plus id (${bloc?.length} fields)`, !!coach && coach.slice().sort().join() === want, `Coach: ${coach}`);

// ── No clock for a client's date ─────────────────────────────────────────
const planFiles = readdirSync(join(repo, 'coach/src/plan')).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts')).map(f => `coach/src/plan/${f}`);
const clock = planFiles.filter(f => /new Date\(\)|Date\.now\(/.test(strip(read(f))));
check(`the plan model reads no clock (${planFiles.length} files; ids take an injected one)`, clock.length === 0, clock.join(', '));
check('Plan evaluates at the client’s today (their tz), not the coach’s', /v\.summary\.clientToday \?\?/.test(read('coach/src/coach/client/plan/usePlan.ts'))
  && /planReplaceOffer\([^)]*\{ today \}/.test(read('coach/src/coach/client/plan/usePlan.ts')));

// ── Controls ─────────────────────────────────────────────────────────────
console.log('\n— controls, which must be caught —');
check('control: a copy missing an entry differs', !same(blocLib, coachLib.slice(1)));
check('control: an extra field differs', ['id', 'review', ...bloc].sort().join() !== want);

console.log(failures ? `\nFAIL: ${failures} check(s)` : '\nAll checks pass.');
process.exit(failures ? 1 : 0);
