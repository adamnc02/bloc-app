// Coach v0.11 (TECHNICAL §163): an exercise rated 9+ two weeks running, and where a reset starts. Each rule has a control.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { getDeloadUnitKey, getRpeKey, type BlocState, type Loose, type Macrocycle } from '@engine';
import { buildFixtureClients } from '@/data/fixtures';
import { summarise } from '@/data/summary';
import { effortFlags } from '@/today/model';
import { resetWeek, type PlanMacro } from '@/plan/doc';
import { highRatingStreaks } from './effort';

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
const flags = (w: ReturnType<typeof world>) => highRatingStreaks(w.s, w.m).filter((x) => x.dayKey === w.dayKey && x.exId === w.ex.id);

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
    const make = (second: number) => {
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
      return effortFlags({ submissions: [], drafts: [], publications: [] }, built.clients, sums, 'coach-1', built.anchor).filter((x) => x.cardId === b.card.id);
    };
    expect(make(10).length).toBeGreaterThan(0);
    expect(make(7)).toHaveLength(0);
  });
});
