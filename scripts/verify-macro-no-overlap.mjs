#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-macro-no-overlap.mjs
//
// THE RULE THIS PROTECTS (v8.19, TECHNICAL §99): macrocycles never overlap.
//
// Before v8.19 nothing checked it. Found in UAT 2026-09-26: moving UAT B three
// weeks later ran it a week into UAT C; only the goal-period clash showed.
//
// Covers the pure planning behind the four-option clash sheet and the
// goal-fit sheet:
//   • findMacroClash — including the boundary: a cycle ending the Sunday before
//     the next one's Monday is NOT a clash;
//   • planMacroClash — fit (start earlier, end the day before), cut (fewer
//     mesocycles), both (a Monday in between + cut), and the 'previous'
//     direction, where cutting cannot help and is not offered;
//   • layoutGoalFit — back-to-back goals from the cycle start, 0 = deleted,
//     ok only when the total is exactly the cycle length.
//
// Real functions, extracted from index.html. The control widens the overlap
// test by a day (so touching cycles count as clashing) and asserts failure.
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

const NAMES = ['toLocalDateStr', 'getMacroDurationWeeks', 'getMacroEndDate', 'shiftDateStr', 'dayDiff', 'snapToNextMonday',
  'macroRange', 'findMacroClash', 'firstFreeMacroStart', 'mesosThatFit', 'planMacroClash', 'layoutGoalFit'];
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

// The UAT shape: B 14 Sep (8 wk → 8 Nov), C 23 Nov (4 wk → 20 Dec), D 21 Dec (6 wk → 31 Jan).
const mk = (id, start, weeks, weeksPerMeso = 1) => ({ id, name: id, start, weeks, weeksPerMeso });
const B = mk('B', '2026-09-14', 8), C = mk('C', '2026-11-23', 4), D = mk('D', '2026-12-21', 6);
const macros = [B, C, D];

function suite(srcs) {
  const before = failures;
  const f = load(srcs);

  check('C and D touch (20 Dec / 21 Dec) — not a clash', f.findMacroClash(D, macros, 'D'), null);
  check('B moved to 5 Oct runs into C', (f.findMacroClash({ ...B, start: '2026-10-05' }, macros, 'B') || {}).id, 'C');

  // 1-week overlap
  let p = f.planMacroClash(B, { start: '2026-10-05' }, macros);
  check('+3 wk: overlap 7 days, direction next', [p.overlapDays, p.direction], [7, 'next']);
  check('…fit: start 28 Sep, end 22 Nov (day before C)', p.fit, { start: '2026-09-28', end: '2026-11-22' });
  check('…cut: keep 5 Oct, 7 mesocycles, end 22 Nov', [p.cut.start, p.cut.weeks, p.cut.end], ['2026-10-05', 7, '2026-11-22']);
  check('…both: nothing in between', p.both.length, 0);

  // 3-week overlap
  p = f.planMacroClash(B, { start: '2026-10-19' }, macros);
  check('+5 wk: overlap 21 days', p.overlapDays, 21);
  check('…cut: 5 mesocycles', p.cut.weeks, 5);
  check('…both: 5 Oct → 7, 12 Oct → 6, all ending 22 Nov',
    p.both.map(o => [o.start, o.weeks, o.end]), [['2026-10-05', 7, '2026-11-22'], ['2026-10-12', 6, '2026-11-22']]);

  // 2-week mesocycles: cutting rounds to whole mesocycles, may leave a gap
  const B2 = mk('B', '2026-09-14', 4, 2);   // 8 weeks → 8 Nov
  p = f.planMacroClash(B2, { start: '2026-10-05' }, [B2, C, D]);
  check('2-wk mesocycles, 1-wk overlap: cut 1 mesocycle (2 weeks), ends 15 Nov', [p.cut.weeks, p.cut.cutWeeks, p.cut.end], [3, 2, '2026-11-15']);

  // Moving earlier into the previous cycle
  p = f.planMacroClash(D, { start: '2026-12-14' }, macros);
  check('D a week earlier into C: direction previous, fit = 21 Dec, no cut',
    [p.direction, p.fit && p.fit.start, p.cut], ['previous', '2026-12-21', null]);

  // A cut that would leave < 2 mesocycles is not offered
  p = f.planMacroClash(mk('X', '2026-11-16', 3), { start: '2026-11-16' }, [...macros, mk('X', '2026-11-16', 3)]);
  check('cycle starting a week before C: cut would leave 1 mesocycle → not offered', p.cut, null);

  check('firstFreeMacroStart: 4 wk from 30 Nov → 1 Feb (after D)',
    f.firstFreeMacroStart({ id: null, weeks: 4, weeksPerMeso: 1 }, '2026-11-30', macros, null), '2027-02-01');

  // Goal fit: 5-week cycle from 19 Oct (ends 22 Nov)
  let l = f.layoutGoalFit('2026-10-19', '2026-11-22', 5, [5, 3], []);
  check('fit [5,3] in 5 wk: 3 over, second row over, not ok', [l.overBy, l.rows[1].status, l.ok], [3, 'over', false]);
  l = f.layoutGoalFit('2026-10-19', '2026-11-22', 5, [3, 2], []);
  check('fit [3,2]: back to back, ok', [l.rows.map(r => [r.start, r.end]), l.ok], [[['2026-10-19', '2026-11-08'], ['2026-11-09', '2026-11-22']], true]);
  l = f.layoutGoalFit('2026-10-19', '2026-11-22', 5, [3, 0], []);
  check('fit [3,0]: second deleted, 2 short, first flagged gap', [l.rows[1].status, l.shortBy, l.rows[0].status, l.ok], ['deleted', 2, 'gap', false]);
  l = f.layoutGoalFit('2026-10-19', '2026-11-22', 5, [0, 5], []);
  check('fit [0,5]: goal 2 becomes the anchored one, ok', [l.rows[1].start, l.ok], ['2026-10-19', true]);
  l = f.layoutGoalFit('2026-10-19', '2026-11-22', 5, [0, 0], []);
  check('fit [0,0]: nothing kept → not ok', l.ok, false);
  l = f.layoutGoalFit('2026-10-19', '2026-11-22', 5, [5], [{ startDate: '2026-11-16', endDate: '2026-11-29' }]);
  check('another cycle\'s goal inside the range → clash, not ok', [l.rows[0].status, l.ok], ['clash', false]);
  return failures - before;
}

console.log('— Real code —');
suite(sources);

// ── Control: count touching cycles as overlapping → must fail ────────────
const wide = { ...sources, findMacroClash: sources.findMacroClash.replace('o.end >= r.start', 'shiftDateStr(o.end, 1) >= r.start') };
const realFailures = failures;
const log = console.log; console.log = () => {};
const controlFailures = suite(wide);
console.log = log;
failures = realFailures;
if (wide.findMacroClash === sources.findMacroClash) {
  console.log('✗ FAIL: control could not widen the overlap test — the line changed; update the control');
  failures++;
} else if (controlFailures === 0) {
  console.log('✗ FAIL: control — treating touching cycles as clashing still passed');
  failures++;
} else {
  console.log(`✓ control: treating touching cycles as clashing fails ${controlFailures} check(s), as it should`);
}

if (failures) { console.log(`\n✗ ${failures} failure(s)`); process.exit(1); }
console.log('\nAll checks passed.');
