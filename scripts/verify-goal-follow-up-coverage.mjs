#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-goal-follow-up-coverage.mjs
//
// THE BEHAVIOUR THIS PROTECTS (v8.19, TECHNICAL §98): after a new goal period
// is saved, the goal sheet reopens for the same cycle while any of the cycle
// has no goal, with "N weeks still unaccounted for · cycle ends …" in red.
//
// Before v8.19 a 4-week cycle given one 2-week goal simply closed the sheet,
// with nothing to say two weeks had no targets (UAT 2026-09-26).
//
// 🚨 The failure worth a script is the chain that NEVER ENDS: coverage must
// count goals from every cycle. A day held by another cycle's goal can never
// be filled by this one (goal periods never overlap), so counting only this
// cycle's goals would reopen the sheet forever on a cycle that overlaps its
// neighbour. The control makes exactly that change and asserts a failure.
//
// Also checks, statically, that opening "New Macrocycle" clears the name and
// goal text — they used to carry over from the previous cycle.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'index.html'), 'utf8');

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

const NAMES = ['toLocalDateStr', 'getMacroDurationWeeks', 'getMacroEndDate', 'shiftDateStr', 'macroGoalCoverage', 'describeUncovered'];
const sources = {};
for (const n of NAMES) {
  sources[n] = extract(`function ${n}(`);
  if (!sources[n]) {
    console.error(`✗ FAIL: ${n}() not found in index.html.`);
    console.error('  It was renamed or restructured. Update this script deliberately — do not delete the check.');
    process.exit(1);
  }
}
function load(srcs) {
  // eslint-disable-next-line no-new-func
  return new Function('now', `${NAMES.map(n => srcs[n]).join('\n')}\nreturn { ${NAMES.join(', ')} };`)(() => new Date());
}

let failures = 0;
function check(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) console.log(`✓ ${name}`);
  else { console.log(`✗ FAIL: ${name} — expected ${w}, got ${g}`); failures++; }
}

// UAT C: 9 Nov 2026, 4 × 1wk → ends 6 Dec.
const C = { id: 'C', start: '2026-11-09', weeks: 4, weeksPerMeso: 1 };
const g = (macroId, s, e) => ({ macroId, startDate: s, endDate: e });

function suite(srcs) {
  const before = failures;
  const { macroGoalCoverage, describeUncovered } = load(srcs);
  check('no goals: all 28 days, from the cycle start',
    macroGoalCoverage(C, []), { end: '2026-12-06', uncoveredDays: 28, firstUncovered: '2026-11-09' });
  check('one 2-week goal: 14 days left, from 23 Nov',
    macroGoalCoverage(C, [g('C', '2026-11-09', '2026-11-22')]), { end: '2026-12-06', uncoveredDays: 14, firstUncovered: '2026-11-23' });
  check('fully covered: nothing left, chain stops',
    macroGoalCoverage(C, [g('C', '2026-11-09', '2026-11-22'), g('C', '2026-11-23', '2026-12-06')]).uncoveredDays, 0);
  check('a gap in the middle is found first',
    macroGoalCoverage(C, [g('C', '2026-11-09', '2026-11-15'), g('C', '2026-11-23', '2026-12-06')]).firstUncovered, '2026-11-16');
  check('a goal running past the cycle end still ends the chain',
    macroGoalCoverage(C, [g('C', '2026-11-09', '2026-12-20')]).uncoveredDays, 0);
  check('days held by ANOTHER cycle\'s goal count as covered (no endless chain)',
    macroGoalCoverage(C, [g('B', '2026-11-02', '2026-11-15'), g('C', '2026-11-16', '2026-12-06')]).uncoveredDays, 0);
  check('describeUncovered: 14 → "2 weeks", 7 → "1 week", 10 → "10 days", 1 → "1 day"',
    [14, 7, 10, 1].map(describeUncovered), ['2 weeks', '1 week', '10 days', '1 day']);
  return failures - before;
}

console.log('— Real code —');
suite(sources);

// New Macrocycle clears its free-text fields on open.
const nameCleared = /if \(id === 'modal-macro'\) \{[\s\S]{0,400}macro-name-input'\)\.value = ''[\s\S]{0,120}macro-goal-input'\)\.value = ''/.test(source);
check('New Macrocycle clears the name and goal text on open', nameCleared, true);

// ── Control: counting only this cycle's goals must fail ──────────────────
const ownOnly = { ...sources, macroGoalCoverage: sources.macroGoalCoverage.replace('goals.some(g => g.startDate', 'goals.some(g => g.macroId === macro.id && g.startDate') };
const realFailures = failures;
const log = console.log; console.log = () => {};
const controlFailures = suite(ownOnly);
console.log = log;
failures = realFailures;
if (ownOnly.macroGoalCoverage === sources.macroGoalCoverage) {
  console.log('✗ FAIL: control could not narrow coverage to own-cycle goals — the line changed; update the control');
  failures++;
} else if (controlFailures === 0) {
  console.log('✗ FAIL: control — counting only this cycle\'s goals still passed');
  failures++;
} else {
  console.log(`✓ control: own-cycle-only coverage fails ${controlFailures} check(s), as it should`);
}

if (failures) { console.log(`\n✗ ${failures} failure(s)`); process.exit(1); }
console.log('\nAll checks passed.');
