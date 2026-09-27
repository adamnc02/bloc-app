#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-local-dev-hosts.mjs
//
// THE BUG THIS PREVENTS: shipping an authentication bypass.
//
// `isLocalDevHost()` in index.html decides whether BLOC skips Supabase and
// OAuth entirely and seeds the demo dataset instead. Until v8.16 it was an
// exact match on localhost/127.0.0.1, which was obviously safe but meant the
// app could not be opened on a phone — a phone reaches the laptop by its LAN
// address, never by `localhost`. It now also accepts private-network hosts.
//
// That widening is only safe while two things stay true:
//
//   1. The deployed host (adamnc02.github.io) NEVER matches.
//   2. No hostname that public DNS can resolve matches — in particular the
//      lookalikes, `localhost.evil.com` and `192.168.0.42.evil.com`, which
//      are ordinary public domains and would be trivial to let through with
//      a `startsWith` or an unanchored regex.
//
// Nothing else checks this. There is no CI in this repo, the deploy script
// does not run the verify scripts, and the failure is invisible from the UI:
// a bypassed build looks completely normal until you notice it never asked
// anyone to sign in.
//
// 🚨 This runs the REAL function, rather than keeping its own copy of the
// logic. A copy would pass forever while the shipped code drifted away.
//
// v8.34 (TECHNICAL §124, deep dive §8): the function lives in the shared
// engine now, so BLOC and BLOC Coach key their bypass on ONE predicate. This
// runs it from the COMMITTED build (engine/dist/bloc-engine.js, the file the
// live site serves), and checks that index.html's isLocalDevHost is only a
// shim handing the hostname to it. Testing the old brace-extracted copy in
// index.html would now test a one-line shim, and pass while proving nothing.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'index.html'), 'utf8');
const dist = readFileSync(join(here, '..', 'engine', 'dist', 'bloc-engine.js'), 'utf8');

// ── The engine's isLocalDevHost, from the committed build ────────────────
const engine = vm.runInNewContext(`${dist}\n;BlocEngine`, {});
if (typeof engine.isLocalDevHost !== 'function') {
  console.error('✗ FAIL: the engine build does not export isLocalDevHost().');
  console.error('  It was renamed or moved. Update this script deliberately — do not delete the check.');
  process.exit(1);
}
const isLocalDevHost = engine.isLocalDevHost;

// ── index.html's isLocalDevHost must be the shim, and only the shim ──────
// Otherwise BLOC could decide the bypass with a different predicate from the
// one tested here (and from the one Coach uses).
const SHIM = /function isLocalDevHost\(hostname\) \{\n  return BlocEngine\.isLocalDevHost\(hostname\);[^\n]*\n\}/;
const shimOk = src => (src.match(/function isLocalDevHost\(/g) || []).length === 1 && SHIM.test(src);
if (!shimOk(source)) {
  console.error('✗ FAIL: index.html\'s isLocalDevHost() is not exactly one shim calling BlocEngine.isLocalDevHost(hostname).');
  process.exit(1);
}
console.log('✓ index.html\'s isLocalDevHost() hands the hostname to the engine\'s, unchanged');

// ── Cases ────────────────────────────────────────────────────────────────
const shouldBypass = [
  ['localhost',            'the laptop talking to itself'],
  ['127.0.0.1',            'loopback'],
  ['127.1.2.3',            'anywhere in the loopback range'],
  ['::1',                  'IPv6 loopback'],
  ['[::1]',                'IPv6 loopback, bracketed as a URL host'],
  ['LOCALHOST',            'case must not matter'],
  ['192.168.0.42',         "Adam's laptop on the home network — the whole point"],
  ['192.168.1.255',        'anywhere in 192.168/16'],
  ['10.0.0.5',             '10/8'],
  ['172.16.0.1',           'bottom of 172.16/12'],
  ['172.31.255.254',       'top of 172.16/12'],
  ['169.254.7.7',          'link-local'],
  ['adams-macbook.local',  'mDNS name'],
  ['MacBook-Pro.local',    'mDNS, mixed case'],
];

const shouldNotBypass = [
  ['adamnc02.github.io',      '🚨 THE DEPLOYED SITE — a bypass here ships a signed-out app to everyone'],
  ['bloc.app',                'any ordinary public domain'],
  ['localhost.evil.com',      '🚨 lookalike: public domain that merely STARTS with localhost'],
  ['evil.com.localhost',      'lookalike: public domain ending in a localhost label'],
  ['192.168.0.42.evil.com',   '🚨 lookalike: public domain that merely starts with a private IP'],
  ['evil.com/192.168.0.1',    'a path is not a hostname'],
  ['not-really.local.evil.com', 'lookalike: .local in the middle, not the suffix'],
  ['8.8.8.8',                 'a public IP literal'],
  ['1.2.3.4',                 'a public IP literal'],
  ['172.15.0.1',              'just BELOW the 172.16/12 private range'],
  ['172.32.0.1',              'just ABOVE the 172.16/12 private range'],
  ['193.168.0.1',             'one digit away from 192.168 — must not match'],
  ['192.169.0.1',             'one digit away from 192.168 — must not match'],
  ['11.0.0.1',                'one away from the 10/8 range'],
  ['169.253.0.1',             'one away from link-local'],
  ['999.999.999.999',         'octets out of range are not an IP at all'],
  ['192.168.0',               'too few octets'],
  ['192.168.0.1.2',           'too many octets'],
  ['',                        'empty hostname'],
  [undefined,                 'undefined hostname must not throw or pass'],
  [null,                      'null hostname must not throw or pass'],
];

let failures = 0;
const check = (host, why, expected) => {
  let actual;
  try {
    actual = isLocalDevHost(host);
  } catch (err) {
    console.error(`✗ FAIL: isLocalDevHost(${JSON.stringify(host)}) threw: ${err.message}`);
    failures++;
    return;
  }
  if (actual !== expected) {
    console.error(`✗ FAIL: isLocalDevHost(${JSON.stringify(host)}) → ${actual}, expected ${expected}`);
    console.error(`        ${why}`);
    failures++;
  }
};

console.log('Hosts that MUST get the dev bypass:');
shouldBypass.forEach(([h, why]) => check(h, why, true));
console.log(`  ${shouldBypass.length} checked`);

console.log('Hosts that must NEVER get the dev bypass:');
shouldNotBypass.forEach(([h, why]) => check(h, why, false));
console.log(`  ${shouldNotBypass.length} checked`);

// ── The control ──────────────────────────────────────────────────────────
// A test suite that cannot fail proves nothing. Prove the harness would
// actually catch a regression by running a deliberately broken predicate —
// the exact mistake this guards against — and confirming it is rejected.
const naive = new Function(`return function (h) {
  return String(h || '').includes('localhost') || String(h || '').startsWith('192.168');
};`)();
const controlCatches =
  naive('localhost.evil.com') === true && naive('192.168.0.42.evil.com') === true;
if (!controlCatches) {
  console.error('✗ FAIL: the control case is wrong — this harness is not testing what it claims.');
  failures++;
} else {
  console.log('Control: a naive includes()/startsWith() predicate does let the lookalike');
  console.log('         domains through, so these cases genuinely discriminate. ✓');
}

// Control: a copy of the logic left in index.html (not a shim) is refused.
const local = source.replace(SHIM, 'function isLocalDevHost(hostname) {\n  return String(hostname || \'\').toLowerCase() === \'localhost\';\n}');
if (local === source || shimOk(local)) {
  console.error('✗ FAIL: control — a local copy of isLocalDevHost in index.html was not refused.');
  failures++;
} else {
  console.log('Control: a local copy in index.html instead of the shim is refused. ✓');
}

if (failures > 0) {
  console.error(`\n✗ ${failures} failure(s). DO NOT DEPLOY until this passes.`);
  process.exit(1);
}
console.log('\n✓ All host rules hold. The deployed site cannot reach the dev bypass.');
