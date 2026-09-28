#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-demo-tour-restore.mjs — v8.40, TECHNICAL §133
//
// THE BUG THIS PREVENTS (found in the v8.40 UAT, 2026-09-28, on the Work
// account's first sign-in to a local build): on a NEW device whose account
// has a cloud backup, the Demo Tour and the auto-restore both started. The
// demo data (a local file) landed first; the restore's save() was then
// refused, because since v8.30 (§120) save() does nothing while the tour's
// anchor is set. The page reloaded with nothing saved, and the "already
// restored" flag stopped it retrying: the account sat on the Demo Tour with
// none of its data, every launch. Separately, the welcome sheet's ✕ (and a
// swipe or backdrop tap) only closed the sheet, leaving the demo data and its
// pinned "today" in place for the whole session, which also made a linked
// client read as Solo (coachedView() treats the tour as Solo).
//
// THE RULES:
//   · a restore always saves: restoreFromSnapshot() ends any tour first;
//   · a new device whose account has backups restores and never tours; if
//     every backup is empty, the tour starts; with NO backups, nothing here
//     starts it (the mode question owns a new account, §129);
//   · every way out of the welcome sheet but "Let's go" leaves demo mode,
//     exactly as finishing does;
//   · (§134) the coach's publications are never applied onto an EMPTY device
//     whose account has backups. In the same UAT, the pull filled the empty
//     device with the coach's two cycles, which made it "real", so the mirror
//     push deleted the account's 602 set logs from the server and the daily
//     snapshot was overwritten with the coach-only state.
//
// Control: v8.39 (31ec0b7) must fail.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTROL = '31ec0b7';

function extract(src, marker) {
  const start = src.indexOf(marker);
  if (start === -1) return null;
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  return null;
}

async function run(label, src) {
  let failures = 0;
  const check = (name, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    console.log(`${ok ? '✓' : '✗'} [${label}] ${name}`);
    if (!ok) console.log(`    expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  };
  const need = (...m) => m.map(x => extract(src, x));

  // ── 1. A restore that lands mid-tour still saves ─────────────────────────
  {
    const [restore, save, running, setAnchor] = need('async function restoreFromSnapshot(', 'function save()',
      'function demoTourIsRunning()', 'function setTourAnchorDate(');
    const store = new Map(); const log = [];
    const f = new Function('env', `
      const STATE_KEY = 'bloc_state_authreal', IS_LOCAL_DEV = false;
      let state = { demo: true }, _tourAnchorDate = '2026-08-02', _tourState = { step: 1 };
      const localStorage = { setItem: (k, v) => env.store.set(k, v) };
      const markSyncDirty = () => {};
      const endTour = () => { _tourState = null; env.log.push('endTour'); };
      const location = { reload: () => env.log.push('reload') };
      const snapshotPath = (u, d) => u + '/' + d;
      const supabase = { storage: { from: () => ({ download: async () => ({ data: { text: async () => JSON.stringify({ macrocycles: [{ id: 'm1' }], exercises: {}, trainLogs: {}, mine: true }) }, error: null }) }) } };
      const _authResolvedSession = { user: { id: 'u1' } };
      ${[restore, save, running, setAnchor].join('\n')}
      return { restoreFromSnapshot, anchor: () => _tourAnchorDate };`)({ store, log });
    await f.restoreFromSnapshot('2026-09-27');
    const saved = store.get('bloc_state_authreal');
    check('a restore that lands while the Demo Tour runs is SAVED (the backup, not the demo)', !!saved && JSON.parse(saved).mine === true, true);
    check('…the tour is ended and "today" unpinned before the reload', [log.includes('endTour'), f.anchor(), log[log.length - 1]], [true, null, 'reload']);
  }

  // ── 2. checkSnapshotZero(): backups restore; all-empty backups tour; none does nothing
  {
    const [csz] = need('async function checkSnapshotZero(');
    const zero = async (result, isNew = true) => {
      const log = []; const store = new Map();
      const g = new Function('env', `
        const localStorage = { getItem: k => env.store.get(k) || null, setItem: (k, v) => env.store.set(k, v), removeItem: k => env.store.delete(k) };
        const deviceHasRealData = () => false;
        const restoreNewestRealSnapshot = async () => env.result;
        const fetchDemoDataIfNewUser = v => env.log.push(['demo', v]);
        const _isNewUserOnBoot = env.isNew;
        ${csz}
        return checkSnapshotZero;`)({ log, store, result, isNew });
      await g();
      return log;
    };
    check('backups exist and one restored: no tour', await zero(true), []);
    check('backups exist but every one is empty: a new user after all, the tour starts', await zero(false), [['demo', true]]);
    check('no backups at all: nothing here starts the tour (the mode question owns a new account)', await zero('none'), []);
    check('a returning device\'s empty restore never starts the tour', await zero(false, false), []);
  }
  {
    const [rnrs] = need('async function restoreNewestRealSnapshot(');
    const h = new Function(`
      const _authResolvedSession = { user: { id: 'u1' } };
      const listSnapshots = async () => [];
      ${rnrs}
      return restoreNewestRealSnapshot;`)();
    check('restoreNewestRealSnapshot() says "none" when the account has no backups', await h(), 'none');
  }

  // ── 3. Every way out of the welcome sheet leaves demo mode ───────────────
  {
    const [skip] = need('function skipDemoTour(');
    let ok = false;
    if (skip) {
      const log = [];
      new Function('env', `
        const _tourAnchorDate = '2026-08-02';
        const closeModal = id => env.log.push(['close', id]);
        const exitDemoMode = () => env.log.push(['exit']);
        ${skip}
        skipDemoTour();`)({ log });
      ok = JSON.stringify(log) === JSON.stringify([['close', 'modal-tour-welcome'], ['exit']]);
    }
    check('skipDemoTour() closes the sheet AND exits demo mode', ok, true);
    const welcome = extract(src, '<div class="modal-overlay" id="modal-tour-welcome">') || '';
    check('the welcome sheet\'s ✕ is skipDemoTour()', /modal-close-btn" onclick="skipDemoTour\(\)"/.test(welcome), true);
    check('…and so are its swipe and backdrop (MODAL_DISMISS_HANDLERS)', /'modal-tour-welcome': 'skipDemoTour'/.test(src), true);
    check('"Let\'s go" still starts the steps, not a skip', /closeModal\('modal-tour-welcome'\);beginDemoTourSteps\(\);/.test(welcome), true);
  }
  // ── 4. §134: the pull waits for the restore ──────────────────────────────
  {
    const [pull] = need('async function pullPublicationsOnce(');
    const pullRun = async (real, snapshots) => {
      const log = [];
      const f = new Function('env', `
        const coachingAvailable = () => true, isCoachedMode = () => true;
        const coachLinkGet = () => ({ clientRecordId: 'card-1' });
        const refreshCoachLink = async () => {};
        const deviceHasRealData = () => env.real;
        const listSnapshots = async () => { env.log.push('list'); if (env.snapshots === 'fail') throw new Error('offline'); return env.snapshots; };
        const publicationCursor = () => 0;
        let _pubPending = [];
        const drainPublications = async () => 'drained';
        const chain = { select() { return chain; }, eq() { return chain; }, gt() { return chain; }, order() { return chain; }, async limit() { env.log.push('fetch'); return { data: [], error: null }; } };
        const supabase = { from: () => chain };
        ${pull}
        return pullPublicationsOnce;`)({ real, snapshots, log });
      const r = await f();
      return [r, log.includes('fetch')];
    };
    check('an EMPTY device whose account has backups fetches nothing and waits for its restore', await pullRun(false, ['2026-09-27']), ['awaiting-restore', false]);
    check('…and if it can\'t tell (the backup list failed), it waits too', await pullRun(false, 'fail'), ['awaiting-restore', false]);
    check('a brand-new account (empty, no backups) still gets its plan at once', await pullRun(false, []), ['drained', true]);
    check('a device with real data pulls as before, without listing backups', await pullRun(true, ['x']), ['drained', true]);
  }
  return failures;
}

const failures = await run('now', readFileSync(join(repo, 'index.html'), 'utf8'));

console.log(`\n— control: v8.39 (${CONTROL}), which must fail —`);
const orig = console.log; const lines = []; console.log = s => lines.push(String(s));
let cf = 0;
try { cf = await run('v8.39', execFileSync('git', ['show', `${CONTROL}:index.html`], { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })); }
catch (e) { cf = 99; lines.push('✗ threw: ' + e.message); }
finally { console.log = orig; }
const failed = lines.filter(l => l.startsWith('✗'));
const want = [/is SAVED/, /skipDemoTour\(\) closes/, /fetches nothing and waits/];
const missing = want.filter(re => !failed.some(l => re.test(l)));
if (cf > 0 && !missing.length) console.log(`✓ control: v8.39 fails ${cf} checks, including the unsaved restore, the ✕ that didn't skip, and the pull onto an empty device`);
else { console.log(`✗ control: v8.39 should fail the unsaved restore and the skip (${cf} failed; missing ${missing.join(', ')})`); process.exitCode = 1; }

if (failures) { console.log(`\nFAIL: ${failures} check(s) failed.`); process.exit(1); }
console.log('\nAll checks passed.');
