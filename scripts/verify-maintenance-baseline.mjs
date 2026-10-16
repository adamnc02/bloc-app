#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-maintenance-baseline.mjs
//
// WHAT IT PROTECTS (v8.60, TECHNICAL §175): a maintenance cycle has no goal
// weight. Its reference is the BASELINE, the average of the weigh-ins in the
// cycle's first 7 days, and stability compares a complete week's average with
// it.
//
// The bug it prevents: the old status line compared the LATEST SINGLE
// weigh-in with a goal weight typed at creation. One high-carb day's water
// (3–6 lbs) read as "Slipping" on a week whose average had not moved, and the
// goal weight was a number nobody chose, because the goal of maintenance is
// the weight you came in at.
//
// 🚨 THE TRAPS:
//   · The baseline is derived, never stored: a cycle made ahead of its start
//     has no weigh-in, and BLOC and Coach would both write it. The 7-day
//     window is what fixes it, so a weigh-in on day 8 can't move it.
//   · Loss and gain cycles keep targetBw as the user's input. Only maintenance
//     ignores it (an older maintenance cycle may still carry one).
//   · Stability waits for a COMPLETE week after week 1 (2+ weigh-ins), and
//     reads its average, so one heavy day can't flip it.
//
// Runs the built engine (engine/dist/bloc-engine.js) on synthetic logs.
// CONTROL: the old rule (latest weigh-in against a goal weight) reads the
// same week as "Slipping".
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const E = vm.runInNewContext(`${readFileSync(join(repo, 'engine', 'dist', 'bloc-engine.js'), 'utf8')}\n;BlocEngine`, {});

let failures = 0;
function check(label, ok, detail) {
  if (ok) console.log('✓ ' + label);
  else { failures++; console.log('✗ ' + label + (detail ? `\n    ${detail}` : '')); }
}

// A maintenance cycle from Monday 5 Oct 2026, 2 × 2-week mesocycles (to 1 Nov).
const macro = { id: 'm', start: '2026-10-05', weeks: 2, weeksPerMeso: 2, goalType: 'maintenance', targetBw: 190 };
const day = n => E.shiftDateStr('2026-10-05', n - 1);
// Week 1: a high first reading, then lower: avg 184.6. Week 2: level, with one
// water day at 189.0. Week 3: 2.6 lbs down.
const W1 = [186.3, 184.5, 183.0, 184.0, 185.1, 184.6, 184.7];
const W2 = [184.4, 184.9, 189.0, 184.2, 184.0, 184.3, 184.5];
const W3 = [182.1, 182.0, 181.9, 182.0, 182.2, 181.8, 182.0];
const logs = [...W1, ...W2, ...W3].map((w, i) => ({ date: day(i + 1), weight: w }));
const st = (upTo, extra = []) => ({ bodyLogs: [...logs.filter(l => l.date <= upTo), ...extra], macrocycles: [macro] });
const avg = a => Math.round(a.reduce((x, y) => x + y, 0) / a.length * 10) / 10;

console.log('— The baseline —');
check('no weigh-in yet: no baseline', E.getMaintenanceBaseline(st('2026-10-04'), macro, { today: '2026-10-04' }) === null);
let b = E.getMaintenanceBaseline(st(day(1)), macro, { today: day(1) });
check('day 1: the one weigh-in, provisional', b && b.lbs === 186.3 && b.days === 1 && !b.locked, JSON.stringify(b));
b = E.getMaintenanceBaseline(st(day(3)), macro, { today: day(3) });
check('day 3: the average of 3', b && b.lbs === avg(W1.slice(0, 3)) && b.days === 3 && !b.locked, JSON.stringify(b));
b = E.getMaintenanceBaseline(st(day(7)), macro, { today: day(7) });
check(`day 7: week 1's average, ${avg(W1)}, still open`, b && b.lbs === avg(W1) && b.days === 7 && !b.locked, JSON.stringify(b));
b = E.getMaintenanceBaseline(st(day(8)), macro, { today: day(8) });
check('day 8: fixed, and day 8\'s weigh-in is not in it', b && b.lbs === avg(W1) && b.locked, JSON.stringify(b));
b = E.getMaintenanceBaseline(st(day(21)), macro, { today: day(21) });
check('day 21: unchanged', b && b.lbs === avg(W1) && b.locked);
check('the reference weight of a maintenance cycle is the baseline, not its old targetBw (190)',
  E.getCycleReferenceLbs(st(day(21)), macro, { today: day(21) }) === avg(W1));
const cut = { ...macro, goalType: 'loss', targetBw: 175 };
check('a cut has no baseline', E.getMaintenanceBaseline(st(day(21)), cut, { today: day(21) }) === null);
check('a cut\'s reference weight is its own targetBw', E.getCycleReferenceLbs(st(day(21)), cut, { today: day(21) }) === 175);
check('a gain cycle\'s reference weight is its own targetBw', E.getCycleReferenceLbs(st(day(21)), { ...cut, goalType: 'gain', targetBw: 200 }, { today: day(21) }) === 200);

console.log('\n— Stability —');
let s = E.judgeMaintenanceStability(st(day(5)), macro, { today: day(5) });
check('in week 1: forming', s && s.state === 'forming' && s.week === null, JSON.stringify(s && s.state));
s = E.judgeMaintenanceStability(st(day(14)), macro, { today: day(14) });
check('on week 2\'s Sunday: still forming (week 2 is not complete until it ends)', s && s.state === 'forming');
s = E.judgeMaintenanceStability(st(day(15)), macro, { today: day(15) });
check(`after week 2: stable — its average ${avg(W2)} is within 2 lbs of ${avg(W1)}, the 189.0 water day notwithstanding`,
  s && s.state === 'stable' && s.week.n === 2 && s.week.lbs === avg(W2), JSON.stringify(s && { state: s.state, week: s.week }));
check('…and the reason names the week, its average and the baseline', s && /Week 2 averaged/.test(s.reason) && s.reason.includes(String(avg(W1))), s && s.reason);
s = E.judgeMaintenanceStability(st(day(22)), macro, { today: day(22) });
check(`after week 3: slipping — ${avg(W3)} is ${(avg(W1) - avg(W3)).toFixed(1)} lbs below`, s && s.state === 'slipping' && s.week.n === 3 && s.diff === Math.round((avg(W3) - avg(W1)) * 10) / 10, JSON.stringify(s && { state: s.state, diff: s.diff }));
const heavy = Array.from({ length: 7 }, (_, i) => ({ date: day(15 + i), weight: 191 }));
s = E.judgeMaintenanceStability({ bodyLogs: [...logs.filter(l => l.date <= day(14)), ...heavy], macrocycles: [macro] }, macro, { today: day(22) });
check('a week 6.4 lbs above: drifting', s && s.state === 'drifting', s && s.state);
const thin = [{ date: day(16), weight: 191 }];
s = E.judgeMaintenanceStability({ bodyLogs: [...logs.filter(l => l.date <= day(14)), ...thin], macrocycles: [macro] }, macro, { today: day(22) });
check('a week with one weigh-in is not judged: week 2 still is', s && s.week && s.week.n === 2 && s.state === 'stable', JSON.stringify(s && s.week));
check('not a maintenance cycle: no judgement', E.judgeMaintenanceStability(st(day(22)), cut, { today: day(22) }) === null);

console.log('\n— The insights card says the same —');
const nut = Array.from({ length: 21 }, (_, i) => ({ date: day(i + 1), kcal: 2400, protein: 180, carbs: 250, fats: 80 }));
const full = { bodyLogs: logs, nutritionLogs: nut, macrocycles: [macro], goals: [], profile: {} };
// The insights need two weeks after their own baseline window, so week 3.
const ins = E.computeWeeklyInsights(full, { today: day(22) }, macro);
check('computeWeeklyInsights after week 3: maint-unstable, the same "slipping" judgement and its reason',
  ins && ins.signal === 'maint-unstable' && ins.maintStability && ins.maintStability.state === 'slipping' && ins.detail.startsWith(ins.maintStability.reason),
  JSON.stringify(ins && { signal: ins.signal, headline: ins.headline }));
const insCut = E.computeWeeklyInsights({ ...full, macrocycles: [cut] }, { today: day(15) }, cut);
check('a cut\'s insights carry no maintStability key', insCut && !('maintStability' in insCut));

console.log('\n— Control: the old rule —');
// v8.59: |latest single weigh-in − targetBw|, ≤2 Stable, >5 Drifting, else Slipping.
const oldRule = (latest, target) => { const d = Math.abs(latest - target); return d <= 2 ? 'Stable' : d > 5 ? 'Drifting' : 'Slipping'; };
check('control: on the water day (189.0) against a goal weight of 186, the old rule reads "Slipping"', oldRule(189.0, 186) === 'Slipping');
check('control: and the same week averaged, against the baseline, is stable', E.judgeMaintenanceStability(st(day(15)), macro, { today: day(15) }).state === 'stable');

console.log(failures ? `\nFAIL: ${failures} check(s)` : '\nAll checks pass.');
process.exit(failures ? 1 : 0);
