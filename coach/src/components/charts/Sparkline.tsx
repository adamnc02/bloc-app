/**
 * Small weight sparkline for client rows: the client's weigh-ins over the
 * last 5 weeks up to THEIR today, with the cycle's target as a dashed ice
 * line. It only draws the points it's given.
 */
export function WeightSparkline({ points, target, width = 96, height = 30 }: { points: { date: string; lbs: number }[]; target?: number | null; width?: number; height?: number }) {
  const pts = points.map((p) => p.lbs);
  if (pts.length < 2) return <span className="caption" style={{ width, display: 'inline-block', textAlign: 'center' }}>No weigh-ins</span>;
  const vals = target != null ? [...pts, target] : pts;
  const min = Math.min(...vals), max = Math.max(...vals);
  const y = (v: number) => height - 3 - ((v - min) / Math.max(0.5, max - min)) * (height - 6);
  const x = (i: number) => 2 + (i / (pts.length - 1)) * (width - 6);
  return (
    <svg width={width} height={height} role="img" aria-label={`Weight ${pts[0].toFixed(1)} to ${pts[pts.length - 1].toFixed(1)} lbs over the last 5 weeks`}>
      {target != null && <line x1={0} x2={width} y1={y(target)} y2={y(target)} stroke="var(--ice)" strokeOpacity=".6" strokeDasharray="3 3" />}
      <polyline points={pts.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke="var(--accent2)" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(pts.length - 1)} cy={y(pts[pts.length - 1])} r="2.8" fill="var(--accent2)" />
    </svg>
  );
}
