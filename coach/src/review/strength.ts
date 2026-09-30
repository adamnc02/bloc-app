// Strength progression per exercise (TECHNICAL §155): each exercise's top set week by week against its target,
// from Review's own compliance grid (training.ts), so the two always agree. Pure.
//
// A week's point is its heaviest set done (its reps with it) and that set's target, the number Train showed. A
// week with nothing done has no point. An exercise with no weight logged (cardio, bodyweight) has no row.
import type { CellState, TrainingCompliance } from './training';

export interface StrengthPoint {
  /** The grid column (a calendar week) and its label, "W3". */
  col: number;
  label: string;
  start: string;
  topKg: number;
  reps: string | null;
  targetKg: number | null;
  /** Every set met its target (the grid's pass, or a deload done). */
  hit: boolean;
  state: CellState;
  byCoach: boolean;
}
export interface StrengthRow {
  key: string;
  name: string;
  sessionLabel: string;
  points: StrengthPoint[];
  first: number;
  latest: number;
  /** Latest top set minus the first, kg. */
  change: number;
  /** Weeks every set hit target, of the weeks logged. */
  hits: number;
}

const kg = (v: string | null | undefined) => { const n = v == null ? NaN : parseFloat(v); return Number.isFinite(n) && n > 0 ? n : null; };

export function strengthRows(t: TrainingCompliance): StrengthRow[] {
  const out: StrengthRow[] = [];
  for (const r of t.rows) {
    const points: StrengthPoint[] = [];
    for (const c of r.cells) {
      const done = (c.sets || []).filter((x) => x.done && kg(x.kg) != null);
      if (!done.length) continue;
      const top = done.reduce((a, b) => (kg(b.kg)! > kg(a.kg)! ? b : a));
      const col = t.cols[c.unit];
      points.push({
        col: c.col, label: col?.label ?? `W${c.col + 1}`, start: col?.start ?? '', topKg: kg(top.kg)!, reps: top.reps,
        targetKg: kg(top.targetKg) ?? kg((c.sets || [])[0]?.targetKg), hit: c.state === 'pass' || c.state === 'deload', state: c.state, byCoach: !!c.byCoach,
      });
    }
    if (!points.length) continue;
    out.push({ key: r.key, name: r.name, sessionLabel: r.sessionLabel, points, first: points[0].topKg, latest: points[points.length - 1].topKg,
      change: points[points.length - 1].topKg - points[0].topKg, hits: points.filter((p) => p.hit).length });
  }
  return out;
}
