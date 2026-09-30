// One exercise in an in-person session (the wireframe's ExerciseCard, for the coach): its targets (Train's, at the
// client's date), set dots and last week collapsed; open, the set table (# · Last wk · kg · Reps · ✓), Fill
// suggested, Clear, and the tick that completes every set at target. The session's effort ratings are asked once,
// at Finish (BLOC's end-of-session sheet), not per card.
//
// 🚨 Measured at 375pt: the set table's columns are 22 · 1fr · 76 · 60 · 44 with 8px gaps inside an 18px-padded
//    card, which leaves "Last wk" 65px; "62.5 × 10" is 58px at 12.5px, so it's nowrap.
import { useId } from 'react';
import { Card, Tag } from '@/components/ui/display';
import { Button } from '@/components/ui/controls';
import { Icon } from '@/components/ui/Icon';
import type { ExerciseTarget, SetEntry } from './model';

const lbl = { fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase' as const, color: 'var(--text3)', fontWeight: 700 };
const GRID = '22px minmax(0, 1fr) 76px 60px 44px';
const TYPE_TAG: Record<string, { text: string; tone: 'acc' | 'amber' | 'blue' | '' }> = {
  dropset: { text: 'Drop set', tone: '' }, pause: { text: 'Pause', tone: 'amber' }, giant: { text: 'Giant set', tone: 'acc' },
};

/** The sets a card starts with: each at Train's suggestion, not done. */
export const blankSets = (t: ExerciseTarget): SetEntry[] => Array.from({ length: t.sets }, (_, i) => ({ kg: t.weights[i] ?? '', reps: t.reps[i] ?? '', done: false }));

export function ExerciseLogCard({ n, i, t, sets, onSets, expanded, onToggle, readOnly, lastLabel = 'Last wk' }: {
  n: number; i: number; t: ExerciseTarget; sets: SetEntry[]; onSets?: (s: SetEntry[]) => void; expanded: boolean; onToggle: () => void; readOnly?: boolean;
  /** A group session's last time is its last group session, not last week (§162). */
  lastLabel?: string;
}) {
  const bodyId = useId();
  const ex = t.ex;
  const done = sets.filter((s) => s.done).length;
  const cardio = ex.category === 'cardio';
  const unit = ex.trackingMode === 'perSide' ? 'kg per side' : 'kg';
  const tag = TYPE_TAG[String(ex.type)];
  const lastText = t.last.find((l) => l.weight != null) ? `${t.last.find((l) => l.weight != null)!.weight} × ${t.last.find((l) => l.weight != null)!.reps}` : '—';
  const set = (k: number, patch: Partial<SetEntry>) => onSets?.(sets.map((s, j) => (j === k ? { ...s, ...patch } : s)));
  const cell = { height: 42, textAlign: 'center' as const, padding: 0 };
  return (
    <Card i={i} style={expanded ? { borderColor: 'color-mix(in srgb, var(--accent) 40%, transparent)' } : undefined}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <div aria-hidden="true" style={{ width: 30, height: 30, borderRadius: 10, background: 'var(--surface3)', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, color: 'var(--accent2)', flexShrink: 0 }}>{n}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row top-align">
            <button type="button" onClick={onToggle} aria-expanded={expanded} aria-controls={bodyId}
              style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', color: 'inherit', cursor: 'pointer', flex: 1, minWidth: 0, minHeight: 44 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{String(ex.name)}</div>
              {(tag || t.deload || t.locked || cardio) && (
                <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {tag && <Tag tone={tag.tone}>{tag.text}</Tag>}
                  {cardio && <Tag tone="blue">Cardio</Tag>}
                  {t.deload && <Tag tone="ice">Deload</Tag>}
                  {t.locked && <Tag tone="amber">On hold</Tag>}
                </div>
              )}
              {expanded && <div className="muted" style={{ marginTop: 4 }}>{t.sets} {t.sets === 1 ? 'set' : 'sets'} · {done}/{sets.length} done</div>}
            </button>
            {!readOnly && (
              <button type="button" className="icon-btn in-card" aria-label={`Complete every set of ${String(ex.name)} at target`} onClick={() => onSets?.(sets.map((s, k) => ({ ...s, kg: s.kg || t.weights[k] || '', reps: s.reps || t.reps[k] || '', done: true })))}>
                <Icon name="checkbox" size={20} />
              </button>
            )}
          </div>
          {!expanded && (
            <>
              <div className="row" style={{ marginTop: 6 }}>
                <span className="muted" style={{ whiteSpace: 'nowrap' }}>{t.sets} {t.sets === 1 ? 'set' : 'sets'} · {t.reps[0] || String(ex.reps || '')} reps</span>
                {!cardio && <span className="num" style={{ whiteSpace: 'nowrap' }}><b className="display" style={{ fontSize: 17 }}>{t.weights[0] || '—'}</b> <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>{unit}</span></span>}
              </div>
              <div className="row" style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} role="img" aria-label={`${done} of ${sets.length} sets done`}>
                  {sets.map((s, k) => <i key={k} style={{ width: 22, height: 22, borderRadius: '50%', display: 'block', border: s.done ? 0 : '1.5px solid color-mix(in srgb, var(--text) 22%, transparent)', background: s.done ? 'var(--accent)' : 'transparent' }} />)}
                </div>
                <span style={{ fontSize: 11.5, color: 'var(--text3)', whiteSpace: 'nowrap' }}>{lastLabel} {lastText}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {expanded && (
        <div id={bodyId}>
          <div className="row" style={{ marginTop: 18 }}>
            <span style={{ ...lbl, fontSize: 11.5, letterSpacing: '.12em' }}>{readOnly ? 'Logged sets' : 'Log sets'}</span>
            {!readOnly && (
              <span style={{ display: 'flex', gap: 8 }}>
                <Button size="compact" variant="ghost" icon="sparkle" onClick={() => onSets?.(sets.map((s, k) => ({ ...s, kg: t.weights[k] ?? s.kg, reps: t.reps[k] ?? s.reps })))}>Fill suggested</Button>
                <Button size="compact" variant="danger" onClick={() => onSets?.(sets.map((s) => ({ ...s, done: false })))}>Clear</Button>
              </span>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 8, marginTop: 12, ...lbl }} aria-hidden="true">
            <span>#</span><span>{lastLabel}</span><span style={{ textAlign: 'center' }}>{cardio ? 'Min' : 'kg'}</span><span style={{ textAlign: 'center' }}>Reps</span><span style={{ textAlign: 'center' }}>✓</span>
          </div>
          {sets.map((s, k) => {
            const prev = t.last[k];
            return (
              <div key={k} style={{ display: 'grid', gridTemplateColumns: GRID, gap: 8, alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--divider)' }}>
                <span className="muted" style={{ fontSize: 13 }}>{k + 1}</span>
                <span className="num" style={{ fontSize: 12.5, color: 'var(--text3)', whiteSpace: 'nowrap', overflow: 'hidden' }}>{prev && prev.weight != null ? `${prev.weight} × ${prev.reps}` : '—'}</span>
                {readOnly ? (
                  <>
                    <span className="num tile" style={{ ...cell, display: 'grid', placeItems: 'center', fontWeight: 700 }}>{s.kg || '—'}</span>
                    <span className="num tile" style={{ ...cell, display: 'grid', placeItems: 'center', fontWeight: 700 }}>{s.reps || '—'}</span>
                    <span style={{ width: 42, height: 42, borderRadius: 12, display: 'grid', placeItems: 'center', background: s.done ? 'color-mix(in srgb, var(--accent) 22%, transparent)' : 'transparent', color: 'var(--accent2)' }} role="img" aria-label={s.done ? 'Done' : 'Not done'}>
                      {s.done && <Icon name="check" size={18} />}
                    </span>
                  </>
                ) : (
                  <>
                    <input className="input num" style={cell} inputMode="decimal" placeholder={t.weights[k] ?? ''} aria-label={`${String(ex.name)} set ${k + 1} kg`} value={s.kg} onChange={(e) => set(k, { kg: e.target.value.replace(/[^0-9.]/g, '') })} />
                    <input className="input num" style={cell} inputMode="numeric" placeholder={t.reps[k] ?? ''} aria-label={`${String(ex.name)} set ${k + 1} reps`} value={s.reps} onChange={(e) => set(k, { reps: e.target.value })} />
                    <button type="button" aria-pressed={s.done} aria-label={`Set ${k + 1} done`} onClick={() => set(k, { done: !s.done, kg: s.kg || t.weights[k] || '', reps: s.reps || t.reps[k] || '' })}
                      style={{ width: 42, height: 42, borderRadius: 12, border: `1.5px solid ${s.done ? 'var(--accent)' : 'color-mix(in srgb, var(--text) 20%, transparent)'}`, background: s.done ? 'var(--accent)' : 'transparent', color: 'var(--on-accent)', display: 'grid', placeItems: 'center', cursor: 'pointer', padding: 0 }}>
                      {s.done && <Icon name="check" size={18} />}
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
