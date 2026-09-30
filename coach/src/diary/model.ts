// The Diary's occurrences: every session on every day, expanded from the
// weekly series, their "just this one" overrides, the one-offs, and the
// session requests waiting on the coach (placeholders). Pure: no clock, the
// dates are passed in.
//
// 🚨 A day off is a marker, not a filter: marking one CANCELS its sessions for
// good at that moment (actions.ts addDayOff: the series week into
// `cancelled_dates`, a one-off or moved week to status 'cancelled'), and a
// weekly session booked later across it skips its dates the same way. Undoing a
// day off frees the day and brings nothing back: the client was told, and may
// have rebooked.
import type { ISODate } from '@/domain/types';
import { addDays, daysBetween, weekday } from '@/lib/format';
import type { Booking, DayOff, Diary, PlannedWorkout, Series, SessionKind, SessionRequest, Slot } from './types';

export type OccurrenceKind = SessionKind | 'request';

export interface Occurrence {
  /**
   * Stable across moves: `s:{series}@{week's own date}` for a series week (its
   * override too), `b:{booking}` for a one-off, `r:{request}` for a placeholder.
   */
  key: string;
  kind: OccurrenceKind;
  date: ISODate;
  start: number;
  duration: number;
  title: string | null;
  location: string | null;
  clientIds: string[];
  /** Part of a weekly series (edits ask "Just this one" or "All future"); false for a detached week. */
  recurring: boolean;
  seriesId: string | null;
  /** For a series week: the date it falls on in the series, before any move. */
  seriesDate: ISODate | null;
  bookingId: string | null;
  request: SessionRequest | null;
  /** A group's planned workout: the week's own (its override), else its series', else a one-off's (0033). */
  workout: PlannedWorkout | null;
}

export const isDayOff = (daysOff: DayOff[], date: ISODate) => daysOff.some((d) => date >= d.start && date <= d.end);
export const dayOffOn = (daysOff: DayOff[], date: ISODate) => daysOff.find((d) => date >= d.start && date <= d.end) ?? null;

/** The dates a series occurs on in `[from, to]`, before cancellations and overrides. */
export function seriesDates(s: Series, from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  let first = from > s.from ? from : s.from;
  first = addDays(first, (s.weekday - weekday(first) + 7) % 7);
  const last = s.to && s.to < to ? s.to : to;
  for (let d = first; d <= last; d = addDays(d, 7)) out.push(d);
  return out;
}

/**
 * An override that changes nothing about its week (the first week of a booked weekly request, a tagged week, a week
 * with its own workout) isn't an exception. The assignment and the workout aren't compared: neither is part of the
 * booking the phone holds.
 */
export function overrideIsIdentity(b: Booking, s: Series): boolean {
  return b.status === 'booked' && b.date === b.occursOn && b.start === s.start && b.duration === s.duration
    && (b.location ?? null) === (s.location ?? null) && (b.title ?? null) === (s.title ?? null)
    && [...b.clientIds].sort().join() === [...s.clientIds].sort().join();
}

/**
 * Whether a week is still its series: an identical override is (a booked weekly request's first week, a tagged
 * week), unless it has already reached a phone as its own booking. 🚨 A week that was detached (a different group
 * that week, a new time) and later matches its series again (the series changed around it: a client taken out of
 * the whole group) stays detached; folding it back in re-sent the series with that week restored and cancelled the
 * week's own booking, two banners about a session that hadn't changed.
 */
export function stillInSeries(d: Pick<Diary, 'sent'>, b: Booking, s: Series): boolean {
  if (!overrideIsIdentity(b, s)) return false;
  return !Object.entries(d.sent).some(([k, x]) => k.endsWith(`|${b.id}`) && x.payload.status === 'booked');
}

/**
 * The slot a placeholder sits on: what's waiting on the coach, or on the
 * client. Pending: the first choice. Proposed: the coach's time. Countered:
 * the client's counter. Accepted but not yet booked: the time accepted.
 */
export function requestSlot(r: SessionRequest): Slot | null {
  if (r.status === 'pending') return r.preferences[0] ?? null;
  if (r.status === 'proposed') return r.proposed;
  if (r.status === 'countered') return r.counter ?? r.proposed;
  if (r.status === 'accepted' && !r.bookingId) return r.proposed ?? r.counter ?? r.preferences[0] ?? null;
  return null;
}

/**
 * Days after which a request still waiting on the coach leaves the Diary.
 * `null`: placeholders never expire. To switch expiry on, set a number: it is
 * the only thing that reads it, and the request itself is untouched (it can
 * still be answered from the client's Sessions tab).
 */
export const PLACEHOLDER_EXPIRY_DAYS: number | null = null;

/**
 * How a placeholder is drawn: `requested` (the client's time, waiting on the
 * coach: a new request, or the client suggesting another time), `offered` (the
 * coach's time, waiting on the client), `confirmed` (the client accepted the
 * coach's time but it wasn't booked, because it clashes or has passed: the coach
 * moves it).
 */
export type PlaceholderState = 'requested' | 'offered' | 'confirmed';
export function placeholderState(r: SessionRequest): PlaceholderState {
  if (r.status === 'proposed') return 'offered';
  if (r.status === 'accepted') return 'confirmed';
  return 'requested';
}

/** Requests the Diary shows: still open, or confirmed by the client and not booked yet. */
export const openRequests = (d: Pick<Diary, 'requests'>, today?: ISODate) => d.requests.filter((r) => requestSlot(r) != null
  && (PLACEHOLDER_EXPIRY_DAYS == null || !today || r.status !== 'pending' || daysBetween(r.createdAt.slice(0, 10), today) <= PLACEHOLDER_EXPIRY_DAYS));
/** Requests waiting on the coach (not on the client). */
export const requestsNeedingCoach = (d: Pick<Diary, 'requests'>) =>
  d.requests.filter((r) => r.status === 'pending' || r.status === 'countered' || (r.status === 'accepted' && !r.bookingId));

/** Every session and placeholder whose date falls in `[from, to]`; `today` applies PLACEHOLDER_EXPIRY_DAYS. */
export function occurrencesBetween(d: Diary, from: ISODate, to: ISODate, today?: ISODate): Occurrence[] {
  const out: Occurrence[] = [];
  const overrides = new Map<string, Booking>();
  for (const b of d.bookings) if (b.seriesId && b.occursOn) overrides.set(`${b.seriesId}@${b.occursOn}`, b);

  for (const s of d.series) {
    // A week moved into the window from outside it still shows: look a week either side.
    for (const date of seriesDates(s, addDays(from, -7), addDays(to, 7))) {
      if (s.cancelled.includes(date)) continue;
      const ov = overrides.get(`${s.id}@${date}`);
      if (ov && ov.status === 'cancelled') continue;
      const at = ov ?? null;
      // 🚨 A week changed on its own is DETACHED: a one-off from then on (edits and cancels touch it alone, no
      // "Just this one / All future"). An override identical to its week (a booked weekly request's first week)
      // is still the series.
      const detached = !!at && !stillInSeries(d, at, s);
      const occ: Occurrence = {
        key: `s:${s.id}@${date}`, kind: at?.kind ?? s.kind, date: at?.date ?? date, start: at?.start ?? s.start,
        duration: at?.duration ?? s.duration, title: at ? at.title : s.title, location: at ? at.location : s.location,
        clientIds: at?.clientIds ?? s.clientIds, recurring: !detached, seriesId: s.id, seriesDate: date,
        bookingId: at?.id ?? null, request: null, workout: at?.workout ?? s.workout ?? null,
      };
      if (occ.date < from || occ.date > to) continue;
      out.push(occ);
    }
  }
  for (const b of d.bookings) {
    if (b.seriesId || b.status !== 'booked' || b.date < from || b.date > to) continue;
    out.push({
      key: `b:${b.id}`, kind: b.kind, date: b.date, start: b.start, duration: b.duration, title: b.title, location: b.location,
      clientIds: b.clientIds, recurring: false, seriesId: null, seriesDate: null, bookingId: b.id, request: null, workout: b.workout ?? null,
    });
  }
  for (const r of openRequests(d, today)) {
    const slot = requestSlot(r)!;
    if (slot.date < from || slot.date > to) continue;
    out.push({
      key: `r:${r.id}`, kind: 'request', date: slot.date, start: slot.start_min, duration: d.settings.sessionMinutes,
      title: null, location: null, clientIds: r.cardId ? [r.cardId] : [], recurring: false, seriesId: null, seriesDate: null,
      bookingId: null, request: r, workout: null,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
}

/** The sessions cancelled on a day (a day off's, for its note): cancelled weeks of weekly sessions, and cancelled bookings. */
export function cancelledOn(d: Pick<Diary, 'series' | 'bookings'>, date: ISODate): { count: number; clientIds: string[] } {
  const ids = new Set<string>();
  let count = 0;
  for (const s of d.series) {
    if (s.weekday !== weekday(date) || date < s.from || (s.to && date > s.to) || !s.cancelled.includes(date)) continue;
    count++; s.clientIds.forEach((c) => ids.add(c));
  }
  for (const b of d.bookings) {
    if (b.status !== 'cancelled' || b.date !== date) continue;
    count++; b.clientIds.forEach((c) => ids.add(c));
  }
  return { count, clientIds: [...ids] };
}

/**
 * A weekly session's next week still in the series (not cancelled, not moved on its own), within the next half year;
 * null when it has none left: it's over, whatever its end date says (its moved weeks are one-offs).
 */
export function nextSeriesWeek(d: Diary, seriesId: string, today: ISODate): Occurrence | null {
  return occurrencesBetween(d, today, addDays(today, 180)).find((o) => o.seriesId === seriesId && o.recurring) ?? null;
}

/** The next `n` days from `from`, as dates. */
export const daysFrom = (from: ISODate, n: number) => Array.from({ length: n }, (_, i) => addDays(from, i));

/** "Sat 3 Oct – Sun 11 Oct" is 9 days. */
export const dayCount = (o: DayOff) => daysBetween(o.start, o.end) + 1;
