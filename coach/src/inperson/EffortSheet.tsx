// "How hard was it?": BLOC's end-of-session effort sheet (BLOC §104), rated by the coach. One sheet per session,
// one 1–10 per exercise done; tapping the chosen number again clears it, and anything left unrated is sent as
// 'skipped' (never a number: a skip reads "Not rated", BLOC's rule). Only when the cycle has ratings on.
import { useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/controls';
import type { Ratings } from './model';

export function EffortSheet({ exercises, initial, first, busy, onDone, onClose }: {
  exercises: { id: string; name: string }[]; initial: Ratings; first: string; busy?: boolean;
  onDone: (r: Ratings) => void; onClose: () => void;
}) {
  const [r, setR] = useState<Ratings>(initial);
  return (
    <Sheet open title="How hard was it?" onClose={onClose}>
      <p className="muted" style={{ marginBottom: 6 }}>Rate each exercise from 1 to 10. Anything you leave counts as fine. {first} sees each one marked “rated by coach”.</p>
      {exercises.map((ex) => {
        const v = typeof r[ex.id] === 'number' ? (r[ex.id] as number) : null;
        return (
          <div key={ex.id} style={{ padding: '14px 0', borderTop: '1px solid var(--divider)' }}>
            <div className="row"><b style={{ fontSize: 15 }}>{ex.name}</b><span className="caption">{v != null ? `RPE ${v}` : ''}</span></div>
            <div role="group" aria-label={`${ex.name} effort, RPE 1 to 10`} className="rpe-scale">
              {Array.from({ length: 10 }, (_, k) => k + 1).map((n) => (
                <button key={n} type="button" className="pick num" aria-pressed={v === n} onClick={() => setR((x) => { const y = { ...x }; if (y[ex.id] === n) delete y[ex.id]; else y[ex.id] = n; return y; })}
                  style={{ minHeight: 40, padding: 0, textAlign: 'center', fontWeight: 700 }}>{n}</button>
              ))}
            </div>
            <div className="row caption" style={{ marginTop: 6 }}><span>1 · easy</span><span>10 · nothing left</span></div>
          </div>
        );
      })}
      <Button style={{ marginTop: 16 }} icon="send" disabled={busy} onClick={() => onDone(r)}>Done · send</Button>
    </Sheet>
  );
}
