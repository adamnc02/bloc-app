// What the Diary sends to clients: the `booking` publication each card should
// hold, derived from the whole diary, and the difference from what each card
// was last sent. Pure.
//
// A weekly series is ONE booking (`kind: 'weekly'`, dated its first week),
// which BLOC rolls forward itself (BLOC TECHNICAL §136). Its single weeks
// travel on it (migration 0028, BLOC §151): `skip_dates` are its weeks
// cancelled "just this one", its weeks moved "just this one" (each published
// as its own one-off, with the override's id and `replaces` naming the series
// and that week, 0029), and the weeks a day off
// cancelled (they're its `cancelled_dates`); `until` is its last week. A
// one-off is its own booking. A group session is one publication per attendee's
// card, with the same `booking_id`.
//
// 🚨 Derive, then diff; never publish from an action. Every diary change
// re-derives every card's bookings and sends only what differs from the last
// publication, so a publish that failed is sent by the next change, and a
// change that makes no difference to a client sends nothing.
import { addDays, daysBetween, weekday } from '@/lib/format';
import { overrideIsIdentity, seriesDates } from './model';
import type { Booking, Diary, Series } from './types';

/** 0028's `skip_dates` cap. */
export const MAX_SKIP_DATES = 400;

/** Exactly 0023's `booking` keys plus 0028's and 0029's (`assigned_session` arrives with In person). */
export const BOOKING_KEYS = ['v', 'booking_id', 'date', 'start_min', 'duration_min', 'status', 'kind', 'location', 'title', 'skip_dates', 'until', 'quiet', 'replaces'] as const;

export type BookingPayload = {
  v: 1;
  booking_id: string;
  date: string;
  start_min: number;
  duration_min: number;
  status: 'booked' | 'cancelled';
  kind: 'weekly' | 'one_off';
  location: string | null;
  title: string | null;
  skip_dates?: string[];
  until?: string | null;
  quiet?: true;
  /** 0029: the session this new booking takes the place of, so the phone says "Session changed", not "confirmed". */
  replaces?: { booking_id: string; date: string };
};

export interface Outgoing { cardId: string; payload: BookingPayload; supersedes: string | null }

const keyOf = (cardId: string, bookingId: string) => `${cardId}|${bookingId}`;

function seriesPayload(d: Diary, s: Series): BookingPayload | null {
  const first = seriesDates(s, s.from, addDays(s.from, 6))[0];
  if (!first || (s.to && s.to < first)) return null;
  const skips = new Set<string>(s.cancelled.filter((x) => x >= first));
  for (const b of d.bookings) {
    if (b.seriesId !== s.id || !b.occursOn || b.occursOn < first || (s.to && b.occursOn > s.to) || weekday(b.occursOn) !== s.weekday) continue;
    if (!overrideIsIdentity(b, s)) skips.add(b.occursOn);
  }
  const skip = [...skips].sort().slice(-MAX_SKIP_DATES);
  // Every week cancelled or moved (a series stopped from its first week): nothing left to hold.
  const live = s.to ? seriesDates(s, first, s.to).some((x) => !skips.has(x)) : true;
  const prev = predecessor(d, s);
  return {
    v: 1, booking_id: s.id, date: first, start_min: s.start, duration_min: s.duration, status: live ? 'booked' : 'cancelled', kind: 'weekly',
    location: s.location, title: s.title, skip_dates: skip, until: s.to,
    ...(prev ? { replaces: { booking_id: prev.id, date: addDays(prev.to!, 1) } } : {}),
  };
}

/**
 * The weekly series this one continues ("all future" from a later week ends
 * the old series the day before that week and starts this one): the same kind
 * and clients, ended, and this one starting within the week after. Derived
 * from the diary, so every re-derivation gives the same `replaces`.
 */
export function predecessor(d: Pick<Diary, 'series'>, s: Series): Series | null {
  const who = [...s.clientIds].sort().join();
  return d.series.find((t) => t.id !== s.id && t.kind === s.kind && t.to != null && s.from > t.to
    && daysBetween(t.to, s.from) <= 7 && [...t.clientIds].sort().join() === who) ?? null;
}

function oneOffPayload(b: Booking): BookingPayload {
  return {
    v: 1, booking_id: b.id, date: b.date, start_min: b.start, duration_min: b.duration,
    status: b.status, kind: 'one_off', location: b.location, title: b.title,
  };
}

/** Every card's bookings as they should be now, keyed `${cardId}|${booking_id}`. */
export function desiredBookings(d: Diary): Map<string, { cardId: string; payload: BookingPayload }> {
  const out = new Map<string, { cardId: string; payload: BookingPayload }>();
  const put = (cards: string[], payload: BookingPayload | null) => {
    if (payload) for (const cardId of cards) out.set(keyOf(cardId, payload.booking_id), { cardId, payload });
  };
  const series = new Map(d.series.map((s) => [s.id, s]));
  for (const s of d.series) put(s.clientIds, seriesPayload(d, s));
  for (const b of d.bookings) {
    if (!b.seriesId) { put(b.clientIds, oneOffPayload(b)); continue; }
    // A week of a series moved "just this one": its own one-off, while the week is still in its series.
    const s = series.get(b.seriesId);
    if (!s || !b.occursOn || b.occursOn < s.from || (s.to && b.occursOn > s.to) || s.cancelled.includes(b.occursOn)) continue;
    if (b.status === 'cancelled' || overrideIsIdentity(b, s)) continue;
    put(b.clientIds, { ...oneOffPayload(b), replaces: { booking_id: s.id, date: b.occursOn } });
  }
  return out;
}

/** JSON with sorted keys and no `quiet`: two payloads that say the same thing compare equal. */
export function canonical(p: Record<string, unknown>): string {
  const { quiet: _q, ...rest } = p;
  return JSON.stringify(Object.keys(rest).sort().map((k) => [k, rest[k]]));
}

/**
 * What to publish: every desired booking that differs from its last
 * publication, and a cancellation for every booking a card was sent that it
 * should no longer hold (a series removed, a client taken out of a group). A
 * cancelled booking a card was never sent is not sent. `quiet` (the coach
 * chose not to notify) goes on every publication, or only on `quietIds`.
 */
export function bookingChanges(d: Diary, opts: { quiet?: boolean; quietIds?: Set<string> } = {}): Outgoing[] {
  const desired = desiredBookings(d);
  const out: Outgoing[] = [];
  const quietFor = (id: string) => opts.quiet === true || !!opts.quietIds?.has(id);
  for (const [k, { cardId, payload }] of desired) {
    const sent = d.sent[k];
    if (!sent && payload.status === 'cancelled') continue;
    if (sent && canonical(sent.payload) === canonical(payload)) continue;
    out.push({ cardId, payload: quietFor(payload.booking_id) ? { ...payload, quiet: true } : payload, supersedes: sent?.id ?? null });
  }
  for (const [k, sent] of Object.entries(d.sent)) {
    if (desired.has(k) || sent.payload.status === 'cancelled') continue;
    const { quiet: _q, ...last } = sent.payload as BookingPayload;
    const payload: BookingPayload = { ...last, status: 'cancelled' };
    out.push({ cardId: sent.cardId, payload: quietFor(payload.booking_id) ? { ...payload, quiet: true } : payload, supersedes: sent.id });
  }
  return out;
}
