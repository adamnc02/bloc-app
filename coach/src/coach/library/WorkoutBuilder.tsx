// Library → New workout (§162): a workout template built from scratch, with no client. What a group session runs
// (0033), and like any workout template it can also go into a client's cycle. The same exercise editor as a
// client's Plan: the builder is a one-session plan document, saved with workoutTemplateOf, so a workout built here
// is exactly the shape of one saved from a Plan.
import { useMemo, useState } from 'react';
import { Button, EmptyState, Field, Icon, Sheet } from '@/components/ui';
import { useCoach } from '@/app/App';
import { buildLibrary } from '@/plan/library';
import {
  addExercise, keyOf, makeIds, moveSlot, removeExercise, slotsOf, updateExercise, type ExerciseFields, type PlanDoc,
} from '@/plan/doc';
import { workoutTemplateOf, type Template } from '@/plan/templates';
import { ExerciseSheet, type ExerciseSheetContext } from '@/coach/client/plan/ExerciseSheets';

const DAY = 'w';

/** A plan document holding one session, the builder's scratch. */
function blankDoc(): PlanDoc {
  return {
    macro: {
      id: 'macro_workout', name: 'Workout', start: '2026-01-05', weeks: 1, weeksPerMeso: 1, sessionsPerWeek: 1, goal: '', targetBw: null,
      goalType: 'maintenance', splitType: 'custom', days: [DAY], dayLabels: { [DAY]: 'Workout' }, useMicrocycles: false, weightIncrement: '2.5', rpe: false,
    },
    exercises: { [keyOf('macro_workout', DAY)]: [] }, supersets: {}, deloads: {}, goals: [],
  };
}

export function WorkoutBuilder({ onClose, onSaved }: { onClose: () => void; onSaved: (t: Template) => void }) {
  const { repo } = useCoach();
  const ids = useMemo(() => makeIds(() => repo.now()), [repo]);
  const library = useMemo(() => buildLibrary(null), []);
  const [doc, setDoc] = useState<PlanDoc>(blankDoc);
  const [name, setName] = useState('');
  const [ctx, setCtx] = useState<ExerciseSheetContext | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = doc.exercises[keyOf(doc.macro.id, DAY)] || [];
  const slots = slotsOf(list);
  const ready = !!name.trim() && list.length > 0 && list.length <= 40;
  const save = async () => {
    setBusy(true); setError(null);
    try {
      const t = workoutTemplateOf(doc, DAY, name.trim());
      onSaved(await repo.saveTemplate({ kind: 'workout', name: name.trim(), summary: t.summary, body: t.body }));
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const base = { dayKey: DAY, sessionLabel: name.trim() || 'Workout', list };
  return (
    <>
      <Sheet open title="New workout" onClose={onClose}>
        <p className="muted">A single session for your Library. Run it with a group, or apply it to a client’s cycle.</p>
        <Field label="Name" htmlFor="wb-name">
          <input id="wb-name" className="input" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Bootcamp circuit" />
        </Field>
        <div style={{ marginTop: 16 }}>
          {slots.length === 0 ? <EmptyState>No exercises yet.</EmptyState> : (
            <div className="card list">
              {slots.map((slot, k) => slot.map((e) => (
                <button key={e.id} type="button" className="listrow" onClick={() => setCtx({ ...base, mode: 'edit', exercise: e })}>
                  <span className="icon-tile" aria-hidden="true" style={{ fontWeight: 700 }}>{k + 1}</span>
                  <span className="main"><b>{e.name}</b>
                    <small className="muted" style={{ display: 'block', fontSize: 12.5, marginTop: 3 }}>
                      {e.category === 'cardio' ? 'Cardio' : `${e.setsStart} ${e.setsStart === 1 ? 'set' : 'sets'} × ${e.reps}${e.startWeight ? ` · ${e.startWeight} kg` : ''}`}{e.bodyPart ? ` · ${e.bodyPart}` : ''}
                    </small>
                  </span>
                  <Icon name="chevR" size={18} />
                </button>
              )))}
            </div>
          )}
        </div>
        <Button variant="ghost" icon="plus" style={{ marginTop: 12 }} onClick={() => setCtx({ ...base, mode: 'add' })} disabled={list.length >= 40}>Add exercise</Button>
        {error && <p className="dy-refusal" role="alert"><Icon name="warning" size={16} /> {error}</p>}
        <Button icon="library" style={{ marginTop: 18 }} disabled={!ready || busy} onClick={() => void save()}>Save to Library</Button>
        {!ready && <p className="caption" style={{ marginTop: 8 }}>Give it a name and at least one exercise.</p>}
      </Sheet>
      <ExerciseSheet ctx={ctx} library={library} distanceUnitPref="km" noSupersets onClose={() => setCtx(null)}
        onSave={(f: ExerciseFields) => {
          const c = ctx!;
          setDoc((d) => (c.mode === 'edit' ? updateExercise(d, DAY, c.exercise!.id, f) : addExercise(d, DAY, f, ids)));
          setCtx(null);
        }}
        onMove={(dir) => {
          const c = ctx!;
          const i = slots.findIndex((s) => s.some((x) => x.id === c.exercise?.id));
          if (i >= 0 && i + dir >= 0 && i + dir < slots.length) setDoc((d) => moveSlot(d, DAY, i, i + dir));
        }}
        onLink={() => {}} onUnlink={() => {}}
        onRemove={() => { const c = ctx!; if (c.exercise) setDoc((d) => removeExercise(d, DAY, c.exercise!.id)); setCtx(null); }} />
    </>
  );
}
