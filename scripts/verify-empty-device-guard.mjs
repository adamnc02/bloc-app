#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-empty-device-guard.mjs
//
// THE BUG THIS PREVENTS (v8.21, TECHNICAL §109): signing in on a device that
// holds no data — a fresh Home Screen install, a re-add, a new phone —
// wrote that emptiness over the account's cloud copy:
//   · the sign-in full sync pushed the empty state, and syncTable() deletes
//     before it inserts, so every mirrored table was emptied;
//   · the opportunistic daily backup uploaded the empty state as TODAY's
//     snapshot (one file per day, upsert), overwriting the real one;
//   · nothing restored the device, because checkSnapshotZero() only ran for
//     devices that already had data.
// Push notifications need a Home Screen install with a manifest (PROMPT-02);
// if existing installs have to be re-added, this is the path every one of
// them would take.
//
// 🚨 The plausible wrong fix is "restore the newest snapshot". If an empty
// snapshot was ever written, the newest one IS empty — so the restore walks
// back to the newest snapshot with real content.
//
// Extracts the real functions from index.html. The CONTROL runs v8.20's
// checkSnapshotZero() (commit d3cc842, what was live) on an empty device and
// shows it restored nothing.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(repo, 'index.html'), 'utf8');
const oldSource = execFileSync('git', ['show', 'd3cc842:index.html'], { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) console.log(`    expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function extractFrom(src, marker, optional = false) {
  const start = src.indexOf(marker);
  if (start === -1) { if (optional) return ''; console.error(`✗ FAIL: ${marker} not found.`); process.exit(1); }
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  return null;
}

// snapshots: { date: stateObject } — listSnapshots() returns them newest first.
function build(src, withNew) {
  const names = ['devBypassHasRealData', 'checkSnapshotZero', 'async function uploadSnapshot', 'async function pushStateToSupabase'];
  const fns = [extractFrom(src, 'function devBypassHasRealData('), extractFrom(src, 'async function checkSnapshotZero('),
    extractFrom(src, 'async function uploadSnapshot('), extractFrom(src, 'async function pushStateToSupabase(')];
  if (withNew) {
    fns.push(extractFrom(src, 'function stateHasRealData('), extractFrom(src, 'function deviceHasRealData('),
      extractFrom(src, 'async function restoreNewestRealSnapshot('));
  }
  return new Function(`
    let state = null, snapshots = {}, ls = {};
    const log = { restored: [], uploaded: [], pushed: 0, modal: [] };
    const localStorage = { getItem: k => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); }, removeItem: k => { delete ls[k]; } };
    const _authResolvedSession = { user: { id: 'u1' } };
    const snapshotPath = (u, d) => d;
    const getLocalToday = () => '2026-09-27';
    const listSnapshots = async () => Object.keys(snapshots).sort().reverse();
    const restoreFromSnapshot = async d => { log.restored.push(d); };
    const openModal = id => log.modal.push(id);
    const supabase = { storage: { from: () => ({
      download: async d => (d in snapshots ? { data: { text: async () => JSON.stringify(snapshots[d]) }, error: null } : { data: null, error: new Error('missing') }),
      upload: async (d) => { log.uploaded.push(d); return { error: null }; },
    }) } };
    const syncBuildExerciseIdContext = () => { log.pushed++; throw new Error('PROCEEDED'); };
    const console = { warn: () => {} };
    ${fns.join('\n')}
    return {
      set: (s, snaps = {}, flags = {}) => { state = s; snapshots = snaps; ls = { ...flags }; log.restored = []; log.uploaded = []; log.pushed = 0; log.modal = []; },
      log, flags: () => ({ ...ls }),
      checkSnapshotZero, uploadSnapshot, pushStateToSupabase,
    };
  `)();
}
const E = build(source, true);
const OLD = build(oldSource, false);

const EMPTY = { macrocycles: [], exercises: {}, trainLogs: {}, bodyLogs: [], nutritionLogs: [], nutritionMeals: {} };
const REAL = { ...EMPTY, macrocycles: [{ id: 'm1' }], trainLogs: { 'm1_1_push_ex_0': { done: true } } };
const tryIt = async fn => { try { await fn(); return 'ok'; } catch (e) { return e.message; } };

// ── Empty device: never writes to the cloud ──────────────────────────────
E.set(EMPTY);
check('empty device: pushStateToSupabase() stops before touching any table', [await tryIt(() => E.pushStateToSupabase('u1')), E.log.pushed], ['ok', 0]);
E.set(REAL);
check('device with data: pushStateToSupabase() proceeds as before', [await tryIt(() => E.pushStateToSupabase('u1')), E.log.pushed], ['PROCEEDED', 1]);
E.set(EMPTY);
check('empty device: uploadSnapshot() refuses (today\'s real backup survives)', [await tryIt(() => E.uploadSnapshot()), E.log.uploaded], ['Nothing on this device to back up yet.', []]);
E.set(REAL);
check('device with data: uploadSnapshot() uploads today\'s file', [await tryIt(() => E.uploadSnapshot()), E.log.uploaded], ['ok', ['2026-09-27']]);

// ── Empty device: restores the newest REAL backup ────────────────────────
E.set(EMPTY, { '2026-09-25': REAL, '2026-09-26': REAL });
await E.checkSnapshotZero();
check('empty device + backups → restores the newest', E.log.restored, ['2026-09-26']);
check('…and marks the restore as done (once only)', E.flags().bloc_snapshot_autorestore_done, '1');
E.set(EMPTY, { '2026-09-25': REAL, '2026-09-26': REAL, '2026-09-27': EMPTY });
await E.checkSnapshotZero();
check('an EMPTY newest snapshot is skipped for the newest real one', E.log.restored, ['2026-09-26']);
E.set(EMPTY, { '2026-09-27': { junk: true }, '2026-09-26': REAL });
await E.checkSnapshotZero();
check('an invalid snapshot is skipped too', E.log.restored, ['2026-09-26']);
E.set(EMPTY, {});
await E.checkSnapshotZero();
check('empty device, no backups (a genuinely new account) → nothing restored, no notice', [E.log.restored, E.log.modal], [[], []]);
E.set(EMPTY, { '2026-09-26': REAL }, { bloc_snapshot_autorestore_done: '1' });
await E.checkSnapshotZero();
check('already restored once (or emptied on purpose) → not refilled', E.log.restored, []);

// ── Device with data: the existing v8.09 behaviour is unchanged ──────────
E.set(REAL, { '2026-09-26': REAL });
await E.checkSnapshotZero();
check('device with data + backups → the existing auto-restore still runs', E.log.restored, ['2026-09-26']);
E.set(REAL, {});
await E.checkSnapshotZero();
check('device with data, no backups → the existing snapshot-zero notice', E.log.modal, ['modal-snapshot-zero']);

// ── CONTROL: v8.20 on an empty device ────────────────────────────────────
OLD.set(EMPTY, { '2026-09-26': REAL });
await OLD.checkSnapshotZero();
check('CONTROL: v8.20 left an empty device empty (restored nothing)', OLD.log.restored, []);
OLD.set(EMPTY);
check('CONTROL: v8.20 uploaded an empty snapshot', [await tryIt(() => OLD.uploadSnapshot()), OLD.log.uploaded], ['ok', ['2026-09-27']]);
OLD.set(EMPTY);
check('CONTROL: v8.20 pushed an empty device', [await tryIt(() => OLD.pushStateToSupabase('u1')), OLD.log.pushed], ['PROCEEDED', 1]);

// ── Wiring ───────────────────────────────────────────────────────────────
const clear = source.slice(source.indexOf('function clearAllData('), source.indexOf('function clearAllData(') + 4000);
check('Clear all data marks the device so it is not refilled from the cloud', /setItem\('bloc_snapshot_autorestore_done', '1'\)/.test(clear), true);

console.log(failures ? `\n✗ ${failures} check(s) failed` : '\nALL CHECKS PASS');
process.exit(failures ? 1 : 0);
