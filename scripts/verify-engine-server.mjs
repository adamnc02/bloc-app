#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-engine-server.mjs — the engine's server build runs Review's verdict
//
// THE BUG THIS PREVENTS: the coach's daily digest naming different clients
// from Today's Off track list. "Off track" is Review's judgement
// (engine/src/review, TECHNICAL §156), and the bloc-push Edge Function runs it
// from engine/dist/bloc-engine-server.mjs. A server with its own copy of the
// rule, or a build that needs a browser to load, would drift or fail at 07:00
// with nobody watching. Coach's outcome-parity.test.ts holds the source equal
// to Coach's screens; this holds the BUILT module to the rules a server needs:
//   · it is committed, and a fresh build of engine/src/server.ts
//     (verify-engine-build.mjs runs the same --check for both outputs);
//   · it is an ES module that loads with no window, document or localStorage;
//   · it exports everything BLOC's bundle does, plus clientOutcome and
//     localDateIn;
//   · clientOutcome() on the demo state reads no clock and writes nothing;
//   · BLOC's own bundle does NOT carry Review's code (BLOC never judges itself).
//
// Needs engine/node_modules for the rebuild check: `npm ci --prefix engine`.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const engineDir = join(repo, 'engine');
const SERVER = 'engine/dist/bloc-engine-server.mjs';
const BLOC = 'engine/dist/bloc-engine.js';
let failures = 0;
function check(label, ok, detail) {
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok && detail) console.log(`    ${detail}`);
}

if (!existsSync(join(engineDir, 'node_modules', 'esbuild'))) {
  console.log('FAIL: engine/node_modules is missing. Run `npm ci --prefix engine` first.');
  process.exit(1);
}

// ── 1. Committed, and a fresh build ────────────────────────────────────────
const tracked = new Set(execFileSync('git', ['ls-files', 'engine'], { cwd: repo, encoding: 'utf8' }).split('\n').filter(Boolean));
check(`${SERVER} is committed (bloc-push imports the committed file)`, tracked.has(SERVER));
const rebuild = spawnSync(process.execPath, ['build.mjs', '--check'], { cwd: engineDir, encoding: 'utf8' });
check(`${SERVER} is byte-identical to a fresh build of engine/src/server.ts`,
  rebuild.status === 0 && rebuild.stdout.includes('bloc-engine-server.mjs matches'), (rebuild.stdout + rebuild.stderr).trim());

// ── 2. It loads as an ES module with no browser globals ────────────────────
const src = readFileSync(join(repo, SERVER), 'utf8');
const BROWSER = /\b(window|document|localStorage|sessionStorage|navigator)\s*\./;
const browserHit = src.match(BROWSER);
check('it never reads window, document, localStorage, sessionStorage or navigator', !browserHit, browserHit && browserHit[0]);
check('control: a module reading window.location would be caught', BROWSER.test(src + '\nwindow.location.href'));
check('it is an ES module (an export list, no BlocEngine global)', /\nexport \{[\s\S]*clientOutcome[\s\S]*\};?\s*$/.test(src) && !/\bvar BlocEngine\b/.test(src));

// The Edge Function's view: a plain dynamic import, no DOM.
const server = await import(pathToFileURL(join(repo, SERVER)).href);
const bloc = vm.runInNewContext(`${readFileSync(join(repo, BLOC), 'utf8')}\n;BlocEngine`, {});
const blocNames = Object.keys(bloc);
const missing = blocNames.filter((n) => !(n in server));
check(`it exports all ${blocNames.length} of BLOC's engine exports`, missing.length === 0, `missing: ${missing.join(', ')}`);
for (const n of ['clientOutcome', 'localDateIn', 'judgeOutcome', 'computeTraining', 'computeNutrition', 'formatInches']) {
  check(`it exports ${n}()`, typeof server[n] === 'function');
}
check("BLOC's bundle does not carry Review's code (clientOutcome, judgeOutcome, computeTraining)",
  !('clientOutcome' in bloc) && !('judgeOutcome' in bloc) && !('computeTraining' in bloc));

// ── 3. clientOutcome() on the demo state: no clock, no writes ──────────────
const demo = JSON.parse(readFileSync(join(repo, 'bloc-demo-data.json'), 'utf8'));
const anchor = typeof demo._devAnchorDate === 'string' ? demo._devAnchorDate : '2026-08-02';
const deepFreeze = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); } return o; };
const state = deepFreeze(server.normaliseState(structuredClone(demo)));

const RealDate = globalThis.Date;
let clockRead = null;
class TrapDate extends RealDate {
  constructor(...a) { if (a.length === 0) { clockRead = 'new Date()'; throw new Error('clock read'); } super(...a); }
  static now() { clockRead = 'Date.now()'; throw new Error('clock read'); }
}
let result = null, err = null;
globalThis.Date = TrapDate;
try { result = server.clientOutcome(state, anchor); } catch (e) { err = e; } finally { globalThis.Date = RealDate; }
check('clientOutcome() runs on the demo state with the clock trapped and the state frozen', !err, err && `${err.message}${clockRead ? ` (${clockRead})` : ''}`);
check(`it returns a verdict for the demo's running cycle (${result ? `${result.status}: ${result.reason}` : 'none'})`,
  !!result && ['on-track', 'off-track', 'no-data'].includes(result.status) && typeof result.reason === 'string' && !!result.macroId);
const none = server.clientOutcome(server.normaliseState({}), anchor);
check('a client with no cycle is no-data, naming no cycle', none.status === 'no-data' && none.macroId === null);
check("localDateIn: 20:10 UTC is the next day in Auckland; an unknown zone is UTC",
  server.localDateIn('Pacific/Auckland', RealDate.parse(`${anchor}T20:10:00Z`)) !== anchor
  && server.localDateIn('Not/AZone', RealDate.parse(`${anchor}T20:10:00Z`)) === anchor);

console.log(failures ? `\n✗ ${failures} check(s) failed` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
