// Which session the coach takes with a client in person: the week agenda (BLOC §115's design).
// One card per calendar week of the coach's cycle, with its dates, "This week", deload and a summary; it opens into its sessions with their state, scrolled to the week holding the chosen (or
// up-next) session. One tap chooses. A session the client has started, or that's already logged,
// can't be chosen (and says why).
import { useEffect, useMemo, useState } from 'react';
import type { Macrocycle } from '@engine';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/controls';
import { Chip, Tag } from '@/components/ui/display';
import { Icon } from '@/components/ui/Icon';
import { fmt } from '@/lib/format';
import type { AssignedSession } from '@/diary/types';
import { sameSession, type PickSession, type PickUnit } from './model';

function meta(x: PickSession): string {
  if (x.coachLogged) return `Logged by you · ${x.doneSets} of ${x.sets} sets`;
  if (x.groupReplaced) return 'Replaced by a group session';
  if (x.done) return `Done · ${x.sets} sets`;
  if (x.partial || x.doneSets > 0) return `Started by them · ${x.doneSets} of ${x.sets} sets`;
  return `${x.exercises} exercise${x.exercises === 1 ? '' : 's'} · ${x.sets} sets`;
}

function summary(u: PickUnit): string {
  if (u.isDeload) return 'Deload';
  if (u.doneCount === u.sessions.length) return '✓ All done';
  if (u.sessions.some((x) => x.partial)) return 'In progress';
  return u.doneCount ? `${u.doneCount} of ${u.sessions.length} done` : `${u.sessions.length} sessions`;
}

export function SessionPicker({ title, macro, units, first, current, tagged, onPick, onClear, onClose, clearLabel }: {
  title: string; macro: Macrocycle; units: PickUnit[]; first: string;
  /** The session shown as chosen (the default, or the one being logged). */
  current: AssignedSession | null;
  /** The session already tagged for this booking, if any. */
  tagged?: AssignedSession | null;
  onPick: (s: AssignedSession) => void; onClose: () => void;
  /** Releases a tagged session. */
  onClear?: () => void; clearLabel?: string;
}) {
  const upNextUnit = units.find((u) => u.sessions.some((x) => x.upNext)) ?? null;
  const currentUnit = units.find((u) => u.sessions.some((x) => sameSession({ macroId: macro.id, ...x }, current))) ?? null;
  const [open, setOpen] = useState<Set<string>>(() => new Set([currentUnit?.key, upNextUnit?.key, units.find((u) => u.isThisWeek)?.key].filter(Boolean) as string[]));
  const total = useMemo(() => Math.max(0, ...units.map((u) => u.week)), [units]);
  // The sheet opens on the week holding the chosen session (else up next), so it's at the top of the list even
  // mid-cycle, with the finished weeks above it.
  const startKey = currentUnit?.key ?? upNextUnit?.key ?? null;
  useEffect(() => {
    if (!startKey) return;
    const t = setTimeout(() => document.querySelector(`[data-unit="${startKey}"]`)?.scrollIntoView({ block: 'start' }), 60);
    return () => clearTimeout(t);
  }, [startKey]);
  const toggle = (k: string) => setOpen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  return (
    <Sheet open title={title} onClose={onClose}>
      <p className="muted" style={{ marginBottom: 12 }}>{String((macro as { name?: string }).name || 'Cycle')} · {total} mesocycles. Tap a session to choose it. {first} sees it read-only, “with your coach”.</p>
      <div className="stack">
        {units.map((u) => {
          const isOpen = open.has(u.key);
          return (
            <div key={u.key} data-unit={u.key} className="card" style={{ padding: 0, scrollMarginTop: 8, borderColor: u.isThisWeek ? 'color-mix(in srgb, var(--accent) 45%, transparent)' : undefined }}>
              <button type="button" className="rowbtn" style={{ padding: '14px 16px' }} aria-expanded={isOpen} onClick={() => toggle(u.key)}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b className="num">{u.start && u.end ? `${fmt.ddm(u.start)} – ${fmt.ddm(u.end)}` : `MC ${u.week}`}</b>
                  <small>MC {u.week}{u.isDeload ? ' · Deload' : ''} · {summary(u)}</small>
                </span>
                {u.isThisWeek && <Chip tone="acc">This week</Chip>}
                <span className="chev"><Icon name={isOpen ? 'chevU' : 'chevD'} size={20} /></span>
              </button>
              {isOpen && (
                <div style={{ padding: '0 16px 8px' }}>
                  {u.sessions.map((x) => {
                    const at = { macroId: macro.id, week: x.week, dayKey: x.dayKey };
                    const on = sameSession(at, current);
                    const isTag = sameSession(at, tagged);
                    return (
                      <button key={x.dayKey} type="button" className="listrow" disabled={!x.assignable && !on}
                        aria-pressed={on} onClick={() => x.assignable && onPick(at)}
                        style={{ width: '100%', borderTop: '1px solid var(--divider)', opacity: x.assignable || on ? 1 : 0.55, cursor: x.assignable ? 'pointer' : 'default',
                          ...(on ? { background: 'color-mix(in srgb, var(--accent) 12%, transparent)', borderRadius: 12 } : {}) }}>
                        <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center',
                          border: x.done || x.coachLogged ? 0 : '1.5px solid color-mix(in srgb, var(--text) 25%, transparent)', background: x.done || x.coachLogged ? 'var(--accent)' : 'transparent', color: 'var(--on-accent)' }}>
                          {(x.done || x.coachLogged) && <Icon name="check" size={13} />}
                        </span>
                        <span className="main" style={{ textAlign: 'left' }}>
                          <b>{x.label}</b>
                          <small className="muted" style={{ display: 'block', fontSize: 12.5, marginTop: 2 }}>{meta(x)}</small>
                        </span>
                        {on ? <Tag tone="acc">Chosen</Tag> : isTag ? <Tag tone="acc">Tagged</Tag> : x.upNext ? <Tag tone="good">Up next</Tag> : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {onClear && tagged && (
        <Button variant="ghost" style={{ marginTop: 16 }} onClick={onClear}>{clearLabel ?? 'Don’t tag a session'}</Button>
      )}
    </Sheet>
  );
}
