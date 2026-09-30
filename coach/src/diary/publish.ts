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
// A session assigned for in person (BLOC §136) goes on that card's booking as
// `assigned_session`: on a one-off (or a moved week) from its own attendee row;
// on a weekly session from the identity override of the week it's for (a row
// identical to that week, so the week stays in its series). A card taken out
// of a group that carries on is sent the booking cancelled with `removed: true`
// (0030), so the phone says "You have been removed from …", not "Group session
// cancelled".
//
// 🚨 Derive, then diff; never publish from an action. Every diary change
// re-derives every card's bookings and sends only what differs from the last
// publication, so a publish that failed is sent by the next change, and a
// change that makes no difference to a client sends nothing.
import { addDays, daysBetween, weekday } from '@/lib/format';
import { seriesDates, stillInSeries } from './model';
import type { AssignedSession, Booking, Diary, Series } from './types';

/** 0028's `skip_dates` cap. */
export const MAX_SKIP_DATES = 400;

/** Exactly 0023's `booking` keys plus 0028's, 0029's and 0030's. */
export const BOOKING_KEYS = ['v', 'booking_id', 'date', 'start_min', 'duration_min', 'status', 'kind', 'location', 'title', 'skip_dates', 'until', 'quiet', 'replaces', 'assigned_session', 'removed'] as const;

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
  /** The session this card's client does with the coach in person (0023); absent when none is assigned. */
  assigned_session?: AssignedSession;
  /** 0030: on a cancellation, this card was taken out of a session that carries on for others. */
  removed?: true;
};

export interface Outgoing { cardId: string; payload: BookingPayload; supersedes: string | null }

const keyOf = (cardId: string, bookingId: string) => `${cardId}|${bookingId}`;

function seriesPayload(d: Diary, s: Series): BookingPayload | null {
  const first = seriesDates(s, s.from, addDays(s.from, 6))[0];
  if (!first || (s.to && s.to < first)) return null;
  const skips = new Set<string>(s.cancelled.filter((x) => x >= first));
  for (const b of d.bookings) {
    if (b.seriesId !== s.id || !b.occursOn || b.occursOn < first || (s.to && b.occursOn > s.to) || weekday(b.occursOn) !== s.weekday) continue;
    if (!stillInSeries(d, b, s)) skips.add(b.occursOn);
  }
  const skip = [...skips].sort().slice(-MAX_SKIP_DATES);
  // Every week cancelled or moved (a series stopped from its first week): nothing left to hold.
  const live = s.to ? seriesDates(s, first, s.to).some((x) => !skips.has(x)) : true;
  const prev = predecessor(d, s);
  return {
    v: 1, booking_id: s.id, date: first, start_min: s.start, duration_min: s.duration, status: live ? 'booked' : 'cancelled', kind: 'weekly',
    location: s.location, title: titleOf(s), skip_dates: skip, until: s.to,
    ...(prev ? { replaces: { booking_id: prev.id, date: addDays(prev.to!, 1) } } : {}),
  };
}

/** A booking row's assignment for one card. */
const assignedOn = (b: Booking | undefined, cardId: string): AssignedSession | null => b?.assigned?.[cardId] ?? null;

/**
 * A weekly session's assignment for one card: from the identity override (a row identical to its week) that
 * carries one, the earliest week first. A moved week carries its own, on its own one-off.
 */
export function seriesAssignment(d: Pick<Diary, 'bookings' | 'sent'>, s: Series, cardId: string): AssignedSession | null {
  const rows = d.bookings.filter((b) => b.seriesId === s.id && b.occursOn && b.status === 'booked' && stillInSeries(d, b, s) && assignedOn(b, cardId))
    .sort((a, b) => a.occursOn!.localeCompare(b.occursOn!));
  return assignedOn(rows[0], cardId);
}
const withAssigned = (p: BookingPayload, a: AssignedSession | null): BookingPayload => (a && p.status === 'booked' ? { ...p, assigned_session: { macroId: a.macroId, week: a.week, dayKey: a.dayKey } } : p);

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
    status: b.status, kind: 'one_off', location: b.location, title: titleOf(b),
  };
}

/**
 * A group session always has a title on the phone, and a one-to-one never does:
 * BLOC reads a title as "a group session" ("Added to a group session", naming it).
 */
export const titleOf = (x: Pick<Booking, 'kind' | 'title'>) => (x.kind === 'group' ? x.title?.trim() || 'Group session' : null);

/** Every card's bookings as they should be now, keyed `${cardId}|${booking_id}`. */
export function desiredBookings(d: Diary): Map<string, { cardId: string; payload: BookingPayload }> {
  const out = new Map<string, { cardId: string; payload: BookingPayload }>();
  const put = (cards: string[], payload: BookingPayload | null, assigned: (cardId: string) => AssignedSession | null) => {
    if (payload) for (const cardId of cards) out.set(keyOf(cardId, payload.booking_id), { cardId, payload: withAssigned(payload, assigned(cardId)) });
  };
  const series = new Map(d.series.map((s) => [s.id, s]));
  for (const s of d.series) put(s.clientIds, seriesPayload(d, s), (c) => seriesAssignment(d, s, c));
  for (const b of d.bookings) {
    if (!b.seriesId) { put(b.clientIds, oneOffPayload(b), (c) => assignedOn(b, c)); continue; }
    // A week of a series moved "just this one": its own one-off, while the week is still in its series.
    const s = series.get(b.seriesId);
    if (!s || !b.occursOn || b.occursOn < s.from || (s.to && b.occursOn > s.to) || s.cancelled.includes(b.occursOn)) continue;
    if (b.status === 'cancelled' || stillInSeries(d, b, s)) continue;
    put(b.clientIds, { ...oneOffPayload(b), replaces: { booking_id: s.id, date: b.occursOn } }, (c) => assignedOn(b, c));
  }
  return out;
}

/**
 * JSON with keys sorted at EVERY level, and no `quiet`: two payloads that say the
 * same thing compare equal. 🚨 Postgres returns jsonb objects with their keys
 * reordered (`replaces` comes back `{date, booking_id}`), so sorting only the top
 * level made every sent `replaces` differ from the derived one, and each diary
 * change re-sent every moved week.
 */
export function canonical(p: Record<string, unknown>): string {
  const { quiet: _q, ...rest } = p;
  const sortDeep = (v: unknown): unknown => Array.isArray(v) ? v.map(sortDeep)
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, sortDeep((v as Record<string, unknown>)[k])])) : v;
  return JSON.stringify(sortDeep(rest));
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
  // A booking still on for someone else (a group carrying on): the card left is told it was removed.
  const liveIds = new Set([...desired.values()].filter((x) => x.payload.status === 'booked').map((x) => x.payload.booking_id));
  for (const [k, sent] of Object.entries(d.sent)) {
    if (desired.has(k) || sent.payload.status === 'cancelled') continue;
    const { quiet: _q, assigned_session: _a, removed: _r, ...last } = sent.payload as BookingPayload;
    const payload: BookingPayload = { ...last, status: 'cancelled', ...(liveIds.has(last.booking_id) ? { removed: true as const } : {}) };
    out.push({ cardId: sent.cardId, payload: quietFor(payload.booking_id) ? { ...payload, quiet: true } : payload, supersedes: sent.id });
  }
  return out;
}
