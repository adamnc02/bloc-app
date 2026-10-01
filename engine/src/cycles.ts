// ═══════════════════════════════════════════════════════════════════════
// Which cycle and which goal: by the calendar, by a date, or by what a page
// is showing (TECHNICAL §125).
//
// Moved from index.html in v8.35, UNCHANGED apart from their inputs, behind
// same-named shims. What they used to read from BLOC's globals now arrives as
// arguments: the state as `s`, "today" as `ctx` (§123), and the page's own
// selection (`progressViewMacroId`) as a parameter. BLOC's shims pass
// `state` and `engineCtx()`, so every BLOC call site is unchanged.
// ═══════════════════════════════════════════════════════════════════════

import type { BlocState, DateStr, GoalPeriod, Loose, Macrocycle } from './state.ts';
import { type EngineContext, getMacroEndDate, getNextMonday, getSundayAfterWeeks, shiftDateStr, snapToNextMonday } from './dates.ts';

// ── Which cycle is ACTIVE, by the calendar ────────────────────────────────
// 🚨 Two different ideas are both called "the current cycle" and they are not
// the same thing:
//   · s.currentMacroId / BLOC's progressViewMacroId — what a page is SHOWING.
//     The person changes these with the cycle arrows, and browsing history
//     that way must keep working.
//   · the date-active cycle — the one today falls inside. Nothing chose it;
//     the calendar did.
//
// Returns null when today is BETWEEN cycles or past the last one: there is no
// active cycle to snap to then, and the last selection is left alone rather
// than being wiped.
//
// 🚨 verify-date-active-cycle.mjs's control breaks the comparison below IN THE
//    BUILD and requires its suite to fail. If the expression changes, update it.
export function getDateActiveMacroId(s: BlocState, ctx: EngineContext): string | null {
  const today = ctx.today;
  const hit = (s.macrocycles || []).find(m =>
    m.start && today >= m.start && today <= getMacroEndDate(m, ctx));
  return hit ? hit.id : null;
}

// Suggests a sensible default start date for a brand new macrocycle: the day
// after the most recently-ending existing macrocycle, or today if none exist
// yet. Mirrors the same 'don't overlap the last one' pattern used for Goals.
// Always snapped forward to a Monday — every macrocycle starts on one, so
// the suggested default should never itself need correcting.
//
// (The old code compared Dates; these are YYYY-MM-DD strings, which order the
// same way, and a tie keeps the first cycle as `>` always did.)
export function getNextMacroStart(s: BlocState, ctx: EngineContext): DateStr {
  // Find the latest end date across all macrocycles, return the day after
  const macros = s.macrocycles as Macrocycle[]; // as before: no `|| []` (normaliseState guarantees it)
  if (!macros.length) return snapToNextMonday(ctx.today);
  let latest: DateStr | null = null;
  macros.forEach(m => {
    const end = getMacroEndDate(m, ctx);
    if (!latest || end > latest) latest = end;
  });
  return snapToNextMonday(shiftDateStr(latest as unknown as DateStr, 1));
}

// Returns whichever goal period covers today's date, regardless of macrocycle.
export function getActiveGoal(s: BlocState, ctx: EngineContext): GoalPeriod | null {
  if (!s.goals) return null;
  const today = ctx.today;
  return s.goals.find(g => g.startDate <= today && g.endDate >= today) || null;
}

// The goal covering a specific date for a specific macrocycle. Goals have
// their own start/end dates independent of the macrocycle's, so this is a
// per-day lookup rather than a single "current goal" — that's what lets the
// steps/kcal charts reflect a goal that changed partway through a cycle.
export function getGoalForDate(s: BlocState, dateStr: DateStr, macroId: string): GoalPeriod | null {
  if (!s.goals) return null;
  return s.goals.find(g => g.macroId === macroId && g.startDate <= dateStr && g.endDate >= dateStr) || null;
}

// The goal covering an arbitrary date, regardless of macrocycle — used
// anywhere the person can navigate to a day other than today (e.g. the
// Nutrition page's date picker/swipe) so the targets shown always match
// whichever goal period actually covers that day, not just today's.
export function getGoalForDay(s: BlocState, dateStr: DateStr): GoalPeriod | null {
  if (!s.goals) return null;
  return s.goals.find(g => g.startDate <= dateStr && g.endDate >= dateStr) || null;
}

// Materialises startDate/endDate fields in a recommendation path's goal array,
// anchoring from nextMonday and using each goal's startDate/endDate as provided
// by the LLM (which has been instructed to produce Mon–Sun aligned dates).
// Also back-calculates fats from kcal/protein/carbs. Returns a new array.
//
// (index.html computed a `cycleEnd` here and never read it. The call stays,
// so a missing macro still throws where it always did.)
export function materialiseDates(goals: Loose[], macro: Macrocycle, ctx: EngineContext): Loose[] {
  void getMacroEndDate(macro, ctx);
  return goals.map(g => {
    // Use LLM-provided dates; fall back to sequential Mon–Sun windows if missing
    const start = g.startDate || getNextMonday(ctx);
    const end   = g.endDate   || getSundayAfterWeeks(start, g.weeks || 2);
    // Back-calculate fats: remaining kcal after protein (4 kcal/g) + carbs (4 kcal/g) ÷ 9
    const remainingKcal = Math.max(0, g.kcal - (g.protein * 4) - (g.carbs * 4));
    const fats = Math.round(remainingKcal / 9);
    return { ...g, startDate: start, endDate: end, fats };
  });
}

// True once a macrocycle has reached its effective end date (including any
// extension) — the earliest point a review is allowed to be generated.
export function isCycleReviewDue(macro: Macrocycle | null | undefined, ctx: EngineContext): boolean {
  if (!macro || !macro.start) return false;
  return ctx.today >= getMacroEndDate(macro, ctx);
}

// True for the active cycle's entire final calendar week (the 7 days up to
// and including its actual last day) — when the final-week card replaces the
// mid-cycle check-in (TECHNICAL, "FINAL-WEEK CARD").
export function isInFinalWeek(macro: Macrocycle | null | undefined, ctx: EngineContext): boolean {
  if (!macro || !macro.start) return false;
  return ctx.today >= shiftDateStr(getMacroEndDate(macro, ctx), -6);
}

// Which macrocycle the Progress page is showing: the one it was pointed at
// (`viewMacroId`, BLOC's progressViewMacroId), else s.currentMacroId. Coach
// passes the cycle it is looking at.
//
// 🚨 BLOC's shim first repoints progressViewMacroId at currentMacroId when it
//    names no cycle; that write is BLOC's, and stays in the shim.
export function resolveProgressMacro(s: BlocState, viewMacroId: string | null | undefined): Macrocycle | undefined {
  const macros = s.macrocycles as Macrocycle[];
  return macros.find(m => m.id === viewMacroId) || macros.find(m => m.id === s.currentMacroId);
}
