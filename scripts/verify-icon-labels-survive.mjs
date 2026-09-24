#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-icon-labels-survive.mjs
//
// THE BUG THIS PREVENTS: an icon that vanishes on the first tap.
//
// v8.16's UAT replaced text characters used as icons (›, +, ✕) with real inline
// SVGs. That is safe right up until some other code writes `el.textContent =
// 'Pause'` on the same element — which REPLACES every child, icon included. The
// icon is there on load, disappears the first time the state changes, and never
// comes back. Nothing throws, nothing logs, and it only shows up if you happen
// to look at that control in that state.
//
// Two places in this file are one careless edit away from it:
//
//   · #cd-start-btn / #sw-start-btn — the rest timer's Start/Pause/Resume
//     buttons. Every state change used to be a bare textContent write. They now
//     go through setTimerBtn(), which rewrites label AND icon together.
//   · .modal-title — nine sheet titles have their text set from JS by id
//     (goal-modal-title, photo-review-title, …). That is exactly why the sheet
//     ✕ is positioned onto the title line with CSS instead of being made a
//     CHILD of .modal-title: as a child it would be deleted by those writes on
//     nine sheets and survive on the other fifty-eight, which is the worst
//     possible way for this to fail — it would look like a rendering glitch.
//
// This is a static check over index.html; there is no DOM to run. A control at
// the end re-introduces the bad pattern and asserts the suite then fails.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const raw = readFileSync(join(here, '..', 'index.html'), 'utf8');
// 🚨 Comment-stripped. A probe that regexes over raw source can match the app's
// own PROSE — index.html's comments name these very selectors — and that
// produces false passes as readily as false failures. Three scripts in this
// round were bitten by it; see TECHNICAL.md §91 and §92.
const source = raw
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '')
  .replace(/<!--[\s\S]*?-->/g, '');


let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) console.log(`    expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// ── Does any code clobber this element's children with plain text? ───────
// Matches both `getElementById('x').textContent =` and the two-step form
// `const b = document.getElementById('x'); … b.textContent = …`.
function clobbers(src, id) {
  if (new RegExp(`getElementById\\(['"]${id}['"]\\)\\s*\\.textContent\\s*=`).test(src)) return true;
  const via = new RegExp(`(?:const|let|var)\\s+(\\w+)\\s*=\\s*document\\.getElementById\\(['"]${id}['"]\\)`, 'g');
  let m;
  while ((m = via.exec(src))) {
    if (new RegExp(`\\b${m[1]}\\s*\\.textContent\\s*=`).test(src)) return true;
    if (new RegExp(`\\b${m[1]}\\s*&&\\s*\\(?\\s*${m[1]}\\.textContent\\s*=`).test(src)) return true;
  }
  return false;
}

// The static markup of one element, by id, up to its closing tag.
function markupOf(src, id) {
  const i = src.indexOf(`id="${id}"`);
  if (i === -1) return null;
  const open = src.lastIndexOf('<', i);
  const close = src.indexOf('</', i);
  return close === -1 ? null : src.slice(open, close);
}

// ── The rest-timer buttons ───────────────────────────────────────────────
for (const id of ['cd-start-btn', 'sw-start-btn']) {
  const markup = markupOf(source, id);
  if (!markup) {
    console.log(`✗ FAIL: #${id} not found in index.html.`);
    failures++;
    continue;
  }
  check(`#${id} ships with an icon`, /<svg/.test(markup), true);
  check(`#${id} is never written with textContent`, clobbers(source, id), false);
}

// setTimerBtn is what makes that possible — it must set innerHTML, not text.
const setter = source.slice(source.indexOf('function setTimerBtn('));
const setterBody = setter.slice(0, setter.indexOf('\n}\n') + 2);
check('setTimerBtn() exists', setterBody.length > 0, true);
check('setTimerBtn() writes innerHTML, so the icon is rewritten with the word',
  /\.innerHTML\s*=/.test(setterBody), true);
check('setTimerBtn() draws a pause icon as well as a play one',
  /Pause/.test(setterBody) && (setterBody.match(/<svg/g) || []).length >= 2, true);

// ── The sheet ✕ is positioned, never parented ────────────────────────────
// If the close button ever becomes a child of .modal-title, the nine
// JS-written titles delete it.
const titleChildX = /class="modal-title"[^>]*>(?:(?!<\/div>)[\s\S]){0,400}?modal-close-btn/.test(source);
check('the ✕ is NOT a child of .modal-title', titleChildX, false);
check('.modal-close-btn is positioned onto the title line from CSS',
  /\.modal-close-btn \{[^}]*position: absolute[^}]*top: calc\(100% \+/.test(source), true);

// Every sheet that has a handle row has a ✕ in it — one missing is invisible
// until you open that one sheet.
const handleRows = (source.match(/class="modal-handle-row"/g) || []).length;
const rowsWithX = (source.match(/class="modal-handle-row"[\s\S]{0,300}?modal-close-btn/g) || []).length;
check(`every one of the ${handleRows} handle rows carries a ✕`, rowsWithX, handleRows);

// ── Text characters are not used as icons any more ───────────────────────
check('no row chevron is still the text character ›',
  /class="row-btn-chevron"[^>]*>\s*(?:›|\\u203a)\s*</.test(source), false);

// ── CONTROL ──────────────────────────────────────────────────────────────
// Put the old pattern back and the suite must start failing.
const mutated = source.replace(
  /function setTimerBtn\(id, label, accent\) \{/,
  "function setTimerBtn(id, label, accent) {\n  document.getElementById('cd-start-btn').textContent = label;");
if (mutated === source) {
  console.log('✗ FAIL: control could not find setTimerBtn() to mutate.');
  failures++;
} else {
  check('CONTROL: a textContent write to #cd-start-btn IS detected',
    clobbers(mutated, 'cd-start-btn'), true);
}

console.log('');
if (failures) {
  console.log(`✗ ${failures} check(s) failed.`);
  process.exit(1);
}
console.log('✓ All checks passed.');
