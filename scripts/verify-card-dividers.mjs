#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-card-dividers.mjs
//
// THE BUG THIS PREVENTS: two lines where one was meant.
//
// Rows inside a card are separated by ONE rule, in the stylesheet:
//
//     .card > .row-plain:not(:first-child)   { border-top: 1px solid var(--divider); }
//     .card > .settings-row + .settings-row  { border-top: 1px solid var(--divider); }
//
// Put an explicit <div class="divider"> in front of such a row and you get that
// border AND the element: a visible double line. It is easy to do, because the
// markup reads as if it is supplying the only divider there is.
//
// 🚨 This shipped TWICE in the same round, in two different files' worth of
// markup — Home ▸ Log today, and then Plan ▸ Volume by body part, where it
// survived a sweep that was supposed to have caught it. That is why it is a
// test and not a note.
//
// The sibling rule is also the more robust of the two: it cannot double up,
// and it cannot leave a divider stranded above a row that turns out not to
// render — which matters, because several of these rows are conditional.
//
// A control at the end re-inserts a divider element and asserts the check fires.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'index.html'), 'utf8');

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) console.log(`    expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// Classes whose rows already take a border from the stylesheet.
const SELF_DIVIDING = ['row-plain', 'settings-row'];
// Elements that draw a horizontal line and nothing else.
const DIVIDER_CLASSES = ['card-divider', 'plan-preview-divider', 'divider'];

// An explicit divider element, optionally followed by a template expression or
// whitespace, then one of the self-dividing rows.
function findDoubles(src) {
  const div = DIVIDER_CLASSES.join('|');
  const row = SELF_DIVIDING.join('|');
  const re = new RegExp(
    `<div class="(?:${div})"[^>]*>\\s*</div>\\s*(?:\\$\\{[^}]*\\}\\s*)?<(?:div|button|label)\\s+class="(?:${row})\\b`,
    'g');
  const hits = [];
  let m;
  while ((m = re.exec(src))) hits.push(src.slice(0, m.index).split('\n').length);
  return hits;
}

const doubles = findDoubles(source);
check('no explicit divider sits in front of a self-dividing row', doubles, []);
if (doubles.length) {
  console.log('    Remove the divider ELEMENT; the stylesheet rule already draws that line.');
  console.log('    Lines: ' + doubles.join(', '));
}

// The rules those rows depend on must still exist — deleting one would turn
// this whole check into a false pass, and the rows would lose their dividers.
check('.card > .row-plain:not(:first-child) still draws the divider',
  /\.card > \.row-plain:not\(:first-child\)\s*\{[^}]*border-top/.test(source), true);
// 🚨 Allow a comma-separated selector LIST before the brace. This rule is
// written as two selectors (.settings-row + .settings-row, and the same with a
// label), so the declaration sits after the comma — a regex that jumps straight
// from selector to `{` reports a rule that is plainly there as missing. It did.
check('.card > .settings-row + .settings-row still draws the divider',
  /\.card > \.settings-row \+ \.settings-row[^{]*\{[^}]*border-top/.test(source), true);

// .card-divider is still defined for cards that hold non-row content and
// genuinely need a line of their own. It just must not precede a row.
check('.card-divider is still available for non-row content',
  /\.card-divider\s*\{[^}]*background/.test(source), true);

// ── CONTROL ──────────────────────────────────────────────────────────────
// Put the Plan bug back and the sweep must find it.
const mutated = source.replace(
  '`<div class="row-plain" onclick="openPlanProgressionPreview()">',
  '`<div class="card-divider"></div><div class="row-plain" onclick="openPlanProgressionPreview()">');
if (mutated === source) {
  console.log('✗ FAIL: control could not find the progression-preview row to mutate.');
  console.log('  Re-point this control at any row inside a card that takes the sibling rule.');
  failures++;
} else {
  check('CONTROL: a divider in front of a row IS detected',
    findDoubles(mutated).length, 1);
}

console.log('');
if (failures) {
  console.log(`✗ ${failures} check(s) failed.`);
  process.exit(1);
}
console.log('✓ All checks passed.');
