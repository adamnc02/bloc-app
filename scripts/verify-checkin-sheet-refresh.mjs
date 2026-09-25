#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-checkin-sheet-refresh.mjs
//
// THE BUG THIS PREVENTS: "Challenge this →" doing nothing in the check-in
// sheet (v8.16 → fixed v8.17).
//
// The v8.16 redesign moved the check-in's narrative, plans and "Challenge
// this" out of an expand-in-place card and into a sheet whose body is built
// once, by openCheckinSheet(). Every step of the challenge flow — open the
// input, "BLOC is thinking…", the revised-plan preview, accept, decline —
// still re-rendered by calling renderProgress(), which redraws the PAGE. The
// sheet the person was actually looking at never changed. Tapping the link set
// _blocChallengeInputOpen and nothing visible happened; the whole one-shot
// challenge feature was unreachable, with no error anywhere.
//
// The fix routes the refresh through renderProgress() itself, so every
// existing call site is covered without touching any of them. This asserts:
//   1. renderProgress() calls refreshOpenCheckinSheet();
//   2. that function rebuilds the sheet body from buildCheckinSheetBodyHTML(),
//      and only while the sheet is open;
//   3. every challenge handler still reaches it through renderProgress() —
//      a handler that stops calling renderProgress() reopens the bug.
//
// 🚨 Reads the REAL source out of index.html. The controls at the end remove
// the call and assert the suite then FAILS. A check that cannot fail proves
// nothing.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'index.html'), 'utf8');

let failures = 0;
const ok   = m => console.log('  ✓ ' + m);
const bad  = m => { failures++; console.log('  ✗ ' + m); };
const check = (cond, m) => cond ? ok(m) : bad(m);

function extract(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start === -1) return null;
  const open = src.indexOf('{', start);
  let depth = 0, i = open;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  return src.slice(start, i + 1);
}

const HANDLERS = ['askBlocForChallenge', 'acceptBlocChallenge', 'declineBlocChallenge'];

function run(src, label) {
  const fails = [];
  const c = (cond, m) => { if (!cond) fails.push(m); };

  const rp = extract(src, 'renderProgress');
  c(!!rp && /\brefreshOpenCheckinSheet\(\)/.test(rp), 'renderProgress() calls refreshOpenCheckinSheet()');

  const refresh = extract(src, 'refreshOpenCheckinSheet');
  c(!!refresh, 'refreshOpenCheckinSheet() exists');
  c(!!refresh && refresh.includes('buildCheckinSheetBodyHTML()'), 'it rebuilds the body from buildCheckinSheetBodyHTML()');
  c(!!refresh && refresh.includes("'checkin-full-body'"), 'it writes into #checkin-full-body');
  c(!!refresh && /classList\.contains\('open'\)/.test(refresh), 'it only rebuilds while the sheet is open');

  for (const h of HANDLERS) {
    const body = extract(src, h);
    c(!!body && body.includes('renderProgress()'), `${h}() re-renders through renderProgress()`);
  }
  const sheet = extract(src, 'buildCheckinSheetBodyHTML');
  c(!!sheet && /_blocChallengeInputOpen=true;renderProgress\(\)/.test(sheet),
    'the "Challenge this →" link re-renders through renderProgress()');

  if (label) return fails.length;
  fails.forEach(bad);
  if (!fails.length) ok('every assertion passed against the shipped source');
  return fails.length;
}

console.log('\nCheck-in sheet — refreshes from inside itself');
run(source, null);

console.log('\nControls — each must FAIL the suite above');
check(run(source.replace(/\n\s*refreshOpenCheckinSheet\(\);/, '\n'), 'control') > 0,
  'removing the refresh from renderProgress() is caught');
check(run(source.replace(/classList\.contains\('open'\)/, 'isConnected'), 'control') > 0,
  'rebuilding the sheet whether or not it is open is caught');

console.log('');
if (failures) {
  console.log(`FAIL — ${failures} problem${failures === 1 ? '' : 's'}\n`);
  process.exit(1);
}
console.log('All checks passed.\n');
