// ═══════════════════════════════════════════════════════════════════════
// Dates, and "today" (TECHNICAL §123).
//
// 🚨 The engine never reads the clock. "Today" arrives in an EngineContext:
//   · BLOC passes `{ today: getLocalToday() }` (index.html's engineCtx()),
//     which still honours the Demo Tour anchor (§35).
//   · Coach will pass the CLIENT's local date, from the timezone BLOC uploads,
//     never the coach's own.
// verify-engine-pure.mjs runs every export with `new Date()` and `Date.now()`
// throwing.
//
// Every date in `state` is a client-local 'YYYY-MM-DD' string, and all the
// arithmetic here is DST-safe in whatever zone it runs: construct at local
// midnight (`new Date(str + 'T00:00:00')`), move with setDate(), never add
// milliseconds, and read back with toLocalDateStr().
// ═══════════════════════════════════════════════════════════════════════

import type { DateStr, Macrocycle } from './state.ts';

export interface EngineContext {
  /** The client's local calendar date, 'YYYY-MM-DD'. */
  today: DateStr;
}

// Builds a YYYY-MM-DD string from a Date's LOCAL calendar date. Never
// `.toISOString().split('T')[0]`, which converts to UTC first and can land on
// the wrong day (or the same day twice) depending on the timezone offset.
export function toLocalDateStr(d: Date): DateStr {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// The Monday that starts the calendar week containing dateStr.
export function getHomeWeekStart(dateStr: DateStr): DateStr {
  const d = new Date(dateStr + 'T00:00:00');
  const dow = d.getDay(); // 0 = Sunday .. 6 = Saturday
  const diffToMonday = dow === 0 ? 6 : dow - 1;
  d.setDate(d.getDate() - diffToMonday);
  return toLocalDateStr(d);
}

// The 7 calendar-date strings (Monday..Sunday) of the week starting weekStart.
export function getWeekDates(weekStart: DateStr): DateStr[] {
  const dates: DateStr[] = [];
  const d = new Date(weekStart + 'T00:00:00');
  for (let i = 0; i < 7; i++) {
    dates.push(toLocalDateStr(d));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

// Given a start date and a number of weeks, the Sunday end date.
export function getSundayAfterWeeks(startDateStr: DateStr, weeks: number): DateStr {
  const d = new Date(startDateStr + 'T00:00:00');
  d.setDate(d.getDate() + weeks * 7 - 1);
  return toLocalDateStr(d);
}

// The Monday after a given Sunday end date.
export function getMondayAfter(sundayStr: DateStr): DateStr {
  const d = new Date(sundayStr + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return toLocalDateStr(d);
}

// The next Monday on or after today (today itself if it is a Monday). The
// anchor start date for recommended goal sequences.
export function getNextMonday(ctx: EngineContext): DateStr {
  const today = new Date(ctx.today + 'T00:00:00');
  const dow = today.getDay(); // 0=Sun, 1=Mon … 6=Sat
  const daysUntilMon = dow === 1 ? 0 : dow === 0 ? 1 : 8 - dow;
  const monday = new Date(today);
  monday.setDate(today.getDate() + daysUntilMon);
  return toLocalDateStr(monday);
}

// A macrocycle's length in calendar weeks, extension included.
export function getMacroDurationWeeks(macro: Macrocycle): number {
  return ((macro.weeks as number) || 8) * ((macro.weeksPerMeso as number) || 1) + ((macro.extensionWeeks as number) || 0);
}

// The date a macrocycle finishes on: the Sunday of its last week,
// start + weeks*7 - 1 days. A macro with no start is treated as starting today.
//
// 🚨 Returns a STRING. BLOC's getMacroEndDate() shim turns it back into the
// Date its ~40 call sites expect, and for a macro with no start it restores
// the current time of day, which the old in-place version carried over from
// now() (verify-engine-clock.mjs proves the two are identical).
export function getMacroEndDate(macro: Macrocycle, ctx: EngineContext): DateStr {
  const startDate = new Date((macro.start || ctx.today) + 'T00:00:00');
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + getMacroDurationWeeks(macro) * 7 - 1);
  return toLocalDateStr(endDate);
}

// ── Moved in v8.34 (§124): pure date arithmetic ─────

// Rolls a date string forward to the next Monday (or returns it unchanged
// if it's already a Monday).
export function snapToNextMonday(dateStr: DateStr): DateStr {
  const d = new Date(dateStr + 'T00:00:00');
  const dow = d.getDay(); // 0=Sun..6=Sat
  const add = dow === 1 ? 0 : dow === 0 ? 1 : (8 - dow);
  d.setDate(d.getDate() + add);
  return toLocalDateStr(d);
}

// Returns the ISO date string for the day immediately before the given date.
// Used to find where the active goal must end so it closes cleanly right up
// against the new plan's start date, with no gap and no overlap.
export function getDayBefore(dateStr: DateStr): DateStr {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() - 1);
  return toLocalDateStr(d);
}

// Moves a YYYY-MM-DD string by `days` calendar days (local, DST-safe).
export function shiftDateStr(dateStr: DateStr, days: number): DateStr {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return toLocalDateStr(d);
}

// Whole calendar days from a to b (b − a). Noon anchors keep a BST/GMT
// change from rounding a day away. (Date − Date is the old code's own
// arithmetic; the casts only satisfy the type-checker and are erased.)
export function dayDiff(a: DateStr, b: DateStr): number {
  return Math.round(((new Date(b + 'T12:00:00') as unknown as number) - (new Date(a + 'T12:00:00') as unknown as number)) / 86400000);
}
