// Client → Sessions → Past sessions: the in-person sessions logged on this card (its `session_log`
// publications), newest first, a correction in place of what it corrected. Each opens its sets read-only.
import { useState } from 'react';
import type { Loose } from '@engine';
import { Section } from '@/components/ui/layout';
import { Sheet } from '@/components/ui/Sheet';
import { Tag } from '@/components/ui/display';
import { Icon } from '@/components/ui/Icon';
import { fmt } from '@/lib/format';
import type { ClientBundle } from '@/data/types';
import { useRecord } from './useRecord';
import type { LoggedSession } from './model';

export function PastSessions({ bundle, first, i }: { bundle: ClientBundle; first: string; i: number }) {
  const rec = useRecord(bundle);
  const [open, setOpen] = useState<LoggedSession | null>(null);
  if (!rec.logged.length) return null;
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
    <Section i={i} title="Past sessions" sub={`In-person sessions you logged with ${first}, newest first.`}>
      <div className="card list">
        {rec.logged.map((l) => (
          <button key={l.sessionId} type="button" className="listrow" onClick={() => setOpen(l)}>
            <span style={{ width: 44, textAlign: 'center', flexShrink: 0 }} aria-hidden="true">
              <span className="caption" style={{ display: 'block', textTransform: 'uppercase', letterSpacing: '.1em', fontWeight: 700 }}>{fmt.dayShort(l.date)}</span>
              <span className="display num" style={{ fontSize: 20 }}>{Number(l.date.slice(8))}</span>
            </span>
            <span className="main">
              <b><span className="sr-only">{fmt.ddm(l.date)}, </span>{labelOf(l)}</b>
              <small className="muted" style={{ display: 'block', fontSize: 12.5, marginTop: 3 }}>{l.setsDone} of {l.sets} sets · {fmt.dm(l.date)}</small>
            </span>
            <Tag tone="acc">In person</Tag>
            <Icon name="chevR" size={18} />
          </button>
        ))}
      </div>
      {open && (
        <Sheet open title={labelOf(open)} onClose={() => setOpen(null)}>
          <p className="muted" style={{ marginBottom: 12 }}>{fmt.long(open.date)} · logged by you, in person. Read-only.</p>
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
