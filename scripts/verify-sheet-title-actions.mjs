#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-sheet-title-actions.mjs — an action on a sheet's title line never
// sits under the ✕ (v8.58, TECHNICAL §173)
//
// THE BUG THIS PREVENTS: Settings → My Recipes' "+ Create new" under the
// sheet's ✕. The ✕ is absolutely positioned on the title line, 40px wide at
// the sheet's right edge (§ v8.16), and .modal-title reserves 52px for it
// with its own padding-right. My Recipes put its title and its button in an
// inline-styled space-between row and the title's reservation stayed inside
// the title, so the button was pushed to the row's right edge: the ✕ covered
// its last 40px, and a tap there closed the sheet instead of opening the
// recipe builder. Measured in Chromium at 320/390/430px: v8.57 −40px (fully
// under the ✕), v8.58 +12px clear.
//
// The rule: a .modal-title that shares a flex row with anything sits in
// .modal-title-row, and that row reserves at least the ✕'s width plus a gap.
// Every .modal-title in index.html (static markup and JS templates) is
// checked. Control: v8.57's index.html must fail.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function check(label, ok, detail) {
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok && detail) console.log(`    ${detail}`);
}

const cssOf = html => [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
const decl = (css, sel, prop) => {
  const body = css.match(new RegExp(`(?:^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`));
  if (!body) return null;
  const m = body[1].match(new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*([^;]+);?`));
  return m ? m[1].trim() : null;
};
const px = v => (v && /^\d+(\.\d+)?px$/.test(v) ? parseFloat(v) : NaN);

// Every .modal-title whose row is a flex row, and whether that row is a
// .modal-title-row. A title is the first child of its row, so the row is the
// opening tag directly before it.
function titlesInFlexRows(html) {
  const out = [];
  for (const m of html.matchAll(/<div class="modal-title[" ]/g)) {
    const before = html.slice(Math.max(0, m.index - 600), m.index);
    const opens = [...before.matchAll(/<div\b[^>]*>/g)];
    const parent = opens.length ? opens[opens.length - 1][0] : '';
    const isFlexRow = /display\s*:\s*flex/.test(parent) || /class="[^"]*modal-title-row/.test(parent);
    if (isFlexRow) out.push({ parent, ok: /class="[^"]*\bmodal-title-row\b/.test(parent),
      line: html.slice(0, m.index).split('\n').length });
  }
  return out;
}

function rules(html, tag) {
  const css = cssOf(html);
  const closeW = px(decl(css, '.modal-close-btn', 'width'));
  const reserve = px(decl(css, '.modal-title-row', 'padding-right'));
  check(`${tag}: .modal-title-row reserves the ✕'s width plus a gap (${reserve}px > ${closeW}px)`,
    reserve > closeW, 'the row\'s padding-right must exceed .modal-close-btn\'s width');
  check(`${tag}: a title in the row hands its own reservation to the row (padding-right: 0)`,
    decl(css, '.modal-title-row .modal-title', 'padding-right') === '0');
  const rows = titlesInFlexRows(html);
  const bad = rows.filter(r => !r.ok);
  check(`${tag}: every title sharing a flex row is in .modal-title-row (${rows.length} found)`,
    rows.length > 0 && bad.length === 0, bad.map(b => `line ${b.line}: ${b.parent}`).join('\n    '));
  check(`${tag}: My Recipes' title and + Create new share a .modal-title-row`,
    /<div class="modal-title-row"[^>]*>\s*<div class="modal-title">My Recipes<\/div>\s*<button class="btn[^"]*" onclick="[^"]*">\+ Create new<\/button>/.test(html));
}

rules(readFileSync(join(repo, 'index.html'), 'utf8'), 'v8.58');

let old = null;
try { old = execFileSync('git', ['show', '40ade94:index.html'], { cwd: repo, encoding: 'utf8', maxBuffer: 64 << 20 }); }
catch { console.log('  (control skipped: v8.57 not in this clone)'); }
if (old) {
  const before = failures;
  console.log('— control: v8.57 must fail —');
  const real = console.log; console.log = () => {};
  rules(old, 'v8.57');
  console.log = real;
  const controlFailed = failures > before;
  failures = before;
  check('control: v8.57 (My Recipes\' button under the ✕) fails these checks', controlFailed);
}

if (failures) { console.log(`\nFAIL: ${failures} check(s) failed`); process.exit(1); }
console.log('\nAll checks passed.');
