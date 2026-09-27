#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-manifest.mjs
//
// WHAT IT PROTECTS (v8.21, TECHNICAL §108): the web app manifest that iOS
// Web Push needs (PROMPT-02). iOS only offers push to a Home Screen install
// that HAS a manifest, and whether an existing install picks one up is the
// on-device question v8.21 exists to answer.
//
// 🚨 THE TRAPS:
//   · Scope. Every one of Adam's apps is on adamnc02.github.io. start_url and
//     scope must be RELATIVE ("./" → /bloc-app/), never "/" — an absolute
//     root scope would claim Listly, the ledgers and every other app on the
//     origin. BLOC Coach (/bloc-app/coach/) will carry its own, narrower
//     manifest and service worker; the more specific scope wins.
//   · The icons must be the icon already on Adam's Home Screen (generated
//     from index.html's embedded apple-touch-icon), or the test changes two
//     things at once.
//   · No caching service worker, ever (Listly's rule, PROMPT-02 Q3): a
//     single-file app merged-to-deploy gets stuck on an old build behind a
//     fetch handler. If a sw.js exists it must have no 'fetch' listener.
//
// Reads the real files. A control shows a root-scoped manifest fails.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(repo, 'index.html'), 'utf8');

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) console.log(`    expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
const pngSize = buf => (buf.slice(1, 4).toString() === 'PNG' ? [buf.readUInt32BE(16), buf.readUInt32BE(20)] : null);

const manifestPath = join(repo, 'manifest.webmanifest');
check('manifest.webmanifest exists', existsSync(manifestPath), true);
let m = {};
try { m = JSON.parse(readFileSync(manifestPath, 'utf8')); check('manifest is valid JSON', true, true); }
catch (e) { check('manifest is valid JSON', e.message, true); }

const scopeOk = mf => mf.scope === './' && mf.start_url === './';
check('start_url and scope are relative "./" (→ /bloc-app/, never the whole origin)', scopeOk(m), true);
check('display is standalone (iOS push needs it)', m.display, 'standalone');
check('name and short_name are BLOC', [m.name, m.short_name], ['BLOC', 'BLOC']);
check('background/theme colour is the app background #161826', [m.background_color, m.theme_color], ['#161826', '#161826']);

const icons = m.icons || [];
for (const [src, size, purpose] of [['icon-192.png', 192, 'any'], ['icon-512.png', 512, 'any'], ['icon-512-maskable.png', 512, 'maskable']]) {
  const entry = icons.find(i => i.src === src);
  check(`${src} is listed as ${size}x${size} ${purpose}`, entry ? [entry.sizes, entry.type, entry.purpose] : null, [`${size}x${size}`, 'image/png', purpose]);
  const p = join(repo, src);
  check(`${src} exists and really is ${size}×${size}`, existsSync(p) ? pngSize(readFileSync(p)) : null, [size, size]);
}

const links = source.match(/<link rel="manifest" href="([^"]+)">/g) || [];
check('index.html links the manifest exactly once, relatively', links, ['<link rel="manifest" href="manifest.webmanifest">']);
check('the apple-touch-icon is still embedded (the icon the manifest copies)', /<link rel="apple-touch-icon" href="data:image\/png;base64,/.test(source), true);

// No caching service worker, ever.
const swPath = join(repo, 'sw.js');
if (existsSync(swPath)) {
  check('sw.js has no fetch handler (push-only, never caching)', /addEventListener\(\s*['"]fetch['"]/.test(readFileSync(swPath, 'utf8')), false);
} else {
  check('no sw.js yet → index.html registers no service worker', /serviceWorker\.register\(/.test(source), false);
}

// The on-device readout the manifest test reads (§108): present, and read-only.
const rowsStart = source.indexOf('function installReadinessRows(');
const rowsFn = rowsStart === -1 ? '' : source.slice(rowsStart, source.indexOf('\n}\n', rowsStart));
check('Settings shows the install-readiness rows (standalone, display mode, push available)',
  ['Opened from Home Screen', 'Display mode', 'Push available on this install'].every(t => rowsFn.includes(t)) && /installReadinessRows\(statRow\)/.test(source), true);
check('…and they request nothing (no requestPermission / subscribe / register)', /requestPermission|subscribe\(|register\(/.test(rowsFn), false);

// CONTROL: a root-scoped manifest must fail the scope check.
check('CONTROL: a scope of "/" is rejected (it would claim every app on the origin)', scopeOk({ scope: '/', start_url: '/' }), false);

console.log(failures ? `\n✗ ${failures} check(s) failed` : '\nALL CHECKS PASS');
process.exit(failures ? 1 : 0);
