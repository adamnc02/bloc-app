import type { StoryData } from '@/review/model';
import { addDays, daysBetween, fmt } from '@/lib/format';
import { shortPhaseLabel } from '@/lib/phaseLabel';
import { BoxSwatch, Legend, LineSwatch, ScrubChart, linear, niceRange } from './ChartFrame';

/** A week's calories count as off-goal when this far on the bad side of target (the engine's drift-warning threshold). */
const KCAL_OFF_GOAL = 150;
/** The callout: date and week; the day's weight and its week's average; the day's calories against its target and the week's average; waist and hip. */
const CALLOUT_H = 84;
const CALLOUT_W = 224;
/** Roughly one character of a 10px bold chart label. */
const LABEL_CHAR_PX = 6.4;

/**
 * The story chart: one time axis for the whole cycle with
 *  - daily weigh-ins, and the engine's weekly average weight (the line the
 *    outcome is judged on) inside the goal band,
 *  - waist and hip on a secondary axis, each labelled with its latest value,
 *  - weekly calorie bars against target,
 *  - every goal phase, labelled by its short name (BLOC's shortPhaseLabel) on
 *    two alternating rows so neighbours don't collide.
 * The header says the one thing to know first (when progress stalled, or how
 * it's moving); holding and dragging swaps it for the day's callout.
 */
export function StoryChart({ d, name }: { d: StoryData; name: string }) {
  const totalDays = daysBetween(d.start, d.end) + 1;
  const weekOf = (date: string) => d.trend.find((p) => p.start <= date && p.end >= date) ?? null;
  const startLbs = d.startLbs ?? d.weighIns[0]?.lbs ?? d.targetLbs ?? 0;
  const target = d.targetLbs ?? startLbs;
  const maint = d.goalType === 'maintenance';
  const bandHalf = 1.5;
  const band = (day: number) => (maint ? target : startLbs + (target - startLbs) * (day / Math.max(1, totalDays - 1)));

  const lbsVals = [...d.weighIns.map((w) => w.lbs), startLbs + bandHalf, target - bandHalf];
  const [yMin, yMax] = niceRange(Math.min(...lbsVals), Math.max(...lbsVals), 0.06);
  const inVals = d.measurements.flatMap((m) => [m.waist, m.hip]).filter((x): x is number => x != null);
  const [iMin, iMax] = inVals.length ? niceRange(Math.min(...inVals), Math.max(...inVals), 0.25) : [0, 1];
  const kcalVals = d.kcalWeeks.flatMap((w) => [w.avgKcal ?? 0, w.targetKcal ?? 0]);
  const kcalMax = Math.max(...kcalVals, 1) * 1.08;
  const offGoal = (avg: number, tgt: number) => (d.goalType === 'gain' ? avg < tgt - KCAL_OFF_GOAL : maint ? Math.abs(avg - tgt) > KCAL_OFF_GOAL : avg > tgt + KCAL_OFF_GOAL);
  const weekCount = Math.ceil(totalDays / 7);

  const H = 312, topH = 184, gap = 26, padL = 34, padR = 36;
  const waistPts = d.measurements.filter((m) => m.waist != null);
  const hipPts = d.measurements.filter((m) => m.hip != null);
  const at = <T extends { date: string }>(xs: T[], date: string) => [...xs].reverse().find((x) => x.date <= date);

  const header = d.headline && (
    <div>
      <div style={{ fontWeight: 700, fontSize: 15 }}>{d.headline.title}</div>
      <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{d.headline.sub}</div>
    </div>
  );

  return (
    <div>
      <ScrubChart
        height={H}
        header={header}
        calloutH={CALLOUT_H}
        calloutW={CALLOUT_W}
        label={`Story chart for ${name}: weekly average weight against the goal band, waist and hip, weekly calories against target, and the goal phases.`}
        callout={(w, x) => {
          const X = linear(0, totalDays - 1, padL, w - padR);
          const day = Math.round(X.invert(x));
          const date = addDays(d.start, Math.max(0, Math.min(totalDays - 1, day)));
          if (date > d.last) return { at: x, body: <><b>{fmt.ddm(date)}</b><div className="t-acc">Not reached yet</div></> };
          const wi = d.weighIns.find((p) => p.date === date);
          const wk = weekOf(date);
          const kw = d.kcalWeeks.find((k) => k.start <= date && k.end >= date);
          const waist = at(waistPts, date), hip = at(hipPts, date);
          const phase = at(d.phases, date);
          const kd = d.kcalDays[date];
          return {
            at: x,
            body: (
              <>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                  <b style={{ whiteSpace: 'nowrap' }}>{fmt.ddm(date)}</b>
                  <span className="caption" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[kw?.label, phase && shortPhaseLabel(phase.label, 16)].filter(Boolean).join(' · ')}</span>
                </div>
                <div>Weight <b className="num">{wi ? fmt.one(wi.lbs) : '—'}</b> · wk avg <b className="num">{wk ? fmt.one(wk.lbs) : '—'}</b></div>
                <div>Kcal <b className="num">{kd?.kcal != null ? fmt.int(kd.kcal) : '—'}</b> / {kd?.target != null ? fmt.int(kd.target) : '—'} · wk avg <b className="num">{kw?.avgKcal != null ? fmt.int(kw.avgKcal) : '—'}</b></div>
                <div className="caption">Waist <b>{waist ? fmt.inches(waist.waist as number) : '—'}</b> · hip <b>{hip ? fmt.inches(hip.hip as number) : '—'}</b>{waist && waist.date !== date ? ` · ${fmt.dm(waist.date)}` : ''}</div>
              </>
            ),
          };
        }}
        render={(w, sx) => {
          const X = linear(0, totalDays - 1, padL, w - padR);
          const Y = linear(yMin, yMax, topH, 30);
          const YI = linear(iMin, iMax, topH - 6, 38);
          const botTop = topH + gap;
          const YK = linear(0, kcalMax, H - 14, botTop);
          const dx = (date: string) => X(Math.max(0, daysBetween(d.start, date)));
          const bandTop = Array.from({ length: 21 }, (_, i) => { const day = (i / 20) * (totalDays - 1); return `${X(day)},${Y(band(day) + bandHalf)}`; });
          const bandBot = Array.from({ length: 21 }, (_, i) => { const day = ((20 - i) / 20) * (totalDays - 1); return `${X(day)},${Y(band(day) - bandHalf)}`; });
          const ticks = [yMin + (yMax - yMin) * 0.15, (yMin + yMax) / 2, yMax - (yMax - yMin) * 0.15];
          const wkW = (X(7) - X(0)) * 0.62;
          const lastWaist = waistPts[waistPts.length - 1], lastHip = hipPts[hipPts.length - 1];
          return (
            <svg width={w} height={H} style={{ display: 'block', overflow: 'visible' }} aria-hidden="true">
              {d.phases.map((p, i) => {
                const x = dx(p.date);
                // Two rows, alternating: a label may run until the next label on its own row.
                const row = i % 2;
                const next = d.phases[i + 2] ? dx(d.phases[i + 2].date) : w - padR + 30;
                const chars = Math.floor((next - x - 8) / LABEL_CHAR_PX);
                const text = chars >= 4 ? shortPhaseLabel(p.label, Math.min(16, chars)) : '';
                return (
                  <g key={p.date + i}>
                    {i > 0 && <line x1={x} x2={x} y1={row === 0 ? 0 : 12} y2={H - 14} stroke="var(--text3)" strokeDasharray="2 4" />}
                    {text && <text x={x + 4} y={row === 0 ? 9 : 21} fontSize="10" fill="var(--text3)" fontWeight="700">{text.toUpperCase()}</text>}
                  </g>
                );
              })}
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={padL} x2={w - padR} y1={Y(t)} y2={Y(t)} stroke="var(--divider)" />
                  <text x={padL - 6} y={Y(t) + 3} textAnchor="end" fontSize="10" fill="var(--text3)">{Math.round(t)}</text>
                </g>
              ))}
              {inVals.length > 0 && <text x={w - padR + 6} y={YI(iMax) + 3} fontSize="10" fill="var(--text3)">in</text>}
              <text x={padL - 6} y={Y(yMax) - 4} textAnchor="end" fontSize="10" fill="var(--text3)">lbs</text>
              {d.targetLbs != null && <>
                <polygon points={[...bandTop, ...bandBot].join(' ')} fill="var(--ice)" opacity=".12" />
                <polyline points={bandTop.join(' ')} fill="none" stroke="var(--ice)" strokeOpacity=".55" strokeDasharray="4 5" strokeWidth="1.2" />
                <polyline points={bandBot.join(' ').split(' ').reverse().join(' ')} fill="none" stroke="var(--ice)" strokeOpacity=".55" strokeDasharray="4 5" strokeWidth="1.2" />
                <text x={w - padR} y={Y(band(totalDays - 1) - bandHalf) + 14} textAnchor="end" fontSize="10.5" fill="var(--ice)">Target {fmt.one(d.targetLbs)}</text>
              </>}
              {waistPts.length > 1 && <polyline points={waistPts.map((m) => `${dx(m.date)},${YI(m.waist as number)}`).join(' ')} fill="none" stroke="var(--text)" strokeOpacity=".75" strokeWidth="1.4" strokeDasharray="5 3" />}
              {hipPts.length > 1 && <polyline points={hipPts.map((m) => `${dx(m.date)},${YI(m.hip as number)}`).join(' ')} fill="none" stroke="var(--text2)" strokeWidth="1.4" strokeDasharray="1.5 3" strokeLinecap="round" />}
              {lastWaist && <text x={dx(lastWaist.date) + 5} y={YI(lastWaist.waist as number) + 3} fontSize="10" fill="var(--text2)">Waist {fmt.inches(lastWaist.waist as number)}</text>}
              {lastHip && <text x={dx(lastHip.date) + 5} y={YI(lastHip.hip as number) + 3} fontSize="10" fill="var(--text2)">Hip {fmt.inches(lastHip.hip as number)}</text>}
              {d.weighIns.map((p) => <circle key={p.date} cx={dx(p.date)} cy={Y(p.lbs)} r="1.6" fill="var(--accent2)" opacity=".35" />)}
              {d.trend.length > 1 && <polyline className="line" pathLength={1} points={d.trend.map((p) => `${dx(p.date)},${Y(p.lbs)}`).join(' ')} fill="none" stroke="var(--accent2)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />}
              {d.trend.length > 0 && <circle className="dot" cx={dx(d.trend[d.trend.length - 1].date)} cy={Y(d.trend[d.trend.length - 1].lbs)} r="5" fill="var(--accent2)" stroke="var(--surface)" strokeWidth="3" />}
              <text x={padL - 6} y={botTop + 8} textAnchor="end" fontSize="10" fill="var(--text3)">kcal</text>
              {d.kcalWeeks.map((wk, i) => {
                const x0 = X(daysBetween(d.start, wk.start) + 3.5) - wkW / 2;
                const bad = wk.avgKcal != null && wk.targetKcal != null && offGoal(wk.avgKcal, wk.targetKcal);
                return (
                  <g key={wk.start}>
                    {wk.avgKcal != null && <rect className="vbar" style={{ ['--i' as string]: i }} x={x0} y={YK(wk.avgKcal)} width={wkW} height={H - 14 - YK(wk.avgKcal)} rx="3" fill={bad ? 'var(--red)' : 'var(--accent)'} opacity={bad ? 0.85 : 0.55} />}
                    {wk.targetKcal != null && <line x1={x0 - 3} x2={x0 + wkW + 3} y1={YK(wk.targetKcal)} y2={YK(wk.targetKcal)} stroke="var(--ice)" strokeWidth="2" strokeLinecap="round" />}
                  </g>
                );
              })}
              {Array.from({ length: weekCount }, (_, i) => i).filter((i) => weekCount <= 12 || i % 2 === 0).map((i) => (
                <text key={i} x={X(i * 7 + 3.5)} y={H - 2} textAnchor="middle" fontSize="10" fill="var(--text3)">W{i + 1}</text>
              ))}
              {d.last < d.end && <line x1={dx(d.last)} x2={dx(d.last)} y1={0} y2={H - 14} stroke="var(--accent)" strokeOpacity=".5" />}
              {sx != null && <line x1={sx} x2={sx} y1={0} y2={H - 14} stroke="var(--text)" strokeOpacity=".6" />}
            </svg>
          );
        }}
      />
      <Legend items={[
        { label: 'Weekly average', swatch: <LineSwatch color="var(--accent2)" width={2.4} /> },
        ...(d.targetLbs != null ? [{ label: 'Goal band', swatch: <BoxSwatch color="var(--ice)" opacity={0.35} /> }] : []),
        ...(waistPts.length > 1 ? [{ label: 'Waist', swatch: <LineSwatch color="var(--text)" dash="5 3" /> }] : []),
        ...(hipPts.length > 1 ? [{ label: 'Hip', swatch: <LineSwatch color="var(--text2)" dash="1.5 3" /> }] : []),
        { label: 'Kcal vs target', swatch: <BoxSwatch color="var(--accent)" opacity={0.55} /> },
        { label: 'Off-goal week', swatch: <BoxSwatch color="var(--red)" /> },
        ...(d.phases.length > 1 ? [{ label: 'Goal phase change', swatch: <LineSwatch color="var(--text3)" dash="2 4" width={1} /> }] : []),
      ]} />
      <StoryTable d={d} />
    </div>
  );
}

/** Every chart has a data-table fallback (screen readers; also a plain read of the numbers). */
function StoryTable({ d }: { d: StoryData }) {
  return (
    <div className="sr-only"><table>
      <caption>Week by week</caption>
      <thead><tr><th scope="col">Week</th><th scope="col">Average weight, lbs</th><th scope="col">Kcal a day</th><th scope="col">Kcal target</th></tr></thead>
      <tbody>
        {d.kcalWeeks.map((w) => {
          const t = d.trend.find((p) => p.start === w.start);
          return <tr key={w.start}><th scope="row">{w.label}</th><td>{t ? fmt.one(t.lbs) : '—'}</td><td>{w.avgKcal ?? '—'}</td><td>{w.targetKcal != null ? Math.round(w.targetKcal) : '—'}</td></tr>;
        })}
      </tbody>
    </table></div>
  );
}
