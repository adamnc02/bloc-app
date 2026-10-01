// Coach v0.11 (TECHNICAL §163): an exercise rated 9+ two weeks running, and where a reset starts. Each rule has a control.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { getDeloadUnitKey, getRpeKey, type BlocState, type Loose, type Macrocycle } from '@engine';
import { buildFixtureClients } from '@/data/fixtures';
import { summarise } from '@/data/summary';
import { effortFlags } from '@/today/model';
import { resetExercise, resetWeek, updateExercise, type PlanDoc, type PlanMacro } from '@/plan/doc';
import { diffPlan, payloadsOf } from '@/plan/diff';
import { recordState } from '@/inperson/model';
import type { CoachPublication } from '@/ai/types';
import { highRatingStreaks, isLeft } from './effort';
import { getWeekSets } from '@engine';

const DEMO = readFileSync(new URL('../../../bloc-demo-data.json', import.meta.url), 'utf8');
const MID = 'macro_1780859905961';

function world(rated: Record<number, number | 'skip'>, opts: { rpe?: boolean; deload?: number; fromWeek?: number } = {}) {
  const s = JSON.parse(DEMO) as BlocState;
  const m = s.macrocycles!.find((x) => x.id === MID)! as Macrocycle;
  m.publishedBy = 'coach-1';
  m.rpe = opts.rpe ?? true;
  const key = Object.keys(s.exercises as object).find((k) => k.startsWith(`${MID}_1_`))!;
  const dayKey = key.slice(MID.length + 3);
  const ex = ((s.exercises as Record<string, Loose[]>)[key]).find((e) => e.category !== 'cardio')!;
  if (opts.fromWeek) ex.fromWeek = opts.fromWeek;
  (s as Loose).rpe = {};
  (s as Loose).deloads = {};
  if (opts.deload) (s as Loose).deloads[getDeloadUnitKey(m, opts.deload, dayKey)] = true;
  for (const [w, r] of Object.entries(rated)) (s as Loose).rpe[getRpeKey(MID, Number(w), dayKey, ex.id)] = r === 'skip' ? { rpeSkipped: true } : { rpe: r };
  return { s, m, dayKey, ex };
}
const flags = (w: ReturnType<typeof world>) => highRatingStreaks(w.s, w.m).filter((x) => x.dayKey === w.dayKey && x.exId === w.ex.id && x.kind === 'too_hard');

describe('rated 9 or 10 two weeks running', () => {
  it('two consecutive weeks rated 9 then 10 raise it, naming the weeks and ratings', () => {
    const w = world({ 2: 6, 3: 9, 4: 10 });
    expect(flags(w).map((x) => [x.weeks, x.ratings])).toEqual([[[3, 4], [9, 10]]]);
  });
  it('controls: one week, a later 8, a skipped week, or a gap between them, don\'t', () => {
    expect(flags(world({ 4: 10 }))).toHaveLength(0);
    expect(flags(world({ 3: 9, 4: 10, 5: 8 }))).toHaveLength(0);
    expect(flags(world({ 3: 9, 4: 10, 5: 'skip' }))).toHaveLength(0);
    expect(flags(world({ 2: 9, 4: 10 }))).toHaveLength(0);
  });
  it('a deload between them is skipped: still two weeks running (control: without the deload, the gap breaks it)', () => {
    expect(flags(world({ 2: 9, 4: 10 }, { deload: 3 }))).toHaveLength(1);
    expect(flags(world({ 2: 9, 4: 10 }))).toHaveLength(0);
  });
  it('ratings before a reset don\'t count (control: without it, the same ratings raise it)', () => {
    expect(flags(world({ 3: 9, 4: 10 }, { fromWeek: 5 }))).toHaveLength(0);
    expect(flags(world({ 3: 9, 4: 10 }, { fromWeek: 4 }))).toHaveLength(0);
    expect(flags(world({ 3: 9, 4: 10 }, { fromWeek: 3 }))).toHaveLength(1);
  });
  it('a cycle with ratings off raises nothing (control: on)', () => {
    expect(flags(world({ 3: 9, 4: 10 }, { rpe: false }))).toHaveLength(0);
    expect(flags(world({ 3: 9, 4: 10 }))).toHaveLength(1);
  });
});

describe('where a reset starts', () => {
  const m = { id: 'm1', start: '2026-09-07', weeks: 6, weeksPerMeso: 1 } as unknown as PlanMacro;
  const log = (w: number, day = 'push') => ({ [`m1_${w}_${day}_ex_1_0`]: { done: true } });
  it('the client\'s current week when it has nothing logged', () => {
    expect(resetWeek(m, 'push', '2026-09-23', {})).toBe(3);
  });
  it('the week after the last one logged in that session, even ahead of the calendar (control: another session\'s logs don\'t count)', () => {
    expect(resetWeek(m, 'push', '2026-09-23', { ...log(3), ...log(4) })).toBe(5);
    expect(resetWeek(m, 'push', '2026-09-23', log(4, 'pushm1'))).toBe(3);
    expect(resetWeek(m, 'push', '2026-09-23', log(4, 'pull'))).toBe(3);
  });
  it('none when the session has no week left', () => {
    expect(resetWeek(m, 'push', '2026-10-15', log(6))).toBeNull();
  });
});

describe('Needs you, on a client\'s record', () => {
  it('raises it for a fixture client with a coach\'s cycle rated 9+ twice (control: rated 7 the second time)', () => {
    const demo = JSON.parse(DEMO) as Record<string, unknown>;
    const make = (second: number, leave = false) => {
      const built = buildFixtureClients(demo);
      // A linked fixture client whose cycles are all made a coach's, with ratings on: whichever runs at their today is judged.
      const b = built.clients.find((x) => x.link?.status === 'active' && (x.snapshot?.state?.macrocycles || []).length > 0)!;
      const st = b.snapshot!.state as Loose;
      for (const mm of st.macrocycles as Loose[]) { mm.publishedBy = 'coach-1'; mm.rpe = true; }
      const sums0 = built.clients.map((c) => summarise(c, built.now));
      const today = sums0.find((x) => x.id === b.card.id)!.clientToday!;
      const macro = (st.macrocycles as Loose[]).find((mm) => mm.start <= today && (st.macrocycles as Loose[]).every((o) => o === mm || !(o.start > mm.start && o.start <= today)))!;
      const key = Object.keys(st.exercises).find((k) => k.startsWith(`${macro.id}_1_`))!;
      const dayKey = key.slice(macro.id.length + 3);
      const ex = (st.exercises[key] as Loose[]).find((e) => e.category !== 'cardio')!;
      st.rpe = { [getRpeKey(macro.id, 2, dayKey, ex.id)]: { rpe: 9 }, [getRpeKey(macro.id, 3, dayKey, ex.id)]: { rpe: second } };
      st.deloads = {};
      const sums = built.clients.map((c) => summarise(c, built.now));
      const leaves = leave ? [{ cardId: b.card.id, macroId: String(macro.id), dayKey, exId: String(ex.id), kind: 'too_hard' as const, throughWeek: 3 }] : [];
      return effortFlags({ submissions: [], drafts: [], publications: [], leaves }, built.clients, sums, 'coach-1', built.anchor).filter((x) => x.cardId === b.card.id && x.streak.kind === 'too_hard');
    };
    expect(make(10).length).toBeGreaterThan(0);
    expect(make(7)).toHaveLength(0);
    // Left (0034): that run is gone from Needs you.
    expect(make(10, true)).toHaveLength(0);
  });
});

describe('a reset reads the client\'s record, not the upload alone (v0.13.6)', () => {
  // A client not on the app: no upload. Their coach's plan and three in-person sessions exist only as publications.
  const MID = 'macro_np';
  const ex = { id: 'ex_np_0', name: 'Leg Press', category: 'weight', type: 'standard', reps: '10', setsStart: 2, setsEnd: 2, startWeight: 40, isHeavyLeg: false, trackingMode: 'total', order: 0, supersetId: null, supersetOrder: null };
  const macro = { id: MID, name: 'Strength', start: '2026-09-07', weeks: 8, weeksPerMeso: 1, sessionsPerWeek: 1, goal: '', targetBw: null, goalType: 'maintenance', splitType: 'custom', days: ['session0'], dayLabels: { session0: 'Session A' }, useMicrocycles: false, weightIncrement: '2.5', rpe: true };
  const pub = (seq: number, type: string, payload: object): CoachPublication => ({ id: `p${seq}`, seq, type, payload: { v: 1, ...payload } as Loose, supersedes: null, createdAt: '2026-09-15T08:00:00.000Z', ack: null });
  const pubs = [
    pub(1, 'plan', { macrocycle: macro, exercises: { [`${MID}_1_session0`]: [ex] } }),
    ...[1, 2, 3].map((w) => pub(1 + w, 'session_log', { session_id: `own:2026-09-1${w}:s${w}`, macro_id: MID, week: w, day_key: 'session0', kind: 'in_person', logs: { ex_np_0: { sets: [{ weight: '40', reps: '10' }, { weight: '40', reps: '10' }] } } })),
  ];
  const today = '2026-09-15'; // calendar week 2
  it('lands after the last week logged (4), on the record (control: the upload alone, nothing logged, gives the calendar week 2)', () => {
    const rec = recordState({ state: null, publications: pubs, coachId: 'coach-1', since: null }) as Loose;
    expect(resetWeek(macro as unknown as PlanMacro, 'session0', today, rec.trainLogs)).toBe(4);
    expect(resetWeek(macro as unknown as PlanMacro, 'session0', today, null)).toBe(2);
  });
});

describe('the reset is saved with its week (v0.13.7)', () => {
  const MID = 'macro_r';
  const ex = { id: 'ex_r_0', name: 'Leg Press', category: 'weight' as const, type: 'standard' as const, reps: '12', setsStart: 2, setsEnd: 3, startWeight: 50, isHeavyLeg: true, trackingMode: 'total' as const, order: 0, supersetId: null, supersetOrder: null, bodyPart: 'Legs' };
  const doc: PlanDoc = {
    macro: { id: MID, name: 'S', start: '2026-08-17', weeks: 10, weeksPerMeso: 1, sessionsPerWeek: 1, goal: '', targetBw: null, goalType: 'maintenance', splitType: 'custom', days: ['session0'], dayLabels: { session0: 'Session A' }, useMicrocycles: false, weightIncrement: '2.5', rpe: true },
    exercises: { [`${MID}_1_session0`]: [ex] }, supersets: {}, deloads: {}, goals: [],
  };
  const { id: _i, order: _o, supersetId: _s, supersetOrder: _so, ...fields } = ex;
  const next = { ...fields, startWeight: 40 };
  it('resetExercise saves the new numbers WITH fromWeek, and the publish summary says so (control: updateExercise drops it)', () => {
    const r = resetExercise(doc, 'session0', 'ex_r_0', next, 10);
    expect(r.exercises[`${MID}_1_session0`][0]).toMatchObject({ startWeight: 40, fromWeek: 10, id: 'ex_r_0' });
    const lines = diffPlan(doc, r).groups.flatMap((g) => g.lines).join(' | ');
    expect(lines).toContain('reset from MC10');
    // What reaches the phone: the plan publication's exercise carries fromWeek.
    const plan = payloadsOf(diffPlan(doc, r)).find((x) => x.type === 'plan')!.payload as Loose;
    expect(plan.exercises[`${MID}_1_session0`][0]).toMatchObject({ id: 'ex_r_0', startWeight: 40, fromWeek: 10 });
    // Control: an edit keeps the exercise's own fromWeek (none), so the week is lost: what v0.13.6 published.
    const u = updateExercise(doc, 'session0', 'ex_r_0', { ...next, fromWeek: 10 });
    expect(u.exercises[`${MID}_1_session0`][0].fromWeek).toBeUndefined();
  });
});

describe('missed its target two weeks running (v0.14)', () => {
  // The track cleared, then weeks logged: `hit` well above any target (100 kg more each week), `miss` below it (0 kg).
  function missWorld(logged: Record<number, 'hit' | 'miss'>) {
    const w = world({}, { rpe: false });
    const st = w.s as Loose;
    for (const k of Object.keys(st.trainLogs)) if (k.startsWith(`${MID}_`) && k.includes(`_${w.dayKey}_${w.ex.id}_`)) delete st.trainLogs[k];
    st.progressionTargets = {}; st.progressionLocks = {};
    for (const [wk, how] of Object.entries(logged)) {
      const n = getWeekSets(w.ex, Number(wk), w.m.weeks as number);
      for (let i = 0; i < n; i++) st.trainLogs[`${MID}_${wk}_${w.dayKey}_${w.ex.id}_${i}`] = { weight: how === 'hit' ? String(100 * Number(wk)) : '0', reps: how === 'hit' ? '99' : '0', done: true };
    }
    return { ...w, missed: () => highRatingStreaks(w.s, w.m).filter((x) => x.dayKey === w.dayKey && x.exId === w.ex.id && x.kind === 'missed') };
  }
  it('two weeks running short of the target raise it, ratings off or on', () => {
    const w = missWorld({ 1: 'hit', 2: 'hit', 3: 'miss', 4: 'miss' });
    expect(w.missed().map((x) => x.weeks)).toEqual([[3, 4]]);
  });
  it('controls: one miss, a miss then a hit, or a gap between them, don\'t', () => {
    expect(missWorld({ 1: 'hit', 2: 'hit', 3: 'miss' }).missed()).toHaveLength(0);
    expect(missWorld({ 1: 'hit', 2: 'miss', 3: 'miss', 4: 'hit' }).missed()).toHaveLength(0);
    expect(missWorld({ 1: 'hit', 2: 'miss', 4: 'miss' }).missed()).toHaveLength(0);
  });
});

describe('Leave (v0.14, 0034)', () => {
  const x = { kind: 'too_hard' as const, macroId: MID, dayKey: 'd', exId: 'e', name: 'Leg Press', weeks: [3, 4] as [number, number], ratings: [9, 10] as [number, number] };
  const left = [{ cardId: 'c1', macroId: MID, dayKey: 'd', exId: 'e', kind: 'too_hard' as const, throughWeek: 4 }];
  it('a Leave hides that run only (controls: a third week is a new run; the other kind, another card, are their own)', () => {
    expect(isLeft(left, 'c1', x)).toBe(true);
    expect(isLeft(left, 'c1', { ...x, weeks: [4, 5] })).toBe(false);
    expect(isLeft(left, 'c1', { ...x, kind: 'missed' })).toBe(false);
    expect(isLeft(left, 'c2', x)).toBe(false);
  });
  it('a third week rated 9+ raises a new run after a Leave', () => {
    const w = world({ 3: 9, 4: 10, 5: 9 });
    const f = flags(w);
    expect(f.map((y) => y.weeks)).toEqual([[4, 5]]);
    expect(isLeft([{ cardId: 'c', macroId: MID, dayKey: w.dayKey, exId: String(w.ex.id), kind: 'too_hard', throughWeek: 4 }], 'c', f[0])).toBe(false);
  });
});
