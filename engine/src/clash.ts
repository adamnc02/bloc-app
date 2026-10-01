// ═══════════════════════════════════════════════════════════════════════
// Cycle date ranges: overlaps, and moving goals with a cycle's start
// (TECHNICAL §124, and §108's no-overlap rule).
//
// Moved from index.html in v8.34 behind same-named shims. They're the
// model for the engine's shape: explicit collections and an explicit
// "today", no `state`. Coach's applyPublication validates a
// coach's edit through findMacroClash and buildGoalShiftPlan.
//
// `ctx` is only consulted for a macro with no `start`, which getMacroEndDate
// treats as starting today. findMacroClash never reaches one (it skips
// unstarted cycles), and buildGoalShiftPlan returns early without both
// starts, so neither result depends on the date passed. macroRange on an
// unstarted macro does.
// ═══════════════════════════════════════════════════════════════════════

import type { DateStr, GoalPeriod, Macrocycle } from './state.ts';
import { type EngineContext, getMacroEndDate, shiftDateStr, dayDiff, getDayBefore, snapToNextMonday } from './dates.ts';

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

// ── v8.45: a coach's cycle replacing the client's own running cycle ────────
//
// A coach's plan that overlaps another cycle is HELD by BLOC, never forced
// (§99's no-overlap rule). One overlap can instead be offered to the client
// as a replace: their OWN cycle (not the coach's), running at their today,
// ends early, on the Sunday before the coach's cycle starts. The client
// accepts or keeps their cycle; BLOC shortens it only on their answer.
//
// The rule, shared by BLOC (which asks) and BLOC Coach (which offers it):
//   · the only clash is one cycle, with no `publishedBy`, running at `today`;
//   · the coach's cycle starts on a Monday after `today`, later than that
//     cycle's start;
//   · the shortened cycle ends on whole mesocycles, or on a partial final
//     mesocycle the client hasn't reached yet. Its length is `weeks`
//     mesocycles plus `extensionWeeks` (getMacroDurationWeeks), so a cut
//     inside a started mesocycle would turn this week's training into an
//     extension week and change its targets; that start is refused and the
//     next boundary suggested.
// Goals of that cycle: the one running across the new end is cut to end on
// it; every one starting after it is removed; earlier ones are unchanged.
//
// 🚨 `weeks` must stay ≥ 1: BLOC reads `weeks || 8`, so 0 would become 8.

export type ReplaceBlock = 'coach-cycle' | 'not-running' | 'too-soon' | 'not-monday' | 'mid-meso' | 'other-clash';

export interface ReplaceOffer {
  kind: 'replace';
  clash: Macrocycle;
  /** The replaced cycle's new shape: mesocycles, and whole weeks of a partial final one. */
  weeks: number;
  extensionWeeks: number;
  /** Its new last day (the Sunday before the coach's start), and the old one. */
  newEnd: DateStr;
  oldEnd: DateStr;
  /** Goals of the replaced cycle: cut to end on `newEnd`, or removed. */
  trimGoals: { macroGoalID?: string; label: string; oldEnd: DateStr }[];
  removeGoals: { macroGoalID?: string; label: string; startDate: DateStr }[];
}
export interface ReplaceRefusal {
  kind: 'blocked';
  clash: Macrocycle;
  reason: ReplaceBlock;
  /** The first start that would be accepted as a replace, else the Monday after the clash ends. */
  suggest: DateStr | null;
}

function isMonday(d: DateStr): boolean { return new Date(d + 'T00:00:00').getDay() === 1; }

function replaceShape(clash: Macrocycle, start: DateStr, today: DateStr) {
  const calWeeks = dayDiff(clash.start as string, start) / 7;
  const perMeso = (clash.weeksPerMeso as number) || 1;
  const weeks = Math.floor(calWeeks / perMeso);
  const extensionWeeks = calWeeks - weeks * perMeso;
  // A partial final mesocycle is fine only if it hasn't begun by today.
  const partialStarts = shiftDateStr(clash.start as string, weeks * perMeso * 7);
  const ok = weeks >= 1 && (extensionWeeks === 0 || today < partialStarts);
  return { ok, weeks, extensionWeeks };
}

// Returns null when `candidate` overlaps nothing.
export function planReplaceOffer(candidate: Macrocycle, macros: Macrocycle[] | null | undefined, goals: GoalPeriod[] | null | undefined, ctx: EngineContext): ReplaceOffer | ReplaceRefusal | null {
  const clash = findMacroClash(candidate, macros, candidate.id, ctx);
  if (!clash || !candidate.start) return null;
  const today = ctx.today;
  const clashEnd = getMacroEndDate(clash, ctx);
  const after = snapToNextMonday(shiftDateStr(clashEnd, 1));
  const others = (macros || []).filter(m => m.id !== clash.id);
  const refuse = (reason: ReplaceBlock): ReplaceRefusal => {
    let suggest: DateStr | null = after;
    if (reason !== 'coach-cycle' && reason !== 'not-running' && reason !== 'other-clash') {
      // The first Monday after today that the rule accepts, before the cycle ends.
      for (let s = snapToNextMonday(shiftDateStr(today, 1)); s <= clashEnd; s = shiftDateStr(s, 7)) {
        if (s > (clash.start as string) && replaceShape(clash, s, today).ok
          && !findMacroClash(Object.assign({}, candidate, { start: s }), others, candidate.id, ctx)) { suggest = s; break; }
      }
    }
    return { kind: 'blocked', clash, reason, suggest };
  };
  if (clash.publishedBy) return refuse('coach-cycle');
  if (!((clash.start as string) <= today && today <= clashEnd)) return refuse('not-running');
  if (findMacroClash(candidate, others, candidate.id, ctx)) return refuse('other-clash');
  if (!isMonday(candidate.start)) return refuse('not-monday');
  if (candidate.start <= today || candidate.start <= (clash.start as string)) return refuse('too-soon');
  const shape = replaceShape(clash, candidate.start, today);
  if (!shape.ok) return refuse('mid-meso');

  const newEnd = getDayBefore(candidate.start);
  const mine = (goals || []).filter(g => g.macroId === clash.id);
  const label = (g: GoalPeriod) => String(g._blocLabel || g.label || g.name || 'Goal');
  return {
    kind: 'replace', clash, weeks: shape.weeks, extensionWeeks: shape.extensionWeeks, newEnd, oldEnd: clashEnd,
    trimGoals: mine.filter(g => g.startDate <= newEnd && g.endDate > newEnd)
      .map(g => ({ macroGoalID: g.macroGoalID as string | undefined, label: label(g), oldEnd: g.endDate })),
    removeGoals: mine.filter(g => g.startDate > newEnd)
      .map(g => ({ macroGoalID: g.macroGoalID as string | undefined, label: label(g), startDate: g.startDate })),
  };
}
