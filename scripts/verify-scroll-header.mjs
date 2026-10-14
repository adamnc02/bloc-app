#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-scroll-header.mjs — the scroll header (v8.59, TECHNICAL §174)
//
// WHAT IT HOLDS:
//   · Home, Train, Fuel, Progress and Plan pin a 44px bar under the status bar
//     once the page has scrolled more than 8px: the animated logo centred, the
//     settings gear at the right. Back at the very top (0) it goes, and not
//     before, so a bounce near the threshold doesn't flip it back and forth.
//   · Never on Settings, scrolled or not, and a tab change re-checks it
//     (showScreen calls syncScrollHeader): #content keeps its scroll position
//     across tabs, so arriving on Settings with the bar up must take it down.
//   · Each time it appears, the logo's build-and-pulse replays (.animate
//     removed, reflow, added).
//   · Hidden, it takes no taps and isn't in the accessibility tree
//     (pointer-events: none; visibility: hidden), so Home's own gear and the
//     page headers under it stay usable at the top. 🚨 An invisible bar that
//     still took taps would swallow the header row of every page.
//   · It sits outside #content, above the edge fades (50) and below the nav
//     (100) and every sheet (200+), so no page's layout moves when it appears.
//   · Settings' own pinned row (.settings-topbar) is unchanged.
//
// syncScrollHeader runs as extracted from index.html against a stub DOM; the
// rest is read from the markup and CSS. Control: v8.58's index.html (commit
// 9fae4d3) must fail.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mainScript, indexTopLevel } from './golden/extract-engine.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTROL = '9fae4d3';
const git = f => execFileSync('git', ['show', `${CONTROL}:${f}`], { cwd: repo, encoding: 'utf8', maxBuffer: 64 << 20 });
const controlHtml = git('index.html');

function classes() {
  const s = new Set();
  return { set: s, add: c => s.add(c), remove: c => s.delete(c), contains: c => s.has(c), toggle: (c, on) => ((on ?? !s.has(c)) ? s.add(c) : s.delete(c), s.has(c)) };
}

function run(label, html) {
  let failures = 0;
  const check = (name, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    console.log(`${ok ? '✓' : '✗'} [${label}] ${name}`);
    if (!ok) console.log(`    expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  };
  const src = mainScript(html);
  const { decls } = indexTopLevel(src);
  const body = n => (decls.get(n) || { text: '' }).text;

  // ── 1. The show/hide rule, run ───────────────────────────────────────
  let sync = null;
  const replays = { n: 0 };
  const logo = { classList: classes(), getBoundingClientRect() { replays.n += this.classList.contains('animate') ? 0 : 1; return {}; } };
  const head = { classList: classes(), querySelector: q => (q === '.scroll-head-logo' ? logo : null) };
  const content = { scrollTop: 0, classList: classes() };
  const gear = { tabIndex: -1 };
  let active = 'screen-home';
  const doc = {
    getElementById: id => ({ 'scroll-head': head, content, 'scroll-head-gear': gear })[id] || null,
    querySelector: q => (q === '.screen.active' ? { id: active } : null),
  };
  if (decls.has('syncScrollHeader')) sync = new Function('document', `${body('syncScrollHeader')}\nreturn syncScrollHeader;`)(doc);
  const at = (screen, y) => { active = screen; content.scrollTop = y; if (sync) sync(); return head.classList.contains('is-shown'); };
  for (const screen of ['screen-home', 'screen-train', 'screen-nutrition', 'screen-progress', 'screen-plan']) {
    const seq = [at(screen, 0), at(screen, 4), at(screen, 8), at(screen, 9), at(screen, 400), at(screen, 3), at(screen, 0), at(screen, 6)];
    check(`${screen}: hidden at 0, 4 and 8; shown past 8; stays down to 1; gone at 0; not back at 6`, seq, [false, false, false, true, true, true, false, false]);
  }
  check('Settings: never shown, at any scroll', [at('screen-settings', 0), at('screen-settings', 9), at('screen-settings', 900)], [false, false, false]);
  at('screen-train', 500);
  check('shown: the gear can be tabbed to, and #content gets has-scroll-head', [gear.tabIndex, content.classList.contains('has-scroll-head')], [0, true]);
  check('arriving on Settings with the bar up takes it down', at('screen-settings', 500), false);
  check('hidden: the gear is out of the tab order, and has-scroll-head is gone', [gear.tabIndex, content.classList.contains('has-scroll-head')], [-1, false]);
  const r0 = replays.n;
  at('screen-home', 0); at('screen-home', 300); at('screen-home', 0); at('screen-home', 300); at('screen-home', 301);
  check('the logo replays once per appearance (twice for two), not on every scroll event', [replays.n - r0, logo.classList.contains('animate')], [2, true]);
  check('showScreen() re-checks the bar on every tab change', /syncScrollHeader\(\)/.test(body('showScreen')), true);
  check('initScrollHeader() listens to #content\'s scroll (passive)', /content\.addEventListener\('scroll', syncScrollHeader, \{ passive: true \}\)/.test(body('initScrollHeader')), true);

  // ── 2. Markup ────────────────────────────────────────────────────────
  const iHead = html.indexOf('<div class="scroll-head" id="scroll-head">');
  const iContent = html.indexOf('<div id="content">');
  check('#scroll-head is in #app, before (outside) #content', iHead > html.indexOf('<div id="app">') && iHead < iContent, true);
  const headHtml = iHead >= 0 ? html.slice(iHead, html.indexOf('</div>\n</div>', iHead)) : '';
  const logoGeom = h => { const m = h.match(/<svg class="(?:settings|scroll-head)-logo" viewBox="0 0 507\.8 100"[^>]*>([\s\S]*?)<\/svg>/); return m ? m[1].replace(/\s+/g, ' ').trim() : null; };
  const settingsLogo = logoGeom(html.slice(html.indexOf('<svg class="settings-logo"')));
  check('its logo is the Settings logo, shape for shape', !!settingsLogo && logoGeom(headHtml) === settingsLogo, true);
  check('its gear opens Settings, labelled, out of the tab order at rest', /<button class="icon-btn scroll-head-gear" id="scroll-head-gear" onclick="showScreen\('settings'\)" aria-label="Settings" tabindex="-1">/.test(headHtml), true);

  // ── 3. CSS ───────────────────────────────────────────────────────────
  const rule = sel => { const m = html.match(new RegExp('\\n' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\{([^}]*)\\}')); return m ? m[1] : ''; };
  const headCss = rule('.scroll-head');
  const z = parseInt((headCss.match(/z-index:\s*(\d+)/) || [])[1], 10);
  check('the bar is absolute at the top, z-index above the edge fades (50) and below the nav (100)', /position: absolute/.test(headCss) && /top: 0/.test(headCss) && z > 50 && z < 100, true);
  check('hidden, it takes no taps and is invisible', /pointer-events: none/.test(headCss) && /visibility: hidden/.test(headCss), true);
  check('shown, it takes taps and is visible', /pointer-events: auto/.test(rule('.scroll-head.is-shown')) && /visibility: visible/.test(rule('.scroll-head.is-shown')), true);
  check('the row is 44px, Settings\' row height', /height: 44px/.test(rule('.scroll-head-row')), true);
  check('hidden, the row is edge on (rotateX -90°); shown, flat (0°)',
    /rotateX\(-90deg\)/.test(rule('.scroll-head-row')) && /rotateX\(0deg\)/.test(rule('.scroll-head.is-shown .scroll-head-row')), true);
  check('its lower edge carries the 16px fade', /top: 100%; height: 16px/.test(rule('.scroll-head-row::after')), true);
  check('reduced motion: no flip', /@media \(prefers-reduced-motion: reduce\) \{\s*\.scroll-head-row, \.scroll-head\.is-shown \.scroll-head-row \{ transform: none;/.test(html), true);
  check('the logo shares Settings\' build-and-pulse animation', /\.settings-logo\.animate \.lb-1, \.scroll-head-logo\.animate \.lb-1 \{ animation: blocLogoBarIn/.test(html), true);

  // ── 4. Settings' own row is unchanged ────────────────────────────────
  const topbar = h => { const i = h.indexOf('<div class="settings-topbar">'); return i < 0 ? null : h.slice(i, h.indexOf('<div class="page-head">', i)); };
  const topbarCss = h => ['.settings-topbar', '.settings-topbar::before', '.settings-topbar::after'].map(sel => { const m = h.match(new RegExp('\\n' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\{([^}]*)\\}')); return m ? m[1] : null; });
  check('Settings\' pinned row: markup identical to v8.58\'s', topbar(html) === topbar(controlHtml), true);
  check('Settings\' pinned row: CSS identical to v8.58\'s', JSON.stringify(topbarCss(html)) === JSON.stringify(topbarCss(controlHtml)), true);
  return failures;
}

const failures = run('now', readFileSync(join(repo, 'index.html'), 'utf8'));

console.log(`\n— control: v8.58 (${CONTROL}), which must fail —`);
const orig = console.log; const lines = []; console.log = s => lines.push(String(s));
let cf;
try { cf = run('v8.58', controlHtml); } finally { console.log = orig; }
const failed = lines.filter(l => l.startsWith('✗'));
const want = [/screen-train: hidden at 0/, /outside\) #content/, /edge on/];
const missing = want.filter(re => !failed.some(l => re.test(l)));
if (cf > 0 && !missing.length) console.log(`✓ control: v8.58 fails ${cf} checks, including the rule, the markup and the flip`);
else { console.log(`✗ control: v8.58 should fail the rule, the markup and the flip (${cf} failed; missing ${missing.join(', ')})`); process.exitCode = 1; }

if (failures) { console.log(`\nFAIL: ${failures} check(s) failed.`); process.exit(1); }
console.log('\nAll checks passed.');
