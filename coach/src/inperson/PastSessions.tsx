// Client → Sessions → Past sessions: the sessions logged on this card (its `session_log` publications): in
// person, recorded for a client who trained on their own (§162), and group sessions. Newest first, a correction
// in place of what it corrected. Each opens its sets read-only.
import { useState, type ReactNode } from 'react';
import type { Loose } from '@engine';
import { Section } from '@/components/ui/layout';
import { Sheet } from '@/components/ui/Sheet';
import { Tag } from '@/components/ui/display';
import { Icon } from '@/components/ui/Icon';
import { fmt } from '@/lib/format';
import type { ClientBundle } from '@/data/types';
import { useRecord } from './useRecord';
import type { LoggedSession } from './model';
import { loggedGroups, type LoggedGroup } from '@/group/model';

export function PastSessions({ bundle, first, i }: { bundle: ClientBundle; first: string; i: number }) {
  const rec = useRecord(bundle);
  const [open, setOpen] = useState<LoggedSession | null>(null);
  const [openGroup, setOpenGroup] = useState<LoggedGroup | null>(null);
  const groups = rec.pubs ? loggedGroups(rec.pubs) : [];
  if (!rec.logged.length && !groups.length) return null;
  type Row = { at: string; seq: number; node: ReactNode };
  const st = (rec.state ?? {}) as Loose;
  const macroOf = (id: string) => ((st.macrocycles as Loose[]) || []).find((m) => m.id === id);
  const labelOf = (l: LoggedSession) => {
    const m = macroOf(l.macroId);
    const day = l.dayKey.replace(/m[12]$/, '');
    const name = (m?.dayLabels as Record<string, string> | undefined)?.[day] ?? ({ push: 'Push', pull: 'Pull', legs: 'Legs' } as Record<string, string>)[day] ?? day;
    return `${name}${/m1$/.test(l.dayKey) ? ' · A' : /m2$/.test(l.dayKey) ? ' · B' : ''} · MC ${l.week}`;
  };
  const exName = (l: LoggedSession, id: string) => String(((st.exercises as Record<string, Loose[]>)?.[`${l.macroId}_1_${l.dayKey}`] || []).find((e) => e.id === id)?.name ?? 'Exercise');
  return (
    <Section i={i} title="Past sessions" sub={`Sessions you logged for ${first}, newest first.`}>
      <div className="card list">
        {[
          ...rec.logged.map((l): Row => ({ at: l.date, seq: l.pub.seq, node: (
          <button key={l.sessionId} type="button" className="listrow" onClick={() => setOpen(l)}>
            <span style={{ width: 44, textAlign: 'center', flexShrink: 0 }} aria-hidden="true">
              <span className="caption" style={{ display: 'block', textTransform: 'uppercase', letterSpacing: '.1em', fontWeight: 700 }}>{fmt.dayShort(l.date)}</span>
              <span className="display num" style={{ fontSize: 20 }}>{Number(l.date.slice(8))}</span>
            </span>
            <span className="main">
              <b><span className="sr-only">{fmt.ddm(l.date)}, </span>{labelOf(l)}</b>
              <small className="muted" style={{ display: 'block', fontSize: 12.5, marginTop: 3 }}>{l.setsDone} of {l.sets} sets · {fmt.dm(l.date)}</small>
            </span>
            <Tag tone={l.own ? 'neutral' : 'acc'}>{l.own ? 'On their own' : 'In person'}</Tag>
            <Icon name="chevR" size={18} />
          </button>
          ) })),
          ...groups.map((g): Row => ({ at: g.date, seq: g.pub.seq, node: (
          <button key={g.sessionId} type="button" className="listrow" onClick={() => setOpenGroup(g)}>
            <span style={{ width: 44, textAlign: 'center', flexShrink: 0 }} aria-hidden="true">
              <span className="caption" style={{ display: 'block', textTransform: 'uppercase', letterSpacing: '.1em', fontWeight: 700 }}>{fmt.dayShort(g.date)}</span>
              <span className="display num" style={{ fontSize: 20 }}>{Number(g.date.slice(8))}</span>
            </span>
            <span className="main">
              <b><span className="sr-only">{fmt.ddm(g.date)}, </span>Group session</b>
              <small className="muted" style={{ display: 'block', fontSize: 12.5, marginTop: 3 }}>{g.logs.map((x) => x.name).slice(0, 3).join(', ')}{g.replaces ? ' · replaced a planned session' : ''}</small>
            </span>
            <Tag tone="blue">Group</Tag>
            <Icon name="chevR" size={18} />
          </button>
          ) })),
        ].sort((a, b) => b.at.localeCompare(a.at) || b.seq - a.seq).map((r) => r.node)}
      </div>
      {openGroup && (
        <Sheet open title="Group session" onClose={() => setOpenGroup(null)}>
          <p className="muted" style={{ marginBottom: 12 }}>{fmt.long(openGroup.date)} · logged by you. {openGroup.replaces ? 'It replaced a planned session, which counts as swapped.' : 'An extra session: it doesn’t affect their progression.'} Read-only.</p>
          {openGroup.logs.map((l, k) => (
            <div key={k} style={{ padding: '12px 0', borderTop: '1px solid var(--divider)' }}>
              <b>{l.name}</b>
              {l.sets.map((x, j) => <div key={j} className="ex"><span className="muted">Set {j + 1}</span><span className="num">{x.weight ? `${x.weight} kg × ${x.reps}` : `${x.reps} reps`}</span></div>)}
            </div>
          ))}
        </Sheet>
      )}
      {open && (
        <Sheet open title={labelOf(open)} onClose={() => setOpen(null)}>
          <p className="muted" style={{ marginBottom: 12 }}>{fmt.long(open.date)} · {open.own ? `${first} trained on their own; you recorded it` : 'logged by you, in person'}. Read-only.</p>
          {Object.entries((open.pub.payload.logs as Record<string, Loose>) || {}).map(([id, e]) => {
            const sets = (Array.isArray(e) ? e : (e?.sets as Loose[]) || []) as Loose[];
            const r = (open.pub.payload.rpe as Record<string, unknown> | undefined)?.[id];
            return (
              <div key={id} style={{ padding: '12px 0', borderTop: '1px solid var(--divider)' }}>
                <div className="row"><b>{exName(open, id)}</b>{r != null && <span className="caption">{typeof r === 'number' ? `RPE ${r} · rated by you` : 'Not rated'}</span>}</div>
                {sets.map((x, k) => (
                  <div key={k} className="ex"><span className="muted">Set {k + 1}</span><span className="num">{x.done === false ? 'Not done' : `${x.weight} kg × ${x.reps}`}</span></div>
                ))}
              </div>
            );
          })}
        </Sheet>
      )}
    </Section>
  );
}
