// Coach v0.4 (TECHNICAL §144): Plan's model, on the real engine and the demo
// client. Each rule has a control that shows what goes wrong without it.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { BlocState } from '@engine';
import type { CoachPublication } from '@/ai/types';
import {
  addExercise, addSession, copyMicro, dayKeys, deloadUnits, dissolveSuperset, editSettings, keyOf, linkSuperset, moveInSuperset, moveSlot,
  newCycle, removeExercise, removeGoal, removeSession, slotsOf, swapExercise, toggleDeload, unlinkExercise, updateExercise, upsertGoal,
  type ExerciseFields, type IdGen, type PlanDoc,
} from './doc';
import { diffPlan, payloadsOf } from './diff';
import { foldPlan } from './fold';
import { applyMacroTemplate, applyWorkoutTemplate, macroTemplateOf, workoutTemplateOf } from './templates';
import { BUILT_IN, buildLibrary, bodyPartFor } from './library';
import { bodyPartVolume, progressionPreview } from './volume';

const demo = JSON.parse(readFileSync(new URL('../../../bloc-demo-data.json', import.meta.url), 'utf8')) as BlocState;
const MACRO = 'macro_1780859905961';
const COACH = 'coach-1';
const fresh = () => structuredClone(demo) as BlocState;
const coached = () => { const s = fresh(); for (const m of s.macrocycles!) m.publishedBy = COACH; return s; };

/** Deterministic ids: a counter, never the clock. */
function ids(): IdGen {
  let n = 0;
  return { macro: () => `macro_t${++n}`, exercise: (k) => `ex_${k}_t${++n}`, superset: () => `ss_t${++n}`, goal: (m) => `${m}_gt${++n}` };
}
const pub = (id: string, seq: number, type: string, payload: object, createdAt = '2026-08-02T20:05:00.000Z', extra: Partial<CoachPublication> = {}): CoachPublication =>
  ({ id, seq, type, payload, supersedes: null, createdAt, ack: null, ...extra });
const weight = (name: string, over: Partial<ExerciseFields> = {}): ExerciseFields => ({
  name, bodyPart: 'Chest', category: 'weight', type: 'standard', reps: '10', setsStart: 3, setsEnd: 4, startWeight: 40, isHeavyLeg: false, trackingMode: 'total', ...over,
});
const baseDoc = (): PlanDoc => foldPlan({ state: coached(), publications: [], coachId: COACH, since: null }).find((c) => c.id === MACRO)!.doc;

// 0023's allow-lists (super-duper-octo-barnacle docs/SUPABASE.md): a key outside them refuses the whole row.
const PLAN_KEYS = ['v', 'macrocycle', 'exercises', 'supersets', 'deloads', 'remove_exercise_ids', 'remove_superset_ids'];
const MACRO_KEYS = ['id', 'name', 'weeks', 'weeksPerMeso', 'sessionsPerWeek', 'start', 'goal', 'targetBw', 'goalType', 'splitType', 'days', 'dayLabels', 'useMicrocycles', 'weightIncrement', 'rpe', 'extensionWeeks'];
const PHASE_KEYS = ['v', 'macro_id', 'goals', 'remove_goal_ids'];

/** Applies payloads the way BLOC's funnel does (the fold uses the same patch rules), then reads the cycle back. */
function applied(state: BlocState, doc: PlanDoc, payloads: { type: string; payload: object }[]) {
  const pubs = payloads.map((p, i) => pub(`p${i}`, i + 1, p.type, p.payload));
  return foldPlan({ state, publications: pubs, coachId: COACH, since: null }).find((c) => c.id === doc.macro.id)!.doc;
}

describe('the baseline: the upload, plus publications it hasn’t applied', () => {
  it('reads the client’s cycle; with no publishedBy it’s theirs (control: publishedBy makes it the coach’s)', () => {
    const own = foldPlan({ state: fresh(), publications: [], coachId: COACH, since: null });
    expect(own.map((c) => [c.id, c.coachOwned])).toEqual([[MACRO, false]]);
    expect(foldPlan({ state: coached(), publications: [], coachId: COACH, since: null })[0].coachOwned).toBe(true);
  });
  it('overlays a plan the upload hasn’t applied, and not one its ledger has', () => {
    const doc = newCycle({ name: 'Block 2', start: '2026-09-14', weeks: 3, weeksPerMeso: 2, goalType: 'loss', goal: '', targetBw: null, weightIncrement: '2.5', split: 'ppl', useMicrocycles: true, rpe: true }, ids());
    const d = diffPlan(null, doc);
    const p = pub('np', 9, 'plan', d.plan!);
    expect(foldPlan({ state: coached(), publications: [p], coachId: COACH, since: null }).map((c) => c.id)).toContain(doc.macro.id);
    const s = coached(); (s as Record<string, unknown>).coachLedger = { np: { status: 'applied' } };
    // Applied per its ledger: the upload is the truth, and it doesn't hold it, so it isn't shown (control above).
    expect(foldPlan({ state: s, publications: [p], coachId: COACH, since: null }).map((c) => c.id)).not.toContain(doc.macro.id);
  });
  it('ignores publications from before the last unlink (the phone removed them)', () => {
    const doc = newCycle({ name: 'Old', start: '2026-09-14', weeks: 2, weeksPerMeso: 1, goalType: 'loss', goal: '', targetBw: null, weightIncrement: '2.5', split: 'ppl', useMicrocycles: false, rpe: true }, ids());
    const p = pub('old', 3, 'plan', diffPlan(null, doc).plan!, '2026-07-01T10:00:00Z');
    expect(foldPlan({ state: null, publications: [p], coachId: COACH, since: '2026-07-02T00:00:00Z' })).toEqual([]);
    expect(foldPlan({ state: null, publications: [p], coachId: COACH, since: null }).map((c) => c.id)).toEqual([doc.macro.id]); // control
  });
  it('builds a never-synced client’s plan from publications alone, and reads a held one’s receipt', () => {
    const doc = newCycle({ name: 'B', start: '2026-09-14', weeks: 2, weeksPerMeso: 1, goalType: 'gain', goal: '', targetBw: null, weightIncrement: '2.5', split: 'ppl', useMicrocycles: false, rpe: true }, ids());
    const p = pub('h', 1, 'plan', diffPlan(null, doc).plan!, '2026-08-02T20:05:00Z', { ack: { status: 'needs_attention', note: 'Waiting for the client to end “X” early, on 2026-09-13.' } });
    const [c] = foldPlan({ state: null, publications: [p], coachId: COACH, since: null });
    expect(c.coachOwned).toBe(true);
    expect(c.status).toMatchObject({ state: 'held', note: expect.stringMatching(/^Waiting for the client/) });
  });
  it('the phone’s ledger wins over a stale server receipt, and the plan row names the reason (control: the receipt alone says held)', () => {
    const doc = newCycle({ name: 'B', start: '2026-09-14', weeks: 2, weeksPerMeso: 1, goalType: 'gain', goal: '', targetBw: null, weightIncrement: '2.5', split: 'ppl', useMicrocycles: false, rpe: true }, ids());
    const staleAck = { status: 'needs_attention' as const, note: 'Overlaps “Old” (from 2026-06-08).' };
    const plan = pub('pl', 1, 'plan', diffPlan(null, doc).plan!, '2026-08-02T20:05:00Z', { ack: staleAck });
    const phases = pub('gp', 2, 'goal_phases', { v: 1, macro_id: doc.macro.id, goals: [] }, '2026-08-02T20:05:00Z', { ack: { status: 'needs_attention', note: 'Its cycle isn’t on this phone yet.' } });
    const onPhone = applied(fresh(), doc, [{ type: 'plan', payload: plan.payload }]); void onPhone;
    const s = fresh() as BlocState & Record<string, unknown>;
    s.macrocycles!.push({ ...(doc.macro as unknown as { id: string }), publishedBy: COACH } as never);
    s.coachLedger = { pl: { status: 'applied' }, gp: { status: 'applied' } };
    const c = foldPlan({ state: s, publications: [plan, phases], coachId: COACH, since: null }).find((x) => x.id === doc.macro.id)!;
    expect(c.status!.state).toBe('applied');
    const held = foldPlan({ state: null, publications: [plan, phases], coachId: COACH, since: null }).find((x) => x.id === doc.macro.id)!;
    expect(held.status).toMatchObject({ state: 'held', note: staleAck.note }); // no upload: the receipt is all there is, and the plan row's reason leads
  });
  it('a check-in’s goal changes are part of the baseline', () => {
    const g = { macroId: MACRO, macroGoalID: 'ci1', startDate: '2026-08-03', endDate: '2026-08-30', kcal: 1700, steps: 11000, protein: 190, carbs: 150, fats: 40, _blocLabel: 'Step 4 - Steady' };
    const p = pub('ai', 2, 'ai_response', { response_id: 'r', macro_id: MACRO, goal_changes: { goals: [g], remove_goal_ids: [`${MACRO}_g20260803`] } });
    const doc = foldPlan({ state: coached(), publications: [p], coachId: COACH, since: null })[0].doc;
    expect(doc.goals.map((x) => x.macroGoalID)).toContain('ci1');
    expect(doc.goals.map((x) => x.macroGoalID)).not.toContain(`${MACRO}_g20260803`);
  });
});

describe('publishing: the diff is the payload, and BLOC applying it gives the draft', () => {
  it('nothing changed → nothing to publish', () => {
    const d = diffPlan(baseDoc(), baseDoc());
    expect(d.count).toBe(0);
    expect(payloadsOf(d)).toEqual([]);
  });
  it('a new cycle sends every allowed macrocycle field and no other key', () => {
    const doc = newCycle({ name: 'Block 2', start: '2026-09-14', weeks: 3, weeksPerMeso: 2, goalType: 'loss', goal: 'Cut', targetBw: 180, weightIncrement: '2.5', split: 'ppl', useMicrocycles: true, rpe: true }, ids());
    const withEx = addExercise(doc, 'pushm1', weight('Flat Press'), ids());
    const withGoal = upsertGoal(withEx, null, { label: 'Cut', startDate: '2026-09-14', endDate: '2026-10-04', kcal: 1900, steps: 9000, protein: 180, carbs: 180 }, ids());
    const d = diffPlan(null, withGoal);
    expect(Object.keys(d.plan!).every((k) => PLAN_KEYS.includes(k))).toBe(true);
    expect(Object.keys(d.plan!.macrocycle as object).sort()).toEqual(MACRO_KEYS.filter((k) => k !== 'extensionWeeks').sort());
    expect(Object.keys(d.goalPhases!).every((k) => PHASE_KEYS.includes(k))).toBe(true);
    expect(payloadsOf(d).map((p) => p.type)).toEqual(['plan', 'goal_phases']); // the plan first: BLOC holds phases for a cycle it lacks
    expect(applied(fresh(), withGoal, payloadsOf(d))).toEqual(withGoal);
  });
  it('an edited exercise sends its whole session, every other exercise keeping its id (its logs stay attached)', () => {
    const base = baseDoc();
    const key = Object.keys(base.exercises).find((k) => base.exercises[k].length > 2)!;
    const dk = key.slice(`${MACRO}_1_`.length);
    const target = base.exercises[key][1];
    const edited = updateExercise(base, dk, target.id, { ...target, setsEnd: target.setsEnd + 1 });
    const d = diffPlan(base, edited);
    expect(Object.keys(d.plan!.exercises as object)).toEqual([key]);
    expect((d.plan!.exercises as Record<string, { id: string }[]>)[key].map((e) => e.id).sort()).toEqual(base.exercises[key].map((e) => e.id).sort());
    expect(d.plan!.macrocycle).toBeUndefined(); // the cycle itself didn't change
    expect(d.groups.flatMap((g) => g.lines).join()).toMatch(/sets \d+–\d+ → \d+–\d+/);
    expect(applied(coached(), edited, payloadsOf(d))).toEqual(edited);
  });
  it('a swap is a new exercise in the same place; the old id is gone from the plan, not from history', () => {
    const base = baseDoc();
    const key = Object.keys(base.exercises).find((k) => base.exercises[k].length)!;
    const dk = key.slice(`${MACRO}_1_`.length);
    const old = base.exercises[key][0];
    const sw = swapExercise(base, dk, old.id, { name: 'Incline Press', bodyPart: 'Chest', category: 'weight' }, 42.5, ids());
    const now = sw.exercises[key].find((e) => e.name === 'Incline Press')!;
    expect(now.id).not.toBe(old.id);
    expect([now.order, now.setsStart, now.setsEnd, now.reps, now.supersetId, now.startWeight]).toEqual([old.order, old.setsStart, old.setsEnd, old.reps, old.supersetId, 42.5]);
    expect(diffPlan(base, sw).groups[0].lines[0]).toMatch(/→ Incline Press \(swapped\)$/);
  });
  it('every template sent has a line on the Publish sheet (control: a body part alone once listed nothing)', () => {
    const base = baseDoc();
    const key = Object.keys(base.exercises).find((k) => base.exercises[k].length)!;
    const e = base.exercises[key][0];
    const d = diffPlan(base, updateExercise(base, key.slice(`${MACRO}_1_`.length), e.id, { ...e, bodyPart: 'Back' }));
    expect(d.plan!.exercises).toBeDefined();
    expect(d.count).toBeGreaterThan(0);
    expect(d.groups[0].lines[0]).toMatch(/body part Back/);
  });
  it('a removed session is sent as empty templates, so the phone drops it', () => {
    const base = baseDoc();
    const day = base.macro.days[0];
    const d = diffPlan(base, removeSession(base, day));
    for (const dk of dayKeys(base.macro).filter((x) => x.startsWith(day))) expect((d.plan!.exercises as Record<string, unknown[]>)[keyOf(MACRO, dk)]).toEqual([]);
    expect((d.plan!.macrocycle as { days: string[] }).days).not.toContain(day);
  });
  it('goal phases: fats derived, "Step N" renumbered by date, a removed one in remove_goal_ids', () => {
    const base = baseDoc();
    const next = upsertGoal(base, null, { label: 'Extra', startDate: '2026-09-14', endDate: '2026-09-20', kcal: 2000, steps: 8000, protein: 180, carbs: 200 }, ids());
    const g = next.goals.find((x) => x.startDate === '2026-09-14')!;
    expect(g.fats).toBe(Math.round((2000 - 180 * 4 - 200 * 4) / 9));
    expect(g._blocLabel).toBe(`Step ${next.goals.length} - Extra`);
    const gone = removeGoal(next, base.goals[0].macroGoalID);
    const d = diffPlan(base, gone);
    expect(d.goalPhases!.remove_goal_ids).toEqual([base.goals[0].macroGoalID]);
    expect(applied(coached(), gone, payloadsOf(d)).goals).toEqual(gone.goals);
  });
  it('a new start moves every goal phase by the same days (BLOC’s goal shift)', () => {
    const base = baseDoc();
    const moved = editSettings(base, { start: '2026-06-15' });
    expect(moved.goals.map((g) => g.startDate)).toEqual(base.goals.map((g) => shift(g.startDate, 7)));
  });
});

describe('editing exercises as BLOC does', () => {
  const doc = () => newCycle({ name: 'N', start: '2026-09-14', weeks: 3, weeksPerMeso: 2, goalType: 'loss', goal: '', targetBw: null, weightIncrement: '2.5', split: 'ppl', useMicrocycles: true, rpe: true }, ids());
  it('PPL with microcycles has six session templates, M1 first', () => {
    expect(dayKeys(doc().macro)).toEqual(['pushm1', 'pullm1', 'legsm1', 'pushm2', 'pullm2', 'legsm2']);
  });
  it('adds at the end, moves a slot, and a giant set is one set', () => {
    const I = ids();
    let d = addExercise(doc(), 'pushm1', weight('A'), I);
    d = addExercise(d, 'pushm1', weight('B', { type: 'giant', setsStart: 3, setsEnd: 5 }), I);
    const list = d.exercises[keyOf(d.macro.id, 'pushm1')];
    expect(list.map((e) => [e.name, e.order, e.setsStart, e.setsEnd])).toEqual([['A', 0, 3, 4], ['B', 10, 1, 1]]);
    d = moveSlot(d, 'pushm1', 1, 0);
    expect(slotsOf(d.exercises[keyOf(d.macro.id, 'pushm1')]).map((s) => s[0].name)).toEqual(['B', 'A']);
  });
  it('links a superset (the tapped one leads), reorders inside it, unlinks, and a pair left with one dissolves', () => {
    const I = ids();
    let d = doc();
    for (const n of ['A', 'B', 'C']) d = addExercise(d, 'pushm1', weight(n), I);
    const k = keyOf(d.macro.id, 'pushm1');
    const [a, b, c] = d.exercises[k];
    d = linkSuperset(d, 'pushm1', c.id, [a.id, c.id], I);
    const ss = d.exercises[k].find((e) => e.id === c.id)!.supersetId!;
    expect(slotsOf(d.exercises[k]).map((s) => s.map((e) => e.name))).toEqual([['C', 'A'], ['B']]);
    d = moveInSuperset(d, 'pushm1', ss, 1, 0);
    expect(slotsOf(d.exercises[k])[0].map((e) => e.name)).toEqual(['A', 'C']);
    d = unlinkExercise(d, 'pushm1', a.id);
    expect(d.exercises[k].every((e) => !e.supersetId)).toBe(true);
    expect(d.supersets[ss]).toBeUndefined();
    void b;
  });
  it('a drop set can’t join a superset (control: a standard one can)', () => {
    const I = ids();
    let d = addExercise(doc(), 'pushm1', weight('A'), I);
    d = addExercise(d, 'pushm1', weight('D', { type: 'dropset' }), I);
    const [a, dr] = d.exercises[keyOf(d.macro.id, 'pushm1')];
    expect(linkSuperset(d, 'pushm1', a.id, [dr.id], I)).toBe(d);
    d = addExercise(d, 'pushm1', weight('S'), I);
    const s = d.exercises[keyOf(d.macro.id, 'pushm1')][2];
    expect(slotsOf(linkSuperset(d, 'pushm1', a.id, [s.id], I).exercises[keyOf(d.macro.id, 'pushm1')])[0].map((e) => e.name)).toEqual(['A', 'S']);
  });
  it('removing an exercise, and dissolving a superset, leave no orphan superset', () => {
    const I = ids();
    let d = doc();
    for (const n of ['A', 'B']) d = addExercise(d, 'pushm1', weight(n), I);
    const k = keyOf(d.macro.id, 'pushm1');
    d = linkSuperset(d, 'pushm1', d.exercises[k][0].id, [d.exercises[k][1].id], I);
    expect(Object.keys(removeExercise(d, 'pushm1', d.exercises[k][1].id).supersets)).toEqual([]);
    expect(Object.keys(dissolveSuperset(d, 'pushm1', d.exercises[k][0].supersetId!).supersets)).toEqual([]);
  });
  it('copies M1 to M2 with new ids and its own superset', () => {
    const I = ids();
    let d = doc();
    for (const n of ['A', 'B']) d = addExercise(d, 'pushm1', weight(n), I);
    d = linkSuperset(d, 'pushm1', d.exercises[keyOf(d.macro.id, 'pushm1')][0].id, [d.exercises[keyOf(d.macro.id, 'pushm1')][1].id], I);
    d = copyMicro(d, 'push', 1, I);
    const m1 = d.exercises[keyOf(d.macro.id, 'pushm1')], m2 = d.exercises[keyOf(d.macro.id, 'pushm2')];
    expect(m2.map((e) => e.name)).toEqual(m1.map((e) => e.name));
    expect(m2.some((e) => m1.some((x) => x.id === e.id))).toBe(false);
    expect(m2[0].supersetId).not.toBe(m1[0].supersetId);
    expect(Object.keys(d.supersets)).toHaveLength(2);
  });
  it('adds a custom session to a PPL cycle', () => {
    const d = addSession(doc(), 'Arms');
    expect(d.macro.days).toEqual(['push', 'pull', 'legs', 'session3']);
    expect(d.macro.sessionsPerWeek).toBe(4);
    expect(dayKeys(d.macro)).toContain('session3m2');
  });
});

describe('deloads are BLOC’s units', () => {
  it('2-week mesocycles with microcycles: one unit per calendar week', () => {
    const d = newCycle({ name: 'N', start: '2026-09-14', weeks: 3, weeksPerMeso: 2, goalType: 'loss', goal: '', targetBw: null, weightIncrement: '2.5', split: 'ppl', useMicrocycles: true, rpe: true }, ids());
    const u = deloadUnits(d.macro);
    expect(u.map((x) => x.key.slice(d.macro.id.length + 1))).toEqual(['1_m1', '1_m2', '2_m1', '2_m2', '3_m1', '3_m2']);
    expect(u.map((x) => x.start)).toEqual(['2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19']);
    expect(diffPlan(d, toggleDeload(d, u[3].key)).plan!.deloads).toEqual({ [u[3].key]: true });
  });
  it('no microcycles: one unit per mesocycle; a partial extension has no M2', () => {
    const plain = newCycle({ name: 'N', start: '2026-09-14', weeks: 2, weeksPerMeso: 2, goalType: 'loss', goal: '', targetBw: null, weightIncrement: '2.5', split: 'ppl', useMicrocycles: false, rpe: true }, ids());
    expect(deloadUnits(plain.macro).map((x) => x.label)).toEqual(['Weeks 1–2', 'Weeks 3–4']);
    const ext = { ...newCycle({ name: 'N', start: '2026-09-14', weeks: 2, weeksPerMeso: 2, goalType: 'loss', goal: '', targetBw: null, weightIncrement: '2.5', split: 'ppl', useMicrocycles: true, rpe: true }, ids()) };
    ext.macro.extensionWeeks = 1;
    expect(deloadUnits(ext.macro).map((x) => x.key.slice(ext.macro.id.length + 1))).toEqual(['1_m1', '1_m2', '2_m1', '2_m2', '3_m1']);
  });
});

describe('templates: no dates, no ids; each client a fresh copy', () => {
  it('a cycle saved and applied elsewhere keeps its shape with every id new', () => {
    const base = baseDoc();
    const { body, summary } = macroTemplateOf(base);
    expect(JSON.stringify(body)).not.toMatch(new RegExp(`${MACRO}|20\\d\\d-\\d\\d-\\d\\d`)); // no id, no date
    expect(summary).toMatch(/sessions a week/);
    const a = applyMacroTemplate(body, '2026-11-02', ids());
    const b = applyMacroTemplate(body, '2026-11-02', ids(), 'Copy B');
    expect(a.macro.id).not.toBe(MACRO);
    const exIds = (d: PlanDoc) => Object.values(d.exercises).flat().map((e) => e.id);
    expect(exIds(a).some((id) => exIds(base).includes(id))).toBe(false);
    const names = (d: PlanDoc) => dayKeys(d.macro).map((dk) => slotsOf(d.exercises[keyOf(d.macro.id, dk)]).flat().map((e) => e.name));
    expect(names(a)).toEqual(names(base));
    expect(a.goals.map((g) => g.startDate)[0]).toBe('2026-11-02');
    expect(a.goals.length).toBe(base.goals.length);
    expect(b.macro.name).toBe('Copy B');
  });
  it('a workout fills a session (both microcycles), or adds one', () => {
    const base = baseDoc();
    const dk = dayKeys(base.macro)[0];
    const { body } = workoutTemplateOf(base, dk, 'Upper');
    const target = newCycle({ name: 'N', start: '2026-09-14', weeks: 2, weeksPerMeso: 2, goalType: 'loss', goal: '', targetBw: null, weightIncrement: '2.5', split: 'ppl', useMicrocycles: true, rpe: true }, ids());
    const into = applyWorkoutTemplate(target, body, 'pull', ids());
    expect(into.doc.exercises[keyOf(target.macro.id, 'pullm1')].map((e) => e.name)).toEqual(body.exercises.map((e) => e.name));
    expect(into.doc.exercises[keyOf(target.macro.id, 'pullm2')].map((e) => e.name)).toEqual(body.exercises.map((e) => e.name));
    const added = applyWorkoutTemplate(target, body, 'new', ids());
    expect(added.doc.macro.dayLabels[added.day]).toBe('Upper');
  });
});

describe('the library and the figures', () => {
  it('BLOC’s 29 built-ins, then the client’s own, then the coach’s; one per name', () => {
    expect(BUILT_IN).toHaveLength(29);
    const lib = buildLibrary([{ name: 'Hip Thrust', bodyPart: 'Legs' }, { name: 'flat press', bodyPart: 'Chest' }], [{ name: 'Sled Push', bodyPart: 'Legs' }]);
    expect(lib.filter((e) => e.name.toLowerCase() === 'flat press')).toHaveLength(1);
    expect(lib.find((e) => e.name === 'Hip Thrust')!.source).toBe('client');
    expect(lib.find((e) => e.name === 'Sled Push')!.source).toBe('coach');
    expect(bodyPartFor({ name: 'Bench Press' }, lib)).toBe('Other');
    expect(bodyPartFor({ name: 'Lat Pulldown' }, lib)).toBe('Back');
  });
  it('volume and the progression preview come from the engine', () => {
    const base = baseDoc();
    const rows = bodyPartVolume(base, buildLibrary([]));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.max >= r.min && r.min >= 0)).toBe(true);
    const pv = progressionPreview(base);
    expect(pv[0].exercises[0].weeks[0].week).toBe(2);
  });
});

function shift(d: string, days: number) {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + days);
  return x.toISOString().slice(0, 10);
}

describe('goal phase macros are BLOC’s (control: BLOC’s own functions from index.html)', () => {
  const html = readFileSync(new URL('../../../index.html', import.meta.url), 'utf8');
  const fn = (name: string) => { const i = html.indexOf(`function ${name}(`); let d = 0; for (let j = html.indexOf('{', i); j < html.length; j++) { if (html[j] === '{') d++; else if (html[j] === '}' && --d === 0) return html.slice(i, j + 1); } return ''; };
  const bloc = new Function('els', 'bw', `
    const document = { getElementById: (id) => els[id] || (els[id] = { value: '' }) };
    const goalMacroSliderState = { bwRounded: 150, userTouched: false };
    const getLatestBodyweightLbs = () => bw; const renderGoalMacros = () => {};
    ${fn('computeGoalMacroGrams')}
    ${fn('initGoalMacroSliders')}
    return { computeGoalMacroGrams, initGoalMacroSliders, state: goalMacroSliderState };`);
  it('grams from calories, protein per lb and the carb split, over a grid', async () => {
    const { goalMacroGrams } = await import('./macros');
    let n = 0;
    for (const bw of [null, 142.6, 188, 231]) for (const kcal of [1400, 1900, 2650]) for (const pm of [1, 1.25, 1.6, 2]) for (const cp of [30, 50, 71, 80]) {
      const els: Record<string, { value: string }> = { 'goal-kcal-input': { value: String(kcal) }, 'goal-protein-slider': { value: String(pm) }, 'goal-carb-slider': { value: String(cp) } };
      const b = bloc(els, bw);
      b.state.bwRounded = bw ? Math.round(bw) : 150;
      const want = b.computeGoalMacroGrams();
      const got = goalMacroGrams(bw ? Math.round(bw) : 150, kcal, pm, cp);
      expect([got.proteinG, got.carbG, got.fatG]).toEqual([want.proteinG, want.carbG, want.fatG]);
      n++;
    }
    expect(n).toBe(192);
  });
  it('a saved phase’s sliders are worked back exactly as BLOC does', async () => {
    const { slidersFromGoal } = await import('./macros');
    for (const bw of [150, 188]) for (const goal of [{ kcal: 1900, protein: 225, carbs: 150 }, { kcal: 2400, protein: 400, carbs: 40 }, { kcal: 1500, protein: 150, carbs: 500 }]) {
      const els: Record<string, { value: string }> = { 'goal-kcal-input': { value: '' }, 'goal-protein-slider': { value: '' }, 'goal-carb-slider': { value: '' }, 'goal-fat-slider': { value: '' } };
      bloc(els, bw).initGoalMacroSliders(goal);
      expect(slidersFromGoal(bw, goal)).toEqual({ proteinMult: parseFloat(els['goal-protein-slider'].value), carbPct: parseFloat(els['goal-carb-slider'].value) });
    }
  });
});
