// The dev bypass's Diary: an in-memory copy of 0024's tables in the week after
// the demo anchor, with the fixture clients. Every write changes
// the page's memory only. The publications already "sent" are the ones this
// diary implies, so the first change publishes only what it changes.
import { addDays, weekday } from '@/lib/format';
import { desiredBookings } from '@/diary/publish';
import { DEFAULT_SETTINGS, type Booking, type DayOff, type Diary, type Series, type SessionRequest } from '@/diary/types';
import type { DiaryRepo } from './types';

export function fixtureDiary(anchor: string): DiaryRepo & { published: { cardId: string; payload: Record<string, unknown> }[] } {
  // The Monday after the anchor (Mon 3 Aug for the tracked dataset), so each fixture keeps its weekday
  // (Grace's first choice over Maya's Tuesday, Ben and Eileen on the same Wednesday) whatever the anchor.
  const monday = addDays(anchor, 7 - weekday(anchor));
  const at = (n: number) => addDays(monday, n);
  const series: Series[] = [
    { id: 'sr-maya', kind: 'one_to_one', weekday: 1, start: 18 * 60, duration: 60, from: '2026-07-07', to: null, cancelled: [], title: null, location: 'Studio', clientIds: ['maya'] },
    { id: 'sr-tom', kind: 'one_to_one', weekday: 3, start: 7 * 60, duration: 60, from: '2026-07-02', to: null, cancelled: [], title: null, location: 'Studio', clientIds: ['tom'] },
    { id: 'sr-eileen-mon', kind: 'one_to_one', weekday: 0, start: 10 * 60, duration: 45, from: '2026-06-01', to: null, cancelled: [], title: null, location: 'Her home', clientIds: ['eileen'] },
    { id: 'sr-eileen-wed', kind: 'one_to_one', weekday: 2, start: 10 * 60, duration: 45, from: '2026-06-03', to: null, cancelled: [], title: null, location: 'Her home', clientIds: ['eileen'] },
    { id: 'sr-bootcamp', kind: 'group', weekday: 5, start: 9 * 60, duration: 90, from: '2026-07-04', to: null, cancelled: [], title: 'Saturday bootcamp', location: 'Park', clientIds: ['maya', 'priya', 'grace'] },
  ];
  const bookings: Booking[] = [
    { id: 'bk-priya', seriesId: null, occursOn: null, date: at(4), start: 17 * 60 + 30, duration: 60, kind: 'one_to_one', status: 'booked', title: null, location: 'Studio', clientIds: ['priya'] },
    { id: 'bk-ben', seriesId: null, occursOn: null, date: at(2), start: 12 * 60 + 15, duration: 60, kind: 'one_to_one', status: 'booked', title: null, location: 'Studio', clientIds: ['ben'] },
  ];
  const created = (h: number) => new Date(Date.parse(`${anchor}T20:10:00Z`) - h * 3600000).toISOString();
  const requests: SessionRequest[] = [
    { id: 'rq-grace', clientId: 'user-grace', cardId: 'grace', status: 'pending', proposed: null, counter: null, bookingId: null, repeatWeekly: true, createdAt: created(5),
      notes: 'Could we go through deadlift form together?',
      preferences: [{ date: at(1), start_min: 18 * 60 }, { date: at(3), start_min: 17 * 60 }, { date: at(4), start_min: 16 * 60, end_min: 19 * 60 }] },
    { id: 'rq-tom', clientId: 'user-tom', cardId: 'tom', status: 'countered', proposed: { date: at(0), start_min: 7 * 60 }, counter: { date: at(0), start_min: 7 * 60 + 30 },
      bookingId: null, repeatWeekly: false, createdAt: created(30), notes: null, preferences: [{ date: at(0), start_min: 6 * 60 }] },
    { id: 'rq-priya', clientId: 'user-priya', cardId: 'priya', status: 'accepted', proposed: { date: at(3), start_min: 19 * 60 }, counter: null,
      bookingId: null, repeatWeekly: false, createdAt: created(48), notes: null, preferences: [{ date: at(3), start_min: 18 * 60 }] },
  ];
  const d: Diary = { settings: { ...DEFAULT_SETTINGS }, daysOff: [], series, bookings, requests, sent: {} };
  let seq = 0, n = 0;
  for (const [k, { cardId, payload }] of desiredBookings(d)) d.sent[k] = { id: `pub-${++seq}`, seq, cardId, payload };
  const published: { cardId: string; payload: Record<string, unknown> }[] = [];
  const copy = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
  const id = (p: string) => `${p}-new-${++n}`;
  return {
    published,
    async loadDiary() { return copy(d); },
    async saveSettings(s) { d.settings = { ...s }; },
    async addDayOff(o) { const x: DayOff = { ...o, id: id('off') }; d.daysOff.push(x); return x; },
    async deleteDayOff(i) { d.daysOff = d.daysOff.filter((x) => x.id !== i); },
    async createSeries(s) { const x: Series = { ...copy(s), id: id('sr') }; d.series.push(x); return x; },
    async updateSeries(i, patch) { const x = d.series.find((s) => s.id === i); if (x) Object.assign(x, copy(patch)); },
    async createBooking(b) { const x: Booking = { ...copy(b), id: id('bk') }; d.bookings.push(x); return x; },
    async updateBooking(i, patch) { const x = d.bookings.find((b) => b.id === i); if (x) Object.assign(x, copy(patch)); },
    async updateRequest(i, patch) {
      const r = d.requests.find((x) => x.id === i);
      if (!r) return;
      if (patch.status !== undefined) r.status = patch.status;
      if (patch.proposed !== undefined) r.proposed = patch.proposed;
      if (patch.bookingId !== undefined) r.bookingId = patch.bookingId;
    },
    async publishBooking(cardId, payload, _supersedes) {
      const s = { id: `pub-${++seq}`, seq, cardId, payload: copy(payload) };
      d.sent[`${cardId}|${String(payload.booking_id)}`] = s;
      published.push({ cardId, payload: s.payload });
      return s;
    },
    watchRequests() { return () => {}; },
  };
}
