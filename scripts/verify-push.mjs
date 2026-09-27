#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-push.mjs
//
// WHAT IT PROTECTS (v8.22, TECHNICAL §111 — PROMPT-02 B1/B4): BLOC's push
// notifications, the browser half.
//
// 🚨 THE TRAPS:
//   · The Settings sheet must tell the truth: 'on' ONLY when the server has
//     this device's row (a pruned or remotely-removed row reminds nobody), and
//     'needs-install' BEFORE 'unsupported' on an iPhone in a Safari tab.
//   · A tapped notification must reach the Measurements sheet by THREE routes
//     — the URL, a message, a Cache Storage note — because on an iPhone any one
//     can be lost. The note is read AND deleted, and a stale one is ignored.
//   · The worker must never get a fetch handler (a caching worker pins a
//     single-file app to an old build) and must always show a notification.
//   · The row id is 'ps_' + the FULL sha256 (migration 0019's CHECK); Listly's
//     shorter id would be refused by BLOC's table.
//   · The public VAPID key must equal the Edge Function's, or every push fails
//     403 with nothing in the app to explain it (MIGRATION-LESSONS §61).
//   · The server's due date comes from getMeasurementStatus(), the app's only
//     copy of the rule — never a second implementation.
//
// Extracts the real functions from index.html and runs the real sw.js in a
// simulated worker. A control shows a truncated id fails the table's CHECK.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { webcrypto } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(repo, 'index.html'), 'utf8');
const sw = readFileSync(join(repo, 'sw.js'), 'utf8');

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) console.log(`    expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function extract(src, marker) {
  const start = src.indexOf(marker);
  if (start === -1) { console.error(`✗ FAIL: ${marker} not found.`); process.exit(1); }
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  return null;
}
const constLine = name => { const m = html.match(new RegExp(`const ${name} = ([^;]+);`)); return m ? eval(m[1]) : undefined; };

// ── decidePushState: every case ──────────────────────────────────────────
const decidePushState = new Function(`${extract(html, 'function decidePushState(')}; return decidePushState;`)();
const base = { ios: true, standalone: true, supported: true, permission: 'granted', hereId: 'ps_x', registeredIds: ['ps_x'] };
const cases = [
  [{ ...base, standalone: false, supported: false }, 'needs-install', 'iPhone in a Safari tab (no PushManager) → needs-install, not unsupported'],
  [{ ...base, ios: false, supported: false }, 'unsupported', 'a desktop browser with no push → unsupported'],
  [{ ...base, permission: 'denied' }, 'denied', 'permission denied → denied'],
  [{ ...base, permission: 'default' }, 'ask', 'never asked → ask'],
  [{ ...base, registeredIds: [] }, 'off', 'granted, subscribed, but NO server row → off (not on)'],
  [{ ...base, hereId: null }, 'off', 'granted but no local subscription → off'],
  [base, 'on', 'granted + subscribed + server row → on'],
  [{ ...base, registeredIds: ['ps_other'] }, 'off', 'only ANOTHER device registered → off'],
];
for (const [facts, want, label] of cases) check(label, decidePushState(facts), want);

// ── decidePushHealth (v8.24, §113): a registration iOS dropped ──────────
const decidePushHealth = new Function(`${extract(html, 'function decidePushHealth(')}; return decidePushHealth;`)();
const H = { supported: true, localId: 'ps_a', hereId: 'ps_a', hereOnServer: true, permission: 'granted' };
for (const [facts, want, label] of [
  [{ ...H, localId: null, hereId: null }, 'none', 'never turned on here → none'],
  [{ ...H, localId: null }, 'adopt', 'registered before v8.24 remembered it (on the server, granted) → adopt'],
  [{ ...H, localId: null, hereOnServer: false }, 'none', 'a local subscription the server never had → none (not adopted)'],
  [H, 'ok', 'still holds the registration it made → ok'],
  [{ ...H, hereId: 'ps_new' }, 'resubscribe', 'iOS replaced it, permission still granted → re-register quietly'],
  [{ ...H, hereId: null }, 'resubscribe', 'iOS dropped it entirely, permission granted → re-register quietly'],
  [{ ...H, hereId: null, permission: 'default' }, 'ask', 'dropped AND permission reset (Adam, v8.23) → ask with one tap'],
  [{ ...H, hereId: null, permission: 'denied' }, 'ask', 'dropped and denied → ask (the sheet then explains iPhone Settings)'],
  [{ ...H, supported: false }, 'none', 'no push support → none'],
]) check(label, decidePushHealth(facts), want);

// ── pushIdFor: 'ps_' + full sha256, as 0019's CHECK requires ─────────────
globalThis.crypto ??= webcrypto;
const pushIdFor = new Function(`${extract(html, 'async function pushIdFor(')}; return pushIdFor;`)();
const id = await pushIdFor('https://web.push.apple.com/abc');
const CHECK = /^ps_[0-9a-f]{64}$/;
check('pushIdFor gives ps_ + 64 hex (matches migration 0019\'s CHECK)', CHECK.test(id), true);
check('pushIdFor is deterministic (re-registering updates one row)', id === await pushIdFor('https://web.push.apple.com/abc'), true);
const listlyStyle = 'ps_' + id.slice(3, 27); // Listly truncates to 24 hex
check('CONTROL: a Listly-style truncated id would be refused by the CHECK', CHECK.test(listlyStyle), false);

// ── The worker ───────────────────────────────────────────────────────────
check('sw.js has no fetch handler', /addEventListener\(\s*['"]fetch['"]/.test(sw), false);
check('sw.js handles push and notificationclick', /addEventListener\('push'/.test(sw) && /addEventListener\('notificationclick'/.test(sw), true);
check('sw.js always shows a notification for a push', /registration\.showNotification\(/.test(extract(sw, "self.addEventListener('push'")), true);
const swConst = name => (sw.match(new RegExp(`const ${name} = '([^']+)'`)) || [])[1];
check('open-intent cache name agrees (sw.js = index.html)', swConst('OPEN_INTENT_CACHE'), constLine('BLOC_OPEN_INTENT_CACHE'));
check('open-intent note path agrees (sw.js = index.html)', swConst('OPEN_INTENT_PATH'), constLine('BLOC_OPEN_INTENT_PATH'));
check('the message type agrees (bloc:open)', /type: 'bloc:open'/.test(sw) && /e\.data\.type === 'bloc:open'/.test(html), true);

// Run the real sw.js against a simulated worker.
async function runClick({ windows, data, tag = 'measurements:ps_x:2026-09-28', swSrc = sw }) {
  const listeners = {};
  const log = { notes: [], messages: [], focused: 0, opened: [], shown: [] };
  const scope = 'https://adamnc02.github.io/bloc-app/';
  const self = {
    registration: { scope, showNotification: async (t, o) => log.shown.push([t, o]) },
    clients: {
      claim: async () => {},
      matchAll: async () => windows.map(url => ({ url, postMessage: m => log.messages.push(m), focus: async () => { log.focused++; } })),
      openWindow: async url => { log.opened.push(url); },
    },
    skipWaiting: () => {},
    addEventListener: (t, fn) => { listeners[t] = fn; },
  };
  const caches = { open: async name => ({ put: async (key, res) => log.notes.push({ name, key, body: JSON.parse(await res.text()) }) }) };
  class Resp { constructor(b) { this.b = b; } async text() { return this.b; } }
  new Function('self', 'caches', 'Response', 'URL', swSrc)(self, caches, Resp, URL);
  let waited;
  listeners.notificationclick({ notification: { close: () => {}, data, tag }, waitUntil: p => { waited = p; } });
  await waited;
  // and a push, to see what it shows
  let pushWait;
  listeners.push({ data: { json: () => ({ title: 'Measurements due', body: 'Log your waist and hip today.', tag: 't', url: scope + '?open=measurements', open: 'measurements' }) }, waitUntil: p => { pushWait = p; } });
  await pushWait;
  return log;
}
const cold = await runClick({ windows: [], data: { url: 'https://adamnc02.github.io/bloc-app/?open=measurements', open: 'measurements' } });
check('cold tap: the note is written (route 3) with open=measurements and a timestamp',
  cold.notes.length === 1 && cold.notes[0].name === 'bloc-open-intent' && cold.notes[0].key.endsWith('/bloc-app/__open-intent')
  && cold.notes[0].body.open === 'measurements' && typeof cold.notes[0].body.at === 'number', true);
check('cold tap: opens BLOC at ?open=measurements (route 1)', cold.opened, ['https://adamnc02.github.io/bloc-app/?open=measurements']);
const warm = await runClick({ windows: ['https://adamnc02.github.io/bloc-app/'], data: { url: 'https://adamnc02.github.io/bloc-app/?open=measurements', open: 'measurements' } });
check('warm tap: messages the open window (route 2) and focuses it, no second window',
  [warm.messages, warm.focused, warm.opened], [[{ type: 'bloc:open', open: 'measurements', via: 'data' }], 1, []]);
const other = await runClick({ windows: ['https://adamnc02.github.io/listly/'], data: { url: 'https://adamnc02.github.io/bloc-app/?open=measurements', open: 'measurements' } });
check('a Listly window on the same origin is NOT reused; BLOC opens its own', [other.messages.length, other.opened.length], [0, 1]);
const evil = await runClick({ windows: [], data: { url: 'https://evil.example/', open: 'measurements' } });
check('a URL outside BLOC is replaced by BLOC\'s own', evil.opened, ['https://adamnc02.github.io/bloc-app/?open=measurements']);
// 🚨 v8.23 (§112): the case that broke on Adam's iPhone — a click whose
// notification.data is EMPTY. The destination must come from the tag, or the
// default, on every route.
const noDataCold = await runClick({ windows: [], data: null, tag: 'measurements:ps_x:2026-09-28' });
check('empty data, measurements tag, cold: note written via the tag, opens ?open=measurements',
  [noDataCold.notes[0]?.body.open, noDataCold.notes[0]?.body.via, noDataCold.opened], ['measurements', 'tag', ['https://adamnc02.github.io/bloc-app/?open=measurements']]);
const noDataWarm = await runClick({ windows: ['https://adamnc02.github.io/bloc-app/'], data: undefined, tag: 'bloc-test' });
check('empty data, test-notification tag, warm: messages the window via the tag',
  noDataWarm.messages, [{ type: 'bloc:open', open: 'measurements', via: 'tag' }]);
const nothing = await runClick({ windows: [], data: null, tag: '' });
check('empty data AND no tag: still opens Measurements (the only kind BLOC sends), via default',
  [nothing.notes[0]?.body.via, nothing.opened], ['default', ['https://adamnc02.github.io/bloc-app/?open=measurements']]);
// CONTROL: the v8.22 worker, given the same empty-data click, opened no sheet.
const v822 = execFileSync('git', ['show', 'be2c045:sw.js'], { cwd: repo, encoding: 'utf8' });
const oldCold = await runClick({ windows: [], data: null, tag: 'measurements:ps_x:2026-09-28', swSrc: v822 });
check('CONTROL: v8.22\'s worker, with empty data, wrote no note and dropped ?open= (the bug)',
  [oldCold.notes.length, oldCold.opened], [0, ['https://adamnc02.github.io/bloc-app/']]);

check('the push shows its title and body, with the icon', [cold.shown[0][0], cold.shown[0][1].body, cold.shown[0][1].icon], ['Measurements due', 'Log your waist and hip today.', 'icon-192.png']);

// ── The page side of the routes ──────────────────────────────────────────
const pageFns = new Function('window', 'caches', 'Date', `
  const BLOC_OPEN_INTENT_CACHE = ${JSON.stringify(constLine('BLOC_OPEN_INTENT_CACHE'))};
  const BLOC_OPEN_INTENT_PATH = ${JSON.stringify(constLine('BLOC_OPEN_INTENT_PATH'))};
  const BLOC_OPEN_INTENT_MAX_AGE_MS = ${constLine('BLOC_OPEN_INTENT_MAX_AGE_MS')};
  ${extract(html, 'function parseOpenIntent(')}
  ${extract(html, 'async function takePendingOpenIntent(')}
  return { parseOpenIntent, takePendingOpenIntent };`);
function page(noteBody) {
  const store = {};
  const key = 'https://adamnc02.github.io/bloc-app/__open-intent';
  if (noteBody) store[key] = noteBody;
  const cachesStub = { open: async () => ({ match: async k => { if (!(k in store)) return undefined; const v = store[k]; return { json: async () => v }; } /* a real Response keeps its body after the cache entry is deleted */, delete: async k => { delete store[k]; } }) };
  const win = { location: { href: 'https://adamnc02.github.io/bloc-app/' }, caches: cachesStub };
  return { fns: pageFns(win, cachesStub, Date), store, key };
}
{
  const { fns } = page();
  check('route 1: ?open=measurements is read', fns.parseOpenIntent('https://adamnc02.github.io/bloc-app/?open=measurements'), 'measurements');
  check('route 1: anything else is ignored', fns.parseOpenIntent('https://adamnc02.github.io/bloc-app/?open=admin'), null);
}
{
  const now = Date.now();
  const p = page({ open: 'measurements', at: now - 60 * 1000 });
  check('route 3: a fresh note opens Measurements', await p.fns.takePendingOpenIntent(now), { open: 'measurements' });
  check('route 3: …and is deleted (it never opens twice)', p.key in p.store, false);
  const stale = page({ open: 'measurements', at: now - 6 * 60 * 1000 });
  check('route 3: a note older than 5 minutes is ignored', await stale.fns.takePendingOpenIntent(now), null);
  check('route 3: …and deleted anyway', stale.key in stale.store, false);
  const junk = page({ open: 'somewhere', at: now });
  check('route 3: a note for anything else is ignored', await junk.fns.takePendingOpenIntent(now), null);
}

// ── The due date the server reads ────────────────────────────────────────
const statusRow = new Function('state', 'getLocalToday', `
  ${extract(html, 'function getMeasurementStatus(')}
  ${extract(html, 'function measurementStatusRow(')}
  return measurementStatusRow;`)({ bodyLogs: [{ date: '2026-09-07', waist: 34 }], macrocycles: [{ start: '2026-09-28' }] }, () => '2026-09-27');
const row = statusRow('u1');
check('measurement_status row carries getMeasurementStatus()\'s nextDueDate and lastDate',
  [row.user_id, row.next_due_date, row.last_saved], ['u1', '2026-09-14', '2026-09-07']);

// ── Wiring ───────────────────────────────────────────────────────────────
check('every sync push upserts measurement_status', /await syncMeasurementStatus\(userId\)/.test(extract(html, 'async function pushStateToSupabase(')), true);
const signOut = extract(html, 'async function signOutUser(');
check('sign-out unregisters this device BEFORE signing out', signOut.indexOf('forgetThisPushDevice()') > -1 && signOut.indexOf('forgetThisPushDevice()') < signOut.indexOf('auth.signOut()'), true);
check('boot checks for a tapped notification', /continueBootAfterAuth\(\);\s*\n\s*checkOpenIntents\(\)/.test(extract(html, 'function maybeFinalizeBoot(')), true);
check('the worker is registered on every load, with scope ./', /registerBlocServiceWorker\(\);/.test(html) && constLine('BLOC_SW_SCOPE') === './', true);
check('the message route also consumes the note (no second open later)', /takePendingOpenIntent\(\)\.finally\(\(\) => applyOpenIntent\(e\.data\.open\)\)/.test(html), true);
// v8.25 (§114): the round's debugging readouts are gone and must stay gone.
check('no "Last notification tap" debug readout (removed in v8.25)', /Last notification tap|bloc_last_open_intent/.test(html), false);
const reg = extract(html, 'async function registerPushHere(');
check('re-registering deletes this phone\'s previous (dead) row and remembers the new one',
  /prev\.id !== newId/.test(reg) && /\.delete\(\)\.eq\('id', prev\.id\)/.test(reg) && /pushLocalSet\(newId\)/.test(reg), true);
check('the silent re-register never prompts (ask=false reads Notification.permission)',
  /ask \? await Notification\.requestPermission\(\) : Notification\.permission/.test(reg), true);
check('boot runs the health check', /checkPushHealth\(\);/.test(extract(html, 'function maybeFinalizeBoot(')), true);
check('turning off forgets this phone\'s registration', /pushLocalClear\(\)/.test(extract(html, 'async function turnOffPushHere(')), true);
check('no "Registered devices" debug list (removed in v8.25; Turn off/on is the recovery, §113)', /Registered devices|removePushDevice|listPushDevices/.test(html), false);

// 🚨 TRIPWIRE (v8.24, §113). On iOS, changing sw.js can DROP every phone's
// push subscription (v8.23 UAT: Adam had to turn notifications on and allow
// them again). checkPushHealth() now heals that, but only when the person next
// opens BLOC — and may have to ask. So sw.js changes only on purpose: if you
// change it, update this hash in the same commit and say why in TECHNICAL §113.
const { createHash } = await import('node:crypto');
const SW_SHA256 = 'faa71eba1c059a9560d2d47658ed7951494af6490ee8f87d3a069d145e605d27';
check('TRIPWIRE: sw.js is unchanged (changing it can switch off reminders on every iPhone — update this hash deliberately)',
  createHash('sha256').update(sw).digest('hex'), SW_SHA256);

check('the permission prompt is only raised by a tap (registerPushHere with ask=true, via turnOnPushHere)',
  (html.match(/Notification\.requestPermission\(/g) || []).length === 1
  && /Notification\.requestPermission\(/.test(extract(html, 'async function registerPushHere('))
  && /return registerPushHere\(true\)/.test(extract(html, 'async function turnOnPushHere(')), true);

// ── The key the app subscribes with = the key the function signs with ────
const fnPath = join(repo, '..', 'super-duper-octo-barnacle', 'supabase', 'functions', 'bloc-reminders', 'index.ts');
check('the Edge Function source is beside this repo (needed for the next check)', existsSync(fnPath), true);
if (existsSync(fnPath)) {
  const fnKey = (readFileSync(fnPath, 'utf8').match(/const VAPID_PUBLIC_KEY =\s*'([^']+)'/) || [])[1];
  check('app VAPID public key = bloc-reminders VAPID public key (§61)', constLine('BLOC_VAPID_PUBLIC_KEY'), fnKey);
}

console.log(failures ? `\n✗ ${failures} check(s) failed` : '\nALL CHECKS PASS');
process.exit(failures ? 1 : 0);
