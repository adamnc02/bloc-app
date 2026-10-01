#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-fuel-macro-row.mjs
//
// WHAT IT PROTECTS (v8.27, TECHNICAL §116): the Fuel hero's three macro mini-bars. Each top row carries ONLY
// the label and the logged figure ("Protein ··· 141g"), on one line; the
// target sits under the bar ("of 211g").
//
// 🚨 THE BUG IT PREVENTS: "Protein 141 / 211g" on one line needs 110px in
// Sora/Manrope, and a macro column is ~110px on a 440pt iPhone, 93px on a
// 393pt one and 88px on a 375pt one. The row wrapped after the slash, which
// dropped Protein's bar below Carbs' and Fats'. Seen live on a 440pt iPhone,
// where it overflowed by a fraction of a pixel.
//
// 🚨 THE TRAP: putting the target back on the top row, or dropping the
// no-wrap, "because there's room" on a wide screen. There isn't room on a
// standard iPhone. Widths were measured in headless Chrome with the real fonts:
// "Protein 888g" is ~80px, which fits every column down to 375pt.
//
// Runs the real renderNutrHero() from index.html. A control shows the v8.26
// renderer (8b79a54) put the target on the top row.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(repo, 'index.html'), 'utf8');
const oldHtml = execFileSync('git', ['show', '8b79a54:index.html'], { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) console.log(`    expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function extract(src, marker) {
  const start = src.indexOf(marker);
  if (start === -1) { console.error(`✗ FAIL: ${marker} not found.`); process.exit(1); }
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  return null;
}
function cssRule(src, selector) {
  const i = src.indexOf(`${selector} {`);
  return i === -1 ? null : src.slice(i, src.indexOf('}', i) + 1);
}

// Runs renderNutrHero() against a stubbed day and returns the hero's HTML.
function render(src, goal, totals) {
  const fn = extract(src, 'function renderNutrHero()');
  return new Function('goal', 'totals', `
    const el = { innerHTML: '' };
    const document = { getElementById: () => el };
    const nutrSelectedDate = '2026-09-28';
    const getGoalForDay = () => goal;
    const getDayTotals = () => totals;
    const getLocalToday = () => '2026-09-28';
    ${fn}
    renderNutrHero();
    return el.innerHTML;
  `)(goal, totals);
}
// Splits the hero's macro area into { top, afterBar } per macro, as text.
function macros(out) {
  const text = s => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  return out.split('<div class="fuel-swipe-hint">')[0].split('<div class="fuel-macro">').slice(1).map(block => {
    const top = block.match(/<div class="fuel-macro-top">([\s\S]*?)<\/div>/)[1];
    const afterBar = block.split('</i></div>')[1] || '';
    return { top: text(top), afterBar: text(afterBar.split('<div class="fuel-macro">')[0].replace(/<\/div>\s*$/, '')) };
  });
}

// A real day, 2026-09-28: 1,632 kcal, P 141/211, C 165/129, F 44/30.
const goal = { kcal: 1625, protein: 211, carbs: 129, fats: 30 };
const totals = { kcal: 1632, p: 141, c: 165, f: 44 };
const m = macros(render(html, goal, totals));

console.log('\n— The top row is label + logged figure only —');
check('three macros rendered', m.length, 3);
check('Protein top row', m[0].top, 'Protein 141g');
check('Carbs top row', m[1].top, 'Carbs 165g');
check('Fats top row', m[2].top, 'Fats 44g');
check('no top row carries the target ("/")', m.some(x => x.top.includes('/')), false);

console.log('\n— The target sits under the bar —');
check('Protein: "of 211g" under the bar', m[0].afterBar, 'of 211g');
check('Carbs: "of 129g" under the bar', m[1].afterBar, 'of 129g');
check('Fats: "of 30g" under the bar', m[2].afterBar, 'of 30g');

console.log('\n— Worst case: three-digit figures still make one short line —');
const big = macros(render(html, { kcal: 3500, protein: 888, carbs: 888, fats: 888 }, { kcal: 3500, p: 888, c: 888, f: 888 }));
check('Protein 888g', big[0].top, 'Protein 888g');
check('"of 888g" under the bar', big[0].afterBar, 'of 888g');

console.log('\n— No goal: figures only, no empty "of" line —');
const none = macros(render(html, null, totals));
check('Protein with no goal', none[0].top, 'Protein 141g');
check('no "of" line without a target', none.every(x => x.afterBar === ''), true);

console.log('\n— The row can never wrap —');
check('.fuel-macro-top is white-space: nowrap', /white-space:\s*nowrap/.test(cssRule(html, '.fuel-macro-top') || ''), true);
check('.fuel-macro-of is white-space: nowrap', /white-space:\s*nowrap/.test(cssRule(html, '.fuel-macro-of') || ''), true);
check('.fuel-macro-of is right-aligned under the bar', /text-align:\s*right/.test(cssRule(html, '.fuel-macro-of') || ''), true);

console.log('\n— CONTROL: v8.26 put the target on the top row (the bug) —');
const old = macros(render(oldHtml, goal, totals));
check('CONTROL: v8.26 Protein top row was "Protein 141 / 211g"', old[0].top, 'Protein 141 / 211g');
check('CONTROL: v8.26 top row had no nowrap', /white-space:\s*nowrap/.test(cssRule(oldHtml, '.fuel-macro-top') || ''), false);

console.log(failures ? `\n✗ ${failures} check(s) failed` : '\n✓ all checks passed');
process.exit(failures ? 1 : 0);
