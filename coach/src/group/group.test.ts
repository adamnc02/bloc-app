// Coach v0.10 (TECHNICAL §162): a group session's model. Each rule has a control.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import * as Engine from '@engine';
import type { BlocState, Loose } from '@engine';
import type { CoachPublication } from '@/ai/types';
import { agendaOf, applyGroupLog, recordState } from '@/inperson/model';
import { BOOTCAMP_CIRCUIT } from '@/data/fixtureDiary';
import {
  attended, GROUP_LOG_KEYS, groupLoggedFor, groupPayload, groupSessionId, loggedGroups, parseGroupSessionId, seedSets, workoutExercises,
} from './model';

const DEMO = readFileSync(new URL('../../../bloc-demo-data.json', import.meta.url), 'utf8');
const INDEX = readFileSync(new URL('../../../index.html', import.meta.url), 'utf8');
const MIGRATION_0023 = new URL('../../../../super-duper-octo-barnacle/supabase/migrations/20260831000023_client_state_and_publications.sql', import.meta.url);
const MID = 'macro_1780859905961';
const TODAY = '2026-08-02';
const demo = () => JSON.parse(DEMO) as BlocState;
const pub = (id: string, seq: number, payload: object, createdAt = '2026-08-08T10:30:00.000Z'): CoachPublication =>
  ({ id, seq, type: 'session_log', payload: { v: 1, ...payload } as Loose, supersedes: null, createdAt, ack: null });

/** BLOC's real applyGroupSessionLog, from index.html. */
async function blocApplier() {
  const url = new URL('../../../scripts/golden/extract-engine.mjs', import.meta.url).href;
  const x = await import(/* @vite-ignore */ url);
  const { decls } = x.indexTopLevel(x.mainScript(INDEX));
  const stubs = new Set(['state', 'BlocEngine', 'recordExerciseHistory', 'save', 'document']);
  const parts = x.closure(decls, ['applyGroupSessionLog'], stubs) as { text: string }[];
  return new Function('env', `let state = env.state; const BlocEngine = env.engine;
    ${parts.map((p) => p.text).join('\n')}
    return { run: (pub) => applyGroupSessionLog(pub), get state() { return state; } };`) as (env: { state: BlocState; engine: typeof Engine }) => { run: (p: Loose) => Loose; state: BlocState };
}

const firstSession = (s: BlocState) => {
  const m = s.macrocycles!.find((x) => x.id === MID)!;
  const x = agendaOf(s, m, TODAY).flatMap((u) => u.sessions).find((y) => y.assignable)!;
  return { macroId: MID, week: x.week, dayKey: x.dayKey };
};

describe('the workout and the payload', () => {
  const exs = workoutExercises(BOOTCAMP_CIRCUIT);
  it('lists the workout in its order, with its sets, reps and weight', () => {
    expect(exs.map((e) => [e.name, e.sets, e.reps, e.weight])).toEqual([['Kettlebell Swing', 4, '15', 16], ['Goblet Squat', 4, '12', 14], ['Press-up', 4, '12', 0], ['TRX Row', 4, '12', 0]]);
  });
  it('sends only the sets done, no exercise with none, and replaces only when set', () => {
    const sets = { g0: [{ kg: '16', reps: '15', done: true }, { kg: '16', reps: '15', done: false }], g1: [{ kg: '14', reps: '12', done: false }] };
    const p = groupPayload({ sessionId: groupSessionId('sr-bootcamp', '2026-08-08', 't'), bookingId: 'sr-bootcamp', exercises: exs, sets, replaces: null });
    expect(p).toEqual({ v: 1, session_id: 'gp:sr-bootcamp:2026-08-08:t', booking_id: 'sr-bootcamp', kind: 'group', logs: [{ name: 'Kettlebell Swing', sets: [{ weight: '16', reps: '15' }] }] });
    const r = groupPayload({ sessionId: 's', bookingId: 'b', exercises: exs, sets, replaces: { macroId: 'm', week: 3, dayKey: 'push' } });
    expect(r.replaces).toEqual({ macroId: 'm', week: 3, dayKey: 'push' });
  });
  it('writes only keys on 0023\'s session_log list', () => {
    // The migration repo sits beside this one locally; CI has only this repo, so it falls back to the documented list.
    const allowed = existsSync(MIGRATION_0023)
      ? /when 'session_log'\s+then array\[([^\]]+)\]/.exec(readFileSync(MIGRATION_0023, 'utf8'))![1].match(/'([a-z_]+)'/g)!.map((k) => k.slice(1, -1))
      : ['v', 'session_id', 'booking_id', 'macro_id', 'week', 'day_key', 'kind', 'replaces', 'logs', 'rpe'];
    for (const k of GROUP_LOG_KEYS) expect(allowed).toContain(k);
    const p = groupPayload({ sessionId: 's', bookingId: 'b', exercises: exs, sets: { g0: [{ kg: '1', reps: '1', done: true }] }, replaces: { macroId: 'm', week: 1, dayKey: 'd' } });
    for (const k of Object.keys(p)) expect(allowed).toContain(k);
  });
  it('someone with nothing done didn\'t attend (control: one set done)', () => {
    expect(attended({ g0: [{ kg: '1', reps: '1', done: false }] })).toBe(false);
    expect(attended({ g0: [{ kg: '1', reps: '1', done: true }] })).toBe(true);
  });
  it('the session id carries the booking and the day', () => {
    expect(parseGroupSessionId(groupSessionId('sr-x', '2026-08-08', 'abc'))).toEqual({ bookingId: 'sr-x', date: '2026-08-08' });
    expect(parseGroupSessionId('ip:sr-x:2026-08-08:abc')).toBeNull();
  });
});

describe('what was logged, and where each person starts', () => {
  const exs = workoutExercises(BOOTCAMP_CIRCUIT);
  const earlier = pub('g1', 5, { session_id: 'gp:sr-bootcamp:2026-08-01:a', booking_id: 'sr-bootcamp', kind: 'group', logs: [{ name: 'Kettlebell Swing', sets: [{ weight: '20', reps: '15' }, { weight: '20', reps: '12' }] }] });
  const inPerson = pub('i1', 6, { session_id: 'ip:bk:2026-08-02:a', kind: 'in_person', macro_id: MID, week: 1, day_key: 'x', logs: {} });
  it('lists the group sessions only, newest first', () => {
    const l = loggedGroups([inPerson, earlier]);
    expect(l.map((g) => [g.bookingId, g.date])).toEqual([['sr-bootcamp', '2026-08-01']]);
  });
  it('a week is logged when any attendee\'s card has it (control: another day)', () => {
    expect(groupLoggedFor([[], [earlier]], 'sr-bootcamp', '2026-08-01')).toBe(true);
    expect(groupLoggedFor([[], [earlier]], 'sr-bootcamp', '2026-08-08')).toBe(false);
  });
  it('a person starts from their last group sets for that exercise, by name, else the workout\'s', () => {
    const hist = loggedGroups([earlier]);
    expect(seedSets(exs[0], hist).map((x) => [x.kg, x.reps])).toEqual([['20', '15'], ['20', '12'], ['20', '12'], ['20', '12']]);
    expect(seedSets(exs[1], hist).map((x) => [x.kg, x.reps])).toEqual([['14', '12'], ['14', '12'], ['14', '12'], ['14', '12']]);
    // Control: with no history the swing starts from the workout's 16.
    expect(seedSets(exs[0], []).map((x) => x.kg)).toEqual(['16', '16', '16', '16']);
    expect(seedSets(exs[0], hist).every((x) => !x.done)).toBe(true);
  });
});

describe('a group session that replaces a planned session, as BLOC applies it', () => {
  it('marks the same exercises of the same session as BLOC\'s real applyGroupSessionLog', async () => {
    const make = await blocApplier();
    const s0 = demo();
    const at = firstSession(s0);
    const payload = { v: 1, session_id: 'gp:sr-bootcamp:2026-08-08:t', booking_id: 'sr-bootcamp', kind: 'group', logs: [{ name: 'Kettlebell Swing', sets: [{ weight: '16', reps: '15' }] }], replaces: at };
    const bloc = make({ state: demo(), engine: Engine });
    expect(bloc.run({ id: 'p1', seq: 1, type: 'session_log', payload, created_at: '2026-08-08T10:30:00.000Z' }).status).toBe('applied');
    const mine = demo();
    applyGroupLog(mine, payload, '2026-08-08T10:30:00.000Z');
    const subs = (s: BlocState) => (s as Loose).substitutions;
    expect(Object.keys(subs(mine)).length).toBeGreaterThan(0);
    expect(subs(mine)).toEqual(subs(bloc.state));
  });
  it('the replaced session stops being up next in Coach\'s copy of a client not on the app (control: no replaces)', () => {
    const s0 = demo();
    for (const m of s0.macrocycles!) m.publishedBy = 'coach-1';
    const at = firstSession(s0);
    const logged = (replaces: object | null) => recordState({
      state: s0, coachId: 'coach-1', since: null,
      publications: [pub('p1', 1, { session_id: 'gp:sr-bootcamp:2026-08-08:t', booking_id: 'sr-bootcamp', kind: 'group', logs: [], ...(replaces ? { replaces } : {}) })],
    });
    const find = (s: BlocState) => agendaOf(s, s.macrocycles!.find((m) => m.id === MID)!, TODAY).flatMap((u) => u.sessions).find((x) => x.week === at.week && x.dayKey === at.dayKey)!;
    expect(find(logged(at)).groupReplaced).toBe(true);
    expect(find(logged(null)).groupReplaced).toBe(false);
  });
});
