#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-new-goal-default-dates.mjs
//
// THE BEHAVIOUR THIS PROTECTS (v8.19, TECHNICAL §97): a brand-new goal
// period's default dates.
//
//   • A cycle's FIRST goal starts on the cycle's own start date, and ends on
//     the Sunday of that week.
//   • Later goals start the day after the latest goal (any cycle) and also
//     end on the Sunday of their start's week.
//
// Before v8.19 the end date defaulted to the START date (a one-day goal), and
// the start came from the latest goal across every cycle even for a cycle's
// first goal — which only matched the cycle start when cycles ran back to
// back. A cycle pushed two weeks later got a first goal two weeks early.
// Nothing flags either: the sheet just opens on plausible-looking dates.
//
// Extracts the REAL functions from index.html. A control restores `end = start`
// and asserts the suite then FAILS.
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

const NAMES = ['toLocalDateStr', 'sundayOfWeek', 'defaultNewGoalDates'];
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
  return new Function(`${NAMES.map(n => srcs[n]).join('\n')}\nreturn { ${NAMES.join(', ')} };`)();
}

let failures = 0;
function check(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) console.log(`✓ ${name}`);
  else { console.log(`✗ FAIL: ${name} — expected ${w}, got ${g}`); failures++; }
}

const A = { id: 'A', start: '2026-06-08' };
const B = { id: 'B', start: '2026-10-19' };   // pushed 5 weeks after A's last goal
const goalsA = [
  { macroId: 'A', startDate: '2026-06-08', endDate: '2026-07-12' },
  { macroId: 'A', startDate: '2026-07-13', endDate: '2026-09-13' },
];

function suite(srcs) {
  const before = failures;
  const { sundayOfWeek, defaultNewGoalDates } = load(srcs);
  check('sundayOfWeek: Monday → that Sunday', sundayOfWeek('2026-10-19'), '2026-10-25');
  check('sundayOfWeek: Wednesday → that Sunday', sundayOfWeek('2026-10-21'), '2026-10-25');
  check('sundayOfWeek: a Sunday is its own week\'s end', sundayOfWeek('2026-10-25'), '2026-10-25');
  check('sundayOfWeek across BST→GMT (25 Oct 2026)', sundayOfWeek('2026-10-24'), '2026-10-25');

  check('first goal of a cycle pushed later: cycle start → Sunday of that week',
    defaultNewGoalDates(B, goalsA, '2026-09-26'), { start: '2026-10-19', end: '2026-10-25' });
  check('first goal of a brand-new cycle with no goals anywhere',
    defaultNewGoalDates(B, [], '2026-09-26'), { start: '2026-10-19', end: '2026-10-25' });
  check('a later goal: day after the latest goal → Sunday of that week',
    defaultNewGoalDates(A, goalsA, '2026-09-26'), { start: '2026-09-14', end: '2026-09-20' });
  check('no macro and no goals: today → Sunday of this week',
    defaultNewGoalDates(undefined, [], '2026-09-23'), { start: '2026-09-23', end: '2026-09-27' });
  return failures - before;
}

console.log('— Real code —');
suite(sources);

// ── Control: the pre-v8.19 one-day default must make the suite fail ──────
const oldDefault = { ...sources, defaultNewGoalDates: sources.defaultNewGoalDates.replace('end: sundayOfWeek(start)', 'end: start') };
const realFailures = failures;
const log = console.log; console.log = () => {};
const controlFailures = suite(oldDefault);
console.log = log;
failures = realFailures;
if (oldDefault.defaultNewGoalDates === sources.defaultNewGoalDates) {
  console.log('✗ FAIL: control could not restore end = start — the line changed; update the control');
  failures++;
} else if (controlFailures === 0) {
  console.log('✗ FAIL: control — with end = start the suite still passed');
  failures++;
} else {
  console.log(`✓ control: the pre-v8.19 one-day default fails ${controlFailures} check(s), as it should`);
}

if (failures) { console.log(`\n✗ ${failures} failure(s)`); process.exit(1); }
console.log('\nAll checks passed.');
