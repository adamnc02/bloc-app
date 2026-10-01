// ═══════════════════════════════════════════════════════════════════════
// Everything a demo Rebuild writes (PROMPT-04), built with Coach's own
// builders so each row is exactly what Coach would have sent: the diary's
// bookings from desiredBookings(), Eileen's sessions from sessionLogPayload(),
// Priya's photo request from photoRequestPayload(). The clients' BLOC states
// come from the engine's simulator (@engine/demo).
//
// Pure: `now` comes in, ids are derived from fixed seeds (a Rebuild deletes
// the last one's rows first, so the same ids can be written again), and
// nothing is sent. The bloc-demo Edge Function writes the result.
//
// 🚨 Order matters. Each card's `plan` and `goal_phases` publications come
//    FIRST, so they get the card's lowest `seq`s: the states mark exactly
//    those as applied (stampLedger), and BLOC pulls everything above the
//    highest applied `seq` when the account is opened.
// 🚨 Every date is placed from the Monday of the week: the coach's for the
//    diary, each client's own (their `tz`) for their plan.
// ═══════════════════════════════════════════════════════════════════════
import { getHomeWeekStart, shiftDateStr, type BlocState, type Loose } from '@engine';
import { localDateIn } from '@engine/review';
import { buildDemoState, sessionSchedule, rng, DEMO_PERSONAS, EILEEN, MAYA, type DemoPersona } from '@engine/demo';
import { desiredBookings } from '@/diary/publish';
import { DEFAULT_SETTINGS, type Booking, type Diary, type PlannedWorkout, type Series } from '@/diary/types';
import { groupPayload, groupSessionId, workoutExercises, type GroupSet } from '@/group/model';
import { sessionIdFor, sessionLogPayload, type SetEntry } from '@/inperson/model';
import { photoRequestPayload } from '@/ai/tools';
import { weekday } from '@/lib/format';
import type { DemoCardKey } from './cards';

/** A uuid-shaped id from a seed: the same seed, the same id. */
export function demoId(seed: string): string {
  const r = rng(`demo-id:${seed}`);
  const b = Array.from({ length: 16 }, () => Math.floor(r() * 256));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** BLOC's exercise library body parts, sent on each planned exercise (SUPABASE.md, "what goes INSIDE each row"). */
const BODY_PART: Record<string, string> = {
  'Cable Curls': 'Biceps', 'Rope Curls': 'Biceps', 'Calf Raises': 'Calves', 'Flat Press': 'Chest', 'Incline Press': 'Chest',
  'Hamstring Curl': 'Legs', 'Leg Extension': 'Legs', 'Leg Press': 'Legs', RDL: 'Legs', 'Split Squat': 'Legs', 'Walking Lunge': 'Legs',
  'Lat Pull Machine': 'Back', 'Lat Pulldown': 'Back', 'Low Row': 'Back', 'Machine Row': 'Back', 'T-Bar Row': 'Back',
  'Lateral Raise': 'Shoulders', 'Push Downs': 'Triceps', 'Rope Extensions': 'Triceps', 'Skull Crushers': 'Triceps',
};
/** 0023's allow-list for `plan.macrocycle`. */
const MACRO_KEYS = ['id', 'name', 'weeks', 'weeksPerMeso', 'sessionsPerWeek', 'start', 'goal', 'targetBw', 'goalType', 'splitType', 'days', 'dayLabels', 'useMicrocycles', 'weightIncrement', 'rpe', 'extensionWeeks'];

export interface DemoIds {
  coachId: string;
  /** Card ids, by key: every demo card. */
  cards: Record<DemoCardKey, string>;
  /** Sign-in ids of the clients on the app. */
  users: Partial<Record<DemoCardKey, string>>;
}

export interface DemoPub { id: string; card: DemoCardKey; type: string; payload: Loose; createdAt: string }
export interface DemoRows {
  /** In insert order: per card, plans and goal phases before anything else. */
  publications: DemoPub[];
  series: { id: string; kind: 'one_to_one' | 'group'; weekday: number; start_min: number; duration_min: number; effective_from: string; effective_to: string | null; title: string | null; location: string | null; workout: PlannedWorkout | null; created_at: string }[];
  seriesClients: { series_id: string; card: DemoCardKey }[];
  bookings: { id: string; date: string; start_min: number; duration_min: number; kind: 'one_to_one' | 'group'; status: 'booked'; title: string | null; location: string | null; created_at: string }[];
  bookingClients: { booking_id: string; card: DemoCardKey }[];
  submissions: { id: string; client: DemoCardKey; kind: 'check_in' | 'note_back'; publication_id: string | null; body: Loose; created_at: string }[];
  requests: { id: string; client: DemoCardKey; preferences: Loose[]; notes: string | null; repeat_weekly: boolean; created_at: string }[];
  /** Each on-app client's state (before stampLedger), their zone and when it was "uploaded". */
  states: { client: DemoCardKey; state: BlocState; tz: string; uploadedAt: string }[];
}

const at = (date: string, hhmm: string) => `${date}T${hhmm}:00.000Z`;

/** Saturday Circuits' planned workout (0033): a copy of a Library workout, in Coach's template exercise shape. */
export const CIRCUITS: PlannedWorkout = {
  v: 1, template_id: null, name: 'Saturday Circuits',
  exercises: [
    { name: 'Walking Lunge', reps: '12', setsStart: 3, setsEnd: 3, startWeight: 8, type: 'standard', trackingMode: 'perSide', bodyPart: 'Legs', id: 'circ_0', order: 0 },
    { name: 'Low Row', reps: '15', setsStart: 3, setsEnd: 3, startWeight: 30, type: 'standard', trackingMode: 'total', bodyPart: 'Back', id: 'circ_1', order: 10 },
    { name: 'Calf Raises', reps: '20', setsStart: 3, setsEnd: 3, startWeight: 40, type: 'standard', trackingMode: 'total', bodyPart: 'Calves', id: 'circ_2', order: 20 },
    { name: 'Lateral Raise', reps: '15', setsStart: 3, setsEnd: 3, startWeight: 4, type: 'standard', trackingMode: 'perSide', bodyPart: 'Shoulders', id: 'circ_3', order: 30 },
  ],
};

/**
 * One plan session done with the coach, as In person sends it (sessionLogPayload): every set the simulator logged
 * for it. Null when nothing was logged (a missed session stays missed).
 */
function inPersonLog(s: BlocState, x: { date: string; macroId: string; week: number; dayKey: string }, bookingId: string, stampSeed: string): Loose | null {
  const tpl = ((s.exercises as Record<string, Loose[]>)[`${x.macroId}_1_${x.dayKey}`] || []);
  const sets: Record<string, SetEntry[]> = {};
  for (const e of tpl) {
    const list: SetEntry[] = [];
    for (let i = 0; ; i++) {
      const l = (s.trainLogs as Loose)[`${x.macroId}_${x.week}_${x.dayKey}_${e.id}_${i}`];
      if (!l) break;
      list.push({ kg: String(l.weight), reps: String(l.reps), done: true });
    }
    if (list.length) sets[e.id] = list;
  }
  if (!Object.keys(sets).length) return null;
  return sessionLogPayload({ sessionId: sessionIdFor(bookingId, x.date, demoId(stampSeed).slice(0, 8)), bookingId, macroId: x.macroId, week: x.week, dayKey: x.dayKey, sets, rpe: null });
}
const hoursBefore = (now: number, h: number) => new Date(now - h * 3600000).toISOString();

/** The plan publication for one of the client's cycles: its fields, session templates (with body parts) and deloads. */
function planPayload(s: BlocState, macroId: string): Loose {
  const m = (s.macrocycles as Loose[]).find((x) => x.id === macroId);
  const macrocycle: Loose = {};
  for (const k of MACRO_KEYS) if (m[k] !== undefined) macrocycle[k] = m[k];
  const exercises: Record<string, Loose[]> = {};
  for (const [k, list] of Object.entries(s.exercises as Record<string, Loose[]>)) {
    if (k.startsWith(`${macroId}_1_`)) exercises[k] = list.map((e) => ({ ...e, bodyPart: BODY_PART[e.name] ?? null }));
  }
  const deloads: Record<string, true> = {};
  for (const k of Object.keys(s.deloads || {})) if (k.startsWith(`${macroId}_`)) deloads[k] = true;
  return { v: 1, macrocycle, exercises, ...(Object.keys(deloads).length ? { deloads } : {}) };
}

/** Plan and goal publications for every cycle the coach published, sent the Saturday before it started. */
function planPubs(card: DemoCardKey, persona: DemoPersona, s: BlocState): DemoPub[] {
  const out: DemoPub[] = [];
  for (const c of persona.cycles.filter((x) => x.published)) {
    const macroId = `macro_demo_${persona.key}_${c.key}`;
    const m = (s.macrocycles as Loose[]).find((x) => x.id === macroId);
    if (!m) continue;
    const sent = at(shiftDateStr(m.start, -2), '10:00');
    out.push({ id: demoId(`${card}:plan:${c.key}`), card, type: 'plan', payload: planPayload(s, macroId), createdAt: sent });
    const goals = (s.goals as Loose[]).filter((g) => g.macroId === macroId);
    if (goals.length) out.push({ id: demoId(`${card}:goals:${c.key}`), card, type: 'goal_phases', payload: { v: 1, macro_id: macroId, goals }, createdAt: sent });
  }
  return out;
}

/** The whole Rebuild, at `now` (ms). */
export function buildDemoRows(ids: DemoIds, now: number): DemoRows {
  const coachToday = localDateIn('Europe/London', now);
  const monday = getHomeWeekStart(coachToday);
  const rows: DemoRows = { publications: [], series: [], seriesClients: [], bookings: [], bookingClients: [], submissions: [], requests: [], states: [] };

  // ── The clients on the app: their states, and the coach's plans first ──
  const stateOf: Partial<Record<DemoCardKey, BlocState>> = {};
  for (const p of DEMO_PERSONAS) {
    const card = p.key as DemoCardKey;
    if (!ids.users[card]) continue;
    const today = localDateIn(p.tz, now);
    const state = buildDemoState(p, today, { coachId: ids.coachId });
    stateOf[card] = state;
    // Tom hasn't opened the app for three days; the rest synced this morning.
    rows.states.push({ client: card, state, tz: p.tz, uploadedAt: hoursBefore(now, card === 'tom' ? 70 : card === 'grace' ? 5 : 2) });
    rows.publications.push(...planPubs(card, p, state));
  }
  // Eileen (not on the app): her plan is only ever the coach's publication.
  const eileen = buildDemoState(EILEEN, coachToday, { coachId: ids.coachId });
  rows.publications.push(...planPubs('eileen', EILEEN, eileen));

  // ── The diary (the coach's Monday) ──
  const series: Series[] = [];
  const addSeries = (key: string, s: Omit<Series, 'id' | 'cancelled'>) => {
    const one: Series = { id: demoId(`series:${key}`), cancelled: [], ...s };
    series.push(one);
    rows.series.push({ id: one.id, kind: one.kind, weekday: one.weekday, start_min: one.start, duration_min: one.duration, effective_from: one.from, effective_to: one.to, title: one.title, location: one.location, workout: one.workout ?? null, created_at: at(shiftDateStr(one.from, -3), '12:00') });
    for (const c of one.clientIds) rows.seriesClients.push({ series_id: one.id, card: back(c) });
    return one;
  };
  const card = (k: DemoCardKey) => ids.cards[k];
  /** A card id back to its key. */
  const back = (cardId: string) => Object.entries(ids.cards).find(([, v]) => v === cardId)![0] as DemoCardKey;
  // Maya: Wednesdays at 18:00 since her cut started (her Wednesday plan session, done with the coach). Eileen:
  // Tuesdays and Fridays at 07:00.
  const mayaWed = addSeries('maya-wed', { kind: 'one_to_one', weekday: 2, start: 1080, duration: 60, from: shiftDateStr(monday, -4 * 7 + 2), to: null, title: null, location: 'Studio', clientIds: [card('maya')] });
  const tue = addSeries('eileen-tue', { kind: 'one_to_one', weekday: 1, start: 420, duration: 60, from: shiftDateStr(monday, -6 * 7 + 1), to: null, title: null, location: 'Studio', clientIds: [card('eileen')] });
  const fri = addSeries('eileen-fri', { kind: 'one_to_one', weekday: 4, start: 420, duration: 60, from: shiftDateStr(monday, -6 * 7 + 4), to: null, title: null, location: 'Studio', clientIds: [card('eileen')] });
  // Saturday Circuits: a group, Maya and Priya, with its planned workout.
  const circuits = addSeries('sat-circuits', { kind: 'group', weekday: 5, start: 540, duration: 45, from: shiftDateStr(monday, -3 * 7 + 5), to: null, title: 'Saturday Circuits', location: 'Riverside Park', clientIds: [card('maya'), card('priya')], workout: CIRCUITS });
  // Tom: a one-off review session on Friday; Ben: his first session next Monday.
  const oneOffs: Booking[] = [
    { id: demoId('booking:tom-review'), seriesId: null, occursOn: null, date: shiftDateStr(monday, 4), start: 750, duration: 45, kind: 'one_to_one', status: 'booked', title: null, location: 'Studio', clientIds: [card('tom')] },
    { id: demoId('booking:ben-first'), seriesId: null, occursOn: null, date: shiftDateStr(monday, 7), start: 1020, duration: 60, kind: 'one_to_one', status: 'booked', title: null, location: 'Studio', clientIds: [card('ben')] },
  ];
  for (const b of oneOffs) {
    rows.bookings.push({ id: b.id, date: b.date, start_min: b.start, duration_min: b.duration, kind: b.kind, status: 'booked', title: b.title, location: b.location, created_at: at(shiftDateStr(monday, -3), '09:30') });
    for (const c of b.clientIds) rows.bookingClients.push({ booking_id: b.id, card: back(c) });
  }
  const diary: Diary = { settings: DEFAULT_SETTINGS, daysOff: [], series, bookings: oneOffs, requests: [], sent: {} };
  for (const { cardId, payload } of desiredBookings(diary).values()) {
    const c = back(cardId);
    const from = rows.series.find((x) => x.id === payload.booking_id)?.created_at ?? rows.bookings.find((x) => x.id === payload.booking_id)?.created_at ?? at(monday, '09:00');
    rows.publications.push({ id: demoId(`${c}:booking:${payload.booking_id}`), card: c, type: 'booking', payload, createdAt: from });
  }

  // ── Sessions the coach took, logged: Eileen's (in person, with her Tuesday measurements) and Maya's Wednesdays ──
  for (const x of sessionSchedule(EILEEN, coachToday).filter((x) => x.date < coachToday)) {
    const booking = x.dayKey === 'session0' ? tue : fri;
    const payload = inPersonLog(eileen, x, booking.id, `eileen:${x.date}`);
    if (!payload) continue;
    rows.publications.push({ id: demoId(`eileen:log:${x.date}`), card: 'eileen', type: 'session_log', createdAt: at(x.date, '08:05'), payload });
    if (x.dayKey === 'session0') {
      const w = (eileen.bodyLogs as Loose[]).find((l) => l.date === x.date)?.weight;
      const mon = (eileen.bodyLogs as Loose[]).find((l) => l.date === shiftDateStr(x.date, -1));
      if (w) rows.publications.push({ id: demoId(`eileen:measure:${x.date}`), card: 'eileen', type: 'measurement', createdAt: at(x.date, '08:06'),
        payload: { v: 1, log_date: x.date, weight: w, ...(mon?.waist ? { waist: mon.waist, hip: mon.hip } : {}) } });
    }
  }
  if (ids.users.maya && stateOf.maya) {
    const mayaToday = localDateIn(MAYA.tz, now);
    for (const x of sessionSchedule(MAYA, mayaToday).filter((x) => x.date >= mayaWed.from && x.date < mayaToday && weekday(x.date) === mayaWed.weekday)) {
      const payload = inPersonLog(stateOf.maya, x, mayaWed.id, `maya:${x.date}`);
      if (payload) rows.publications.push({ id: demoId(`maya:log:${x.date}`), card: 'maya', type: 'session_log', createdAt: at(x.date, '19:05'), payload });
    }
  }
  // Saturday Circuits, each week before today, logged for both: the planned workout, each at their own weights,
  // a little heavier each week. An extra session for each (no `replaces`): it never touches their plan.
  const group = workoutExercises(CIRCUITS);
  for (let d = circuits.from, w = 0; d < coachToday; d = shiftDateStr(d, 7), w++) {
    const sessionId = groupSessionId(circuits.id, d, demoId(`circuits:${d}`).slice(0, 8));
    for (const [who, scale] of [['maya', 1], ['priya', 0.85]] as const) {
      const sets: Record<string, GroupSet[]> = {};
      for (const ex of group) {
        const kg = Math.round((ex.weight * scale + w * (ex.weight >= 20 ? 2.5 : 1)) * 2) / 2;
        sets[ex.key] = Array.from({ length: ex.sets }, () => ({ kg: String(kg), reps: ex.reps, done: true }));
      }
      rows.publications.push({ id: demoId(`${who}:circuits:${d}`), card: who, type: 'session_log', createdAt: at(d, '10:00'),
        payload: groupPayload({ sessionId, bookingId: circuits.id, exercises: group, sets, replaces: null }) });
    }
  }

  // ── What's waiting for the coach ──
  const yesterday = shiftDateStr(coachToday, -1);
  if (ids.users.maya && stateOf.maya) {
    rows.submissions.push({ id: demoId('maya:checkin'), client: 'maya', kind: 'check_in', publication_id: null, created_at: at(yesterday, '19:40'),
      body: { v: 1, purpose: 'check_in', feel: 'Good', note: 'Hips felt tight on the RDLs this week, otherwise all good. Can we look at a stretch for it on Wednesday?', macro_id: 'macro_demo_maya_c2', sent_on: yesterday } });
  }
  if (ids.users.priya && stateOf.priya) {
    rows.publications.push({ id: demoId('priya:photos'), card: 'priya', type: 'photo_request', createdAt: at(shiftDateStr(coachToday, -2), '17:00'),
      payload: photoRequestPayload(demoId('priya:photo-request'), 'macro_demo_priya_c1') });
  }
  if (ids.users.casey && stateOf.casey) {
    // Last week's check-in reply, Casey's note back on it, and a session request for next week.
    const replyId = demoId('casey:reply');
    rows.publications.push({ id: replyId, card: 'casey', type: 'ai_response', createdAt: at(shiftDateStr(monday, -5), '18:30'),
      payload: { v: 1, tool: 'check_in', response_id: demoId('casey:reply-draft'), macro_id: 'macro_demo_casey_c2',
        content: { headline: 'Weight has stalled: it’s the weekends', narrative: ['Your weekday calories are close to target, but Friday to Sunday are running 800–1,000 over, which is enough to cancel the week’s deficit.', 'Training is solid, and next week is a planned deload anyway. Let’s use it to get the weekends back under control rather than cutting harder.'], kcal: 2000, steps: 10000 } } });
    rows.submissions.push({ id: demoId('casey:note'), client: 'casey', kind: 'note_back', publication_id: replyId, created_at: at(shiftDateStr(monday, -4), '08:10'),
      body: { v: 1, response_id: demoId('casey:reply-draft'), tool: 'check_in', text: 'Fair. Takeaways on Friday and Saturday are the problem. I’ll plan the weekend meals in advance.' } });
    rows.requests.push({ id: demoId('casey:request'), client: 'casey', notes: 'Could we do a session on my squat form? Knees cave in on the last few reps.', repeat_weekly: false, created_at: at(yesterday, '12:20'),
      preferences: [{ date: shiftDateStr(monday, 7), start_min: 450 }, { date: shiftDateStr(monday, 8), start_min: 720, end_min: 840 }] });
  }
  return rows;
}
