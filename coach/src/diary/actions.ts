// Every change the Diary makes, as calls on the repo, each followed by the
// one publishing step (`publishChanges`): re-derive every card's bookings and
// send what differs (publish.ts). Shared by the Diary and a client's Sessions
// tab, so a change made in either reaches the client the same way.
import type { ISODate } from '@/domain/types';
import { addDays, weekday } from '@/lib/format';
import type { DiaryRepo } from '@/data/types';
import { isDayOff, requestSlot, seriesDates, type Occurrence } from './model';
import { findClash, findSeriesClash, type Refusal } from './rules';
import { bookingChanges } from './publish';
import { occurrencesBetween } from './model';
import type { AssignedSession, Diary, DiarySettings, PlannedWorkout, Series, SessionKind, SessionRequest, Slot } from './types';

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

/**
 * A new weekly session skips the days off already marked across it: those
 * weeks go straight into its `cancelled_dates`, exactly as a day off marked
 * later cancels them.
 */
export function daysOffWeeks(d: Pick<Diary, 'daysOff'>, s: Pick<Series, 'weekday' | 'from' | 'to'>, keep: string[] = []): string[] {
  const out = new Set(keep);
  for (const off of d.daysOff) {
    if (s.to && off.start > s.to) continue;
    for (const date of seriesDates({ ...s, id: '', kind: 'one_to_one', start: 0, duration: 0, cancelled: [], title: null, location: null, clientIds: [] }, off.start, off.end)) out.add(date);
  }
  return [...out].sort();
}

/** Re-derives and sends every card's booking changes; returns the diary as it now stands. */
export async function publishChanges(repo: DiaryRepo, opts: { quiet?: boolean; quietIds?: Set<string>; quietCards?: Set<string> } = {}): Promise<Diary> {
  const d = await repo.loadDiary();
  const out = bookingChanges(d, opts);
  for (const o of out) await repo.publishBooking(o.cardId, o.payload, o.supersedes);
  return out.length ? repo.loadDiary() : d;
}

/** Move or edit one session; for a series week, just this one or it and every later week. */
export async function editSession(repo: DiaryRepo, d: Diary, occ: Occurrence, p: SessionPatch, scope: Scope): Promise<Diary> {
  const base = { date: p.date, start: p.start, duration: p.duration, location: p.location, title: p.title, clientIds: p.clientIds };
  // A one-off, or a detached week of a series: that booking alone.
  if (!occ.recurring) {
    await repo.updateBooking(occ.bookingId!, base);
    return publishChanges(repo);
  }
  const s = d.series.find((x) => x.id === occ.seriesId)!;
  const week = occ.seriesDate!;
  if (scope === 'one') {
    if (occ.bookingId) await repo.updateBooking(occ.bookingId, base);
    else await repo.createBooking({ ...base, seriesId: s.id, occursOn: week, kind: s.kind, status: 'booked' });
    // The week leaves the series (a skip date) quietly: the client is told once, by the moved week's own booking.
    return publishChanges(repo, { quietIds: new Set([s.id]) });
  }
  // All future: this week's own changes ("just this one") after it are cancelled, then the series moves from here.
  await cancelOverridesFrom(repo, d, s.id, week);
  const next = { weekday: weekday(p.date), start: p.start, duration: p.duration, location: p.location, title: p.title, clientIds: p.clientIds };
  if (week <= s.from) {
    await repo.updateSeries(s.id, { ...next, from: p.date, cancelled: daysOffWeeks(d, { ...next, from: p.date, to: s.to }, next.weekday === s.weekday ? s.cancelled : []) });
    return publishChanges(repo);
  }
  // The old series ends the day before this week; the new one starts on the new day. The old one's
  // end goes quietly: the client is told once, by the new series' "Session changed".
  await repo.updateSeries(s.id, { to: addDays(week, -1) });
  const created = await repo.createSeries({ ...next, kind: s.kind, from: p.date, to: s.to, cancelled: daysOffWeeks(d, { ...next, from: p.date, to: s.to }) });
  // 🚨 A group changed only in who's in it (someone added "all future"): the people already in it hear nothing,
  //    because nothing changed for them; only a new client is told ("Added to a group session"). Without this every
  //    member got a banner about a session that hadn't changed (§162).
  const quietCards = new Set<string>();
  if (s.kind === 'group' && next.weekday === s.weekday && next.start === s.start && next.duration === s.duration
    && (next.location ?? null) === (s.location ?? null) && (next.title ?? null) === (s.title ?? null)) {
    for (const c of s.clientIds) if (next.clientIds.includes(c)) quietCards.add(`${c}|${created.id}`);
  }
  return publishChanges(repo, { quietIds: new Set([s.id]), quietCards });
}

/** Cancel one session; for a series week, just this one, or stop the series from this week. */
export async function cancelSession(repo: DiaryRepo, d: Diary, occ: Occurrence, scope: Scope): Promise<Diary> {
  // A one-off or a detached week: cancelled alone. A series week with its own row (a booked request's first
  // week): that row cancelled. A plain series week: into the series' cancelled_dates.
  if (!occ.recurring || (scope === 'one' && occ.bookingId)) {
    await repo.updateBooking(occ.bookingId!, { status: 'cancelled' });
    return publishChanges(repo);
  }
  const s = d.series.find((x) => x.id === occ.seriesId)!;
  const week = occ.seriesDate!;
  if (scope === 'one') {
    await repo.updateSeries(s.id, { cancelled: [...new Set([...s.cancelled, week])].sort() });
    return publishChanges(repo);
  }
  await cancelOverridesFrom(repo, d, s.id, week);
  // From its first week: the series keeps its row (a request may name one of its bookings) and occurs never.
  if (week <= s.from) await repo.updateSeries(s.id, { to: s.from, cancelled: [...new Set([...s.cancelled, s.from])].sort() });
  else await repo.updateSeries(s.id, { to: addDays(week, -1) });
  return publishChanges(repo);
}

/**
 * 🚨 Coach never deletes a booking row: `session_requests.booking_id` references it
 * `on delete set null`, so deleting the row a request names leaves an accepted request
 * with no booking, which autoBook then books again (the whole weekly request, clashing
 * with the series it already is). Cancel instead.
 */
async function cancelOverridesFrom(repo: DiaryRepo, d: Diary, seriesId: string, week: string) {
  for (const b of d.bookings) if (b.seriesId === seriesId && b.occursOn && b.occursOn >= week && b.status !== 'cancelled') await repo.updateBooking(b.id, { status: 'cancelled' });
}

export async function createSession(repo: DiaryRepo, d: Diary, n: NewSession): Promise<Diary> {
  if (n.weekly) {
    const wd = weekday(n.date);
    await repo.createSeries({ kind: n.kind, weekday: wd, start: n.start, duration: n.duration, from: n.date, to: null, cancelled: daysOffWeeks(d, { weekday: wd, from: n.date, to: null }), title: n.title, location: n.location, clientIds: n.clientIds });
  } else {
    await repo.createBooking({ seriesId: null, occursOn: null, date: n.date, start: n.start, duration: n.duration, kind: n.kind, status: 'booked', title: n.title, location: n.location, clientIds: n.clientIds });
  }
  return publishChanges(repo);
}

/**
 * Take one client out of a group session, which carries on for everyone else:
 * the weekly group from now on, or a one-off group. That client's card is sent
 * the booking as cancelled with `removed: true` (0030: "You have been removed
 * from …" on their phone, never "Group session cancelled"); the others'
 * bookings don't change, so nothing is sent to them.
 */
export async function removeFromGroup(repo: DiaryRepo, d: Diary, occ: Occurrence, cardId: string): Promise<Diary> {
  const without = occ.clientIds.filter((c) => c !== cardId);
  if (occ.recurring && occ.seriesId) {
    const s = d.series.find((x) => x.id === occ.seriesId)!;
    await repo.updateSeries(s.id, { clientIds: s.clientIds.filter((c) => c !== cardId) });
    // Its weeks changed on their own carry the same group.
    for (const b of d.bookings) if (b.seriesId === s.id && b.status === 'booked' && b.clientIds.includes(cardId)) await repo.updateBooking(b.id, { clientIds: b.clientIds.filter((c) => c !== cardId) });
  } else {
    await repo.updateBooking(occ.bookingId!, { clientIds: without });
  }
  return publishChanges(repo);
}

/** The booking id a session reaches the phone under: its series for a week still in it, else its own booking. */
export const publishedIdOf = (occ: Pick<Occurrence, 'recurring' | 'seriesId' | 'bookingId'>) => (occ.recurring && occ.seriesId ? occ.seriesId : occ.bookingId!);

/**
 * Assign the plan session a client does with the coach in person, or release it (null). On a one-off or a moved
 * week it's that booking's attendee row. On a week still in its weekly series it's that week's identity override
 * (made if there isn't one): a row identical to the week, so the week stays in the series and the phone still
 * holds one weekly booking, now carrying `assigned_session`. Sent quietly: nothing about the time changed, and
 * the client sees it in Train (BLOC §136).
 */
export async function assignSession(repo: DiaryRepo, d: Diary, occ: Occurrence, cardId: string, session: AssignedSession | null): Promise<Diary> {
  let bookingId = occ.bookingId;
  if (!bookingId) {
    if (!session) return d;
    const s = d.series.find((x) => x.id === occ.seriesId);
    if (!s || !occ.seriesDate) throw new Error('That session isn’t in the diary any more.');
    bookingId = (await repo.createBooking({
      seriesId: s.id, occursOn: occ.seriesDate, date: occ.seriesDate, start: s.start, duration: s.duration, kind: s.kind,
      status: 'booked', title: s.title, location: s.location, clientIds: s.clientIds,
    })).id;
  }
  await repo.assignSession(bookingId, cardId, session);
  return publishChanges(repo, { quietIds: new Set([publishedIdOf(occ)]) });
}

/**
 * Plan a group session's workout (0033), or clear it (null). A weekly group: every week (`'all'`, on the series; a
 * week with its own keeps it), or just this week (`'one'`: the week's identity override, made if there isn't one, as
 * assignSession does, so the week stays in its series). A one-off or a detached week: its own row. Nothing is
 * published: the workout never reaches a phone.
 */
export async function planWorkout(repo: DiaryRepo, d: Diary, occ: Occurrence, workout: PlannedWorkout | null, scope: Scope): Promise<Diary> {
  if (occ.kind !== 'group') throw new Error('Only a group session has a planned workout.');
  if (occ.recurring && occ.seriesId && scope === 'all') {
    await repo.updateSeries(occ.seriesId, { workout });
    return repo.loadDiary();
  }
  let bookingId = occ.bookingId;
  if (!bookingId) {
    if (!workout) return d;
    const s = d.series.find((x) => x.id === occ.seriesId);
    if (!s || !occ.seriesDate) throw new Error('That session isn’t in the diary any more.');
    bookingId = (await repo.createBooking({
      seriesId: s.id, occursOn: occ.seriesDate, date: occ.seriesDate, start: s.start, duration: s.duration, kind: s.kind,
      status: 'booked', title: s.title, location: s.location, clientIds: s.clientIds, workout,
    })).id;
    return repo.loadDiary();
  }
  await repo.updateBooking(bookingId, { workout });
  return repo.loadDiary();
}

/** A one-off becomes a weekly session from its date (the one-off's own publication is replaced quietly). */
export async function makeWeekly(repo: DiaryRepo, d: Diary, occ: Occurrence): Promise<Diary> {
  const wd = weekday(occ.date);
  await repo.createSeries({ kind: occ.kind === 'group' ? 'group' : 'one_to_one', weekday: wd, start: occ.start, duration: occ.duration, from: occ.date, to: null, cancelled: daysOffWeeks(d, { weekday: wd, from: occ.date, to: null }), title: occ.title, location: occ.location, clientIds: occ.clientIds });
  await repo.updateBooking(occ.bookingId!, { status: 'cancelled' });
  return publishChanges(repo, { quietIds: new Set([occ.bookingId!]) });
}

/**
 * A day off, or a holiday. 🚨 It CANCELS the sessions on those days for good,
 * now: a series week goes into the series' `cancelled_dates`, a one-off or a
 * moved week gets status 'cancelled'. `notify` is the coach's answer to "Let
 * clients know?": no means no banner. The row itself is then only a marker
 * that refuses new bookings on those days.
 */
export async function addDayOff(repo: DiaryRepo, d: Diary, start: ISODate, end: ISODate, note: string | null, notify: boolean): Promise<Diary> {
  const weeks = new Map<string, Set<string>>();
  for (const o of occurrencesBetween(d, start, end)) {
    if (o.kind === 'request') continue;
    if (o.bookingId) await repo.updateBooking(o.bookingId, { status: 'cancelled' });
    else if (o.seriesId) weeks.set(o.seriesId, (weeks.get(o.seriesId) ?? new Set()).add(o.seriesDate!));
  }
  for (const [id, dates] of weeks) {
    const s = d.series.find((x) => x.id === id)!;
    await repo.updateSeries(id, { cancelled: [...new Set([...s.cancelled, ...dates])].sort() });
  }
  await repo.addDayOff({ start, end, note, notified: notify });
  return publishChanges(repo, { quiet: !notify });
}
/**
 * Undo a day off: the day is free again. 🚨 Nothing it cancelled comes back:
 * the client was told (or not) and may have rebooked, so nothing is sent.
 */
export async function undoDayOff(repo: DiaryRepo, id: string): Promise<Diary> {
  await repo.deleteDayOff(id);
  return repo.loadDiary();
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
    const wd = weekday(slot.date);
    const s = await repo.createSeries({ kind: 'one_to_one', weekday: wd, start: slot.start_min, duration: base.duration, from: slot.date, to: null, cancelled: daysOffWeeks(d, { weekday: wd, from: slot.date, to: null }), title: null, location: null, clientIds: [r.cardId] });
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
 * it stays a placeholder with the clash shown for the coach to resolve; so does
 * a time already gone. Returns the requests booked.
 */
export async function autoBook(repo: DiaryRepo, d: Diary, name: (o: Occurrence) => string, today: ISODate): Promise<{ diary: Diary; booked: SessionRequest[] }> {
  const booked: SessionRequest[] = [];
  let cur = d;
  for (const r of d.requests) {
    if (r.status !== 'accepted' || r.bookingId || !r.cardId) continue;
    const slot = requestSlot(r);
    // 🚨 Never a time already gone: an old acceptance that was never booked stays a placeholder for the coach.
    if (!slot || slot.date < today || requestRefusal(cur, r, slot, name)) continue;
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
