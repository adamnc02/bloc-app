#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-normalise-state.mjs — normaliseState() gives what the in-place
// ensureStateDefaults() gave, down to the order of the keys
//
// THE BUG THIS PREVENTS: a "pure rewrite" of ensureStateDefaults that
// changes what is saved. v8.32 (TECHNICAL §122) replaced the in-place
// version with the engine's normaliseState(), which returns a new object.
// The golden harness (§118) compares with SORTED keys, so it cannot see a
// key moving; but save() writes JSON.stringify(state) as it stands, the sync
// and snapshot hashes are over those bytes, and a reordered key would change
// every user's saved state once. And the demo data exercises only two of the
// ~30 defaults, so the edge cases (the proteinMax repair, a null blocAdvice,
// an empty-string mode, a non-array history) are tested here, against the
// real v8.31 function.
//
// The comparison is JSON.stringify of both results, unsorted: identical text
// means identical saved bytes.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function check(label, ok, detail) {
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok && detail) console.log(`    ${detail}`);
}

const E = vm.runInNewContext(`${readFileSync(join(repo, 'engine/dist/bloc-engine.js'), 'utf8')}\n;BlocEngine`, {});

// The real v8.31 function, run in place on a copy, as load() ran it.
const oldHtml = execFileSync('git', ['show', '3fb1c3f:index.html'], { cwd: repo, encoding: 'utf8', maxBuffer: 64 << 20 });
const start = oldHtml.indexOf('function ensureStateDefaults() {');
const oldFn = oldHtml.slice(start, oldHtml.indexOf('\n}\n', start) + 2);
function oldNormalise(input) {
  const doc = { body: { setAttribute() {} } };
  return new Function('input', 'document', `let state = input;\n${oldFn}\nensureStateDefaults();\nreturn state;`)(input, doc);
}
const copy = v => JSON.parse(JSON.stringify(v));

const demo = JSON.parse(readFileSync(join(repo, 'bloc-demo-data.json'), 'utf8'));
const INPUTS = {
  'the demo dataset': demo,
  'an empty object (a brand-new install)': {},
  'the proteinMax repair: null, missing, set, and no range': { sampleDays: [
    { id: 'a', range: { kcalMin: 1, proteinMax: null, carbsMax: 3 } }, { id: 'b', range: { kcalMin: 1 } },
    { id: 'c', range: { proteinMax: 180 } }, { id: 'd' }] },
  'a profile with no measureUnit (the default is appended, last)': { profile: { gender: 'f', height: 65 } },
  'measureUnit already cm': { profile: { measureUnit: 'cm' } },
  'blocAdvice and nextCycleAdvice null (kept null, not replaced)': { blocAdvice: null, nextCycleAdvice: null },
  'blocAdvice present': { blocAdvice: { id: 'x', text: 'hi' } },
  'an empty-string mode and a zero currentWeek': { mode: '', currentWeek: 0 },
  'mode light': { mode: 'light' },
  'nextCycleAdviceHistory not an array': { nextCycleAdviceHistory: { a: 1 } },
  'insightsRollup present, fields out of order': { rpe: { k: { rpe: 7 } }, macrocycles: [{ id: 'm1' }], insightsRollup: { completedCycles: [1] } },
};
for (const [label, input] of Object.entries(INPUTS)) {
  const want = JSON.stringify(oldNormalise(copy(input)));
  const got = JSON.stringify(E.normaliseState(copy(input)));
  check(`${label}: same JSON, same key order`, got === want, `v8.31 ${want.slice(0, 160)}\n    now   ${got.slice(0, 160)}`);
}

// Both throw on a state that is not an object (load() never caught it).
for (const bad of [null, 5]) {
  let oldThrew = false, newThrew = false;
  try { oldNormalise(bad); } catch { oldThrew = true; }
  try { E.normaliseState(bad); } catch { newThrew = true; }
  check(`${JSON.stringify(bad)}: throws, as v8.31 did`, oldThrew && newThrew);
}

// Structural sharing is deliberate: untouched fields are the input's own.
const shared = { macrocycles: [{ id: 'm' }] };
check('untouched fields are shared, not copied (no deep clone on every boot)', E.normaliseState(shared).macrocycles === shared.macrocycles);

// ── Control: a reordered rewrite must fail ─────────────────────────────────
{
  const reordered = s => ({ mode: 'dark', ...E.normaliseState(s) });
  const input = { profile: { measureUnit: 'in' } };
  check('control: the same values with one key moved first is caught',
    JSON.stringify(reordered(copy(input))) !== JSON.stringify(oldNormalise(copy(input))));
}

console.log(failures ? `\n✗ ${failures} check(s) failed` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
