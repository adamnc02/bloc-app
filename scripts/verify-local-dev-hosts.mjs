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
// 🚨 This reads the REAL function out of index.html and runs it, rather than
// keeping its own copy of the logic. A copy would pass forever while the
// shipped code drifted away from it.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'index.html'), 'utf8');

// ── Extract `function isLocalDevHost(...) { ... }` by brace matching ──────
const marker = 'function isLocalDevHost(hostname) {';
const start = source.indexOf(marker);
if (start === -1) {
  console.error('✗ FAIL: isLocalDevHost() not found in index.html.');
  console.error('  Either it was renamed or the bypass was restructured. Both need this');
  console.error('  script updated deliberately — do not delete the check.');
  process.exit(1);
}
if (source.indexOf(marker, start + 1) !== -1) {
  console.error('✗ FAIL: isLocalDevHost() is defined more than once in index.html.');
  process.exit(1);
}

let depth = 0, end = -1;
for (let i = source.indexOf('{', start); i < source.length; i++) {
  const ch = source[i];
  if (ch === '{') depth++;
  else if (ch === '}') {
    depth--;
    if (depth === 0) { end = i + 1; break; }
  }
}
if (end === -1) {
  console.error('✗ FAIL: could not find the end of isLocalDevHost().');
  process.exit(1);
}

const fnSource = source.slice(start, end);
const isLocalDevHost = new Function(`${fnSource}; return isLocalDevHost;`)();

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

if (failures > 0) {
  console.error(`\n✗ ${failures} failure(s). DO NOT DEPLOY until this passes.`);
  process.exit(1);
}
console.log('\n✓ All host rules hold. The deployed site cannot reach the dev bypass.');
