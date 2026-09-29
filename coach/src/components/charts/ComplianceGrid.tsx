import { useState } from 'react';
import type { CellState, GridCell, GridRow, TrainingCompliance, WeekCol } from '@/review/training';
import { MID_RPE, outOf10 } from '@/review/training';
import { NAGGING_FAILS } from '@/review/findings';
import { fmt } from '@/lib/format';
import { Sheet } from '@/components/ui/Sheet';
import { Chip, Tag } from '@/components/ui/display';

/**
 * Exercise × mesocycle grid: one cell per exercise per mesocycle, so a single
 * nagging exercise reads as one red row in a green grid. With microcycles each
 * session splits into its A and B templates, which progress separately, so no
 * row has alternate-week gaps. States differ by glyph and fill, not hue alone.
 * Tap a cell to see its sets against targets.
 */
const CELL: Record<CellState, { bg: string; fg: string; glyph: string; label: string; border?: string }> = {
  pass: { bg: 'var(--green)', fg: 'var(--on-accent)', glyph: '', label: 'Every set on target' },
  fail: { bg: 'var(--red)', fg: 'var(--on-accent)', glyph: '×', label: 'Missed a target' },
  missed: { bg: 'transparent', fg: 'var(--red)', glyph: '!', label: 'Planned session not done', border: 'var(--red)' },
  swapped: { bg: 'color-mix(in srgb, var(--amber) 22%, transparent)', fg: 'var(--amber)', glyph: 'S', label: 'Swapped that day' },
  group: { bg: 'color-mix(in srgb, var(--accent) 20%, transparent)', fg: 'var(--accent2)', glyph: 'G', label: 'Group session instead' },
  excluded: { bg: 'var(--surface3)', fg: 'var(--text3)', glyph: '–', label: 'Not counted' },
  skipped: { bg: 'transparent', fg: 'var(--text3)', glyph: '!', label: 'Not done · not counted', border: 'var(--text3)' },
  logged: { bg: 'color-mix(in srgb, var(--green) 40%, transparent)', fg: 'var(--text)', glyph: '✓', label: 'Done' },
  pending: { bg: 'transparent', fg: 'var(--text3)', glyph: '·', label: 'This week, in progress', border: 'var(--border2)' },
  future: { bg: 'transparent', fg: 'var(--text3)', glyph: '', label: 'Still to come', border: 'var(--border2)' },
  none: { bg: 'transparent', fg: 'transparent', glyph: '', label: 'Not in this week' },
};

export function ComplianceGrid({ t }: { t: TrainingCompliance }) {
  const [sel, setSel] = useState<{ row: GridRow; cell: GridCell; col: WeekCol } | null>(null);
  let lastSession = '';
  const legend: CellState[] = t.scored ? ['pass', 'fail', 'missed', 'skipped', 'swapped', 'group', 'excluded'] : ['logged', 'missed', 'swapped', 'group'];
  return (
    <>
      <div style={{ overflowX: 'auto', margin: '0 -4px', padding: '0 4px' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 3, fontSize: 12.5, minWidth: '100%' }}>
          <caption className="sr-only">Training compliance by exercise and week</caption>
          <thead>
            <tr>
              <th scope="col" style={{ textAlign: 'left', position: 'sticky', left: 0, background: 'var(--surface)', zIndex: 1 }} className="caption">Exercise</th>
              {t.gridCols.map((c) => (
                <th key={c.idx} scope="col" className="caption" style={{ fontWeight: 700, minWidth: 26, lineHeight: 1.15, color: c.current ? 'var(--accent2)' : undefined }}>
                  {c.label}{c.sub && <span style={{ display: 'block', fontWeight: 500, fontSize: 9.5, whiteSpace: 'nowrap' }}>{c.sub}</span>}
                </th>
              ))}
              {t.scored && <th scope="col" className="caption" style={{ paddingLeft: 8, textAlign: 'right' }}>/10</th>}
            </tr>
          </thead>
          <tbody>
            {t.rows.map((r) => {
              const header = r.sessionLabel !== lastSession;
              lastSession = r.sessionLabel;
              const nagging = r.fails >= NAGGING_FAILS;
              return [
                header && (
                  <tr key={`${r.key}-h`}><th colSpan={t.gridCols.length + 2} scope="colgroup" style={{ textAlign: 'left', paddingTop: 10 }} className="eyebrow">{r.sessionLabel}</th></tr>
                ),
                <tr key={r.key}>
                  <th scope="row" title={r.name} style={{ textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap', paddingRight: 10, position: 'sticky', left: 0, background: 'var(--surface)', zIndex: 1, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', color: nagging ? 'var(--red)' : undefined }}>{r.name}</th>
                  {r.cells.map((c) => {
                    const s = CELL[c.state];
                    const clickable = !!c.sets?.length || !!c.reason;
                    return (
                      <td key={c.col} style={{ padding: 0 }}>
                        {c.state === 'none' ? <span aria-hidden="true" style={{ display: 'block', width: 26, height: 26 }} /> : (
                          <button
                            type="button" disabled={!clickable} onClick={() => setSel({ row: r, cell: c, col: t.cols[c.unit] })}
                            aria-label={`${r.name}, ${t.cols[c.unit].label}: ${s.label}${c.reason ? `. ${c.reason}` : ''}`}
                            style={{ width: 26, height: 26, borderRadius: 6, border: s.border ? `1.5px solid ${s.border}` : 0, background: s.bg, color: s.fg, fontWeight: 800, fontSize: 13, display: 'grid', placeItems: 'center', cursor: clickable ? 'pointer' : 'default', padding: 0, opacity: c.state === 'future' ? 0.6 : 1 }}
                          >{s.glyph}</button>
                        )}
                      </td>
                    );
                  })}
                  {t.scored && <td className="num" style={{ paddingLeft: 8, textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap', color: r.score != null && r.score < 6 ? 'var(--red)' : 'var(--text)' }}>{outOf10(r.score)}</td>}
                </tr>,
              ];
            })}
            <tr>
              <th scope="row" style={{ textAlign: 'left', paddingTop: 10, position: 'sticky', left: 0, background: 'var(--surface)' }} className="caption">{t.scored ? 'Score' : 'Attendance'}</th>
              {t.gridCols.map((c) => (
                <td key={c.idx} className="num caption" style={{ textAlign: 'center', paddingTop: 10, fontWeight: 700, color: c.score != null && c.score < 6 ? 'var(--red)' : undefined }}>{c.score != null ? outOf10(c.score) : ''}</td>
              ))}
              {t.scored && <td />}
            </tr>
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginTop: 12, fontSize: 11.5, color: 'var(--text2)' }}>
        {legend.map((k) => (
          <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span aria-hidden="true" style={{ width: 14, height: 14, borderRadius: 4, background: CELL[k].bg, border: CELL[k].border ? `1.5px solid ${CELL[k].border}` : 0, color: CELL[k].fg, fontSize: 10, fontWeight: 800, display: 'grid', placeItems: 'center' }}>{CELL[k].glyph}</span>
            {CELL[k].label}
          </span>
        ))}
      </div>

      <Sheet open={!!sel} onClose={() => setSel(null)} title={sel ? `${sel.row.name} · ${sel.col.label}` : ''}>
        {sel && <CellDetail row={sel.row} cell={sel.cell} col={sel.col} />}
      </Sheet>
    </>
  );
}

function CellDetail({ row, cell, col }: { row: GridRow; cell: GridCell; col: WeekCol }) {
  const s = CELL[cell.state];
  return (
    <div>
      <div className="row">
        <Chip tone={cell.state === 'pass' || cell.state === 'logged' ? 'good' : cell.state === 'fail' || cell.state === 'missed' ? 'bad' : cell.state === 'swapped' ? 'amber' : 'neutral'}>{s.label}</Chip>
        <span className="caption">{row.sessionLabel} · {fmt.range(col.start, col.end)}</span>
      </div>
      {cell.reason && <p className="muted" style={{ marginTop: 10 }}>{cell.reason}</p>}
      {cell.byCoach && <p className="caption" style={{ marginTop: 6 }}>Logged by you, in person.</p>}
      {cell.sets && cell.sets.length > 0 && (
        <div className="card" style={{ marginTop: 14, padding: '6px 16px' }}>
          <div className="row caption" style={{ padding: '8px 0', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', fontSize: 10.5 }}>
            <span style={{ width: 28 }}>Set</span><span style={{ flex: 1 }}>Target</span><span style={{ flex: 1 }}>Done</span><span style={{ width: 24 }} />
          </div>
          {cell.sets.map((st) => (
            <div key={st.n} className="row num" style={{ padding: '10px 0', borderTop: '1px solid var(--divider)', fontSize: 14 }}>
              <span style={{ width: 28, color: 'var(--accent2)', fontWeight: 700 }}>{st.n}</span>
              <span style={{ flex: 1, whiteSpace: 'nowrap' }}>{st.targetKg ?? '—'} kg × {st.targetReps ?? '—'}</span>
              <span style={{ flex: 1, whiteSpace: 'nowrap', fontWeight: 700, color: st.hit === false ? 'var(--red)' : 'var(--text)' }}>{st.done ? `${st.kg ?? '—'} kg × ${st.reps ?? '—'}` : 'Not done'}</span>
              <span style={{ width: 24 }}>{st.hit ? <Tag tone="good">✓</Tag> : st.hit === false ? <Tag>×</Tag> : null}</span>
            </div>
          ))}
        </div>
      )}
      {cell.rpe != null && <p className="muted" style={{ marginTop: 12 }}>Rated <b style={{ color: 'var(--text)' }}>RPE {cell.rpe}</b>.</p>}
      {cell.rpeSkipped && <p className="muted" style={{ marginTop: 12 }}><Tag tone="amber">Not rated</Tag> The RPE question was skipped. It counts as {MID_RPE}, the middle of the scale.</p>}
    </div>
  );
}

/** Planned against done, per calendar week. */
export function SessionsStrip({ t }: { t: TrainingCompliance }) {
  const most = Math.max(1, ...t.cols.map((c) => c.planned));
  return (
    <>
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${t.cols.length}, minmax(0, 1fr))`, gap: 4 }} role="img" aria-label={`Sessions planned against done, per week: ${t.cols.filter((c) => !c.future).map((c) => `${c.label} ${c.done} of ${c.planned}`).join(', ')}`}>
      {t.cols.map((c) => (
        <div key={c.idx} style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: 3, width: '100%', minHeight: most * 11 }}>
            {c.sessions.map((s) => {
              const bg = c.future ? 'transparent' : s.done ? 'var(--accent)' : 'transparent';
              const border = c.future || (c.current && !s.done) ? '1px dashed var(--border2)' : s.done ? '0' : '1.5px solid var(--red)';
              return <span key={s.dayKey} style={{ height: 8, borderRadius: 3, background: bg, border }} />;
            })}
          </div>
          <span className="caption" style={{ fontSize: 10, color: c.current ? 'var(--accent2)' : undefined }}>{c.idx + 1}</span>
        </div>
      ))}
    </div>
    <div className="caption" style={{ textAlign: 'center', fontSize: 10.5, marginTop: 4 }}>Week of the cycle · one bar per planned session</div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginTop: 10, fontSize: 11.5, color: 'var(--text2)' }}>
      {STRIP_KEY.map((k) => (
        <span key={k.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span aria-hidden="true" style={{ width: 16, height: 8, borderRadius: 3, background: k.bg, border: k.border }} />{k.label}
        </span>
      ))}
    </div>
    </>
  );
}

const STRIP_KEY = [
  { label: 'Done', bg: 'var(--accent)', border: '0' },
  { label: 'Not done', bg: 'transparent', border: '1.5px solid var(--red)' },
  { label: 'This week or still to come', bg: 'transparent', border: '1px dashed var(--border2)' },
];
