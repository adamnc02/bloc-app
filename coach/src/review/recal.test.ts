// Coach v0.18 (TECHNICAL §175): a maintenance cycle's hold and its
// recalibration, in Coach. The engine decides (verify-maintenance-*.mjs in
// bloc-app's scripts check it); these check that Coach carries the hold,
// shows the finding, raises Needs you, and applies the same plan BLOC does.
import { describe, expect, it } from 'vitest';
import { buildMaintenanceRecalibrationPlan, computeMaintenanceRecalibration, computeWeeklyInsights, normaliseState, shiftDateStr, type BlocState, type Macrocycle } from '@engine';
import { applyRecalibration, upsertGoal, type IdGen, type PlanDoc, type PlanGoal } from '@/plan/doc';
import { diffPlan } from '@/plan/diff';
import { needsItemOpen } from '@/today/model';
import { computeReview } from './model';

const START = '2026-06-01';
const macro = { id: 'm', name: 'Bridge', start: START, weeks: 5, weeksPerMeso: 2, sessionsPerWeek: 1, goal: '', targetBw: null, goalType: 'maintenance' as const,
  splitType: 'custom', days: ['a'], dayLabels: {}, useMicrocycles: false, weightIncrement: '2.5', rpe: false };
const goal = (id: string, s: string, e: string, kcal: number, extra: Partial<PlanGoal> = {}): PlanGoal =>
  ({ macroId: 'm', macroGoalID: id, startDate: s, endDate: e, kcal, steps: 8000, protein: 180, carbs: 150, fats: 40, _blocLabel: id, ...extra });
const GOALS = [goal('g1', '2026-06-01', '2026-06-14', 1600), goal('g2', '2026-06-15', '2026-07-05', 1800), goal('g3', '2026-07-06', '2026-08-09', 1900, { carbs: 180 })];
const doc = (goals = GOALS): PlanDoc => ({ macro: { ...macro }, exercises: {}, supersets: {}, deloads: {}, goals: structuredClone(goals) });
const ids: IdGen = { macro: () => 'mx', exercise: () => 'ex', superset: () => 'ss', goal: () => 'm_gnew' };

// Two complete weeks level at 180 lbs on 2,450 kcal a day, against a 1,900 hold.
function client(): BlocState {
  const days = Array.from({ length: 14 }, (_, i) => shiftDateStr(START, i));
  return normaliseState({
    macrocycles: [macro as unknown as Macrocycle], goals: structuredClone(GOALS),
    bodyLogs: days.map((date) => ({ date, weight: '180' })),
    nutritionLogs: days.map((date, i) => ({ date, kcal: i < 7 ? 2200 : 2700, protein: 200, carbs: 250, fats: 80 })),
  } as BlocState);
}
const TODAY = '2026-06-17';

describe('the hold, in the plan', () => {
  it('a goal saved as the hold on a maintenance cycle carries hold: true', () => {
    const d = upsertGoal(doc(), 'g3', { label: 'Hold', startDate: '2026-07-06', endDate: '2026-08-09', kcal: 1900, steps: 8000, protein: 180, carbs: 180, hold: true }, ids);
    expect(d.goals.find((g) => g.macroGoalID === 'g3')!.hold).toBe(true);
  });
  it('saved as a climb, it loses the flag; on a cut it never gets one', () => {
    const held = doc(GOALS.map((g) => (g.macroGoalID === 'g3' ? { ...g, hold: true } : g)));
    const d = upsertGoal(held, 'g3', { label: 'Hold', startDate: '2026-07-06', endDate: '2026-08-09', kcal: 1900, steps: 8000, protein: 180, carbs: 180, hold: false }, ids);
    expect('hold' in d.goals.find((g) => g.macroGoalID === 'g3')!).toBe(false);
    const cut = { ...doc(), macro: { ...macro, goalType: 'loss' as const } };
    expect('hold' in upsertGoal(cut, null, { label: 'x', startDate: '2026-08-10', endDate: '2026-08-16', kcal: 1900, steps: 8000, protein: 180, carbs: 180, hold: true }, ids).goals.find((g) => g.macroGoalID === 'm_gnew')!).toBe(false);
  });
  it('the publish summary names a hold change, and it publishes', () => {
    const base = doc();
    const d = diffPlan(base, doc(GOALS.map((g) => (g.macroGoalID === 'g3' ? { ...g, hold: true } : g))));
    expect(d.groups.flatMap((x) => x.lines).join(' ')).toContain('now the hold');
    expect(d.goalPhases?.goals.map((g: PlanGoal) => g.macroGoalID)).toEqual(['g3']);
  });
});

describe('the recalibration, in Coach', () => {
  it('Review raises it as a finding with the engine\'s reason', () => {
    const r = computeReview(client(), 'm', TODAY, 'Casey')!;
    expect(r.recal?.estimate).toBe(2450);
    const f = r.findings.find((x) => x.id === 'recal')!;
    expect(f.action).toBe('recalibrate');
    expect(f.title).toBe('Maintenance looks higher than the plan’s hold');
    expect(f.body).toContain('hold of 1,900 kcal');
  });
  it('applying it to the draft writes exactly the engine\'s plan, as BLOC does', () => {
    const s = client();
    const ctx = { today: TODAY };
    const m = s.macrocycles![0];
    const recal = computeMaintenanceRecalibration(s, ctx, m, computeWeeklyInsights(s, ctx, m));
    const plan = buildMaintenanceRecalibrationPlan(s, ctx, m, recal, 'step')!;
    const d = applyRecalibration(doc(), plan);
    const hold = d.goals.find((g) => g.hold === true)!;
    expect(hold.kcal).toBe(2450);
    expect(hold.startDate).toBe('2026-06-22');
    expect(d.goals.find((g) => g.macroGoalID === 'g2')!.endDate).toBe('2026-06-21'); // the running goal, to the Sunday before
    expect(d.goals.some((g) => g.macroGoalID === 'g3')).toBe(false);
    const { _blocLabel: _a, ...g1 } = d.goals.find((g) => g.macroGoalID === 'g1')!;
    const { _blocLabel: _b, ...was } = doc().goals[0];
    expect(g1).toEqual(was); // earlier goals untouched (bar the Step N relabel every save does)
  });
  it('Needs you\'s item opens Review on Findings', () => {
    const open = needsItemOpen({ kind: 'recal', key: 'c:card:m', at: TODAY, cardId: 'card', macroId: 'm', reason: 'r' });
    expect(open).toEqual({ kind: 'path', path: '/clients/card/review?macro=m&at=findings' });
  });
  it('a cut gets no recalibration finding', () => {
    const s = client();
    s.macrocycles![0].goalType = 'loss';
    expect(computeReview(s, 'm', TODAY, 'Casey')!.findings.some((x) => x.id === 'recal')).toBe(false);
  });
});
