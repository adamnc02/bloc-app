#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-coach-push.mjs — BLOC Coach's push notifications (Coach v0.9,
// TECHNICAL §158), the parts Coach's vitest can't see: the worker, the
// manifest, the build and the wiring.
//
// 🚨 THE TRAPS:
//   · The worker must never get a fetch handler (a caching worker pins a
//     merge-deployed app to an old build) and must always show a notification.
//   · On iOS a changed worker can split a phone's subscription (MIGRATION-
//     LESSONS §69), so coach/public/sw.js is PINNED: its SHA-256 changes only
//     on purpose, with a planned re-registration.
//   · A tapped push must reach the page by THREE routes (URL, message, Cache
//     Storage note), decided by the TAG first (iOS can drop data, BLOC §112).
//     Its names must agree between sw.js and src/push/intent.ts, and must NOT
//     be BLOC's: the two apps share an origin, so a shared cache note or
//     message type would open one app's destination in the other.
//   · A BLOC window (/bloc-app/) is never reused for a Coach tap.
//   · Coach subscribes with BLOC's VAPID public key, which bloc-push signs
//     with (MIGRATION-LESSONS §61); a different key fails every push with 403.
//   · iOS offers push only to a Home Screen app with a manifest.
//   · The permission prompt is raised only from a tap; sign-out unregisters
//     this device first; the switches are never .upsert()ed (§72).
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(repo, p), 'utf8');
const sw = read('coach/public/sw.js');
const intent = read('coach/src/push/intent.ts');
const push = read('coach/src/push/push.ts');
const app = read('coach/src/app/App.tsx');
const bloc = read('index.html');
const blocSw = read('sw.js');

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) console.log(`    expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
const constIn = (src, name) => (src.match(new RegExp(`const ${name} = '([^']+)'`)) || [])[1];

// ── The worker ───────────────────────────────────────────────────────────
const hasFetch = (src) => /addEventListener\(\s*['"]fetch['"]/.test(src);
check('coach sw.js has no fetch handler', hasFetch(sw), false);
check('control: a fetch handler would be caught', hasFetch(sw + "\nself.addEventListener('fetch', () => {})"), true);
check('it handles push and notificationclick, and always shows a notification',
  /addEventListener\('push'/.test(sw) && /addEventListener\('notificationclick'/.test(sw) && /showNotification\(/.test(sw), true);
check('the note cache name agrees (sw.js = intent.ts)', constIn(sw, 'OPEN_INTENT_CACHE'), constIn(intent, 'OPEN_INTENT_CACHE'));
check('the note path agrees', constIn(sw, 'OPEN_INTENT_PATH'), constIn(intent, 'OPEN_INTENT_PATH'));
check("the message type agrees ('coach:open')", /type: 'coach:open'/.test(sw) && constIn(intent, 'OPEN_MESSAGE'), 'coach:open');
check('OPEN_TAG is the same pattern in both', (sw.match(/const OPEN_TAG = (\/.+\/)\s*$/m) || [])[1], (intent.match(/export const OPEN_TAG = (\/.+\/);/) || [])[1]);
check("none of it is BLOC's (one origin: a shared note or message would cross apps)",
  [constIn(sw, 'OPEN_INTENT_CACHE') !== constIn(blocSw, 'OPEN_INTENT_CACHE'), !/'bloc:open'/.test(sw)], [true, true]);

async function runClick({ windows, data, tag }) {
  const listeners = {};
  const log = { notes: [], messages: [], focused: [], opened: [], shown: [] };
  const scope = 'https://adamnc02.github.io/bloc-app/coach/';
  const self = {
    registration: { scope, showNotification: async (t, o) => log.shown.push([t, o]) },
    clients: {
      claim: async () => {},
      matchAll: async () => windows.map((url) => ({ url, postMessage: (m) => log.messages.push(m), focus: async () => { log.focused.push(url); } })),
      openWindow: async (url) => { log.opened.push(url); },
    },
    skipWaiting: () => {},
    addEventListener: (t, fn) => { listeners[t] = fn; },
  };
  const caches = { open: async (name) => ({ put: async (key, res) => log.notes.push({ name, key, body: JSON.parse(await res.text()) }) }) };
  class Resp { constructor(b) { this.b = b; } async text() { return this.b; } }
  new Function('self', 'caches', 'Response', 'URL', sw)(self, caches, Resp, URL);
  let waited;
  listeners.notificationclick({ notification: { close: () => {}, data, tag }, waitUntil: (p) => { waited = p; } });
  await waited;
  return { log, listeners };
}
const COACH = 'https://adamnc02.github.io/bloc-app/coach/';
{
  const { log } = await runClick({ windows: [], data: null, tag: 'request:3f2a9c1e-7b4d' });
  check('cold tap, empty data: the note and the URL carry the tag',
    [log.notes[0]?.name, log.notes[0]?.key, log.notes[0]?.body.open, log.opened], ['bloc-coach-open-intent', `${COACH}__open-intent`, 'request:3f2a9c1e-7b4d', [`${COACH}?open=request%3A3f2a9c1e-7b4d`]]);
}
{
  const { log } = await runClick({ windows: [COACH], data: { open: 'today' }, tag: 'checkin:s1' });
  check('warm tap: the tag wins over data; Coach\'s window gets the message and focus', [log.messages, log.focused, log.opened], [[{ type: 'coach:open', open: 'checkin:s1' }], [COACH], []]);
}
{
  const { log } = await runClick({ windows: ['https://adamnc02.github.io/bloc-app/'], data: null, tag: 'digest:2026-10-01' });
  check("a BLOC window on the same origin is NOT reused; Coach opens its own", [log.messages.length, log.opened.length], [0, 1]);
}
{
  const junk = await runClick({ windows: [], data: { open: 'https://evil.example/' }, tag: 'coach:pub:x' });
  check("BLOC's tag, or a URL in data: Today, never a path outside Coach", [junk.log.notes[0]?.body.open, junk.log.opened], ['today', [`${COACH}?open=today`]]);
  const none = await runClick({ windows: [], data: null, tag: '' });
  check('no tag and no data: Today', none.log.notes[0]?.body.open, 'today');
}
{
  const { listeners, log } = await runClick({ windows: [], data: null, tag: 'coach-test' });
  let w; listeners.push({ data: { json: () => { throw new Error('x'); } }, waitUntil: (p) => { w = p; } }); await w;
  let w2; listeners.push({ data: { json: () => ({ title: 'Maya sent a check-in', body: 'Tap to review it.', tag: 'checkin:s9' }) }, waitUntil: (p) => { w2 = p; } }); await w2;
  check('an unreadable push shows "BLOC Coach"; a real one its title, tag and target',
    [log.shown[0][0], log.shown[1][0], log.shown[1][1].tag, log.shown[1][1].data.open], ['BLOC Coach', 'Maya sent a check-in', 'checkin:s9', 'checkin:s9']);
}

// 🚨 TRIPWIRE: change sw.js only on purpose, with a planned re-registration (§158, MIGRATION-LESSONS §69).
const SW_SHA256 = '125efd6e775882dccf706ee304f3698eba0faed919d365473a36b65e3897e96e';
check('TRIPWIRE: coach/public/sw.js is unchanged (a change can split every iPhone\'s subscription; update this hash deliberately)',
  createHash('sha256').update(sw).digest('hex'), SW_SHA256);

// ── The key ──────────────────────────────────────────────────────────────
const coachKey = constIn(push, 'COACH_VAPID_PUBLIC_KEY');
check("Coach's VAPID public key = BLOC's (one pair per project, §61)", coachKey, (bloc.match(/const BLOC_VAPID_PUBLIC_KEY = '([^']+)'/) || [])[1]);
const fnPath = join(repo, '..', 'super-duper-octo-barnacle', 'supabase', 'functions', 'bloc-push', 'index.ts');
if (!existsSync(fnPath) && process.env.GITHUB_ACTIONS === 'true') {
  console.log('– skipped in CI: the bloc-push key comparison needs super-duper-octo-barnacle beside this repo (private); it runs in every local sweep');
} else {
  check('the bloc-push source is beside this repo (needed for the next check)', existsSync(fnPath), true);
  if (existsSync(fnPath)) check("Coach's key = the key bloc-push signs with", coachKey, (readFileSync(fnPath, 'utf8').match(/const VAPID_PUBLIC_KEY =\s*'([^']+)'/) || [])[1]);
}

// ── The manifest, and the build ──────────────────────────────────────────
const manifest = JSON.parse(read('coach/public/manifest.webmanifest'));
check('manifest: BLOC Coach, standalone, its own scope and start', [manifest.name, manifest.display, manifest.scope, manifest.start_url], ['BLOC Coach', 'standalone', './', './']);
const pngSize = (p) => { const b = readFileSync(join(repo, 'coach/public', p)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
check('every manifest icon exists at its stated size', manifest.icons.every((i) => existsSync(join(repo, 'coach/public', i.src)) && pngSize(i.src).join('x') === i.sizes), true);
check('index.html links the manifest', /<link rel="manifest" href="\/manifest\.webmanifest" \/>/.test(read('coach/index.html')), true);
for (const f of ['sw.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-512-maskable.png']) {
  const a = join(repo, 'coach/public', f), b = join(repo, 'coach/dist', f);
  check(`coach/dist/${f} is the committed public/${f} (published at /bloc-app/coach/)`, existsSync(b) && readFileSync(a).equals(readFileSync(b)), true);
}
check('the built index.html links /bloc-app/coach/manifest.webmanifest', read('coach/dist/index.html').includes('href="/bloc-app/coach/manifest.webmanifest"'), true);

// ── Wiring ───────────────────────────────────────────────────────────────
const coachSrc = [push, app, read('coach/src/coach/screens/SettingsScreen.tsx')].join('\n');
check('the permission prompt is raised in exactly one place, behind `ask`', (coachSrc.match(/Notification\.requestPermission\(/g) || []).length === 1
  && /ask \? await Notification\.requestPermission\(\) : Notification\.permission/.test(push), true);
const signOut = (app.match(/signOut: async \(\) => \{[^\n]*\}/) || [''])[0];
check('sign-out unregisters this device BEFORE signing out', signOut.indexOf('forgetThisPushDevice(sb)') > -1 && signOut.indexOf('forgetThisPushDevice(sb)') < signOut.indexOf('auth.signOut('), true);
check('the worker is registered on every start, scope ./', /registerCoachServiceWorker\(\)/.test(app) && constIn(push, 'COACH_SW_SCOPE') === './', true);
check("the switches are never .upsert()ed (0031 grants UPDATE on the switch columns only, §72)", /coach_notification_prefs'\)\.upsert/.test(push), false);
// v0.9.1: a tap on a CLOSED Coach (a cold start) was missed. The message listener waited for sign-in, and the
// note was read once, before the worker had written it (on an iPhone; reproduced in Chromium with a late note).
const main = read('coach/src/main.tsx');
check('the message listener is attached at page load, before React renders', main.indexOf('listenForOpenMessages();') > -1 && main.indexOf('listenForOpenMessages();') < main.indexOf('createRoot('), true);
const recheck = (intent.match(/export const RECHECK_MS = \[([^\]]+)\]/) || [])[1];
const recheckMs = recheck ? recheck.split(',').map(Number) : [];
check('the note is re-read in a burst reaching 10 s', recheckMs[0] === 0 && Math.max(...recheckMs) >= 10000, true);
const load = (intent.match(/export function listenForOpenMessages\(\)[\s\S]*?\n}\n/) || [''])[0];
check('from page load: the message, the note burst, and a re-burst on visibilitychange, focus and pageshow (as Listly reads its note on first render)',
  /addEventListener\('message'/.test(load) && /burst\('load'\)/.test(load) && /addEventListener\('visibilitychange'/.test(load) && /addEventListener\('focus'/.test(load) && /addEventListener\('pageshow'/.test(load), true);
check('once ready, anything held is delivered and the note re-read', /if \(pending\)/.test(intent) && /burst\('ready'\)/.test(intent), true);
check('control: v0.9 read the note once and listened only once ready', (() => { try { const old = execFileSync('git', ['show', 'bb7f3a0:coach/src/push/intent.ts'], { cwd: repo, encoding: 'utf8' }); return !/RECHECK_MS/.test(old) && !/listenForOpenMessages/.test(old); } catch { return false; } })(), true);
// v0.9.3: on the iPhone Coach's worker never passes a tap to the page, so Coach reads its
// newest push from push_outbox (route 4) on ready and on every focus / visible.
check("route 4: once ready, Coach asks the server for its newest coach push from the last RECENT_MS",
  /from\('push_outbox'\)\.select\('id, tag, created_at'\)\.eq\('app', 'coach'\)/.test(app) && /RECENT_MS/.test(app) && /watchOpenIntents\(navigate, sb \?/.test(app), true);
check('route 4 runs on every burst but the load one, remembers what it opened (KEYS.pushSeen), and never reopens a delivered push',
  /if \(why !== 'load'\) scheduleRecent\(\)/.test(intent) && /KEYS\.pushSeen/.test(intent) && /last\.target === target && last\.at >= Date\.parse\(row\.createdAt\)/.test(intent), true);
// v0.9.5: the notification debugging (v0.9.1's readout, v0.9.2's log) is gone and must stay gone, as BLOC's did (§114).
const settings = read('coach/src/coach/screens/SettingsScreen.tsx');
check('no notification debugging in Settings or intent.ts (no "Last opened from a notification", no push log)',
  [/Last opened from a notification/.test(settings), /readPushLog|pushLog\(/.test(settings + intent), /pushLog:/.test(read('coach/src/lib/storage.ts'))], [false, false, false]);
// v0.9.6: a registration left behind by a deleted Home Screen app is removed (same device type, only once this device's row is on the server).
check('the same-device clean-up runs on Turn on and on every healthy start',
  /localSet\(newId\);\s*await pruneSameDevice\(sb, newId\)/.test(push) && /verdict === 'ok' && hereId\) \{ await pruneSameDevice\(sb, hereId\)/.test(push) && /verdict === 'adopt' && hereId\) \{ localSet\(hereId\); await pruneSameDevice/.test(push), true);
check("Coach registers app 'coach', never 'bloc'", /app: 'coach'/.test(push) && !/app: 'bloc'/.test(push), true);

console.log(failures ? `\n✗ ${failures} check(s) failed` : '\nALL CHECKS PASS');
process.exit(failures ? 1 : 0);
