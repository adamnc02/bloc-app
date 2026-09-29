// Every change the Diary makes, as calls on the repo, each followed by the
// one publishing step (`publishChanges`): re-derive every card's bookings and
// send what differs (publish.ts). Shared by the Diary and a client's Sessions
// tab, so a change made in either reaches the client the same way.
import type { ISODate } from '@/domain/types';
import { addDays, weekday } from '@/lib/format';
import type { DiaryRepo } from '@/data/types';
import { isDayOff, requestSlot, type Occurrence } from './model';
import { findClash, findSeriesClash, type Refusal } from './rules';
import { bookingChanges } from './publish';
import { occurrencesBetween } from './model';
import type { Diary, DiarySettings, SessionKind, SessionRequest, Slot } from './types';

export type Scope = 'one' | 'all';

/** The changeable parts of a session. */
export interface SessionPatch {
  date: ISODate;
  start: number;
  duration: number;
  location: string | null;
  title: string | null;
  clientIds: string[];
}

export interface NewSession extends SessionPatch { kind: SessionKind; weekly: boolean }

/** Re-derives and sends every card's booking changes; returns the diary as it now stands. */
export async function publishChanges(repo: DiaryRepo, opts: { quiet?: boolean; quietIds?: Set<string> } = {}): Promise<Diary> {
  const d = await repo.loadDiary();
  const out = bookingChanges(d, opts);
  for (const o of out) await repo.publishBooking(o.cardId, o.payload, o.supersedes);
  return out.length ? repo.loadDiary() : d;
}

/** Move or edit one session; for a series week, just this one or it and every later week. */
export async function editSession(repo: DiaryRepo, d: Diary, occ: Occurrence, p: SessionPatch, scope: Scope): Promise<Diary> {
  const base = { date: p.date, start: p.start, duration: p.duration, location: p.location, title: p.title, clientIds: p.clientIds };
  if (!occ.seriesId) {
    await repo.updateBooking(occ.bookingId!, base);
    return publishChanges(repo);
  }
  const s = d.series.find((x) => x.id === occ.seriesId)!;
  const week = occ.seriesDate!;
  if (scope === 'one') {
    if (occ.bookingId) await repo.updateBooking(occ.bookingId, base);
    else await repo.createBooking({ ...base, seriesId: s.id, occursOn: week, kind: s.kind, status: 'booked' });
    return publishChanges(repo);
  }
  // All future: this week's own changes ("just this one") after it go, then the series moves from here.
  for (const b of d.bookings) if (b.seriesId === s.id && b.occursOn && b.occursOn >= week) await repo.deleteBooking(b.id);
  const next = { weekday: weekday(p.date), start: p.start, duration: p.duration, location: p.location, title: p.title, clientIds: p.clientIds };
  if (week <= s.from) {
    await repo.updateSeries(s.id, { ...next, from: p.date, cancelled: next.weekday === s.weekday ? s.cancelled : [] });
    return publishChanges(repo);
  }
  // The old series ends the day before this week; the new one starts on the new day. The old one's
  // end goes quietly: the client is told once, by the new series' "Session confirmed".
  await repo.updateSeries(s.id, { to: addDays(week, -1) });
  await repo.createSeries({ ...next, kind: s.kind, from: p.date, to: s.to, cancelled: [] });
  return publishChanges(repo, { quietIds: new Set([s.id]) });
}

/** Cancel one session; for a series week, just this one, or stop the series from this week. */
export async function cancelSession(repo: DiaryRepo, d: Diary, occ: Occurrence, scope: Scope): Promise<Diary> {
  if (!occ.seriesId) {
    await repo.updateBooking(occ.bookingId!, { status: 'cancelled' });
    return publishChanges(repo);
  }
  const s = d.series.find((x) => x.id === occ.seriesId)!;
  const week = occ.seriesDate!;
  if (scope === 'one') {
    if (occ.bookingId) await repo.deleteBooking(occ.bookingId);
    await repo.updateSeries(s.id, { cancelled: [...new Set([...s.cancelled, week])].sort() });
    return publishChanges(repo);
  }
  for (const b of d.bookings) if (b.seriesId === s.id && b.occursOn && b.occursOn >= week) await repo.deleteBooking(b.id);
  if (week <= s.from) await repo.deleteSeries(s.id);
  else await repo.updateSeries(s.id, { to: addDays(week, -1) });
  return publishChanges(repo);
}

export async function createSession(repo: DiaryRepo, n: NewSession): Promise<Diary> {
  if (n.weekly) {
    await repo.createSeries({ kind: n.kind, weekday: weekday(n.date), start: n.start, duration: n.duration, from: n.date, to: null, cancelled: [], title: n.title, location: n.location, clientIds: n.clientIds });
  } else {
    await repo.createBooking({ seriesId: null, occursOn: null, date: n.date, start: n.start, duration: n.duration, kind: n.kind, status: 'booked', title: n.title, location: n.location, clientIds: n.clientIds });
  }
  return publishChanges(repo);
}

/** A one-off becomes a weekly session from its date (the one-off's own publication is replaced quietly). */
export async function makeWeekly(repo: DiaryRepo, occ: Occurrence): Promise<Diary> {
  await repo.createSeries({ kind: occ.kind === 'group' ? 'group' : 'one_to_one', weekday: weekday(occ.date), start: occ.start, duration: occ.duration, from: occ.date, to: null, cancelled: [], title: occ.title, location: occ.location, clientIds: occ.clientIds });
  await repo.deleteBooking(occ.bookingId!);
  return publishChanges(repo, { quietIds: new Set([occ.bookingId!]) });
}

/** A day off, or a holiday. `notify` is the coach's answer to "Let clients know?": no means no banner. */
export async function addDayOff(repo: DiaryRepo, start: ISODate, end: ISODate, note: string | null, notify: boolean): Promise<Diary> {
  await repo.addDayOff({ start, end, note, notified: notify });
  return publishChanges(repo, { quiet: !notify });
}
/** Undo a day off: its sessions come back. Clients told about it are told it's back on. */
export async function undoDayOff(repo: DiaryRepo, d: Diary, id: string): Promise<Diary> {
  const off = d.daysOff.find((x) => x.id === id);
  await repo.deleteDayOff(id);
  return publishChanges(repo, { quiet: !off?.notified });
}

export async function saveSettings(repo: DiaryRepo, s: DiarySettings): Promise<Diary> {
  await repo.saveSettings(s);
  return repo.loadDiary();
}

// ---------------------------------------------------------------- requests

/**
 * Book a request at `slot`: a one-off, or for a weekly request a series plus
 * its first week as an override identical to it (0024's `booking_id` names a
 * diary_bookings row, never a series; an identical override is no exception,
 * so the client sees one weekly session). Then the request is accepted and
 * names the booking.
 */
export async function bookRequest(repo: DiaryRepo, d: Diary, r: SessionRequest, slot: Slot): Promise<Diary> {
  if (!r.cardId) throw new Error('This request’s client isn’t linked to a card.');
  const base = { date: slot.date, start: slot.start_min, duration: d.settings.sessionMinutes, kind: 'one_to_one' as const, status: 'booked' as const, title: null, location: null, clientIds: [r.cardId] };
  let bookingId: string;
  if (r.repeatWeekly) {
    const s = await repo.createSeries({ kind: 'one_to_one', weekday: weekday(slot.date), start: slot.start_min, duration: base.duration, from: slot.date, to: null, cancelled: [], title: null, location: null, clientIds: [r.cardId] });
    bookingId = (await repo.createBooking({ ...base, seriesId: s.id, occursOn: slot.date })).id;
  } else {
    bookingId = (await repo.createBooking({ ...base, seriesId: null, occursOn: null })).id;
  }
  await repo.updateRequest(r.id, { status: 'accepted', bookingId });
  return publishChanges(repo);
}

export async function proposeTime(repo: DiaryRepo, r: SessionRequest, slot: Slot): Promise<Diary> {
  await repo.updateRequest(r.id, { status: 'proposed', proposed: { date: slot.date, start_min: slot.start_min } });
  return repo.loadDiary();
}
export async function declineRequest(repo: DiaryRepo, r: SessionRequest): Promise<Diary> {
  await repo.updateRequest(r.id, { status: 'declined' });
  return repo.loadDiary();
}

/** Why a request can't be booked at a time (a day off, or a clash; a weekly request checks its coming weeks). */
export function requestRefusal(d: Diary, r: SessionRequest, slot: Slot, name: (o: Occurrence) => string): Refusal | null {
  const duration = d.settings.sessionMinutes;
  if (r.repeatWeekly) return findSeriesClash(d, { kind: 'one_to_one', weekday: weekday(slot.date), start: slot.start_min, duration, from: slot.date, to: null }, null, name);
  const occs = occurrencesBetween(d, slot.date, slot.date);
  return findClash({ key: `r:${r.id}`, kind: 'one_to_one', date: slot.date, start: slot.start_min, duration }, occs, d.daysOff, name);
}

/**
 * The client accepted the coach's time: book it now, unless it clashes, when
 * it stays a placeholder with the clash shown for the coach to resolve.
 * Returns the requests booked.
 */
export async function autoBook(repo: DiaryRepo, d: Diary, name: (o: Occurrence) => string): Promise<{ diary: Diary; booked: SessionRequest[] }> {
  const booked: SessionRequest[] = [];
  let cur = d;
  for (const r of d.requests) {
    if (r.status !== 'accepted' || r.bookingId || !r.cardId) continue;
    const slot = requestSlot(r);
    if (!slot || requestRefusal(cur, r, slot, name)) continue;
    cur = await bookRequest(repo, cur, r, slot);
    booked.push(r);
  }
  return { diary: cur, booked };
}

// ---------------------------------------------------------------- refusals (checked before saving)

/** Why an edit can't be saved. "All future" checks the series' coming weeks; a single week, its own day. */
export function editRefusal(d: Diary, occ: Occurrence, p: SessionPatch, scope: Scope, name: (o: Occurrence) => string): Refusal | null {
  const kind = occ.kind === 'group' ? 'group' : 'one_to_one';
  if (isDayOff(d.daysOff, p.date)) return { reason: 'That’s a day off' };
  if (occ.seriesId && scope === 'all') {
    const s = d.series.find((x) => x.id === occ.seriesId);
    return findSeriesClash(d, { kind, weekday: weekday(p.date), start: p.start, duration: p.duration, from: p.date, to: s?.to ?? null }, occ.seriesId, name);
  }
  return findClash({ key: occ.key, kind, date: p.date, start: p.start, duration: p.duration }, occurrencesBetween(d, p.date, p.date), d.daysOff, name);
}

export function newRefusal(d: Diary, n: NewSession, name: (o: Occurrence) => string): Refusal | null {
  if (!n.clientIds.length) return { reason: n.kind === 'group' ? 'Choose who’s in the group' : 'Choose a client' };
  if (isDayOff(d.daysOff, n.date)) return { reason: 'That’s a day off' };
  if (n.weekly) return findSeriesClash(d, { kind: n.kind, weekday: weekday(n.date), start: n.start, duration: n.duration, from: n.date, to: null }, null, name);
  return findClash({ key: null, kind: n.kind, date: n.date, start: n.start, duration: n.duration }, occurrencesBetween(d, n.date, n.date), d.daysOff, name);
}
