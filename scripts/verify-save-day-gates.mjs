#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-save-day-gates.mjs
//
// THE BUG THIS PREVENTS: Fuel offering to save a day it already has.
//
// "Save this day" offers to store a day of logging that landed close to its
// targets, keyed by whichever recipe is logged for Dinner. A day FILLED from a
// saved day must never be offered back — you would be saving a copy of
// something already in the library, under the same name.
//
// Nothing in `state` records where a day's food came from. There is no
// provenance field, and adding one was never needed, because `fillDayFromSample()`
// deep-copies the sample's meals verbatim: the filled day's dinner item
// therefore carries the SAME NAME as the stored sample's `dinnerName`, and the
// `alreadyStored` name comparison is what suppresses the prompt.
//
// 🚨 That name comparison IS the mechanism. Remove it, reorder the gates around
// it, or make it case-sensitive, and the app starts offering to re-save every
// filled day — which is invisible from the screen until you notice the library
// filling with duplicates.
//
// The v8.16 redesign rewrote everything this function RENDERS while leaving the
// gates alone. This script exists because that is exactly the kind of edit that
// drops an early return by accident.
//
// 🚨 It extracts the REAL function out of index.html and runs it against stubs,
// rather than keeping its own copy of the logic. A copy would pass forever while
// the shipped code drifted away from it. A control at the end mutates the
// extracted source to delete the alreadyStored gate and asserts the suite then
// FAILS — without that, a test that passes proves nothing about what it checks.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'index.html'), 'utf8');

// ── Extract a top-level function by brace matching ───────────────────────
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

const MARKER = 'function renderNutrSaveBadge() {';
const fnSource = extract(MARKER);
if (!fnSource) {
  console.error('✗ FAIL: renderNutrSaveBadge() not found in index.html.');
  console.error('  It was renamed or restructured. Both need this script updated');
  console.error('  deliberately — do not delete the check.');
  process.exit(1);
}

// ── A harness that runs the extracted function against stubbed deps ──────
// Everything the function reaches for is supplied here, so the only thing under
// test is its own gate chain.
function run(fnText, world) {
  const el = { innerHTML: 'UNSET' };
  const scope = {
    document: { getElementById: (id) => (id === 'nutr-save-badge-wrap' ? el : null) },
    nutrSelectedDate: world.date,
    getGoalForDay: () => world.goal,
    isDateSavedInLibrary: () => world.dateSaved,
    getDayTotals: () => world.totals,
    dayWithinSaveTolerance: () => world.withinTolerance,
    getDinnerRecipeItem: () => world.dinnerItem,
    findSampleGroupForGoal: () => world.group,
    findSampleGroupForTotals: () => world.group,
    sectionHeader: (t, s) => `<HEAD:${t}>`,
    sectionEnd: () => '</HEAD>',
    Math,
  };
  const names = Object.keys(scope);
  // eslint-disable-next-line no-new-func
  const factory = new Function(...names, `${fnText}\nreturn renderNutrSaveBadge;`);
  factory(...names.map((n) => scope[n]))();
  return el.innerHTML;
}

// The baseline world: a day that genuinely qualifies and is NOT in the library.
function qualifyingWorld(overrides = {}) {
  return {
    date: '2026-08-02',
    goal: { kcal: 1500, protein: 150, carbs: 120, fats: 45, macroGoalID: 'g1' },
    dateSaved: false,
    totals: { kcal: 1515, p: 152, c: 118, f: 44, isQuick: false },
    withinTolerance: true,
    dinnerItem: { name: '(Dinner) 2 Cajun Chicken Wraps' },
    group: { id: 'grp1', days: [{ dinnerName: 'Something Already Stored' }] },
    ...overrides,
  };
}

const shows = (html) => html !== '' && html.includes('<HEAD:Save this day>');

let failures = 0;
function check(name, got, want) {
  if (got === want) {
    console.log(`✓ ${name}`);
  } else {
    console.log(`✗ FAIL: ${name} — expected ${want}, got ${got}`);
    failures++;
  }
}

console.log('renderNutrSaveBadge() — the gate chain\n');

// The prompt shows only when every gate passes.
check('a qualifying day is offered', shows(run(fnSource, qualifyingWorld())), true);

// Each gate suppresses it on its own.
check('no active goal → no prompt',
  shows(run(fnSource, qualifyingWorld({ goal: null }))), false);
check('the day is already saved → no prompt',
  shows(run(fnSource, qualifyingWorld({ dateSaved: true }))), false);
check('a quick-logged day → no prompt',
  shows(run(fnSource, qualifyingWorld({ totals: { kcal: 2100, p: 150, c: 210, f: 65, isQuick: true } }))), false);
check('outside the save tolerance → no prompt',
  shows(run(fnSource, qualifyingWorld({ withinTolerance: false }))), false);
check('no identifying dinner recipe → no prompt',
  shows(run(fnSource, qualifyingWorld({ dinnerItem: null }))), false);

// ── The one this script exists for ───────────────────────────────────────
// A day filled from a saved day carries that day's dinner name verbatim.
const filledFromSample = qualifyingWorld({
  group: { id: 'grp1', days: [{ dinnerName: '(Dinner) 2 Cajun Chicken Wraps' }] },
});
check('a day whose dinner is already stored → no prompt (the filled-day case)',
  shows(run(fnSource, filledFromSample)), false);

// Case-insensitively, because the comparison lowercases both sides and a
// recipe can be renamed with different capitalisation.
check('the stored-name match ignores case',
  shows(run(fnSource, qualifyingWorld({
    group: { id: 'grp1', days: [{ dinnerName: '(dinner) 2 CAJUN chicken WRAPS' }] },
  }))), false);

// With no group yet (the very first save), there is nothing to match against.
check('no sample group at all → still offered',
  shows(run(fnSource, qualifyingWorld({ group: null }))), true);

// ── CONTROL ──────────────────────────────────────────────────────────────
// Delete the alreadyStored gate from the extracted source and the filled-day
// case must start being offered. If it does not, this suite is not testing what
// it claims to and every ✓ above is worthless.
const gateLine = /\s*if \(alreadyStored\) \{ el\.innerHTML = ''; return; \}/;
if (!gateLine.test(fnSource)) {
  console.log("✗ FAIL: control could not find the `if (alreadyStored)` gate to remove.");
  console.log('  The gate was reworded or restructured. Re-point this control at');
  console.log('  whatever now suppresses the prompt for an already-stored dinner.');
  failures++;
} else {
  const mutated = fnSource.replace(gateLine, '');
  const controlShows = shows(run(mutated, filledFromSample));
  check('CONTROL: without the alreadyStored gate, the filled-day case IS offered',
    controlShows, true);
}

console.log('');
if (failures) {
  console.log(`✗ ${failures} check(s) failed.`);
  process.exit(1);
}
console.log('✓ All checks passed.');
