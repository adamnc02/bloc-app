#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-dev-bypass-real-data.mjs
//
// THE BUG THIS PREVENTS: the local dev bypass silently masking a restored
// backup, and pinning "today" to a fixture date while showing real logs.
//
// On a loopback/private host, IS_LOCAL_DEV skips Supabase and OAuth entirely so
// the app can be driven with no sign-in. It used to seed the demo dataset on
// EVERY load. That made restoring a real backup useless for testing: the import
// saved it to `bloc_state` correctly, load() put it into `state` on the next
// boot — and enterDemoMode() then replaced it. The data was never lost, only
// invisible, which is the worst version: you test happily against demo numbers
// believing they are yours.
//
// 🚨 The second half is the dangerous half. bloc-demo-data.dev.json carries a
// `_devAnchorDate` that overrides "today" app-wide via setTourAnchorDate(). Held
// over a real backup, every "this week" average, every pace figure and every
// qualifying-day gate is computed against the fixture's date instead of the real
// one. Nothing on screen says so. Demo data with a demo date is coherent; real
// data with a demo date is quietly wrong.
//
// So the guard has to do BOTH: skip the seeding, and skip the anchor with it.
//
// 🚨 This reads the REAL source out of index.html rather than keeping a copy,
// and the control at the end deletes the guard and asserts the checks then fail.
// A test that cannot fail proves nothing.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');

let failures = 0;
const check = (label, cond) => {
  console.log(`${cond ? '✓' : '✗'} ${label}`);
  if (!cond) failures++;
};

// Pull out the IS_LOCAL_DEV branch of continueBootAfterAuth().
function extractDevBranch(source) {
  const start = source.indexOf('function continueBootAfterAuth()');
  if (start === -1) return null;
  const branch = source.indexOf('if (IS_LOCAL_DEV) {', start);
  if (branch === -1) return null;
  // Up to the non-dev path, which begins at fetchDemoDataIfNewUser().
  const end = source.indexOf('fetchDemoDataIfNewUser(', branch);
  return end === -1 ? null : source.slice(branch, end);
}

// 🚨 Strip comments before ANY position check. This script's own explanatory
// comments contain the literal text "enterDemoMode()" and "setTourAnchorDate(",
// so an indexOf() over the raw branch matches the prose ABOVE the guard and
// reports the guard as too late. Same shape as the probe-matches-its-own-source
// trap; here the source was this file's neighbours in the extracted slice.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

// The assertions, run against a given copy of the dev branch so the control
// can re-run them against a mutated one.
function runChecks(rawBranch, emit) {
  const devBranch = stripComments(rawBranch);
  const guard = /if\s*\(\s*!_isNewUserOnBoot\s*\)\s*\{[^}]*return;\s*\}/.test(devBranch);
  emit('dev bypass refuses to seed demo data when bloc_state exists', guard);

  // The guard must come BEFORE any enterDemoMode() call, or it seeds first.
  const guardAt = devBranch.search(/if\s*\(\s*!_isNewUserOnBoot\s*\)/);
  const seedAt = devBranch.indexOf('enterDemoMode()');
  emit('the guard precedes every enterDemoMode() call in the branch',
    guard && guardAt !== -1 && seedAt !== -1 && guardAt < seedAt);

  // Every setTourAnchorDate() in the branch must sit after the guard too —
  // that is the half that corrupts real figures rather than just hiding them.
  const anchors = [...devBranch.matchAll(/setTourAnchorDate\(/g)].map(m => m.index);
  emit('no _devAnchorDate is applied before the guard returns',
    guard && anchors.length > 0 && anchors.every(i => i > guardAt));

  return guard;
}

const devBranch = extractDevBranch(html);
check('the IS_LOCAL_DEV branch of continueBootAfterAuth() was found', !!devBranch);

if (devBranch) {
  runChecks(devBranch, check);

  // Boot order: load() must run before the branch can consult bloc_state, and
  // _isNewUserOnBoot must be declared before it is read.
  check('_isNewUserOnBoot is declared from bloc_state',
    /const _isNewUserOnBoot = !localStorage\.getItem\('bloc_state'\)/.test(html));
  check('load() runs after _isNewUserOnBoot is declared',
    html.indexOf("const _isNewUserOnBoot") < html.indexOf('\nload();'));

  // Restoring must not need Supabase: importData() is the local-file path and
  // has to stay free of it, or the whole no-auth workflow breaks.
  const imp = html.slice(html.indexOf('function importData('),
                         html.indexOf('function importData(') + 2000);
  check('importData() never touches supabase', !/supabase/i.test(imp));
  check('importData() persists via save()', /\bsave\(\);/.test(imp));

  // ── CONTROL ──────────────────────────────────────────────────────────
  // Delete the guard and assert these checks then fail. Without this, a
  // rewrite that quietly drops the guard would still show a green suite.
  const mutated = devBranch.replace(/if\s*\(\s*!_isNewUserOnBoot\s*\)\s*\{[^}]*return;\s*\}/, '');
  let controlFailures = 0;
  runChecks(mutated, (_l, cond) => { if (!cond) controlFailures++; });
  check(`CONTROL: deleting the guard fails ${controlFailures} of 3 checks`, controlFailures === 3);
}

console.log(failures === 0
  ? '\nAll checks passed.'
  : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 1 - 1 : 1);
