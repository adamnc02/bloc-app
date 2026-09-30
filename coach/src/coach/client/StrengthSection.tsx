// Review → Strength (TECHNICAL §155): every exercise of the cycle with weight logged, its top set's progress as a
// sparkline, and the change since its first logged week; tap one for its chart and its weeks.
//
// 🚨 Measured at 375pt: the row puts the name and "52.5 kg × 8 · +12.5 kg" over each other, left, and a 96px
//    sparkline right, so neither line has to share its width with the chart.
import { useLayoutEffect, useRef, useState } from 'react';
import { Section } from '@/components/ui/layout';
import { Sheet } from '@/components/ui/Sheet';
import { Icon } from '@/components/ui/Icon';
import { Legend, LineSwatch } from '@/components/charts/ChartFrame';
import { StrengthChart, StrengthSpark } from '@/components/charts/StrengthChart';
import { fmt } from '@/lib/format';
import { strengthRows, type StrengthRow } from '@/review/strength';
import type { TrainingCompliance } from '@engine/review';

/** A cycle with A and B templates has many exercises: the first this many show, then Show all. */
const SHOW_FIRST = 8;
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${fmt.one(Math.abs(n))} kg`;

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(320);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function StrengthSheet({ row, t, onClose }: { row: StrengthRow; t: TrainingCompliance; onClose: () => void }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  return (
    <Sheet open title={row.name} onClose={onClose}>
      <p className="muted" style={{ marginBottom: 12 }}>{row.sessionLabel} · the heaviest set each week against its target. {fmt.one(row.first)} → {fmt.one(row.latest)} kg ({signed(row.change)}).</p>
      <div ref={ref}><StrengthChart row={row} cols={t.gridCols.length} labels={t.gridCols.map((c) => c.label)} width={w} /></div>
      <Legend items={[
        { label: 'Top set', swatch: <LineSwatch color="var(--accent2)" width={2.4} /> },
        { label: 'Target', swatch: <LineSwatch color="var(--ice)" dash="4 4" /> },
      ]} />
      <div style={{ marginTop: 12 }}>
        {row.points.map((p) => (
          <div key={p.col} className="ex">
            <span className="num">{p.label}{p.byCoach ? ' · in person' : ''}</span>
            <span className="num" style={{ whiteSpace: 'nowrap' }}>
              {fmt.one(p.topKg)} kg{p.reps ? ` × ${p.reps}` : ''}{p.targetKg != null ? ` · target ${fmt.one(p.targetKg)}` : ''} <span className={p.hit ? 't-acc' : 't-bad'}>{p.hit ? '✓' : '✗'}</span>
            </span>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

export function StrengthSection({ t, i, first }: { t: TrainingCompliance; i: number; first: string }) {
  const rows = strengthRows(t);
  const [open, setOpen] = useState<StrengthRow | null>(null);
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, SHOW_FIRST);
  return (
    <Section i={i} title="Strength" sub={`Each exercise’s heaviest set, week by week, against its target. Lavender hit every set; red missed one. Tap an exercise for its weeks.`}>
      {rows.length ? (
        <div className="card list">
          {shown.map((r) => {
            const last = r.points[r.points.length - 1];
            return (
              <button key={r.key} type="button" className="listrow" onClick={() => setOpen(r)}>
                <span className="main">
                  <b style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</b>
                  <small className="muted num" style={{ display: 'block', fontSize: 12.5, marginTop: 3, whiteSpace: 'nowrap' }}>
                    {fmt.one(last.topKg)} kg{last.reps ? ` × ${last.reps}` : ''} · {r.points.length > 1 ? signed(r.change) : r.sessionLabel}
                  </small>
                </span>
                <StrengthSpark row={r} cols={t.gridCols.length} width={96} />
                <Icon name="chevR" size={18} />
              </button>
            );
          })}
          {!all && rows.length > SHOW_FIRST && (
            <button type="button" className="listrow" onClick={() => setAll(true)}>
              <span className="main"><b>Show all ({rows.length})</b></span>
              <Icon name="chevD" size={18} />
            </button>
          )}
        </div>
      ) : <div className="card muted">No weights logged in this cycle yet. {first}’s exercises show here once a session is done.</div>}
      {open && <StrengthSheet row={open} t={t} onClose={() => setOpen(null)} />}
    </Section>
  );
}
