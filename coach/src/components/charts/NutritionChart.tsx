import { useState } from 'react';
import { getHomeMetricTolerance } from '@engine';
import type { NutritionDay, NutritionWeek } from '@/review/nutrition';
import { fmt } from '@/lib/format';
import { Seg } from '@/components/ui/controls';
import { BoxSwatch, Legend, LineSwatch, ScrubChart, linear, niceRange } from './ChartFrame';

type Pt = { key: string; label: string; date: string; kcal: number | null; target: number | null; tdee: number | null; lbs: number | null; waist: number | null; protein: number | null; steps: number | null; good: boolean };

/**
 * Nutrition, by week (the default) or by day: intake bars against target,
 * each with its protein share filled inside (protein g × 4 kcal), and the
 * engine's current logged TDEE and BMR as labelled dashed lines across the
 * whole chart; the day view adds weight and waist. Hold and drag
 * reads a day's totals; tap a day to see its meals. A bar is red when it's on
 * the bad side of target for the cycle's goal: by day, beyond Home's calorie
 * tolerance; by week, Home's closed-week verdict (review/nutrition.ts).
 */
export function NutritionChart({ days, weeks, bmr, tdee, goalType, onDay }: {
  days: NutritionDay[]; weeks: NutritionWeek[]; bmr: number | null; tdee: number | null; goalType: string; onDay: (date: string) => void;
}) {
  const [mode, setMode] = useState<'day' | 'week'>('week');
  const tol = getHomeMetricTolerance('kcal');
  const dayGood = (kcal: number | null, target: number | null) => {
    if (kcal == null || target == null) return true;
    return goalType === 'gain' ? kcal >= target - tol : goalType === 'maintenance' ? Math.abs(kcal - target) <= tol : kcal <= target + tol;
  };
  const pts: Pt[] = mode === 'day'
    ? days.map((d) => ({ key: d.date, label: fmt.dm(d.date), date: d.date, kcal: d.kcal, target: d.target.kcal, tdee: d.tdee, lbs: d.weight, waist: d.waist, protein: d.protein, steps: d.steps, good: dayGood(d.kcal, d.target.kcal) }))
    : weeks.map((w) => {
        const k = w.metrics.find((m) => m.field === 'kcal');
        const s = w.metrics.find((m) => m.field === 'steps');
        const p = w.metrics.find((m) => m.field === 'protein');
        return { key: w.start, label: fmt.dm(w.start), date: w.start, kcal: k?.avg ?? null, target: k?.target ?? null, tdee: null, lbs: null, waist: null, protein: p?.avg ?? null, steps: s?.avg ?? null, good: k?.good !== false };
      });

  if (!pts.length) return <p className="caption">Nothing logged in this cycle yet.</p>;
  const kMax = Math.max(...pts.map((p) => Math.max(p.kcal ?? 0, p.target ?? 0)), bmr ?? 0, tdee ?? 0, 1) * 1.06;
  const lbsVals = pts.map((p) => p.lbs).filter((x): x is number => x != null);
  const [lMin, lMax] = lbsVals.length ? niceRange(Math.min(...lbsVals), Math.max(...lbsVals), 0.3) : [0, 1];
  const H = 230, padL = 38, padR = 34, bottom = H - 18;
  const at = (w: number, x: number) => {
    const bw = (w - padL - padR) / pts.length;
    return Math.max(0, Math.min(pts.length - 1, Math.floor((x - padL) / bw)));
  };
  const labelEvery = mode === 'day' ? 7 : Math.max(1, Math.ceil(pts.length / 8));

  return (
    <div>
      <div className="row" style={{ marginBottom: 4 }}>
        <Seg label="Nutrition view" value={mode} onChange={setMode} options={[{ value: 'week', label: 'Week' }, { value: 'day', label: 'Day' }]} className="auto" />
        <span className="caption">{mode === 'day' ? `Last ${days.length} days` : 'Whole cycle, Mon–Sun'}</span>
      </div>
      <ScrubChart
        height={H}
        label={`Calories ${mode === 'day' ? 'per day' : 'per week'} against target, with the protein share, logged TDEE and BMR${mode === 'day' ? ', weight and waist' : ''}.`}
        hint={mode === 'day' ? 'Hold and drag to read a day · tap a day for its meals' : 'Hold and drag to read a week'}
        onTap={mode === 'day' ? (w, x) => { const p = pts[at(w, x)]; if (p.kcal != null) onDay(p.date); } : undefined}
        callout={(w, x) => {
          const p = pts[at(w, x)];
          const bw = (w - padL - padR) / pts.length;
          return {
            at: padL + (at(w, x) + 0.5) * bw,
            body: (
              <>
                <div className="row"><b>{mode === 'day' ? fmt.ddm(p.date) : `Week of ${fmt.dm(p.date)}`}</b>{p.lbs != null && <span className="num">{fmt.one(p.lbs)} lbs</span>}</div>
                <div className="num">Kcal <b style={{ color: p.good ? 'var(--text)' : 'var(--red)' }}>{p.kcal != null ? fmt.int(p.kcal) : 'Not logged'}</b> / {p.target != null ? fmt.int(p.target) : '—'}</div>
                <div className="num caption">P {p.protein != null ? `${Math.round(p.protein)}g (${fmt.int(p.protein * 4)} kcal)` : '—'} · {p.steps != null ? `${fmt.int(p.steps)} steps` : 'no steps'}</div>
              </>
            ),
          };
        }}
        render={(w, sx) => {
          const Y = linear(0, kMax, bottom, 8);
          const YL = linear(lMin, lMax, bottom - 20, 16);
          const bw = (w - padL - padR) / pts.length;
          const cx = (i: number) => padL + (i + 0.5) * bw;
          const sel = sx != null ? at(w, sx) : -1;
          const lbs = pts.map((p, i) => (p.lbs != null ? `${cx(i)},${YL(p.lbs)}` : null)).filter(Boolean).join(' ');
          return (
            <svg width={w} height={H} style={{ display: 'block' }} aria-hidden="true">
              {[0.25, 0.5, 0.75].map((f) => (
                <g key={f}>
                  <line x1={padL} x2={w - padR} y1={Y(kMax * f)} y2={Y(kMax * f)} stroke="var(--divider)" />
                  <text x={padL - 6} y={Y(kMax * f) + 3} textAnchor="end" fontSize="10" fill="var(--text3)">{fmt.int(Math.round((kMax * f) / 100) * 100)}</text>
                </g>
              ))}
              {pts.map((p, i) => {
                const bx = cx(i) - Math.min(18, bw * 0.34);
                const bwid = Math.min(36, bw * 0.68);
                return (
                  <g key={p.key}>
                    {p.kcal != null
                      ? <rect className="vbar" style={{ ['--i' as string]: i }} x={bx} y={Y(p.kcal)} width={bwid} height={bottom - Y(p.kcal)} rx={Math.min(4, bwid / 3)} fill={p.good ? 'var(--accent)' : 'var(--red)'} opacity={i === sel ? 1 : p.good ? 0.6 : 0.85} />
                      : <rect x={bx} y={bottom - 3} width={bwid} height={3} rx="1.5" fill="var(--surface3)" />}
                    {p.kcal != null && p.protein != null && p.protein > 0 && (
                      <rect x={bx + bwid * 0.2} y={Y(Math.min(p.kcal, p.protein * 4))} width={bwid * 0.6} height={bottom - Y(Math.min(p.kcal, p.protein * 4))} rx={Math.min(3, bwid / 5)} fill="var(--protein)" opacity={0.85} />
                    )}
                    {p.target != null && <line x1={bx - 2} x2={bx + bwid + 2} y1={Y(p.target)} y2={Y(p.target)} stroke="var(--ice)" strokeWidth="2" strokeLinecap="round" />}
                    {p.waist != null && <g transform={`translate(${cx(i)} ${bottom - 8})`}><rect x="-3.5" y="-3.5" width="7" height="7" transform="rotate(45)" fill="var(--text)" /></g>}
                    {i % labelEvery === 0 && <text x={cx(i)} y={H - 4} textAnchor="middle" fontSize="10" fill="var(--text3)">{p.label}</text>}
                  </g>
                );
              })}
              {bmr != null && <>
                <line x1={padL} x2={w - padR} y1={Y(bmr)} y2={Y(bmr)} stroke="var(--text3)" strokeDasharray="3 4" />
                <text x={w - padR + 4} y={Y(bmr) + (tdee != null && Math.abs(Y(tdee) - Y(bmr)) < 11 && tdee > bmr ? 8 : 3)} fontSize="10" fill="var(--text3)">BMR</text>
              </>}
              {tdee != null && <>
                <line x1={padL} x2={w - padR} y1={Y(tdee)} y2={Y(tdee)} stroke="var(--amber)" strokeWidth="1.5" strokeDasharray="6 4" />
                <text x={w - padR + 4} y={Y(tdee) + (bmr != null && Math.abs(Y(tdee) - Y(bmr)) < 11 && tdee > bmr ? -2 : 3)} fontSize="10" fill="var(--amber)" fontWeight="700">TDEE</text>
              </>}
              {lbs && <polyline className="line" pathLength={1} points={lbs} fill="none" stroke="var(--accent2)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
              {lbsVals.length > 0 && <text x={w - padR + 4} y={YL(lbsVals[lbsVals.length - 1]) + 3} fontSize="10" fill="var(--accent2)">{fmt.one(lbsVals[lbsVals.length - 1])}</text>}
              {sel >= 0 && <rect x={padL + sel * bw} y={0} width={bw} height={bottom} fill="var(--text)" opacity=".06" />}
            </svg>
          );
        }}
      />
      <Legend items={[
        { label: 'Kcal eaten', swatch: <BoxSwatch color="var(--accent)" opacity={0.6} /> },
        { label: 'Off-goal', swatch: <BoxSwatch color="var(--red)" /> },
        { label: 'Protein kcal', swatch: <BoxSwatch color="var(--protein)" opacity={0.85} /> },
        { label: 'Target', swatch: <LineSwatch color="var(--ice)" /> },
        ...(tdee != null ? [{ label: `Logged TDEE ${fmt.int(tdee)}`, swatch: <LineSwatch color="var(--amber)" dash="6 4" width={1.5} /> }] : []),
        ...(mode === 'day' ? [
          { label: 'Weight', swatch: <LineSwatch color="var(--accent2)" /> },
          { label: 'Waist measured', swatch: <svg width="10" height="10" aria-hidden="true"><rect x="2" y="2" width="6" height="6" transform="rotate(45 5 5)" fill="var(--text)" /></svg> },
        ] : []),
        ...(bmr != null ? [{ label: `BMR ${fmt.int(bmr)}`, swatch: <LineSwatch color="var(--text3)" dash="3 4" /> }] : []),
      ]} />
      <div className="sr-only"><table>
        <caption>{mode === 'day' ? 'Calories by day' : 'Calories by week'}</caption>
        <thead><tr><th scope="col">{mode === 'day' ? 'Day' : 'Week of'}</th><th scope="col">Kcal</th><th scope="col">Target</th><th scope="col">Protein</th><th scope="col">Steps</th></tr></thead>
        <tbody>{pts.map((p) => <tr key={p.key}><th scope="row">{p.label}</th><td>{p.kcal != null ? Math.round(p.kcal) : 'Not logged'}</td><td>{p.target ?? '—'}</td><td>{p.protein != null ? Math.round(p.protein) : '—'}</td><td>{p.steps != null ? Math.round(p.steps) : '—'}</td></tr>)}</tbody>
      </table></div>
    </div>
  );
}
