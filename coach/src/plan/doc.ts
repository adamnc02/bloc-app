// ═══════════════════════════════════════════════════════════════════════
// One cycle as the coach edits it: the plan document (TECHNICAL §144).
//
// A PlanDoc holds exactly what BLOC keeps for a cycle, in BLOC's own shapes,
// so publishing is a diff and never a translation:
//   · macro      the macrocycle, only the fields a coach owns (0023's plan
//                allow-list; BLOC's PUB_MACRO_FIELDS) plus its id;
//   · exercises  session templates keyed `${macroId}_1_${dayKey}`, dayKey
//                with `m1`/`m2` under microcycles (BLOC TECHNICAL §3);
//   · supersets  `{id: {name}}` for the supersets those exercises use;
//   · deloads    `{`${macroId}_${week}` or `…_${week}_m${1|2}`: true}`;
//   · goals      the cycle's goal phases, BLOC's goal shape.
//
// 🚨 BLOC's "week" in every key is a MESOCYCLE number (1…weeks). A cycle runs
//    `weeks` mesocycles of `weeksPerMeso` calendar weeks, plus
//    `extensionWeeks`; with microcycles, M1 and M2 are the two calendar weeks
//    of a 2-week mesocycle, and each has its own session templates.
// 🚨 Every edit here is pure: it returns a new document and never changes the
//    one it was given. Ids come from an injected generator, so a test can pin
//    them.
// ═══════════════════════════════════════════════════════════════════════
import {
  getDayBefore, getMacroDurationWeeks, getMacroEffectiveMesoCount, getMacroEndDate, isMesoMicroValid, renumberMacroGoalSteps, shiftDateStr, dayDiff,
  type Macrocycle,
} from '@engine';

export type GoalType = 'loss' | 'gain' | 'maintenance';
export type SetType = 'standard' | 'giant' | 'pause' | 'dropset';

/** The macrocycle fields the coach owns: 0023's `plan` allow-list, which BLOC patches (PUB_MACRO_FIELDS). */
export const MACRO_FIELDS = ['id', 'name', 'weeks', 'weeksPerMeso', 'sessionsPerWeek', 'start', 'goal', 'targetBw', 'goalType',
  'splitType', 'days', 'dayLabels', 'useMicrocycles', 'weightIncrement', 'rpe', 'extensionWeeks'] as const;

export interface PlanMacro {
  id: string;
  name: string;
  start: string;
  /** Mesocycles. */
  weeks: number;
  weeksPerMeso: number;
  sessionsPerWeek: number;
  /** BLOC's free-text goal line ("Cut to 200lbs"). */
  goal: string;
  targetBw: number | null;
  goalType: GoalType;
  splitType: string;
  days: string[];
  dayLabels: Record<string, string>;
  useMicrocycles: boolean;
  weightIncrement: string;
  rpe: boolean;
  extensionWeeks?: number;
}

/** An exercise's own fields, BLOC's shape (index.html saveExercise), with `bodyPart` for Swap for today (§137). */
export interface ExerciseFields {
  name: string;
  bodyPart?: string;
  category: 'weight' | 'cardio';
  type: SetType;
  reps: string;
  setsStart: number;
  setsEnd: number;
  startWeight: number;
  isHeavyLeg: boolean;
  trackingMode: 'total' | 'perSide';
  metricType?: 'time' | 'distance';
  targetSeconds?: number | null;
  targetDistance?: number | null;
  distanceUnit?: string;
  speedLevel?: number | null;
  resistanceLevel?: number | null;
}

/** A session-template exercise: its fields, and its place (order, superset). */
export interface PlanExercise extends ExerciseFields {
  id: string;
  order: number;
  supersetId: string | null;
  supersetOrder: number | null;
  [k: string]: unknown;
}

export interface PlanGoal {
  macroId: string;
  macroGoalID: string;
  startDate: string;
  endDate: string;
  kcal: number;
  steps: number;
  protein: number;
  carbs: number;
  fats: number;
  _blocLabel: string;
  [k: string]: unknown;
}

export interface PlanDoc {
  macro: PlanMacro;
  exercises: Record<string, PlanExercise[]>;
  supersets: Record<string, { name: string | null }>;
  deloads: Record<string, true>;
  goals: PlanGoal[];
}

/** Ids for new things. BLOC's forms: `macro_{ms}`, `ex_{key}_{ms}`, `ss_{ms}`, `{macroId}_g{ms}`. */
export interface IdGen { macro(): string; exercise(key: string): string; superset(): string; goal(macroId: string): string }
export function makeIds(nowMs: () => number): IdGen {
  let n = 0;
  const t = () => `${nowMs()}${String(++n).padStart(3, '0')}`;
  return {
    macro: () => `macro_${t()}`,
    exercise: (key) => `ex_${key}_${t()}`,
    superset: () => `ss_${t()}`,
    goal: (macroId) => `${macroId}_g${t()}`,
  };
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

// ── Reading a document ─────────────────────────────────────────────────────

/** The session day keys: each day with its microcycle suffix, M1's first (the engine's getMacroSessionDayKeys order). */
export function dayKeys(m: Pick<PlanMacro, 'days' | 'useMicrocycles'>): string[] {
  return m.useMicrocycles ? [1, 2].flatMap((mc) => m.days.map((d) => `${d}m${mc}`)) : m.days.slice();
}
export const keyOf = (macroId: string, dayKey: string) => `${macroId}_1_${dayKey}`;
export const dayOf = (dayKey: string) => dayKey.replace(/m[12]$/, '');
export const microOf = (dayKey: string): 0 | 1 | 2 => (/m1$/.test(dayKey) ? 1 : /m2$/.test(dayKey) ? 2 : 0);

/** A session's name: "Push", or with microcycles "Push · M1". */
export function sessionLabel(m: PlanMacro, dayKey: string): string {
  const d = dayOf(dayKey);
  const mc = microOf(dayKey);
  return `${m.dayLabels[d] || d}${mc ? ` · M${mc}` : ''}`;
}

/** A template's exercises in BLOC's order: by `order`, then within a superset by `supersetOrder`. */
export function sortedExercises(list: PlanExercise[] | undefined): PlanExercise[] {
  return (list || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0) || (a.supersetOrder || 0) - (b.supersetOrder || 0));
}

/** The visual slots of a template: a solo exercise, or a whole superset (BLOC's reorderExercise). */
export function slotsOf(list: PlanExercise[] | undefined): PlanExercise[][] {
  const sorted = sortedExercises(list);
  const slots: PlanExercise[][] = [];
  const seen = new Set<string>();
  for (const ex of sorted) {
    if (!ex.supersetId) { slots.push([ex]); continue; }
    if (seen.has(ex.supersetId)) continue;
    seen.add(ex.supersetId);
    slots.push(sorted.filter((e) => e.supersetId === ex.supersetId).sort((a, b) => (a.supersetOrder || 0) - (b.supersetOrder || 0)));
  }
  return slots;
}

/** BLOC's superset name: stored, else built from its members (getSupersetDisplayName). */
export function supersetName(doc: PlanDoc, id: string, members: PlanExercise[]): string {
  const stored = doc.supersets[id]?.name;
  if (stored) return stored;
  if (members.length <= 1) return members[0]?.name ?? 'Superset';
  if (members.length === 2) return `${members[0].name} + ${members[1].name}`;
  return `${members[0].name} + ${members[1].name} + ${members.length - 2} more`;
}
export const supersetBadge = (n: number) => (n === 2 ? 'SS' : `${n}S`);

export const totalWeeks = (m: PlanMacro) => getMacroDurationWeeks(m as unknown as Macrocycle);
export const endOf = (m: PlanMacro) => getMacroEndDate(m as unknown as Macrocycle, { today: m.start });
export const isMonday = (d: string) => !!d && new Date(`${d}T12:00:00Z`).getUTCDay() === 1;

/**
 * The deload units, as BLOC keys them (getDeloadUnitKey): one per mesocycle,
 * or with microcycles one per mesocycle and microcycle. A 2-week mesocycle's
 * M1 and M2 are its two calendar weeks; a 1-week mesocycle's are the same week.
 * The dropped M2 of a partial extension mesocycle isn't a unit (isMesoMicroValid).
 */
export function deloadUnits(m: PlanMacro): { key: string; week: number; mc: 0 | 1 | 2; start: string; label: string }[] {
  const mm = m as unknown as Macrocycle;
  const wpm = m.weeksPerMeso || 1;
  const out: { key: string; week: number; mc: 0 | 1 | 2; start: string; label: string }[] = [];
  for (let w = 1; w <= getMacroEffectiveMesoCount(mm); w++) {
    const first = (w - 1) * wpm;
    if (!m.useMicrocycles) {
      out.push({ key: `${m.id}_${w}`, week: w, mc: 0, start: shiftDateStr(m.start, first * 7), label: wpm === 1 ? `Week ${w}` : `Weeks ${first + 1}–${first + wpm}` });
      continue;
    }
    for (const mc of [1, 2] as const) {
      if (!isMesoMicroValid(mm, w, mc)) continue;
      const cal = first + (wpm >= 2 ? mc - 1 : 0);
      out.push({ key: `${m.id}_${w}_m${mc}`, week: w, mc, start: shiftDateStr(m.start, cal * 7), label: wpm >= 2 ? `Week ${cal + 1}` : `Week ${w} · M${mc}` });
    }
  }
  return out;
}

// ── A new cycle ────────────────────────────────────────────────────────────

export interface NewCycleInput {
  name: string;
  start: string;
  weeks: number;
  weeksPerMeso: number;
  goalType: GoalType;
  goal: string;
  targetBw: number | null;
  weightIncrement: string;
  /** 'ppl', or custom session names. */
  split: 'ppl' | { kind: 'custom' | 'fullbody'; sessions: string[] };
  useMicrocycles: boolean;
  rpe: boolean;
}

/** BLOC's createMacrocycle(): PPL days, or `session{n}` for a custom split; sessions a week follow the split. */
export function newCycle(input: NewCycleInput, ids: IdGen): PlanDoc {
  let days: string[];
  let dayLabels: Record<string, string>;
  let splitType: string;
  if (input.split === 'ppl') {
    days = ['push', 'pull', 'legs'];
    dayLabels = { push: 'Push', pull: 'Pull', legs: 'Legs' };
    splitType = 'ppl';
  } else {
    const names = input.split.sessions.map((s) => s.trim()).filter(Boolean);
    const list = names.length ? names : ['Session 1'];
    days = list.map((_, i) => `session${i}`);
    dayLabels = Object.fromEntries(list.map((s, i) => [`session${i}`, s]));
    splitType = input.split.kind;
  }
  const id = ids.macro();
  return {
    macro: {
      id, name: input.name.trim() || 'Macrocycle', start: input.start, weeks: input.weeks, weeksPerMeso: input.weeksPerMeso,
      sessionsPerWeek: days.length, goal: input.goal.trim(), targetBw: input.targetBw, goalType: input.goalType, splitType,
      days, dayLabels, useMicrocycles: input.useMicrocycles, weightIncrement: input.weightIncrement || '2.5', rpe: input.rpe,
    },
    exercises: {}, supersets: {}, deloads: {}, goals: [],
  };
}

// ── The cycle's settings ───────────────────────────────────────────────────

export type SettingsPatch = Partial<Pick<PlanMacro, 'name' | 'goal' | 'targetBw' | 'goalType' | 'weightIncrement' | 'rpe' | 'start' | 'weeks' | 'weeksPerMeso'>>;

/**
 * Edit cycle. A new start moves every goal phase by the same number of days,
 * as BLOC's buildGoalShiftPlan does when a cycle moves, so the phases keep
 * their shape and never overlap each other.
 */
export function editSettings(doc: PlanDoc, patch: SettingsPatch): PlanDoc {
  const next = clone(doc);
  Object.assign(next.macro, patch);
  if (patch.start && patch.start !== doc.macro.start) {
    const delta = dayDiff(doc.macro.start, patch.start);
    next.goals = next.goals.map((g) => ({ ...g, startDate: shiftDateStr(g.startDate, delta), endDate: shiftDateStr(g.endDate, delta) }));
  }
  return next;
}

/** Extend: calendar weeks added at the end (BLOC's extensionWeeks, which repeat the final mesocycle at peak sets). 0 removes it. */
export function setExtension(doc: PlanDoc, weeks: number): PlanDoc {
  const next = clone(doc);
  if (weeks > 0) next.macro.extensionWeeks = weeks; else delete next.macro.extensionWeeks;
  return next;
}

// ── Sessions ───────────────────────────────────────────────────────────────

export function addSession(doc: PlanDoc, label: string): PlanDoc {
  const next = clone(doc);
  let n = next.macro.days.length;
  while (next.macro.days.includes(`session${n}`)) n++;
  const day = `session${n}`;
  next.macro.days.push(day);
  next.macro.dayLabels[day] = label.trim() || `Session ${next.macro.days.length}`;
  next.macro.sessionsPerWeek = next.macro.days.length;
  return next;
}

export function renameSession(doc: PlanDoc, day: string, label: string): PlanDoc {
  const next = clone(doc);
  if (label.trim()) next.macro.dayLabels[day] = label.trim();
  return next;
}

/** Removes a session day and its templates (both microcycles). The supersets only it used go too. */
export function removeSession(doc: PlanDoc, day: string): PlanDoc {
  const next = clone(doc);
  next.macro.days = next.macro.days.filter((d) => d !== day);
  delete next.macro.dayLabels[day];
  next.macro.sessionsPerWeek = next.macro.days.length;
  for (const dk of [day, `${day}m1`, `${day}m2`]) delete next.exercises[keyOf(next.macro.id, dk)];
  return pruneSupersets(next);
}

function pruneSupersets(doc: PlanDoc): PlanDoc {
  const used = new Set(Object.values(doc.exercises).flat().map((e) => e.supersetId).filter(Boolean) as string[]);
  for (const id of Object.keys(doc.supersets)) if (!used.has(id)) delete doc.supersets[id];
  return doc;
}

/** Copies one microcycle's template into the other, with new ids (the other's exercises are replaced). */
export function copyMicro(doc: PlanDoc, day: string, from: 1 | 2, ids: IdGen): PlanDoc {
  const next = clone(doc);
  const to = from === 1 ? 2 : 1;
  const src = sortedExercises(next.exercises[keyOf(next.macro.id, `${day}m${from}`)]);
  const toKey = keyOf(next.macro.id, `${day}m${to}`);
  const ssMap = new Map<string, string>();
  next.exercises[toKey] = src.map((e) => {
    let ss: string | null = null;
    if (e.supersetId) {
      if (!ssMap.has(e.supersetId)) {
        const nid = ids.superset();
        ssMap.set(e.supersetId, nid);
        next.supersets[nid] = { name: next.supersets[e.supersetId]?.name ?? null };
      }
      ss = ssMap.get(e.supersetId)!;
    }
    return { ...clone(e), id: ids.exercise(toKey), supersetId: ss };
  });
  return pruneSupersets(next);
}

// ── Exercises ──────────────────────────────────────────────────────────────

/** A new exercise at the end of the template, or at the end of a superset (BLOC's saveExercise). */
export function addExercise(doc: PlanDoc, dayKey: string, fields: ExerciseFields, ids: IdGen, intoSuperset?: string): PlanDoc {
  const next = clone(doc);
  const key = keyOf(next.macro.id, dayKey);
  const list = next.exercises[key] || (next.exercises[key] = []);
  const ex: PlanExercise = { ...normaliseFields(fields), id: ids.exercise(key), order: 0, supersetId: null, supersetOrder: null };
  const members = intoSuperset ? list.filter((e) => e.supersetId === intoSuperset) : [];
  if (members.length) {
    ex.order = members[0].order;
    ex.supersetId = intoSuperset!;
    ex.supersetOrder = Math.max(...members.map((e) => e.supersetOrder || 0)) + 10;
    if (ex.type === 'dropset') ex.type = 'standard'; // a drop set can't be in a superset
  } else {
    ex.order = list.length ? Math.max(...list.map((e) => e.order || 0)) + 10 : 0;
  }
  list.push(ex);
  return next;
}

/** An edit keeps the exercise's id, place and superset, so its logs stay attached. */
export function updateExercise(doc: PlanDoc, dayKey: string, id: string, fields: ExerciseFields): PlanDoc {
  const next = clone(doc);
  const list = next.exercises[keyOf(next.macro.id, dayKey)] || [];
  const i = list.findIndex((e) => e.id === id);
  if (i < 0) return doc;
  const cur = list[i];
  const f = normaliseFields(fields);
  if (cur.supersetId && f.type === 'dropset') f.type = 'standard';
  list[i] = { ...f, id: cur.id, order: cur.order, supersetId: cur.supersetId, supersetOrder: cur.supersetOrder };
  return next;
}

function normaliseFields(f: ExerciseFields): ExerciseFields {
  const out = { ...f };
  if (out.category === 'cardio') {
    Object.assign(out, { type: 'standard', reps: '', startWeight: 0, isHeavyLeg: false, trackingMode: 'total' });
  } else {
    for (const k of ['metricType', 'targetSeconds', 'targetDistance', 'distanceUnit', 'speedLevel', 'resistanceLevel']) delete (out as Record<string, unknown>)[k];
    if (out.type === 'giant') { out.setsStart = 1; out.setsEnd = 1; }
  }
  if (out.setsEnd < out.setsStart) out.setsEnd = out.setsStart;
  return out;
}

/** Removes an exercise. A superset left with one member dissolves (BLOC's unlinkExercise). */
export function removeExercise(doc: PlanDoc, dayKey: string, id: string): PlanDoc {
  const next = clone(doc);
  const key = keyOf(next.macro.id, dayKey);
  const list = (next.exercises[key] || []).filter((e) => e.id !== id);
  next.exercises[key] = dissolveSingles(list);
  return pruneSupersets(next);
}

function dissolveSingles(list: PlanExercise[]): PlanExercise[] {
  const counts = new Map<string, number>();
  for (const e of list) if (e.supersetId) counts.set(e.supersetId, (counts.get(e.supersetId) || 0) + 1);
  return list.map((e) => (e.supersetId && counts.get(e.supersetId) === 1 ? { ...e, supersetId: null, supersetOrder: null } : e));
}

/** Moves a slot (a solo exercise or a whole superset) up or down; orders are renumbered 0, 10, 20… (BLOC's reorderExercise). */
export function moveSlot(doc: PlanDoc, dayKey: string, from: number, to: number): PlanDoc {
  const next = clone(doc);
  const key = keyOf(next.macro.id, dayKey);
  const slots = slotsOf(next.exercises[key]);
  if (from < 0 || from >= slots.length || to < 0 || to >= slots.length || from === to) return doc;
  const [moved] = slots.splice(from, 1);
  slots.splice(to, 0, moved);
  const byId = new Map((next.exercises[key] || []).map((e) => [e.id, e]));
  slots.forEach((slot, i) => slot.forEach((e) => { byId.get(e.id)!.order = i * 10; }));
  return next;
}

/** Moves an exercise within its superset (BLOC's reorderSupersetExercise); the first is the sets leader. */
export function moveInSuperset(doc: PlanDoc, dayKey: string, supersetId: string, from: number, to: number): PlanDoc {
  const next = clone(doc);
  const list = next.exercises[keyOf(next.macro.id, dayKey)] || [];
  const members = list.filter((e) => e.supersetId === supersetId).sort((a, b) => (a.supersetOrder || 0) - (b.supersetOrder || 0));
  if (from < 0 || from >= members.length || to < 0 || to >= members.length || from === to) return doc;
  const [moved] = members.splice(from, 1);
  members.splice(to, 0, moved);
  members.forEach((e, i) => { e.supersetOrder = i * 10; });
  return next;
}

/**
 * Links exercises into a superset (BLOC's confirmLink): the tapped one leads
 * (sets), the group sits at the earliest member's place. Extending a superset
 * keeps its id; members left out of it go solo. Drop sets can't be members.
 */
export function linkSuperset(doc: PlanDoc, dayKey: string, leaderId: string, memberIds: string[], ids: IdGen): PlanDoc {
  const next = clone(doc);
  const key = keyOf(next.macro.id, dayKey);
  const list = next.exercises[key] || [];
  const leader = list.find((e) => e.id === leaderId);
  const chosen = [leaderId, ...memberIds.filter((x) => x !== leaderId)].filter((id) => {
    const e = list.find((x) => x.id === id);
    return e && e.type !== 'dropset';
  });
  if (!leader || chosen.length < 2) return doc;
  const ssId = leader.supersetId || ids.superset();
  for (const e of list) if (e.supersetId === ssId && !chosen.includes(e.id)) { e.supersetId = null; e.supersetOrder = null; }
  if (!next.supersets[ssId]) next.supersets[ssId] = { name: null };
  const groupOrder = Math.min(...chosen.map((id) => list.find((e) => e.id === id)!.order || 0));
  chosen.forEach((id, i) => {
    const e = list.find((x) => x.id === id)!;
    if (e.supersetId && e.supersetId !== ssId) {
      // Taken from another superset: that one dissolves if it's left with one.
      const old = e.supersetId;
      e.supersetId = null;
      const rest = list.filter((x) => x.supersetId === old);
      if (rest.length === 1) { rest[0].supersetId = null; rest[0].supersetOrder = null; }
    }
    e.supersetId = ssId;
    e.supersetOrder = i * 10;
    e.order = groupOrder;
  });
  return pruneSupersets(next);
}

/** Takes one exercise out of its superset, just after the group; a superset left with one dissolves. */
export function unlinkExercise(doc: PlanDoc, dayKey: string, id: string): PlanDoc {
  const next = clone(doc);
  const key = keyOf(next.macro.id, dayKey);
  const list = next.exercises[key] || [];
  const e = list.find((x) => x.id === id);
  if (!e || !e.supersetId) return doc;
  e.supersetId = null;
  e.supersetOrder = null;
  e.order = (e.order || 0) + 1;
  next.exercises[key] = dissolveSingles(list);
  return renumber(pruneSupersets(next), key);
}

/** Dissolves a whole superset: every member goes solo, in place. */
export function dissolveSuperset(doc: PlanDoc, dayKey: string, supersetId: string): PlanDoc {
  const next = clone(doc);
  const key = keyOf(next.macro.id, dayKey);
  const members = sortedExercises((next.exercises[key] || []).filter((e) => e.supersetId === supersetId));
  members.forEach((e, i) => { e.supersetId = null; e.supersetOrder = null; e.order = (e.order || 0) + i / 100; });
  return renumber(pruneSupersets(next), key);
}

export function renameSuperset(doc: PlanDoc, supersetId: string, name: string): PlanDoc {
  const next = clone(doc);
  next.supersets[supersetId] = { name: name.trim() || null };
  return next;
}

function renumber(doc: PlanDoc, key: string): PlanDoc {
  const byId = new Map((doc.exercises[key] || []).map((e) => [e.id, e]));
  slotsOf(doc.exercises[key]).forEach((slot, i) => slot.forEach((e) => { byId.get(e.id)!.order = i * 10; }));
  return doc;
}

/**
 * Swap an exercise for good (proposal §5.3): a NEW exercise in the same place,
 * superset and set scheme, so the one it replaces keeps its logs in history
 * under its own id and the new one starts its own. The load starts from
 * `startWeight` (the client's last logged weight for that name, when known).
 */
export function swapExercise(doc: PlanDoc, dayKey: string, id: string, to: { name: string; bodyPart: string; category: 'weight' | 'cardio' }, startWeight: number, ids: IdGen): PlanDoc {
  const next = clone(doc);
  const key = keyOf(next.macro.id, dayKey);
  const list = next.exercises[key] || [];
  const i = list.findIndex((e) => e.id === id);
  if (i < 0) return doc;
  const cur = list[i];
  const { id: _i, order: _o, supersetId: _s, supersetOrder: _so, ...own } = cur;
  void _i; void _o; void _s; void _so;
  const fields = normaliseFields({ ...(own as ExerciseFields), name: to.name, bodyPart: to.bodyPart, category: to.category, startWeight });
  list[i] = { ...fields, id: ids.exercise(key), order: cur.order, supersetId: cur.supersetId, supersetOrder: cur.supersetOrder };
  return next;
}

// ── Deloads ────────────────────────────────────────────────────────────────

export function toggleDeload(doc: PlanDoc, key: string): PlanDoc {
  const next = clone(doc);
  if (next.deloads[key]) delete next.deloads[key]; else next.deloads[key] = true;
  return next;
}

// ── Goal phases ────────────────────────────────────────────────────────────

export interface GoalInput { label: string; startDate: string; endDate: string; kcal: number; steps: number; protein: number; carbs: number }

/** Fats from what's left of the calories: (kcal − protein×4 − carbs×4) / 9, never below 0 (as Review's check-in plans send them). */
export const fatsFrom = (kcal: number, protein: number, carbs: number) => Math.max(0, Math.round((kcal - protein * 4 - carbs * 4) / 9));

/** Phases of THIS cycle overlapping [start, end], other than `exceptId`. Goal periods never overlap (BLOC's findOverlappingGoal). */
export function overlappingGoal(doc: PlanDoc, start: string, end: string, exceptId: string | null, others: { startDate: string; endDate: string; macroId?: unknown; _blocLabel?: unknown }[] = []) {
  return [...doc.goals.filter((g) => g.macroGoalID !== exceptId), ...others]
    .find((g) => g.startDate <= end && g.endDate >= start) || null;
}

export function upsertGoal(doc: PlanDoc, id: string | null, input: GoalInput, ids: IdGen): PlanDoc {
  const next = clone(doc);
  const g: PlanGoal = {
    macroId: next.macro.id, macroGoalID: id ?? ids.goal(next.macro.id),
    startDate: input.startDate, endDate: input.endDate, kcal: Math.round(input.kcal), steps: Math.round(input.steps),
    protein: Math.round(input.protein), carbs: Math.round(input.carbs), fats: fatsFrom(input.kcal, input.protein, input.carbs),
    _blocLabel: input.label.trim(),
  };
  const i = next.goals.findIndex((x) => x.macroGoalID === g.macroGoalID);
  if (i >= 0) next.goals[i] = { ...next.goals[i], ...g }; else next.goals.push(g);
  return withStepLabels(next);
}

export function removeGoal(doc: PlanDoc, id: string): PlanDoc {
  const next = clone(doc);
  next.goals = next.goals.filter((g) => g.macroGoalID !== id);
  return withStepLabels(next);
}

/** "Step N - name", renumbered by start date, as BLOC does on every goal save (renumberMacroGoalSteps). */
export function withStepLabels(doc: PlanDoc): PlanDoc {
  const goals = renumberMacroGoalSteps(doc.goals, doc.macro.id) as PlanGoal[];
  return { ...doc, goals: goals.slice().sort((a, b) => a.startDate.localeCompare(b.startDate)) };
}

/** A goal phase's name without its "Step N - " prefix. */
export const phaseName = (g: { _blocLabel?: unknown; label?: unknown }) => String(g._blocLabel || g.label || '').replace(/^Step\s*\d+\s*-?\s*/i, '').trim();

/** Default dates for a new phase: from the day after the last one (or the cycle's start) to the cycle's end. */
export function nextPhaseDates(doc: PlanDoc): { startDate: string; endDate: string } {
  const end = endOf(doc.macro);
  const last = doc.goals.slice().sort((a, b) => a.endDate.localeCompare(b.endDate)).pop();
  const startDate = last ? shiftDateStr(last.endDate, 1) : doc.macro.start;
  return { startDate, endDate: startDate > end ? shiftDateStr(startDate, 13) : end };
}

export { getDayBefore };
