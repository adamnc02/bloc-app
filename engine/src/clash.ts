// ═══════════════════════════════════════════════════════════════════════
// Cycle date ranges: overlaps, and moving goals with a cycle's start
// (deep dive §1a, §10 step 3; TECHNICAL §124, and §108's no-overlap rule).
//
// Moved from index.html in v8.34 behind same-named shims. The deep dive
// names these the model for the engine's shape: explicit collections and an
// explicit "today", no `state`. Coach's applyPublication (step 7) validates a
// coach's edit through findMacroClash and buildGoalShiftPlan.
//
// `ctx` is only consulted for a macro with no `start`, which getMacroEndDate
// treats as starting today. findMacroClash never reaches one (it skips
// unstarted cycles), and buildGoalShiftPlan returns early without both
// starts, so neither result depends on the date passed. macroRange on an
// unstarted macro does.
// ═══════════════════════════════════════════════════════════════════════

import type { DateStr, Macrocycle } from './state.ts';
import { type EngineContext, getMacroEndDate, shiftDateStr, dayDiff } from './dates.ts';

export interface Goal {
  macroId?: string;
  macroGoalID?: string;
  startDate: DateStr;
  endDate: DateStr;
  label?: string;
  _blocLabel?: string;
  [k: string]: unknown;
}

// { start, end } as YYYY-MM-DD; end is the Sunday of the last week.
export function macroRange(m: Macrocycle, ctx: EngineContext): { start: DateStr | undefined; end: DateStr } {
  return { start: m.start, end: getMacroEndDate(m, ctx) };
}

// The earliest-starting other cycle whose dates overlap `candidate`'s, or null.
//
// 🚨 verify-macro-no-overlap.mjs's control widens `o.end >= r.start` in THIS
//    function (in the build) and requires its suite to fail. If that
//    expression changes, update the control.
export function findMacroClash(candidate: Macrocycle, macros: Macrocycle[] | null | undefined, excludeId: string | null | undefined, ctx: EngineContext): Macrocycle | null {
  if (!candidate.start) return null;
  const r = macroRange(candidate, ctx);
  return (macros || [])
    .filter(m => m.id !== excludeId && m.start)
    .sort((a, b) => (a.start as string).localeCompare(b.start as string))
    .find(m => { const o = macroRange(m, ctx); return (o.start as string) <= r.end && o.end >= (r.start as string); }) || null;
}

// Plans moving a macrocycle's goal periods when its start date changes.
// Returns null when there is nothing to offer: the start is unchanged, the
// macro had no start, or it has no goal periods.
//
// 🚨 Every goal moves by the SAME number of days in ONE save, so the gaps
// between them are preserved and they cannot overlap each other. Moving them
// one at a time through the goal sheet needs last-to-first order only because
// each single save is checked against the not-yet-moved ones. What CAN still
// collide is a goal in ANOTHER macrocycle — `clashes` — and that blocks the
// move, because goal periods must never overlap (findOverlappingGoal).
//
// 🚨 verify-macro-start-shifts-goals.mjs's control removes the `clash`
//    lookup in THIS function (in the build) and requires its suite to fail.
export function buildGoalShiftPlan(macro: Macrocycle, edits: Partial<Macrocycle>, goals: Goal[], today: DateStr) {
  const oldStart = macro.start;
  const newStart = edits.start;
  if (!oldStart || !newStart || oldStart === newStart) return null;
  const linked = goals.filter(g => g.macroId === macro.id).sort((a, b) => a.startDate.localeCompare(b.startDate));
  if (!linked.length) return null;

  // Both starts are set by here, so `today` never reaches getMacroEndDate's
  // no-start branch; it is passed only because that function needs a ctx.
  const ctx: EngineContext = { today };
  const deltaDays = dayDiff(oldStart, newStart);
  const oldEnd = getMacroEndDate(macro, ctx);
  const newEnd = getMacroEndDate(Object.assign({}, macro, edits), ctx);
  const others = goals.filter(g => g.macroId !== macro.id);

  const rows = linked.map(g => {
    const rs = shiftDateStr(g.startDate, deltaDays);
    const re = shiftDateStr(g.endDate, deltaDays);
    const clash = others.find(o => o.startDate <= re && o.endDate >= rs) || null;
    return {
      macroGoalID: g.macroGoalID,
      label: g._blocLabel || g.label || 'Goal',
      oldStart: g.startDate, oldEnd: g.endDate,
      newStart: rs, newEnd: re,
      daysPastEnd: Math.max(0, dayDiff(newEnd, re)),
      daysBeforeStart: Math.max(0, dayDiff(rs, newStart)),
      clash,
    };
  });

  return {
    deltaDays, oldStart, oldEnd, newStart, newEnd, rows,
    started: oldStart <= today,
    outOfRange: rows.filter(r => r.daysPastEnd || r.daysBeforeStart),
    clashes: rows.filter(r => r.clash),
  };
}
