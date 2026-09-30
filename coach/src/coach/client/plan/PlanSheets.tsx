import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import type { ReplaceOffer, ReplaceRefusal } from '@engine';
import { Button, Chip, Field, Icon, Notice, RowButton, SearchSheet, Seg, Sheet, Stepper, Switch } from '@/components/ui';
import { addDays, fmt, startOfWeek } from '@/lib/format';
import {
  bwRounded, goalMacroGrams, shares, slidersFromGoal, CARB_DEFAULT, CARB_MAX, CARB_MIN, MACRO_COLOURS, PROTEIN_DEFAULT, PROTEIN_MAX, PROTEIN_MIN, PROTEIN_STEP,
} from '@/plan/macros';
import {
  endOf, isMonday, nextPhaseDates, overlappingGoal, phaseName, totalWeeks,
  type GoalInput, type GoalType, type NewCycleInput, type PlanDoc, type PlanGoal, type SettingsPatch,
} from '@/plan/doc';
import type { PlanDiff } from '@/plan/diff';
import type { PreviewBlock } from '@/plan/volume';
import type { Template } from '@/plan/templates';
import type { PlanCycle } from './usePlan';

const GOALS: { value: GoalType; label: string }[] = [{ value: 'loss', label: 'Lose' }, { value: 'gain', label: 'Gain' }, { value: 'maintenance', label: 'Maintain' }];
const nextMonday = (today: string) => { const m = startOfWeek(today); return m > today || m === today ? (m === today ? addDays(m, 7) : m) : addDays(m, 7); };

/** "Mon 5 Oct", or a note when the date isn't a Monday (cycles start on Mondays, as in BLOC). */
function MondayHint({ date }: { date: string }) {
  if (!date) return null;
  return isMonday(date) ? <>{fmt.ddm(date)}</> : <span className="t-bad">Cycles start on a Monday.</span>;
}

// ---------------------------------------------------------------- goal phase

/**
 * A goal phase: BLOC's Goal Period sheet (index.html modal-add-goal): name,
 * dates, daily kcal and steps, then protein per lb of bodyweight and the
 * carb/fat split of what's left, as sliders beside the pie. A phase that has
 * already started keeps its saved macros unless a slider is moved (BLOC's
 * rule, so re-opening one never drifts its targets).
 */
export function GoalSheet({ open, doc, goal, others, bodyweight, today, onClose, onSave, onRemove }: {
  open: boolean; doc: PlanDoc; goal: PlanGoal | null; others: { startDate: string; endDate: string; _blocLabel?: unknown }[]; bodyweight: number | null; today: string;
  onClose: () => void; onSave: (id: string | null, g: GoalInput) => void; onRemove: (id: string) => void;
}) {
  const id = useId();
  const bw = bwRounded(bodyweight);
  const [g, setG] = useState({ label: '', startDate: '', endDate: '', kcal: '' as number | '', steps: '' as number | '' });
  const [sl, setSl] = useState({ proteinMult: PROTEIN_DEFAULT, carbPct: CARB_DEFAULT });
  const [touched, setTouched] = useState(false);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (!open) return;
    setConfirm(false); setTouched(false);
    if (goal) {
      setG({ label: phaseName(goal), startDate: goal.startDate, endDate: goal.endDate, kcal: goal.kcal || '', steps: goal.steps || '' });
      setSl(slidersFromGoal(bw, goal));
    } else {
      const last = doc.goals[doc.goals.length - 1];
      setG({ label: '', ...nextPhaseDates(doc), kcal: last?.kcal || '', steps: last?.steps || '' });
      setSl(slidersFromGoal(bw, last ? { kcal: last.kcal, protein: last.protein, carbs: last.carbs } : null));
    }
  }, [open, goal, doc, bw]);
  const set = <K extends keyof typeof g>(k: K, v: (typeof g)[K]) => setG((x) => ({ ...x, [k]: v }));
  const kcal = Number(g.kcal) || 0;
  const m = goalMacroGrams(bw, kcal, sl.proteinMult, sl.carbPct);
  const locked = !!goal && goal.startDate <= today && !touched;
  const grams = locked ? { p: goal!.protein, c: goal!.carbs, f: goal!.fats } : { p: m.proteinG, c: m.carbG, f: m.fatG };
  const pct = shares(grams.p, grams.c, grams.f);
  const clash = g.startDate && g.endDate ? overlappingGoal(doc, g.startDate, g.endDate, goal?.macroGoalID ?? null, others) : null;
  const end = endOf(doc.macro);
  const outside = g.startDate && (g.startDate < doc.macro.start || g.endDate > end);
  const ok = g.startDate && g.endDate && g.endDate >= g.startDate && !clash && kcal > 0 && g.steps !== '';
  const touch = (next: Partial<typeof sl>) => { setTouched(true); setSl((x) => ({ ...x, ...next })); };
  return (
    <Sheet open={open} title={goal ? 'Edit Goal Period' : 'New Goal Period'} onClose={onClose}>
      <Field label="Macrocycle" htmlFor={`${id}-m`}><input id={`${id}-m`} className="input" value={doc.macro.name} readOnly aria-readonly="true" /></Field>
      <Field label="Goal name (optional)" htmlFor={`${id}-n`}><input id={`${id}-n`} className="input" value={g.label} onChange={(e) => set('label', e.target.value)} placeholder="e.g. Hard Cut Start" /></Field>
      <div className="tiles-2" style={{ marginTop: 16 }}>
        <Field label="Start date" htmlFor={`${id}-s`}><input id={`${id}-s`} type="date" className="input num" value={g.startDate} onChange={(e) => set('startDate', e.target.value)} /></Field>
        <Field label="End date" htmlFor={`${id}-e`}><input id={`${id}-e`} type="date" className="input num" min={g.startDate} value={g.endDate} onChange={(e) => set('endDate', e.target.value)} /></Field>
      </div>
      {clash && <p className="caption t-bad" style={{ marginTop: 6 }}>Overlaps an existing goal period ({fmt.range(clash.startDate, clash.endDate)}). Adjust the dates to continue.</p>}
      {!clash && outside && <p className="caption" style={{ marginTop: 6 }}>Runs outside the cycle ({fmt.range(doc.macro.start, end)}).</p>}
      <div className="tiles-2" style={{ marginTop: 16 }}>
        <Field label="Daily kcal" htmlFor={`${id}-k`}><input id={`${id}-k`} type="number" inputMode="decimal" className="input num" placeholder="2000" value={g.kcal} onChange={(e) => set('kcal', e.target.value === '' ? '' : parseInt(e.target.value) || 0)} /></Field>
        <Field label="Daily steps" htmlFor={`${id}-st`}><input id={`${id}-st`} type="number" inputMode="numeric" className="input num" placeholder="10000" value={g.steps} onChange={(e) => set('steps', e.target.value === '' ? '' : parseInt(e.target.value) || 0)} /></Field>
      </div>
      <div className="macro-cols">
        <div className="macro-cols-left">
          <MacroSlider letter="P" name="Protein" colour={MACRO_COLOURS.protein} min={PROTEIN_MIN} max={PROTEIN_MAX} step={PROTEIN_STEP} value={sl.proteinMult}
            above={`${grams.p}g`} below={`${pct.protein}%`} onChange={(v) => touch({ proteinMult: v })} />
          <div className="macro-sub">{(locked ? grams.p / bw : sl.proteinMult).toFixed(2)} g per lb bodyweight</div>
          <MacroSlider letter="C" name="Carbs" colour={MACRO_COLOURS.carbs} min={CARB_MIN} max={CARB_MAX} step={1} value={sl.carbPct}
            above={`${grams.c}g`} below={`${pct.carbs}%`} onChange={(v) => touch({ carbPct: v })} />
          <MacroSlider letter="F" name="Fats" colour={MACRO_COLOURS.fats} min={100 - CARB_MAX} max={100 - CARB_MIN} step={1} value={100 - sl.carbPct}
            above={`${grams.f}g`} below={`${pct.fats}%`} onChange={(v) => touch({ carbPct: 100 - v })} />
        </div>
        <div className="macro-cols-right">
          <MacroPie p={grams.p} c={grams.c} f={grams.f} />
          <div className="macro-legend">
            {([['Protein', MACRO_COLOURS.protein, pct.protein], ['Carbs', MACRO_COLOURS.carbs, pct.carbs], ['Fats', MACRO_COLOURS.fats, pct.fats]] as const)
              .map(([n, c, v]) => <div key={n}><span className="macro-dot" style={{ background: c }} />{n} {v}%</div>)}
          </div>
        </div>
      </div>
      <Button style={{ marginTop: 16 }} disabled={!ok} onClick={() => onSave(goal?.macroGoalID ?? null, {
        label: g.label, startDate: g.startDate, endDate: g.endDate, kcal, steps: Number(g.steps) || 0, protein: grams.p, carbs: grams.c, fats: grams.f,
      })}>Save Goal Period →</Button>
      {goal && (!confirm
        ? <Button variant="danger" style={{ marginTop: 8 }} onClick={() => setConfirm(true)}>Delete Goal Period</Button>
        : <Button variant="danger" icon="trash" style={{ marginTop: 8 }} onClick={() => onRemove(goal.macroGoalID)}>Delete {phaseName(goal) || 'it'} for good</Button>)}
    </Sheet>
  );
}

/** One BLOC macro slider: the letter, the track in the macro's colour, grams above the thumb and the calorie share below. */
function MacroSlider({ letter, name, colour, min, max, step, value, above, below, onChange }: {
  letter: string; name: string; colour: string; min: number; max: number; step: number; value: number; above: string; below: string; onChange: (v: number) => void;
}) {
  const at = max > min ? (value - min) / (max - min) : 0;
  const left = `calc(10px + ${at} * (100% - 20px))`; // 20px thumb, as BLOC's positionSliderTooltip
  return (
    <div className="macro-row">
      <div className="macro-letter" aria-hidden="true">{letter}</div>
      <div className="macro-wrap" style={{ ['--macro-c' as string]: colour }}>
        <div className="macro-tip" style={{ left }}>{above}</div>
        <input type="range" className="macro-slider" min={min} max={max} step={step} value={value} aria-label={`${name}: ${above}, ${below} of calories`}
          onChange={(e) => onChange(parseFloat(e.target.value))} />
        <div className="macro-tip below" style={{ left }}>{below}</div>
      </div>
    </div>
  );
}

function MacroPie({ p, c, f }: { p: number; c: number; f: number }) {
  const segs = [[p * 4, MACRO_COLOURS.protein], [c * 4, MACRO_COLOURS.carbs], [f * 9, MACRO_COLOURS.fats]] as const;
  const total = segs.reduce((a, s) => a + s[0], 0) || 1;
  const r = 40, circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg viewBox="0 0 100 100" width="130" height="130" aria-hidden="true">
      {segs.map(([cal, col], i) => {
        const dash = (cal / total) * circ;
        const el = <circle key={i} cx="50" cy="50" r={r} fill="none" style={{ stroke: col }} strokeWidth="16" strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={-offset} transform="rotate(-90 50 50)" />;
        offset += dash;
        return el;
      })}
    </svg>
  );
}

// ---------------------------------------------------------------- new / edit cycle

/** BLOC's New Macrocycle: name, start (a Monday), mesocycles and their length, type, increment, goal line and weight, split, microcycles; effort ratings on for a coach's cycle. */
export function NewCycleSheet({ open, today, defaultStart, onClose, onCreate }: {
  open: boolean; today: string; defaultStart: string; onClose: () => void; onCreate: (c: NewCycleInput) => void;
}) {
  const id = useId();
  const init = (): NewCycleInput => ({ name: '', start: defaultStart, weeks: 6, weeksPerMeso: 2, goalType: 'loss', goal: '', targetBw: null, weightIncrement: '2.5', split: 'ppl', useMicrocycles: true, rpe: true });
  const [c, setC] = useState<NewCycleInput>(init);
  const [custom, setCustom] = useState<string[]>(['Session 1', 'Session 2', 'Session 3']);
  const [split, setSplit] = useState<'ppl' | 'custom' | 'fullbody'>('ppl');
  useEffect(() => { if (open) { setC(init()); setSplit('ppl'); setCustom(['Session 1', 'Session 2', 'Session 3']); } }, [open, defaultStart]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = <K extends keyof NewCycleInput>(k: K, v: NewCycleInput[K]) => setC((x) => ({ ...x, [k]: v }));
  const weeks = c.weeks * c.weeksPerMeso;
  const ok = c.name.trim() && isMonday(c.start) && (split === 'ppl' || custom.some((s) => s.trim()));
  return (
    <Sheet open={open} title="New cycle" onClose={onClose}>
      <Field label="Name" htmlFor={`${id}-n`}><input id={`${id}-n`} className="input" value={c.name} placeholder="e.g. Winter build" onChange={(e) => set('name', e.target.value)} /></Field>
      <div className="tiles-2" style={{ marginTop: 16 }}>
        <Field label="Starts (a Monday)" htmlFor={`${id}-s`} hint={<MondayHint date={c.start} />}>
          <input id={`${id}-s`} type="date" className="input num" value={c.start} onChange={(e) => set('start', e.target.value)} />
        </Field>
        <Field label="Mesocycles"><Stepper label="mesocycles" value={c.weeks} min={1} max={52} onChange={(n) => set('weeks', n)} /></Field>
      </div>
      <Field label="Weeks per mesocycle">
        <Seg<'1' | '2'> label="Weeks per mesocycle" value={String(c.weeksPerMeso) as '1' | '2'} onChange={(x) => set('weeksPerMeso', Number(x))} options={[{ value: '1', label: '1 week' }, { value: '2', label: '2 weeks' }]} />
      </Field>
      <p className="caption" style={{ marginTop: 6 }}>{weeks} weeks{c.start && isMonday(c.start) ? `, ${fmt.range(c.start, addDays(c.start, weeks * 7 - 1))}` : ''}.{c.start && c.start < today ? ' It starts in the past.' : ''}</p>
      <Field label="Goal"><Seg<GoalType> label="Goal" value={c.goalType} onChange={(g) => set('goalType', g)} options={GOALS} /></Field>
      <div className="tiles-2" style={{ marginTop: 16 }}>
        <Field label="Goal weight lbs" htmlFor={`${id}-bw`}><input id={`${id}-bw`} type="number" inputMode="decimal" step={0.1} className="input num" value={c.targetBw ?? ''} placeholder="optional" onChange={(e) => set('targetBw', e.target.value ? parseFloat(e.target.value) : null)} /></Field>
        <Field label="Increment kg" htmlFor={`${id}-inc`}><input id={`${id}-inc`} type="number" inputMode="decimal" step={0.25} min={0.25} max={10} className="input num" value={c.weightIncrement} onChange={(e) => set('weightIncrement', e.target.value)} /></Field>
      </div>
      <Field label="Goal line (optional)" htmlFor={`${id}-g`}><input id={`${id}-g`} className="input" value={c.goal} placeholder="e.g. Cut to 200lbs" onChange={(e) => set('goal', e.target.value)} /></Field>
      <Field label="Training split">
        <Seg<'ppl' | 'custom' | 'fullbody'> label="Training split" value={split} onChange={setSplit} options={[{ value: 'ppl', label: 'Push/Pull/Legs' }, { value: 'fullbody', label: 'Full body' }, { value: 'custom', label: 'Custom' }]} />
      </Field>
      {split !== 'ppl' && (
        <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
          {custom.map((s, i) => (
            <div key={i} className="inrow">
              <input className="input" aria-label={`Session ${i + 1} name`} value={s} onChange={(e) => setCustom(custom.map((x, j) => (j === i ? e.target.value : x)))} />
              {custom.length > 1 && <button type="button" className="icon-btn" aria-label={`Remove session ${i + 1}`} onClick={() => setCustom(custom.filter((_, j) => j !== i))}><Icon name="close" size={18} /></button>}
            </div>
          ))}
          <Button variant="ghost" size="card" icon="plus" onClick={() => setCustom([...custom, `Session ${custom.length + 1}`])}>Add session</Button>
        </div>
      )}
      <Field label="Microcycles">
        <Seg<'yes' | 'no'> label="Microcycles" value={c.useMicrocycles ? 'yes' : 'no'} onChange={(x) => set('useMicrocycles', x === 'yes')} options={[{ value: 'yes', label: 'Use microcycles' }, { value: 'no', label: 'None' }]} />
      </Field>
      <p className="caption" style={{ marginTop: 6 }}>{c.useMicrocycles ? 'Two versions of each session (M1 and M2), with slightly varied exercises.' : 'The same sessions every week.'}</p>
      <RpeRow value={c.rpe} onChange={(v) => set('rpe', v)} />
      <Button style={{ marginTop: 18 }} disabled={!ok} onClick={() => onCreate({ ...c, split: split === 'ppl' ? 'ppl' : { kind: split, sessions: custom } })}>Create draft cycle</Button>
    </Sheet>
  );
}

function RpeRow({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="tile" style={{ marginTop: 16, display: 'flex', gap: 14, alignItems: 'center' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <b style={{ fontSize: 14.5 }}>Effort ratings (RPE)</b>
        <div className="caption" style={{ marginTop: 3, lineHeight: 1.4 }}>{value ? 'The client rates each session 1–10. Review reads it with compliance; it never changes their targets.' : 'Off. No ratings, and Review has no Effort section for this cycle.'}</div>
      </div>
      <Switch checked={value} onChange={onChange} label="Effort ratings (RPE)" />
    </div>
  );
}

/** Edit cycle (BLOC's): name, start, length, type, increment, goal line and weight, and effort ratings. A new start moves the goal phases with it. */
export function EditCycleSheet({ open, doc, started, onClose, onSave }: { open: boolean; doc: PlanDoc; started: boolean; onClose: () => void; onSave: (p: SettingsPatch) => void }) {
  const id = useId();
  const m = doc.macro;
  const [p, setP] = useState<Required<SettingsPatch>>({ name: m.name, goal: m.goal, targetBw: m.targetBw, goalType: m.goalType, weightIncrement: m.weightIncrement, rpe: m.rpe, start: m.start, weeks: m.weeks, weeksPerMeso: m.weeksPerMeso });
  useEffect(() => { if (open) setP({ name: m.name, goal: m.goal, targetBw: m.targetBw, goalType: m.goalType, weightIncrement: m.weightIncrement, rpe: m.rpe, start: m.start, weeks: m.weeks, weeksPerMeso: m.weeksPerMeso }); }, [open, m]);
  const set = <K extends keyof SettingsPatch>(k: K, v: Required<SettingsPatch>[K]) => setP((x) => ({ ...x, [k]: v }));
  const ok = p.name.trim() && isMonday(p.start);
  return (
    <Sheet open={open} title="Edit cycle" onClose={onClose}>
      <Field label="Name" htmlFor={`${id}-n`}><input id={`${id}-n`} className="input" value={p.name} onChange={(e) => set('name', e.target.value)} /></Field>
      <div className="tiles-2" style={{ marginTop: 16 }}>
        <Field label="Starts (a Monday)" htmlFor={`${id}-s`} hint={<MondayHint date={p.start} />}><input id={`${id}-s`} type="date" className="input num" value={p.start} onChange={(e) => set('start', e.target.value)} /></Field>
        <Field label="Mesocycles"><Stepper label="mesocycles" value={p.weeks} min={1} max={52} onChange={(n) => set('weeks', n)} /></Field>
      </div>
      {p.start !== m.start && doc.goals.length > 0 && <p className="caption" style={{ marginTop: 6 }}>The {doc.goals.length} goal phase{doc.goals.length === 1 ? '' : 's'} move with it.</p>}
      <Field label="Weeks per mesocycle">
        <Seg<'1' | '2'> label="Weeks per mesocycle" value={String(p.weeksPerMeso) as '1' | '2'} onChange={(x) => set('weeksPerMeso', Number(x))} options={[{ value: '1', label: '1 week' }, { value: '2', label: '2 weeks' }]} />
      </Field>
      {started && p.weeksPerMeso !== m.weeksPerMeso && <p className="caption t-amber" style={{ marginTop: 6 }}>The cycle has started: this renumbers its weeks from the start.</p>}
      <Field label="Goal"><Seg<GoalType> label="Goal" value={p.goalType} onChange={(g) => set('goalType', g)} options={GOALS} /></Field>
      <div className="tiles-2" style={{ marginTop: 16 }}>
        <Field label="Goal weight lbs" htmlFor={`${id}-bw`}><input id={`${id}-bw`} type="number" inputMode="decimal" step={0.1} className="input num" value={p.targetBw ?? ''} onChange={(e) => set('targetBw', e.target.value ? parseFloat(e.target.value) : null)} /></Field>
        <Field label="Increment kg" htmlFor={`${id}-inc`}><input id={`${id}-inc`} type="number" inputMode="decimal" step={0.25} className="input num" value={p.weightIncrement} onChange={(e) => set('weightIncrement', e.target.value)} /></Field>
      </div>
      <Field label="Goal line (optional)" htmlFor={`${id}-g`}><input id={`${id}-g`} className="input" value={p.goal} onChange={(e) => set('goal', e.target.value)} /></Field>
      <RpeRow value={p.rpe} onChange={(v) => set('rpe', v)} />
      <Button style={{ marginTop: 18 }} disabled={!ok} onClick={() => onSave({ ...p, name: p.name.trim(), goal: p.goal.trim() })}>Save cycle</Button>
    </Sheet>
  );
}

/** Extend (BLOC's): weeks added at the end, repeating the final mesocycle at peak sets. 0 removes the extension. */
export function ExtendSheet({ open, doc, onClose, onSave }: { open: boolean; doc: PlanDoc; onClose: () => void; onSave: (weeks: number) => void }) {
  const [w, setW] = useState(doc.macro.extensionWeeks || 2);
  useEffect(() => { if (open) setW(doc.macro.extensionWeeks || 2); }, [open, doc]);
  const base = { ...doc.macro, extensionWeeks: 0 };
  return (
    <Sheet open={open} title={doc.macro.extensionWeeks ? 'Change the extension' : 'Extend cycle'} onClose={onClose}>
      <Field label={`Weeks added to ${doc.macro.name}`} hint={`Ends ${fmt.ddm(endOf({ ...doc.macro, extensionWeeks: w }))} instead of ${fmt.ddm(endOf(base))}. The extra weeks repeat the final mesocycle at peak sets.`}>
        <Stepper label="weeks" value={w} min={1} max={16} onChange={setW} format={(n) => `${n} week${n === 1 ? '' : 's'}`} />
      </Field>
      <Button style={{ marginTop: 22 }} onClick={() => onSave(w)}>Extend by {w} week{w === 1 ? '' : 's'}</Button>
      {!!doc.macro.extensionWeeks && <Button variant="danger" size="card" style={{ marginTop: 10 }} onClick={() => onSave(0)}>Remove the extension</Button>}
    </Sheet>
  );
}

// ---------------------------------------------------------------- a session's actions

export function SessionSheet({ open, label, micro, canRemove, onClose, onRename, onCopy, onApplyWorkout, onSaveWorkout, onRemove }: {
  open: boolean; label: string; micro: 0 | 1 | 2; canRemove: boolean; onClose: () => void;
  onRename: (s: string) => void; onCopy: () => void; onApplyWorkout: () => void; onSaveWorkout: () => void; onRemove: () => void;
}) {
  const [name, setName] = useState(label);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { if (open) { setName(label.replace(/ · M[12]$/, '')); setConfirm(false); } }, [open, label]);
  return (
    <Sheet open={open} title={label} onClose={onClose}>
      <Field label="Session name">
        <div className="inrow"><input className="input" value={name} aria-label="Session name" onChange={(e) => setName(e.target.value)} />
          <Button size="sm" disabled={!name.trim() || name.trim() === label.replace(/ · M[12]$/, '')} onClick={() => onRename(name)}>Rename</Button></div>
      </Field>
      <div className="card" style={{ padding: '4px 16px', marginTop: 18 }}>
        {micro > 0 && <RowButton title={`Copy from Microcycle ${micro === 1 ? 2 : 1}`} sub={`Replaces this session’s M${micro} exercises with M${micro === 1 ? 2 : 1}’s`} trailing="copy" onClick={onCopy} />}
        <RowButton title="Fill from a workout template" sub="Replaces this session’s exercises" trailing="library" onClick={onApplyWorkout} />
        <RowButton title="Save as a workout template" sub="Save this session to the Library, without dates" trailing="library" onClick={onSaveWorkout} />
        {canRemove && (!confirm
          ? <RowButton title="Remove this session" sub="From every week of the cycle" trailing="trash" onClick={() => setConfirm(true)} />
          : <div style={{ padding: '12px 0' }}><Button variant="danger" size="card" icon="trash" onClick={onRemove}>Remove {label.replace(/ · M[12]$/, '')}{micro ? ' (M1 and M2)' : ''}</Button></div>)}
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- choose cycle

export function ChooseCycleSheet({ open, cycles, current, first, onClose, onPick, onNew }: { open: boolean; cycles: PlanCycle[]; current: string | null; first: string; onClose: () => void; onPick: (id: string) => void; onNew: () => void }) {
  return (
    <Sheet open={open} title="Choose cycle" onClose={onClose}>
      {[...cycles].reverse().map((c) => {
        const on = c.id === current;
        const chip: [string, string] = c.isNew ? ['acc', 'Draft'] : !c.coachOwned ? ['amber', `${first}’s own`] : c.status === 'past' ? ['neutral', 'Past'] : c.status === 'upcoming' ? ['acc', 'Upcoming'] : ['good', 'Active'];
        return (
          <button key={c.id} type="button" className="card" aria-pressed={on} onClick={() => onPick(c.id)}
            style={{ width: '100%', textAlign: 'left', marginBottom: 10, cursor: 'pointer', borderColor: on ? 'var(--accent)' : undefined, display: 'block' }}>
            <div className="row top-align">
              <div style={{ minWidth: 0 }}>
                <div className="display" style={{ fontSize: 17 }}>{c.name}</div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{fmt.range(c.start, c.end)}{c.draft && !c.isNew ? ' · unpublished changes' : ''}</div>
              </div>
              <Chip tone={chip[0] as 'good'}>{chip[1]}</Chip>
            </div>
          </button>
        );
      })}
      <Button variant="ghost" icon="plus" onClick={onNew}>New cycle</Button>
    </Sheet>
  );
}

// ---------------------------------------------------------------- progression preview

export function PreviewSheet({ open, blocks, onClose }: { open: boolean; blocks: PreviewBlock[]; onClose: () => void }) {
  return (
    <Sheet open={open} title="Progression preview" onClose={onClose}>
      {blocks.map((b) => (
        <div key={b.label} style={{ marginBottom: 18 }}>
          <span className="label">{b.label}</span>
          <div className="card list">
            {b.exercises.map((e) => (
              <div key={e.name} style={{ padding: '10px 0', borderTop: '1px solid var(--divider)' }}>
                <b style={{ fontSize: 14.5 }}>{e.name}</b>
                {e.weeks.map((w) => <div key={w.week} className="row num" style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}><span>Week {w.week}</span><span style={{ whiteSpace: 'nowrap' }}>{w.text}</span></div>)}
              </div>
            ))}
          </div>
        </div>
      ))}
    </Sheet>
  );
}

// ---------------------------------------------------------------- templates

/** Picking a Library template: a search over the coach's templates of one kind. */
export function TemplatePicker({ open, kind, templates, onClose, onPick, title }: { open: boolean; kind: Template['kind']; templates: Template[]; onClose: () => void; onPick: (t: Template) => void; title?: string }) {
  const [q, setQ] = useState('');
  useEffect(() => { if (open) setQ(''); }, [open]);
  const list = useMemo(() => templates.filter((t) => t.kind === kind && (!q.trim() || t.name.toLowerCase().includes(q.trim().toLowerCase())))
    .sort((a, b) => Number(b.starred) - Number(a.starred) || b.appliedLast90 - a.appliedLast90 || a.name.localeCompare(b.name)), [templates, kind, q]);
  return (
    <SearchSheet open={open} title={title ?? (kind === 'macrocycle' ? 'Apply a cycle template' : 'Apply a workout template')} onClose={onClose} query={q} onQuery={setQ} placeholder="Search templates">
      {list.map((t) => (
        <button key={t.id} type="button" className="ss-row" onClick={() => onPick(t)}>
          <span className="main"><b>{t.starred ? '★ ' : ''}{t.name}</b><small>{t.summary}</small></span>
          <span style={{ color: 'var(--text3)' }}><Icon name="chevR" size={18} /></span>
        </button>
      ))}
      {!list.length && <p className="muted" style={{ padding: '14px 0' }}>{q ? 'No template matches.' : `No ${kind === 'macrocycle' ? 'cycle' : 'workout'} templates yet. ${kind === 'workout' ? 'Build one in Library → New workout, or save' : 'Save'} one from a client’s Plan.`}</p>}
    </SearchSheet>
  );
}

/** The start date for a cycle template: the day after the running cycle ends, else next Monday (§11 Q17). */
export function ApplyCycleSheet({ open, template, defaultStart, first, onClose, onApply }: { open: boolean; template: Template | null; defaultStart: string; first: string; onClose: () => void; onApply: (start: string, name: string) => void }) {
  const id = useId();
  const [start, setStart] = useState(defaultStart);
  const [name, setName] = useState('');
  useEffect(() => { if (open && template) { setStart(defaultStart); setName(template.body.kind === 'macrocycle' ? template.body.macro.name : template.name); } }, [open, template, defaultStart]);
  if (!template || template.body.kind !== 'macrocycle') return null;
  const weeks = template.body.macro.weeks * template.body.macro.weeksPerMeso + (template.body.macro.extensionWeeks || 0);
  return (
    <Sheet open={open} title={`Apply ${template.name}`} onClose={onClose}>
      <p className="muted" style={{ marginBottom: 14 }}>{template.summary}</p>
      <Field label="Cycle name" htmlFor={`${id}-n`}><input id={`${id}-n`} className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Starts (a Monday)" htmlFor={`${id}-s`} hint={isMonday(start) ? `Runs ${fmt.range(start, addDays(start, weeks * 7 - 1))} · ${weeks} weeks` : <MondayHint date={start} />}>
        <input id={`${id}-s`} type="date" className="input num" value={start} onChange={(e) => setStart(e.target.value)} />
      </Field>
      <Notice icon="copy" title={`${first} gets their own fresh copy`} style={{ marginTop: 18 }}>Editing it never changes the template or anyone else’s copy. It stays a draft until you publish.</Notice>
      <Button style={{ marginTop: 18 }} disabled={!isMonday(start) || !name.trim()} onClick={() => onApply(start, name)}>Apply to {first}</Button>
    </Sheet>
  );
}

export function SaveTemplateSheet({ open, kind, defaultName, summary, onClose, onSave }: { open: boolean; kind: Template['kind']; defaultName: string; summary: string; onClose: () => void; onSave: (name: string) => Promise<void> }) {
  const id = useId();
  const [name, setName] = useState(defaultName);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (open) { setName(defaultName); setErr(null); setBusy(false); } }, [open, defaultName]);
  return (
    <Sheet open={open} title={kind === 'macrocycle' ? 'Save cycle as a template' : 'Save session as a template'} onClose={onClose}>
      <Field label="Template name" htmlFor={`${id}-n`}><input id={`${id}-n`} className="input" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <p className="body-copy" style={{ marginTop: 12 }}>{summary}</p>
      <p className="caption" style={{ marginTop: 8 }}>Saved without dates. {kind === 'macrocycle' ? 'Sessions, exercises, deloads and goal phase lengths come across.' : 'Its exercises and supersets come across.'} The client’s logs stay with the client.</p>
      {err && <p className="caption t-bad" style={{ marginTop: 8 }}>{err}</p>}
      <Button style={{ marginTop: 18 }} icon="library" disabled={!name.trim() || busy} onClick={async () => {
        setBusy(true);
        try { await onSave(name.trim()); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
      }}>{busy ? 'Saving…' : 'Save to Library'}</Button>
    </Sheet>
  );
}

// ---------------------------------------------------------------- publish

/**
 * Publish: every change, grouped, then how it reaches the client. An overlap
 * with the client's own running cycle is a replace they're asked to accept
 * (BLOC v8.45, §143); any other overlap can't be published, and the first
 * start that would work is offered.
 */
export function PublishSheet({ open, diff, first, save, overlap, today, busy, error, onClose, onPublish, onMoveStart }: {
  open: boolean; diff: PlanDiff | null; first: string; save: boolean; overlap: ReplaceOffer | ReplaceRefusal | null; today: string;
  busy: boolean; error: string | null; onClose: () => void; onPublish: () => void; onMoveStart: (start: string) => void;
}) {
  if (!diff) return null;
  const blocked = overlap?.kind === 'blocked';
  const replace = overlap?.kind === 'replace' ? overlap : null;
  const why: Record<string, string> = {
    'coach-cycle': 'another of your cycles for them',
    'not-running': `${first}’s own cycle, which isn’t running yet`,
    'other-clash': 'more than one cycle',
    'not-monday': `${first}’s own cycle, and a replace has to start on a Monday`,
    'too-soon': `${first}’s own cycle, and a replace has to start after ${fmt.ddm(today)}`,
    'mid-meso': `${first}’s own cycle part-way through one of its mesocycles`,
  };
  let foot: ReactNode;
  if (blocked) {
    const b = overlap as ReplaceRefusal;
    foot = (
      <Notice tone="bad" icon="warning" title={`Overlaps “${String((b.clash as { name?: unknown }).name ?? 'a cycle')}”`}>
        It would overlap {why[b.reason] ?? 'another cycle'}. Cycles can’t overlap.
        {b.suggest && <div style={{ marginTop: 10 }}><Button size="sm" onClick={() => onMoveStart(b.suggest!)}>Start {fmt.ddm(b.suggest)} instead</Button></div>}
      </Notice>
    );
  } else if (replace) {
    foot = (
      <Notice tone="amber" icon="swap" title={`Replaces ${first}’s own cycle`}>
        “{String((replace.clash as { name?: unknown }).name ?? 'Their cycle')}” is running. {first} is asked on their phone to end it early, on {fmt.ddm(replace.newEnd)} instead of {fmt.ddm(replace.oldEnd)}.
        {replace.trimGoals.length > 0 && ` The goal phase running then ends with it.`}
        {replace.removeGoals.length > 0 && ` ${replace.removeGoals.length} later goal phase${replace.removeGoals.length === 1 ? ' is' : 's are'} removed.`}
        {' '}Nothing changes until they agree; if they keep their cycle, you’ll see it here and can start this after it.
      </Notice>
    );
  }
  return (
    <Sheet open={open} title={save ? 'Save plan changes' : 'Publish changes'} onClose={onClose}>
      <p className="muted" style={{ marginBottom: 16 }}>{diff.count} change{diff.count === 1 ? '' : 's'}. {save ? `${first} isn’t on the app: they apply to the sessions you log in person.` : `${first} sees none of them until you publish.`}</p>
      {diff.groups.map((g) => (
        <div key={g.title} style={{ marginBottom: 14 }}>
          <span className="label">{g.title}</span>
          <div className="card list">
            {g.lines.map((l, i) => (
              <div key={i} className="ex" style={{ justifyContent: 'flex-start', alignItems: 'flex-start' }}>
                <span style={{ color: 'var(--accent2)', marginTop: 1 }}><Icon name="edit" size={16} /></span>
                <span style={{ color: 'var(--text)', fontSize: 14, whiteSpace: 'normal' }}>{l}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
      {foot && <div style={{ marginBottom: 14 }}>{foot}</div>}
      <div className="tile" style={{ display: 'grid', gap: 10, fontSize: 13, lineHeight: 1.45, color: 'var(--text2)' }}>
        {!diff.groups.some((g) => g.title === 'New cycle') && <div style={{ display: 'flex', gap: 10 }}><span className="t-good"><Icon name="link" size={16} /></span><span>Unchanged exercises keep their identity, so {first}’s logs so far stay attached to the right exercise. A swapped exercise starts its own history.</span></div>}
        {save
          ? <div style={{ display: 'flex', gap: 10 }}><span className="t-acc"><Icon name="lock" size={16} /></span><span>Nothing is sent. If {first} links later, this plan comes across.</span></div>
          : <div style={{ display: 'flex', gap: 10 }}><span className="t-acc"><Icon name="send" size={16} /></span><span>Reaches {first}’s phone within seconds if BLOC is open, otherwise the next time they open it.</span></div>}
        <div style={{ display: 'flex', gap: 10 }}><span className="t-acc"><Icon name="edit" size={16} /></span><span>You can change the plan again at any time.</span></div>
      </div>
      {error && <p className="caption t-bad" style={{ marginTop: 12 }}>{error}</p>}
      <Button style={{ marginTop: 22 }} icon={save ? 'check' : 'send'} disabled={blocked || busy} onClick={onPublish}>
        {busy ? (save ? 'Saving…' : 'Publishing…') : save ? 'Save plan' : `Publish to ${first}`}
      </Button>
    </Sheet>
  );
}

export { totalWeeks, nextMonday };
