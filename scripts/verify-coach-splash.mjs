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
//   · The sign-in screen sits BELOW the splash (z-index): a signed-out coach
//     sees the splash first and it fades to reveal sign-in. Above it, the
//     splash was never seen until after a Google sign-in's redirect.
//   · The palette split (BLOC TECHNICAL §94, §138): the splash's green is the
//     brand's, never the app's lavender.
// Control: the markup moved after #root is caught.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
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
check(`the sign-in screen sits below the splash (${gateZ} < ${splashZ})`, gateZ > 0 && splashZ > 0 && gateZ < splashZ);
check('control: a gate at 10000 (above the splash) is caught', !(10000 < splashZ));

const splashCss = (/<style>([\s\S]*?)<\/style>/.exec(built) || [])[1] || '';
// §146: each word scales about its own centre in drawing units. With fill-box,
// WebKit centres SVG text elsewhere and REPEAT started on its icon on an iPhone.
const wordsOk = (css) => /\.s-word\{[^}]*transform-box:view-box/.test(css)
  && [['train', '56.5'], ['fuel', '157'], ['over', '289.5'], ['repeat', '440']].every(([w, x]) => new RegExp(`\\.s-w-${w}\\{transform-origin:${x}px 143px\\}`).test(css));
check('the splash words scale about their own centres (view-box, fixed origins), as in BLOC', wordsOk(built));
check('control: fill-box words are caught', !wordsOk(built.replace(/(\.s-word\{[^}]*)transform-box:view-box/, '$1transform-box:fill-box')));
// Coach's own icons (§144): the Home Screen icon, the tab icon and the SVG, from the brand kit, in the build.
{
  const links = [...built.matchAll(/<link rel="(apple-touch-icon|icon)" href="\/bloc-app\/coach\/([^"]+)"/g)].map((m) => m[2]);
  const want = ['apple-touch-icon.png', 'favicon.ico', 'bloc-coach-icon-square.svg'];
  const tracked = execFileSync('git', ['-C', repo, 'ls-files', 'coach/dist'], { encoding: 'utf8' }).split('\n');
  check(`the served page links Coach's icons, each in the committed build (${want.join(', ')})`,
    want.every((f) => links.includes(f) && tracked.includes(`coach/dist/${f}`)), `linked: ${links.join(', ')}`);
}
check('the splash uses the brand green, never the app lavender', /--splash-brand:\s*#2fb98a/i.test(splashCss) && !/#9184d9|#b5abfc/i.test(splashCss));

// Control: the same page with the splash moved after #root.
const moved = built.replace(/<div id="root"><\/div>/, '').replace('<div id="splash">', '<div id="root"></div><div id="splash">');
check('control: the splash moved after #root is caught', !shape(moved).beforeRoot);

console.log(failures ? `\n✗ ${failures} check(s) failed` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
