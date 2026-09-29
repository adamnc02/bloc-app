import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { getMacroEffectiveMesoCount, type Macrocycle } from '@engine';
import { Bar, Button, Chip, Icon, IconButton, RowButton, Seg, Tag, useIsTablet, useMediaQuery } from '@/components/ui';
import { addDays, daysBetween, fmt } from '@/lib/format';
import { shortPhaseLabel } from '@/lib/phaseLabel';
import {
  deloadUnits, keyOf, phaseName, slotsOf, supersetBadge, supersetName, totalWeeks,
  type PlanDoc, type PlanExercise, type PlanGoal,
} from '@/plan/doc';
import type { VolumeRow } from '@/plan/volume';
import type { PlanCycle } from './usePlan';

// ---------------------------------------------------------------- hero

/** Mesocycle pills across the cycle, then three figures (BLOC's Plan hero). The card opens Choose cycle. */
export function PlanHero({ doc, cycle, today, first, status, onOpen }: {
  doc: PlanDoc; cycle: PlanCycle; today: string; first: string; status: ReactNode; onOpen: () => void;
}) {
  const m = doc.macro;
  const count = getMacroEffectiveMesoCount(m as unknown as Macrocycle);
  const span = (m.weeksPerMeso || 1) * 7;
  const elapsed = daysBetween(m.start, today);
  const now = elapsed < 0 ? -1 : Math.min(count - 1, Math.floor(elapsed / span));
  const chip: [string, string] = cycle.isNew ? ['acc', 'Draft'] : !cycle.coachOwned ? ['amber', `${first}’s own`] : cycle.status === 'past' ? ['neutral', 'Past'] : cycle.status === 'upcoming' ? ['acc', 'Upcoming'] : ['good', 'Active'];
  return (
    <button type="button" className="hero rise" style={{ ['--i' as string]: 1 }} onClick={onOpen} aria-label={`${m.name}. Switch cycle`}>
      <div className="row">
        <div className="eyebrow">Mesocycles · {m.weeksPerMeso} week{m.weeksPerMeso === 1 ? '' : 's'} each</div>
        <Chip tone={chip[0] as 'good'} icon="chevD">{chip[1]}</Chip>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(count, 8)}, minmax(0, 1fr))`, gap: 6, marginTop: 14, rowGap: 12 }}>
        {Array.from({ length: count }, (_, k) => {
          const on = k === now && cycle.status === 'active';
          const pill: CSSProperties = { height: 10, borderRadius: 5, background: on ? 'var(--accent)' : k < now ? 'color-mix(in srgb, var(--accent) 40%, transparent)' : 'var(--surface3)' };
          return (
            <div key={k} style={{ minWidth: 0 }}>
              <div className={on ? 'pulse' : undefined} style={pill} />
              <div style={{ fontSize: 11.5, fontWeight: 700, marginTop: 8, color: on ? 'var(--accent2)' : 'var(--text2)', whiteSpace: 'nowrap' }}>MC{k + 1}</div>
              <div className="muted" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{fmt.dm(addDays(m.start, k * span))}</div>
            </div>
          );
        })}
      </div>
      <div className="divider" />
      <div className="tiles-3" style={{ textAlign: 'center' }}>
        <HeroStat value={m.targetBw ? String(m.targetBw) : '—'} label="goal lbs" />
        <HeroStat value={String(m.days.length * totalWeeks(m))} label="sessions" />
        <HeroStat value={String(doc.goals.length)} label={`phase${doc.goals.length === 1 ? '' : 's'}`} />
      </div>
      <div className="row" style={{ marginTop: 14, alignItems: 'flex-start' }}>
        <span className="caption" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', whiteSpace: 'nowrap' }}><Icon name="swap" size={14} /> Switch cycle</span>
        <span className="caption" style={{ textAlign: 'right' }}>{status}</span>
      </div>
    </button>
  );
}

function HeroStat({ value, label }: { value: string; label: string }) {
  return <div><div className="num" style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600 }}>{value}</div><div className="muted" style={{ fontSize: 12 }}>{label}</div></div>;
}

// ---------------------------------------------------------------- goal phases

export function PhaseRow({ g, k, currentId, nextId, today, onOpen }: { g: PlanGoal; k: number; currentId?: string; nextId?: string; today: string; onOpen?: () => void }) {
  const state = g.macroGoalID === currentId ? 'now' : g.macroGoalID === nextId ? 'next' : g.endDate < today ? 'past' : 'later';
  const weeks = Math.round((daysBetween(g.startDate, g.endDate) + 1) / 7);
  const dot: CSSProperties = {
    width: 10, height: 10, borderRadius: '50%', display: 'block', marginTop: 5, flexShrink: 0,
    background: state === 'now' ? 'var(--accent)' : state === 'past' ? 'var(--surface3)' : 'transparent',
    border: `2px solid ${state === 'now' || state === 'next' ? 'var(--accent)' : 'color-mix(in srgb, var(--text) 30%, transparent)'}`,
  };
  const inner = (
    <>
      <i style={dot} aria-hidden="true" />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="row">
          <b style={{ fontSize: 15, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{phaseName(g) || g._blocLabel || 'Phase'}</b>
          <span className="num" style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{fmt.int(g.kcal)} <span className="muted" style={{ fontSize: 12, fontWeight: 500 }}>kcal</span></span>
        </span>
        <span className="muted" style={{ fontSize: 12.5, marginTop: 4, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          {fmt.range(g.startDate, g.endDate)} · {weeks} week{weeks === 1 ? '' : 's'}
          {state === 'now' && <Chip tone="good" style={{ fontSize: 10.5, padding: '2px 7px' }}>Now</Chip>}
          {state === 'next' && <Chip tone="acc" style={{ fontSize: 10.5, padding: '2px 7px' }}>Starts in {daysBetween(today, g.startDate)} days</Chip>}
        </span>
        <span className="num caption" style={{ display: 'block', marginTop: 4 }}>P {g.protein}g · C {g.carbs}g · F {g.fats}g · {fmt.int(g.steps)} steps</span>
      </span>
      {onOpen && <span style={{ color: 'var(--text3)', marginTop: 2 }}><Icon name="chevR" size={20} /></span>}
    </>
  );
  const style: CSSProperties = { display: 'flex', gap: 14, padding: '14px 0', width: '100%', textAlign: 'left', background: 'none', border: 0, color: 'var(--text)', borderTop: k ? '1px solid var(--divider)' : 0, cursor: onOpen ? 'pointer' : 'default' };
  return onOpen ? <button type="button" style={style} onClick={onOpen} aria-label={`Edit ${phaseName(g) || 'phase'}`}>{inner}</button> : <div style={style}>{inner}</div>;
}

type StepMetric = 'kcal' | 'steps' | 'carbs' | 'fats';
const METRICS: { key: StepMetric; label: string; unit: string }[] = [
  { key: 'kcal', label: 'Calories', unit: '' }, { key: 'steps', label: 'Steps', unit: '' }, { key: 'carbs', label: 'Carbs', unit: 'g' }, { key: 'fats', label: 'Fats', unit: 'g' },
];
const CYCLE_MS = 2000, HOLD_MS = 4000, PLOT_H = 118, BAR_MIN = 18, BAR_MAX = 80;

/**
 * The phases' step chart (BLOC Plan): Calories → Steps → Carbs → Fats every
 * 2s; a tap picks one and holds it 4s. Reduced motion: Calories, no loop.
 */
export function StepChart({ goals, currentId }: { goals: PlanGoal[]; currentId?: string }) {
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [idx, setIdx] = useState(0);
  const [holdKey, setHoldKey] = useState(0);
  const held = useRef(false);
  useEffect(() => {
    if (reduced) return;
    let loop: number | undefined;
    const first = window.setTimeout(() => {
      held.current = false;
      setIdx((i) => (i + 1) % METRICS.length);
      loop = window.setInterval(() => setIdx((i) => (i + 1) % METRICS.length), CYCLE_MS);
    }, held.current ? HOLD_MS : CYCLE_MS);
    return () => { window.clearTimeout(first); window.clearInterval(loop); };
  }, [reduced, holdKey]);
  useEffect(() => { if (reduced) setIdx(0); }, [reduced]);
  if (goals.length < 2) return null;
  const m = METRICS[idx];
  const vals = goals.map((g) => Number(g[m.key]) || 0);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const h = (v: number) => (hi === lo ? (BAR_MIN + BAR_MAX) / 2 : BAR_MIN + ((v - lo) / (hi - lo)) * (BAR_MAX - BAR_MIN));
  const cols: CSSProperties = { display: 'grid', gridTemplateColumns: `repeat(${goals.length}, minmax(0, 1fr))`, gap: 8 };
  return (
    <div style={{ borderTop: '1px solid var(--divider)', padding: '16px 0 0' }}>
      <div role="group" aria-label="Chart metric" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
        {METRICS.map((x, i) => (
          <button key={x.key} type="button" aria-pressed={i === idx} onClick={() => { held.current = true; setIdx(i); setHoldKey((k) => k + 1); }}
            style={{ height: 44, border: 0, borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 12.5, background: i === idx ? 'var(--accent2)' : 'var(--surface2)', color: i === idx ? 'var(--on-accent)' : 'var(--text2)' }}>{x.label}</button>
        ))}
      </div>
      <div key={m.key} role="img" aria-label={`${m.label} by phase: ${goals.map((g, i) => `${shortPhaseLabel(phaseName(g) || `Phase ${i + 1}`)} ${fmt.int(vals[i])}${m.unit}`).join(', ')}`}
        style={{ ...cols, height: PLOT_H, marginTop: 12, alignItems: 'end' }}>
        {goals.map((g, i) => {
          const on = g.macroGoalID === currentId;
          return (
            <div key={g.macroGoalID} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 5, height: '100%', minWidth: 0 }}>
              <b className="num fade-in" style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, color: on ? 'var(--accent2)' : 'var(--text)', whiteSpace: 'nowrap' }}>{fmt.int(vals[i])}{m.unit}</b>
              <i style={{ display: 'block', height: h(vals[i]), borderRadius: '6px 6px 2px 2px', transformOrigin: 'bottom center', background: on ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 30%, transparent)', animation: `growY .6s var(--ease-rise) ${i * 40}ms both` }} />
            </div>
          );
        })}
      </div>
      <div style={{ ...cols, marginTop: 8, fontSize: 11.5, color: 'var(--text3)', fontWeight: 600 }} aria-hidden="true">
        {goals.map((g, i) => <span key={g.macroGoalID} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shortPhaseLabel(phaseName(g) || `Phase ${i + 1}`)}</span>)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- sessions

const TYPE_TAG: Record<string, [string, 'blue' | 'ice' | 'amber']> = { dropset: ['Drop', 'blue'], pause: ['Pause', 'blue'], giant: ['Giant', 'blue'] };

/** "3–4 sets × 10 · 40 kg · Chest", or a cardio target. */
export function exerciseLine(e: PlanExercise, leader?: PlanExercise | null): string {
  const sets = leader ? 'sets follow the leader' : e.setsStart === e.setsEnd ? `${e.setsStart} set${e.setsStart === 1 ? '' : 's'}` : `${e.setsStart}–${e.setsEnd} sets`;
  if (e.category === 'cardio') {
    const tgt = e.metricType === 'distance' ? `${e.targetDistance ?? 0} ${e.distanceUnit || 'km'}` : cardioTime(e.targetSeconds ?? 0);
    const lv = [e.speedLevel != null ? `speed ${e.speedLevel}` : '', e.resistanceLevel != null ? `resistance ${e.resistanceLevel}` : ''].filter(Boolean).join(', ');
    return `${sets} · ${tgt} target${lv ? ` · ${lv}` : ''}`;
  }
  return `${sets} × ${e.reps || '—'} · ${e.startWeight} kg${e.trackingMode === 'perSide' ? ' each side' : ''}${e.bodyPart ? ` · ${e.bodyPart}` : ''}`;
}
export function cardioTime(s: number): string {
  const m = Math.floor(s / 60), r = s % 60;
  return m > 0 ? (r > 0 ? `${m}min ${r}s` : `${m}min`) : `${r}s`;
}

function ExerciseRow({ e, leader, readOnly, onEdit, onSwap, swapped }: { e: PlanExercise; leader?: PlanExercise | null; readOnly: boolean; onEdit: () => void; onSwap: () => void; swapped?: boolean }) {
  const tag = TYPE_TAG[e.type];
  const body = (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 14.5, fontWeight: 600, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {e.name}
        {tag && e.category !== 'cardio' && <Tag tone={tag[1]}>{tag[0]}</Tag>}
        {e.category === 'cardio' && <Tag tone="ice">Cardio</Tag>}
        {e.isHeavyLeg && <Tag tone="amber">Heavy</Tag>}
        {swapped && <Tag tone="acc">Changed</Tag>}
        {!!e.fromWeek && e.fromWeek > 1 && <Tag tone="neutral">From MC{e.fromWeek}</Tag>}
      </div>
      <div className="muted num" style={{ fontSize: 12.5, marginTop: 3 }}>{exerciseLine(e, leader)}</div>
    </div>
  );
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0 10px 12px', borderLeft: `2px solid ${swapped ? 'var(--accent)' : 'var(--divider)'}`, marginBottom: 6 }}>
      {readOnly ? body : <button type="button" onClick={onEdit} aria-label={`Edit ${e.name}`} style={{ flex: 1, minWidth: 0, display: 'flex', background: 'none', border: 0, padding: 0, textAlign: 'left', color: 'var(--text)', cursor: 'pointer' }}>{body}</button>}
      {!readOnly && (
        <button type="button" className="btn-sm compact" onClick={onSwap} aria-label={`Swap ${e.name}`} style={{ height: 44 }}>
          <Icon name="swap" size={15} /> Swap
        </button>
      )}
    </div>
  );
}

/**
 * One session template. Tap an exercise to edit, move or remove it; Swap
 * changes it for good. With microcycles, the session's M1 or M2 (the toggle
 * above the list).
 */
export function SessionBlock({ doc, dayKey, label, open, onToggle, readOnly, changedIds, onEdit, onSwap, onMore, onAdd }: {
  doc: PlanDoc; dayKey: string; label: string; open: boolean; onToggle: () => void; readOnly: boolean; changedIds: Set<string>;
  onEdit: (e: PlanExercise) => void; onSwap: (e: PlanExercise) => void; onMore: () => void; onAdd: () => void;
}) {
  const list = doc.exercises[keyOf(doc.macro.id, dayKey)] || [];
  const slots = slotsOf(list);
  const sets = list.reduce((a, e) => a + (e.setsStart || 0), 0);
  const id = `sess-${dayKey}`;
  return (
    <div style={{ borderTop: '1px solid var(--divider)' }} className="sess-block">
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button type="button" className="rowbtn" aria-expanded={open} aria-controls={id} onClick={onToggle} style={{ borderTop: 0, flex: 1 }}>
          <span style={{ flex: 1, minWidth: 0 }}>
            <b>{label}</b>
            <small className="num">{list.length ? `${list.length} exercise${list.length === 1 ? '' : 's'} · ${sets} sets to start` : 'No exercises yet'}</small>
          </span>
          <span className="chev"><Icon name={open ? 'chevU' : 'chevD'} size={22} /></span>
        </button>
        {!readOnly && <IconButton icon="dots" label={`${label}: more`} inCard onClick={onMore} />}
      </div>
      {open && (
        <div id={id} className="fade-in" style={{ paddingBottom: 10 }}>
          {slots.map((slot) => slot.length > 1 || slot[0].supersetId ? (
            <div key={slot[0].supersetId} style={{ border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)', borderRadius: 14, padding: '8px 10px 2px', marginBottom: 8 }}>
              <div className="caption" style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                <Tag tone="acc">{supersetBadge(slot.length)}</Tag> <span style={{ fontWeight: 700, color: 'var(--text2)' }}>{supersetName(doc, slot[0].supersetId!, slot)}</span>
              </div>
              {slot.map((e, i) => <ExerciseRow key={e.id} e={e} leader={i > 0 ? slot[0] : null} readOnly={readOnly} onEdit={() => onEdit(e)} onSwap={() => onSwap(e)} swapped={changedIds.has(e.id)} />)}
            </div>
          ) : <ExerciseRow key={slot[0].id} e={slot[0]} readOnly={readOnly} onEdit={() => onEdit(slot[0])} onSwap={() => onSwap(slot[0])} swapped={changedIds.has(slot[0].id)} />)}
          {!readOnly && <Button size="card" variant="ghost" icon="plus" onClick={onAdd} style={{ marginTop: 4 }}>Add exercise</Button>}
        </div>
      )}
    </div>
  );
}

export function MicroToggle({ value, onChange }: { value: 1 | 2; onChange: (v: 1 | 2) => void }) {
  return <Seg<'1' | '2'> label="Microcycle" value={String(value) as '1' | '2'} onChange={(x) => onChange(Number(x) as 1 | 2)} options={[{ value: '1', label: 'Microcycle 1' }, { value: '2', label: 'Microcycle 2' }]} className="micro-seg" />;
}

// ---------------------------------------------------------------- deloads

export function DeloadGrid({ doc, readOnly, onToggle }: { doc: PlanDoc; readOnly: boolean; onToggle: (key: string) => void }) {
  const units = deloadUnits(doc.macro);
  return (
    <div className="card" style={{ padding: 14 }}>
      <div className="deload-grid" role="group" aria-label="Deload weeks">
        {units.map((u) => {
          const on = !!doc.deloads[u.key];
          return (
            <button key={u.key} type="button" className="pick" aria-pressed={on} disabled={readOnly} onClick={() => onToggle(u.key)}
              style={{ minHeight: 52, padding: '8px 10px', cursor: readOnly ? 'default' : 'pointer' }}>
              <b style={{ fontSize: 13.5, whiteSpace: 'nowrap' }}>{u.label}</b>
              <small style={{ whiteSpace: 'nowrap' }}>{on ? 'Deload' : fmt.dm(u.start)}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- volume

export function VolumeCard({ rows, onPreview }: { rows: VolumeRow[]; onPreview?: () => void }) {
  const max = Math.max(1, ...rows.map((r) => r.max));
  return (
    <div className="card">
      {rows.length === 0 && <p className="muted">No weighted exercises yet.</p>}
      {rows.map((r, k) => (
        <div key={r.bodyPart} style={{ marginTop: k ? 14 : 0 }}>
          <div className="row" style={{ fontSize: 14 }}>
            <span style={{ fontWeight: 600 }}>{r.bodyPart}</span>
            <span className="muted num" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{fmt.int(r.min)}–{fmt.int(r.max)} kg</span>
          </div>
          <Bar thick i={k} value={r.max / max} label={`${r.bodyPart}: ${fmt.int(r.min)} to ${fmt.int(r.max)} kg across the cycle`}
            color={`linear-gradient(90deg, var(--accent) ${r.max ? (r.min / r.max) * 100 : 100}%, color-mix(in srgb, var(--accent) 40%, transparent) ${r.max ? (r.min / r.max) * 100 : 100}%)`} />
        </div>
      ))}
      {onPreview && <div style={{ borderTop: '1px solid var(--divider)', marginTop: 16 }}><RowButton title="Progression preview" sub="How sets and loads build, week by week" onClick={onPreview} /></div>}
    </div>
  );
}

// ---------------------------------------------------------------- draft bar

/** "3 unpublished changes · Discard · Publish", above the bottom nav on a phone. "Save" for a client not on the app. */
export function DraftBar({ count, save, onDiscard, onPublish }: { count: number; save: boolean; onDiscard: () => void; onPublish: () => void }) {
  const wide = useIsTablet();
  if (count === 0) return null;
  return (
    <div role="region" aria-label="Unpublished changes" className="fade-in" style={{
      position: 'sticky', bottom: wide ? 20 : 'calc(92px + env(safe-area-inset-bottom))', zIndex: 40, marginTop: 28,
      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 10px 10px 16px', borderRadius: 18,
      background: 'var(--surface3)', border: '1px solid color-mix(in srgb, var(--accent) 45%, transparent)',
      boxShadow: '0 10px 30px color-mix(in srgb, var(--bg) 70%, transparent)',
    }}>
      <span className="ready-dot" aria-hidden="true" style={{ marginLeft: 0 }} />
      <b style={{ flex: 1, minWidth: 0, fontSize: 14 }} aria-live="polite">{count} {save ? 'unsaved' : 'unpublished'} change{count === 1 ? '' : 's'}</b>
      <Button variant="danger" size="compact" onClick={onDiscard} style={{ height: 44 }}>Discard</Button>
      <Button size="compact" onClick={onPublish} style={{ height: 44 }}>{save ? 'Save' : 'Publish'}</Button>
    </div>
  );
}
