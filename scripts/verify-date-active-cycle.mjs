#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-date-active-cycle.mjs
//
// THE BUG THIS PREVENTS: Progress, Train and Plan opening on last cycle.
//
// `state.currentMacroId` is written when a cycle is CREATED or PICKED and never
// again. Nothing re-derives it from the calendar. So the day a cycle ends, every
// one of those three pages keeps opening on the finished cycle, and the only way
// to see the cycle you are actually in is to step the cycle arrows forward by
// hand — reported in the v8.16 UAT as "no longer correctly resets default cycle
// to the currently active cycle, same bug on train and plan pages".
//
// 🚨 TWO DIFFERENT THINGS ARE BOTH CALLED "the current cycle". Confusing them is
// the plausible wrong fix:
//   · what a page is SHOWING — state.currentMacroId / progressViewMacroId. The
//     cycle arrows move these and browsing history that way must keep working.
//   · the DATE-ACTIVE cycle — the one today falls inside. Nothing chose it.
// The reset therefore belongs in showScreen() (page entry), NOT in
// renderProgress(). Called from the render, it would re-run immediately after
// cycleProgressMacro() set a new cycle and snap the view straight back — the
// arrows would appear broken. There is a check for that below.
//
// 🚨 Returning null between cycles is deliberate, not an oversight. On a day
// that falls in NO cycle — the gap between two, or after the last one ended —
// there is nothing to snap to, and the page keeps whatever was selected rather
// than being blanked.
//
// It extracts the REAL getDateActiveMacroId()/resetToDateActiveMacro() out of
// index.html and runs them against stubs. A control at the end proves the suite
// can fail.
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

const MARKERS = [
  'function getDateActiveMacroId() {',
  'function resetToDateActiveMacro() {',
];
const sources = MARKERS.map(m => {
  const fn = extract(m);
  if (!fn) {
    console.error(`✗ FAIL: ${m} not found in index.html.`);
    console.error('  It was renamed or restructured. Re-point this script at whatever');
    console.error('  now snaps the three pages to the cycle today falls inside.');
    process.exit(1);
  }
  return fn;
});

// ── Harness ──────────────────────────────────────────────────────────────
// Real helpers copied in only where they are pure date arithmetic with no app
// state: toLocalDateStr and the end-date rule (start + weeks*7 - 1 day).
function run(fnSources, world) {
  const prelude = `
    const state = ${JSON.stringify(world.state)};
    let progressViewMacroId = ${JSON.stringify(world.progressViewMacroId ?? null)};
    let saveCalls = 0;
    const now = () => new Date(${JSON.stringify(world.today)} + 'T12:00:00');
    const toLocalDateStr = d => d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const getMacroDurationWeeks = m => m.weeks;
    const getMacroEndDate = m => {
      const d = new Date(m.start + 'T00:00:00');
      d.setDate(d.getDate() + getMacroDurationWeeks(m) * 7 - 1);
      return d;
    };
    const save = () => { saveCalls++; };
  `;
  const body = `
    ${prelude}
    ${fnSources.join('\n')}
    const activeId = getDateActiveMacroId();
    resetToDateActiveMacro();
    return { activeId, currentMacroId: state.currentMacroId, progressViewMacroId, saveCalls };
  `;
  return new Function(body)();
}

// Two consecutive 4-week cycles, then a gap, then a third.
const CYCLES = [
  { id: 'A', start: '2026-06-01', weeks: 4 },   // 01 Jun – 28 Jun
  { id: 'B', start: '2026-06-29', weeks: 4 },   // 29 Jun – 26 Jul
  { id: 'C', start: '2026-09-01', weeks: 4 },   // 01 Sep – 28 Sep  (gap before it)
];
const world = (today, currentMacroId, progressViewMacroId = null) => ({
  today, progressViewMacroId,
  state: { macrocycles: CYCLES, currentMacroId },
});

// ── The reported bug ─────────────────────────────────────────────────────
// Stuck on A while today is inside B: both selections must move to B.
const stuck = run(sources, world('2026-07-10', 'A'));
check('today inside B while state says A → active cycle is B', stuck.activeId, 'B');
check('today inside B while state says A → Train/Plan follow to B', stuck.currentMacroId, 'B');
check('today inside B while state says A → Progress follows to B', stuck.progressViewMacroId, 'B');
check('a real change is persisted exactly once', stuck.saveCalls, 1);

// Already correct: nothing changes, and nothing is written.
const fine = run(sources, world('2026-07-10', 'B', 'B'));
check('already on the date-active cycle → no state change', fine.currentMacroId, 'B');
check('already on the date-active cycle → nothing is saved', fine.saveCalls, 0);

// ── Boundaries. A cycle owns its first and last day. ─────────────────────
check('first day of B is inside B', run(sources, world('2026-06-29', 'A')).activeId, 'B');
check('last day of B is inside B',  run(sources, world('2026-07-26', 'A')).activeId, 'B');
check('day after B ends is in no cycle', run(sources, world('2026-07-27', 'B')).activeId, null);

// ── The gap. Nothing to snap to → the last selection survives. ───────────
const gap = run(sources, world('2026-08-15', 'B', 'B'));
check('between cycles → no active cycle', gap.activeId, null);
check('between cycles → Train/Plan selection left alone', gap.currentMacroId, 'B');
check('between cycles → Progress selection left alone', gap.progressViewMacroId, 'B');
check('between cycles → nothing is saved', gap.saveCalls, 0);

// Before the first cycle has started.
check('before any cycle starts → no active cycle', run(sources, world('2026-01-01', 'A')).activeId, null);

// A macrocycle with no start date must never match.
const undated = run(sources, {
  today: '2026-07-10', progressViewMacroId: null,
  state: { macrocycles: [{ id: 'X', start: '', weeks: 4 }], currentMacroId: 'X' },
});
check('a cycle with no start date is never date-active', undated.activeId, null);

// ── The arrows must survive. ─────────────────────────────────────────────
// showScreen() is where the reset is wired. If it ever moves into
// renderProgress(), cycleProgressMacro() would be undone the moment it ran.
const showScreenSrc = extract('function showScreen(name) {') || '';
check('reset is wired into showScreen()',
  /resetToDateActiveMacro\(\)/.test(showScreenSrc), true);
const renderProgressSrc = extract('function renderProgress() {') || '';
check('reset is NOT wired into renderProgress() — the cycle arrows depend on it',
  /resetToDateActiveMacro\(\)/.test(renderProgressSrc), false);

// ── CONTROL ──────────────────────────────────────────────────────────────
// Break the date comparison so every cycle looks active, and the suite must
// start failing. Without this, every ✓ above could be vacuous.
const mutated = sources.map(s => s.replace(
  "m.start && today >= m.start && today <= toLocalDateStr(getMacroEndDate(m))", "!!m.start"));
if (mutated.join('') === sources.join('')) {
  console.log('✗ FAIL: control could not find the date comparison to break.');
  console.log('  getDateActiveMacroId() was reworded. Re-point this control at');
  console.log('  whatever now decides that today falls inside a cycle.');
  failures++;
} else {
  const ctrl = run(mutated, world('2026-08-15', 'B', 'B'));
  check('CONTROL: without the date comparison, the gap wrongly resolves to a cycle',
    ctrl.activeId, 'A');
}

console.log('');
if (failures) {
  console.log(`✗ ${failures} check(s) failed.`);
  process.exit(1);
}
console.log('✓ All checks passed.');
