#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-auth-real.mjs — `?auth=real` (v8.30, TECHNICAL §119, PROMPT-03 1b)
//
// WHAT IT PROTECTS. On a local host, `?auth=real` turns the §82 dev bypass
// OFF, so the dev server signs in to BLOC's live Supabase project. The rule
// that must never break: the parameter can only turn the bypass OFF. A public
// host is real with or without it, and no query string can make ANY host
// bypass that isLocalDevHost() rejects.
//
// 🚨 THE TRAPS:
//   · `isRealAuthRequested(s) ? real : bypass` without the host test, or
//     `isLocalDevHost(h) || …` — both read plausibly and both would let a
//     query string decide auth on the deployed site. Controls below run both
//     and must fail.
//   · The shared state key. The bypass keeps the demo dataset (or a restored
//     backup, §91) in `bloc_state` on the same origin. Signing in runs a full
//     relational sync that deletes and re-inserts every mirrored table from
//     local state, so a shared key would replace the live account's rows with
//     demo data. Real auth on a local host uses `bloc_state_authreal`;
//     production and the bypass keep `bloc_state`. Every localStorage read or
//     write of the state must go through STATE_KEY (a control runs v8.29,
//     which used the literal, and must fail).
//
// It extracts the REAL functions and constants from index.html with the
// lexer-aware extractor (scripts/golden/extract-engine.mjs).
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mainScript, indexTopLevel } from './golden/extract-engine.mjs';
import './engine-global.mjs'; // v8.34 (§124): isLocalDevHost is a shim calling BlocEngine

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = mainScript(readFileSync(join(repo, 'index.html'), 'utf8'));
let oldSource = null;
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

const { decls } = indexTopLevel(source);
const need = ['isLocalDevHost', 'isRealAuthRequested', 'isDevBypassActive', 'IS_LOCAL_DEV', 'IS_LOCAL_REAL_AUTH', 'STATE_KEY'];
for (const n of need) if (!decls.has(n)) { console.error(`✗ FAIL: ${n} not found in index.html — re-point this script.`); process.exit(1); }
const text = n => decls.get(n).text;

// The functions, and the three constants evaluated against a given page URL.
const fns = new Function(`${text('isLocalDevHost')}\n${text('isRealAuthRequested')}\n${text('isDevBypassActive')}
  return { isLocalDevHost, isRealAuthRequested, isDevBypassActive };`)();
function modeAt(hostname, search) {
  return new Function('window', `${text('isLocalDevHost')}\n${text('isRealAuthRequested')}\n${text('isDevBypassActive')}
    ${text('IS_LOCAL_DEV')}\n${text('IS_LOCAL_REAL_AUTH')}\n${text('STATE_KEY')}
    return { bypass: IS_LOCAL_DEV, realLocal: IS_LOCAL_REAL_AUTH, key: STATE_KEY };`)({ location: { hostname, search } });
}

const LOCAL = ['localhost', '127.0.0.1', '::1', '[::1]', '127.9.9.9', 'adams-macbook.local', '10.1.2.3', '192.168.0.42', '172.20.0.5', '169.254.3.3'];
const PUBLIC = ['adamnc02.github.io', 'localhost.evil.com', '192.168.0.42.evil.com', '172.32.0.1', '8.8.8.8', 'example.com', ''];
const REAL = ['?auth=real', '?x=1&auth=real', '?auth=real&tour=demo'];
const NOT_REAL = ['', '?', '?auth=', '?auth=Real', '?auth=REAL', '?auth=reall', '?auth=fake', '?tour=demo', '?authreal', '?auth%3Dreal'];

// ── 1. A public host never bypasses, whatever the query ─────────────────
{
  const bad = [];
  for (const h of PUBLIC) for (const q of [...REAL, ...NOT_REAL]) {
    const m = modeAt(h, q);
    if (m.bypass || m.realLocal || m.key !== 'bloc_state') bad.push(`${h}${q} → ${JSON.stringify(m)}`);
  }
  check(`public hosts: never bypass, never local-real, key bloc_state (${PUBLIC.length} hosts × ${REAL.length + NOT_REAL.length} queries)`, bad.length === 0, bad.slice(0, 4).join('; '));
}

// ── 2. A local host bypasses unless the query is exactly auth=real ───────
{
  const bad = [];
  for (const h of LOCAL) {
    for (const q of NOT_REAL) { const m = modeAt(h, q); if (!m.bypass || m.realLocal || m.key !== 'bloc_state') bad.push(`${h}${q} → ${JSON.stringify(m)}`); }
    for (const q of REAL) { const m = modeAt(h, q); if (m.bypass || !m.realLocal || m.key !== 'bloc_state_authreal') bad.push(`${h}${q} → ${JSON.stringify(m)}`); }
  }
  check(`local hosts: bypass by default; ?auth=real → real sign-in on bloc_state_authreal (${LOCAL.length} hosts)`, bad.length === 0, bad.slice(0, 4).join('; '));
}

// ── 3. The invariant, stated directly: bypass ⇒ isLocalDevHost ──────────
{
  const hosts = [...LOCAL, ...PUBLIC, 'LOCALHOST', 'Localhost', '192.168.1.300', 'localhost.', 'xlocalhost'];
  const bad = [];
  for (const h of hosts) for (const q of [...REAL, ...NOT_REAL, '?auth=bypass', '?bypass=1', '?auth=dev'])
    if (fns.isDevBypassActive(h, q) && !fns.isLocalDevHost(h)) bad.push(`${h}${q}`);
  check('no query string makes a non-local host bypass', bad.length === 0, bad.slice(0, 4).join('; '));
  check('a malformed query never throws', (() => { try { fns.isRealAuthRequested('%E0%A4%A'); fns.isRealAuthRequested(undefined); return true; } catch (e) { return false; } })());
}

// ── 4. Every read/write of the state key goes through STATE_KEY ─────────
// Comments are stripped first: the prose around the key names it.
const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
function literalStateKeyUses(src) {
  return (stripComments(src).match(/localStorage\.(getItem|setItem|removeItem)\(\s*['"]bloc_state['"]/g) || []).length;
}
function stateKeyUses(src) {
  return (stripComments(src).match(/localStorage\.(getItem|setItem|removeItem)\(\s*STATE_KEY\b/g) || []).length;
}
check('no localStorage call names \'bloc_state\' directly', literalStateKeyUses(source) === 0, `${literalStateKeyUses(source)} found`);
check('save(), load(), new-user detection, Settings size and both erasures use STATE_KEY (6 calls)', stateKeyUses(source) === 6, `${stateKeyUses(source)} found`);
check('the bypass switch is driven by isDevBypassActive(hostname, search)',
  /^const IS_LOCAL_DEV = isDevBypassActive\(window\.location\.hostname, window\.location\.search\);/.test(text('IS_LOCAL_DEV')));
check('the "LIVE DATA" tag and console warning sit behind IS_LOCAL_REAL_AUTH only',
  /if \(IS_LOCAL_REAL_AUTH\) \{[\s\S]*?console\.warn[\s\S]*?dev-live-data-tag/.test(source)
  && (source.match(/dev-live-data-tag/g) || []).length === 1);

// ── Controls: each must FAIL ─────────────────────────────────────────────
function matrixPasses(isBypass) {
  for (const h of PUBLIC) for (const q of [...REAL, ...NOT_REAL]) if (isBypass(h, q)) return false;
  for (const h of LOCAL) {
    for (const q of NOT_REAL) if (!isBypass(h, q)) return false;
    for (const q of REAL) if (isBypass(h, q)) return false;
  }
  return true;
}
check('the real isDevBypassActive passes the matrix', matrixPasses(fns.isDevBypassActive));
check('control: a switch that ignores the host ("!auth=real → bypass") fails the matrix',
  !matrixPasses((h, q) => !fns.isRealAuthRequested(q)));
check('control: a switch that ORs the host test ("local || !auth=real") fails the matrix',
  !matrixPasses((h, q) => fns.isLocalDevHost(h) || !fns.isRealAuthRequested(q)));
check('control: v8.29 used the literal \'bloc_state\' and fails the key check', literalStateKeyUses(oldSource) === 6);

console.log(failures ? `\n✗ ${failures} check(s) failed` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
