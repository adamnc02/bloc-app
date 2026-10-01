#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-demo-no-backup.mjs — a demo account never writes its own backup
//
// THE BUG IT PREVENTS: the BLOC Coach demo Rebuild (TECHNICAL §164) writes each
// demo client's backup for today, and the demo is shown by restoring it
// (Settings → My data → Restore). Backups are one file a day, named by the
// date. So the device's first open after a Rebuild (the daily backup,
// maybeUploadOpportunisticSnapshot) or a sign-out (signOutUser backs up
// first) would upload this device's OLD data as today's backup, over the
// fresh one, and Restore would bring back the old dates.
//
// THE RULES:
//   · uploadSnapshot() refuses for a session whose app_metadata.demo is true,
//     before it touches storage: no upload, no "last backup" date.
//   · A normal account (no flag, or demo not exactly true) still backs up.
//   · uploadSnapshot() is the ONLY writer of a backup file, so the daily
//     backup, the sign-out backup and Settings' buttons are all covered.
// CONTROL: the same function without its demo line uploads for a demo account.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(repo, 'index.html'), 'utf8');
let failures = 0;
function check(label, ok, detail) {
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok && detail) console.log(`    ${detail}`);
}
function extract(src, name) {
  for (const marker of [`async function ${name}(`, `function ${name}(`]) {
    const start = src.indexOf(marker);
    if (start === -1) continue;
    let depth = 0;
    for (let i = src.indexOf('{', start); i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
    }
  }
  return null;
}

const upload = extract(source, 'uploadSnapshot');
const isDemo = extract(source, 'isDemoAccount');
check('index.html has isDemoAccount() and uploadSnapshot()', !!upload && !!isDemo);

/** Runs uploadSnapshot() for a session with this app_metadata; returns what reached storage. */
async function run(fnSource, appMetadata) {
  const uploads = [], store = new Map();
  const f = new Function('env', `
    const localStorage = { getItem: (k) => env.store.get(k) ?? null, setItem: (k, v) => env.store.set(k, String(v)) };
    const supabase = { storage: { from: () => ({ upload: async (path) => { env.uploads.push(path); return { error: null }; } }) } };
    const _authResolvedSession = { user: { id: 'uid-1', app_metadata: env.appMetadata } };
    const state = { macrocycles: [{ id: 'm' }] };
    const accountSwitchBlocks = () => false, deviceHasRealData = () => true, demoTourIsRunning = () => false;
    const getLocalToday = () => '2026-10-07', snapshotPath = (u, d) => 'bloc/' + u + '/' + d + '.json';
    ${isDemo || 'function isDemoAccount() { return false; }'}
    ${fnSource}
    return uploadSnapshot;
  `);
  const fn = f({ uploads, store, appMetadata });
  let error = null;
  try { await fn(); } catch (e) { error = e.message; }
  return { uploads, error, lastDate: store.get('bloc_last_snapshot_date') ?? null };
}

const demo = await run(upload, { provider: 'email', demo: true });
check('a demo account: refused, nothing uploaded, no "last backup" date', demo.uploads.length === 0 && !!demo.error && demo.lastDate === null, JSON.stringify(demo));
check('  with a reason Settings can show', /demo/i.test(demo.error || ''), demo.error);
for (const [label, meta] of [['no flag', { provider: 'email' }], ['demo: "true" (a string)', { provider: 'email', demo: 'true' }], ['no app_metadata', undefined]]) {
  const r = await run(upload, meta);
  check(`a normal account (${label}) still backs up`, r.uploads.length === 1 && r.lastDate === '2026-10-07', JSON.stringify(r));
}

// Every backup goes through uploadSnapshot: the only upload to app-backups.
const writers = [...source.matchAll(/from\('app-backups'\)\s*\.upload\(/g)].map((m) => m.index);
const inUpload = writers.every((i) => i > source.indexOf('async function uploadSnapshot(') && i < source.indexOf('async function uploadSnapshot(') + upload.length);
check('uploadSnapshot() is the only writer of a backup file', writers.length === 1 && inUpload, `${writers.length} upload call(s)`);

// Control: without the demo line, a demo account uploads.
const without = upload.split('\n').filter((l) => !l.includes('isDemoAccount()')).join('\n');
const ctl = await run(without, { provider: 'email', demo: true });
check('control: without the guard, a demo account’s backup is uploaded', ctl.uploads.length === 1);

if (failures) { console.log(`\n✗ ${failures} failed`); process.exit(1); }
console.log('\n✓ demo accounts never write their own backups');
