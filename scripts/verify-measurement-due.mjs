#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-measurement-due.mjs
//
// THE RULE THIS PROTECTS (v8.20, Adam 2026-09-27): waist/hip measurements are
// due on DAY 1 OF EVERY MACROCYCLE, then EVERY 7 DAYS from the last log. It
// replaced a flat "4 days since the last log" rule.
//
// 🚨 The plausible wrong version: "due if 7+ days have passed OR today is a
// cycle's first day". It clears the Due tag on day 2 whether or not anything
// was logged, and it lets a log from the Friday before a Monday start count
// as that cycle's baseline. Day 1 must be compared as a DATE against the last
// log — a measurement only satisfies a cycle if it is on or after its start.
//
// 🚨 getMeasurementStatus() is the only copy of this rule. The push reminders
// (PROMPT-02) upload its nextDueDate and the server just compares dates, so
// a second copy anywhere (SQL included) is how the tag and the push drift.
//
// It extracts the REAL getMeasurementStatus() out of index.html. A control at
// the end reproduces the old 4-day rule and proves the suite can fail.
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

const fnSrc = extract('function getMeasurementStatus(');
if (!fnSrc) {
  console.error('✗ FAIL: getMeasurementStatus() not found in index.html.');
  console.error('  Re-point this script at whatever now decides when measurements are due.');
  process.exit(1);
}
const getMeasurementStatus = new Function(`${fnSrc}; return getMeasurementStatus;`)();

const meas = (...dates) => dates.map(date => ({ date, waist: 34, hip: 40 }));
// Cycle A: Mon 7 Sep 2026 for 4 weeks. Cycle B: Mon 5 Oct 2026.
const CYCLES = [{ id: 'A', start: '2026-09-07', weeks: 4 }, { id: 'B', start: '2026-10-05', weeks: 4 }];
const status = (logs, today, cycles = CYCLES) => getMeasurementStatus(logs, cycles, today);

// ── Never logged ─────────────────────────────────────────────────────────
check('never logged → due today', status([], '2026-09-10').due, true);
check('weight-only logs do not count as measurements',
  status([{ date: '2026-09-09', weight: 180 }], '2026-09-10').due, true);
check('a hip-only log counts', status([{ date: '2026-09-09', hip: 40 }], '2026-09-10').due, false);

// ── Every 7 days from the last log ───────────────────────────────────────
check('last log Tue 8 Sep, today Mon 14 Sep (6 days) → not due', status(meas('2026-09-08'), '2026-09-14').due, false);
check('last log Tue 8 Sep, today Tue 15 Sep (7 days) → due', status(meas('2026-09-08'), '2026-09-15').due, true);
check('next due is last log + 7', status(meas('2026-09-08'), '2026-09-10').nextDueDate, '2026-09-15');
check('stays due until a fresh log (day 12)', status(meas('2026-09-08'), '2026-09-20').due, true);
check('a fresh log clears it and restarts the 7 days',
  status(meas('2026-09-08', '2026-09-20'), '2026-09-21').nextDueDate, '2026-09-27');
check('the 4-day mark is no longer due', status(meas('2026-09-08'), '2026-09-12').due, false);
check('unsorted logs: the latest date wins', status(meas('2026-09-20', '2026-09-08'), '2026-09-21').lastDate, '2026-09-20');

// ── Day 1 of every macrocycle is forced ──────────────────────────────────
check('log Fri 2 Oct, cycle B starts Mon 5 Oct → due on day 1', status(meas('2026-10-02'), '2026-10-05').due, true);
check('…and nextDueDate is the cycle start, not last + 7', status(meas('2026-10-02'), '2026-10-03').nextDueDate, '2026-10-05');
check('…and not due the day before it starts', status(meas('2026-10-02'), '2026-10-04').due, false);
check('…still due on day 2 if day 1 passed with no log', status(meas('2026-10-02'), '2026-10-06').due, true);
check('logged ON day 1 → satisfied; next due day 8', status(meas('2026-10-05'), '2026-10-06').nextDueDate, '2026-10-12');
check('logged on day 1 → not due on day 7', status(meas('2026-10-05'), '2026-10-11').due, false);
check('a cycle starting 7+ days after the log does not pull the date earlier',
  status(meas('2026-09-21'), '2026-09-22').nextDueDate, '2026-09-28');
check('a cycle starting BEFORE the last log is ignored',
  status(meas('2026-09-08'), '2026-09-09').nextDueDate, '2026-09-15');
check('outside any cycle, only the 7-day rule applies',
  status(meas('2026-12-01'), '2026-12-08', []).due, true);
check('missing/blank cycle starts are ignored',
  status(meas('2026-10-02'), '2026-10-03', [{ id: 'X' }, null, { start: '' }]).nextDueDate, '2026-10-09');

// ── BST/GMT: the +7 is calendar days, not 7 × 24h local ──────────────────
check('across the Oct clock change (25 Oct 2026): 22 Oct + 7 = 29 Oct',
  status(meas('2026-10-22'), '2026-10-23', []).nextDueDate, '2026-10-29');
check('across the Mar clock change (28 Mar 2027): 25 Mar + 7 = 1 Apr',
  status(meas('2027-03-25'), '2027-03-26', []).nextDueDate, '2027-04-01');
check('across a month and year end: 28 Dec + 7 = 4 Jan',
  status(meas('2026-12-28'), '2026-12-29', []).nextDueDate, '2027-01-04');

// ── Wiring: Home's Due tag reads this function, and the old rule is gone ──
const home = extract('function renderHomeLogBoxes(');
check('renderHomeLogBoxes() takes measDue from getMeasurementStatus()',
  /const measDue = getMeasurementStatus\(/.test(home || ''), true);
const codeOnly = source.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
check('no `daysSinceMeas >= 4` left in index.html code (comments excepted)', /daysSinceMeas\s*>=\s*4/.test(codeOnly), false);

// ── CONTROL: the old 4-day rule must fail this suite ─────────────────────
function oldRule(logs, cycles, today) {
  const d = logs.filter(l => l.waist || l.hip).map(l => l.date).sort().pop();
  const days = d ? Math.floor((new Date(today + 'T00:00:00') - new Date(d + 'T00:00:00')) / 86400000) : Infinity;
  return { due: days >= 4 };
}
const controlCatches = [
  oldRule(meas('2026-09-08'), CYCLES, '2026-09-12').due !== false,    // old: due at 4 days
  oldRule(meas('2026-10-03'), CYCLES, '2026-10-05').due !== true,     // old: not due on day 1 after a Sat log
].filter(Boolean).length;
check('CONTROL: the old 4-day rule is caught by at least two cases', controlCatches >= 2, true);

console.log(failures ? `\n✗ ${failures} check(s) failed` : '\nALL CHECKS PASS');
process.exit(failures ? 1 : 0);
