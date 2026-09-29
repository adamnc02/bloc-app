// ═══════════════════════════════════════════════════════════════════════
// Library templates (proposal §5.5; `coach_templates.body`, TECHNICAL §144).
//
// A template is saved WITHOUT dates and without ids:
//   macrocycle  {v, kind, macro: the cycle's settings, sessions: {dayKey:
//               exercises}, supersets: {ref: name}, deloads: [unit suffix],
//               goals: [{offset, days, kcal, steps, protein, carbs, fats, name}]}
//               Goal phases are kept as day offsets from the cycle's start.
//   workout     {v, kind, label, exercises, supersets}: one session.
// Applying one builds a FRESH copy for one client, every id new, so a
// template is never shared between clients and editing a copy never touches
// the template or anyone else's (§5.5).
// ═══════════════════════════════════════════════════════════════════════
import { dayDiff, shiftDateStr } from '@engine';
import {
  keyOf, sortedExercises, withStepLabels, dayKeys, deloadUnits, fatsFrom, phaseName,
  type IdGen, type PlanDoc, type PlanExercise, type PlanMacro,
} from './doc';

type TplExercise = Omit<PlanExercise, 'id' | 'supersetId'> & { ss: string | null };

export interface MacroTemplateBody {
  v: 1;
  kind: 'macrocycle';
  macro: Omit<PlanMacro, 'id' | 'start'>;
  sessions: Record<string, TplExercise[]>;
  supersets: Record<string, string | null>;
  /** Deload units as `${week}` or `${week}_m${mc}`. */
  deloads: string[];
  goals: { offset: number; days: number; kcal: number; steps: number; protein: number; carbs: number; fats: number; name: string }[];
}
export interface WorkoutTemplateBody {
  v: 1;
  kind: 'workout';
  label: string;
  exercises: TplExercise[];
  supersets: Record<string, string | null>;
}
export type TemplateBody = MacroTemplateBody | WorkoutTemplateBody;

export interface Template {
  id: string;
  kind: 'macrocycle' | 'workout';
  name: string;
  summary: string | null;
  body: TemplateBody;
  starred: boolean;
  createdAt: string;
  /** From `template_applications`. */
  appliedCount: number;
  appliedLast90: number;
}

function stripList(list: PlanExercise[], names: Record<string, { name: string | null }>, refs: Map<string, string>, out: Record<string, string | null>): TplExercise[] {
  return sortedExercises(list).map((e) => {
    const { id: _id, supersetId, ...rest } = e;
    void _id;
    let ss: string | null = null;
    if (supersetId) {
      if (!refs.has(supersetId)) { refs.set(supersetId, `s${refs.size + 1}`); out[refs.get(supersetId)!] = names[supersetId]?.name ?? null; }
      ss = refs.get(supersetId)!;
    }
    return { ...rest, ss };
  });
}

/** A whole cycle as a template: no dates, no ids, no logs. */
export function macroTemplateOf(doc: PlanDoc): { body: MacroTemplateBody; summary: string } {
  const { id: _id, start: _s, ...macro } = doc.macro;
  void _id; void _s;
  const refs = new Map<string, string>();
  const supersets: Record<string, string | null> = {};
  const sessions: Record<string, TplExercise[]> = {};
  for (const dk of dayKeys(doc.macro)) {
    const list = doc.exercises[keyOf(doc.macro.id, dk)];
    if (list?.length) sessions[dk] = stripList(list, doc.supersets, refs, supersets);
  }
  const deloads = Object.keys(doc.deloads).map((k) => k.slice(doc.macro.id.length + 1)).filter((k) => /^\d+(_m[12])?$/.test(k));
  const goals = doc.goals.map((g) => ({
    offset: dayDiff(doc.macro.start, g.startDate), days: dayDiff(g.startDate, g.endDate) + 1,
    kcal: g.kcal, steps: g.steps, protein: g.protein, carbs: g.carbs, fats: g.fats, name: phaseName(g),
  }));
  const dl = deloadUnits(doc.macro).filter((u) => doc.deloads[u.key]).map((u) => u.label.replace(/^Week /, ''));
  const summary = `${doc.macro.days.length} session${doc.macro.days.length === 1 ? '' : 's'} a week · ${dl.length ? `deloads in week ${dl.join(' and ')}` : 'no deloads'} · ${goals.length} goal phase${goals.length === 1 ? '' : 's'}`;
  return { body: { v: 1, kind: 'macrocycle', macro: JSON.parse(JSON.stringify(macro)), sessions, supersets, deloads, goals }, summary };
}

/** One session as a template. */
export function workoutTemplateOf(doc: PlanDoc, dayKey: string, label: string): { body: WorkoutTemplateBody; summary: string } {
  const refs = new Map<string, string>();
  const supersets: Record<string, string | null> = {};
  const exercises = stripList(doc.exercises[keyOf(doc.macro.id, dayKey)] || [], doc.supersets, refs, supersets);
  return { body: { v: 1, kind: 'workout', label, exercises, supersets }, summary: exercises.map((e) => e.name).join(', ') };
}

function freshList(list: TplExercise[], key: string, ids: IdGen, ssNames: Record<string, string | null>, doc: PlanDoc, map: Map<string, string>): PlanExercise[] {
  return list.map((t) => {
    const { ss, ...rest } = t;
    let supersetId: string | null = null;
    if (ss) {
      if (!map.has(ss)) { const nid = ids.superset(); map.set(ss, nid); doc.supersets[nid] = { name: ssNames[ss] ?? null }; }
      supersetId = map.get(ss)!;
    }
    return { ...JSON.parse(JSON.stringify(rest)), id: ids.exercise(key), supersetId } as PlanExercise;
  });
}

/** A macrocycle template applied from `start`: a new cycle, every id fresh, goal phases placed by their offsets. */
export function applyMacroTemplate(body: MacroTemplateBody, start: string, ids: IdGen, name?: string): PlanDoc {
  const id = ids.macro();
  const doc: PlanDoc = {
    macro: { ...JSON.parse(JSON.stringify(body.macro)), id, start, name: name?.trim() || body.macro.name },
    exercises: {}, supersets: {}, deloads: {}, goals: [],
  };
  const map = new Map<string, string>();
  for (const [dk, list] of Object.entries(body.sessions)) {
    const key = keyOf(id, dk);
    doc.exercises[key] = freshList(list, key, ids, body.supersets, doc, map);
  }
  for (const d of body.deloads) doc.deloads[`${id}_${d}`] = true;
  doc.goals = body.goals.map((g) => {
    const startDate = shiftDateStr(start, g.offset);
    return {
      macroId: id, macroGoalID: ids.goal(id), startDate, endDate: shiftDateStr(startDate, g.days - 1),
      kcal: g.kcal, steps: g.steps, protein: g.protein, carbs: g.carbs, fats: g.fats ?? fatsFrom(g.kcal, g.protein, g.carbs), _blocLabel: g.name,
    };
  });
  return withStepLabels(doc);
}

/**
 * A workout template into one of a cycle's sessions (§11 Q17): it fills that
 * session (replacing its exercises), or `'new'` adds a session named after it.
 * Under microcycles it fills the session's M1 and M2 alike.
 */
export function applyWorkoutTemplate(doc: PlanDoc, body: WorkoutTemplateBody, day: string | 'new', ids: IdGen): { doc: PlanDoc; day: string } {
  const next: PlanDoc = JSON.parse(JSON.stringify(doc));
  let d = day;
  if (d === 'new') {
    let n = next.macro.days.length;
    while (next.macro.days.includes(`session${n}`)) n++;
    d = `session${n}`;
    next.macro.days.push(d);
    next.macro.dayLabels[d] = body.label || `Session ${next.macro.days.length}`;
    next.macro.sessionsPerWeek = next.macro.days.length;
  }
  const targets = next.macro.useMicrocycles ? [`${d}m1`, `${d}m2`] : [d];
  for (const dk of targets) {
    const key = keyOf(next.macro.id, dk);
    next.exercises[key] = freshList(body.exercises, key, ids, body.supersets, next, new Map());
  }
  const used = new Set(Object.values(next.exercises).flat().map((e) => e.supersetId).filter(Boolean) as string[]);
  for (const id of Object.keys(next.supersets)) if (!used.has(id)) delete next.supersets[id];
  return { doc: next, day: d };
}
