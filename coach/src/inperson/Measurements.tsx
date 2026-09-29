// Measurements taken in person, for a client not on the app: a `measurement` publication (0023: {v, log_date,
// weight, waist, hip}) to their card. Units are BLOC's engine's: body weight in lbs, waist and hip in inches with
// quarters (§0). BLOC merges it into that day's body log if they ever link.
import { useId, useState } from 'react';
import type { BlocState, Loose } from '@engine';
import { Button, Seg } from '@/components/ui/controls';
import { fmt } from '@/lib/format';

type Q = '0' | '1' | '2' | '3';

/** Inches as a whole number plus ¼ ½ ¾ (the wireframe's QuarterField), so a tape reading takes one thumb. */
export function QuarterField({ label, value, onChange, last }: { label: string; value: number; onChange: (v: number) => void; last?: number | null }) {
  const id = useId();
  const whole = Math.floor(value + 1e-6);
  const q = String(Math.round((value - whole) * 4)) as Q;
  return (
    <div className="field">
      <label htmlFor={id}>{label}{last != null && <span className="caption" style={{ fontWeight: 500 }}> · last {fmt.inches(last)}</span>}</label>
      <div className="inrow">
        <input id={id} className="input num box" inputMode="numeric" style={{ maxWidth: 88, textAlign: 'center' }} value={whole || ''}
          onChange={(e) => onChange((Number(e.target.value.replace(/\D/g, '')) || 0) + Number(q) / 4)} />
        <span className="unit">in</span>
        <Seg<Q> label={`${label} fraction`} value={q} onChange={(v) => onChange(whole + Number(v) / 4)} className="auto"
          options={[{ value: '0', label: '0' }, { value: '1', label: '¼' }, { value: '2', label: '½' }, { value: '3', label: '¾' }]} />
      </div>
    </div>
  );
}

const num = (v: unknown) => { const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN; return Number.isFinite(n) && n > 0 ? n : null; };

/** The latest weigh-in and the latest waist/hip measurement in a state's body logs. */
export function latestBody(s: BlocState | null): { weight: { date: string; lbs: number } | null; tape: { date: string; waist: number | null; hip: number | null } | null } {
  const logs = [...(((s as Loose | null)?.bodyLogs as Loose[]) || [])].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const w = logs.find((l) => num(l.weight) != null);
  const t = logs.find((l) => num(l.waist) != null || num(l.hip) != null);
  return {
    weight: w ? { date: String(w.date), lbs: num(w.weight)! } : null,
    tape: t ? { date: String(t.date), waist: num(t.waist), hip: num(t.hip) } : null,
  };
}

export interface MeasurementPayload { v: 1; log_date: string; weight?: number; waist?: number; hip?: number }

/** Only what was entered goes: an empty field leaves that day's value as it was. */
export function measurementPayload(date: string, lbs: string, waist: number, hip: number): MeasurementPayload {
  const p: MeasurementPayload = { v: 1, log_date: date };
  const w = parseFloat(lbs);
  if (Number.isFinite(w) && w > 0) p.weight = Math.round(w * 10) / 10;
  if (waist > 0) p.waist = waist;
  if (hip > 0) p.hip = hip;
  return p;
}

/** Weight, waist and hip, and Save measurements. */
export function MeasurementsForm({ state, date, busy, onSave }: { state: BlocState | null; date: string; busy?: boolean; onSave: (p: MeasurementPayload) => void }) {
  const id = useId();
  const last = latestBody(state);
  const [lbs, setLbs] = useState('');
  const [waist, setWaist] = useState(0);
  const [hip, setHip] = useState(0);
  const p = measurementPayload(date, lbs, waist, hip);
  const empty = p.weight == null && p.waist == null && p.hip == null;
  return (
    <>
      <div className="field">
        <label htmlFor={`${id}-w`}>Weight{last.weight && <span className="caption" style={{ fontWeight: 500 }}> · last {last.weight.lbs.toFixed(1)} lbs, {fmt.dm(last.weight.date)}</span>}</label>
        <div className="inrow">
          <input id={`${id}-w`} className="input num box" inputMode="decimal" style={{ maxWidth: 120, textAlign: 'center' }} placeholder={last.weight ? last.weight.lbs.toFixed(1) : ''} value={lbs} onChange={(e) => setLbs(e.target.value.replace(/[^0-9.]/g, ''))} />
          <span className="unit">lbs</span>
        </div>
      </div>
      <QuarterField label="Waist" value={waist} onChange={setWaist} last={last.tape?.waist} />
      <QuarterField label="Hip" value={hip} onChange={setHip} last={last.tape?.hip} />
      {last.tape && <p className="caption" style={{ marginTop: 12 }}>Last measured {fmt.ddm(last.tape.date)}.</p>}
      <Button size="card" style={{ marginTop: 16 }} disabled={empty || busy} onClick={() => { onSave(p); setLbs(''); setWaist(0); setHip(0); }}>Save measurements</Button>
    </>
  );
}
