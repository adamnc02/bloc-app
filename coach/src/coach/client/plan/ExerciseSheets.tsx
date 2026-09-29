import { useEffect, useId, useMemo, useState, type InputHTMLAttributes } from 'react';
import { Button, Checkbox, Field, Icon, SearchSheet, Seg, Sheet } from '@/components/ui';
import { BODY_PARTS, categoryOf, type LibraryEntry } from '@/plan/library';
import { slotsOf, type ExerciseFields, type PlanExercise, type SetType } from '@/plan/doc';

// BLOC's Add Exercise sheet's choices (index.html modal-exercise).
const REPS = ['5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '25', '30', '35', '40', '45', '50', '60', '70', '80', '90', '100', '110', '120'];
const SETS = Array.from({ length: 15 }, (_, i) => i + 1);
const TYPES: { value: SetType; label: string }[] = [
  { value: 'standard', label: 'Standard' }, { value: 'giant', label: 'Giant set' }, { value: 'pause', label: 'Pause set' }, { value: 'dropset', label: 'Drop set' },
];

/**
 * A number box that keeps what's typed. A plain controlled `value={n}` put the
 * 0 straight back when the box was emptied, so it couldn't be cleared to type
 * a new number. The text is its own state; the number follows it (empty → `empty`).
 */
function NumInput({ value, onValue, empty = 0, ...rest }: { value: number | null | undefined; onValue: (n: number | null) => void; empty?: number | null } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [text, setText] = useState(value == null ? '' : String(value));
  useEffect(() => {
    const cur = text.trim() === '' ? empty : parseFloat(text);
    if (value !== cur && !(value == null && text === '')) setText(value == null ? '' : String(value));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return <input type="number" {...rest} value={text} onChange={(e) => { setText(e.target.value); const n = parseFloat(e.target.value); onValue(e.target.value.trim() === '' || !Number.isFinite(n) ? empty : n); }} />;
}

// ---------------------------------------------------------------- picker

/**
 * Choosing an exercise: BLOC's library, the client's own, and new names
 * (TECHNICAL §144). A search box over a list, so a SearchSheet. For a swap,
 * the planned body part's alternatives come first (as BLOC's Swap for today).
 */
export function ExercisePicker({ open, title, library, category, preferBodyPart, exclude, onClose, onPick }: {
  open: boolean; title: string; library: LibraryEntry[]; category: 'weight' | 'cardio' | null;
  preferBodyPart?: string | null; exclude?: string | null; onClose: () => void; onPick: (e: LibraryEntry) => void;
}) {
  const [q, setQ] = useState('');
  useEffect(() => { if (open) setQ(''); }, [open]);
  const query = q.trim().toLowerCase();
  const list = useMemo(() => library.filter((e) => (!category || categoryOf(e) === category) && e.name !== exclude && (!query || e.name.toLowerCase().includes(query))), [library, category, exclude, query]);
  const groups = useMemo(() => {
    const out: { title: string; items: LibraryEntry[] }[] = [];
    const first = preferBodyPart ? list.filter((e) => e.bodyPart === preferBodyPart) : [];
    if (first.length) out.push({ title: `${preferBodyPart} alternatives`, items: first });
    const rest = list.filter((e) => !first.includes(e));
    for (const e of rest) {
      const t = first.length ? 'Everything else' : e.bodyPart;
      let g = out.find((x) => x.title === t);
      if (!g) out.push((g = { title: t, items: [] }));
      g.items.push(e);
    }
    return out;
  }, [list, preferBodyPart]);
  const exact = library.some((e) => e.name.toLowerCase() === query);
  return (
    <SearchSheet open={open} title={title} onClose={onClose} query={q} onQuery={setQ} placeholder="Search exercises">
      {query && !exact && (
        <button type="button" className="ss-row" onClick={() => onPick({ name: q.trim(), bodyPart: category === 'cardio' ? 'Cardio' : '', category: category ?? 'weight', source: 'coach' })}>
          <span className="icon-tile"><Icon name="plus" size={18} /></span>
          <span className="main"><b>Add “{q.trim()}”</b><small>A new exercise. Pick its body part next.</small></span>
        </button>
      )}
      {groups.map((g) => (
        <div key={g.title}>
          <div className="ss-group">{g.title}</div>
          {g.items.map((e) => (
            <button key={e.name} type="button" className="ss-row" onClick={() => onPick(e)}>
              <span className="main"><b>{e.name}</b><small>{e.bodyPart}{e.source === 'client' ? ' · their library' : e.source === 'coach' ? ' · in this plan' : ''}</small></span>
              <span style={{ color: 'var(--text3)' }}><Icon name="chevR" size={18} /></span>
            </button>
          ))}
        </div>
      ))}
      {!list.length && !query && <p className="muted" style={{ padding: '14px 0' }}>Nothing in the library yet.</p>}
    </SearchSheet>
  );
}

// ---------------------------------------------------------------- editor

export interface ExerciseSheetContext {
  mode: 'add' | 'edit';
  dayKey: string;
  sessionLabel: string;
  exercise?: PlanExercise;
  /** Adding into this superset. */
  intoSuperset?: string | null;
  list: PlanExercise[];
}

const blank = (cat: 'weight' | 'cardio', unit: string): ExerciseFields => ({
  name: '', bodyPart: '', category: cat, type: 'standard', reps: '10', setsStart: 2, setsEnd: 5, startWeight: 0, isHeavyLeg: false, trackingMode: 'total',
  ...(cat === 'cardio' ? { metricType: 'time' as const, targetSeconds: 0, targetDistance: null, distanceUnit: unit, speedLevel: null, resistanceLevel: null, setsStart: 1, setsEnd: 1 } : {}),
});

/**
 * Add or edit an exercise: BLOC's fields (category, exercise, set type, reps,
 * starting weight, starting and peak sets, heavy leg, tracking; cardio's time
 * or distance target and levels), plus its body part. Editing also moves,
 * links, unlinks and removes it.
 */
export function ExerciseSheet({ ctx, library, distanceUnitPref, onClose, onSave, onMove, onLink, onUnlink, onRemove }: {
  ctx: ExerciseSheetContext | null; library: LibraryEntry[]; distanceUnitPref: 'km' | 'mi';
  onClose: () => void; onSave: (f: ExerciseFields) => void;
  onMove: (dir: -1 | 1) => void; onLink: () => void; onUnlink: () => void; onRemove: () => void;
}) {
  const id = useId();
  const [f, setF] = useState<ExerciseFields>(blank('weight', 'km'));
  const [picking, setPicking] = useState(false);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (!ctx) return;
    setConfirm(false);
    if (ctx.exercise) {
      const { id: _i, order: _o, supersetId: _s, supersetOrder: _so, ...own } = ctx.exercise;
      void _i; void _o; void _s; void _so;
      // An older exercise has no body part: the library's for its name, as BLOC's volume table reads it.
      const known = own.category === 'cardio' ? own.bodyPart : own.bodyPart || library.find((e) => e.name.toLowerCase() === String(own.name).toLowerCase())?.bodyPart || '';
      setF({ ...(own as ExerciseFields), bodyPart: known });
      setPicking(false);
    } else {
      setF(blank('weight', distanceUnitPref === 'mi' ? 'mi' : 'km'));
      setPicking(true);
    }
  }, [ctx, distanceUnitPref]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!ctx) return null;
  const set = <K extends keyof ExerciseFields>(k: K, v: ExerciseFields[K]) => setF((x) => ({ ...x, [k]: v }));
  const ex = ctx.exercise;
  const inSs = !!(ex?.supersetId || ctx.intoSuperset);
  const members = ex?.supersetId ? ctx.list.filter((e) => e.supersetId === ex.supersetId).sort((a, b) => (a.supersetOrder || 0) - (b.supersetOrder || 0)) : [];
  const nonLeader = members.length > 0 && members[0].id !== ex?.id;
  const slots = slotsOf(ctx.list);
  const slotIdx = ex ? slots.findIndex((s) => s.some((e) => e.id === ex.id)) : -1;
  const pos = ex?.supersetId ? members.findIndex((e) => e.id === ex.id) : slotIdx;
  const posMax = ex?.supersetId ? members.length - 1 : slots.length - 1;
  const cardio = f.category === 'cardio';
  const known = library.some((e) => e.name.toLowerCase() === f.name.trim().toLowerCase() && e.bodyPart && e.bodyPart !== 'Other');
  const giant = !cardio && f.type === 'giant';
  const ok = f.name.trim() && (cardio || f.bodyPart) && (!cardio || (f.metricType === 'distance' ? (f.targetDistance ?? 0) > 0 : (f.targetSeconds ?? 0) > 0));
  const repOptions = REPS.includes(f.reps) || !f.reps ? REPS : [f.reps, ...REPS];

  return (
    <>
      <Sheet open={!!ctx && !picking} title={ctx.mode === 'add' ? 'Add exercise' : 'Edit exercise'} onClose={onClose}>
        <p className="muted" style={{ marginBottom: 14 }}>{ctx.sessionLabel}{inSs ? ' · in a superset' : ''}</p>
        {ctx.mode === 'add' && (
          <Field label="Category">
            <Seg<'weight' | 'cardio'> label="Category" value={f.category} onChange={(c) => { setF(blank(c, distanceUnitPref === 'mi' ? 'mi' : 'km')); setPicking(true); }}
              options={[{ value: 'weight', label: 'Weight' }, { value: 'cardio', label: 'Cardio' }]} />
          </Field>
        )}
        <Field label="Exercise">
          <button type="button" className="input" onClick={() => setPicking(true)} style={{ textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name || 'Choose an exercise'}</span>
            <Icon name="chevR" size={18} />
          </button>
        </Field>
        {!cardio && (
          <>
            {/* Only for a name the library doesn't know: a library exercise brings its own body part. */}
            {!known && <Field label="Body part" htmlFor={`${id}-bp`} hint="A new exercise: which body part it works. Swap for today lists that body part’s exercises first.">
              <select id={`${id}-bp`} className="input" value={f.bodyPart || ''} onChange={(e) => set('bodyPart', e.target.value)}>
                <option value="" disabled>Choose…</option>
                {[...BODY_PARTS, 'Other'].map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </Field>}
            <Field label="Set type" htmlFor={`${id}-t`} hint={f.type === 'dropset' ? 'Reps target the main set; the drop is logged to failure.' : giant ? 'A giant set is one set.' : undefined}>
              <select id={`${id}-t`} className="input" value={f.type} onChange={(e) => {
                const t = e.target.value as SetType;
                setF((x) => ({ ...x, type: t, ...(t === 'giant' ? { setsStart: 1, setsEnd: 1 } : {}) }));
              }}>
                {TYPES.map((t) => <option key={t.value} value={t.value} disabled={t.value === 'dropset' && inSs}>{t.label}{t.value === 'dropset' && inSs ? ' (not in a superset)' : ''}</option>)}
              </select>
            </Field>
            <div className="tiles-2" style={{ marginTop: 16 }}>
              <Field label="Reps (target)" htmlFor={`${id}-r`}>
                <select id={`${id}-r`} className="input num" value={f.reps} onChange={(e) => set('reps', e.target.value)}>
                  {repOptions.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </Field>
              <Field label="Starting kg" htmlFor={`${id}-w`}>
                <NumInput id={`${id}-w`} inputMode="decimal" step={0.5} min={0} className="input num" value={f.startWeight} onValue={(n) => set('startWeight', n ?? 0)} />
              </Field>
            </div>
          </>
        )}
        {cardio && (
          <>
            <Field label="Set target using">
              <Seg<'time' | 'distance'> label="Target" value={f.metricType ?? 'time'} onChange={(m) => setF((x) => ({ ...x, metricType: m }))}
                options={[{ value: 'time', label: 'Time' }, { value: 'distance', label: 'Distance' }]} />
            </Field>
            {(f.metricType ?? 'time') === 'time' ? (
              <div className="tiles-2" style={{ marginTop: 16 }}>
                <Field label="Minutes" htmlFor={`${id}-mn`}>
                  <NumInput id={`${id}-mn`} inputMode="numeric" min={0} className="input num" value={Math.floor((f.targetSeconds ?? 0) / 60)}
                    onValue={(n) => set('targetSeconds', Math.max(0, Math.floor(n ?? 0)) * 60 + ((f.targetSeconds ?? 0) % 60))} />
                </Field>
                <Field label="Seconds" htmlFor={`${id}-sc`}>
                  <NumInput id={`${id}-sc`} inputMode="numeric" min={0} max={59} className="input num" value={(f.targetSeconds ?? 0) % 60}
                    onValue={(n) => set('targetSeconds', Math.floor((f.targetSeconds ?? 0) / 60) * 60 + Math.min(59, Math.max(0, Math.floor(n ?? 0))))} />
                </Field>
              </div>
            ) : (
              <div className="tiles-2" style={{ marginTop: 16 }}>
                <Field label="Distance" htmlFor={`${id}-d`}>
                  <NumInput id={`${id}-d`} inputMode="decimal" step={0.01} min={0} className="input num" value={f.targetDistance} empty={null} onValue={(n) => set('targetDistance', n)} />
                </Field>
                <Field label="Unit" htmlFor={`${id}-u`}>
                  {distanceUnitPref === 'mi'
                    ? <div className="input" style={{ display: 'grid', alignItems: 'center' }}>mi</div>
                    : <select id={`${id}-u`} className="input" value={f.distanceUnit || 'km'} onChange={(e) => set('distanceUnit', e.target.value)}><option value="km">km</option><option value="m">m</option></select>}
                </Field>
              </div>
            )}
            <div className="tiles-2" style={{ marginTop: 16 }}>
              <Field label="Speed (optional)" htmlFor={`${id}-sp`}>
                <input id={`${id}-sp`} type="number" inputMode="decimal" step={0.1} className="input num" value={f.speedLevel ?? ''} onChange={(e) => set('speedLevel', e.target.value === '' ? null : parseFloat(e.target.value))} />
              </Field>
              <Field label="Resistance (optional)" htmlFor={`${id}-rs`}>
                <input id={`${id}-rs`} type="number" inputMode="decimal" step={0.1} className="input num" value={f.resistanceLevel ?? ''} onChange={(e) => set('resistanceLevel', e.target.value === '' ? null : parseFloat(e.target.value))} />
              </Field>
            </div>
          </>
        )}
        <div className="tiles-2" style={{ marginTop: 16, opacity: giant || nonLeader ? 0.45 : 1 }}>
          <Field label="Starting sets" htmlFor={`${id}-s1`}>
            <select id={`${id}-s1`} className="input num" disabled={giant || nonLeader} value={f.setsStart} onChange={(e) => { const n = Number(e.target.value); setF((x) => ({ ...x, setsStart: n, setsEnd: Math.max(n, x.setsEnd) })); }}>
              {SETS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
          <Field label="Peak sets" htmlFor={`${id}-s2`}>
            <select id={`${id}-s2`} className="input num" disabled={giant || nonLeader} value={f.setsEnd} onChange={(e) => set('setsEnd', Number(e.target.value))}>
              {SETS.filter((n) => n >= f.setsStart).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
        </div>
        {nonLeader && <p className="caption" style={{ marginTop: 6 }}>Sets follow {members[0].name}, the superset’s leader.</p>}
        {!cardio && (
          <div className="tiles-2" style={{ marginTop: 16 }}>
            <Field label="Heavy leg" htmlFor={`${id}-l`}>
              <select id={`${id}-l`} className="input" value={f.isHeavyLeg ? '1' : '0'} onChange={(e) => set('isHeavyLeg', e.target.value === '1')}>
                <option value="0">No, light</option><option value="1">Yes, heavy</option>
              </select>
            </Field>
            <Field label="Weight is" htmlFor={`${id}-tr`}>
              <select id={`${id}-tr`} className="input" value={f.trackingMode} onChange={(e) => set('trackingMode', e.target.value as 'total' | 'perSide')}>
                <option value="total">Total</option><option value="perSide">Per side</option>
              </select>
            </Field>
          </div>
        )}
        {!cardio && <p className="caption" style={{ marginTop: 6 }}>Heavy leg jumps 5 kg a mesocycle (10 kg on a gain cycle); per side counts double in volume.</p>}
        <Button style={{ marginTop: 20 }} disabled={!ok} onClick={() => onSave({ ...f, name: f.name.trim() })}>{ctx.mode === 'add' ? 'Add exercise' : 'Save exercise'}</Button>

        {ctx.mode === 'edit' && ex && (
          <div className="card" style={{ marginTop: 18, padding: '4px 16px' }}>
            <div className="row" style={{ padding: '10px 0' }}>
              <span className="muted">{ex.supersetId ? 'Place in the superset' : 'Place in the session'}</span>
              <span style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="icon-btn in-card" aria-label="Move up" disabled={pos <= 0} onClick={() => onMove(-1)} style={{ opacity: pos <= 0 ? 0.4 : 1 }}><Icon name="chevU" size={20} /></button>
                <button type="button" className="icon-btn in-card" aria-label="Move down" disabled={pos >= posMax} onClick={() => onMove(1)} style={{ opacity: pos >= posMax ? 0.4 : 1 }}><Icon name="chevD" size={20} /></button>
              </span>
            </div>
            {ex.type !== 'dropset' && <button type="button" className="rowbtn" onClick={onLink}><span><b>{ex.supersetId ? 'Change the superset' : 'Link into a superset'}</b><small>{ex.supersetId ? 'Add or drop exercises' : 'Pick the exercises to pair it with; this one leads'}</small></span><span className="chev"><Icon name="link" size={20} /></span></button>}
            {ex.supersetId && <button type="button" className="rowbtn" onClick={onUnlink}><span><b>Take out of the superset</b><small>It becomes a separate exercise</small></span><span className="chev"><Icon name="chevR" size={20} /></span></button>}
            {!confirm
              ? <button type="button" className="rowbtn" onClick={() => setConfirm(true)} style={{ color: 'var(--red)' }}><span><b>Remove exercise</b><small>From this session’s plan. Logs already made stay in {`history`}.</small></span><span className="chev" style={{ color: 'var(--red)' }}><Icon name="trash" size={20} /></span></button>
              : <div style={{ padding: '12px 0' }}><Button variant="danger" size="card" icon="trash" onClick={onRemove}>Remove {ex.name}</Button></div>}
          </div>
        )}
      </Sheet>
      <ExercisePicker
        open={!!ctx && picking} title={f.category === 'cardio' ? 'Choose cardio' : 'Choose an exercise'} library={library} category={f.category}
        onClose={() => { if (!f.name) onClose(); else setPicking(false); }}
        onPick={(e) => { setF((x) => ({ ...x, name: e.name, bodyPart: e.bodyPart && e.bodyPart !== 'Cardio' ? e.bodyPart : x.category === 'cardio' ? undefined : '' })); setPicking(false); }}
      />
    </>
  );
}

// ---------------------------------------------------------------- superset link

/** Link exercises into a superset (BLOC's Link exercises): the tapped one leads; drop sets can't join. */
export function LinkSheet({ open, list, leader, onClose, onLink }: { open: boolean; list: PlanExercise[]; leader: PlanExercise | null; onClose: () => void; onLink: (ids: string[]) => void }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!open || !leader) return;
    setSel(new Set(leader.supersetId ? list.filter((e) => e.supersetId === leader.supersetId).map((e) => e.id) : [leader.id]));
  }, [open, leader, list]);
  if (!leader) return null;
  const candidates = slotsOf(list).flat().filter((e) => e.type !== 'dropset');
  return (
    <Sheet open={open} title="Link exercises" onClose={onClose}>
      <p className="muted" style={{ marginBottom: 14 }}>Pick the exercises to do back to back. {leader.name} leads: its sets are the superset’s.</p>
      <div className="card list">
        {candidates.map((e) => (
          <div key={e.id} className="listrow" style={{ cursor: e.id === leader.id ? 'default' : 'pointer' }} onClick={() => {
            if (e.id === leader.id) return;
            const n = new Set(sel);
            if (n.has(e.id)) n.delete(e.id); else n.add(e.id);
            setSel(n);
          }}>
            <Checkbox checked={sel.has(e.id)} onChange={() => {}} label={e.name} />
            <span className="main"><b>{e.name}</b>{e.id === leader.id && <small className="caption"> · leads</small>}</span>
          </div>
        ))}
      </div>
      <Button style={{ marginTop: 18 }} disabled={sel.size < 2} onClick={() => onLink([...sel])}>{sel.size < 2 ? 'Pick at least 2' : `Link ${sel.size} exercises`}</Button>
    </Sheet>
  );
}
