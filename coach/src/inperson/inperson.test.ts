// Coach v0.6 (TECHNICAL §154): In person's model, on the real engine and the demo client. Each rule has a
// control that shows what goes wrong without it.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as Engine from '@engine';
import type { BlocState, Loose } from '@engine';
import type { CoachPublication } from '@/ai/types';
import {
  agendaOf, applySessionLog, canStart, cycleForSession, defaultSession, loggedFor, loggedSessions, parseSessionId, recordState,
  SESSION_LOG_KEYS, sessionIdFor, sessionLogPayload, sessionTargets, missedFrom, ownDateOf, ownKey, ownSessionIdFor, parseOwnSessionId, type SetEntry,
} from './model';

const DEMO = readFileSync(new URL('../../../bloc-demo-data.json', import.meta.url), 'utf8');
const INDEX = readFileSync(new URL('../../../index.html', import.meta.url), 'utf8');
const MID = 'macro_1780859905961';
const TODAY = '2026-08-02';
const COACH = 'coach-1';
const demo = () => JSON.parse(DEMO) as BlocState;
const coached = () => { const s = demo(); for (const m of s.macrocycles!) m.publishedBy = COACH; return s; };
const macroOf = (s: BlocState) => s.macrocycles!.find((m) => m.id === MID)!;
const pub = (id: string, seq: number, type: string, payload: object, createdAt = '2026-08-02T18:30:00.000Z'): CoachPublication =>
  ({ id, seq, type, payload: { v: 1, ...payload } as Loose, supersedes: null, createdAt, ack: null });

/** BLOC's real applySessionLogPublication, from index.html, with the engine as BlocEngine and history stubbed. */
async function blocApplier() {
  const url = new URL('../../../scripts/golden/extract-engine.mjs', import.meta.url).href;
  const x = await import(/* @vite-ignore */ url);
  const { decls } = x.indexTopLevel(x.mainScript(INDEX));
  const stubs = new Set(['state', 'BlocEngine', 'recordExerciseHistory', 'save', 'document']);
  const parts = x.closure(decls, ['applySessionLogPublication'], stubs) as { text: string }[];
  return new Function('env', `let state = env.state; const BlocEngine = env.engine; const recordExerciseHistory = () => {};
    ${parts.map((p) => p.text).join('\n')}
    return { run: (pub) => applySessionLogPublication(pub), get state() { return state; } };`) as (env: { state: BlocState; engine: typeof Engine }) => { run: (p: Loose) => Loose; state: BlocState };
}

/** The first session of week `w`, and its template. */
function sessionAt(s: BlocState, w: number) {
  const m = macroOf(s);
  const units = agendaOf(s, m, TODAY).filter((u) => u.week === w);
  const x = units[0].sessions[0];
  const template = ((s as Loose).exercises as Record<string, Loose[]>)[`${MID}_1_${x.dayKey}`];
  return { m, week: w, dayKey: x.dayKey, template };
}

const logPayload = (s: BlocState, w: number, kg: string) => {
  const { dayKey, template } = sessionAt(s, w);
  const sets: Record<string, SetEntry[]> = {};
  for (const ex of template.filter((e) => e.category !== 'cardio')) {
    const n = Engine.getWeekSets(ex, w, macroOf(s).weeks as number);
    sets[ex.id] = Array.from({ length: n }, () => ({ kg, reps: String(ex.reps || '10').replace(/[^0-9]/g, '') || '10', done: true }));
  }
  const first = Object.keys(sets)[0];
  return sessionLogPayload({ sessionId: sessionIdFor('bk-1', '2026-08-04', 't1'), bookingId: 'bk-1', macroId: MID, week: w, dayKey, sets, rpe: { [first]: 8 } });
};

describe('a session the coach logged, applied as BLOC applies it', () => {
  it('gives exactly BLOC’s sets, ratings, targets and locks (the real applySessionLogPublication)', async () => {
    const make = await blocApplier();
    for (const w of [2, 5]) {
      const payload = logPayload(demo(), w, '62.5');
      const bloc = make({ state: demo(), engine: Engine });
      expect(bloc.run({ id: 'p1', seq: 1, type: 'session_log', payload, created_at: '2026-08-04T18:30:00.000Z' }).status).toBe('applied');
      const mine = demo();
      expect(applySessionLog(mine, payload, '2026-08-04T18:30:00.000Z')).toBe(true);
      const pick = (s: BlocState) => { const x = s as Loose; return { trainLogs: x.trainLogs, rpe: x.rpe, progressionTargets: x.progressionTargets, progressionLocks: x.progressionLocks }; };
      expect(pick(mine)).toEqual(pick(bloc.state));
    }
  });
  it('control: sets written without the replay leave a later week’s cached target frozen, unlike BLOC', async () => {
    const make = await blocApplier();
    const payload = logPayload(demo(), 2, '90');
    const bloc = make({ state: demo(), engine: Engine });
    bloc.run({ id: 'p1', seq: 1, type: 'session_log', payload, created_at: '2026-08-04T18:30:00.000Z' });
    const naive = demo() as Loose;
    for (const [exId, e] of Object.entries(payload.logs as Record<string, Loose>)) (e.sets as Loose[]).forEach((x, i) => { naive.trainLogs[`${MID}_2_${payload.day_key}_${exId}_${i}`] = { ...x, weight: String(x.weight), loggedBy: 'coach' }; });
    expect(naive.progressionTargets).not.toEqual((bloc.state as Loose).progressionTargets);
  });
  it('is held where BLOC holds it: an exercise not in that session', () => {
    const s = demo();
    expect(applySessionLog(s, { ...logPayload(s, 2, '60'), logs: { nope: { sets: [{ weight: '1', reps: '1' }] } } }, 'x')).toBe(false);
  });
});

describe('the client’s record: the upload plus what the coach has sent and the phone hasn’t applied', () => {
  it('applies an unsettled session_log; one the phone’s ledger has applied isn’t applied twice (control: without the ledger it is)', () => {
    const payload = logPayload(demo(), 2, '77.5');
    const exId = Object.keys(payload.logs as object)[0];
    const key = `${MID}_2_${payload.day_key}_${exId}_0`;
    const p = pub('p1', 1, 'session_log', payload);
    expect((recordState({ state: demo(), publications: [p], coachId: COACH, since: null }) as Loose).trainLogs[key].weight).toBe('77.5');
    const withLedger = demo() as Loose;
    withLedger.coachLedger = { p1: { status: 'applied' } };
    withLedger.trainLogs[key] = { weight: '70', reps: '8', done: true, loggedBy: 'coach' };
    expect((recordState({ state: withLedger as BlocState, publications: [p], coachId: COACH, since: null }) as Loose).trainLogs[key].weight).toBe('70');
  });
  it('a correction (the same session_id) replaces the first: only the latest applies', () => {
    const a = logPayload(demo(), 2, '60'), b = { ...logPayload(demo(), 2, '65'), session_id: a.session_id };
    const exId = Object.keys(a.logs as object)[0];
    const s = recordState({ state: demo(), publications: [pub('p1', 1, 'session_log', a), pub('p2', 2, 'session_log', b)], coachId: COACH, since: null }) as Loose;
    expect(s.trainLogs[`${MID}_2_${a.day_key}_${exId}_0`].weight).toBe('65');
  });
  it('a client not on the app: the plan, their bookings and measurements all come from publications', () => {
    const d = coached() as Loose;
    const plan = pub('p1', 1, 'plan', { macrocycle: { ...d.macrocycles[0] }, exercises: Object.fromEntries(Object.entries(d.exercises as object).filter(([k]) => k.startsWith(MID))) });
    const meas = pub('p2', 2, 'measurement', { log_date: '2026-08-01', weight: 181.5, waist: 33.25, hip: 39 });
    const bk = pub('p3', 3, 'booking', { booking_id: 'b1', date: '2026-08-04', start_min: 600, status: 'booked', kind: 'one_off', assigned_session: { macroId: MID, week: 3, dayKey: 'x' } });
    const s = recordState({ state: null, publications: [plan, meas, bk], coachId: COACH, since: null }) as Loose;
    expect(s.macrocycles.map((m: Loose) => [m.id, m.publishedBy])).toEqual([[MID, COACH]]);
    expect(s.bodyLogs.find((l: Loose) => l.date === '2026-08-01')).toMatchObject({ weight: 181.5, waist: 33.25, measuredByCoach: true });
    expect(s.coachBookings.b1.assigned_session.week).toBe(3);
  });
  it('publications from before an unlink stay gone (the since cut-off)', () => {
    const p = pub('p1', 1, 'measurement', { log_date: '2026-08-01', weight: 170 }, '2026-07-01T00:00:00.000Z');
    const s = recordState({ state: demo(), publications: [p], coachId: COACH, since: '2026-07-05T00:00:00.000Z' }) as Loose;
    expect(s.bodyLogs.find((l: Loose) => l.date === '2026-08-01')?.weight).not.toBe(170);
  });
});

describe('which cycle and which session', () => {
  it('only a coach’s cycle: a client’s own cycle is theirs to log (control: published, it is found)', () => {
    expect(cycleForSession(demo(), TODAY, TODAY)).toBeNull();
    expect(cycleForSession(coached(), TODAY, TODAY)?.id).toBe(MID);
  });
  it('defaults to the client’s next unfinished session, as the engine (and BLOC’s Up next) says', () => {
    const s = coached(), m = macroOf(s);
    const next = Engine.getNextIncompleteSession(s, m)!;
    expect(defaultSession(s, m, TODAY, null)).toEqual({ macroId: MID, week: next.week, dayKey: next.dayKey });
  });
  it('a session the coach tagged wins while the client hasn’t started it; once they have, it falls back', () => {
    const s = coached(), m = macroOf(s);
    const later = agendaOf(s, m, TODAY).flatMap((u) => u.sessions).filter((x) => x.assignable)[3];
    const tag = { macroId: MID, week: later.week, dayKey: later.dayKey };
    expect(defaultSession(s, m, TODAY, tag)).toEqual(tag);
    const ex = ((s as Loose).exercises as Record<string, Loose[]>)[`${MID}_1_${later.dayKey}`][0];
    (s as Loose).trainLogs[`${MID}_${later.week}_${later.dayKey}_${ex.id}_0`] = { weight: '40', reps: '10', done: true };
    expect(defaultSession(s, m, TODAY, tag)).not.toEqual(tag);
  });
  it('a started session isn’t assignable; one not touched is (control)', () => {
    const s = coached(), m = macroOf(s);
    const units = agendaOf(s, m, TODAY).flatMap((u) => u.sessions);
    expect(units.filter((x) => x.done).every((x) => !x.assignable)).toBe(true);
    const fresh = units.find((x) => x.doneSets === 0 && !x.done)!;
    expect(fresh.assignable).toBe(true);
    const ex = ((s as Loose).exercises as Record<string, Loose[]>)[`${MID}_1_${fresh.dayKey}`][0];
    (s as Loose).trainLogs[`${MID}_${fresh.week}_${fresh.dayKey}_${ex.id}_0`] = { weight: '40', reps: '10', done: true };
    expect(agendaOf(s, m, TODAY).flatMap((u) => u.sessions).find((x) => x.week === fresh.week && x.dayKey === fresh.dayKey)!.assignable).toBe(false);
  });
});

describe('targets, as Train shows them', () => {
  it('week 1 is the starting weight, as Train’s placeholders', () => {
    const s = coached(), { m, dayKey, template } = sessionAt(s, 1);
    const t = sessionTargets(s, m, 1, dayKey);
    const ex = template.filter((e) => e.category !== 'cardio').sort((a, b) => (a.order || 0) - (b.order || 0))[0];
    expect(t.find((x) => x.ex.id === ex.id)!.weights[0]).toBe(Number(ex.startWeight).toFixed(1));
  });
  it('the week after a logged week follows what was lifted (control: the same week unlogged)', () => {
    const base = coached(), { m, dayKey } = sessionAt(base, 3);
    const later = sessionAt(base, 4).dayKey;
    const plain = sessionTargets(coached(), m, 4, later);
    const heavy = coached();
    applySessionLog(heavy, logPayload(heavy, 3, '120'), 'x');
    const after = sessionTargets(heavy, macroOf(heavy), 4, later);
    expect(dayKey).toBe(later);
    expect(Number(after[0].weights[0])).toBeGreaterThan(Number(plain[0].weights[0]));
  });
});

describe('the session_log payload', () => {
  const sets = { a: [{ kg: '40', reps: '10', done: true }, { kg: '40', reps: '8', done: false }], b: [{ kg: '20', reps: '12', done: false }] };
  it('uses only 0023’s keys, sends every set of an exercise with one done (unfinished as done: false), and leaves out an exercise with none', () => {
    const p = sessionLogPayload({ sessionId: 'ip:x:2026-08-04:1', bookingId: 'x', macroId: MID, week: 2, dayKey: 'd', sets, rpe: null });
    expect(Object.keys(p).every((k) => (SESSION_LOG_KEYS as readonly string[]).includes(k))).toBe(true);
    expect(p.logs).toEqual({ a: { sets: [{ weight: '40', reps: '10', done: true }, { weight: '40', reps: '8', done: false }] } });
    expect(p.kind).toBe('in_person');
    expect('rpe' in p).toBe(false);
  });
  it('ratings: one per exercise sent, "skipped" where the coach left one', () => {
    const p = sessionLogPayload({ sessionId: 's', bookingId: 'x', macroId: MID, week: 2, dayKey: 'd', sets: { ...sets, c: [{ kg: '1', reps: '1', done: true }] }, rpe: { a: 7 } });
    expect(p.rpe).toEqual({ a: 7, c: 'skipped' });
  });
  it('the session id carries the booking and the day, and reads back', () => {
    expect(parseSessionId(sessionIdFor('3f1c-uuid', '2026-10-07', 'k9'))).toEqual({ bookingId: '3f1c-uuid', date: '2026-10-07' });
    expect(parseSessionId('something-else')).toBeNull();
  });
  it('past sessions: newest first, a correction replacing its session, matched to a diary week', () => {
    const a = pub('p1', 1, 'session_log', { session_id: sessionIdFor('b1', '2026-07-28', '1'), macro_id: MID, week: 1, day_key: 'd', kind: 'in_person', logs: { a: { sets: [{ weight: '1', reps: '1' }] } } });
    const b = pub('p2', 2, 'session_log', { session_id: sessionIdFor('b1', '2026-08-04', '2'), macro_id: MID, week: 2, day_key: 'd', kind: 'in_person', logs: { a: { sets: [{ weight: '1', reps: '1', done: false }] } } });
    const b2 = { ...pub('p3', 3, 'session_log', { ...b.payload, logs: { a: { sets: [{ weight: '2', reps: '2' }] } } }), supersedes: 'p2' };
    const l = loggedSessions([a, b, b2]);
    expect(l.map((x) => [x.date, x.pub.id, x.setsDone])).toEqual([['2026-08-04', 'p3', 1], ['2026-07-28', 'p1', 1]]);
    expect(loggedFor(l, 'b1', '2026-07-28')?.pub.id).toBe('p1');
    expect(loggedFor(l, 'b1', '2026-07-21')).toBeNull();
  });
});

describe('when Start session shows', () => {
  it('from 15 minutes before the start until the end of that day; not before, not the day after', () => {
    expect(canStart('2026-08-04', 18 * 60, '2026-08-04', 17 * 60 + 44)).toBe(false);
    expect(canStart('2026-08-04', 18 * 60, '2026-08-04', 17 * 60 + 45)).toBe(true);
    expect(canStart('2026-08-04', 18 * 60, '2026-08-04', 23 * 60 + 59)).toBe(true);
    expect(canStart('2026-08-04', 18 * 60, '2026-08-05', 1)).toBe(false);
  });
  it('a missed booking is raised for 14 days', () => {
    expect(missedFrom('2026-08-15')).toBe('2026-08-01');
  });
});

describe('a session a client not on the app did on their own (§162)', () => {
  it('has no booking: its id carries the day, and the payload has no booking_id (control: an in-person one does)', () => {
    const id = ownSessionIdFor('2026-08-05', 'k');
    expect(parseOwnSessionId(id)).toEqual({ date: '2026-08-05' });
    expect(parseSessionId(id)).toBeNull();
    expect(ownDateOf(ownKey('2026-08-05'))).toBe('2026-08-05');
    const sets = { e1: [{ kg: '40', reps: '10', done: true }] };
    const own = sessionLogPayload({ sessionId: id, bookingId: null, macroId: MID, week: 2, dayKey: 'd', sets, rpe: null });
    expect('booking_id' in own).toBe(false);
    expect(own.kind).toBe('in_person');
    expect(sessionLogPayload({ sessionId: 'ip:b:2026-08-05:k', bookingId: 'b', macroId: MID, week: 2, dayKey: 'd', sets, rpe: null }).booking_id).toBe('b');
  });
  it('is listed as on their own, on its day (control: an in-person one isn\'t)', () => {
    const l = loggedSessions([
      pub('o1', 1, 'session_log', { session_id: ownSessionIdFor('2026-08-05', 'k'), kind: 'in_person', macro_id: MID, week: 2, day_key: 'd', logs: {} }),
      pub('i1', 2, 'session_log', { session_id: sessionIdFor('bk', '2026-08-06', 'k'), kind: 'in_person', macro_id: MID, week: 2, day_key: 'd', logs: {} }),
    ]);
    expect(l.map((x) => [x.date, x.own, x.bookingId])).toEqual([['2026-08-06', false, 'bk'], ['2026-08-05', true, null]]);
  });
});
