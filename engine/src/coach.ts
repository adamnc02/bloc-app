// ═══════════════════════════════════════════════════════════════════════
// A coached client's check-in schedule, and which of From your coach's tabs
// are ready (TECHNICAL §168). One implementation, read by BLOC (Progress →
// From your coach) and BLOC Coach (Review's AI tools, Today's Needs you and
// Coming up), so the two apps never disagree about whether a check-in is due.
//
// A client never asks for a check-in: it comes due on this schedule.
//   · The FIRST check-in on a cycle is the engine's call, as Solo's is
//     (computeCheckinState's `eligible`): the running cycle has the minimum
//     data to judge (hasEnoughData) AND its signal warrants one (signalWarrants:
//     a plateau, eating at a deficit on a gain cycle, an unstable maintenance
//     weight…). A client on track has no first check-in.
//   · After the first, every 14 days from the newest check-in the coach
//     PUBLISHED on the cycle (Solo's fallback cooldown: the Monday after two
//     weeks on), whatever the signal. A run the coach never published doesn't
//     count: the client got nothing.
//   · Never in the cycle's FINAL WEEK or after its end: the final week belongs
//     to the cycle review, as Solo's final-week card replaces the mid-cycle
//     check-in (isInFinalWeek). A check-in that would fall due then is simply
//     not shown (`nextOn` null): the review comes next.
// 🚨 Data alone is not the first gate: that made every client with enough logs
//    due, on track or not.
// 🚨 Without the final-week cut-off, a check-in 14 days after one published
//    late in a cycle came due after the cycle had ended, beside its review.
//   · Published dates are the only input both apps can see: BLOC has the
//     responses it received, Coach the publications it sent.
// 🚨 computeWeeklyInsights() throws on a running cycle with 0 or 1 weigh-ins
//    (BACKLOG P1), so the data check is guarded: a throw reads as not enough
//    data yet, never as a broken screen.
// ═══════════════════════════════════════════════════════════════════════
import type { BlocState, DateStr, Macrocycle } from './state.ts';
import { type EngineContext, getMacroEndDate, getMondayAfter, getSundayAfterWeeks, shiftDateStr } from './dates.ts';
import { computeCheckinState } from './insights.ts';
import { isCycleReviewDue, isInFinalWeek } from './cycles.ts';

/** The days before a cycle's end that next-cycle advice opens (isNextCycleAdviceEligible's window). */
const NEXT_CYCLE_WINDOW_DAYS = 21;

export interface CoachCheckinSchedule {
  /** The cycle has the minimum data a check-in needs. */
  enoughData: boolean;
  /** The engine's signal warrants a check-in (Solo's signalWarrants): the first one's other half. */
  signalWarrants: boolean;
  /** A check-in is due today: the cycle is running, has the data, and 14 days have passed since the last one published. */
  due: boolean;
  /** 14 days after the last published (Solo's cooldown), or null (none published yet): the raw date, which may fall in
   *  the final week or after the end. Show `nextOn`. */
  dueOn: DateStr | null;
  /** The next check-in's date if it falls before the final week, else null (the cycle review comes next). */
  nextOn: DateStr | null;
  /** The last day a check-in can be due on this cycle: the day before its final week. */
  checkinsUntil: DateStr | null;
  /** The newest published check-in's date on this cycle, or null. */
  lastOn: DateStr | null;
  /** About how many more weeks of logs before the first one, while there isn't enough data (0 once there is). */
  weeksToData: number;
}

/** The cooldown after a check-in: the Monday after two weeks on. */
export const checkinDueAfter = (on: DateStr): DateStr => getMondayAfter(getSundayAfterWeeks(on, 2));

/**
 * `publishedOn`: the client's dates of the coach's check-ins published on this cycle (any order, duplicates fine).
 */
export function coachCheckinSchedule(s: BlocState, ctx: EngineContext, macro: Macrocycle | null | undefined, publishedOn: DateStr[]): CoachCheckinSchedule {
  const lastOn = [...publishedOn].filter(Boolean).sort().pop() ?? null;
  const dueOn = lastOn ? checkinDueAfter(lastOn) : null;
  if (!macro || !macro.start) return { enoughData: false, signalWarrants: false, due: false, dueOn, nextOn: null, checkinsUntil: null, lastOn, weeksToData: 0 };
  let st = null;
  try { st = computeCheckinState(s, ctx, macro); } catch { st = null; }
  const enoughData = !!(st && st.hasEnoughData);
  const end = getMacroEndDate(macro, ctx);
  const checkinsUntil = shiftDateStr(end, -7);
  // Running and before the final week: the only days a check-in can be due.
  const running = ctx.today >= macro.start && ctx.today <= checkinsUntil;
  const signalWarrants = !!(st && st.signalWarrants);
  // First: the engine's deterministic call (data AND signal). After: the 14-day cooldown.
  const due = running && enoughData && (dueOn ? ctx.today >= dueOn : signalWarrants);
  const weeksLogged = st && st.ins && Array.isArray(st.ins.weekBuckets) ? st.ins.weekBuckets.length : 0;
  const weeksToData = enoughData ? 0 : Math.max(0, ((macro.goalType || 'loss') === 'loss' ? 4 : 3) - weeksLogged);
  const nextOn = dueOn && dueOn <= checkinsUntil ? dueOn : null;
  return { enoughData, signalWarrants, due, dueOn, nextOn, checkinsUntil, lastOn, weeksToData };
}

export interface CoachTabsReady { checkIn: boolean; cycleReview: boolean; nextCycle: boolean }

/**
 * Which From your coach tabs a cycle shows. A tab appears once its tool is ready on that cycle, and stays for the
 * rest of it (and when the cycle is viewed later): every condition below only becomes true as the cycle goes on,
 * and something already published always shows.
 *   · Check-in: the engine has called for the first check-in (data and signal), or one has been published.
 *   · Cycle review: from the cycle's final week (when the coach asks for review photos), or once one is published or
 *     photos have been asked for.
 *   · Next cycle: from NEXT_CYCLE_WINDOW_DAYS before the end, or once one is published.
 */
export function coachTabsReady(
  s: BlocState, ctx: EngineContext, macro: Macrocycle | null | undefined,
  had: { checkIn: boolean; cycleReview: boolean; nextCycle: boolean; photosAsked: boolean },
): CoachTabsReady {
  if (!macro || !macro.start) return { checkIn: had.checkIn, cycleReview: had.cycleReview, nextCycle: had.nextCycle };
  let called = false;
  try { called = !!computeCheckinState(s, ctx, macro)?.eligible; } catch { called = false; }
  const end = getMacroEndDate(macro, ctx);
  const daysToEnd = Math.round((Date.parse(end + 'T00:00:00Z') - Date.parse(ctx.today + 'T00:00:00Z')) / 86400000);
  return {
    checkIn: had.checkIn || called,
    cycleReview: had.cycleReview || had.photosAsked || isInFinalWeek(macro, ctx) || isCycleReviewDue(macro, ctx),
    nextCycle: had.nextCycle || (ctx.today >= macro.start && daysToEnd <= NEXT_CYCLE_WINDOW_DAYS),
  };
}
