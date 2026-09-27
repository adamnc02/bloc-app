#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-kb-pinned-sheets.mjs
//
// WHAT IT PROTECTS (v8.28, TECHNICAL §117 — Adam, 2026-09-28): every sheet
// with a search box that filters a list stays pinned to the top of the
// screen while the keyboard is up. Only the list inside resizes. Adam: the
// Add food sheet "took HOURS to get right".
//
// 🚨 THE BUG IT PREVENTS: Fuel › Shortcuts › Recipes (modal-recipe-pick) was a
// plain .modal-sheet. A plain sheet is anchored to the bottom and sized by its
// content, so each keystroke that filtered the list shrank the sheet and
// dropped its top edge down behind the keyboard. Measured in Chromium at
// 393pt with 12 recipes: the top moved 118 → 486 → 563px while typing.
//
// 🚨 THE TRAP: the pattern has FOUR parts and every one is needed. Converting
// the markup alone looks right at rest and still fails with the keyboard up:
//   1. the sheet is .kb-pinned-sheet (a fixed size, pinned top);
//   2. the list is .kb-list-wrap > .kb-list-inner, with a .kb-list-fade sibling;
//   3. the open function clears the wrap's maxHeight and calls
//      fitListToKeyboard('<wrap id>') after the 0.3s slide-in;
//   4. measureAll() re-fits the wrap on every visualViewport resize, which is
//      what runs when the keyboard opens and closes.
//
// Reads index.html. A control shows v8.27 (77fd02a) fails the rule for
// modal-recipe-pick, so a clean pass can be trusted.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(repo, 'index.html'), 'utf8');
const oldHtml = execFileSync('git', ['show', '77fd02a:index.html'], { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) console.log(`    expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// Every modal's markup, keyed by its overlay id.
function modals(src) {
  const out = {};
  const re = /<div class="modal-overlay" id="([^"]+)">/g;
  let m;
  const starts = [];
  while ((m = re.exec(src))) starts.push({ id: m[1], at: m.index });
  starts.forEach((s, i) => { out[s.id] = src.slice(s.at, i + 1 < starts.length ? starts[i + 1].at : s.at + 20000); });
  return out;
}
// A search sheet: a text input that re-renders a list as you type.
const isSearchSheet = body => /<input type="text"[^>]*oninput="render[A-Za-z]*\(\)"/.test(body);
// Is it ever opened? A modal nothing opens can't show the bug.
const isOpened = (src, id) => new RegExp(`openModal\\('${id}'\\)`).test(src);
function measureAllWraps(src) {
  const i = src.indexOf('function measureAll()');
  const body = src.slice(i, src.indexOf('\n  }\n', i));
  return [...body.matchAll(/fitListToKeyboard\('([^']+)'\)/g)].map(m => m[1]);
}
// The four parts, for one modal. Returns the list of parts that are missing.
function missingParts(src, id, body) {
  const missing = [];
  if (!/class="modal-sheet kb-pinned-sheet"/.test(body)) missing.push('1: not .kb-pinned-sheet');
  const wrap = body.match(/<div id="([^"]+)" class="kb-list-wrap">/);
  if (!wrap) { missing.push('2: no .kb-list-wrap'); return missing; }
  if (!/class="kb-list-inner"/.test(body) || !/class="kb-list-fade"/.test(body)) missing.push('2: no .kb-list-inner / .kb-list-fade');
  const wrapId = wrap[1];
  // The function that opens this modal must clear and re-fit this wrap.
  const openAt = src.indexOf(`openModal('${id}')`);
  const fnStart = src.lastIndexOf('\nfunction ', openAt);
  const fn = src.slice(fnStart, src.indexOf('\n}\n', openAt));
  if (!new RegExp(`getElementById\\('${wrapId}'\\)[\\s\\S]*maxHeight = ''`).test(fn)) missing.push(`3: open function doesn't clear ${wrapId}'s maxHeight`);
  if (!new RegExp(`setTimeout\\(\\(\\) => fitListToKeyboard\\('${wrapId}'\\), 320\\)`).test(fn)) missing.push(`3: open function doesn't fit ${wrapId} after the slide-in`);
  if (!measureAllWraps(src).includes(wrapId)) missing.push(`4: ${wrapId} is not re-fitted in measureAll()`);
  return missing;
}

const all = modals(html);
const searchSheets = Object.keys(all).filter(id => isSearchSheet(all[id]) && isOpened(html, id));

console.log('\n— Every search sheet that can be opened is keyboard-pinned —');
check('found the search sheets (control on the sweep itself)',
  ['modal-exercise-lib-editor', 'modal-food-lib-editor', 'modal-nutr-add', 'modal-recipe-pick'].every(id => searchSheets.includes(id)), true);
for (const id of searchSheets) check(`${id}: all four parts present`, missingParts(html, id, all[id]), []);

console.log('\n— Log a recipe matches Add food —');
check('modal-recipe-pick is a .kb-pinned-sheet', /class="modal-sheet kb-pinned-sheet" data-modal="modal-recipe-pick"/.test(html), true);
check('its list no longer has the 60vh cap that sized the sheet', /id="recipe-pick-list" style="max-height:60vh/.test(html), false);
check('measureAll() re-fits recipe-pick-list-wrap', measureAllWraps(html).includes('recipe-pick-list-wrap'), true);

console.log('\n— Unreachable search sheets are reported, not failed —');
const unreachable = Object.keys(all).filter(id => isSearchSheet(all[id]) && !isOpened(html, id));
console.log(`  (not opened anywhere, so they can't show the bug: ${unreachable.join(', ') || 'none'})`);

console.log('\n— CONTROL: v8.27 fails the rule for Log a recipe —');
const oldAll = modals(oldHtml);
check('CONTROL: v8.27 modal-recipe-pick was a plain sheet missing parts 1–4',
  missingParts(oldHtml, 'modal-recipe-pick', oldAll['modal-recipe-pick']).length > 0, true);
check('CONTROL: v8.27 modal-nutr-add passes (the pattern itself was sound)',
  missingParts(oldHtml, 'modal-nutr-add', oldAll['modal-nutr-add']), []);

console.log(failures ? `\n✗ ${failures} check(s) failed` : '\n✓ all checks passed');
process.exit(failures ? 1 : 0);
