#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-coach-splash.mjs — BLOC Coach's splash paints first and hands over
// (Coach v0.1, TECHNICAL §139; the bloc-splash design's PORTING.md)
//
// The Coach splash is the `bloc-splash` design's Coach version, ported into
// coach/index.html. What must hold, in the SERVED build (coach/dist):
//   · #splash's styles are inline in <head>, and its markup comes before
//     #root with its script straight after it: the splash paints before the
//     app's bundle has even loaded, and the script starts the clock there.
//   · The hand-over is 8.5 s (1.4 s with reduced motion), with the skip button.
//   · The sign-in screen sits ABOVE the splash (z-index), as BLOC's gate does:
//     a signed-out person never watches the splash behind the sign-in form.
//   · The palette split (BLOC TECHNICAL §94, §138): the splash's green is the
//     brand's, never the app's lavender.
// Control: the markup moved after #root is caught.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = f => readFileSync(join(repo, f), 'utf8');
let failures = 0;
function check(label, ok, detail) {
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok && detail) console.log(`    ${detail}`);
}

function shape(html) {
  const head = html.slice(0, html.indexOf('</head>'));
  const splash = html.indexOf('<div id="splash">');
  const root = html.indexOf('<div id="root">');
  const afterSplash = html.slice(splash, root);
  return {
    inlineStyle: /<style>[\s\S]*#splash\s*\{[\s\S]*<\/style>/.test(head),
    beforeRoot: splash > -1 && root > -1 && splash < root,
    scriptAfter: /<\/div>\s*<script>[\s\S]*SPLASH_MS[\s\S]*<\/script>\s*$/.test(afterSplash.trimEnd()),
  };
}

const built = read('coach/dist/index.html');
const s = shape(built);
check('the served index.html has the splash styles inline in <head>', s.inlineStyle);
check('#splash comes before #root (it paints before the bundle loads)', s.beforeRoot);
check('its script follows #splash, before #root', s.scriptAfter);
check('the hand-over is 8.5 s, 1.4 s with reduced motion', /SPLASH_MS = 8500\b/.test(built) && /REDUCED_MS = 1400\b/.test(built));
check('the skip button is wired', /id="splash-skip"/.test(built) && /getElementById\('splash-skip'\)[\s\S]*addEventListener\('click', finish\)/.test(built));
check('#splash removes itself after the fade', /removeChild\(splash\)/.test(built));

const splashZ = Number((/#splash\s*\{[^}]*?z-index:\s*(\d+)/.exec(built) || [])[1]);
const gateZ = Number((/\.auth-gate \{[\s\S]*?z-index:\s*(\d+)/.exec(read('coach/src/styles/auth.css')) || [])[1]);
check(`the sign-in screen sits above the splash (${gateZ} > ${splashZ})`, gateZ > splashZ);

const splashCss = (/<style>([\s\S]*?)<\/style>/.exec(built) || [])[1] || '';
check('the splash uses the brand green, never the app lavender', /--splash-brand:\s*#2fb98a/i.test(splashCss) && !/#9184d9|#b5abfc/i.test(splashCss));

// Control: the same page with the splash moved after #root.
const moved = built.replace(/<div id="root"><\/div>/, '').replace('<div id="splash">', '<div id="root"></div><div id="splash">');
check('control: the splash moved after #root is caught', !shape(moved).beforeRoot);

console.log(failures ? `\n✗ ${failures} check(s) failed` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
