// ═══════════════════════════════════════════════════════════════════════
// Publishing a plan: what changed between the published cycle and the
// coach's draft, as the Publish sheet's lines and as the two publications
// BLOC applies (TECHNICAL §144; SUPABASE.md → "what goes INSIDE each row").
//
//   plan         {v, macrocycle: {id, …changed fields}, exercises: {key: list},
//                 supersets: {id: {name}}, remove_superset_ids, deloads: {key: bool}}
//   goal_phases  {v, macro_id, goals: [changed or new], remove_goal_ids}
//
// 🚨 A changed session template is sent WHOLE: BLOC replaces `exercises[key]`
//    with the list it's given. An unchanged exercise keeps its id inside it,
//    so its logs stay attached (proposal §5.3); a removed session is sent as
//    an empty list.
// 🚨 A new cycle sends every macrocycle field, and never a field outside
//    0023's allow-list (the CHECK refuses the whole row).
// 🚨 The plan goes first, the goal phases second: BLOC holds goal phases for
//    a cycle its phone doesn't have yet, and applies in seq order.
// ═══════════════════════════════════════════════════════════════════════
import type { Loose } from '@engine';
import { MACRO_FIELDS, keyOf, dayKeys, microOf, phaseName, sessionLabel, slotsOf, sortedExercises, type PlanDoc, type PlanExercise, type PlanGoal } from './doc';

export interface ChangeGroup { title: string; lines: string[] }
export interface PlanDiff {
  groups: ChangeGroup[];
  count: number;
  plan: Loose | null;
  goalPhases: Loose | null;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const canon = (list: PlanExercise[] | undefined) => sortedExercises(list);
const fmtInt = (n: number) => Math.round(n).toLocaleString('en-GB');

/** One line per exercise field that differs, "sets 3–4 → 3–5". */
export function exerciseDelta(a: PlanExercise, b: PlanExercise): string[] {
  const out: string[] = [];
  if (a.name !== b.name) out.push(`now ${b.name}`);
  if (a.setsStart !== b.setsStart || a.setsEnd !== b.setsEnd) out.push(`sets ${a.setsStart}–${a.setsEnd} → ${b.setsStart}–${b.setsEnd}`);
  if (a.reps !== b.reps) out.push(`reps ${a.reps || '—'} → ${b.reps || '—'}`);
  if (a.startWeight !== b.startWeight) out.push(`${a.startWeight} → ${b.startWeight} kg`);
  if (a.type !== b.type) out.push(`${a.type} → ${b.type}`);
  if (a.isHeavyLeg !== b.isHeavyLeg) out.push(b.isHeavyLeg ? 'heavy leg' : 'not heavy leg');
  if (a.trackingMode !== b.trackingMode) out.push(b.trackingMode === 'perSide' ? 'per side' : 'total weight');
  if ((a.bodyPart || '') !== (b.bodyPart || '')) out.push(`body part ${b.bodyPart || 'none'}`);
  if (a.speedLevel !== b.speedLevel || a.resistanceLevel !== b.resistanceLevel || a.distanceUnit !== b.distanceUnit) out.push('cardio levels changed');
  if (a.targetSeconds !== b.targetSeconds || a.targetDistance !== b.targetDistance || a.metricType !== b.metricType) out.push('cardio target changed');
  if ((a.order !== b.order || a.supersetId !== b.supersetId || a.supersetOrder !== b.supersetOrder) && !out.length) out.push('moved');
  return out;
}

export function diffPlan(base: PlanDoc | null, draft: PlanDoc): PlanDiff {
  const groups: ChangeGroup[] = [];
  const add = (title: string, line: string) => {
    let g = groups.find((x) => x.title === title);
    if (!g) groups.push((g = { title, lines: [] }));
    g.lines.push(line);
  };
  const m = draft.macro;
  const plan: Loose = { v: 1 };
  let planChanged = false;

  // The cycle.
  if (!base) {
    plan.macrocycle = Object.fromEntries(MACRO_FIELDS.filter((f) => (m as unknown as Loose)[f] !== undefined).map((f) => [f, (m as unknown as Loose)[f]]));
    planChanged = true;
    add('New cycle', `${m.name}: ${m.weeks} mesocycles of ${m.weeksPerMeso} week${m.weeksPerMeso === 1 ? '' : 's'}${m.extensionWeeks ? ` + ${m.extensionWeeks} extension week${m.extensionWeeks === 1 ? '' : 's'}` : ''}, from ${m.start}`);
  } else {
    const patch: Loose = {};
    for (const f of MACRO_FIELDS) {
      const a = (base.macro as unknown as Loose)[f], b = (m as unknown as Loose)[f];
      if (f !== 'id' && !same(a ?? null, b ?? null)) patch[f] = b === undefined ? (f === 'extensionWeeks' ? 0 : null) : b;
    }
    if (Object.keys(patch).length) {
      plan.macrocycle = { id: m.id, ...patch };
      planChanged = true;
      const lines: string[] = [];
      if ('name' in patch) lines.push(`renamed ${m.name}`);
      if ('start' in patch) lines.push(`starts ${m.start} (was ${base.macro.start})`);
      if ('weeks' in patch || 'weeksPerMeso' in patch) lines.push(`${m.weeks} mesocycles of ${m.weeksPerMeso} week${m.weeksPerMeso === 1 ? '' : 's'} (was ${base.macro.weeks} of ${base.macro.weeksPerMeso})`);
      if ('extensionWeeks' in patch) lines.push(m.extensionWeeks ? `extended by ${m.extensionWeeks} week${m.extensionWeeks === 1 ? '' : 's'}` : 'extension removed');
      if ('goalType' in patch) lines.push(`goal now ${m.goalType}`);
      if ('goal' in patch) lines.push(`goal line “${m.goal}”`);
      if ('targetBw' in patch) lines.push(m.targetBw ? `goal weight ${m.targetBw} lbs` : 'no goal weight');
      if ('weightIncrement' in patch) lines.push(`increment ${m.weightIncrement} kg`);
      if ('rpe' in patch) lines.push(m.rpe ? 'effort ratings (RPE) on' : 'effort ratings (RPE) off');
      if ('days' in patch || 'dayLabels' in patch) {
        for (const d of m.days) if (!base.macro.days.includes(d)) lines.push(`session added: ${m.dayLabels[d]}`);
        for (const d of base.macro.days) if (!m.days.includes(d)) lines.push(`session removed: ${base.macro.dayLabels[d] || d}`);
        for (const d of m.days) if (base.macro.days.includes(d) && base.macro.dayLabels[d] !== m.dayLabels[d]) lines.push(`${base.macro.dayLabels[d] || d} renamed ${m.dayLabels[d]}`);
      }
      for (const l of lines) add('Cycle', l);
    }
  }

  // Session templates, sent whole when they differ.
  const exercises: Record<string, PlanExercise[]> = {};
  const baseKeys = base ? Object.keys(base.exercises) : [];
  const keys = new Set([...baseKeys, ...Object.keys(draft.exercises)]);
  for (const k of keys) {
    const a = canon(base?.exercises[k]);
    const b = canon(draft.exercises[k]);
    if (same(a, b)) continue;
    if (!a.length && !b.length) continue;
    exercises[k] = b;
    const before = groups.reduce((n, g) => n + g.lines.length, 0);
    const dk = k.slice(`${m.id}_1_`.length);
    const label = sessionLabel(m, dk) || dk;
    if (!base) { if (b.length) add('Sessions', `${label}: ${b.length} exercise${b.length === 1 ? '' : 's'}`); continue; }
    const aIds = new Map(a.map((e) => [e.id, e]));
    const bIds = new Map(b.map((e) => [e.id, e]));
    const added = b.filter((e) => !aIds.has(e.id));
    const removed = a.filter((e) => !bIds.has(e.id));
    // A swap: an exercise gone and a new one in its exact place.
    for (const r of removed.slice()) {
      const s = added.find((x) => x.order === r.order && x.supersetId === r.supersetId && (x.supersetOrder ?? null) === (r.supersetOrder ?? null));
      if (s) {
        add('Exercises', `${label}: ${r.name} → ${s.name} (swapped${s.fromWeek && s.fromWeek > 1 ? `, week 1 of its progression from MC${s.fromWeek}` : ''})`);
        removed.splice(removed.indexOf(r), 1);
        added.splice(added.indexOf(s), 1);
      }
    }
    for (const e of added) add('Exercises', `${label}: ${e.name} added${e.fromWeek && e.fromWeek > 1 ? ` from MC${e.fromWeek}` : ''}`);
    for (const e of removed) add('Exercises', `${label}: ${e.name} removed`);
    for (const e of b) {
      const was = aIds.get(e.id);
      if (!was) continue;
      const d = exerciseDelta(was, e);
      if (d.length) add('Exercises', `${label}: ${e.name}, ${d.join(', ')}`);
    }
    const aSs = slotsOf(a).filter((s) => s[0].supersetId).map((s) => s.map((e) => e.id).join());
    const bSs = slotsOf(b).filter((s) => s[0].supersetId).map((s) => s.map((e) => e.id).join());
    if (!same(aSs, bSs)) add('Exercises', `${label}: supersets changed`);
    // 🚨 Every template that's sent is listed: a change with no line would publish with nothing shown.
    if (groups.reduce((n, g) => n + g.lines.length, 0) === before) add('Exercises', `${label}: changed`);
  }
  if (Object.keys(exercises).length) { plan.exercises = exercises; planChanged = true; }

  // Supersets: the names of those the draft uses; removed ones.
  const supersets: Record<string, { name: string | null }> = {};
  for (const [id, ss] of Object.entries(draft.supersets)) {
    if (!base || !same(base.supersets[id] ?? null, ss)) {
      supersets[id] = { name: ss.name ?? null };
      if (base?.supersets[id] && ss.name !== base.supersets[id].name) add('Exercises', ss.name ? `superset renamed ${ss.name}` : 'superset name cleared');
    }
  }
  const removeSs = base ? Object.keys(base.supersets).filter((id) => !draft.supersets[id]) : [];
  if (Object.keys(supersets).length) { plan.supersets = supersets; planChanged = true; }
  if (removeSs.length) { plan.remove_superset_ids = removeSs; planChanged = true; }

  // Deloads.
  const deloads: Record<string, boolean> = {};
  for (const k of new Set([...Object.keys(base?.deloads ?? {}), ...Object.keys(draft.deloads)])) {
    const a = !!base?.deloads[k], b = !!draft.deloads[k];
    if (a !== b) { deloads[k] = b; add('Deloads', `${deloadLabel(draft, k)} ${b ? 'is a deload' : 'no longer a deload'}`); }
  }
  if (Object.keys(deloads).length) { plan.deloads = deloads; planChanged = true; }

  // Goal phases.
  const baseGoals = new Map((base?.goals ?? []).map((g) => [g.macroGoalID, g]));
  const draftGoals = new Map(draft.goals.map((g) => [g.macroGoalID, g]));
  const goals: PlanGoal[] = [];
  for (const g of draft.goals) {
    const was = baseGoals.get(g.macroGoalID);
    if (was && same(pickGoal(was), pickGoal(g))) continue;
    goals.push(g);
    add('Goal phases', was ? `${phaseName(g) || g._blocLabel}: ${goalDelta(was, g).join(', ')}` : `${phaseName(g) || g._blocLabel} added, ${g.startDate} – ${g.endDate}, ${fmtInt(g.kcal)} kcal`);
  }
  const removeGoals = [...baseGoals.keys()].filter((id) => !draftGoals.has(id));
  for (const id of removeGoals) add('Goal phases', `${phaseName(baseGoals.get(id)!) || id} removed`);
  const goalPhases = goals.length || removeGoals.length
    ? { v: 1, macro_id: m.id, goals, ...(removeGoals.length ? { remove_goal_ids: removeGoals } : {}) } : null;

  const count = groups.reduce((a, g) => a + g.lines.length, 0);
  return { groups, count, plan: planChanged ? plan : null, goalPhases };
}

const pickGoal = (g: PlanGoal) => ({ s: g.startDate, e: g.endDate, k: g.kcal, st: g.steps, p: g.protein, c: g.carbs, f: g.fats, l: g._blocLabel });
function goalDelta(a: PlanGoal, b: PlanGoal): string[] {
  const d: string[] = [];
  if (phaseName(a) !== phaseName(b)) d.push(`renamed ${phaseName(b)}`);
  if (a.startDate !== b.startDate || a.endDate !== b.endDate) d.push(`${b.startDate} – ${b.endDate}`);
  if (a.kcal !== b.kcal) d.push(`${fmtInt(a.kcal)} → ${fmtInt(b.kcal)} kcal`);
  if (a.steps !== b.steps) d.push(`${fmtInt(a.steps)} → ${fmtInt(b.steps)} steps`);
  if (a.protein !== b.protein || a.carbs !== b.carbs || a.fats !== b.fats) d.push(`P ${b.protein}g · C ${b.carbs}g · F ${b.fats}g`);
  if (!d.length) d.push('renumbered');
  return d;
}

function deloadLabel(doc: PlanDoc, key: string): string {
  const m = key.slice(doc.macro.id.length + 1).match(/^(\d+)(?:_m([12]))?$/);
  if (!m) return key;
  return `Mesocycle ${m[1]}${m[2] ? ` · M${m[2]}` : ''}`;
}

/** The payloads, ready to publish in order: the plan first, then the goal phases. */
export function payloadsOf(d: PlanDiff): { type: 'plan' | 'goal_phases'; payload: Loose }[] {
  const out: { type: 'plan' | 'goal_phases'; payload: Loose }[] = [];
  if (d.plan) out.push({ type: 'plan', payload: d.plan });
  if (d.goalPhases) out.push({ type: 'goal_phases', payload: d.goalPhases });
  return out;
}

export { keyOf, dayKeys, microOf };
