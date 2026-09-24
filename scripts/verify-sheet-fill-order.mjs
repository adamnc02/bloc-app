#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-sheet-fill-order.mjs
//
// THE BUG THIS PREVENTS: a sheet that opens completely empty, with no error.
//
// This shipped. Plan ▸ Weekly sessions → tap a session opened modal-plan-session
// with NOTHING in it — no exercise list, no way to add one — and nothing was
// logged to the console, because nothing threw. It looked like the feature had
// simply not been built.
//
// The cause is an ordering trap that any sheet fed by a render function can
// fall into:
//
//   · renderPlanDaySession() refuses to draw into a sheet that is not open.
//     That guard is deliberate and worth keeping — renderPlan() calls it on
//     EVERY Plan render, and building a list into a hidden sheet is wasted work.
//   · openPlanDaySession() called it BEFORE openModal(). At that instant the
//     overlay had no .open class, so the guard returned early, and openModal()
//     then revealed a sheet nobody had filled.
//
// 🚨 The two lines are order-dependent and look interchangeable. Swap them back
// and every check below still passes EXCEPT the ordering one — which is the
// whole reason this script exists.
//
// A control at the end swaps them in the extracted source and asserts the
// suite then fails.
//
// 🚨 Every position check runs over COMMENT-STRIPPED source. This script's own
// subject carries a comment explaining the ordering, and that comment names
// renderPlanDaySession() above the openModal() call — so an indexOf() over the
// raw text finds the comment and reports correct code as broken. It did,
// first run. verify-dev-bypass-real-data.mjs was bitten by exactly this
// (TECHNICAL.md §91): a probe that reads its own neighbours.
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

// Line and block comments out, so a position check can only ever match CODE.
// Crude on purpose: it does not need to understand strings or regex literals,
// only to stop prose being mistaken for a call.
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

function extract(marker) {
  const start = source.indexOf(marker);
  if (start === -1) return null;
  if (source.indexOf(marker, start + 1) !== -1) {
    console.error(`✗ FAIL: ${marker} is defined more than once in index.html.`);
    process.exit(1);
  }
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}

// ── Every sheet whose body is filled by a render function ────────────────
// opener: the function a tap calls. renderer: what fills its body.
// guarded: whether the renderer refuses to draw while the sheet is closed —
// which is exactly what makes the call order load-bearing.
const SHEETS = [
  { opener: 'function openPlanDaySession(macroId, dayKey, day) {',
    renderer: 'renderPlanDaySession', modal: 'modal-plan-session', bodyId: 'plan-session-body' },
  { opener: 'function openTrainSessionPicker() {',
    renderer: 'renderTrainSessionPicker', modal: 'modal-train-session', bodyId: 'train-session-picker-body' },
];

for (const sheet of SHEETS) {
  const src = extract(sheet.opener);
  if (!src) {
    console.log(`✗ FAIL: ${sheet.opener} not found. It was renamed or restructured —`);
    console.log('  re-point this script rather than deleting the check.');
    failures++;
    continue;
  }
  const code = stripComments(src);
  const iOpen = code.indexOf(`openModal('${sheet.modal}')`);
  const iRender = code.indexOf(`${sheet.renderer}(`);
  check(`${sheet.renderer}: the opener calls openModal()`, iOpen !== -1, true);
  check(`${sheet.renderer}: the opener fills the body`, iRender !== -1, true);

  const rSrc = stripComments(extract(`function ${sheet.renderer}() {`) || '');
  const guarded = /classList\.contains\('open'\)/.test(rSrc);

  if (guarded) {
    // 🚨 The load-bearing assertion. Only meaningful when the renderer guards.
    check(`${sheet.renderer}: guards on .open, so openModal MUST come first`,
      iOpen !== -1 && iRender !== -1 && iOpen < iRender, true);
  } else {
    console.log(`✓ ${sheet.renderer}: no .open guard, so call order cannot strand it`);
  }

  // The body element the renderer writes into has to exist in the markup.
  check(`#${sheet.bodyId} exists in the markup`,
    source.includes(`id="${sheet.bodyId}"`), true);
  // …and the sheet it lives in has to exist too.
  check(`#${sheet.modal} exists in the markup`,
    source.includes(`id="${sheet.modal}"`), true);
}

// ── renderPlan() keeps the open sheet in step with the page ──────────────
// Without this, editing an exercise updates the page behind the sheet and
// leaves the sheet showing the list as it was.
const renderPlanSrc = stripComments(extract('function renderPlan() {') || '');
check('renderPlan() redraws the open session sheet',
  /renderPlanDaySession\(\)/.test(renderPlanSrc), true);

// ── CONTROL ──────────────────────────────────────────────────────────────
// Put the original bug back: render before opening. The ordering check must fail.
const opener = stripComments(extract('function openPlanDaySession(macroId, dayKey, day) {') || '');
const swapped = opener
  .replace("openModal('modal-plan-session');\n  renderPlanDaySession();",
           "renderPlanDaySession();\n  openModal('modal-plan-session');");
if (swapped === opener) {
  console.log('✗ FAIL: control could not find the two lines to swap.');
  console.log('  openPlanDaySession() was reworded. Re-point this control at');
  console.log('  whatever now opens the sheet and fills it.');
  failures++;
} else {
  const iOpen = swapped.indexOf("openModal('modal-plan-session')");
  const iRender = swapped.indexOf('renderPlanDaySession(');
  check('CONTROL: rendering before opening IS detected as wrong', iOpen < iRender, false);
}

console.log('');
if (failures) {
  console.log(`✗ ${failures} check(s) failed.`);
  process.exit(1);
}
console.log('✓ All checks passed.');
