import { useState } from 'react';
import { MID_RPE, RPE_COMPLIANT_FROM, RPE_EASY_MAX, RPE_HIGH_MIN, type RpePoint, type RpeZone } from '@/review/training';
import { useWidth, linear } from './ChartFrame';

export const zoneCopy: Record<RpeZone, string> = {
  'too-hard': 'Too hard. Change it within days, not weeks.',
  'at-limit': 'At the limit. Hold the load.',
  'too-easy': 'Too easy. Progress faster.',
  'on-plan': 'On plan.',
};

/**
 * RPE against compliance, per exercise: x = compliance out of 10 over its last
 * 3 rated weeks, y = their mean RPE. BLOC's bands: 9–10 is at the limit (or
 * too hard when missing targets), 6 and under is too easy. Tap a point to read it.
 */
export function RpeQuadrant({ points }: { points: RpePoint[] }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [sel, setSel] = useState<string | null>(points.find((p) => p.zone === 'too-hard')?.key ?? null);
  const H = 240, pad = 30;
  const X = linear(0, 10, pad, w - 10);
  const Y = linear(5, 10, H - pad, 10);
  const selected = points.find((p) => p.key === sel);
  const zoneColor = { 'too-hard': 'var(--red)', 'at-limit': 'var(--amber)', 'too-easy': 'var(--ice)', 'on-plan': 'var(--accent2)' } as const;
  const C = RPE_COMPLIANT_FROM;
  return (
    <div ref={ref}>
      <svg width={w} height={H} style={{ display: 'block' }} role="img" aria-label="RPE against compliance, per exercise">
        <rect x={X(0)} y={Y(10)} width={X(C) - X(0)} height={Y(RPE_HIGH_MIN) - Y(10)} fill="var(--red)" opacity=".1" />
        <rect x={X(C)} y={Y(10)} width={X(10) - X(C)} height={Y(RPE_HIGH_MIN) - Y(10)} fill="var(--amber)" opacity=".1" />
        <rect x={X(C)} y={Y(RPE_EASY_MAX)} width={X(10) - X(C)} height={Y(5) - Y(RPE_EASY_MAX)} fill="var(--ice)" opacity=".1" />
        <text x={X(0) + 6} y={Y(10) + 14} fontSize="10.5" fontWeight="700" fill="var(--red)">TOO HARD</text>
        <text x={X(10) - 6} y={Y(10) + 14} fontSize="10.5" fontWeight="700" fill="var(--amber)" textAnchor="end">AT THE LIMIT</text>
        <text x={X(10) - 6} y={Y(5) - 6} fontSize="10.5" fontWeight="700" fill="var(--ice)" textAnchor="end">TOO EASY</text>
        <line x1={X(C)} x2={X(C)} y1={Y(10)} y2={Y(5)} stroke="var(--divider)" />
        <line x1={X(0)} x2={X(10)} y1={Y(5)} y2={Y(5)} stroke="var(--border2)" />
        <line x1={X(0)} x2={X(0)} y1={Y(10)} y2={Y(5)} stroke="var(--border2)" />
        {[5, 6, 7, 8, 9, 10].map((v) => <text key={v} x={X(0) - 6} y={Y(v) + 3} fontSize="10" fill="var(--text3)" textAnchor="end">{v}</text>)}
        {[0, 5, 10].map((v) => <text key={v} x={X(v)} y={H - 14} fontSize="10" fill="var(--text3)" textAnchor="middle">{v}</text>)}
        <text x={(X(0) + X(10)) / 2} y={H - 1} fontSize="10" fill="var(--text3)" textAnchor="middle">Compliance /10</text>
        <text x={4} y={Y(7.5)} fontSize="10" fill="var(--text3)" transform={`rotate(-90 8 ${Y(7.5)})`} textAnchor="middle">RPE</text>
        {points.map((p) => (
          <g key={p.key} style={{ cursor: 'pointer' }} onClick={() => setSel(p.key)}>
            <circle cx={X(p.compliance)} cy={Y(Math.max(5, p.rpe))} r={p.key === sel ? 8 : 6} fill={zoneColor[p.zone]} stroke="var(--surface)" strokeWidth="2" />
            {p.skipped > 0 && <circle cx={X(p.compliance)} cy={Y(Math.max(5, p.rpe))} r={p.key === sel ? 12 : 10} fill="none" stroke="var(--amber)" strokeWidth="1.5" strokeDasharray="3 2.5" />}
            {(p.zone !== 'on-plan' || p.skipped > 0 || p.key === sel) && <text x={X(p.compliance) + (p.compliance > 7 ? -11 : 11)} y={Y(Math.max(5, p.rpe)) + 4} fontSize="11" fontWeight="600" fill="var(--text)" textAnchor={p.compliance > 7 ? 'end' : 'start'}>{p.name}</text>}
          </g>
        ))}
      </svg>
      {selected && (
        <div className="tile" style={{ marginTop: 10 }} aria-live="polite">
          <div className="row"><b>{selected.name}</b><span className="caption">{selected.sessionLabel}</span></div>
          <div className="muted" style={{ marginTop: 4 }}>Compliance {selected.compliance.toFixed(1)}/10 · RPE {selected.rpe.toFixed(1)} · <b style={{ color: zoneColor[selected.zone] }}>{zoneCopy[selected.zone]}</b></div>
          {selected.skipped > 0 && <div className="caption t-amber" style={{ marginTop: 4 }}>{selected.skipped} of the last {selected.rated} ratings skipped, each counted as {MID_RPE}.</div>}
        </div>
      )}
      {points.some((p) => p.skipped > 0) && (
        <div className="caption" style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
          <svg width="18" height="18" aria-hidden="true"><circle cx="9" cy="9" r="7" fill="none" stroke="var(--amber)" strokeWidth="1.5" strokeDasharray="3 2.5" /></svg>
          Rating skipped recently. Skips count as {MID_RPE}, the middle of the scale.
        </div>
      )}
      <ul className="sr-only">{points.map((p) => <li key={p.key}>{p.name} ({p.sessionLabel}): compliance {p.compliance.toFixed(1)}, RPE {p.rpe.toFixed(1)}. {zoneCopy[p.zone]}{p.skipped ? ` ${p.skipped} ratings skipped.` : ''}</li>)}</ul>
    </div>
  );
}
