// Coach v0.7 (TECHNICAL §155): Strength, from Review's compliance grid on the demo client.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { BlocState, Loose } from '@engine';
import { computeTraining } from './training';
import { strengthRows } from './strength';

const demo = JSON.parse(readFileSync(new URL('../../../bloc-demo-data.json', import.meta.url), 'utf8')) as BlocState;
const TODAY = '2026-08-02';
const m = demo.macrocycles!.find((x) => x.id === 'macro_1780859905961')!;
const t = computeTraining(demo, m, TODAY);
const rows = strengthRows(t);

describe('strength per exercise', () => {
  it('a row per exercise with weight logged, each week its heaviest done set', () => {
    expect(rows.length).toBeGreaterThan(3);
    const r = rows[0];
    const grid = t.rows.find((x) => x.key === r.key)!;
    for (const p of r.points) {
      const done = (grid.cells.find((c) => c.col === p.col)!.sets || []).filter((x) => x.done).map((x) => parseFloat(x.kg || '0'));
      expect(p.topKg).toBe(Math.max(...done));
    }
    expect(r.change).toBeCloseTo(r.latest - r.first, 5);
  });
  it('a week counts as hit only when the grid passed it (control: the grid’s own states)', () => {
    for (const r of rows) for (const p of r.points) expect(p.hit).toBe(p.state === 'pass' || p.state === 'deload');
    expect(rows.some((r) => r.points.some((p) => !p.hit))).toBe(true);
  });
  it('the target is the one Train showed for that set', () => {
    const r = rows[0];
    const p = r.points[r.points.length - 1];
    const set = (t.rows.find((x) => x.key === r.key)!.cells.find((c) => c.col === p.col)!.sets || []).filter((x) => x.done).sort((a, b) => parseFloat(b.kg || '0') - parseFloat(a.kg || '0'))[0];
    expect(p.targetKg).toBe(set.targetKg ? parseFloat(set.targetKg) : null);
  });
  it('an exercise with nothing logged has no row (control: logging one set makes one)', () => {
    const s = structuredClone(demo) as Loose;
    const key = Object.keys(s.exercises).find((k) => k.startsWith(`${m.id}_1_`))!;
    s.exercises[key] = [...s.exercises[key], { ...s.exercises[key][0], id: 'ex_new', name: 'New Lift', order: 999 }];
    const t2 = computeTraining(s as BlocState, m, TODAY);
    expect(strengthRows(t2).some((r) => r.name === 'New Lift')).toBe(false);
    const dayKey = key.slice(`${m.id}_1_`.length);
    s.trainLogs[`${m.id}_1_${dayKey}_ex_new_0`] = { weight: '30', reps: '10', done: true };
    expect(strengthRows(computeTraining(s as BlocState, m, TODAY)).some((r) => r.name === 'New Lift')).toBe(true);
  });
});
