#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-pinned-bars.mjs — a pinned back link never covers the page title,
// and the page never shows above it (v8.57 + Coach v0.17, TECHNICAL §172)
//
// THE BUGS THIS PREVENTS:
//   · Coach's back bar on top of the page title. `.backbar` is sticky at the
//     top inset, and its margin-top puts it where the header's eyebrow sat. That
//     margin took the inset off as well as the bar's 8px, as if the page started
//     below the status bar; it doesn't (black-translucent, §159). At a 59px
//     inset the bar's own place was 16px down, so it stuck at 59 and sat over
//     the H1 (78): Settings, a client, In person, Group session and Print had no
//     title on an installed iPhone. Desktop Chromium has no inset, so it never
//     showed there. This evaluates the margin from ui.css at insets 0–59 and
//     requires the bar's own place to be at or below the inset (it then never
//     moves until the page scrolls) and the link to land where the header's
//     eyebrow did. Control: v0.16's ui.css must fail at 59.
//   · The page showing through above a pinned bar. Both bars stick below the
//     status bar; the top edge fade only half hides what scrolls up into the
//     inset. Each bar needs a solid ::before the height of the inset, and its
//     fade (::after) at its lower edge, shown only while scrolled (.is-stuck).
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
const decl = (css, sel, prop) => {
  const body = css.match(new RegExp(`(?:^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`));
  if (!body) return null;
  const m = body[1].match(new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*([^;]+);?`));
  return m ? m[1].trim() : null;
};

// ── Coach: the bar's own place, at real insets ───────────────────────────
const HEADER_TOP = 52;   // tokens.css --header-top
function evalLength(expr, inset) {
  const js = expr
    .replace(/var\(--safe-top, env\(safe-area-inset-top\)\)/g, String(inset))
    .replace(/var\(--header-top\)/g, String(HEADER_TOP))
    .replace(/calc\(/g, '(').replace(/max\(/g, 'Math.max(').replace(/(\d+(?:\.\d+)?)px/g, '$1');
  if (/[^\d\s+\-*/().,Mathmax]/.test(js)) throw new Error(`can't evaluate ${expr}`);
  return Function(`return ${js}`)();
}
function barPlaces(css) {
  const margin = decl(css, '.backbar', 'margin');
  let depth = 0, end = 0;   // the first value of the shorthand: the balanced calc(…)
  for (let i = 0; i < margin.length; i++) { if (margin[i] === '(') depth++; else if (margin[i] === ')' && --depth === 0) { end = i + 1; break; } }
  const top = margin.slice(0, end);
  return [0, 20, 34, 47, 59].map(inset => {
    const barTop = evalLength(top, inset);
    const headerPad = evalLength('max(var(--header-top), calc(var(--safe-top, env(safe-area-inset-top)) + 24px))', inset);
    return { inset, barTop, linkTop: barTop + 8, headerPad };
  });
}
const ui = read('coach/src/styles/ui.css').replace(/\/\*[\s\S]*?\*\//g, '');
for (const p of barPlaces(ui)) {
  check(`Coach, inset ${p.inset}: the bar's own place (${p.barTop}) is at or below the inset, so it never sits on the title`, p.barTop >= p.inset);
  check(`Coach, inset ${p.inset}: the link (${p.linkTop}) is where the header's eyebrow sat (${p.headerPad})`, p.linkTop === p.headerPad);
}
let oldUi = null;
try { oldUi = execFileSync('git', ['show', '96b1465:coach/src/styles/ui.css'], { cwd: repo, encoding: 'utf8' }).replace(/\/\*[\s\S]*?\*\//g, ''); }
catch { console.log('  (control skipped: v0.16 not in this clone)'); }
if (oldUi) {
  const at59 = barPlaces(oldUi).find(p => p.inset === 59);
  check(`control: v0.16's bar, inset 59, sat at ${at59.barTop}: above the inset, over the title`, at59.barTop < 59);
}

// ── Both bars: solid above, fade below once scrolled ─────────────────────
const blocCss = [...read('index.html').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
for (const [app, css, bar, inset, solid] of [
  ['BLOC', blocCss, '.settings-topbar', 'var(--safe-top)', 'var(--bg)'],
  ['Coach', ui, '.backbar', 'var(--safe-top, env(safe-area-inset-top))', 'var(--bg)'],
]) {
  check(`${app}: ${bar}::before sits above the bar, the inset's height, solid`,
    decl(css, `${bar}::before`, 'bottom') === '100%' && decl(css, `${bar}::before`, 'height') === inset && decl(css, `${bar}::before`, 'background') === solid);
  check(`${app}: ${bar}::after is a fade at the bar's lower edge`,
    decl(css, `${bar}::after`, 'top') === '100%' && /linear-gradient\(to bottom/.test(decl(css, `${bar}::after`, 'background') || ''));
  check(`${app}: the fade is hidden at rest and shown by .is-stuck`,
    decl(css, `${bar}::after`, 'opacity') === '0' && decl(css, `${bar}.is-stuck::after`, 'opacity') === '1');
}
check('BLOC: initSettingsTopbarFade sets .is-stuck from #content\'s scroll',
  /function initSettingsTopbarFade\(\)[\s\S]{0,400}classList\.toggle\('is-stuck', content\.scrollTop > 0\)/.test(read('index.html')));
check("Coach: BackBar sets .is-stuck from the window's scroll",
  /window\.scrollY > 0[\s\S]{0,300}is-stuck/.test(read('coach/src/components/ui/layout.tsx')));

if (failures) { console.log(`\nFAIL: ${failures} check(s) failed`); process.exit(1); }
console.log('\nAll checks passed.');
