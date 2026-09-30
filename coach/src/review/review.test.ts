// Coach v0.2 (TECHNICAL §140): Review's outcome model and compliance, at the
// CLIENT's local today. Each rule has a control that shows what goes wrong
// without it.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildSignalPeriods, computeWeeklyInsights, normaliseState, shiftDateStr, type BlocState } from '@engine';
import { buildFixtureClients } from '@/data/fixtures';
import { summarise } from '@/data/summary';
import { localDateIn } from '@/lib/clientState';
import { computeReview, defaultCycleId } from './model';
import { computeNutrition, computeTraining, judgeOutcome, type TrainingCompliance, type WeekCol } from '@engine/review';

const demo = JSON.parse(readFileSync(new URL('../../../bloc-demo-data.json', import.meta.url), 'utf8'));
const { now, clients } = buildFixtureClients(demo);
const bundle = (id: string) => clients.find((c) => c.card.id === id)!;
const MACRO = 'macro_1780859905961';

/** A cycle with no exercises: weight only, one week average per entry, from Mon 1 Jun. */
function synthetic(goalType: string, weekAvgs: number[], waist: Record<string, number> = {}): BlocState {
  const start = '2026-06-01';
  const bodyLogs = weekAvgs.flatMap((avg, w) => Array.from({ length: 7 }, (_, d) => {
    const date = shiftDateStr(start, w * 7 + d);
    return { date, weight: String(avg), ...(waist[date] != null ? { waist: String(waist[date]) } : {}) };
  }));
  return normaliseState({
    macrocycles: [{ id: 'm', name: 'Test', start, weeks: 12, weeksPerMeso: 1, useMicrocycles: false, goalType, targetBw: 190, days: ['a'] }],
    bodyLogs,
  } as BlocState);
}
const noTraining: TrainingCompliance = { scored: true, cols: [], gridCols: [], rows: [], cycleScore: null, cycleAttendance: null, rpeOn: false };
const judge = (s: BlocState, today: string, training = noTraining) =>
  judgeOutcome(s, s.macrocycles![0], today, { training, nutrition: { weeks: [], cycleScore: null } });

describe('the outcome: Maya, the demo, at 2 Aug', () => {
  const r = computeReview(bundle('maya').snapshot!.state, MACRO, '2026-08-02', 'Maya')!;
  it('is off track: flat W4–W6, no 2 weeks of loss since', () => {
    expect(r.outcome.status).toBe('off-track');
    expect(r.outcome.verdict).toContain('W4–W6');
  });
  it('is explained by calories, from the engine’s own signal, written about the client', () => {
    expect(r.outcome.signal).toBe('plateau-creep');
    expect(r.outcome.lead?.key).toBe('calories');
    expect(r.outcome.lead?.fact).not.toMatch(/\bYour\b/);
  });
});

describe('how the weeks went, and the chart’s header (Maya at 2 Aug)', () => {
  const r = computeReview(bundle('maya').snapshot!.state, MACRO, '2026-08-02', 'Maya')!;
  it('one line per engine period, after the first week', () => {
    expect(r.outcome.periods.map((p) => `${p.kind}:${p.from}-${p.to}:${p.confirmed ? 'c' : 'u'}${p.flagged ? 'F' : ''}`))
      .toEqual(['start:W1-W1:c', 'moving:W2-W3:c', 'flat:W4-W6:cF', 'moving:W7-W7:u', 'flat:W8-W8:u']);
    const flat = r.outcome.periods[2];
    expect([flat.fromLbs?.toFixed(1), flat.toLbs?.toFixed(1)]).toEqual(['215.3', '215.1']);
  });
  it('the header says when progress stalled', () => {
    expect(r.story.headline?.title).toBe('Stalled since W4');
    expect(r.story.headline?.sub).toContain('215.3 → 214.3 lbs');
  });
  it('the callout’s week average is the week containing the day (Mon–Sun), not the week before', () => {
    const w2 = r.story.trend.find((p) => p.start === '2026-06-15')!;
    expect(['2026-06-15', '2026-06-17', '2026-06-21'].every((d) => r.story.trend.find((p) => p.start <= d && p.end >= d) === w2)).toBe(true);
  });
});

describe('direction: the engine’s "moving" has none', () => {
  // 200 → 199 → 198 → 199 → 200.2: the last two weeks rose more than 0.5 lb each.
  const s = synthetic('loss', [200, 199, 198, 199, 200.2]);
  it('control: the engine groups those weeks as confirmed movement, not a stall', () => {
    const ins = computeWeeklyInsights(s, { today: '2026-07-05' }, s.macrocycles![0]);
    expect(buildSignalPeriods(ins.weekBuckets, 0).activePeriod.type).toBe('moving');
  });
  it('a loss client gaining 2 weeks running is off track', () => {
    const o = judge(s, '2026-07-05');
    expect(o.status).toBe('off-track');
    expect(o.verdict).toContain('risen for 2 weeks');
  });
  it('the mirror on a gain cycle', () => {
    expect(judge(synthetic('gain', [180, 181, 182, 181, 179.8]), '2026-07-05').verdict).toContain('fallen for 2 weeks');
    expect(judge(synthetic('gain', [180, 181, 182, 183, 184]), '2026-07-05').status).toBe('on-track');
  });
});

describe('weight alone decides', () => {
  it('with no food logged (the engine withholds its verdict), weigh-ins still give an outcome', () => {
    const s = synthetic('loss', [200, 199, 198, 197]);
    expect(computeWeeklyInsights(s, { today: '2026-06-28' }, s.macrocycles![0]).insufficientData).toBe(true);
    expect(judge(s, '2026-06-28').status).toBe('on-track');
  });
  it('fewer than 2 weeks with a weigh-in: no outcome yet', () => {
    expect(judge(synthetic('loss', [200]), '2026-06-07').status).toBe('no-data');
  });
});

describe('the waist rule (loss)', () => {
  // Flat from W3 after two weeks of loss; waist measured before the flat stretch and near its end.
  const weights = [202, 200.5, 200.4, 200.3, 200.4];
  const withWaist = (to: number) => synthetic('loss', weights, { '2026-06-10': 34, '2026-07-03': to });
  it('waist down ¾″ since before the flat stretch: on track, recomposition', () => {
    const o = judge(withWaist(33.25), '2026-07-05');
    expect(o.status).toBe('on-track');
    expect(o.recomposition).toBe(true);
    expect(o.verdict).toContain('waist is down ¾″');
  });
  it('control: waist down only ¼″ stays off track', () => {
    expect(judge(withWaist(33.75), '2026-07-05').status).toBe('off-track');
  });
});

describe('maintenance: stability, and attendance under 7/10', () => {
  const s = synthetic('maintenance', [190, 190.5, 189.8, 190.2, 190.1]);
  const col = (idx: number, start: string, att: number): WeekCol => ({
    idx, label: `W${idx + 1}`, week: idx + 1, start, end: shiftDateStr(start, 6), isDeload: false, closed: true, current: false, future: false,
    sessions: [], planned: 10, done: att, score: null, attendance: att,
  });
  const training = (att: number): TrainingCompliance => ({ ...noTraining, scored: false, cols: [col(3, '2026-06-22', att), col(4, '2026-06-29', att)] });
  it('attendance 6/10 is off track', () => expect(judge(s, '2026-07-06', training(6)).status).toBe('off-track'));
  it('attendance 7/10 is on track', () => expect(judge(s, '2026-07-06', training(7)).status).toBe('on-track'));
  it('weekly averages spanning more than 3 lb are off track', () => {
    expect(judge(synthetic('maintenance', [190, 192, 194]), '2026-06-21').verdict).toContain('varied');
  });
});

describe('the client’s today', () => {
  const s = bundle('grace').snapshot!.state;
  it('Grace at her own Auckland date is in week 1; at the coach’s London date her cycle hasn’t started', () => {
    const auckland = localDateIn('Pacific/Auckland', now), london = localDateIn('Europe/London', now);
    expect(computeReview(s, defaultCycleId(s, auckland)!, auckland, 'Grace')!.weekNow).toBe(1);
    expect(judge(s, london).verdict).toContain('hasn’t started');
  });
  it('the Clients row carries the outcome', () => {
    expect(summarise(bundle('maya'), now).outcome.status).toBe('off-track');
    expect(summarise(bundle('grace'), now).outcome.status).toBe('no-data');
    expect(summarise(bundle('sam'), now).outcome.status).toBe('no-data');
  });
});

describe('training compliance (§7.1)', () => {
  const s = bundle('maya').snapshot!.state;
  const m = s.macrocycles!.find((x) => x.id === MACRO)!;
  const t = computeTraining(s, m, '2026-09-20');
  it('one calendar week per agenda unit, and one grid column per calendar week', () => {
    expect(t.cols.length).toBe(14);
    expect(t.gridCols.map((c) => c.label)).toEqual(t.cols.map((c) => c.label));
  });
  it('rows split by microcycle, A before B, in the cycle’s day order; A rows are blank in the B weeks', () => {
    const groups = [...new Set(t.rows.map((r) => r.sessionLabel))];
    expect(groups).toEqual(['Pull · A', 'Pull · B', 'Legs · A', 'Legs · B', 'Push · A', 'Push · B', 'Arms · A', 'Arms · B']);
    const a = t.rows.filter((r) => r.sessionLabel.endsWith('A'));
    expect(a.every((r) => r.cells.every((c, i) => (i % 2 === 1) === (c.state === 'none')))).toBe(true);
  });
  it('week 1 is judged like any other week', () => {
    const w1 = t.rows.flatMap((r) => r.cells.filter((c) => c.unit === 0 && c.state !== 'none'));
    expect(w1.length).toBeGreaterThan(0);
    expect(w1.every((c) => ['pass', 'fail', 'missed'].includes(c.state))).toBe(true);
    expect(t.cols[0].score).not.toBeNull();
  });
  it('a deload not done is its own miss (ice) and scores 0; the session after it is judged normally', () => {
    const w12 = t.cols.find((c) => c.isDeload)!;
    const cells = t.rows.flatMap((r) => r.cells).filter((c) => c.unit === w12.idx && c.state !== 'none');
    expect(w12.done).toBe(0);
    expect(cells.every((c) => c.state === 'deload-missed' && c.reason === 'Deload week, not done')).toBe(true);
    expect(w12.score).toBe(0);
    const w13 = t.rows.flatMap((r) => r.cells).filter((c) => c.unit === w12.idx + 1 && c.state !== 'none');
    expect(w13.every((c) => c.state === 'missed')).toBe(true);
  });
  it('a deload that was done shows as a deload and scores like a pass (control: the same week unmarked)', () => {
    const w3 = t.cols[2];
    expect(w3.score).not.toBeNull();
    const marked = { ...s, deloads: { ...(s.deloads || {}), [`${MACRO}_${w3.week}_m1`]: true } };
    const t2 = computeTraining(marked, m, '2026-09-20');
    const cells = t2.rows.flatMap((r) => r.cells).filter((c) => c.unit === 2 && c.state !== 'none');
    expect(cells.every((c) => c.state === 'deload')).toBe(true);
    expect(t2.cols[2].score).toBe(10);
  });
  it('planned sessions not done in a finished week are missed, and the week scores 0', () => {
    const w10 = t.cols[9]; // W9 holds a half-logged Pull session; W10 has nothing
    expect(w10.closed).toBe(true);
    expect(w10.done).toBe(0);
    expect(w10.score).toBe(0);
    expect(t.rows.flatMap((r) => r.cells).filter((c) => c.unit === 9 && c.state !== 'none').every((c) => c.state === 'missed')).toBe(true);
  });
  it('a half-done session in a finished week scores its exercises, the undone ones as misses', () => {
    const pull = t.cols[8].sessions.find((x) => x.label === 'Pull')!;
    expect(pull.done).toBe(false);
    expect(pull.score).toBeGreaterThan(0);
  });
  it('a swapped exercise-week is neither pass nor fail (control: the same cell passes)', () => {
    const row = t.rows.find((r) => r.cells.some((c) => c.state === 'pass'))!;
    const i = row.cells.findIndex((c) => c.state === 'pass');
    const c = row.cells[i];
    const exId = row.key.split('|')[1];
    const swapped = { ...s, substitutions: { [`${MACRO}_${c.dayKey}_${exId}_w${c.week}`]: { kind: 'swap' as const, name: 'Other' } } };
    expect(computeTraining(swapped, m, '2026-09-20').rows.find((r) => r.key === row.key)!.cells[i].state).toBe('swapped');
  });
  it('never writes to the client’s state', () => {
    const before = JSON.stringify(s.progressionTargets);
    computeTraining(s, m, '2026-09-20');
    expect(JSON.stringify(s.progressionTargets)).toBe(before);
  });
});

describe('microcycles with one-week mesocycles (Priya)', () => {
  const s = bundle('priya').snapshot!.state;
  const m = s.macrocycles![0];
  const t = computeTraining(s, m, '2026-09-20');
  it('A and B share each week: one column per week, both rows filled every week', () => {
    expect(t.cols.length).toBe(7);
    expect(t.cols[0].sessions.map((x) => x.dayKey)).toEqual(['session0m1', 'session1m1', 'session2m1', 'session3m1', 'session0m2', 'session1m2', 'session2m2', 'session3m2']);
    expect([...new Set(t.rows.map((r) => r.sessionLabel))]).toEqual(['Pull · A', 'Pull · B', 'Legs · A', 'Legs · B', 'Push · A', 'Push · B', 'Arms · A', 'Arms · B']);
    expect(t.rows.every((r) => r.cells.every((c) => c.state !== 'none'))).toBe(true);
  });
});

describe('nutrition compliance (§7.2)', () => {
  const s = bundle('maya').snapshot!.state;
  const m = s.macrocycles!.find((x) => x.id === MACRO)!;
  const n = computeNutrition(s, m, '2026-08-02');
  it('a finished week with 4 or more full days is scored out of 10', () => {
    expect(n.weeks[0].closed).toBe(true);
    expect(n.weeks[0].score).not.toBeNull();
  });
  it('the current week isn’t scored', () => {
    const last = n.weeks[n.weeks.length - 1];
    expect(last.closed).toBe(false);
    expect(last.score).toBeNull();
  });
  it('a week with under 4 counted days isn’t scored', () => {
    const sparse = { ...s, nutritionLogs: (s.nutritionLogs || []).filter((l) => !(l.date >= '2026-06-08' && l.date <= '2026-06-11')), nutritionMeals: {} };
    expect(computeNutrition(sparse, m, '2026-08-02').weeks[0].score).toBeNull();
  });
});
