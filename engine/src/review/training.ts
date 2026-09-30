// ═══════════════════════════════════════════════════════════════════════
// Training compliance, from the cycle down to the set (TECHNICAL §140).
//
// Every judgement is the engine's, run on the client's uploaded state at the
// client's local today:
//   · the calendar weeks are the week agenda's units (getTrainAgendaUnits),
//     which score each week, draw the sessions strip and are the exercise
//     grid's columns; the grid's rows are each session's template (A and B
//     with microcycles), because each template progresses against its own
//     previous mesocycle;
//   · pass or fail is getWeekComplianceResult(): every set met or beat its
//     target, the test BLOC's progression lock uses;
//   · the targets come from the client's own `progressionTargets` first
//     (makeTargetCache), so Coach judges against the numbers the client saw.
//
// Every planned exercise-week is judged, week 1 and the session after a deload
// included: pass, fail (done, a target missed, or not every set done) or
// missed (nothing done). A deload that was done shows as a deload and scores
// like a pass; a deload not done is missed and scores 0. Only a swapped
// exercise and a planned session a group session replaced go unscored. A
// maintenance cycle has no pass or fail; it's scored on attendance.
//
// A week is judged only once it's over at the client's today: until then a
// cell is "this week or still to come", unless it's already fully logged.
// ═══════════════════════════════════════════════════════════════════════
import {
  getRpeKey, getSubstitution, getTrainAgendaUnits, getWeekComplianceResult, getWeekSets, getWeekTargets,
  isDeloadUnit, isRpeOn, parseRepsForVolume,
  type BlocState, type Loose, type Macrocycle, type TargetCache, type WeekTarget,
} from '../index.ts';

export type CellState =
  | 'pass' | 'fail' | 'missed'            // scored
  | 'deload' | 'deload-missed'           // scored: a deload done scores like a pass, not done 0
  | 'swapped' | 'group'                    // not scored
  | 'logged'                               // a maintenance cycle's done session
  | 'upcoming'                             // this week or still to come
  | 'none';                                // no session that week

export interface SetRow {
  n: number;
  targetKg: string | null;
  targetReps: string | null;
  kg: string | null;
  reps: string | null;
  done: boolean;
  /** Met or beat both targets (engine semantics); null when not done. */
  hit: boolean | null;
  byCoach: boolean;
}

export interface GridCell {
  /** The grid column (a mesocycle). */
  col: number;
  /** The calendar week (WeekCol index) this session fell in. */
  unit: number;
  state: CellState;
  reason?: string;
  week: number;
  dayKey: string;
  sets?: SetRow[];
  rpe?: number;
  rpeSkipped?: boolean;
  swappedTo?: string;
  byCoach?: boolean;
}

export interface GridRow {
  key: string;
  name: string;
  /** The session and, with microcycles, which one: "Pull · A". */
  sessionLabel: string;
  dayKey: string;
  cells: GridCell[];
  /** Out of 10 over the counted cells of finished weeks; null with none. */
  score: number | null;
  passes: number;
  fails: number;
  missed: number;
}

export interface SessionInCol {
  dayKey: string;
  label: string;
  done: boolean;
  partial: boolean;
  groupReplaced: boolean;
  byCoach: boolean;
  score: number | null;
}

export interface WeekCol {
  idx: number;
  /** "W1"… one per real calendar week. */
  label: string;
  /** The engine's week (mesocycle) this calendar week belongs to. */
  week: number;
  start: string;
  end: string;
  isDeload: boolean;
  closed: boolean;
  current: boolean;
  future: boolean;
  sessions: SessionInCol[];
  planned: number;
  done: number;
  /** Mean of its session scores (a planned session not done is 0). Finished weeks only. */
  score: number | null;
  /** Sessions done ÷ planned, out of 10. Finished weeks only. */
  attendance: number | null;
}

/**
 * A grid column: one calendar week. With microcycles the rows split into each
 * session's A and B templates, so an A row is blank in the B weeks: they are
 * different weeks, and each template progresses against its own previous
 * mesocycle.
 */
export interface GridCol {
  idx: number;
  week: number;
  /** "W3". */
  label: string;
  sub: string | null;
  units: number[];
  isDeload: boolean;
  closed: boolean;
  current: boolean;
  /** The week's score (attendance on maintenance), once it has ended. */
  score: number | null;
}

export interface TrainingCompliance {
  /** False on a maintenance cycle: no pass or fail, attendance only. */
  scored: boolean;
  /** One per calendar week: the sessions strip and every week score. */
  cols: WeekCol[];
  /** The exercise grid's columns: the same calendar weeks. */
  gridCols: GridCol[];
  rows: GridRow[];
  cycleScore: number | null;
  cycleAttendance: number | null;
  rpeOn: boolean;
}

/**
 * The engine's TargetCache over the client's stored targets. Reads theirs
 * first; anything the engine works out that they don't hold stays in memory
 * here and never reaches their state.
 */
export function makeTargetCache(s: BlocState): TargetCache {
  const stored = (s.progressionTargets || {}) as Record<string, WeekTarget>;
  const mine = new Map<string, WeekTarget>();
  return {
    get: (k) => mine.get(k) ?? stored[k],
    set: (k, t) => { mine.set(k, t); },
  };
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

const str = (v: unknown): string | null => (v === undefined || v === null || v === '' ? null : String(v));

function setRows(s: BlocState, cache: TargetCache, m: Macrocycle, week: number, dayKey: string, ex: Loose): SetRow[] {
  const n = getWeekSets(ex, week, m.weeks as number);
  const t = getWeekTargets(s, cache, m, week, dayKey, ex);
  const logs = (s.trainLogs || {}) as Record<string, Loose>;
  const out: SetRow[] = [];
  for (let i = 0; i < n; i++) {
    const lg = logs[`${m.id}_${week}_${dayKey}_${ex.id}_${i}`] || null;
    const tw = t.weightTargets[i] !== undefined ? t.weightTargets[i] : t.weightTargets[t.weightTargets.length - 1];
    const tr = t.repsTargets[i] !== undefined ? t.repsTargets[i] : t.repsTargets[t.repsTargets.length - 1];
    const done = !!(lg && lg.done);
    // The engine's own comparison (getWeekComplianceResult): meeting or beating both is a hit.
    const w = lg && lg.weight ? parseFloat(lg.weight) : null;
    const r = lg && lg.reps !== undefined && lg.reps !== null ? String(lg.reps).trim() : '';
    const hit = done ? (w !== null && tw !== undefined && w - parseFloat(tw) > -0.01) && tr !== undefined && parseRepsForVolume(r) >= parseRepsForVolume(tr) : null;
    // "In person" is a set the coach took with the client. A session the client did on their own, which the
    // coach recorded from their printed sheet (an `own:` session id, Coach §162), is theirs, so it isn't marked.
    out.push({ n: i + 1, targetKg: str(tw), targetReps: str(tr), kg: str(lg?.weight), reps: str(lg?.reps), done, hit,
      byCoach: lg?.loggedBy === 'coach' && !String(lg?.sessionId ?? '').startsWith('own:') });
  }
  return out;
}

function judgeCell(s: BlocState, cache: TargetCache, m: Macrocycle, col: WeekCol, gridCol: number, dayKey: string, ex: Loose): GridCell {
  const week = col.week;
  const base = { col: gridCol, unit: col.idx, week, dayKey };
  if (col.future) return { ...base, state: 'upcoming' };
  const sub = getSubstitution(s, m.id, week, dayKey, ex.id);
  if (sub && sub.kind === 'group') return { ...base, state: 'group', reason: 'A group session replaced it: done, not scored' };
  const sets = setRows(s, cache, m, week, dayKey, ex);
  const anyDone = sets.some((x) => x.done);
  const allDone = sets.length > 0 && sets.every((x) => x.done);
  const r = (s.rpe || {})[getRpeKey(m.id, week, dayKey, ex.id)] as Loose;
  const rating = r && typeof r.rpe === 'number' ? { rpe: r.rpe as number } : r && r.rpeSkipped ? { rpeSkipped: true } : {};
  const extra = { sets: anyDone ? sets : undefined, byCoach: sets.some((x) => x.byCoach) || undefined, ...rating };
  if (sub) return { ...base, ...extra, sets, state: 'swapped', swappedTo: sub.name, reason: `Swapped for ${sub.name || 'another exercise'} that day (target held)` };

  const missed = { ...base, ...extra, state: 'missed' as const, reason: 'Planned session not done' };
  const upcoming = { ...base, ...extra, state: 'upcoming' as const, reason: 'This week isn’t over yet' };
  if (m.goalType === 'maintenance') {
    if (allDone) return { ...base, ...extra, state: 'logged', reason: 'Maintenance cycles are scored on attendance' };
    return col.closed ? missed : upcoming;
  }
  if (isDeloadUnit(s, m, week, dayKey)) {
    if (anyDone) return { ...base, ...extra, sets, state: 'deload', reason: 'Deload week, done' };
    return col.closed ? { ...missed, state: 'deload-missed', reason: 'Deload week, not done' } : upcoming;
  }
  const res = getWeekComplianceResult(s, cache, m, week, dayKey, ex);
  if (res.fullyLogged) return { ...base, ...extra, sets, state: res.compliant ? 'pass' : 'fail', reason: res.compliant ? undefined : 'Missed a target' };
  if (!col.closed) return upcoming;
  return anyDone ? { ...base, ...extra, sets, state: 'fail', reason: 'Not every set was done' } : missed;
}

const COUNTED: CellState[] = ['pass', 'fail', 'missed', 'deload', 'deload-missed'];
/** A scored cell's value: done as planned (a pass, or a deload done) is 1. */
const scoreOf = (s: CellState) => (s === 'pass' || s === 'deload' ? 1 : 0);

/** The whole grid for a cycle, judged at the client's today. */
export function computeTraining(s: BlocState, m: Macrocycle, today: string): TrainingCompliance {
  const cache = makeTargetCache(s);
  const { units } = getTrainAgendaUnits(s, { today }, m, null);
  const scored = m.goalType !== 'maintenance';
  const cols: WeekCol[] = (units as Loose[]).map((u, idx) => ({
    idx, label: `W${idx + 1}`, week: u.week, start: u.start, end: u.end, isDeload: !!u.isDeload,
    closed: !!u.end && u.end < today, current: !!u.start && u.start <= today && today <= u.end, future: !u.start || u.start > today,
    sessions: [], planned: 0, done: 0, score: null, attendance: null,
  }));

  // Grid columns: one per calendar week, so A and B read as the different weeks they are.
  const gridCols: GridCol[] = cols.map((c) => ({
    idx: c.idx, week: c.week, units: [c.idx], label: c.label, sub: null,
    isDeload: c.isDeload, closed: c.closed, current: c.current, score: null,
  }));

  // Rows: one per exercise in each session template, grouped by session in the
  // cycle's day order, A before B.
  const useMicro = m.useMicrocycles !== false;
  const days = (m.days as string[] | undefined) || ['push', 'pull', 'legs'];
  const dayLabels = (m.dayLabels as Record<string, string> | undefined) || { push: 'Push', pull: 'Pull', legs: 'Legs' };
  const baseOf = (dayKey: string) => dayKey.replace(/m[12]$/, '');
  const groupLabel = (dayKey: string) => {
    const b = baseOf(dayKey);
    const name = dayLabels[b] || b;
    return useMicro ? `${name} · ${dayKey.endsWith('m2') ? 'B' : 'A'}` : name;
  };
  const order = (dayKey: string) => days.indexOf(baseOf(dayKey)) * 3 + (dayKey.endsWith('m2') ? 2 : dayKey.endsWith('m1') ? 1 : 0);

  const rowByKey = new Map<string, GridRow & { _o: number; _e: number }>();
  (units as Loose[]).forEach((u, idx) => {
    const col = cols[idx];
    const gc = idx;
    for (const sess of u.sessions as Loose[]) {
      const exercises = ((s.exercises || {})[`${m.id}_1_${sess.dayKey}`] || []).slice().sort((a: Loose, b: Loose) => (a.order || 0) - (b.order || 0));
      const counted: number[] = [];
      let byCoach = false;
      exercises.forEach((ex: Loose, e: number) => {
        const cell = judgeCell(s, cache, m, col, gc, sess.dayKey, ex);
        if (cell.byCoach) byCoach = true;
        const key = `${sess.dayKey}|${ex.id}`;
        let row = rowByKey.get(key);
        if (!row) {
          row = {
            key, name: String(ex.name || 'Exercise'), sessionLabel: groupLabel(sess.dayKey), dayKey: sess.dayKey,
            cells: gridCols.map((c) => ({ col: c.idx, unit: c.units[0], week: c.week, dayKey: sess.dayKey, state: 'none' as CellState })),
            score: null, passes: 0, fails: 0, missed: 0, _o: order(sess.dayKey), _e: e,
          };
          rowByKey.set(key, row);
        }
        row.cells[gc] = cell;
        if (col.closed && COUNTED.includes(cell.state)) counted.push(scoreOf(cell.state));
      });
      const sessionScore = counted.length ? (counted.reduce((a, b) => a + b, 0) / counted.length) * 10 : null;
      col.sessions.push({ dayKey: sess.dayKey, label: sess.label, done: !!sess.done, partial: !!sess.partial, groupReplaced: !!sess.groupReplaced, byCoach, score: col.closed && scored ? sessionScore : null });
    }
    col.planned = col.sessions.length;
    col.done = col.sessions.filter((x) => x.done).length;
    if (col.closed) {
      col.attendance = col.planned ? (col.done / col.planned) * 10 : null;
      col.score = scored ? mean(col.sessions.map((x) => x.score).filter((x): x is number => x != null)) : null;
    }
  });
  for (const g of gridCols) {
    g.score = mean(g.units.map((i) => (scored ? cols[i].score : cols[i].attendance)).filter((x): x is number => x != null));
  }
  const rows: GridRow[] = [...rowByKey.values()].sort((a, b) => a._o - b._o || a._e - b._e).map(({ _o, _e, ...r }) => r);

  for (const r of rows) {
    for (const c of r.cells) {
      if (c.state === 'none' || !cols[c.unit].closed) continue;
      if (c.state === 'pass' || c.state === 'deload') r.passes++;
      else if (c.state === 'fail') r.fails++;
      else if (c.state === 'missed' || c.state === 'deload-missed') r.missed++;
    }
    const n = r.passes + r.fails + r.missed;
    r.score = scored && n ? (r.passes / n) * 10 : null;
  }

  return {
    scored,
    cols,
    gridCols,
    rows,
    cycleScore: scored ? mean(cols.map((c) => c.score).filter((x): x is number => x != null)) : null,
    cycleAttendance: mean(cols.map((c) => c.attendance).filter((x): x is number => x != null)),
    rpeOn: isRpeOn(m),
  };
}

// ---------------------------------------------------------------- RPE (§7.3)

/** A skipped rating counts as the middle of the 1–10 scale. */
export const MID_RPE = 5.5;
/** BLOC's own bands (engine computeRpeStepKind): ≤ 6 is easy, 9–10 is at the limit or too hard. */
export const RPE_EASY_MAX = 6;
export const RPE_HIGH_MIN = 9;
/** An exercise's recent weeks count as compliant from 7/10 up. */
export const RPE_COMPLIANT_FROM = 7;

export type RpeZone = 'too-hard' | 'at-limit' | 'too-easy' | 'on-plan';
export interface RpePoint {
  key: string;
  name: string;
  sessionLabel: string;
  compliance: number;
  rpe: number;
  skipped: number;
  rated: number;
  zone: RpeZone;
}

export function rpeZone(compliance: number, rpe: number): RpeZone {
  const ok = compliance >= RPE_COMPLIANT_FROM;
  if (!ok && rpe >= RPE_HIGH_MIN) return 'too-hard';
  if (ok && rpe >= RPE_HIGH_MIN) return 'at-limit';
  if (ok && rpe <= RPE_EASY_MAX) return 'too-easy';
  return 'on-plan';
}

/** Per exercise: the last 3 counted weeks that carry a rating or a skip. None when the cycle has RPE off. */
export function computeRpePoints(t: TrainingCompliance): RpePoint[] {
  if (!t.rpeOn || !t.scored) return [];
  const out: RpePoint[] = [];
  for (const r of t.rows) {
    const recent = r.cells.filter((c) => (c.state === 'pass' || c.state === 'fail') && (c.rpe != null || c.rpeSkipped)).slice(-3);
    if (!recent.length) continue;
    const compliance = (recent.filter((c) => c.state === 'pass').length / recent.length) * 10;
    const rpe = recent.reduce((a, c) => a + (c.rpeSkipped ? MID_RPE : (c.rpe as number)), 0) / recent.length;
    const skipped = recent.filter((c) => c.rpeSkipped).length;
    out.push({ key: r.key, name: r.name, sessionLabel: r.sessionLabel, compliance, rpe, skipped, rated: recent.length, zone: rpeZone(compliance, rpe) });
  }
  return out;
}

export const outOf10 = (n: number | null | undefined) => (n == null ? '—' : n >= 9.95 ? '10' : n.toFixed(1));
