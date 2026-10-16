#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-maintenance-recalibration.mjs
//
// WHAT IT PROTECTS (v8.60, TECHNICAL §175): the maintenance recalibration.
//
// The bug it prevents: on a maintenance bridge climbing out of a deficit,
// the old recalibration offered ~3,550 kcal for EVERY remaining goal. It took
// the latest week's average intake, which was an unfinished week (Mon–Fri),
// and added 500 kcal/day for each pound that one week's average had dropped,
// mostly water. It fired off one week's change, compared the result with the
// CURRENT RAMP STEP (below maintenance on purpose), and wrote one kcal into
// every remaining goal, flattening the climb.
//
// 🚨 THE TRAPS:
//   · Complete weeks only (ended before today), 2 to 4 of them, with the
//     least-squares trend across them. Never a part-week, never one delta.
//   · Compared with the HOLD's kcal, never the current step.
//   · The hold is the goals marked hold: true, else the trailing goals at the
//     cycle's final kcal.
//   · The climb starts at min(average intake, estimate): someone already
//     eating at the new hold gets it from Monday, with no climb.
//   · Two plans: 'step' (+125 a week, then the cycle's own hold length,
//     extending by whole weeks when it must, refused when that would overlap
//     the next cycle) and 'schedule' (the hold keeps its start; the gap is
//     divided evenly over the weeks before it). Earlier goals never change;
//     the running one ends on the Sunday before.
//
// Runs the built engine on synthetic logs shaped like the case that found it.
// CONTROL: the v8.59 formula on the same logs gives the inflated figure.
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

// A 10-week maintenance bridge from Monday 7 Sep 2026 (to Sun 15 Nov): a
// climb 1,600 → 1,700 → 1,800, then a 5-week hold at 1,900 (12 Oct – 15 Nov).
const START = '2026-09-07';
const day = n => E.shiftDateStr(START, n - 1);
const macro = { id: 'mx', name: 'Bridge', start: START, weeks: 5, weeksPerMeso: 2, goalType: 'maintenance' };
const goal = (id, s, e, kcal, extra = {}) => ({ macroId: 'mx', macroGoalID: id, startDate: s, endDate: e, kcal, protein: 180, carbs: 150, fats: 40, steps: 8000, _blocLabel: id, ...extra });
const GOALS = [
  goal('g1', '2026-09-07', '2026-09-20', 1600),
  goal('g2', '2026-09-21', '2026-09-27', 1700),
  goal('g3', '2026-09-28', '2026-10-11', 1800),
  goal('g4', '2026-10-12', '2026-11-15', 1900, { protein: 190, carbs: 180, fats: 40 }),
];
// Weeks 1–2 at a level 180.0 lbs eating 2,200 then 2,700; week 3 (Mon–Fri
// so far) down to 178.6 on 2,850.
const W = [[2200, 180.0], [2700, 180.0], [2850, 178.6]];
const logs = { b: [], n: [] };
W.forEach(([k, w], wi) => { for (let d = 1; d <= 7; d++) { const date = day(wi * 7 + d); logs.b.push({ date, weight: w }); logs.n.push({ date, kcal: k, protein: 200, carbs: 250, fats: 80 }); } });
const state = (upTo, goals = GOALS, extra = {}) => ({
  bodyLogs: structuredClone(logs.b.filter(l => l.date <= upTo)), nutritionLogs: structuredClone(logs.n.filter(l => l.date <= upTo)),
  macrocycles: [macro, ...(extra.macros || [])], goals: structuredClone(goals), profile: {},
});
const FRI3 = day(19); // Friday of week 3
const recalOn = (s, today) => E.computeMaintenanceRecalibration(s, { today }, s.macrocycles[0], E.computeWeeklyInsights(s, { today }, s.macrocycles[0]));

console.log('— What it reads —');
const s3 = state(FRI3);
const r3 = recalOn(s3, FRI3);
check('Friday of week 3: weeks 1–2 only (week 3 is unfinished)', r3 && r3.weeksUsed.join() === 'W1,W2', JSON.stringify(r3 && r3.weeksUsed));
check('…estimate = their average intake, 2,450, weight level', r3 && r3.estimate === 2450 && r3.avgKcal === 2450 && r3.trendLbsPerWeek === 0, JSON.stringify(r3 && { e: r3.estimate, t: r3.trendLbsPerWeek }));
check('…compared with the hold (1,900), not the current step (1,800): +550', r3 && r3.hold.kcal === 1900 && r3.discrepancy === 550 && r3.hold.weeks === 5);
check('…the hold was found by the fallback (no flags yet)', r3 && r3.hold.flagged === false && r3.hold.start === '2026-10-12');
check('…takes effect from the next Monday', r3 && r3.effectiveFrom === day(22));
check('…the reason says what it rests on', r3 && /W1–W2 averaged 2,450 kcal\/day with weight level/.test(r3.reason) && /hold of 1,900/.test(r3.reason), r3 && r3.reason);

const MON4 = day(22);
const s4 = state(day(21));
const r4 = recalOn(s4, MON4);
check('Monday of week 4: weeks 1–3, with weight falling 0.7 lbs/week', r4 && r4.weeksUsed.join() === 'W1,W2,W3' && r4.trendLbsPerWeek === -0.7, JSON.stringify(r4 && { w: r4.weeksUsed, t: r4.trendLbsPerWeek }));
check('…estimate = 2,583 average + 0.7 × 500 = 2,933; climb starts at 2,583', r4 && r4.avgKcal === 2583 && r4.estimate === 2933 && r4.climbStart === 2583, JSON.stringify(r4 && { a: r4.avgKcal, e: r4.estimate }));

const near = state(FRI3, GOALS.map(g => g.macroGoalID === 'g4' ? { ...g, kcal: 2400 } : g));
check('an estimate within 150 kcal and 7% of the hold: nothing to recalibrate', recalOn(near, FRI3) === null);
check('one complete week only: nothing yet', recalOn(state(day(10)), day(10)) === null);
check('a cut: never', E.computeMaintenanceRecalibration(s3, { today: FRI3 }, { ...macro, goalType: 'loss' }, E.computeWeeklyInsights(s3, { today: FRI3 }, macro)) === null);
const flagged = state(FRI3, [...GOALS.slice(0, 3), { ...GOALS[3], kcal: 1900, hold: true }]);
check('a hold marked hold: true is found by its flag', recalOn(flagged, FRI3).hold.flagged === true);

console.log('\n— The plans —');
const plan = (s, today, r, c) => E.buildMaintenanceRecalibrationPlan(s, { today }, s.macrocycles[0], r, c);
let p = plan(s3, FRI3, r3, 'step');
check('already eating at the new hold: no climb, the hold from Monday (28 Sep) to the cycle end',
  p.climbWeeks === 0 && p.goals.length === 1 && p.goals[0].startDate === day(22) && p.goals[0].endDate === '2026-11-15' && p.goals[0].kcal === 2450 && p.goals[0].hold === true,
  JSON.stringify(p.goals.map(g => [g.startDate, g.endDate, g.kcal, g.hold])));
check('…the goals from that Monday on (g3, g4) are replaced; g1 and g2 are not touched', p.removeGoalIds.join() === 'g3,g4', p.removeGoalIds.join());
check('…no extension', p.extensionWeeks === null && !p.blocked);
const pS0 = plan(s3, FRI3, r3, 'schedule');
check('…and "on schedule" is the same: no climb weeks at the hold\'s kcal before its old start, the hold from Monday',
  pS0.climbWeeks === 0 && pS0.goals.length === 1 && pS0.goals[0].hold === true && pS0.goals[0].startDate === day(22),
  JSON.stringify(pS0.goals.map(g => [g.startDate, g.kcal, g.hold])));
check('…the protein of the goal it replaces on that date (g3: 180 g), and the hold\'s carbs:fat split (720:360 kcal)',
  p.goals[0].protein === 180 && Math.abs((p.goals[0].carbs * 4) / (p.goals[0].fats * 9) - 2) < 0.05, JSON.stringify(p.goals[0]));
// A goal running across that Monday is cut to the Sunday before, keeping its id.
const spanning = state(FRI3, [GOALS[0], goal('g2', '2026-09-21', '2026-10-04', 1700), goal('g3', '2026-10-05', '2026-10-11', 1800), GOALS[3]]);
const pT = plan(spanning, FRI3, recalOn(spanning, FRI3), 'step');
check('a goal running across the Monday ends on the Sunday before, same id, same kcal',
  pT.goals[0].macroGoalID === 'g2' && pT.goals[0].endDate === day(21) && pT.goals[0].kcal === 1700 && pT.removeGoalIds.join() === 'g3,g4',
  JSON.stringify(pT.goals.map(g => [g.macroGoalID, g.startDate, g.endDate])));

p = plan(s4, MON4, r4, 'step');
const kc = p.rows.map(r => r.kcal);
check('step: +125 a week from 2,583, last climb week on the hold (2,933)', kc.slice(0, 3).join() === '2708,2833,2933', kc.join());
check('step: the hold is the cycle\'s own 5 weeks, counting the week the climb lands on it (12 Oct – 15 Nov)', p.holdWeeks === 5 && p.goals.find(g => g.hold).startDate === '2026-10-12', String(p.holdWeeks));
check('step: the climb weeks are not hold; the trailing run is', p.goals.filter(g => g.hold).length === 1 && p.goals.filter(g => g.startDate >= MON4 && !g.hold).length === 2,
  JSON.stringify(p.goals.map(g => [g.startDate, g.kcal, g.hold])));

// A late recalibration: 2 weeks left, so +125 can't fit a 5-week hold.
const late = state(day(56));
for (let d = 22; d <= 56; d++) { late.bodyLogs.push({ date: day(d), weight: 180.0 - (Math.floor((d - 1) / 7) - 1) * 0.7 }); late.nutritionLogs.push({ date: day(d), kcal: 2000, protein: 200, carbs: 250, fats: 80 }); }
const LATE = day(57);
const rL = recalOn(late, LATE);
const pL = rL && plan(late, LATE, rL, 'step');
check('step, late: extends the cycle by whole weeks (extensionWeeks) for the full hold', pL && pL.extensionWeeks > 0 && pL.newEnd > '2026-11-15', JSON.stringify(pL && { ext: pL.extensionWeeks, end: pL.newEnd, hold: pL.holdWeeks }));
check('…and the hold then runs its planned 5 weeks', pL && pL.holdWeeks === 5, String(pL && pL.holdWeeks));
const blocking = { id: 'next', name: 'Next block', start: '2026-11-16', weeks: 4, weeksPerMeso: 1, goalType: 'gain' };
const lateB = { ...late, macrocycles: [macro, blocking] };
const pB = rL && E.buildMaintenanceRecalibrationPlan(lateB, { today: LATE }, macro, rL, 'step');
check('step, late, with a cycle straight after: refused, never overlapping', pB && pB.blocked && /Next block/.test(pB.blocked), pB && pB.blocked);
const pS = rL && plan(late, LATE, rL, 'schedule');
check('schedule, late: never extends', pS && pS.extensionWeeks === null && pS.newEnd === '2026-11-15');

// schedule from week 3's Monday (21 Sep): the hold starts 12 Oct, 3 weeks away.
// Week 2 a pound lighter, so the estimate is above the intake and there is a climb.
const sC = state(day(14));
sC.bodyLogs.forEach(l => { if (l.date > day(7)) l.weight = 179.0; });
const rC = recalOn(sC, day(15));
const pC = rC && plan(sC, day(15), rC, 'schedule');
check(`schedule: climb ${rC && rC.climbStart} → ${rC && rC.estimate}, divided over the 3 weeks before the hold`,
  pC && pC.rows.length >= 3 && pC.rows[2].kcal === rC.estimate && pC.stepKcal === Math.round((rC.estimate - rC.climbStart) / 3)
    && pC.rows[0].kcal === Math.round(rC.climbStart + (rC.estimate - rC.climbStart) / 3),
  JSON.stringify(pC && pC.rows.slice(0, 4)));
check('schedule: the hold keeps its planned start (12 Oct); the week before it, though on the target, is a climb week',
  pC && pC.goals.find(g => g.hold).startDate === '2026-10-12' && pC.rows[2].hold === false, JSON.stringify(pC && pC.goals.map(g => [g.startDate, g.kcal, g.hold])));

const rising = state(day(21));
rising.bodyLogs.forEach(l => { l.weight = 180 + (l.date > day(7) ? 0.8 : 0) + (l.date > day(14) ? 0.8 : 0); });
const rR = recalOn(rising, MON4);
const pR = rR && plan(rising, MON4, rR, 'step');
check('weight rising: the hold drops to the estimate from Monday, no climb, no step-down',
  pR && rR.estimate < rR.avgKcal && rR.climbStart === rR.estimate && pR.climbWeeks === 0, JSON.stringify(rR && { e: rR.estimate, a: rR.avgKcal }));

console.log('\n— Control: the v8.59 formula —');
// Latest qualifying bucket's intake − (its week-on-week change × 3,500 / 7),
// including the unfinished week.
const ins = E.computeWeeklyInsights(s3, { today: FRI3 }, macro);
const q = ins.weekBuckets.filter(b => b.avgWeight !== null && b.nutrDayCount >= 4);
const w1 = q[q.length - 2], w2 = q[q.length - 1];
const oldEstimate = Math.round(w2.avgKcal - ((w2.avgWeight - w1.avgWeight) * 3500) / 7);
check(`control: v8.59 would have offered ${oldEstimate.toLocaleString('en-GB')} kcal from the part-week (now 2,450)`, oldEstimate > 3400, String(oldEstimate));

console.log(failures ? `\nFAIL: ${failures} check(s)` : '\nAll checks pass.');
process.exit(failures ? 1 : 0);
