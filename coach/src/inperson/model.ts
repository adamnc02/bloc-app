// ═══════════════════════════════════════════════════════════════════════
// In person: the coach logs a client's planned session with them (TECHNICAL
// §154). Pure: no clock, no repo; every date is passed in.
//
// The session is one of a coach's cycles (publishedBy): the client's own
// cycles are theirs to log. Everything is judged on the client's state as
// their phone will hold it once it has pulled what the coach has sent
// (`recordState`): the upload, or an empty state for a client with none,
// with the coach's unapplied plan, goal, booking, session_log and measurement
// publications applied as BLOC applies them (BLOC §131, §137).
//
// What reaches the phone is a `session_log` publication in BLOC's contract
// (BLOC §137): {v, session_id, booking_id, macro_id, week, day_key,
// kind: 'in_person', logs: {exId: {sets: [{weight, reps, done}]}}, rpe:
// {exId: 1–10 | 'skipped'}}. BLOC stamps it logged by the coach, replaces the
// whole session with it, and replays the progression after it (I2).
//
// 🚨 The session id carries the booking and the day it was for
//    (`ip:{booking id}:{date}:{stamp}`): 0023's `session_log` allow-list has no
//    date key, and a weekly booking is one id for every week, so the id is how
//    a logged session is matched to its diary week (missed bookings, past
//    sessions). A correction keeps the id.
// ═══════════════════════════════════════════════════════════════════════
import {
  computeExerciseProgression, computeLockTransition, getMacroEffectiveMesoCount, getNextIncompleteSession, getProgressionLockKey,
  getRpeKey, getSubstitutionKey, getTrainAgendaUnits, getWeekSets, isRpeOn, replayProgressionAfterLog, shiftDateStr, macroRange,
  type BlocState, type Loose, type Macrocycle, type TargetCache,
} from '@engine';
import type { CoachPublication } from '@/ai/types';
import { foldState } from '@/plan/fold';
import type { AssignedSession } from '@/diary/types';

const copy = <T>(v: T): T => (v == null ? v : (JSON.parse(JSON.stringify(v)) as T));

// ---------------------------------------------------------------- the client's record

export interface RecordInput {
  /** The client's newest upload, if any. */
  state: BlocState | null;
  /** Every publication on the card, with receipts. */
  publications: CoachPublication[];
  coachId: string;
  /** When the card's last link ended; earlier publications are gone from the phone. */
  since: string | null;
}

/** Whether the phone has settled a publication (applied or superseded), by its own ledger. */
function settled(state: BlocState | null, id: string): boolean {
  const l = ((state as Loose | null)?.coachLedger as Record<string, { status?: string }> | undefined)?.[id];
  return l?.status === 'applied' || l?.status === 'superseded';
}

/** The latest of each `session_id`: a correction supersedes the one before. */
export function currentSessionLogs(pubs: CoachPublication[]): CoachPublication[] {
  const byId = new Map<string, CoachPublication>();
  for (const p of pubs.filter((x) => x.type === 'session_log').sort((a, b) => a.seq - b.seq)) byId.set(String(p.payload?.session_id ?? p.id), p);
  return [...byId.values()];
}

/**
 * The client's state as their phone will hold it once it has pulled every publication the coach has made:
 * the plan (foldState), then bookings, in-person sessions and measurements not yet settled on the phone.
 */
export function recordState(input: RecordInput): BlocState {
  const s = foldState(input) as Loose;
  const since = input.since;
  const live = input.publications.filter((p) => (!since || p.createdAt > since) && !settled(input.state, p.id)).sort((a, b) => a.seq - b.seq);
  if (!s.trainLogs || typeof s.trainLogs !== 'object') s.trainLogs = {};
  if (!s.rpe || typeof s.rpe !== 'object') s.rpe = {};
  if (!s.progressionTargets || typeof s.progressionTargets !== 'object') s.progressionTargets = {};
  if (!s.progressionLocks || typeof s.progressionLocks !== 'object') s.progressionLocks = {};
  if (!Array.isArray(s.bodyLogs)) s.bodyLogs = [];
  if (!s.coachBookings || typeof s.coachBookings !== 'object') s.coachBookings = {};
  const logs = new Set(currentSessionLogs(input.publications).map((p) => p.id));
  for (const p of live) {
    const pay = (p.payload || {}) as Loose;
    if (p.type === 'booking' && typeof pay.booking_id === 'string') s.coachBookings[pay.booking_id] = copy(pay);
    else if (p.type === 'session_log' && logs.has(p.id) && (pay.kind || 'in_person') === 'in_person') applySessionLog(s as BlocState, pay, p.createdAt);
    else if (p.type === 'session_log' && logs.has(p.id) && pay.kind === 'group') applyGroupLog(s as BlocState, pay, p.createdAt);
    else if (p.type === 'measurement') applyMeasurement(s as BlocState, pay);
  }
  return s as BlocState;
}

/** A target cache over the state's own `progressionTargets`, written through (the state is Coach's copy). */
export function ownCache(s: BlocState): TargetCache {
  const t = ((s as Loose).progressionTargets ||= {}) as Record<string, Loose>;
  return { get: (k) => t[k], set: (k, v) => { t[k] = v; } };
}

const LOG_NUM_FIELDS = ['weight', 'reps', 'dropWeight', 'dropReps'];

/**
 * BLOC's `applySessionLogPublication` on Coach's copy (BLOC §137): the whole (week, day) session becomes the
 * coach's sets, as Train's inputs store them, and the progression after it replays. Returns false where BLOC
 * would hold it (the cycle, week or session isn't there).
 */
export function applySessionLog(s: BlocState, p: Loose, loggedAt: string): boolean {
  const st = s as Loose;
  for (const k of ['trainLogs', 'rpe', 'progressionTargets', 'progressionLocks']) if (!st[k] || typeof st[k] !== 'object') st[k] = {};
  const macro = (s.macrocycles || []).find((m) => m.id === p.macro_id);
  const week = Number(p.week);
  const dayKey = String(p.day_key ?? '');
  if (!macro || !Number.isInteger(week) || week < 1 || week > getMacroEffectiveMesoCount(macro)) return false;
  const template = ((st.exercises as Record<string, Loose[]>)[`${macro.id}_1_${dayKey}`] || []);
  if (!template.length) return false;
  const logs = p.logs && typeof p.logs === 'object' && !Array.isArray(p.logs) ? (p.logs as Record<string, Loose>) : {};
  const known = new Set(template.map((e) => e.id));
  if ([...Object.keys(logs), ...Object.keys((p.rpe as object) || {})].some((id) => !known.has(id))) return false;
  const tl = st.trainLogs as Record<string, Loose>;
  for (const ex of template) {
    const prefix = `${macro.id}_${week}_${dayKey}_${ex.id}_`;
    for (const k of Object.keys(tl)) if (k.startsWith(prefix) && /^\d+$/.test(k.slice(prefix.length))) delete tl[k];
  }
  for (const [exId, entry] of Object.entries(logs)) {
    const sets = Array.isArray(entry) ? entry : Array.isArray(entry?.sets) ? (entry.sets as Loose[]) : [];
    sets.forEach((x, i) => {
      if (!x || typeof x !== 'object') return;
      const rec: Loose = {};
      for (const [f, v] of Object.entries(x)) {
        if (v == null || typeof v === 'object' || ['loggedBy', 'loggedAt', 'sessionId', 'done'].includes(f)) continue;
        rec[f] = LOG_NUM_FIELDS.includes(f) ? String(v) : v;
      }
      rec.done = x.done !== false;
      Object.assign(rec, { loggedBy: 'coach', loggedAt, sessionId: p.session_id });
      tl[`${macro.id}_${week}_${dayKey}_${exId}_${i}`] = rec;
    });
  }
  const rpe = st.rpe as Record<string, Loose>;
  for (const [exId, r] of Object.entries((p.rpe as Record<string, unknown>) || {})) {
    const k = getRpeKey(macro.id, week, dayKey, exId);
    if (typeof r === 'number' && r >= 1 && r <= 10) rpe[k] = { rpe: Math.round(r), ratedBy: 'coach' };
    else if (r === 'skipped') rpe[k] = { rpeSkipped: true, ratedBy: 'coach' };
  }
  const touched = template.filter((e) => e.id in logs);
  const r = replayProgressionAfterLog(s, ownCache(s), macro, week, dayKey, touched);
  const targets = st.progressionTargets as Record<string, Loose>;
  for (const k of r.deleteTargets) delete targets[k];
  Object.assign(targets, r.setTargets);
  const locks = st.progressionLocks as Record<string, Loose>;
  for (const [k, v] of Object.entries(r.locks)) { if (v) locks[k] = v; else delete locks[k]; }
  return true;
}

/**
 * BLOC's `applyGroupSessionLog`, the part that changes the plan: a group session marked as replacing a planned session
 * puts BLOC's 'group' substitution on every exercise of it (done, not scored, targets held). Its earlier markers
 * (a correction) go first. The extra session itself isn't modelled: nothing in Coach reads it from the state.
 */
export function applyGroupLog(s: BlocState, p: Loose, loggedAt: string): void {
  const st = s as Loose;
  if (!st.substitutions || typeof st.substitutions !== 'object') st.substitutions = {};
  const subs = st.substitutions as Record<string, Loose>;
  for (const [k, x] of Object.entries(subs)) if (x && x.kind === 'group' && x.sessionId === p.session_id) delete subs[k];
  const r = p.replaces as Loose | null | undefined;
  if (!r || typeof r.macroId !== 'string') return;
  const template = ((st.exercises as Record<string, Loose[]>)[`${r.macroId}_1_${r.dayKey}`] || []);
  for (const ex of template) subs[getSubstitutionKey(r.macroId, Number(r.week), String(r.dayKey), ex.id)] = { kind: 'group', sessionId: p.session_id, at: loggedAt };
}

/** BLOC's `applyMeasurementPublication`: into that day's body log, keeping its steps. */
export function applyMeasurement(s: BlocState, p: Loose): void {
  if (typeof p.log_date !== 'string') return;
  const logs = (s as Loose).bodyLogs as Loose[];
  let log = logs.find((b) => b.date === p.log_date);
  if (!log) { log = { date: p.log_date, weight: null, steps: null, waist: null, hip: null }; logs.push(log); }
  for (const f of ['weight', 'waist', 'hip']) if (p[f] != null && p[f] !== '') log[f] = p[f];
  log.measuredByCoach = true;
  logs.sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

// ---------------------------------------------------------------- which cycle, which session

/**
 * The coach's cycle an in-person session on `date` is for: the one running at the client's today, else the one
 * the session's date falls in. Only a coach's cycle (publishedBy); a client's own cycle is theirs to log.
 */
export function cycleForSession(s: BlocState, today: string, date: string): Macrocycle | null {
  const coach = (s.macrocycles || []).filter((m) => m.publishedBy && m.start);
  const within = (d: string) => coach.find((m) => { const r = macroRange(m, { today }); return !!r.start && d >= r.start && d <= r.end; }) ?? null;
  return within(today) ?? within(date);
}

export interface PickSession {
  week: number;
  dayKey: string;
  label: string;
  exercises: number;
  sets: number;
  doneSets: number;
  done: boolean;
  partial: boolean;
  upNext: boolean;
  coachLogged: boolean;
  groupReplaced: boolean;
  /** Can be assigned: nothing of it done by the client, not logged, not replaced. */
  assignable: boolean;
}
export interface PickUnit { key: string; week: number; start: string | null; end: string | null; isThisWeek: boolean; isDeload: boolean; sessions: PickSession[]; doneCount: number }

/** The week agenda (BLOC §115's design): one unit per calendar week, its sessions and their states, at the client's today. */
export function agendaOf(s: BlocState, macro: Macrocycle, today: string): PickUnit[] {
  const { units } = getTrainAgendaUnits(s, { today }, macro, null);
  return (units as Loose[]).map((u) => ({
    key: String(u.key), week: Number(u.week), start: u.start ?? null, end: u.end ?? null, isThisWeek: !!u.isThisWeek, isDeload: !!u.isDeload,
    doneCount: Number(u.doneCount) || 0,
    sessions: (u.sessions as Loose[]).map((x) => {
      const p: Omit<PickSession, 'assignable'> = {
        week: Number(x.week), dayKey: String(x.dayKey), label: String(x.label), exercises: Number(x.exercises) || 0, sets: Number(x.sets) || 0,
        doneSets: Number(x.doneSets) || 0, done: !!x.done, partial: !!x.partial, upNext: !!x.upNext, coachLogged: !!x.coachLogged, groupReplaced: !!x.groupReplaced,
      };
      return { ...p, assignable: !p.done && !p.partial && !p.coachLogged && !p.groupReplaced && p.doneSets === 0 };
    }),
  }));
}

/** Where a session of the agenda stands, in words, and its tag's tone (Sessions → This cycle, §165). */
export function sessionStatus(x: PickSession): { text: string; tone: 'good' | 'acc' | 'blue' | 'amber' | 'neutral' } {
  if (x.groupReplaced) return { text: 'Replaced by a group', tone: 'blue' };
  if (x.coachLogged) return { text: 'Logged by you', tone: 'acc' };
  if (x.done) return { text: 'Done', tone: 'good' };
  if (x.partial || x.doneSets > 0) return { text: `Part done · ${x.doneSets}/${x.sets} sets`, tone: 'amber' };
  if (x.upNext) return { text: 'Up next', tone: 'acc' };
  return { text: 'To do', tone: 'neutral' };
}

export const sameSession = (a: Pick<AssignedSession, 'macroId' | 'week' | 'dayKey'> | null | undefined, b: Pick<AssignedSession, 'macroId' | 'week' | 'dayKey'> | null | undefined) =>
  !!a && !!b && a.macroId === b.macroId && Number(a.week) === Number(b.week) && a.dayKey === b.dayKey;

/**
 * The session Start session opens on: the one the coach assigned to this booking, while the client hasn't
 * started it; otherwise the client's next unfinished session (the engine's `getNextIncompleteSession`, which
 * BLOC's own Up next uses, so both agree).
 */
export function defaultSession(s: BlocState, macro: Macrocycle, today: string, assigned: AssignedSession | null): AssignedSession | null {
  const units = agendaOf(s, macro, today);
  const find = (w: number, d: string) => units.flatMap((u) => u.sessions).find((x) => x.week === w && x.dayKey === d);
  if (assigned && assigned.macroId === macro.id) {
    const a = find(Number(assigned.week), assigned.dayKey);
    if (a && a.assignable) return { macroId: macro.id, week: a.week, dayKey: a.dayKey };
  }
  const next = getNextIncompleteSession(s, macro);
  return next ? { macroId: macro.id, week: Number(next.week), dayKey: String(next.dayKey) } : null;
}

// ---------------------------------------------------------------- targets

export interface ExerciseTarget {
  ex: Loose;
  sets: number;
  /** Per set, what Train would suggest: the engine's placeholders. */
  weights: string[];
  reps: string[];
  deload: boolean;
  locked: boolean;
  /** Last week's done sets for this exercise, as Train's "Last wk". */
  last: { weight: string | null; reps: string | null }[];
}

/**
 * Each exercise's targets for one session, as Train computes them (BLOC's exProgData): the lock swept over
 * every earlier week first, on Coach's copy, then the engine's progression. The state passed in is changed
 * only in its own target and lock caches, which are Coach's.
 */
export function sessionTargets(s: BlocState, macro: Macrocycle, week: number, dayKey: string): ExerciseTarget[] {
  const st = s as Loose;
  const cache = ownCache(s);
  const template = [...((st.exercises as Record<string, Loose[]>)[`${macro.id}_1_${dayKey}`] || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
  return template.map((ex) => {
    let prevWasLocked = false;
    let lockComingIn: Loose | undefined;
    if (ex.category !== 'cardio') {
      const lockKey = getProgressionLockKey(macro.id, dayKey, ex.id);
      const locks = (st.progressionLocks ||= {}) as Record<string, Loose>;
      const sweep = (w: number) => {
        const t = computeLockTransition(s, cache, macro, w, dayKey, ex);
        if (!t) return;
        if ('set' in t) locks[t.key] = t.set; else delete locks[t.key];
      };
      for (let w = 2; w < week; w++) {
        if (w === week - 1) prevWasLocked = !!locks[lockKey];
        sweep(w);
      }
      lockComingIn = locks[lockKey];
      sweep(week);
    }
    const d = computeExerciseProgression(s, cache, macro, week, dayKey, ex, ex.category === 'cardio' ? undefined : { lockComingIn, prevWasLocked });
    const n = Number(d.sets) || getWeekSets(ex, week, macro.weeks as number);
    const pick = (arr: unknown, one: unknown) => Array.from({ length: n }, (_, i) => String((Array.isArray(arr) ? arr[i] ?? arr[arr.length - 1] : undefined) ?? one ?? ''));
    const tl = st.trainLogs as Record<string, Loose>;
    const prevWeek = Number(d.prevWeek2) || week - 1;
    const last = Array.from({ length: n }, (_, i) => {
      const lg = tl[`${macro.id}_${prevWeek}_${dayKey}_${ex.id}_${i}`];
      return lg && lg.done ? { weight: lg.weight != null ? String(lg.weight) : null, reps: lg.reps != null ? String(lg.reps) : null } : { weight: null, reps: null };
    });
    return {
      ex, sets: n, weights: pick(d.weightPlaceholders, d.weightPlaceholder), reps: pick(d.repsPlaceholders, d.repsPlaceholder).map((r) => r.replace(/ reps$/, '')),
      deload: !!d.isDeloadSession, locked: !!d.isLocked, last,
    };
  });
}

// ---------------------------------------------------------------- the session_log

export interface SetEntry { kg: string; reps: string; done: boolean }
export type Ratings = Record<string, number | 'skipped'>;

/** The session id: the booking it reaches the phone under, the day it was for, and a stamp. A correction keeps it. */
export const sessionIdFor = (bookingId: string, date: string, stamp: string) => `ip:${bookingId}:${date}:${stamp}`;
export function parseSessionId(id: unknown): { bookingId: string; date: string } | null {
  const m = /^ip:(.+):(\d{4}-\d{2}-\d{2}):[^:]+$/.exec(String(id ?? ''));
  return m ? { bookingId: m[1], date: m[2] } : null;
}

/**
 * A session a client not on the app did on their own, which the coach records from the sheet they filled in (§162):
 * no booking, so the id carries only the day. It's `kind: 'in_person'` to BLOC (it's the coach's record of the
 * client's session, and progresses the same way); only Coach tells the two apart, by this id.
 */
export const ownSessionIdFor = (date: string, stamp: string) => `own:${date}:${stamp}`;
export function parseOwnSessionId(id: unknown): { date: string } | null {
  const m = /^own:(\d{4}-\d{2}-\d{2}):[^:]+$/.exec(String(id ?? ''));
  return m ? { date: m[1] } : null;
}
/** The diary key an own session's screen is opened on: `own:{date}` (no booking). */
export const ownKey = (date: string) => `own:${date}`;
export const ownDateOf = (occKey: string) => (/^own:(\d{4}-\d{2}-\d{2})$/.exec(occKey)?.[1] ?? null);

/** Exactly 0023's `session_log` keys. */
export const SESSION_LOG_KEYS = ['v', 'session_id', 'booking_id', 'macro_id', 'week', 'day_key', 'kind', 'replaces', 'logs', 'rpe'] as const;

/**
 * The payload for BLOC (§137). Every set of an exercise with a set done goes, a set not done as `done: false`
 * ("unfinished sets count as not done"); an exercise with nothing done isn't sent, so it reads as not done.
 * Ratings go for the exercises sent, 'skipped' where the coach left one unrated.
 */
export function sessionLogPayload(o: { sessionId: string; bookingId: string | null; macroId: string; week: number; dayKey: string; sets: Record<string, SetEntry[]>; rpe: Ratings | null }): Loose {
  const logs: Record<string, { sets: { weight: string; reps: string; done: boolean }[] }> = {};
  for (const [exId, sets] of Object.entries(o.sets)) {
    if (!sets.some((x) => x.done)) continue;
    logs[exId] = { sets: sets.map((x) => ({ weight: x.kg.trim(), reps: x.reps.trim(), done: x.done })) };
  }
  const out: Loose = { v: 1, session_id: o.sessionId, macro_id: o.macroId, week: o.week, day_key: o.dayKey, kind: 'in_person', logs };
  // A session done on their own has no booking (§162).
  if (o.bookingId) out.booking_id = o.bookingId;
  if (o.rpe) {
    const rpe: Ratings = {};
    for (const exId of Object.keys(logs)) rpe[exId] = o.rpe[exId] ?? 'skipped';
    if (Object.keys(rpe).length) out.rpe = rpe;
  }
  return out;
}

/** Whether the cycle asks for effort ratings (BLOC §104: `macro.rpe`, off unless true). */
export const ratingsOn = (macro: Macrocycle) => isRpeOn(macro);

// ---------------------------------------------------------------- what was logged

export interface LoggedSession {
  pub: CoachPublication;
  sessionId: string;
  bookingId: string | null;
  /** The day it was for (from the session id), else the day it was sent. */
  date: string;
  macroId: string;
  week: number;
  dayKey: string;
  setsDone: number;
  sets: number;
  /** Recorded for a client who trained on their own (`own:` id), not taken in person. */
  own: boolean;
}

/** The in-person sessions logged on a card, newest first (a correction replaces the one it corrects). */
export function loggedSessions(pubs: CoachPublication[]): LoggedSession[] {
  return currentSessionLogs(pubs)
    .filter((p) => (p.payload?.kind || 'in_person') === 'in_person')
    .map((p) => {
      const pay = p.payload as Loose;
      const at = parseSessionId(pay.session_id);
      const own = parseOwnSessionId(pay.session_id);
      const all = Object.values((pay.logs as Record<string, Loose>) || {}).flatMap((e) => (Array.isArray(e) ? e : (e?.sets as Loose[]) || []));
      return {
        pub: p, sessionId: String(pay.session_id), bookingId: at?.bookingId ?? (typeof pay.booking_id === 'string' ? pay.booking_id : null),
        date: at?.date ?? own?.date ?? p.createdAt.slice(0, 10), macroId: String(pay.macro_id ?? ''), week: Number(pay.week) || 0, dayKey: String(pay.day_key ?? ''),
        setsDone: all.filter((x) => x && x.done !== false).length, sets: all.length, own: !!own,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.pub.seq - a.pub.seq);
}

/** The session logged for one diary week, by the booking it reached the phone under and its day. */
export const loggedFor = (logged: LoggedSession[], bookingId: string, date: string) => logged.find((l) => l.bookingId === bookingId && l.date === date) ?? null;

// ---------------------------------------------------------------- when Start session shows

/** Start session: from this long before the start until the end of that day. */
export const START_EARLY_MIN = 15;
/** How far back a booking that wasn't logged or cancelled is still raised in Needs you. */
export const MISSED_LOOKBACK_DAYS = 14;

/** Whether Start session shows for a booking at the coach's date and minute. */
export function canStart(date: string, start: number, today: string, nowMin: number): boolean {
  return date === today && nowMin >= start - START_EARLY_MIN;
}

/** The first day a missed booking is still raised, from the coach's today. */
export const missedFrom = (today: string) => shiftDateStr(today, -MISSED_LOOKBACK_DAYS);
