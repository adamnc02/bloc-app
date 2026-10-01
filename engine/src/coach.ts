// ═══════════════════════════════════════════════════════════════════════
// A coached client's check-in schedule, and which of From your coach's tabs
// are ready (TECHNICAL §168). One implementation, read by BLOC (Progress →
// From your coach) and BLOC Coach (Review's AI tools, Today's Needs you and
// Coming up), so the two apps never disagree about whether a check-in is due.
//
// A client never asks for a check-in: it comes due on this schedule.
//   · Due once the running cycle has the engine's minimum data to judge
//     (computeCheckinState's hasEnoughData, Solo's baseline and comparison
//     window), then again 14 days after each check-in the coach PUBLISHED on the
//     cycle (Solo's fallback cooldown: the Monday after two weeks on). A run
//     the coach never published doesn't count: the client got nothing.
//   · Published dates are the only input both apps can see: BLOC has the
//     responses it received, Coach the publications it sent.
// 🚨 computeWeeklyInsights() throws on a running cycle with 0 or 1 weigh-ins
//    (BACKLOG P1), so the data check is guarded: a throw reads as not enough
//    data yet, never as a broken screen.
// ═══════════════════════════════════════════════════════════════════════
import type { BlocState, DateStr, Macrocycle } from './state.ts';
import { type EngineContext, getMacroEndDate, getMondayAfter, getSundayAfterWeeks } from './dates.ts';
import { computeCheckinState } from './insights.ts';
import { isCycleReviewDue, isInFinalWeek } from './cycles.ts';

/** The days before a cycle's end that next-cycle advice opens (isNextCycleAdviceEligible's window). */
const NEXT_CYCLE_WINDOW_DAYS = 21;

export interface CoachCheckinSchedule {
  /** The cycle has the minimum data a check-in needs. */
  enoughData: boolean;
  /** A check-in is due today: the cycle is running, has the data, and 14 days have passed since the last one published. */
  due: boolean;
  /** When the next one is due (after a published check-in), or null (none published yet). */
  dueOn: DateStr | null;
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
  if (!macro || !macro.start) return { enoughData: false, due: false, dueOn, lastOn, weeksToData: 0 };
  let st = null;
  try { st = computeCheckinState(s, ctx, macro); } catch { st = null; }
  const enoughData = !!(st && st.hasEnoughData);
  const running = ctx.today >= macro.start && ctx.today <= getMacroEndDate(macro, ctx);
  const due = running && enoughData && (!dueOn || ctx.today >= dueOn);
  const weeksLogged = st && st.ins && Array.isArray(st.ins.weekBuckets) ? st.ins.weekBuckets.length : 0;
  const weeksToData = enoughData ? 0 : Math.max(0, ((macro.goalType || 'loss') === 'loss' ? 4 : 3) - weeksLogged);
  return { enoughData, due, dueOn, lastOn, weeksToData };
}

export interface CoachTabsReady { checkIn: boolean; cycleReview: boolean; nextCycle: boolean }

/**
 * Which From your coach tabs a cycle shows. A tab appears once its tool is ready on that cycle, and stays for the
 * rest of it (and when the cycle is viewed later): every condition below only becomes true as the cycle goes on,
 * and something already published always shows.
 *   · Check-in: the cycle has had enough data for a check-in, or one has been published.
 *   · Cycle review: from the cycle's final week (when the coach asks for review photos), or once one is published or
 *     photos have been asked for.
 *   · Next cycle: from NEXT_CYCLE_WINDOW_DAYS before the end, or once one is published.
 */
export function coachTabsReady(
  s: BlocState, ctx: EngineContext, macro: Macrocycle | null | undefined,
  had: { checkIn: boolean; cycleReview: boolean; nextCycle: boolean; photosAsked: boolean },
): CoachTabsReady {
  if (!macro || !macro.start) return { checkIn: had.checkIn, cycleReview: had.cycleReview, nextCycle: had.nextCycle };
  let enough = false;
  try { enough = !!computeCheckinState(s, ctx, macro)?.hasEnoughData; } catch { enough = false; }
  const end = getMacroEndDate(macro, ctx);
  const daysToEnd = Math.round((Date.parse(end + 'T00:00:00Z') - Date.parse(ctx.today + 'T00:00:00Z')) / 86400000);
  return {
    checkIn: had.checkIn || enough,
    cycleReview: had.cycleReview || had.photosAsked || isInFinalWeek(macro, ctx) || isCycleReviewDue(macro, ctx),
    nextCycle: had.nextCycle || (ctx.today >= macro.start && daysToEnd <= NEXT_CYCLE_WINDOW_DAYS),
  };
}
