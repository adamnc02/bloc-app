#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-step-imports.mjs
//
// THE BUGS THIS PREVENTS (§178). An iOS Shortcut sends the day's steps to
// the server's step_imports inbox, and BLOC pulls them into state.bodyLogs.
// Each of these would lose or corrupt a body log without any error:
//   · writing the whole entry, not just steps → the day's weight, waist and
//     hip wiped by a step count
//   · re-applying a row already applied → a hand edit made since overwritten
//     on every pull, with no new figure from the Shortcut
//   · a ledger outside `state` → a restore keeps the newer cursor, and the
//     imports the restored state lacks are never fetched again
//   · applying under an open sheet → the Body log sheet's stale save
//     overwrites the import
//   · applying onto an empty device whose account has backups → the steps
//     become its only data, and the §109 guard lets them overwrite the
//     account's real mirror and snapshot
//   · pulling in the local dev bypass → the fixture user queries the live
//     project
//   · anything here writing the server → step_imports is written by the
//     Edge Function only; BLOC reads it
//
// applyStepImports and stepImportCursor run in a sandbox on demo-shaped
// data; the wiring is checked statically. A control runs the same checks
// on the v8.63 index.html (before this existed), which must fail.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(repo, 'index.html'), 'utf8');

function run(src, label, quiet = false) {
  let failures = 0;
  const check = (name, ok) => { if (!ok) failures++; if (!quiet) console.log(`${ok ? '✓' : '✗'} ${name}`); };
  const fn = (name) => {
    const at = src.indexOf(`function ${name}(`);
    if (at < 0) return '';
    let depth = 0, i = src.indexOf('{', at);
    for (let j = i; j < src.length; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}' && --depth === 0) return src.slice(at, j + 1);
    }
    return '';
  };

  // ── The merge, run for real ──────────────────────────────────────────
  const helpers = fn('applyStepImports') + '\n' + fn('stepImportCursor');
  let ctx = null;
  try {
    ctx = vm.createContext({ state: {} });
    vm.runInContext(helpers, ctx);
  } catch (e) { ctx = null; }
  const ev = (code) => { try { return ctx ? vm.runInContext(code, ctx) : undefined; } catch (e) { return undefined; } };
  const R1 = '2026-10-31T23:00:01.5+00:00', R2 = '2026-11-01T23:00:02.1+00:00';

  ev(`state = { bodyLogs: [
    { date: '2026-10-30', weight: 182.4, steps: 4000, waist: 33.5, hip: 38 },
    { date: '2026-10-29', weight: 183, steps: 7000, waist: null, hip: null } ] }`);
  const changed = ev(`applyStepImports(state, [
    { log_date: '2026-10-30', steps: 11204, received_at: '${R1}' },
    { log_date: '2026-10-31', steps: 9412,  received_at: '${R1}' } ])`);
  check(`${label}: both days applied`, JSON.stringify(changed) === '["2026-10-30","2026-10-31"]');
  const d30 = ev(`JSON.stringify(state.bodyLogs.find(l => l.date === '2026-10-30'))`);
  check(`${label}: 🚨 an existing day keeps its weight, waist and hip; only steps change (Shortcut wins over 4000)`,
    d30 === JSON.stringify({ date: '2026-10-30', weight: 182.4, steps: 11204, waist: 33.5, hip: 38 }));
  check(`${label}: a day with no log gets one with steps only`,
    ev(`JSON.stringify(state.bodyLogs.find(l => l.date === '2026-10-31'))`) === JSON.stringify({ date: '2026-10-31', weight: null, steps: 9412, waist: null, hip: null }));
  check(`${label}: a day the Shortcut didn't send is untouched`,
    ev(`state.bodyLogs.find(l => l.date === '2026-10-29').steps`) === 7000);
  check(`${label}: the ledger lives in state.stepImports, and is the cursor`,
    ev(`state.stepImports['2026-10-31']`) === R1 && ev(`stepImportCursor()`) === R1);

  ev(`state.bodyLogs.find(l => l.date === '2026-10-31').steps = 9999`); // a hand edit after the import
  const again = ev(`applyStepImports(state, [{ log_date: '2026-10-31', steps: 9412, received_at: '${R1}' }])`);
  check(`${label}: 🚨 the same row again changes nothing, so a later hand edit stands`,
    Array.isArray(again) && again.length === 0 && ev(`state.bodyLogs.find(l => l.date === '2026-10-31').steps`) === 9999);
  const next = ev(`applyStepImports(state, [{ log_date: '2026-10-31', steps: 10050, received_at: '${R2}' }])`);
  check(`${label}: a newer row for the day replaces it, and moves the cursor`,
    Array.isArray(next) && next.length === 1 && ev(`state.bodyLogs.find(l => l.date === '2026-10-31').steps`) === 10050
    && ev(`stepImportCursor()`) === R2);
  const bad = ev(`applyStepImports(state, [
    { log_date: '2026-10-28', steps: 0, received_at: '${R2}' },
    { log_date: 'yesterday', steps: 10, received_at: '${R2}' },
    { log_date: '2026-10-27', steps: 10 } ])`);
  check(`${label}: a zero, a bad date or a row without received_at is ignored`,
    Array.isArray(bad) && bad.length === 0 && ev(`state.bodyLogs.length`) === 3);

  // A restore brings back an older ledger: the cursor drops, the next pull re-applies.
  ev(`state = { bodyLogs: [], stepImports: { '2026-10-30': '${R1}' } }`);
  check(`${label}: after a restore the cursor is the restored ledger's`, ev(`stepImportCursor()`) === R1);
  ev(`state = {}`);
  check(`${label}: an empty ledger pulls everything`, ev(`stepImportCursor()`) === '1970-01-01T00:00:00Z');

  // ── The wiring ───────────────────────────────────────────────────────
  const pull = fn('pullStepImportsOnce');
  check(`${label}: the pull reads step_imports newer than the cursor, for this user`,
    /from\('step_imports'\)/.test(pull) && /\.gt\('received_at', stepImportCursor\(\)\)/.test(pull) && /\.eq\('user_id'/.test(pull));
  check(`${label}: the pull waits for an empty device's restore and never crosses an account switch`,
    /deviceHasRealData\(\)/.test(pull) && /listSnapshots\(\)/.test(pull) && /accountSwitchBlocks\(\)/.test(pull));
  check(`${label}: applying waits as publications do (an open sheet, a Train input, the tour)`,
    /publicationsMustWait\(\)/.test(fn('drainStepImports')) && /save\(\)/.test(fn('drainStepImports')));
  check(`${label}: no pull in the local dev bypass`, /!IS_LOCAL_DEV/.test(fn('stepImportsAvailable')));
  check(`${label}: pulled on sign-in, resume, online and the poll`,
    /requestStepImportPull\('sign-in'\)/.test(fn('onAuthResolved'))
    && /requestStepImportPull\('resume'\)/.test(src) && /requestStepImportPull\('online'\)/.test(src) && /requestStepImportPull\('poll'\)/.test(src));
  check(`${label}: 🚨 BLOC never writes step_imports or step_tokens`,
    !/from\('step_(imports|tokens)'\)[\s\S]{0,120}\.(insert|update|upsert|delete)\(/.test(src));
  check(`${label}: the key is made and revoked through the RPCs, and forgotten when the sheet closes`,
    /rpc\('create_step_token'\)/.test(fn('makeStepsKey')) && /rpc\('revoke_step_token'\)/.test(fn('revokeStepsKey'))
    && /modal-steps-shortcut'\) _stepsNewKey = null/.test(src));
  check(`${label}: Linked services has the row, and the sheet exists`,
    /onclick="openModal\('modal-steps-shortcut'\)"/.test(src) && /id="modal-steps-shortcut"/.test(src));
  return failures;
}

const failures = run(html, 'v8.64');
if (failures) process.exitCode = 1;

let control = '';
try { control = execFileSync('git', ['show', 'c19166d:index.html'], { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); } catch (e) { /* shallow clone */ }
if (control) {
  const controlFailures = run(control, 'control v8.63', true);
  console.log(`${controlFailures > 0 ? '✓' : '✗'} control: the v8.63 index.html fails ${controlFailures} of these checks (must be > 0)`);
  if (controlFailures === 0) process.exitCode = 1;
}
