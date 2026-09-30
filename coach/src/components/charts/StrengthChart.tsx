// Strength charts (TECHNICAL §155). A row's sparkline: the top set week by week (a line), its target (dashed, ice)
// and each week's dot, lavender when every set hit target, red when not. Its sheet: the same, larger, with week
// labels and the numbers.
import type { StrengthRow } from '@/review/strength';
import { fmt } from '@/lib/format';

function scale(row: StrengthRow, w: number, h: number, pad: { l: number; r: number; t: number; b: number }, cols: number) {
  const vals = row.points.flatMap((p) => [p.topKg, p.targetKg ?? p.topKg]);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi - lo < 5) { const m = (hi + lo) / 2; lo = m - 2.5; hi = m + 2.5; }
  const x = (col: number) => pad.l + (cols <= 1 ? (w - pad.l - pad.r) / 2 : (col / (cols - 1)) * (w - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (h - pad.t - pad.b);
  return { x, y, lo, hi };
}

export function StrengthSpark({ row, cols, width = 112, height = 40 }: { row: StrengthRow; cols: number; width?: number; height?: number }) {
  const { x, y } = scale(row, width, height, { l: 4, r: 4, t: 5, b: 5 }, cols);
  const tgt = row.points.filter((p) => p.targetKg != null);
  return (
    <svg width={width} height={height} aria-hidden="true" style={{ display: 'block', flexShrink: 0 }}>
      {tgt.length > 1 && <polyline points={tgt.map((p) => `${x(p.col)},${y(p.targetKg!)}`).join(' ')} fill="none" stroke="var(--ice)" strokeOpacity=".7" strokeDasharray="3 3" strokeWidth="1.2" />}
      {row.points.length > 1 && <polyline points={row.points.map((p) => `${x(p.col)},${y(p.topKg)}`).join(' ')} fill="none" stroke="var(--accent2)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
      {row.points.map((p) => <circle key={p.col} cx={x(p.col)} cy={y(p.topKg)} r="2.6" fill={p.hit ? 'var(--accent2)' : 'var(--red)'} />)}
    </svg>
  );
}

export function StrengthChart({ row, cols, labels, width }: { row: StrengthRow; cols: number; labels: string[]; width: number }) {
  const H = 200;
  const { x, y, lo, hi } = scale(row, width, H, { l: 38, r: 12, t: 12, b: 24 }, cols);
  const ticks = [lo, (lo + hi) / 2, hi];
  const tgt = row.points.filter((p) => p.targetKg != null);
  const every = cols > 12 ? 2 : 1;
  return (
    <svg width={width} height={H} role="img" aria-label={`${row.name}: top set by week, ${fmt.one(row.first)} to ${fmt.one(row.latest)} kg`} style={{ display: 'block' }}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={38} x2={width - 12} y1={y(t)} y2={y(t)} stroke="var(--divider)" />
          <text x={32} y={y(t) + 3} textAnchor="end" fontSize="10" fill="var(--text3)">{fmt.one(t)}</text>
        </g>
      ))}
      <text x={32} y={8} textAnchor="end" fontSize="10" fill="var(--text3)">kg</text>
      {labels.map((l, i) => (i % every === 0 ? <text key={l + i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--text3)">{l}</text> : null))}
      {tgt.length > 1 && <polyline points={tgt.map((p) => `${x(p.col)},${y(p.targetKg!)}`).join(' ')} fill="none" stroke="var(--ice)" strokeOpacity=".75" strokeDasharray="4 4" strokeWidth="1.5" />}
      {row.points.length > 1 && <polyline points={row.points.map((p) => `${x(p.col)},${y(p.topKg)}`).join(' ')} fill="none" stroke="var(--accent2)" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />}
      {row.points.map((p) => <circle key={p.col} cx={x(p.col)} cy={y(p.topKg)} r="4" fill={p.hit ? 'var(--accent2)' : 'var(--red)'} stroke="var(--surface)" strokeWidth="2" />)}
    </svg>
  );
}
