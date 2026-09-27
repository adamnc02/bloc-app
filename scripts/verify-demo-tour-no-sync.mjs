#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-demo-tour-no-sync.mjs — the Demo Tour's data never leaves memory
// (v8.30, TECHNICAL §120; deep dive D6)
//
// THE BUG THIS PREVENTS. A brand-new account's first sign-in starts the Demo
// Tour, which swaps `state` for bloc-demo-data.json. enterDemoMode() promised
// that dataset was "memory-only — never save()'d". It wasn't: entering a
// screen and the tour's own steps call save(), and save() wrote localStorage
// and queued a sync. So every new account had the demo dataset pushed into its
// live mirror (and could have it uploaded as today's backup) — found in the
// v8.30 UAT on the test client account: body_logs +56 +56 −56, exactly the
// demo's 56 weigh-ins, and the same shape in every mirrored table. A reload
// mid-tour was worse: the saved demo data came back with no anchor, and synced
// as the account's own.
//
// THE FIX. save() does nothing while the Demo Tour runs (demoTourIsRunning():
// the tour's anchor date is pinned, and this is not the local bypass). The
// three writers that read `state` directly — pushStateToSupabase (the sign-in
// full sync reaches it with no save()), uploadSnapshot and
// syncMeasurementStatus — each refuse too, as a backstop.
//
// 🚨 THE TRAPS:
//   · exitDemoMode() must clear the anchor BEFORE its save(), or the empty
//     state that ends the tour is never written and the demo data survives in
//     memory with nothing to replace it. Same for a restore (importData).
//   · The local bypass also pins an anchor over its demo data. It has no
//     Supabase and must keep v8.29's behaviour, so it is excluded — checked.
//   · A backstop placed after the write it guards is decoration. Each one is
//     checked to come BEFORE the first network call in its function.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mainScript, indexTopLevel } from './golden/extract-engine.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = mainScript(readFileSync(join(repo, 'index.html'), 'utf8'));
let oldSource;
try {
  oldSource = mainScript(execFileSync('git', ['show', 'ba8fcc6:index.html'], { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
} catch (e) {
  console.error('✗ FAIL: could not read index.html at ba8fcc6 (v8.29, the control). Run from a full clone.');
  process.exit(1);
}

let failures = 0;
function check(label, ok, detail) {
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok && detail) console.log(`    ${detail}`);
}
const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

// ── 1. save() in each mode, run for real ─────────────────────────────────
function saveHarness(src, { anchor, bypass }) {
  const { decls } = indexTopLevel(src);
  const guard = decls.has('demoTourIsRunning') ? decls.get('demoTourIsRunning').text : '';
  return new Function(`
    const store = {}; let dirty = 0;
    const localStorage = { setItem: (k, v) => { store[k] = v; } };
    function markSyncDirty() { dirty++; }
    const _tourAnchorDate = ${JSON.stringify(anchor)};
    const IS_LOCAL_DEV = ${bypass};
    const STATE_KEY = 'bloc_state'; // v8.29's save() names the key directly; v8.30's reads this
    const state = { macrocycles: [{ id: 'demo' }] };
    ${decls.get('save').text}
    ${guard}
    save();
    return { wrote: Object.keys(store).length > 0, dirty };`)();
}
{
  const tour = saveHarness(source, { anchor: '2026-08-02', bypass: false });
  check('Demo Tour running (anchor pinned, not the bypass): save() writes nothing and queues no sync',
    !tour.wrote && tour.dirty === 0, JSON.stringify(tour));
  const normal = saveHarness(source, { anchor: null, bypass: false });
  check('no tour: save() writes localStorage and queues a sync, as before', normal.wrote && normal.dirty === 1, JSON.stringify(normal));
  const bypass = saveHarness(source, { anchor: '2026-08-02', bypass: true });
  check('local bypass with its demo anchor: save() behaves as v8.29 (writes, queues)', bypass.wrote && bypass.dirty === 1, JSON.stringify(bypass));
  const old = saveHarness(oldSource, { anchor: '2026-08-02', bypass: false });
  check('control: v8.29\'s save() DID write and queue a sync during the tour (the bug)', old.wrote && old.dirty === 1, JSON.stringify(old));
}

// ── 2. The three backstops come before their first network call ─────────
const { decls } = indexTopLevel(source);
function guardFirst(name, networkPattern) {
  const body = stripComments(decls.get(name).text);
  const g = body.indexOf('demoTourIsRunning()');
  const net = body.search(networkPattern);
  return g !== -1 && (net === -1 || g < net);
}
check('pushStateToSupabase refuses during the tour, before building or sending any row',
  guardFirst('pushStateToSupabase', /syncBuildExerciseIdContext|syncTable\(|supabase\./));
check('uploadSnapshot refuses during the tour, before the upload', guardFirst('uploadSnapshot', /\.upload\(/));
check('syncMeasurementStatus refuses during the tour, before the upsert', guardFirst('syncMeasurementStatus', /\.upsert\(/));

// ── 3. Ordering around the tour ─────────────────────────────────────────
{
  const exit = stripComments(decls.get('exitDemoMode').text);
  const clear = exit.indexOf('setTourAnchorDate(null)');
  const save = exit.lastIndexOf('save()');
  check('exitDemoMode clears the anchor BEFORE saving the empty state (or the wipe is never written)',
    clear !== -1 && save !== -1 && clear < save);
  const enter = stripComments(decls.get('enterDemoMode').text);
  check('enterDemoMode pins the anchor before showing any screen (showScreen can save)',
    enter.indexOf('setTourAnchorDate(') !== -1 && enter.indexOf('setTourAnchorDate(') < enter.indexOf('showScreen('));
  check('ensureStateDefaults (run inside enterDemoMode before the anchor) never saves',
    !/\bsave\(\)/.test(stripComments(decls.get('ensureStateDefaults').text)));
  const imp = stripComments(source);
  const i = imp.indexOf('endTour();\n      setTourAnchorDate(null);\n      save();');
  check('a restore clears the anchor before it saves (importData)', i !== -1);
}

console.log(failures ? `\n✗ ${failures} check(s) failed` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
