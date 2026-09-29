#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-account-switch.mjs
//
// THE BUG IT PREVENTS (v8.46, TECHNICAL §145): BLOC keeps local data on
// sign-out, and the next account to sign in on the device adopted it. The
// sign-in full sync pushed it into that account's mirror, a coached account
// uploaded it as client_state, and the coach's publications were applied
// into it and receipted from it. One test account received a real account's
// data this way, and its coach's receipts still describe cycles it never had.
//
// THE RULES:
//   · The device records whose data is local (bloc_state_owner).
//   · A sign-in by ANOTHER account while that data is here runs nothing (no
//     mirror push, no snapshot, no coach link refresh, so no client_state
//     upload and no publication pull) and switches AT ONCE, with no screen:
//     only the account's local keys go (state, snapshot flags, client_state
//     meta, coach link), the device's own stay (device id, push
//     registration, the AI key), the new owner is recorded and the page
//     reloads, so the new-device restore (§133) brings back that account's
//     own backup.
//   · Another account's identity is never shown or stored: the owner record
//     is a uid.
//   · Signing out backs the account up first, while it can still write its
//     own backup, so nothing it changed on this device is lost.
//   · No owner recorded (an install before v8.46, or a fresh one), or nothing
//     on the device: the account signing in claims it, as before.
//   · Every writer refuses while the switch is pending.
//
// Drives A → B → A through the real functions from index.html, with fake
// storage and every network writer replaced by a recorder.
// CONTROL: v8.45 (85ddc8b) runs the full sync for B over A's data.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const current = readFileSync(join(repo, 'index.html'), 'utf8');
let failures = 0;
function check(label, ok, detail) {
  if (ok) console.log('✓ ' + label);
  else { failures++; console.log('✗ ' + label + (detail ? `\n    ${detail}` : '')); }
}
function extract(source, name) {
  for (const marker of [`async function ${name}(`, `function ${name}(`]) {
    const start = source.indexOf(marker);
    if (start === -1) continue;
    let depth = 0;
    for (let i = source.indexOf('{', start); i < source.length; i++) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}') { depth--; if (depth === 0) return source.slice(start, i + 1); }
    }
  }
  return null;
}
function extractConst(source, name) {
  const start = source.indexOf(`const ${name} =`);
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    const c = source[i];
    if (c === '[' || c === '{' || c === '(') depth++;
    else if (c === ']' || c === '}' || c === ')') depth--;
    else if (c === ';' && depth === 0) return source.slice(start, i + 1);
  }
  return null;
}

const FNS = ['onAuthResolved', 'devBypassHasRealData'];
const NEW = ['stateOwnerGet', 'stateOwnerSet', 'localOwnerVerdict', 'accountSwitchBlocks', 'performAccountSwitch'];

/** One device: storage that survives "reloads", and a page whose functions are rebuilt from `source` each load. */
function device() {
  const store = new Map();
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k),
  };
  return { store, localStorage };
}
function page(source, dev) {
  const calls = [];
  const bodies = FNS.map((n) => extract(source, n));
  const extra = NEW.map((n) => extract(source, n) || `function ${n}() { return 'mine'; }`);
  const consts = ['STATE_OWNER_KEY', 'ACCOUNT_LOCAL_KEYS'].map((n) => extractConst(source, n) || `const ${n} = undefined;`);
  const raw = dev.localStorage.getItem('bloc_state');
  const env = { calls, localStorage: dev.localStorage, state: raw ? JSON.parse(raw) : { macrocycles: [], bodyLogs: [], nutritionLogs: [], trainLogs: {}, nutritionMeals: {} } };
  const f = new Function('env', `
    const localStorage = env.localStorage, IS_LOCAL_DEV = false, IS_LOCAL_REAL_AUTH = false, STATE_KEY = 'bloc_state';
    let state = env.state, _authResolvedSession, _accountSwitch = null, _switchCopySaved = false, _syncDirty = false;
    const rec = (n) => (...a) => env.calls.push(n);
    const hideAuthGate = rec('hideAuthGate'), showAuthGate = rec('showAuthGate'), updateAccountUI = rec('updateAccountUI');
    const maybeUploadSnapshotZero = rec('snapshotZero'), maybeForceFullSyncOnSignIn = rec('fullSync'), flushSyncQueue = rec('flush');
    const maybeRefreshCoachLink = rec('coachLink'), maybeFinalizeBoot = rec('boot'), exportData = rec('export');
    const coachEsc = (x) => String(x);
    const document = { getElementById: () => ({ classList: { add() {}, remove: () => env.calls.push('switchScreen') }, set innerHTML(v) { env.screen = v; } }) };
    const location = { reload: () => env.calls.push('reload') };
    ${consts.join('\n')}
    ${bodies.join('\n')}
    ${extra.join('\n')}
    return { onAuthResolved, performAccountSwitch, get state() { return state; } };
  `);
  return { api: f(env), calls, env };
}
const A = { id: 'uid-A', email: 'a@example.com' };
const B = { id: 'uid-B', email: 'b@example.com' };
const WRITERS = ['fullSync', 'snapshotZero', 'coachLink', 'flush', 'boot'];
const BOOT = ['fullSync', 'snapshotZero', 'coachLink', 'boot']; // flush runs only with an unsynced save
const aData = { macrocycles: [{ id: 'm_a', name: 'A cycle' }], bodyLogs: [{ date: '2026-09-01', weight: 180 }], nutritionLogs: [], trainLogs: {}, nutritionMeals: {} };

// ── A signs in on a device that already holds A's data (an install from before v8.46) ──
const dev = device();
dev.localStorage.setItem('bloc_state', JSON.stringify(aData));
dev.localStorage.setItem('bloc_device_id', 'dev_1');
dev.localStorage.setItem('bloc_api_key', 'sk-test');
dev.localStorage.setItem('bloc_last_snapshot_date', '2026-09-28');
let p = page(current, dev);
p.api.onAuthResolved({ user: A });
check('no owner recorded yet: the account signing in claims the device, and boots as before',
  JSON.parse(dev.localStorage.getItem('bloc_state_owner') || '{}').uid === 'uid-A' && BOOT.every((w) => p.calls.includes(w)));

// ── A signs out; B signs in on the same page, A's data still here ──
p.api.onAuthResolved(null);
p.calls.length = 0;
p.api.onAuthResolved({ user: B });
check('B over A’s data: nothing runs (no full sync, snapshot, coach link, flush or boot)', WRITERS.every((w) => !p.calls.includes(w)), p.calls.join(', '));
check('  and no screen: it switches at once', !p.calls.includes('switchScreen') && !p.env.screen && p.calls.includes('reload'));
check('The switch: the account’s keys go (state, snapshot flags); the device’s stay (device id, AI key); owner B; reload',
  !dev.store.has('bloc_state') && !dev.store.has('bloc_last_snapshot_date') && dev.store.get('bloc_device_id') === 'dev_1'
  && dev.store.get('bloc_api_key') === 'sk-test' && JSON.parse(dev.localStorage.getItem('bloc_state_owner')).uid === 'uid-B' && p.calls.includes('reload'));

// ── After the reload: an empty device for B, which boots and restores B's own backup (§133) ──
p = page(current, dev);
p.api.onAuthResolved({ user: B });
check('after the reload B boots normally (the new-device restore takes it from here)', BOOT.every((w) => p.calls.includes(w)) && p.api.state.macrocycles.length === 0);

// ── B's data comes back from its backup; B signs out; A signs in ──
dev.localStorage.setItem('bloc_state', JSON.stringify({ ...aData, macrocycles: [{ id: 'm_b', name: 'B cycle' }] }));
p = page(current, dev);
p.api.onAuthResolved({ user: A });
check('A over B’s data: the same (A → B → A)', WRITERS.every((w) => !p.calls.includes(w)) && p.calls.includes('reload')
  && JSON.parse(dev.localStorage.getItem('bloc_state_owner')).uid === 'uid-A' && !dev.store.has('bloc_state'));
check('the owner record holds a uid, never an email', !/@/.test(dev.localStorage.getItem('bloc_state_owner')));

// ── An empty device with another owner: nothing to protect, claimed ──
const empty = device();
empty.localStorage.setItem('bloc_state_owner', JSON.stringify({ uid: 'uid-A' }));
p = page(current, empty);
p.api.onAuthResolved({ user: B });
check('an empty device recorded for A is claimed by B without asking', BOOT.every((w) => p.calls.includes(w)) && JSON.parse(empty.localStorage.getItem('bloc_state_owner')).uid === 'uid-B');

// ── Every writer refuses while the switch is pending ──
const guarded = ['flushSyncQueue', 'forceFullRelationalSync', 'uploadSnapshot', 'maybeUploadOpportunisticSnapshot', 'pullPublicationsOnce', 'sendPendingAcks', 'uploadClientStateOnce', 'maybeRefreshCoachLink'];
const unguarded = guarded.filter((n) => !/accountSwitchBlocks\(\)/.test((extract(current, n) || '').split('\n').slice(0, 5).join('\n')));
check(`every writer refuses while another account’s data is here (${guarded.length})`, unguarded.length === 0, unguarded.join(', '));
check('no switch screen: nothing in the page shows another account', !/account-switch"|openAccountSwitch/.test(current));
const so = extract(current, 'signOutUser') || '';
check('signing out backs the account up first, while its session can write its backup', so.indexOf('uploadSnapshot()') > -1 && so.indexOf('uploadSnapshot()') < so.indexOf('auth.signOut('));

// ── Control ──
console.log('\n— control: v8.45 (85ddc8b), which must fail —');
let old = null;
try { old = execFileSync('git', ['-C', repo, 'show', '85ddc8b:index.html'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); } catch { /* shallow clone */ }
if (!old) console.log('  (85ddc8b not in this clone; control skipped)');
else {
  const d = device();
  d.localStorage.setItem('bloc_state', JSON.stringify(aData));
  const q = page(old, d);
  q.api.onAuthResolved({ user: B });
  check('control: v8.45 runs the full sync for B over A’s data', q.calls.includes('fullSync'));
}

console.log(failures ? `\nFAIL: ${failures} check(s)` : '\nAll checks pass.');
process.exit(failures ? 1 : 0);
