import { useEffect, useMemo, useRef, useState } from 'react';
import { getDayBefore, getNextMonday, shiftDateStr } from '@engine';
import { Button, EmptyState, Notice, RowButton, Section, Toast, useToast } from '@/components/ui';
import { useCoach } from '@/app/App';
import { fmt } from '@/lib/format';
import {
  addExercise, addSession, copyMicro, dayKeys, dayOf, editSettings, keyOf, linkSuperset, microOf, moveInSuperset, moveSlot, newCycle,
  joinWeek, removeExercise, removeGoal, removeSession, renameSession, sessionLabel, setExtension, slotsOf, swapExercise, toggleDeload, unlinkExercise,
  updateExercise, upsertGoal, type PlanDoc, type PlanExercise,
} from '@/plan/doc';
import { applyMacroTemplate, applyWorkoutTemplate, macroTemplateOf, workoutTemplateOf, type Template } from '@/plan/templates';
import { bodyPartFor } from '@/plan/library';
import { bodyPartVolume, progressionPreview } from '@/plan/volume';
import type { ClientView } from '@/coach/screens/ClientScreen';
import { usePlan } from './usePlan';
import { DeloadGrid, DraftBar, MicroToggle, PhaseRow, PlanHero, SessionBlock, StepChart, VolumeCard } from './PlanParts';
import { ExercisePicker, ExerciseSheet, LinkSheet, type ExerciseSheetContext } from './ExerciseSheets';
import {
  ApplyCycleSheet, ChooseCycleSheet, EditCycleSheet, ExtendSheet, GoalSheet, NewCycleSheet, PreviewSheet, PublishSheet, SaveTemplateSheet,
  SessionSheet, TemplatePicker,
} from './PlanSheets';

type SheetKind = 'cycle' | 'new' | 'edit' | 'extend' | 'goal' | 'publish' | 'preview' | 'tplCycle' | 'applyCycle' | 'tplWorkout' | 'saveCycle' | 'saveWorkout' | 'session' | 'link' | null;

/** What Review asked Plan to open (a finding's action): `?act=swap&ex={dayKey}|{exId}`, or `?act=goal`. */
export interface PlanIntent { act: 'swap' | 'goal'; ex?: string | null }

/**
 * Client → Plan (proposal §5.3; TECHNICAL §144): the cycle's goal phases,
 * weekly sessions, deloads, volume and tools, as BLOC's own Plan edits them.
 * Every edit is a draft until Publish (Save for a client not on the app). A
 * client's own cycle is read-only: the coach replaces it.
 */
export function PlanTab({ v, macro, intent }: { v: ClientView; macro: string | null; intent: PlanIntent | null }) {
  const { repo } = useCoach();
  const p = usePlan(v, macro);
  const toast = useToast();
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [micro, setMicro] = useState<1 | 2>(1);
  const [openDays, setOpenDays] = useState<Set<string>>(new Set());
  const [goalId, setGoalId] = useState<string | null>(null);
  const [exCtx, setExCtx] = useState<ExerciseSheetContext | null>(null);
  const [swapAt, setSwapAt] = useState<{ dayKey: string; ex: PlanExercise } | null>(null);
  const [sessionDay, setSessionDay] = useState<string | null>(null);
  const [linkLeader, setLinkLeader] = useState<{ dayKey: string; ex: PlanExercise } | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [tpl, setTpl] = useState<Template | null>(null);
  const [busy, setBusy] = useState(false);
  const [pubError, setPubError] = useState<string | null>(null);
  const close = () => setSheet(null);
  useEffect(() => { repo.loadTemplates().then(setTemplates).catch(() => setTemplates([])); }, [repo]);

  const { doc, selected: cycle, today } = p;
  const first = v.first;
  const notOnApp = v.summary.status === 'not-on-app' || v.summary.status === 'unlinked';
  const readOnly = !cycle || !cycle.coachOwned || cycle.status === 'past';
  const edit = (fn: (d: PlanDoc) => PlanDoc, msg?: string) => { p.edit(fn); if (msg) toast.show(`${msg} · draft`); };

  // Review's finding opened Plan on a job: do it once the cycle is on screen.
  const done = useRef(false);
  useEffect(() => {
    if (!intent || done.current || !doc || readOnly) return;
    done.current = true;
    if (intent.act === 'goal') {
      const cur = doc.goals.find((g) => g.startDate <= today && g.endDate >= today) ?? doc.goals[doc.goals.length - 1] ?? null;
      setGoalId(cur?.macroGoalID ?? null);
      setSheet('goal');
    } else if (intent.ex) {
      const [dk, id] = intent.ex.split('|');
      const ex = (doc.exercises[keyOf(doc.macro.id, dk)] || []).find((e) => e.id === id);
      if (ex) { setMicro((microOf(dk) || 1) as 1 | 2); setOpenDays(new Set([dk])); setSwapAt({ dayKey: dk, ex }); }
    }
  }, [intent, doc, readOnly, today]);

  const volume = useMemo(() => (doc ? bodyPartVolume(doc, p.library) : []), [doc, p.library]);
  // Goal phases may not overlap any other cycle's. When this cycle replaces
  // the client's own running one, that cycle's goals are checked as they'll
  // be once the client accepts: the running one ends on the new end, the
  // later ones are gone (§143). Checking them as they are now refused every
  // phase of the new cycle.
  const otherGoals = useMemo(() => {
    const all = p.cycles.filter((c) => c.id !== cycle?.id && c.entry).flatMap((c) => c.entry!.doc.goals);
    const o = p.overlap;
    if (o?.kind !== 'replace') return all;
    const removed = new Set(o.removeGoals.map((g) => g.macroGoalID));
    const trimmed = new Set(o.trimGoals.map((g) => g.macroGoalID));
    return all.filter((g) => !removed.has(g.macroGoalID)).map((g) => (trimmed.has(g.macroGoalID) ? { ...g, endDate: o.newEnd } : g));
  }, [p.cycles, p.overlap, cycle?.id]);
  const preview = useMemo(() => (doc && sheet === 'preview' ? progressionPreview(doc) : []), [doc, sheet]);
  const changedIds = useMemo(() => {
    const s = new Set<string>();
    if (!doc || !p.base) return s;
    const baseIds = new Set(Object.values(p.base.exercises).flat().map((e) => JSON.stringify(e)));
    for (const e of Object.values(doc.exercises).flat()) if (!baseIds.has(JSON.stringify(e))) s.add(e.id);
    return s;
  }, [doc, p.base]);

  // The day after the running cycle ends, else next Monday (§11 Q17's default).
  const running = p.cycles.find((c) => c.status === 'active' && !c.isNew);
  const defaultStart = running ? shiftDateStr(running.end, 1) : getNextMonday({ today: shiftDateStr(today, 1) });

  if (p.error) return <div style={{ marginTop: 20 }}><EmptyState action={<Button size="sm" onClick={p.reload}>Try again</Button>}>Couldn’t load {first}’s plan: {p.error}</EmptyState></div>;
  if (p.loading) return <div aria-busy="true" style={{ minHeight: 200 }} />;

  const publish = async () => {
    setBusy(true); setPubError(null);
    try {
      await p.publish();
      close();
      toast.show(notOnApp ? 'Plan saved' : `Published · ${first} gets it next time BLOC is open`);
    } catch (e) {
      setPubError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };
  const create = async (d: PlanDoc, msg: string) => {
    try { await p.startNew(d); close(); toast.show(`${msg} · draft`); } catch (e) { toast.show(e instanceof Error ? e.message : String(e)); }
  };

  const status = cycle?.entry?.status;
  const statusLine = !cycle ? null
    : p.diff && p.diff.count ? `${p.diff.count} unpublished`
    : cycle.isNew ? 'Not published'
    : !cycle.coachOwned ? `${first}’s own`
    : status?.state === 'held' ? 'Held on their phone'
    : status?.state === 'waiting' ? `Published ${fmt.dm(status.at.slice(0, 10))} · not on their phone yet`
    : status?.state === 'applied' ? `Published ${fmt.dm(status.at.slice(0, 10))} · on their phone` : null;
  const held = status?.state === 'held' ? status.note ?? '' : null;
  const draftStale = cycle?.draft && cycle.entry && cycle.draft.body.base !== JSON.stringify(cycle.entry.doc);

  const goal = doc?.goals.find((g) => g.macroGoalID === goalId) ?? null;
  const currentGoal = doc?.goals.find((g) => g.startDate <= today && g.endDate >= today);
  const nextGoal = doc?.goals.find((g) => g.startDate > today);
  const keys = doc ? dayKeys(doc.macro).filter((dk) => !doc.macro.useMicrocycles || microOf(dk) === micro) : [];
  const exSheetFor = (dk: string, ex?: PlanExercise, into?: string | null): ExerciseSheetContext => ({
    mode: ex ? 'edit' : 'add', dayKey: dk, sessionLabel: doc ? sessionLabel(doc.macro, dk) : '', exercise: ex, intoSuperset: into ?? null,
    list: doc?.exercises[keyOf(doc.macro.id, dk)] || [],
  });

  return (
    <>
      {cycle && !cycle.coachOwned && (
        <div style={{ marginTop: 20 }}>
          <Notice tone="amber" icon="lock" title={`${cycle.name} is ${first}’s own cycle`}>
            You can see it but not edit it. To take over, start one of yours: {first} is asked to end theirs early if it’s still running.
          </Notice>
        </div>
      )}
      {held != null && (
        <div style={{ marginTop: 20 }}>
          <Notice tone={/^Waiting for the client/.test(held) ? 'amber' : 'bad'} icon={/^Waiting for the client/.test(held) ? 'clock' : 'warning'}
            title={/^Waiting for the client/.test(held) ? `Waiting for ${first} to accept` : /^The client kept/.test(held) ? `${first} kept their own cycle` : `Held on ${first}’s phone`}>
            {held.replace(/the client/i, first)}{/^The client kept/.test(held) ? ' Change the start to after it ends, then publish again.' : ''}
          </Notice>
        </div>
      )}
      {cycle?.isNew && doc && (
        <div style={{ marginTop: 20 }}><Notice icon="edit" title={`Draft: ${doc.macro.name}`}>A new cycle from {fmt.ddm(doc.macro.start)}. {first} sees it once you {notOnApp ? 'save' : 'publish'}.</Notice></div>
      )}
      {draftStale && <div style={{ marginTop: 20 }}><Notice tone="amber" icon="warning" title="Published since this draft">The cycle changed after this draft was made (a check-in’s goal change, or another device). The changes below are against what’s published now.</Notice></div>}

      {!doc || !cycle ? (
        <>
          <div className="hero rise" style={{ ['--i' as string]: 1 }}><div className="muted">No cycle yet. {v.summary.status === 'invited' ? `${first} hasn’t linked yet, but you can build a plan ready for when they do.` : 'Start from a Library template or from scratch.'}</div></div>
          <Section i={2} title="Tools" sub="Start from a Library template, or build a cycle from scratch.">
            <div className="card" style={{ padding: '6px 18px' }}>
              <RowButton title="Apply a Library template" sub={`A fresh copy for ${first}, from a start date you choose`} trailing="library" onClick={() => setSheet('tplCycle')} />
              <RowButton title="New cycle" sub="Start a fresh macrocycle" trailing="plus" onClick={() => setSheet('new')} />
            </div>
          </Section>
        </>
      ) : (
        <>
          <PlanHero doc={doc} cycle={cycle} today={today} first={first} status={statusLine} onOpen={() => setSheet('cycle')} />
          <div className="grid-2">
            {!notOnApp && (
              <Section i={2} title="Goal phases" sub={readOnly ? 'Read-only.' : 'Tap a phase to edit it. Calories, steps and macros for each stretch of the cycle.'}>
                <div className="card" style={{ padding: '4px 18px 14px' }}>
                  {doc.goals.length === 0 && <p className="muted" style={{ padding: '14px 0' }}>No goal phases yet.</p>}
                  {doc.goals.map((g, k) => (
                    <PhaseRow key={g.macroGoalID} g={g} k={k} today={today} currentId={currentGoal?.macroGoalID} nextId={nextGoal?.macroGoalID}
                      onOpen={readOnly ? undefined : () => { setGoalId(g.macroGoalID); setSheet('goal'); }} />
                  ))}
                  {!readOnly && <Button size="card" variant="ghost" icon="plus" style={{ margin: '8px 0 12px' }} onClick={() => { setGoalId(null); setSheet('goal'); }}>Add goal phase</Button>}
                  <StepChart goals={doc.goals} currentId={currentGoal?.macroGoalID} />
                </div>
              </Section>
            )}

            <Section i={3} title="Weekly sessions" sub={readOnly ? 'Read-only.' : 'Set exercises once; they carry forward every week. Tap one to edit it, Swap to change it for good.'}>
              {doc.macro.useMicrocycles && <div style={{ marginBottom: 12 }}><MicroToggle value={micro} onChange={setMicro} /></div>}
              <div className="card list">
                {keys.map((dk) => (
                  <SessionBlock key={dk} doc={doc} dayKey={dk} label={sessionLabel(doc.macro, dk)} readOnly={readOnly} changedIds={changedIds}
                    open={openDays.has(dk) || keys.length === 1}
                    onToggle={() => { const n = new Set(openDays); if (n.has(dk)) n.delete(dk); else n.add(dk); setOpenDays(n); }}
                    onEdit={(e) => setExCtx(exSheetFor(dk, e))} onSwap={(e) => setSwapAt({ dayKey: dk, ex: e })}
                    onMore={() => { setSessionDay(dk); setSheet('session'); }} onAdd={() => setExCtx(exSheetFor(dk))} />
                ))}
                {!readOnly && <div style={{ borderTop: '1px solid var(--divider)', padding: '12px 0' }}><Button size="card" variant="ghost" icon="plus" onClick={() => edit((d) => addSession(d, `Session ${d.macro.days.length + 1}`), 'Session added')}>Add a session</Button></div>}
              </div>
            </Section>

            <Section i={4} title="Deloads" sub={readOnly ? 'Read-only.' : 'Tap a week to make it a deload week, as BLOC’s Train toggle does.'}>
              <DeloadGrid doc={doc} readOnly={readOnly} onToggle={(k) => edit((d) => toggleDeload(d, k))} />
            </Section>

            <Section i={5} title="Volume by body part" sub="Total across the cycle. Solid is minimum, faded is peak.">
              <VolumeCard rows={volume} onPreview={Object.values(doc.exercises).some((l) => l.length) ? () => setSheet('preview') : undefined} />
            </Section>

            <Section i={6} title="Tools" sub={readOnly ? (cycle.coachOwned ? 'Past cycles are read-only. Start a new one.' : `Replace ${first}’s own cycle with one of yours.`) : 'Edit this cycle, change its length, use the Library, or start the next one.'}>
              <div className="card" style={{ padding: '6px 18px' }}>
                {!readOnly && <RowButton title="Edit cycle" sub={`Name, dates, length, goal and increment · effort ratings ${doc.macro.rpe ? 'on' : 'off'}`} trailing="edit" onClick={() => setSheet('edit')} />}
                {!readOnly && <RowButton title={doc.macro.extensionWeeks ? `Extended by ${doc.macro.extensionWeeks} week${doc.macro.extensionWeeks === 1 ? '' : 's'}` : 'Extend cycle'} sub={`Ends ${fmt.ddm(cycle.end)}`} onClick={() => setSheet('extend')} />}
                <RowButton title="Apply a Library template" sub={`A fresh copy for ${first}, from a start date you choose`} trailing="library" onClick={() => setSheet('tplCycle')} />
                {cycle.coachOwned && <RowButton title="Save as template" sub="Save this cycle to the Library, without dates" trailing="library" onClick={() => setSheet('saveCycle')} />}
                <RowButton title="New cycle" sub="Start a fresh macrocycle" trailing="plus" onClick={() => setSheet('new')} />
              </div>
            </Section>
          </div>
          {!readOnly && p.diff && <DraftBar count={p.diff.count} save={notOnApp} onPublish={() => { setPubError(null); setSheet('publish'); }} onDiscard={async () => { await p.discard(); toast.show('Changes discarded'); }} />}
        </>
      )}

      {/* ---- sheets ---- */}
      <ChooseCycleSheet open={sheet === 'cycle'} cycles={p.cycles} current={cycle?.id ?? null} first={first} onClose={close}
        onPick={(id) => { p.pick(id); close(); }} onNew={() => setSheet('new')} />
      <NewCycleSheet open={sheet === 'new'} today={today} defaultStart={defaultStart} onClose={close}
        onCreate={(c) => create(newCycle(c, p.ids), `${c.name} created`)} />
      {doc && (
        <>
          <EditCycleSheet open={sheet === 'edit'} doc={doc} started={doc.macro.start <= today} onClose={close}
            onSave={(patch) => { edit((d) => editSettings(d, patch), 'Cycle saved'); close(); }} />
          <ExtendSheet open={sheet === 'extend'} doc={doc} onClose={close} onSave={(w) => { edit((d) => setExtension(d, w), w ? `Extended by ${w} week${w === 1 ? '' : 's'}` : 'Extension removed'); close(); }} />
          <GoalSheet open={sheet === 'goal'} doc={doc} goal={goal} others={otherGoals} today={today}
            bodyweight={latestWeight(v)} onClose={close}
            onSave={(id, g) => { edit((d) => upsertGoal(d, id, g, p.ids), id ? 'Goal phase saved' : 'Goal phase added'); close(); }}
            onRemove={(id) => { edit((d) => removeGoal(d, id), 'Goal phase removed'); close(); }} />
          <PreviewSheet open={sheet === 'preview'} blocks={preview} onClose={close} />
          <PublishSheet open={sheet === 'publish'} diff={p.diff} first={first} save={notOnApp} overlap={p.overlap} today={today} busy={busy} error={pubError}
            onClose={close} onPublish={publish} onMoveStart={(s) => edit((d) => editSettings(d, { start: s }), `Starts ${fmt.ddm(s)}`)} />
          <SaveTemplateSheet open={sheet === 'saveCycle'} kind="macrocycle" defaultName={doc.macro.name} summary={macroTemplateOf(doc).summary} onClose={close}
            onSave={async (name) => { const t = macroTemplateOf(doc); const saved = await repo.saveTemplate({ kind: 'macrocycle', name, summary: t.summary, body: t.body }); setTemplates([...templates, saved]); close(); toast.show(`${name} saved to Library`); }} />
          {sessionDay && (
            <>
              <SessionSheet open={sheet === 'session'} label={sessionLabel(doc.macro, sessionDay)} micro={microOf(sessionDay)} canRemove={doc.macro.days.length > 1} onClose={close}
                onRename={(s) => { edit((d) => renameSession(d, dayOf(sessionDay), s), 'Session renamed'); close(); }}
                onCopy={() => { edit((d) => copyMicro(d, dayOf(sessionDay), microOf(sessionDay) === 1 ? 2 : 1, p.ids), 'Copied'); close(); }}
                onApplyWorkout={() => setSheet('tplWorkout')} onSaveWorkout={() => setSheet('saveWorkout')}
                onRemove={() => { edit((d) => removeSession(d, dayOf(sessionDay)), 'Session removed'); close(); }} />
              <SaveTemplateSheet open={sheet === 'saveWorkout'} kind="workout" defaultName={sessionLabel(doc.macro, sessionDay).replace(/ · M[12]$/, '')}
                summary={workoutTemplateOf(doc, sessionDay, '').summary} onClose={close}
                onSave={async (name) => { const t = workoutTemplateOf(doc, sessionDay, name); const saved = await repo.saveTemplate({ kind: 'workout', name, summary: t.summary, body: t.body }); setTemplates([...templates, saved]); close(); toast.show(`${name} saved to Library`); }} />
              <TemplatePicker open={sheet === 'tplWorkout'} kind="workout" templates={templates} onClose={close}
                onPick={(t) => {
                  if (t.body.kind !== 'workout') return;
                  const body = t.body;
                  edit((d) => applyWorkoutTemplate(d, body, dayOf(sessionDay), p.ids).doc, `${t.name} applied`);
                  repo.recordApplication(t.id, v.bundle.card.id).catch(() => {});
                  close();
                }} />
            </>
          )}
        </>
      )}
      <TemplatePicker open={sheet === 'tplCycle'} kind="macrocycle" templates={templates} onClose={close} onPick={(t) => { setTpl(t); setSheet('applyCycle'); }} />
      <ApplyCycleSheet open={sheet === 'applyCycle'} template={tpl} defaultStart={defaultStart} first={first} onClose={close}
        onApply={(start, name) => {
          if (!tpl || tpl.body.kind !== 'macrocycle') return;
          repo.recordApplication(tpl.id, v.bundle.card.id).catch(() => {});
          create(applyMacroTemplate(tpl.body, start, p.ids, name), `${tpl.name} applied`);
        }} />

      {doc && (
        <>
          <ExerciseSheet ctx={exCtx} library={p.library} distanceUnitPref={distanceUnitOf(v)} onClose={() => setExCtx(null)}
            onSave={(f) => {
              const c = exCtx!;
              // Part-way through a cycle, an added or swapped-in exercise joins at the client's week (§147).
              const from = joinWeek(doc.macro, c.dayKey, today, p.trainLogs);
              if (c.mode === 'swap') edit((d) => swapExercise(d, c.dayKey, c.exercise!.id, f, p.ids, from), `${c.exercise!.name} swapped for ${f.name}`);
              else edit((d) => (c.mode === 'add' ? addExercise(d, c.dayKey, f, p.ids, c.intoSuperset ?? undefined, from) : updateExercise(d, c.dayKey, c.exercise!.id, f)), c.mode === 'add' ? `${f.name} added` : `${f.name} saved`);
              setOpenDays(new Set([...openDays, c.dayKey]));
              setExCtx(null);
            }}
            onMove={(dir) => {
              const c = exCtx!;
              const e = c.exercise!;
              edit((d) => {
                const list = d.exercises[keyOf(d.macro.id, c.dayKey)] || [];
                if (e.supersetId) {
                  const members = list.filter((x) => x.supersetId === e.supersetId).sort((a, b) => (a.supersetOrder || 0) - (b.supersetOrder || 0));
                  const i = members.findIndex((x) => x.id === e.id);
                  return moveInSuperset(d, c.dayKey, e.supersetId, i, i + dir);
                }
                const i = slotsOf(list).findIndex((s) => s.some((x) => x.id === e.id));
                return moveSlot(d, c.dayKey, i, i + dir);
              }, 'Moved');
              setExCtx(null);
            }}
            onLink={() => { const c = exCtx!; setLinkLeader({ dayKey: c.dayKey, ex: c.exercise! }); setExCtx(null); setSheet('link'); }}
            onUnlink={() => { const c = exCtx!; edit((d) => unlinkExercise(d, c.dayKey, c.exercise!.id), 'Taken out of the superset'); setExCtx(null); }}
            onRemove={() => { const c = exCtx!; edit((d) => removeExercise(d, c.dayKey, c.exercise!.id), `${c.exercise!.name} removed`); setExCtx(null); }} />
          <LinkSheet open={sheet === 'link'} list={linkLeader ? doc.exercises[keyOf(doc.macro.id, linkLeader.dayKey)] || [] : []} leader={linkLeader?.ex ?? null} onClose={close}
            onLink={(ids) => { const l = linkLeader!; edit((d) => linkSuperset(d, l.dayKey, l.ex.id, ids, p.ids), 'Superset linked'); close(); }} />
          <ExercisePicker open={!!swapAt} title={swapAt ? `Swap ${swapAt.ex.name}` : 'Swap'} library={p.library} category={swapAt?.ex.category ?? null}
            preferBodyPart={swapAt ? bodyPartFor(swapAt.ex, p.library) : null} exclude={swapAt?.ex.name} onClose={() => setSwapAt(null)}
            onPick={(e) => {
              // A swap is set up like a new exercise: the editor opens on it with every setting to fill in.
              const sw = swapAt!;
              setSwapAt(null);
              setExCtx({ ...exSheetFor(sw.dayKey, sw.ex), mode: 'swap', preset: { name: e.name, bodyPart: e.bodyPart || '', category: sw.ex.category } });
            }} />
        </>
      )}
      <Toast msg={toast.msg} />
    </>
  );
}

function latestWeight(v: ClientView): number | null {
  const logs = ((v.bundle.snapshot?.state as { bodyLogs?: { date: string; weight?: unknown }[] } | undefined)?.bodyLogs ?? [])
    .filter((b) => parseFloat(String(b.weight)) > 0).sort((a, b) => a.date.localeCompare(b.date));
  const w = logs.length ? parseFloat(String(logs[logs.length - 1].weight)) : NaN;
  return Number.isFinite(w) ? w : null;
}
function distanceUnitOf(v: ClientView): 'km' | 'mi' {
  return (v.bundle.snapshot?.state as { profile?: { distanceUnit?: string } } | undefined)?.profile?.distanceUnit === 'mi' ? 'mi' : 'km';
}

export { getDayBefore };
