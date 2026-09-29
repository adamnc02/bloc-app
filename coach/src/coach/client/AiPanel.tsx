import { useCallback, useEffect, useId, useState, type ReactNode } from 'react';
import type { BlocState, Loose } from '@engine';
import { ActionRow, Button, Chip, Field, Icon, IconButton, Notice, Seg, Sheet, useOnResume } from '@/components/ui';
import { useCoach } from '@/app/App';
import { fmt } from '@/lib/format';
import { runTool } from '@/ai/run';
import { coachCallModel, getAiKey } from '@/ai/transport';
import {
  aiResponsePayload, contentOf, eligibility, goalChanges, isEdited, latestDraft, notesBack, openRequest, overallCompliance,
  photoRequestPayload, photoRequestState, planChoices, priorPhaseIds, publishState, sentEdit, TOOL_LABEL, TOOLS, withPlan, type GoalChanges,
} from '@/ai/tools';
import type { AiData, AiDraft, AiEdit, AiTool, CoachPublication, Submission } from '@/ai/types';
import type { ReviewModel } from '@/review/model';
import type { ClientView } from '@/coach/screens/ClientScreen';

/** The card's AI data, loaded when Review opens and again when the app comes back to the front. */
export function useAiData(v: ClientView) {
  const { repo } = useCoach();
  const cardId = v.bundle.card.id;
  const clientId = v.bundle.link?.status === 'active' ? v.bundle.link.clientId : null;
  const [data, setData] = useState<AiData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    repo.loadAi(cardId, clientId).then((d) => { setData(d); setError(null); }).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [repo, cardId, clientId]);
  useEffect(load, [load]);
  useOnResume(load);
  return { data, setData, error, reload: load };
}

const SIGNAL: Record<string, { tone: 'good' | 'bad' | 'amber' | 'neutral'; label: string }> = {
  'plateau-creep': { tone: 'bad', label: 'Plateau detected' }, 'plateau-adaptation': { tone: 'amber', label: 'Plateau, adaptation?' },
  'drift-warning': { tone: 'amber', label: 'Intake drift' }, 'on-track': { tone: 'good', label: 'On track' },
  'gain-deficit': { tone: 'bad', label: 'Eating at deficit' }, 'gain-undereating': { tone: 'amber', label: 'Surplus too small' },
  'gain-excess': { tone: 'amber', label: 'Surplus may be large' }, 'maint-unstable': { tone: 'amber', label: 'Weight varying' },
  'maint-stable': { tone: 'good', label: 'Stable' },
};
const ACK_TEXT = { applied: 'Delivered', needs_attention: 'Held on their phone', superseded: 'Replaced' } as const;
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Review's AI tools: Run check-in, Cycle review and Build next cycle, on this
 * device with the coach's own key, on the client's state at their today.
 * Each reply is saved exactly as it came back; ✎ Edit changes the words and
 * the goals; Publish sends the edit. The client only ever sees the edit, and
 * the next run is built from what was sent (TECHNICAL §141).
 */
export function AiPanel({ v, m, state, tool, onTool, ai }: {
  v: ClientView; m: ReviewModel; state: BlocState; tool: AiTool; onTool: (t: AiTool) => void;
  ai: ReturnType<typeof useAiData>;
}) {
  const { repo } = useCoach();
  const { first } = v;
  const card = v.bundle.card;
  const macro = (state.macrocycles || []).find((x) => x.id === m.cycle.id)!;
  const today = m.today;
  const [running, setRunning] = useState(false);
  const [editing, setEditing] = useState(false);
  const [sheet, setSheet] = useState<null | 'full' | 'publish'>(null);
  const [reply, setReply] = useState<Submission | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasKey = !!getAiKey();

  const data = ai.data;
  if (!data) {
    return ai.error ? <Notice icon="warning" tone="bad" title="Couldn’t load the AI tools">{ai.error}</Notice> : <div className="card" aria-busy="true" style={{ minHeight: 120 }} />;
  }
  const d = latestDraft(data.drafts, tool, macro.id);
  const request = tool === 'check_in' ? openRequest(data.submissions, data.drafts, macro.id) : null;
  const photos = photoRequestState(data.publications, data.submissions, macro.id);
  const el = eligibility(tool, { s: state, macro, today, cycleStatus: m.cycle.status, hasKey, drafts: data.drafts, request, first, fmtDate: fmt.ddm, photos });
  const consent = !!v.bundle.link?.photoConsent;
  const addDraft = (x: AiDraft) => ai.setData((p) => (p ? { ...p, drafts: [...p.drafts.filter((y) => y.id !== x.id), x] } : p));
  const addPub = (x: CoachPublication) => ai.setData((p) => (p ? { ...p, publications: [...p.publications, x] } : p));

  // Photos are part of the review: the coach asks first (a photo_request, 0027),
  // and BLOC raises a Home banner that opens the photo sheet with Skip (v8.44).
  const askPhotos = async (cancel = false) => {
    if (running) return;
    setRunning(true); setError(null);
    try {
      const id = cancel && photos.request ? String(photos.request.payload.request_id) : `pr_${macro.id}_${repo.now()}`;
      addPub(await repo.publish(card.id, 'photo_request', photoRequestPayload(id, macro.id, cancel), cancel && photos.request ? photos.request.id : null));
    } catch (e) {
      setError(msg(e));
    } finally {
      setRunning(false);
    }
  };

  const run = async () => {
    if (el.action === 'request') { await askPhotos(); return; }
    const key = getAiKey();
    if (!key || running) return;
    setRunning(true); setError(null); setEditing(false);
    try {
      const imgs = tool === 'cycle_review' && photos.status === 'answered' && !photos.skipped && consent && photos.before.length + photos.after.length
        ? { before: await repo.loadPhotos(photos.before), after: await repo.loadPhotos(photos.after) } : null;
      const t = m.training;
      const training = t.scored ? t.cycleScore : t.cycleAttendance;
      const original = await runTool({
        tool, state, macro, today, callModel: coachCallModel(key), drafts: data.drafts, publications: data.publications, request,
        notes: card.notes, photos: imgs,
        compliance: { training, attendance: !t.scored, nutrition: m.nutrition.cycleScore, overall: overallCompliance(training, m.nutrition.cycleScore) },
      });
      addDraft(await repo.saveAiDraft(card.id, tool, macro.id, original));
    } catch (e) {
      setError(msg(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="card">
      <Seg label="AI tool" value={tool} onChange={(t) => { onTool(t); setEditing(false); setError(null); }} options={TOOLS.map((t) => ({ value: t, label: TOOL_LABEL[t].tab }))} />

      {tool === 'cycle_review' && (
        <p className="caption" style={{ marginTop: 12, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
          <Icon name={consent ? 'photo' : 'lock'} size={15} />
          <span>{photoCaption(photos, consent, first)}</span>
        </p>
      )}
      {tool === 'cycle_review' && photos.status === 'waiting' && !running && (
        <Button variant="ghost" size="sm" style={{ marginTop: 8 }} onClick={() => askPhotos(true)}>Cancel the request</Button>
      )}
      {request && <RequestTile r={request} first={first} />}

      {running && <p className="muted" style={{ marginTop: 16 }} role="status">Running with your key…</p>}
      {!running && !d && <p className="muted" style={{ marginTop: 16 }}>No {TOOL_LABEL[tool].noun} for {m.cycle.name} yet.</p>}
      {!running && d && (editing
        ? <EditForm d={d} onCancel={() => setEditing(false)} onSave={async (e) => { addDraft(await repo.saveAiEdit(d.id, e)); setEditing(false); }} />
        : <ResponseCard d={d} data={data} first={first} onEdit={() => setEditing(true)} onPublish={() => setSheet('publish')} onFull={() => setSheet('full')} onReply={setReply} />)}

      {error && <Notice icon="warning" tone="bad" title={`Couldn’t run the ${TOOL_LABEL[tool].noun}`} style={{ marginTop: 14 }}>{error}</Notice>}
      {!running && (
        <div style={{ marginTop: 14 }}>
          {el.needsKey
            ? <a href="#/settings" style={{ textDecoration: 'none' }}><ActionRow kind="timer">{el.text}</ActionRow></a>
            : <ActionRow kind={el.runnable ? 'ready' : 'timer'} onClick={run}>{el.text}</ActionRow>}
        </div>
      )}

      {d && <FullSheet open={sheet === 'full'} d={d} data={data} first={first} onClose={() => setSheet(null)} />}
      {d && sheet === 'publish' && (
        <PublishSheet d={d} data={data} state={state} today={today} first={first} onClose={() => setSheet(null)}
          onDone={(p, nd) => { addPub(p); addDraft(nd); setSheet(null); }} />
      )}
      <ReplySheet note={reply} first={first} onClose={() => setReply(null)} onSent={(p) => { addPub(p); setReply(null); }} cardId={card.id} />
    </div>
  );
}

/** The Cycle review tab's photo line: what's been asked, what came back, and whether consent lets it through. */
function photoCaption(p: ReturnType<typeof photoRequestState>, consent: boolean, first: string): string {
  const photosOff = consent ? '' : ` Photos are off, so none can go: only ${first} can turn them on, in BLOC.`;
  if (p.status === 'none') return `Photos are part of the review: ask ${first} for them first. They get a Home banner in BLOC and can send photos or skip.${photosOff}`;
  if (p.status === 'waiting') return `Asked ${first} for review photos ${fmt.dm(p.askedOn as string)}. The review waits for their photos, or for them to skip.${photosOff}`;
  if (p.skipped) return `${first} skipped photos${p.answer ? ` on ${fmt.dm(p.answer.createdAt.slice(0, 10))}` : ''}. The review runs on the numbers alone.`;
  const n = p.before.length + p.after.length;
  return consent
    ? `${first} sent ${p.before.length} before and ${p.after.length} after photo${p.after.length === 1 ? '' : 's'}${p.answer ? ` on ${fmt.dm(p.answer.createdAt.slice(0, 10))}` : ''}. They go to the model with the review, and aren’t kept.`
    : `${first} sent ${n} photo${n === 1 ? '' : 's'}, but has since turned photos off, so the review runs without them.`;
}

function RequestTile({ r, first }: { r: Submission; first: string }) {
  const note = String(r.body?.note || '').trim();
  return (
    <div className="tile" style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <span className="t-acc" style={{ marginTop: 1 }}><Icon name="message" size={18} /></span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700 }}>{first} asked for a check-in · {fmt.dm(String(r.body?.sent_on || r.createdAt.slice(0, 10)))}</div>
        <div className="muted" style={{ marginTop: 2 }}>{r.body?.feel ? `Feeling ${String(r.body.feel).toLowerCase()}` : 'No feel given'}{note ? `: “${note}”` : ''}</div>
        <div className="caption" style={{ marginTop: 4 }}>Their feel and note go into the check-in.</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- the response card

function ResponseCard({ d, data, first, onEdit, onPublish, onFull, onReply }: {
  d: AiDraft; data: AiData; first: string; onEdit: () => void; onPublish: () => void; onFull: () => void; onReply: (s: Submission) => void;
}) {
  const e = sentEdit(d);
  const { state: ps, pub } = publishState(d, data.publications);
  const sig = SIGNAL[String(d.original.response?.signal)];
  const plan = planChoices(d.tool, d.original).find((p) => p.key === e.planKey);
  const notes = notesBack(data.submissions, data.publications, d.id);
  return (
    <div style={{ marginTop: 16 }}>
      <div className="row">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {sig && <Chip tone={sig.tone}>{sig.label}</Chip>}
          {ps === 'draft' && <Chip tone="amber">Draft · not sent</Chip>}
          {ps === 'changed' && <Chip tone="amber">Edited since publishing</Chip>}
          {ps === 'published' && pub && <Chip tone="good" icon="check">Published {fmt.dm(pub.createdAt.slice(0, 10))}</Chip>}
          {pub && <Chip tone={pub.ack?.status === 'needs_attention' ? 'bad' : 'neutral'}>{pub.ack ? ACK_TEXT[pub.ack.status] : 'Not opened yet'}</Chip>}
        </div>
        <IconButton icon="edit" label={`Edit ${TOOL_LABEL[d.tool].noun}`} inCard onClick={onEdit} />
      </div>
      {pub?.ack?.status === 'needs_attention' && pub.ack.note && <p className="caption t-bad" style={{ marginTop: 6 }}>{pub.ack.note}</p>}
      <div className="display" style={{ fontSize: 17, lineHeight: 1.35, marginTop: 10 }}>{e.headline}</div>
      {e.narrative[0] && <p className="body-copy" style={{ marginTop: 8 }}>{e.narrative[0]}</p>}
      {(e.kcal != null || e.steps != null || e.compliance != null) && (
        <div className="tile num" style={{ marginTop: 12, display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13 }}>
          {plan && <span className="caption" style={{ flexBasis: '100%' }}>{d.tool === 'check_in' ? `${plan.label} plan · ${e.phases.length} goal phase${e.phases.length === 1 ? '' : 's'}` : `${plan.label}`}</span>}
          {d.tool === 'check_in' && !e.planKey && <span className="caption" style={{ flexBasis: '100%' }}>No goal change</span>}
          {e.kcal != null && <span style={{ whiteSpace: 'nowrap' }}><b>{fmt.int(e.kcal)}</b> kcal</span>}
          {e.steps != null && <span style={{ whiteSpace: 'nowrap' }}><b>{fmt.int(e.steps)}</b> steps</span>}
          {e.compliance != null && <span style={{ whiteSpace: 'nowrap' }}><b>{e.compliance.toFixed(1)}</b>/10 compliance</span>}
        </div>
      )}
      <p className="caption" style={{ marginTop: 10 }}>
        Ran {fmt.ddm(d.createdAt.slice(0, 10))} · judged at {fmt.dm(d.original.today)}, {first}’s date{isEdited(d) ? ' · edited by you · original kept' : ' · unedited'}
        {d.original.photos && (d.original.photos.before || d.original.photos.after) ? ` · ${d.original.photos.before + d.original.photos.after} photos` : ''}
      </p>
      {notes.map(({ note, reply }) => (
        <div key={note.id} className="tile" style={{ marginTop: 12 }}>
          <span className="label" style={{ marginBottom: 4 }}>Note back from {first} · {fmt.dm(note.createdAt.slice(0, 10))}</span>
          <p style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{String(note.body?.text || '')}</p>
          {reply
            ? <p className="caption" style={{ marginTop: 8 }}><Icon name="check" size={13} /> You replied {fmt.dm(reply.createdAt.slice(0, 10))}: “{String(reply.payload?.text || '')}”</p>
            : <Button variant="ghost" size="sm" icon="message" style={{ marginTop: 10 }} onClick={() => onReply(note)}>Reply to {first}</Button>}
        </div>
      ))}
      {ps !== 'published' && <Button size="card" icon="send" style={{ marginTop: 14 }} onClick={onPublish}>{ps === 'changed' ? `Publish the update to ${first}` : `Publish to ${first}`}</Button>}
      <div className="btnrow" style={{ marginTop: ps !== 'published' ? 8 : 16 }}><Button variant="ghost" size="card" onClick={onFull}>{TOOL_LABEL[d.tool].read}</Button></div>
    </div>
  );
}

// ---------------------------------------------------------------- edit

function EditForm({ d, onCancel, onSave }: { d: AiDraft; onCancel: () => void; onSave: (e: AiEdit) => Promise<void> }) {
  const id = useId();
  const [e, setE] = useState<AiEdit>(sentEdit(d));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const plans = planChoices(d.tool, d.original);
  const numIn = (v: number | null) => (v == null ? '' : String(v));
  const toNum = (s: string) => (s.trim() === '' ? null : Math.round(Number(s)));
  const setPhase = (i: number, k: 'kcal' | 'protein' | 'carbs' | 'steps', val: string) => setE((x) => {
    const phases = x.phases.map((p, j) => (j === i ? { ...p, [k]: toNum(val) ?? 0 } : p));
    return { ...x, phases, kcal: phases[0]?.kcal ?? null, steps: phases[0]?.steps ?? null };
  });
  return (
    <form style={{ marginTop: 16 }} onSubmit={async (ev) => {
      ev.preventDefault(); setBusy(true); setError(null);
      try { await onSave(e); } catch (x) { setError(msg(x)); setBusy(false); }
    }}>
      <p className="caption" style={{ marginBottom: 12 }}>Editing keeps the original response. {d.publicationId ? 'Saving turns it back into a draft until you publish the update.' : ''}</p>
      <Field label="Headline" htmlFor={`${id}-h`}><input id={`${id}-h`} className="input box" value={e.headline} onChange={(x) => setE({ ...e, headline: x.target.value })} /></Field>
      {e.narrative.map((p, i) => (
        <Field key={i} label={`Paragraph ${i + 1}`} htmlFor={`${id}-p${i}`}>
          <textarea id={`${id}-p${i}`} className="input" value={p} onChange={(x) => setE({ ...e, narrative: e.narrative.map((q, j) => (j === i ? x.target.value : q)) })} />
        </Field>
      ))}
      <Button variant="ghost" size="sm" icon="plus" onClick={() => setE({ ...e, narrative: [...e.narrative, ''] })}>Add a paragraph</Button>

      {d.tool === 'check_in' && (
        <div style={{ marginTop: 18 }}>
          <span className="label">Goal change</span>
          <Seg label="Goal change" value={e.planKey ?? 'none'} onChange={(k) => setE(withPlan(d, { ...e, planKey: k === 'none' ? null : k }))}
            options={[...plans.map((p) => ({ value: p.key, label: p.label })), { value: 'none', label: 'No change' }]} />
          {e.phases.map((p, i) => (
            <div key={p.id} className="tile" style={{ marginTop: 10 }}>
              <div className="row"><b>{p.label || `Phase ${i + 1}`}</b><span className="caption" style={{ whiteSpace: 'nowrap' }}>{fmt.range(p.startDate, p.endDate)}</span></div>
              <div className="tiles-2" style={{ marginTop: 8 }}>
                <Field label="Daily kcal" htmlFor={`${id}-k${i}`}><input id={`${id}-k${i}`} type="number" inputMode="numeric" step={25} className="input box num" value={p.kcal} onChange={(x) => setPhase(i, 'kcal', x.target.value)} /></Field>
                <Field label="Daily steps" htmlFor={`${id}-s${i}`}><input id={`${id}-s${i}`} type="number" inputMode="numeric" step={500} className="input box num" value={p.steps} onChange={(x) => setPhase(i, 'steps', x.target.value)} /></Field>
                <Field label="Protein g" htmlFor={`${id}-pr${i}`}><input id={`${id}-pr${i}`} type="number" inputMode="numeric" step={5} className="input box num" value={p.protein} onChange={(x) => setPhase(i, 'protein', x.target.value)} /></Field>
                <Field label="Carbs g" htmlFor={`${id}-c${i}`}><input id={`${id}-c${i}`} type="number" inputMode="numeric" step={5} className="input box num" value={p.carbs} onChange={(x) => setPhase(i, 'carbs', x.target.value)} /></Field>
              </div>
            </div>
          ))}
        </div>
      )}
      {d.tool === 'next_cycle' && (
        <div style={{ marginTop: 18 }}>
          {plans.length > 1 && <><span className="label">Plan</span><Seg label="Plan" value={e.planKey ?? ''} onChange={(k) => setE(withPlan(d, { ...e, planKey: k }))} options={plans.map((p) => ({ value: p.key, label: p.label }))} /></>}
          <div className="tiles-2" style={{ marginTop: 10 }}>
            <Field label="Daily kcal" htmlFor={`${id}-nk`}><input id={`${id}-nk`} type="number" inputMode="numeric" step={25} className="input box num" value={numIn(e.kcal)} onChange={(x) => setE({ ...e, kcal: toNum(x.target.value) })} /></Field>
            <Field label="Daily steps" htmlFor={`${id}-ns`}><input id={`${id}-ns`} type="number" inputMode="numeric" step={500} className="input box num" value={numIn(e.steps)} onChange={(x) => setE({ ...e, steps: toNum(x.target.value) })} /></Field>
          </div>
          <p className="caption" style={{ marginTop: 8 }}>The cycle itself is built in Plan.</p>
        </div>
      )}
      {d.tool === 'cycle_review' && e.compliance != null && (
        <p className="caption" style={{ marginTop: 14 }}>Compliance {e.compliance.toFixed(1)}/10 is calculated from the logs, so it isn’t edited here.</p>
      )}
      {error && <Notice icon="warning" tone="bad" title="Couldn’t save the edit" style={{ marginTop: 14 }}>{error}</Notice>}
      <div className="btnrow" style={{ marginTop: 18 }}>
        <Button variant="ghost" size="card" onClick={onCancel}>Cancel</Button>
        <Button size="card" type="submit" disabled={busy || !e.headline.trim()}>Save edit</Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- publish

function changesFor(d: AiDraft, e: AiEdit, state: BlocState, today: string, pubs: CoachPublication[]): GoalChanges | null {
  if (d.tool !== 'check_in' || !d.macroId) return null;
  const prior = priorPhaseIds(d.id, pubs);
  if (e.planKey && e.phases.length) return goalChanges(state, d.macroId, today, e.phases, prior, fmt.ddm);
  // No goal change now: only take back phases an earlier publish of this response sent.
  return prior.length ? { goals: [], remove_goal_ids: prior, lines: [{ kind: 'removed', text: `The ${prior.length} goal phase${prior.length === 1 ? '' : 's'} this check-in sent before` }] } : null;
}

const LINE_ICON = { ends: 'clock', removed: 'trash', new: 'plus', renamed: 'edit' } as const;

function PublishSheet({ d, data, state, today, first, onClose, onDone }: {
  d: AiDraft; data: AiData; state: BlocState; today: string; first: string; onClose: () => void;
  onDone: (p: CoachPublication, d: AiDraft) => void;
}) {
  const { repo } = useCoach();
  const e = sentEdit(d);
  const { pub } = publishState(d, data.publications);
  const changes = changesFor(d, e, state, today, data.publications);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    setBusy(true); setError(null);
    try {
      const p = await repo.publish(d.cardId, 'ai_response', aiResponsePayload(d, e, changes, !!pub), pub?.id ?? null);
      const nd = await repo.saveAiEdit(d.id, { ...e, sentAs: p.id }, p.id);
      onDone(p, nd);
    } catch (x) { setError(msg(x)); setBusy(false); }
  };
  return (
    <Sheet open onClose={onClose} title={pub ? `Publish the update to ${first}` : `Publish to ${first}`}>
      <p className="muted">{first} sees your {isEdited(d) ? 'edited ' : ''}words and numbers in Progress, under From your coach, read-only.{pub ? ' Their card will say “Updated”.' : ''} The next check-in is built from this version.</p>
      <div className="card" style={{ marginTop: 14 }}>
        <div className="display" style={{ fontSize: 16 }}>{contentOf(e).headline}</div>
        {changes && changes.lines.length > 0 && (
          <>
            <span className="label" style={{ marginTop: 12 }}>Also changes {first}’s goals</span>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {changes.lines.map((l, i) => (
                <li key={i} className="caption" style={{ display: 'flex', gap: 8, padding: '5px 0', borderTop: i ? '1px solid var(--divider)' : undefined, color: 'var(--text)' }}>
                  <span style={{ color: l.kind === 'removed' ? 'var(--red)' : 'var(--text3)' }}><Icon name={LINE_ICON[l.kind]} size={14} /></span>{l.text}
                </li>
              ))}
            </ul>
          </>
        )}
        {d.tool === 'check_in' && !e.planKey && <p className="caption" style={{ marginTop: 10 }}>No goal change: {first}’s goals stay as they are.</p>}
      </div>
      {e.planKey && e.phases[0] && e.phases[0].startDate < today && (
        <Notice icon="warning" tone="bad" title="This plan starts in the past" style={{ marginTop: 12 }}>
          It was run on {fmt.ddm(d.original.today)} and its first phase starts {fmt.ddm(e.phases[0].startDate)}, before {first}’s today ({fmt.ddm(today)}). Run a new check-in, or publish with No goal change.
        </Notice>
      )}
      <p className="caption" style={{ marginTop: 12 }}>Arrives within seconds if BLOC is open, otherwise the next time {first} opens it.</p>
      {error && <Notice icon="warning" tone="bad" title="Couldn’t publish" style={{ marginTop: 14 }}>{error}</Notice>}
      <Button style={{ marginTop: 18 }} icon="send" disabled={busy} onClick={go}>{busy ? 'Publishing…' : 'Publish'}</Button>
    </Sheet>
  );
}

// ---------------------------------------------------------------- full view

function FullSheet({ open, d, data, first, onClose }: { open: boolean; d: AiDraft; data: AiData; first: string; onClose: () => void }) {
  const [show, setShow] = useState<'sent' | 'original'>('sent');
  const e = sentEdit(d);
  const { state: ps, pub } = publishState(d, data.publications);
  const r = d.original.response || {};
  return (
    <Sheet open={open} onClose={onClose} title={`${TOOL_LABEL[d.tool].tab} · ${fmt.dm(d.createdAt.slice(0, 10))}`} wide>
      {isEdited(d) && (
        <Seg label="Version" value={show} onChange={setShow} options={[{ value: 'sent', label: ps === 'published' ? `What ${first} sees` : 'Your edit' }, { value: 'original', label: 'Original from BLOC' }]} />
      )}
      {show === 'sent' || !isEdited(d) ? (
        <>
          <div className="display" style={{ fontSize: 20, marginTop: 14, lineHeight: 1.3 }}>{e.headline}</div>
          {e.narrative.map((p, i) => <Para key={i}>{p}</Para>)}
          {e.phases.length > 0 && <Phases rows={e.phases} />}
          {e.phases.length === 0 && (e.kcal != null || e.steps != null) && (
            <div className="tiles-2" style={{ marginTop: 16 }}>
              <div className="tile"><div className="caption">Daily kcal</div><div className="stat">{e.kcal != null ? fmt.int(e.kcal) : '—'}</div></div>
              <div className="tile"><div className="caption">Daily steps</div><div className="stat">{e.steps != null ? fmt.int(e.steps) : '—'}</div></div>
            </div>
          )}
        </>
      ) : (
        <Original d={d} r={r} />
      )}
      <p className="caption" style={{ marginTop: 14 }}>
        {pub ? `Published ${fmt.ddm(pub.createdAt.slice(0, 10))}. ${first} only ever sees your version.` : `Draft. Not sent to ${first}.`}
      </p>
    </Sheet>
  );
}

function Para({ children }: { children: ReactNode }) {
  return <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text2)', marginTop: 10, whiteSpace: 'pre-wrap' }}>{children}</p>;
}
function Phases({ rows }: { rows: { label: string; startDate: string; endDate: string; kcal: number; protein: number; carbs: number; steps: number }[] }) {
  return (
    <div className="card list" style={{ marginTop: 14 }}>
      {rows.map((p, i) => (
        <div key={i} className="ex" style={{ alignItems: 'flex-start' }}>
          <span style={{ minWidth: 0 }}><b>{p.label || `Phase ${i + 1}`}</b><br /><span className="caption">{fmt.range(p.startDate, p.endDate)}</span></span>
          <span className="num caption" style={{ textAlign: 'right', color: 'var(--text)' }}>{fmt.int(p.kcal)} kcal · {fmt.int(p.steps)} steps<br />P {p.protein}g · C {p.carbs}g</span>
        </div>
      ))}
    </div>
  );
}

/** The reply as it came back, in BLOC Solo's own fields for the tool. */
function Original({ d, r }: { d: AiDraft; r: Loose }) {
  const list = (items: unknown) => (Array.isArray(items) && items.length ? <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{items.map((x, i) => <li key={i} className="body-copy">{String(x)}</li>)}</ul> : null);
  return (
    <>
      <div className="display" style={{ fontSize: 20, marginTop: 14, lineHeight: 1.3 }}>{String(r.headline || '')}</div>
      {String(r.narrative || '').split(/\n\s*\n/).filter(Boolean).map((p, i) => <Para key={i}>{p}</Para>)}
      {d.tool === 'check_in' && <>
        {r.primaryAction && <Para><b>This week:</b> {String(r.primaryAction)}</Para>}
        {planChoices('check_in', d.original).map((p) => (
          <div key={p.key} style={{ marginTop: 14 }}><span className="label">{p.label}</span><p className="caption">{p.summary}</p><Phases rows={p.goals as never} /></div>
        ))}
      </>}
      {d.tool === 'cycle_review' && <>
        <p className="caption" style={{ marginTop: 12 }}>Compliance {typeof r.complianceScore === 'number' ? `${r.complianceScore}/10` : '—'}{d.original.compliance?.overall != null ? ' (calculated)' : ''} · Bodyfat {String(r.bodyfatEstimate?.direction || '—')}</p>
        {r.bodyfatEstimate?.note && <Para>{String(r.bodyfatEstimate.note)}</Para>}
        {(r.highlights || []).length > 0 && <><span className="label" style={{ marginTop: 12 }}>Highlights</span>{list(r.highlights)}</>}
        {(r.improvements || []).length > 0 && <><span className="label" style={{ marginTop: 12 }}>To improve</span>{list(r.improvements)}</>}
        {r.stickingPoints && <><span className="label" style={{ marginTop: 12 }}>Sticking points</span><Para>{String(r.stickingPoints)}</Para></>}
        {r.ranTooLong && <Para>Ran too long: {String(r.ranTooLongNote || '')}</Para>}
      </>}
      {d.tool === 'next_cycle' && planChoices('next_cycle', d.original).map((p) => (
        <div key={p.key} style={{ marginTop: 14 }}><span className="label">{p.label}</span><p className="caption">{p.summary}</p><Phases rows={p.goals as never} /></div>
      ))}
    </>
  );
}

// ---------------------------------------------------------------- reply to a note back

function ReplySheet({ note, first, cardId, onClose, onSent }: { note: Submission | null; first: string; cardId: string; onClose: () => void; onSent: (p: CoachPublication) => void }) {
  const { repo } = useCoach();
  const id = useId();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setText(''); setError(null); setBusy(false); }, [note?.id]);
  if (!note) return null;
  const send = async () => {
    setBusy(true); setError(null);
    try { onSent(await repo.publish(cardId, 'note_reply', { v: 1, submission_id: note.id, text: text.trim() }, null)); }
    catch (x) { setError(msg(x)); setBusy(false); }
  };
  return (
    <Sheet open onClose={onClose} title={`Reply to ${first}`}>
      <div className="tile"><span className="caption">{first} wrote</span><p style={{ fontSize: 14, marginTop: 4, whiteSpace: 'pre-wrap' }}>{String(note.body?.text || '')}</p></div>
      <Field label="Your reply" htmlFor={`${id}-r`}><textarea id={`${id}-r`} className="input" maxLength={2000} value={text} onChange={(x) => setText(x.target.value)} /></Field>
      <p className="caption" style={{ marginTop: 8 }}>{first} sees it under their note, in Progress.</p>
      {error && <Notice icon="warning" tone="bad" title="Couldn’t send" style={{ marginTop: 14 }}>{error}</Notice>}
      <Button style={{ marginTop: 18 }} icon="send" disabled={busy || !text.trim()} onClick={send}>{busy ? 'Sending…' : 'Send reply'}</Button>
    </Sheet>
  );
}
