// ═══════════════════════════════════════════════════════════════════════
// Where a client's plan stands: the published baseline Plan edits start from
// (TECHNICAL §144).
//
// The client's upload is what their phone holds. On top of it go the coach's
// own publications that the upload hasn't applied yet (not in its
// `coachLedger` as applied or superseded): a plan published a minute ago, one
// held on the phone, or everything, for a client who hasn't linked or synced
// yet (§11 Q16) or isn't on the app (Q19). They're applied as BLOC's funnel
// applies them (§131): a `plan` patches the coach's macrocycle fields and
// replaces whole session templates; `goal_phases` and a check-in's
// `goal_changes` upsert goals by `macroGoalID`.
//
// 🚨 Only publications made AFTER the card's last unlink count. Unlinking
//    removes every coach cycle and goal from the client's phone (§132), and
//    BLOC's ledger keeps those publications settled, so they never come back.
//    Folding them in would show the coach a plan the client doesn't have.
// 🚨 A client's own cycle (no `publishedBy`) is theirs: shown, never edited.
// ═══════════════════════════════════════════════════════════════════════
import type { BlocState, Loose, Macrocycle } from '@engine';
import type { CoachPublication } from '@/ai/types';
import { MACRO_FIELDS, keyOf, type PlanDoc, type PlanExercise, type PlanGoal, type PlanMacro } from './doc';

export type PubStatus = 'applied' | 'waiting' | 'held' | 'not-sent';

export interface CycleEntry {
  id: string;
  name: string;
  start: string;
  coachOwned: boolean;
  /** The published document (coach-owned), or the client's cycle as their phone holds it. */
  doc: PlanDoc;
  /**
   * Where the coach's latest publication about this cycle stands on the phone:
   * applied; waiting (not pulled yet, or the client hasn't synced since);
   * held (BLOC's receipt says why). Null for a client's own cycle.
   */
  status: { state: Exclude<PubStatus, 'not-sent'>; note: string | null; at: string } | null;
}

interface Mini {
  macrocycles: Macrocycle[];
  exercises: Record<string, PlanExercise[]>;
  supersets: Record<string, { name: string | null }>;
  deloads: Record<string, true>;
  goals: PlanGoal[];
}

const copy = <T>(v: T): T => (v == null ? v : (JSON.parse(JSON.stringify(v)) as T));

/** A key belongs to the LONGEST cycle id it starts with (ids aren't prefix-free; BLOC's removeCoachPlan). */
export function ownerOf(key: string, ids: string[]): string | null {
  return ids.filter((id) => key.startsWith(`${id}_`)).sort((a, b) => b.length - a.length)[0] ?? null;
}

function applyGoals(s: Mini, goals: unknown, remove: unknown, macroId: unknown) {
  const gone = new Set(Array.isArray(remove) ? remove.map(String) : []);
  if (gone.size) s.goals = s.goals.filter((g) => !gone.has(g.macroGoalID));
  for (const g of Array.isArray(goals) ? (goals as PlanGoal[]) : []) {
    if (!g || !g.macroGoalID) continue;
    const next = { ...copy(g), macroId: g.macroId || String(macroId ?? '') };
    const i = s.goals.findIndex((x) => x.macroGoalID === g.macroGoalID);
    if (i >= 0) s.goals[i] = next; else s.goals.push(next);
  }
}

function applyPlan(s: Mini, p: Loose, coachId: string) {
  const inc = p.macrocycle && typeof p.macrocycle === 'object' ? (p.macrocycle as Loose) : null;
  if (inc && typeof inc.id === 'string') {
    const i = s.macrocycles.findIndex((m) => m.id === inc.id);
    const patch: Loose = {};
    for (const f of MACRO_FIELDS) if (f in inc) patch[f] = copy(inc[f]);
    const next = { ...(i >= 0 ? s.macrocycles[i] : { id: inc.id }), ...patch, publishedBy: coachId } as Macrocycle;
    if (i >= 0) s.macrocycles[i] = next; else s.macrocycles.push(next);
  }
  for (const [k, list] of Object.entries((p.exercises as Record<string, unknown>) || {})) s.exercises[k] = copy(Array.isArray(list) ? list : []) as PlanExercise[];
  const rm = new Set(Array.isArray(p.remove_exercise_ids) ? (p.remove_exercise_ids as string[]) : []);
  if (rm.size) for (const k of Object.keys(s.exercises)) s.exercises[k] = s.exercises[k].filter((e) => !rm.has(e.id));
  for (const [id, ss] of Object.entries((p.supersets as Record<string, Loose>) || {})) s.supersets[id] = { name: (ss && (ss.name as string)) ?? null };
  for (const id of (p.remove_superset_ids as string[]) || []) delete s.supersets[id];
  for (const [k, on] of Object.entries((p.deloads as Record<string, boolean>) || {})) { if (on) s.deloads[k] = true; else delete s.deloads[k]; }
}

export interface FoldInput {
  /** The client's newest upload, if any. */
  state: BlocState | null;
  /** This card's plan, goal_phases and ai_response publications, with receipts. */
  publications: CoachPublication[];
  coachId: string;
  /** When the card's last link ended; earlier publications are gone from the phone. */
  since: string | null;
}

/** Every cycle the coach can see for this client, oldest first. */
export function foldPlan({ state, publications, coachId, since }: FoldInput): CycleEntry[] {
  const st = (state || {}) as Loose;
  const s: Mini = {
    macrocycles: copy((st.macrocycles as Macrocycle[]) || []),
    exercises: copy((st.exercises as Record<string, PlanExercise[]>) || {}),
    supersets: copy((st.supersets as Record<string, { name: string | null }>) || {}),
    deloads: copy((st.deloads as Record<string, true>) || {}),
    goals: copy((st.goals as PlanGoal[]) || []),
  };
  const ledger = ((st.coachLedger as Record<string, { status?: string; note?: string | null }>) || {});
  const pubs = publications
    .filter((p) => ['plan', 'goal_phases', 'ai_response'].includes(p.type) && (!since || p.createdAt > since))
    .sort((a, b) => a.seq - b.seq);
  const superseded = new Set(pubs.map((p) => p.supersedes).filter(Boolean) as string[]);
  const touched = new Map<string, CoachPublication>(); // macro id → its latest plan/goal publication
  const planOf = new Map<string, CoachPublication>(); // macro id → its latest plan publication

  for (const p of pubs) {
    const pay = p.payload || {};
    const macroId = p.type === 'plan' ? ((pay.macrocycle as Loose)?.id as string) ?? firstMacroOfKeys(pay, s) : (pay.macro_id as string) ?? null;
    if (p.type === 'ai_response' && !(pay.goal_changes && typeof pay.goal_changes === 'object')) continue;
    if (macroId) { touched.set(macroId, p); if (p.type === 'plan') planOf.set(macroId, p); }
    const settled = ledger[p.id]?.status;
    if (superseded.has(p.id) || settled === 'applied' || settled === 'superseded') continue;
    if (p.type === 'plan') applyPlan(s, pay, coachId);
    else if (p.type === 'goal_phases') applyGoals(s, pay.goals, pay.remove_goal_ids, pay.macro_id);
    else { const gc = pay.goal_changes as Loose; applyGoals(s, gc.goals, gc.remove_goal_ids, pay.macro_id); }
  }

  const ids = s.macrocycles.map((m) => m.id);
  return s.macrocycles
    .filter((m) => m && m.id && m.start)
    .map((m): CycleEntry => {
      const doc = docOf(s, m, ids);
      const coachOwned = !!m.publishedBy;
      // The cycle's own (plan) publication says whether the phone has it; a
      // later goal phase row only repeats "its cycle isn't on this phone".
      const last = planOf.get(m.id) ?? touched.get(m.id);
      let status: CycleEntry['status'] = null;
      if (coachOwned && last) {
        // 🚨 The upload's ledger is the phone's own record and wins over the
        //    server's receipt. A receipt is sent once; a state restored from
        //    another copy of the account can carry a ledger that says "sent"
        //    while the server still holds an older answer.
        const l = state ? ledger[last.id] : undefined;
        const ack = last.ack;
        const held = l ? l.status === 'needs_attention' : ack?.status === 'needs_attention';
        const applied = l ? l.status === 'applied' : ack?.status === 'applied';
        status = held ? { state: 'held', note: (l ? l.note : ack?.note) || null, at: last.createdAt }
          : applied ? { state: 'applied', note: null, at: last.createdAt }
          : { state: 'waiting', note: null, at: last.createdAt };
      }
      return { id: m.id, name: String((m as Loose).name || 'Cycle'), start: String(m.start), coachOwned, doc, status };
    })
    .sort((a, b) => a.start.localeCompare(b.start));
}

function firstMacroOfKeys(p: Loose, s: Mini): string | null {
  const keys = [...Object.keys((p.exercises as object) || {}), ...Object.keys((p.deloads as object) || {})];
  return keys.length ? ownerOf(keys[0], s.macrocycles.map((m) => m.id)) : null;
}

/** One cycle's document, in PlanDoc's shapes with BLOC's defaults filled in. */
function docOf(s: Mini, m: Macrocycle, ids: string[]): PlanDoc {
  const mm = m as Loose;
  const days = Array.isArray(mm.days) && mm.days.length ? (mm.days as string[]) : ['push', 'pull', 'legs'];
  const macro: PlanMacro = {
    id: m.id, name: String(mm.name || 'Cycle'), start: String(m.start), weeks: Number(mm.weeks) || 8, weeksPerMeso: Number(mm.weeksPerMeso) || 1,
    sessionsPerWeek: Number(mm.sessionsPerWeek) || days.length, goal: String(mm.goal || ''), targetBw: mm.targetBw == null || mm.targetBw === '' ? null : Number(mm.targetBw),
    goalType: (['gain', 'maintenance'].includes(String(mm.goalType)) ? mm.goalType : 'loss') as PlanMacro['goalType'],
    splitType: String(mm.splitType || 'ppl'), days: days.slice(),
    dayLabels: { ...Object.fromEntries(days.map((d) => [d, d === 'push' ? 'Push' : d === 'pull' ? 'Pull' : d === 'legs' ? 'Legs' : d])), ...((mm.dayLabels as Record<string, string>) || {}) },
    useMicrocycles: mm.useMicrocycles !== false, weightIncrement: String(mm.weightIncrement ?? '2.5'), rpe: mm.rpe === true,
  };
  if (Number(mm.extensionWeeks) > 0) macro.extensionWeeks = Number(mm.extensionWeeks);
  const exercises: Record<string, PlanExercise[]> = {};
  for (const [k, list] of Object.entries(s.exercises)) if (ownerOf(k, ids) === m.id && Array.isArray(list)) exercises[k] = list.map(fillExercise);
  const ssUsed = new Set(Object.values(exercises).flat().map((e) => e.supersetId).filter(Boolean) as string[]);
  const supersets = Object.fromEntries([...ssUsed].map((id) => [id, { name: s.supersets[id]?.name ?? null }]));
  const deloads = Object.fromEntries(Object.keys(s.deloads).filter((k) => ownerOf(k, ids) === m.id && s.deloads[k]).map((k) => [k, true as const]));
  const goals = s.goals.filter((g) => g && g.macroId === m.id).map((g) => ({ ...g })).sort((a, b) => a.startDate.localeCompare(b.startDate));
  return { macro, exercises, supersets, deloads, goals };
}

/** BLOC's exercise defaults for fields an old template may lack (a missing category reads as weight). */
function fillExercise(e: PlanExercise): PlanExercise {
  const x = { ...e };
  if (x.category !== 'cardio') x.category = 'weight';
  if (!x.type) x.type = 'standard';
  if (x.trackingMode !== 'perSide') x.trackingMode = 'total';
  x.isHeavyLeg = !!x.isHeavyLeg;
  x.setsStart = Number(x.setsStart) || 1;
  x.setsEnd = Number(x.setsEnd) || x.setsStart;
  x.startWeight = Number(x.startWeight) || 0;
  x.reps = x.reps == null ? '' : String(x.reps);
  x.order = Number(x.order) || 0;
  x.supersetId = x.supersetId || null;
  x.supersetOrder = x.supersetOrder == null ? null : Number(x.supersetOrder);
  return x;
}

export { keyOf };
