// ═══════════════════════════════════════════════════════════════════════
// A group session, logged (TECHNICAL §162). Pure: no clock, no repo.
//
// The coach runs the session's planned workout (0033, a copy of a Library workout template) for everyone
// booked, and logs each person's sets. Each attendee's card is sent a `session_log` in BLOC's group contract
// (BLOC §137): {v, session_id, booking_id, kind: 'group', logs: [{name, sets: [{weight, reps}]}], replaces?}.
// BLOC keeps it as an extra session ("Group session · logged by coach") that never touches progression. With
// `replaces: {macroId, week, dayKey}` the client's planned session is treated as swapped: done, not scored, its
// targets held.
//
// 🚨 The session id carries the booking and the day, as In person's does (`gp:{booking id}:{date}:{stamp}`):
//    `session_log` has no date key and a weekly group is one booking id for every week. Every attendee's copy has
//    the same id.
// 🚨 A group's exercises are the workout's, not the client's plan's, so they are matched by NAME: a person's
//    weights start from what they did last time in a group session with that exercise, else the workout's.
// ═══════════════════════════════════════════════════════════════════════
import type { Loose } from '@engine';
import type { CoachPublication } from '@/ai/types';
import type { AssignedSession, PlannedWorkout } from '@/diary/types';
import { currentSessionLogs } from '@/inperson/model';
import type { Template } from '@/plan/templates';

export interface GroupExercise { key: string; name: string; sets: number; reps: string; weight: number; bodyPart: string | null }
export interface GroupSet { kg: string; reps: string; done: boolean }

/** The workout's exercises, in order, each with a stable key for this screen. */
export function workoutExercises(w: PlannedWorkout): GroupExercise[] {
  return [...w.exercises]
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
    .filter((e) => e.category !== 'cardio')
    .map((e, i) => ({
      key: `g${i}`, name: String(e.name ?? `Exercise ${i + 1}`), sets: Math.max(1, Number(e.setsStart) || 1),
      reps: String(e.reps ?? ''), weight: Number(e.startWeight) || 0, bodyPart: typeof e.bodyPart === 'string' ? e.bodyPart : null,
    }));
}

export const groupSessionId = (bookingId: string, date: string, stamp: string) => `gp:${bookingId}:${date}:${stamp}`;
export function parseGroupSessionId(id: unknown): { bookingId: string; date: string } | null {
  const m = /^gp:(.+):(\d{4}-\d{2}-\d{2}):[^:]+$/.exec(String(id ?? ''));
  return m ? { bookingId: m[1], date: m[2] } : null;
}

export interface LoggedGroup {
  pub: CoachPublication;
  sessionId: string;
  bookingId: string | null;
  date: string;
  logs: { name: string; sets: { weight: string; reps: string }[] }[];
  replaces: AssignedSession | null;
}

/** The group sessions logged on one card, newest first (a correction replaces the one it corrects). */
export function loggedGroups(pubs: CoachPublication[]): LoggedGroup[] {
  return currentSessionLogs(pubs)
    .filter((p) => p.payload?.kind === 'group')
    .map((p) => {
      const pay = p.payload as Loose;
      const at = parseGroupSessionId(pay.session_id);
      const logs = (Array.isArray(pay.logs) ? pay.logs : []).filter((l: Loose) => l && typeof l.name === 'string')
        .map((l: Loose) => ({ name: String(l.name), sets: (Array.isArray(l.sets) ? l.sets : []).map((x: Loose) => ({ weight: String(x?.weight ?? ''), reps: String(x?.reps ?? '') })) }));
      const r = pay.replaces as Loose | null | undefined;
      return {
        pub: p, sessionId: String(pay.session_id), bookingId: at?.bookingId ?? (typeof pay.booking_id === 'string' ? pay.booking_id : null),
        date: at?.date ?? p.createdAt.slice(0, 10), logs,
        replaces: r && typeof r.macroId === 'string' ? { macroId: r.macroId, week: Number(r.week), dayKey: String(r.dayKey) } : null,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.pub.seq - a.pub.seq);
}

/** Whether a group week (the booking it reaches phones under, and its day) is logged, on any attendee's card. */
export const groupLoggedFor = (byCard: CoachPublication[][], bookingId: string, date: string) =>
  byCard.some((pubs) => loggedGroups(pubs).some((g) => g.bookingId === bookingId && g.date === date));

/** A person's starting sets for one exercise: what they did last time in a group session with it (by name), else the workout's. */
export function seedSets(ex: GroupExercise, history: LoggedGroup[]): GroupSet[] {
  const name = ex.name.trim().toLowerCase();
  const last = history.map((g) => g.logs.find((l) => l.name.trim().toLowerCase() === name)).find((l) => l && l.sets.length);
  return Array.from({ length: ex.sets }, (_, i) => {
    const src = last ? last.sets[i] ?? last.sets[last.sets.length - 1] : null;
    return { kg: src ? src.weight : ex.weight ? String(ex.weight) : '', reps: src ? src.reps : ex.reps, done: false };
  });
}

/** Exactly 0023's `session_log` keys a group sends. */
export const GROUP_LOG_KEYS = ['v', 'session_id', 'booking_id', 'kind', 'logs', 'replaces'] as const;

/**
 * One attendee's payload: only the sets done (a group's sets have no `done`; BLOC counts every set it's sent), and
 * no exercise with none done. `replaces` only when the coach switched it on for this person.
 */
export function groupPayload(o: { sessionId: string; bookingId: string; exercises: GroupExercise[]; sets: Record<string, GroupSet[]>; replaces: AssignedSession | null }): Loose {
  const logs = o.exercises
    .map((ex) => ({ name: ex.name, sets: (o.sets[ex.key] || []).filter((x) => x.done).map((x) => ({ weight: x.kg.trim(), reps: x.reps.trim() })) }))
    .filter((l) => l.sets.length);
  return {
    v: 1, session_id: o.sessionId, booking_id: o.bookingId, kind: 'group', logs,
    ...(o.replaces ? { replaces: { macroId: o.replaces.macroId, week: o.replaces.week, dayKey: o.replaces.dayKey } } : {}),
  };
}

/** Whether a person did anything: a payload with no sets isn't sent (they didn't come, or nothing was logged). */
export const attended = (sets: Record<string, GroupSet[]> | undefined) => Object.values(sets || {}).some((xs) => xs.some((x) => x.done));

/** A Library workout template as a group's planned workout: a copy, so the template can change without it (0033). */
export function plannedFromTemplate(t: Template): PlannedWorkout {
  if (t.body.kind !== 'workout') throw new Error('Only a workout template can run a group session.');
  return { v: 1, template_id: t.id, name: t.name.slice(0, 80), exercises: JSON.parse(JSON.stringify(t.body.exercises)).slice(0, 40), supersets: { ...t.body.supersets } };
}
