// The Diary's data, from BLOC's live Supabase project: 0024's coach_settings,
// coach_days_off, diary_series (+ _clients), diary_bookings (+ _clients) and
// session_requests, and the coach's own `booking` publications (0023/0028).
// Everything here is the coach's own (RLS `coach_id = my_coach_id()`), except
// session_requests, where the coach writes only their half (a 0024 trigger).
import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_SETTINGS, type AssignedSession, type Booking, type DayOff, type Diary, type PlannedWorkout, type Series, type SessionRequest, type SentBooking, type Slot } from '@/diary/types';
import type { DiaryRepo } from './types';

type Row = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : null);
const num = (v: unknown) => Number(v);
const workoutOf = (v: unknown): PlannedWorkout | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as PlannedWorkout) : null);

const toSeries = (r: Row, clients: string[]): Series => ({
  id: String(r.id), kind: r.kind === 'group' ? 'group' : 'one_to_one', weekday: num(r.weekday), start: num(r.start_min),
  duration: num(r.duration_min), from: String(r.effective_from), to: str(r.effective_to),
  cancelled: Array.isArray(r.cancelled_dates) ? (r.cancelled_dates as string[]) : [], title: str(r.title), location: str(r.location), clientIds: clients,
  ...(workoutOf(r.workout) ? { workout: workoutOf(r.workout) } : {}),
});
const toBooking = (r: Row, clients: string[], assigned: Record<string, AssignedSession> = {}): Booking => ({
  id: String(r.id), seriesId: str(r.series_id), occursOn: str(r.occurs_on), date: String(r.date), start: num(r.start_min),
  duration: num(r.duration_min), kind: r.kind === 'group' ? 'group' : 'one_to_one', status: r.status === 'cancelled' ? 'cancelled' : 'booked',
  title: str(r.title), location: str(r.location), clientIds: clients,
  ...(Object.keys(assigned).length ? { assigned } : {}),
  ...(workoutOf(r.workout) ? { workout: workoutOf(r.workout) } : {}),
});
const toDayOff = (r: Row): DayOff => ({ id: String(r.id), start: String(r.start_date), end: String(r.end_date), note: str(r.note), notified: r.notified === true });
const slot = (v: unknown): Slot | null => (v && typeof v === 'object' ? (v as Slot) : null);

function seriesRow(s: Partial<Omit<Series, 'id' | 'clientIds'>>): Row {
  const r: Row = {};
  if (s.kind !== undefined) r.kind = s.kind;
  if (s.weekday !== undefined) r.weekday = s.weekday;
  if (s.start !== undefined) r.start_min = s.start;
  if (s.duration !== undefined) r.duration_min = s.duration;
  if (s.from !== undefined) r.effective_from = s.from;
  if (s.to !== undefined) r.effective_to = s.to;
  if (s.cancelled !== undefined) r.cancelled_dates = s.cancelled;
  if (s.title !== undefined) r.title = s.title;
  if (s.location !== undefined) r.location = s.location;
  if (s.workout !== undefined) r.workout = s.workout;
  return r;
}
function bookingRow(b: Partial<Omit<Booking, 'id' | 'clientIds'>>): Row {
  const r: Row = {};
  if (b.seriesId !== undefined) r.series_id = b.seriesId;
  if (b.occursOn !== undefined) r.occurs_on = b.occursOn;
  if (b.date !== undefined) r.date = b.date;
  if (b.start !== undefined) r.start_min = b.start;
  if (b.duration !== undefined) r.duration_min = b.duration;
  if (b.kind !== undefined) r.kind = b.kind;
  if (b.status !== undefined) r.status = b.status;
  if (b.title !== undefined) r.title = b.title;
  if (b.location !== undefined) r.location = b.location;
  if (b.workout !== undefined) r.workout = b.workout;
  return r;
}

export function liveDiary(sb: SupabaseClient, coachId: () => string): DiaryRepo {
  const must = <T extends { error: unknown }>(r: T) => { if (r.error) throw r.error; return r; };
  // 🚨 Only the attendees that changed: a booking attendee's row carries their assigned session, so deleting
  //    and re-inserting everyone would drop it on any change to who's booked.
  const setClients = async (table: 'diary_series_clients' | 'diary_booking_clients', col: 'series_id' | 'booking_id', id: string, cards: string[]) => {
    const { data } = must(await sb.from(table).select('client_record_id').eq(col, id));
    const now = new Set(((data ?? []) as Row[]).map((r) => String(r.client_record_id)));
    const gone = [...now].filter((c) => !cards.includes(c));
    const added = cards.filter((c) => !now.has(c));
    if (gone.length) must(await sb.from(table).delete().eq(col, id).in('client_record_id', gone));
    if (added.length) must(await sb.from(table).insert(added.map((c) => ({ [col]: id, client_record_id: c }))));
  };
  return {
    async loadDiary() {
      const [settings, off, series, sc, bookings, bc, reqs, links, pubs] = await Promise.all([
        sb.from('coach_settings').select('day_start_min, day_end_min, working_days, session_minutes').eq('coach_id', coachId()).maybeSingle(),
        sb.from('coach_days_off').select('id, start_date, end_date, note, notified').eq('coach_id', coachId()).order('start_date'),
        sb.from('diary_series').select('*').eq('coach_id', coachId()),
        sb.from('diary_series_clients').select('series_id, client_record_id'),
        sb.from('diary_bookings').select('*').eq('coach_id', coachId()),
        sb.from('diary_booking_clients').select('booking_id, client_record_id, assigned_session'),
        sb.from('session_requests').select('id, client_id, preferences, notes, repeat_weekly, status, proposed, counter, booking_id, created_at')
          .eq('coach_id', coachId()).order('created_at', { ascending: false }).limit(200),
        sb.from('coach_clients').select('client_id, client_record_id, status').eq('coach_id', coachId()),
        sb.from('publications').select('id, seq, client_record_id, payload').eq('coach_id', coachId()).eq('type', 'booking').order('seq'),
      ]);
      for (const r of [settings, off, series, sc, bookings, bc, reqs, links, pubs]) must(r);
      const group = (rows: Row[], k: string) => {
        const m = new Map<string, string[]>();
        for (const r of rows) m.set(String(r[k]), [...(m.get(String(r[k])) ?? []), String(r.client_record_id)]);
        return m;
      };
      const sClients = group((sc.data ?? []) as Row[], 'series_id');
      const bClients = group((bc.data ?? []) as Row[], 'booking_id');
      const bAssigned = new Map<string, Record<string, AssignedSession>>();
      for (const r of (bc.data ?? []) as Row[]) {
        if (!r.assigned_session || typeof r.assigned_session !== 'object') continue;
        const k = String(r.booking_id);
        bAssigned.set(k, { ...(bAssigned.get(k) ?? {}), [String(r.client_record_id)]: r.assigned_session as AssignedSession });
      }
      // A request names the client's sign-in; the active link (else the latest) gives their card.
      const cardOf = new Map<string, string>();
      for (const l of (links.data ?? []) as Row[]) if (!cardOf.has(String(l.client_id)) || l.status === 'active') cardOf.set(String(l.client_id), String(l.client_record_id));
      const sent: Record<string, SentBooking> = {};
      for (const p of (pubs.data ?? []) as Row[]) {
        const payload = (p.payload ?? {}) as Record<string, unknown>;
        if (typeof payload.booking_id !== 'string') continue;
        sent[`${p.client_record_id}|${payload.booking_id}`] = { id: String(p.id), seq: num(p.seq), cardId: String(p.client_record_id), payload };
      }
      const st = settings.data as Row | null;
      return {
        settings: st ? { dayStart: num(st.day_start_min), dayEnd: num(st.day_end_min), workingDays: (st.working_days as number[]).map(Number), sessionMinutes: num(st.session_minutes) } : DEFAULT_SETTINGS,
        daysOff: ((off.data ?? []) as Row[]).map(toDayOff),
        series: ((series.data ?? []) as Row[]).map((r) => toSeries(r, sClients.get(String(r.id)) ?? [])),
        bookings: ((bookings.data ?? []) as Row[]).map((r) => toBooking(r, bClients.get(String(r.id)) ?? [], bAssigned.get(String(r.id)))),
        requests: ((reqs.data ?? []) as Row[]).map((r): SessionRequest => ({
          id: String(r.id), clientId: String(r.client_id), cardId: cardOf.get(String(r.client_id)) ?? null,
          preferences: Array.isArray(r.preferences) ? (r.preferences as Slot[]) : [], notes: str(r.notes), repeatWeekly: r.repeat_weekly === true,
          status: r.status as SessionRequest['status'], proposed: slot(r.proposed), counter: slot(r.counter), bookingId: str(r.booking_id), createdAt: String(r.created_at),
        })),
        sent,
      } satisfies Diary;
    },

    async saveSettings(s) {
      must(await sb.from('coach_settings').upsert({
        coach_id: coachId(), day_start_min: s.dayStart, day_end_min: s.dayEnd, working_days: s.workingDays, session_minutes: s.sessionMinutes,
        updated_at: new Date().toISOString(),
      }));
    },
    async addDayOff(o) {
      const { data } = must(await sb.from('coach_days_off').insert({ coach_id: coachId(), start_date: o.start, end_date: o.end, note: o.note, notified: o.notified })
        .select('id, start_date, end_date, note, notified').single());
      return toDayOff(data as Row);
    },
    async deleteDayOff(id) { must(await sb.from('coach_days_off').delete().eq('id', id)); },

    async createSeries(s) {
      const { data } = must(await sb.from('diary_series').insert({ coach_id: coachId(), ...seriesRow(s) }).select('*').single());
      const id = String((data as Row).id);
      await setClients('diary_series_clients', 'series_id', id, s.clientIds);
      return toSeries(data as Row, s.clientIds);
    },
    async updateSeries(id, patch) {
      const row = seriesRow(patch);
      if (Object.keys(row).length) must(await sb.from('diary_series').update({ ...row, updated_at: new Date().toISOString() }).eq('id', id));
      if (patch.clientIds) await setClients('diary_series_clients', 'series_id', id, patch.clientIds);
    },

    async createBooking(b) {
      const { data } = must(await sb.from('diary_bookings').insert({ coach_id: coachId(), ...bookingRow(b) }).select('*').single());
      const id = String((data as Row).id);
      await setClients('diary_booking_clients', 'booking_id', id, b.clientIds);
      return toBooking(data as Row, b.clientIds);
    },
    async updateBooking(id, patch) {
      const row = bookingRow(patch);
      if (Object.keys(row).length) must(await sb.from('diary_bookings').update({ ...row, updated_at: new Date().toISOString() }).eq('id', id));
      if (patch.clientIds) await setClients('diary_booking_clients', 'booking_id', id, patch.clientIds);
    },

    async assignSession(bookingId, cardId, session) {
      must(await sb.from('diary_booking_clients').update({ assigned_session: session }).eq('booking_id', bookingId).eq('client_record_id', cardId));
    },

    async updateRequest(id, patch) {
      const row: Row = {};
      if (patch.status !== undefined) row.status = patch.status;
      if (patch.proposed !== undefined) row.proposed = patch.proposed;
      if (patch.bookingId !== undefined) row.booking_id = patch.bookingId;
      must(await sb.from('session_requests').update(row).eq('id', id));
    },

    async publishBooking(cardId, payload, supersedes) {
      const { data } = must(await sb.from('publications')
        .insert({ coach_id: coachId(), client_record_id: cardId, type: 'booking', payload, supersedes })
        .select('id, seq, client_record_id, payload').single());
      const r = data as Row;
      return { id: String(r.id), seq: num(r.seq), cardId: String(r.client_record_id), payload: r.payload as Record<string, unknown> };
    },

    watchRequests(onChange) {
      const ch = sb.channel(`coach-requests-${coachId()}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'session_requests', filter: `coach_id=eq.${coachId()}` }, () => onChange())
        .subscribe();
      return () => { void sb.removeChannel(ch); };
    },
  };
}
