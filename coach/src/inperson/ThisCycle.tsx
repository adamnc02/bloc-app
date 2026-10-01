// Client → Sessions → This cycle (§165): every session of the client's running cycle, week by week, and where each
// stands: done, logged by you, replaced by a group session, part done, up next, or still to do. The week agenda In
// person's picker uses (BLOC §115's design, `agendaOf` at the client's today), read-only, for every client: a client
// not on the app has no other view of it. A session opens its logged sets.
//
// The cycle is the coach's running cycle (`cycleForSession`), else the client's own date-active one.
import { useMemo, useState } from 'react';
import { getDateActiveMacroId, getRpeKey, type Loose, type Macrocycle } from '@engine';
import { Section } from '@/components/ui/layout';
import { Chip, Tag } from '@/components/ui/display';
import { Sheet } from '@/components/ui/Sheet';
import { Icon } from '@/components/ui/Icon';
import { fmt } from '@/lib/format';
import type { ClientBundle } from '@/data/types';
import { useRecord } from './useRecord';
import { agendaOf, cycleForSession, sessionStatus, type PickSession } from './model';

export function ThisCycle({ bundle, first, i }: { bundle: ClientBundle; first: string; i: number }) {
  const rec = useRecord(bundle);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [shown, setShown] = useState<PickSession | null>(null);
  const macro = useMemo<Macrocycle | null>(() => {
    if (!rec.state) return null;
    const coach = cycleForSession(rec.state, rec.today, rec.today);
    if (coach) return coach;
    const id = getDateActiveMacroId(rec.state, { today: rec.today });
    return (rec.state.macrocycles || []).find((m) => m.id === id) ?? null;
  }, [rec.state, rec.today]);
  const units = useMemo(() => (rec.state && macro ? agendaOf(rec.state, macro, rec.today) : []), [rec.state, macro, rec.today]);
  if (!rec.state || !macro || !units.length) return null;
  const all = units.flatMap((u) => u.sessions);
  const counted = all.filter((x) => x.done || x.coachLogged || x.groupReplaced).length;
  const st = rec.state as Loose;
  const template = (dayKey: string) => [...(((st.exercises as Record<string, Loose[]>) || {})[`${macro.id}_1_${dayKey}`] || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
  const isOpen = (key: string, thisWeek: boolean) => open[key] ?? thisWeek;
  return (
    <Section i={i} title="This cycle" sub={`${String(macro.name)} · ${counted} of ${all.length} sessions done. Where each of ${first}’s sessions stands.`}>
      <div className="stack">
        {units.map((u) => (
          <div key={u.key} className="card" style={{ padding: 0 }}>
            <button type="button" className="listrow" aria-expanded={isOpen(u.key, u.isThisWeek)} onClick={() => setOpen({ ...open, [u.key]: !isOpen(u.key, u.isThisWeek) })}>
              <span className="main">
                <b>{u.start && u.end ? `${fmt.ddm(u.start)} – ${fmt.ddm(u.end)}` : `MC ${u.week}`}</b>
                <small className="muted" style={{ display: 'block', fontSize: 12.5, marginTop: 3 }}>MC {u.week} · {u.sessions.filter((x) => x.done || x.coachLogged || x.groupReplaced).length} of {u.sessions.length} done</small>
              </span>
              {u.isThisWeek && <Chip tone="acc">This week</Chip>}
              {u.isDeload && <Tag tone="ice">Deload</Tag>}
              <Icon name={isOpen(u.key, u.isThisWeek) ? 'chevU' : 'chevD'} size={18} />
            </button>
            {isOpen(u.key, u.isThisWeek) && (
              <div className="list" style={{ borderTop: '1px solid var(--divider)' }}>
                {u.sessions.map((x) => {
                  const s = sessionStatus(x);
                  return (
                    <button key={`${x.week}-${x.dayKey}`} type="button" className="listrow" onClick={() => setShown(x)}>
                      <span className="main"><b>{x.label}</b><small className="muted" style={{ display: 'block', fontSize: 12.5, marginTop: 3 }}>{x.exercises} exercises · {x.sets} sets</small></span>
                      <Tag tone={s.tone}>{s.text}</Tag>
                      <Icon name="chevR" size={18} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
      {shown && (
        <Sheet open title={`${shown.label} · MC ${shown.week}`} onClose={() => setShown(null)}>
          <p className="muted" style={{ marginBottom: 12 }}>{sessionStatus(shown).text}. Read-only.</p>
          {template(shown.dayKey).filter((ex) => ex.category !== 'cardio').map((ex) => {
            const sets = Object.entries((st.trainLogs as Record<string, Loose>) || {})
              .filter(([k]) => k.startsWith(`${macro.id}_${shown.week}_${shown.dayKey}_${ex.id}_`) && /^\d+$/.test(k.slice(`${macro.id}_${shown.week}_${shown.dayKey}_${ex.id}_`.length)))
              .sort(([a], [b]) => Number(a.split('_').pop()) - Number(b.split('_').pop())).map(([, v]) => v);
            const r = ((st.rpe as Record<string, Loose>) || {})[getRpeKey(macro.id, shown.week, shown.dayKey, String(ex.id))];
            return (
              <div key={String(ex.id)} style={{ padding: '12px 0', borderTop: '1px solid var(--divider)' }}>
                <div className="row"><b>{String(ex.name)}</b>{r && <span className="caption">{typeof r.rpe === 'number' ? `RPE ${r.rpe}${r.ratedBy === 'coach' ? ' · rated by you' : ''}` : 'Not rated'}</span>}</div>
                {sets.length ? sets.map((x, k) => (
                  <div key={k} className="ex"><span className="muted">Set {k + 1}</span><span className="num">{x.done === false ? 'Not done' : `${x.weight} kg × ${x.reps}`}{x.loggedBy === 'coach' ? ' · by you' : ''}</span></div>
                )) : <p className="caption" style={{ marginTop: 4 }}>Nothing logged.</p>}
              </div>
            );
          })}
        </Sheet>
      )}
    </Section>
  );
}
