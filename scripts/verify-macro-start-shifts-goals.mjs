#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-macro-start-shifts-goals.mjs
//
// THE FEATURE THIS PROTECTS (v8.19, TECHNICAL §96): changing a macrocycle's
// start date offers to move every one of its goal periods by the same number
// of days, in one save.
//
// Before v8.19 a cycle pushed two weeks later left all its goals on the old
// dates, and each had to be re-dated by hand, last to first, because every
// single-goal save is checked for overlap against the goals not yet moved.
//
// 🚨 The failures this catches are the silent ones:
//   • a goal moved by a different amount from the cycle (gaps change, or two
//     goals in the same cycle end up overlapping) — nothing on screen says so;
//   • a move that lands on a goal in ANOTHER macrocycle and is saved anyway —
//     it breaks the never-overlap rule findOverlappingGoal enforces on every
//     other path;
//   • a date step that loses a day across the BST→GMT change (run under
//     TZ=Europe/London, as the sweep does);
//   • "Save cycle only" still moving goals.
//
// It extracts the REAL functions out of index.html and runs them against
// stubs. A control strips the clash check and asserts the suite then FAILS.
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

const NAMES = ['toLocalDateStr', 'getMacroDurationWeeks', 'getMacroEndDate', 'shiftDateStr', 'dayDiff', 'buildGoalShiftPlan', 'applyEditMacro'];
const sources = {};
for (const n of NAMES) {
  sources[n] = extract(`function ${n}(`);
  if (!sources[n]) {
    console.error(`✗ FAIL: ${n}() not found in index.html.`);
    console.error('  It was renamed or restructured. Update this script deliberately — do not delete the check.');
    process.exit(1);
  }
}

function load(srcs, state) {
  const calls = [];
  const scope = {
    state,
    now: () => new Date('2026-09-26T12:00:00'),
    save: () => calls.push('save'),
    closeModal: () => {},
    renderPlan: () => {},
    maybePromptCreateGoal: () => {},
  };
  const names = Object.keys(scope);
  // eslint-disable-next-line no-new-func
  const factory = new Function(...names, `${NAMES.map(n => srcs[n]).join('\n')}\nreturn { ${NAMES.join(', ')} };`);
  return { api: factory(...names.map(n => scope[n])), calls };
}

// Adam's shape: a new cycle, six goal periods back to back, then the NEXT
// cycle's first goal starting the Monday after this cycle ends.
// Cycle A: 2026-10-05 (Mon), 8 × 1wk = 8 weeks → ends 2026-11-29 (Sun).
function world() {
  const macroA = { id: 'A', name: 'Cut A', start: '2026-10-05', weeks: 8, weeksPerMeso: 1, days: [1, 2, 3] };
  const macroB = { id: 'B', name: 'Cut B', start: '2026-12-14', weeks: 4, weeksPerMeso: 1, days: [1, 2, 3] };
  const g = (macroId, id, s, e, label) => ({ macroId, macroGoalID: id, startDate: s, endDate: e, _blocLabel: label, kcal: 1800 });
  return {
    macrocycles: [macroA, macroB],
    goals: [
      g('A', 'A1', '2026-10-05', '2026-10-11', 'Step 1'),
      g('A', 'A2', '2026-10-12', '2026-10-25', 'Step 2'),  // crosses BST→GMT (25 Oct)
      g('A', 'A3', '2026-10-26', '2026-11-08', 'Step 3'),
      g('A', 'A4', '2026-11-09', '2026-11-15', 'Step 4'),
      g('A', 'A5', '2026-11-16', '2026-11-22', 'Step 5'),
      g('A', 'A6', '2026-11-23', '2026-11-29', 'Step 6'),
      g('B', 'B1', '2026-12-14', '2026-12-27', 'Step 1 - B'),
    ],
  };
}
const edits = (over) => ({ name: 'Cut A', weeks: 8, start: '2026-10-05', goal: '', targetBw: null, goalType: 'loss', weightIncrement: '2.5', weeksPerMeso: 1, ...over });

let failures = 0;
function check(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) console.log(`✓ ${name}`);
  else { console.log(`✗ FAIL: ${name} — expected ${w}, got ${g}`); failures++; }
}

function suite(srcs) {
  const before = failures;
  const run = (over, today = '2026-09-26', mutate) => {
    const s = world();
    if (mutate) mutate(s);
    const { api } = load(srcs, s);
    return { s, api, plan: api.buildGoalShiftPlan(s.macrocycles[0], edits(over), s.goals, today) };
  };

  // 1. The reported case: push the cycle two weeks later.
  let { s, api, plan } = run({ start: '2026-10-19' });
  check('push +2 weeks: delta is 14 days', plan.deltaDays, 14);
  check('…cycle dates old → new', [plan.oldStart, plan.oldEnd, plan.newStart, plan.newEnd], ['2026-10-05', '2026-11-29', '2026-10-19', '2026-12-13']);
  check('…every goal moves exactly 14 days, across the BST change',
    plan.rows.map(r => [r.newStart, r.newEnd]),
    [['2026-10-19', '2026-10-25'], ['2026-10-26', '2026-11-08'], ['2026-11-09', '2026-11-22'], ['2026-11-23', '2026-11-29'], ['2026-11-30', '2026-12-06'], ['2026-12-07', '2026-12-13']]);
  check('…nothing out of range, no clash, not started', [plan.outOfRange.length, plan.clashes.length, plan.started], [0, 0, false]);
  api.applyEditMacro('A', edits({ start: '2026-10-19' }), plan);
  check('…"Move goals & save" writes the new dates and the new start',
    [s.macrocycles[0].start, s.goals.find(g => g.macroGoalID === 'A6').endDate, s.goals.find(g => g.macroGoalID === 'B1').startDate],
    ['2026-10-19', '2026-12-13', '2026-12-14']);

  // 2. "Save cycle only" moves the cycle and leaves every goal alone.
  ({ s, api, plan } = run({ start: '2026-10-19' }));
  api.applyEditMacro('A', edits({ start: '2026-10-19' }), null);
  check('"Save cycle only": start saved, goals untouched',
    [s.macrocycles[0].start, s.goals.map(g => g.startDate).join(',')],
    ['2026-10-19', world().goals.map(g => g.startDate).join(',')]);

  // 3. Three weeks later runs Step 6 into cycle B's first goal → blocked.
  ({ plan } = run({ start: '2026-10-26' }));
  check('push +3 weeks onto the next cycle\'s goal: clash found on Step 6 only',
    plan.clashes.map(r => [r.macroGoalID, r.clash.macroGoalID]), [['A6', 'B1']]);

  // 4. Move and shorten in one edit: goals past the new end are flagged, by how long.
  ({ plan } = run({ start: '2026-10-19', weeks: 7 }));
  check('move + shorten to 7 weeks: new end 2026-12-06', plan.newEnd, '2026-12-06');
  check('…Step 6 flagged 7 days past the end, nothing else',
    plan.outOfRange.map(r => [r.macroGoalID, r.daysPastEnd, r.daysBeforeStart]), [['A6', 7, 0]]);

  // 5. Earlier, not later.
  ({ plan } = run({ start: '2026-09-28' }));
  check('move 1 week earlier: delta −7, Step 1 → 28 Sep', [plan.deltaDays, plan.rows[0].newStart], [-7, '2026-09-28']);

  // 6. A cycle that has already started is flagged.
  ({ plan } = run({ start: '2026-10-19' }, '2026-10-07'));
  check('cycle already started → started flag', plan.started, true);

  // 7. Nothing to offer.
  ({ plan } = run({}));
  check('start unchanged → no sheet', plan, null);
  ({ plan } = run({ start: '2026-10-19' }, '2026-09-26', w => { w.goals = w.goals.filter(g => g.macroId !== 'A'); }));
  check('cycle has no goals → no sheet', plan, null);

  return failures - before;
}

console.log('— Real code —');
suite(sources);

// ── Control: without the clash check, the suite must fail ────────────────
const noClash = { ...sources, buildGoalShiftPlan: sources.buildGoalShiftPlan.replace(/const clash = [^;]+;/, 'const clash = null;') };
const realFailures = failures;
const log = console.log; console.log = () => {};
const controlFailures = suite(noClash);
console.log = log;
failures = realFailures;
if (noClash.buildGoalShiftPlan === sources.buildGoalShiftPlan) {
  console.log('✗ FAIL: control could not remove the clash check — its line changed; update the control');
  failures++;
} else if (controlFailures === 0) {
  console.log('✗ FAIL: control — with the clash check removed the suite still passed');
  failures++;
} else {
  console.log(`✓ control: removing the clash check fails ${controlFailures} check(s), as it should`);
}

if (failures) { console.log(`\n✗ ${failures} failure(s)`); process.exit(1); }
console.log('\nAll checks passed.');
