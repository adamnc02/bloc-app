// Coach v0.5 (TECHNICAL §152): the Diary's model, rules, what it publishes,
// and its actions, on the fixture diary. Each rule has a control that shows
// what goes wrong without it.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fixtureDiary } from '@/data/fixtureDiary';
import { addDays } from '@/lib/format';
import { emptySlots, layoutLanes } from './slots';
import { occurrencesBetween, placeholderState, requestSlot, seriesDates, type Occurrence } from './model';
import { findClash, findSeriesClash, requestClashes } from './rules';
import { BOOKING_KEYS, bookingChanges, canonical, desiredBookings, MAX_SKIP_DATES, type BookingPayload } from './publish';
import {
  addDayOff, autoBook, bookRequest, cancelSession, createSession, editRefusal, editSession, makeWeekly, newRefusal, proposeTime, undoDayOff,
} from './actions';
import { DEFAULT_SETTINGS, type Diary, type Series } from './types';

const ANCHOR = '2026-08-02';            // Sunday; the fixture week is Mon 3 – Sun 9 Aug
const MON = '2026-08-03', TUE = '2026-08-04', WED = '2026-08-05', THU = '2026-08-06', FRI = '2026-08-07', SAT = '2026-08-08';
const name = (o: Occurrence) => o.clientIds.join('+') || 'request';
const fresh = () => fixtureDiary(ANCHOR);
const occ = (d: Diary, key: string, from = MON, to = addDays(MON, 13)) => occurrencesBetween(d, from, to).find((o) => o.key === key)!;
const empty = (): Diary => ({ settings: { ...DEFAULT_SETTINGS }, daysOff: [], series: [], bookings: [], requests: [], sent: {} });
const series = (p: Partial<Series>): Series => ({ id: 's1', kind: 'one_to_one', weekday: 1, start: 1080, duration: 60, from: TUE, to: null, cancelled: [], title: null, location: 'Studio', clientIds: ['maya'], ...p });

describe('slots', () => {
  it('a session off the hour pushes the empty outlines after it along, one hour tall', () => {
    expect(emptySlots([{ start: 735, end: 795 }], 660, 960).map((s) => [s.start, s.end])).toEqual([[660, 720], [795, 855], [855, 915]]);
  });
  it('overlapping sessions share lanes', () => {
    const l = layoutLanes([{ start: 540, end: 630 }, { start: 600, end: 660 }, { start: 700, end: 760 }]);
    expect(l.map((x) => [x.lane, x.lanes])).toEqual([[0, 2], [1, 2], [0, 1]]);
  });
});

describe('occurrences', () => {
  it('a series occurs every week from its start, and not before', () => {
    expect(seriesDates(series({ from: '2026-07-07' }), '2026-06-01', '2026-07-21')).toEqual(['2026-07-07', '2026-07-14', '2026-07-21']);
    expect(seriesDates(series({ to: '2026-08-11' }), TUE, '2026-09-01')).toEqual([TUE, '2026-08-11']);
  });
  it('the fixture week: weeklies, the group, the one-offs and three placeholders', async () => {
    const d = await fresh().loadDiary();
    const o = occurrencesBetween(d, MON, addDays(MON, 6));
    expect(o.filter((x) => x.kind !== 'request').map((x) => `${x.date} ${x.start} ${x.clientIds.join('+')}`)).toEqual([
      `${MON} 600 eileen`, `${TUE} 1080 maya`, `${WED} 600 eileen`, `${WED} 735 ben`, `${THU} 420 tom`, `${FRI} 1050 priya`, `${SAT} 540 maya+priya+grace`,
    ]);
    // Pending: the first choice. Countered: the client's counter. Accepted, not booked: the time accepted.
    expect(o.filter((x) => x.kind === 'request').map((x) => `${x.key} ${x.date} ${x.start}`)).toEqual([
      `r:rq-tom ${MON} 450`, `r:rq-grace ${TUE} 1080`, `r:rq-priya ${THU} 1140`,
    ]);
  });
  it('a placeholder’s state is whose move it is: requested (pending or countered), offered, clash (accepted, not booked)', () => {
    const r = { id: 'r', clientId: 'u', cardId: 'c', preferences: [{ date: TUE, start_min: 600 }], notes: null, repeatWeekly: false, proposed: null, counter: null, bookingId: null, createdAt: '' };
    expect((['pending', 'countered', 'proposed', 'accepted'] as const).map((status) => placeholderState({ ...r, status }))).toEqual(['requested', 'requested', 'offered', 'confirmed']);
  });
  it('no placeholder for a request that’s booked, declined or withdrawn', () => {
    const r = { id: 'r', clientId: 'u', cardId: 'c', preferences: [{ date: TUE, start_min: 600 }], notes: null, repeatWeekly: false, proposed: null, counter: null, bookingId: null, createdAt: '' };
    expect(requestSlot({ ...r, status: 'accepted', bookingId: 'b' })).toBeNull();
    expect(requestSlot({ ...r, status: 'declined' })).toBeNull();
    expect(requestSlot({ ...r, status: 'withdrawn' })).toBeNull();
    expect(requestSlot({ ...r, status: 'pending' })).toEqual({ date: TUE, start_min: 600 });
  });
});

describe('rules', () => {
  it('an overlap is refused, naming the session; a group isn’t; a placeholder never blocks', async () => {
    const d = await fresh().loadDiary();
    const o = occurrencesBetween(d, TUE, TUE);
    expect(findClash({ key: null, kind: 'one_to_one', date: TUE, start: 1110, duration: 60 }, o, [], name)?.reason).toBe('Clashes with maya 18:00–19:00');
    expect(findClash({ key: null, kind: 'group', date: TUE, start: 1110, duration: 60 }, o, [], name)).toBeNull();
    // rq-grace sits on Tue 18:00 over Maya: the placeholder shows the clash but blocks nothing.
    expect(requestClashes(occ(d, 'r:rq-grace'), o).map((x) => x.key)).toEqual([`s:sr-maya@${TUE}`]);
    expect(findClash({ key: null, kind: 'one_to_one', date: TUE, start: 1200, duration: 60 }, o, [], name)).toBeNull();
  });
  it('touching sessions don’t clash; a day off refuses', async () => {
    const d = await fresh().loadDiary();
    const o = occurrencesBetween(d, TUE, TUE);
    expect(findClash({ key: null, kind: 'one_to_one', date: TUE, start: 1140, duration: 60 }, o, [], name)).toBeNull();
    expect(findClash({ key: null, kind: 'one_to_one', date: TUE, start: 600, duration: 60 }, o, [{ id: 'x', start: TUE, end: TUE, note: null, notified: false }], name)?.reason).toBe('That’s a day off');
  });
  it('a new weekly session is checked against the coming weeks, not just the first', async () => {
    const d = await fresh().loadDiary();
    // Wed 10:00 is free this week only if Eileen's Wednesday is ignored: control, a one-off next Wednesday at 11:00 clashes in week 2.
    const probe = { kind: 'one_to_one' as const, weekday: 2, start: 660, duration: 60, from: WED, to: null };
    expect(findSeriesClash(d, probe, null, name)).toBeNull();
    d.bookings.push({ id: 'x', seriesId: null, occursOn: null, date: addDays(WED, 14), start: 690, duration: 60, kind: 'one_to_one', status: 'booked', title: null, location: null, clientIds: ['sam'] });
    expect(findSeriesClash(d, probe, null, name)?.reason).toBe(`Clashes with sam 11:30–12:30 on Wed 19 Aug`);
  });
});

describe('what the Diary publishes', () => {
  it('a series is one weekly booking dated its first week; a group is one per attendee', async () => {
    const d = await fresh().loadDiary();
    const want = desiredBookings(d);
    expect(want.get('maya|sr-maya')!.payload).toEqual({
      v: 1, booking_id: 'sr-maya', date: '2026-07-07', start_min: 1080, duration_min: 60, status: 'booked', kind: 'weekly', location: 'Studio', title: null, skip_dates: [], until: null,
    });
    expect(['maya', 'priya', 'grace'].map((c) => want.get(`${c}|sr-bootcamp`)?.payload.title)).toEqual(['Saturday bootcamp', 'Saturday bootcamp', 'Saturday bootcamp']);
    expect(want.get('priya|bk-priya')!.payload.kind).toBe('one_off');
  });
  it('every payload uses only 0023 + 0028 + 0029 booking keys (the migration’s allow-list)', async () => {
    // The migration repo sits beside this one locally; CI has only this repo, so it falls back to the documented list.
    const file = new URL('../../../../super-duper-octo-barnacle/supabase/migrations/20260831000029_booking_replaces.sql', import.meta.url);
    const list = existsSync(file)
      ? /when 'booking'\s+then array\[([^\]]+)\]/.exec(readFileSync(file, 'utf8'))![1].match(/'([a-z_]+)'/g)!.map((x) => x.slice(1, -1))
      : ['v', 'booking_id', 'date', 'start_min', 'duration_min', 'status', 'kind', 'location', 'assigned_session', 'skip_dates', 'until', 'title', 'quiet', 'replaces'];
    for (const k of BOOKING_KEYS) expect(list).toContain(k);
    const d = await fresh().loadDiary();
    d.daysOff.push({ id: 'o', start: TUE, end: TUE, note: null, notified: false });
    for (const { payload } of desiredBookings(d).values()) for (const k of Object.keys(payload)) expect(BOOKING_KEYS as readonly string[]).toContain(k);
  });
  it('nothing is sent when nothing changed (the fixture starts with what it implies)', async () => {
    expect(bookingChanges(await fresh().loadDiary())).toEqual([]);
  });
  it('a cancelled one-off nobody was sent is never sent; a card taken out of a group is sent a cancellation', async () => {
    const d = await fresh().loadDiary();
    d.bookings.push({ id: 'nb', seriesId: null, occursOn: null, date: WED, start: 900, duration: 60, kind: 'one_to_one', status: 'cancelled', title: null, location: null, clientIds: ['sam'] });
    d.series.find((s) => s.id === 'sr-bootcamp')!.clientIds = ['maya', 'priya'];
    const out = bookingChanges(d);
    expect(out.map((o) => `${o.cardId} ${o.payload.booking_id} ${o.payload.status}`)).toEqual(['grace sr-bootcamp cancelled']);
  });
  it('an override identical to its series week is no exception (a booked weekly request)', () => {
    const d = empty();
    d.series.push(series({}));
    d.bookings.push({ id: 'ov', seriesId: 's1', occursOn: TUE, date: TUE, start: 1080, duration: 60, kind: 'one_to_one', status: 'booked', title: null, location: 'Studio', clientIds: ['maya'] });
    const want = desiredBookings(d);
    expect([...want.keys()]).toEqual(['maya|s1']);
    expect(want.get('maya|s1')!.payload.skip_dates).toEqual([]);
    // Control: moved by 15 minutes it IS an exception, published as its own one-off.
    d.bookings[0].start = 1095;
    expect([...desiredBookings(d).keys()].sort()).toEqual(['maya|ov', 'maya|s1']);
    expect(desiredBookings(d).get('maya|s1')!.payload.skip_dates).toEqual([TUE]);
  });
  it('skip_dates keeps the latest 400', () => {
    const d = empty();
    d.series.push(series({ weekday: 0, from: '2020-01-06', cancelled: Array.from({ length: 450 }, (_, i) => addDays('2020-01-06', i * 7)) }));
    const skip = desiredBookings(d).get('maya|s1')!.payload.skip_dates!;
    expect(skip.length).toBe(MAX_SKIP_DATES);
    expect(skip[skip.length - 1]).toBe(addDays('2020-01-06', 449 * 7));
  });
  it('quiet doesn’t count as a change', () => {
    const p = { v: 1, booking_id: 'x', status: 'booked' } as unknown as BookingPayload;
    expect(canonical({ ...p, quiet: true })).toBe(canonical(p as unknown as Record<string, unknown>));
  });
});

describe('actions (fixture repo)', () => {
  const last = (r: ReturnType<typeof fresh>) => r.published.map((p) => `${p.cardId} ${String(p.payload.booking_id)} ${String(p.payload.status)}${p.payload.quiet ? ' quiet' : ''}`);

  it('move just this week: an override, the series skips it, the week goes as its own one-off', async () => {
    const r = fresh();
    const d = await r.loadDiary();
    const o = occ(d, `s:sr-maya@${TUE}`);
    const after = await editSession(r, d, o, { date: WED, start: 1080, duration: 60, location: 'Studio', title: null, clientIds: ['maya'] }, 'one');
    expect(last(r).sort()).toEqual(['maya bk-new-1 booked', 'maya sr-maya booked quiet']); // one banner: the moved week's
    expect(after.sent['maya|sr-maya'].payload.skip_dates).toEqual([TUE]);
    expect(after.sent['maya|bk-new-1'].payload.replaces).toEqual({ booking_id: 'sr-maya', date: TUE }); // "Session changed" on the phone
    expect(occ(after, `s:sr-maya@${TUE}`).date).toBe(WED);                   // the week, moved
    expect(occ(after, `s:sr-maya@${addDays(TUE, 7)}`).date).toBe(addDays(TUE, 7)); // the next, unchanged
  });
  it('move all future from a later week: the old series ends quietly, a new one starts', async () => {
    const r = fresh();
    const d = await r.loadDiary();
    const o = occ(d, `s:sr-maya@${TUE}`);
    const after = await editSession(r, d, o, { date: THU, start: 1080, duration: 60, location: 'Studio', title: null, clientIds: ['maya'] }, 'all');
    expect(after.series.find((s) => s.id === 'sr-maya')!.to).toBe(MON);
    expect(last(r)).toEqual(['maya sr-maya booked quiet', 'maya sr-new-1 booked']);
    expect(after.sent['maya|sr-new-1'].payload.replaces).toEqual({ booking_id: 'sr-maya', date: TUE });
    // Control: a new weekly session for someone else replaces nothing.
    const r2 = fresh();
    const d2 = await createSession(r2, await r2.loadDiary(), { kind: 'one_to_one', weekly: true, date: FRI, start: 600, duration: 60, location: null, title: null, clientIds: ['sam'] });
    expect(d2.sent['sam|sr-new-1'].payload.replaces).toBeUndefined();
    expect(occurrencesBetween(after, MON, addDays(MON, 13)).filter((x) => x.clientIds.join() === 'maya' && x.kind === 'one_to_one').map((x) => x.date)).toEqual([THU, addDays(THU, 7)]);
  });
  it('cancel just this week, then stop the series from next week', async () => {
    const r = fresh();
    let d = await r.loadDiary();
    d = await cancelSession(r, d, occ(d, `s:sr-tom@${THU}`), 'one');
    expect(d.sent['tom|sr-tom'].payload.skip_dates).toEqual([THU]);
    d = await cancelSession(r, d, occ(d, `s:sr-tom@${addDays(THU, 7)}`), 'all');
    expect(d.sent['tom|sr-tom'].payload.until).toBe(addDays(THU, 6));
  });
  it('a day off cancels that day’s sessions for good: the weekly skips it, the one-off is cancelled; quiet unless telling', async () => {
    const r = fresh();
    const d = await addDayOff(r, await r.loadDiary(), WED, WED, null, false);
    expect(last(r).sort()).toEqual(['ben bk-ben cancelled quiet', 'eileen sr-eileen-wed booked quiet']);
    expect(d.sent['eileen|sr-eileen-wed'].payload.skip_dates).toEqual([WED]);
    expect(d.series.find((x) => x.id === 'sr-eileen-wed')!.cancelled).toEqual([WED]);           // stored, not derived
    expect(d.bookings.find((x) => x.id === 'bk-ben')!.status).toBe('cancelled');
    expect(occurrencesBetween(d, WED, WED).filter((o) => o.kind !== 'request')).toEqual([]);   // gone that day
    expect(occ(d, `s:sr-eileen-wed@${addDays(WED, 7)}`)).toBeTruthy();                           // the series carries on
    const told = fresh();
    await addDayOff(told, await told.loadDiary(), WED, WED, null, true);
    expect(last(told).sort()).toEqual(['ben bk-ben cancelled', 'eileen sr-eileen-wed booked']);
  });
  it('a holiday over several days cancels every session in it, and no placeholder', async () => {
    const r = fresh();
    const d = await addDayOff(r, await r.loadDiary(), MON, FRI, 'Holiday', true);
    const week = occurrencesBetween(d, MON, addDays(MON, 6));
    expect(week.filter((o) => o.kind !== 'request' && o.date <= FRI)).toEqual([]);
    expect(week.filter((o) => o.kind !== 'request').map((o) => o.date)).toEqual([SAT]);
    expect(week.filter((o) => o.kind === 'request').length).toBe(3);
  });
  it('🚨 undoing a day off brings nothing back and sends nothing (control: the day is free again)', async () => {
    const r = fresh();
    let d = await addDayOff(r, await r.loadDiary(), WED, WED, null, true);
    const sent = r.published.length;
    d = await undoDayOff(r, d.daysOff[0].id);
    expect(r.published.length).toBe(sent);
    expect(occurrencesBetween(d, WED, WED).filter((o) => o.kind !== 'request')).toEqual([]);
    expect(d.bookings.find((x) => x.id === 'bk-ben')!.status).toBe('cancelled');
    expect(d.series.find((x) => x.id === 'sr-eileen-wed')!.cancelled).toEqual([WED]);
    expect(newRefusal(d, { kind: 'one_to_one', weekly: false, date: WED, start: 600, duration: 45, location: null, title: null, clientIds: ['eileen'] }, name)).toBeNull();
  });
  it('a weekly session booked after a day off skips it (control: none without the day off)', async () => {
    const r = fresh();
    let d = await addDayOff(r, await r.loadDiary(), addDays(FRI, 14), addDays(FRI, 14), null, false);
    d = await createSession(r, d, { kind: 'one_to_one', weekly: true, date: FRI, start: 600, duration: 60, location: null, title: null, clientIds: ['sam'] });
    expect(Object.entries(d.sent).find(([k]) => k.startsWith('sam|'))![1].payload.skip_dates).toEqual([addDays(FRI, 14)]);
    const r2 = fresh();
    const d2 = await createSession(r2, await r2.loadDiary(), { kind: 'one_to_one', weekly: true, date: FRI, start: 600, duration: 60, location: null, title: null, clientIds: ['sam'] });
    expect(d2.sent['sam|sr-new-1'].payload.skip_dates).toEqual([]);
  });
  it('a new weekly session and a one-off made weekly', async () => {
    const r = fresh();
    let d = await createSession(r, await r.loadDiary(), { kind: 'one_to_one', weekly: true, date: FRI, start: 600, duration: 60, location: null, title: null, clientIds: ['sam'] });
    expect(last(r)).toEqual(['sam sr-new-1 booked']);
    d = await makeWeekly(r, d, occ(d, 'b:bk-ben'));
    expect(last(r).slice(1).sort()).toEqual(['ben bk-ben cancelled quiet', 'ben sr-new-2 booked']);
  });
  it('booking a weekly request: a series and an identical first week, one weekly publication, the request names the booking', async () => {
    const r = fresh();
    const d = await r.loadDiary();
    const g = d.requests.find((x) => x.id === 'rq-grace')!;
    const after = await bookRequest(r, d, g, g.preferences[1]);
    const req = after.requests.find((x) => x.id === 'rq-grace')!;
    expect([req.status, !!req.bookingId]).toEqual(['accepted', true]);
    expect(last(r)).toEqual(['grace sr-new-1 booked']);
    expect(after.sent['grace|sr-new-1'].payload).toMatchObject({ kind: 'weekly', date: THU, start_min: 1020, skip_dates: [] });
    expect(occurrencesBetween(after, MON, addDays(MON, 6)).some((x) => x.key === 'r:rq-grace')).toBe(false);
  });
  it('propose a time: the placeholder moves and waits for the client', async () => {
    const r = fresh();
    const d = await r.loadDiary();
    const after = await proposeTime(r, d.requests.find((x) => x.id === 'rq-grace')!, { date: TUE, start_min: 1200 });
    expect(occ(after, 'r:rq-grace')).toMatchObject({ date: TUE, start: 1200 });
    expect(after.requests.find((x) => x.id === 'rq-grace')!.status).toBe('proposed');
    expect(r.published).toEqual([]); // a proposal is the request's, never a booking
  });
  it('the client accepted the coach’s time: booked automatically; a clash leaves it a placeholder', async () => {
    const r = fresh();
    const { diary, booked } = await autoBook(r, await r.loadDiary(), name, ANCHOR);
    expect(booked.map((x) => x.id)).toEqual(['rq-priya']);
    expect(last(r)).toEqual(['priya bk-new-1 booked']);
    expect(diary.requests.find((x) => x.id === 'rq-priya')!.bookingId).toBe('bk-new-1');
    // Control: the same acceptance over Tom's Thursday 07:00 is left for the coach.
    const r2 = fresh();
    const d2 = await r2.loadDiary();
    d2.requests.find((x) => x.id === 'rq-priya')!.proposed = { date: THU, start_min: 420 };
    await r2.updateRequest('rq-priya', { proposed: { date: THU, start_min: 420 } });
    expect((await autoBook(r2, await r2.loadDiary(), name, ANCHOR)).booked).toEqual([]);
    // Control: a time already gone is never booked (the diary's today after Priya's Thursday).
    const r3 = fresh();
    expect((await autoBook(r3, await r3.loadDiary(), name, addDays(THU, 1))).booked).toEqual([]);
    expect(r3.published).toEqual([]);
  });
  it('refusals before saving: all future checks the coming weeks, a new session needs a client', async () => {
    const r = fresh();
    const d = await r.loadDiary();
    const o = occ(d, `s:sr-maya@${TUE}`);
    // Thursday 07:00 is Tom's every week.
    expect(editRefusal(d, o, { date: THU, start: 420, duration: 60, location: null, title: null, clientIds: ['maya'] }, 'all', name)?.reason).toMatch(/^Clashes with tom 07:00–08:00 on Thu 6 Aug$/);
    expect(editRefusal(d, o, { date: TUE, start: 1080, duration: 90, location: null, title: null, clientIds: ['maya'] }, 'one', name)).toBeNull(); // itself isn't a clash
    expect(newRefusal(d, { kind: 'one_to_one', weekly: false, date: TUE, start: 900, duration: 60, location: null, title: null, clientIds: [] }, name)?.reason).toBe('Choose a client');
  });
});
