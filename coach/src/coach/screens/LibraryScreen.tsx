import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { getNextMonday, shiftDateStr } from '@engine';
import {
  Avatar, Button, Card, Chip, EmptyState, Field, Icon, Page, PageHeader, SearchSheet, Section, Seg, Sheet, Toast, useEntering, useOnResume, useToast,
} from '@/components/ui';
import { CoachShell, AccountButton } from '@/coach/CoachShell';
import { useCoach } from '@/app/App';
import { clientPath, navigate } from '@/app/router';
import { fmt } from '@/lib/format';
import { localDateIn } from '@/lib/clientState';
import { summarise, type ClientSummary } from '@/data/summary';
import type { ClientBundle, CoachRepo } from '@/data/types';
import { foldPlan } from '@/plan/fold';
import { dayKeys, endOf, makeIds, sessionLabel, type PlanDoc } from '@/plan/doc';
import { applyMacroTemplate, applyWorkoutTemplate, macroTemplateOf, workoutTemplateOf, type Template } from '@/plan/templates';
import { ApplyCycleSheet } from '@/coach/client/plan/PlanSheets';
import { WorkoutBuilder } from '@/coach/library/WorkoutBuilder';

const TOP = 4;
type Kind = Template['kind'];
const byUse = (a: Template, b: Template) => b.appliedLast90 - a.appliedLast90 || b.appliedCount - a.appliedCount || a.name.localeCompare(b.name);

/** A client's cycles the coach can edit (theirs, not past), each with its current working copy: the draft, else what's published. */
async function editableCycles(repo: CoachRepo, b: ClientBundle, coachId: string, today: string) {
  const data = await repo.loadPlan(b.card.id);
  const snap = b.link?.status === 'active' ? b.snapshot : null;
  const entries = foldPlan({ state: snap?.state ?? null, publications: data.publications, coachId, since: b.lastEndedAt });
  const out: { id: string; name: string; doc: PlanDoc; base: PlanDoc | null; end: string }[] = [];
  for (const e of entries.filter((x) => x.coachOwned)) {
    const d = data.drafts.find((x) => x.macroId === e.id);
    out.push({ id: e.id, name: e.name, doc: d?.body.doc ?? e.doc, base: e.doc, end: endOf(e.doc.macro) });
  }
  for (const d of data.drafts) if (!entries.some((e) => e.id === d.macroId) && d.body?.doc) out.push({ id: d.macroId, name: d.body.doc.macro.name, doc: d.body.doc, base: null, end: endOf(d.body.doc.macro) });
  return { cycles: out.filter((c) => c.end >= today).sort((a, b) => a.doc.macro.start.localeCompare(b.doc.macro.start)), all: out, entries };
}

/**
 * Library (proposal §5.5; TECHNICAL §144): macrocycle templates (whole
 * cycles, no dates) and workout templates (one session). Applying one gives
 * that client a fresh copy as a Plan draft. Each section shows the 4 most
 * used (applications in the last 90 days), with View all; Starred shows every
 * starred one.
 */
export function LibraryScreen() {
  const { repo, profile } = useCoach();
  const ref = useEntering<HTMLDivElement>('library');
  const toast = useToast();
  const [lib, setLib] = useState<Template[] | null>(null);
  const [bundles, setBundles] = useState<ClientBundle[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'starred'>('all');
  const [showAll, setShowAll] = useState<Record<Kind, boolean>>({ macrocycle: false, workout: false });
  const [applying, setApplying] = useState<Template | null>(null);
  const [saving, setSaving] = useState(false);
  const [building, setBuilding] = useState(false);
  const [deleting, setDeleting] = useState<Template | null>(null);
  const load = useCallback(() => {
    Promise.all([repo.loadTemplates(), repo.loadClients()])
      .then(([t, b]) => { setLib(t); setBundles(b); setError(null); })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [repo]);
  useEffect(load, [load]);
  useOnResume(load);

  const now = repo.now();
  const clients = useMemo(() => bundles.map((b) => ({ b, s: summarise(b, now) })).filter((x) => x.s.status !== 'unlinked'), [bundles, now]);
  const list = lib ?? [];
  const count = (k: Kind) => list.filter((t) => t.kind === k).length;
  const starred = list.filter((t) => t.starred).length;
  const visible = (k: Kind) => {
    const l = list.filter((t) => t.kind === k).sort(byUse);
    if (filter === 'starred') return l.filter((t) => t.starred);
    return showAll[k] ? l : l.slice(0, TOP);
  };
  const star = async (t: Template) => {
    setLib(list.map((x) => (x.id === t.id ? { ...x, starred: !x.starred } : x)));
    try { await repo.starTemplate(t.id, !t.starred); toast.show(t.starred ? `${t.name} unstarred` : `${t.name} starred`); } catch (e) { toast.show(e instanceof Error ? e.message : String(e)); load(); }
  };

  const section = (k: Kind, noun: string) => {
    const v = visible(k);
    return (
      <>
        {v.length === 0 ? (
          <EmptyState>{filter === 'starred' ? `No starred ${noun} yet. Tap the star on a template to keep it here.` : `No ${noun} yet. Save one from a client’s Plan, or below.`}</EmptyState>
        ) : (
          <div className="grid-2" style={{ gap: 12 }}>
            {v.map((t, i) => <div key={t.id}><TemplateCard t={t} i={3 + i} onApply={() => setApplying(t)} onStar={() => star(t)} onDelete={() => setDeleting(t)} /></div>)}
          </div>
        )}
        {filter === 'all' && count(k) > TOP && (
          <Button size="card" variant="ghost" icon={showAll[k] ? 'chevU' : 'chevD'} style={{ marginTop: 12, maxWidth: 420 }} aria-expanded={showAll[k]}
            onClick={() => setShowAll({ ...showAll, [k]: !showAll[k] })}>
            {showAll[k] ? 'Show the 4 most used' : `View all ${count(k)} ${noun}`}
          </Button>
        )}
      </>
    );
  };
  const slot = (k: Kind) => (filter === 'starred' ? <Chip tone="amber" icon="star">Starred</Chip> : !showAll[k] ? <Chip tone="neutral">Most used · 90 days</Chip> : undefined);

  return (
    <CoachShell tab="library">
      <Page innerRef={ref}>
        <PageHeader eyebrow="Templates" title="Library" actions={<AccountButton />} />
        {error && <div style={{ marginTop: 20 }}><EmptyState action={<Button size="sm" onClick={load}>Try again</Button>}>Couldn’t load the Library: {error}</EmptyState></div>}
        <div className="hero rise" style={{ ['--i' as string]: 1 } as CSSProperties}>
          <div className="tiles-3" style={{ textAlign: 'center' }}>
            <Stat value={count('macrocycle')} label="Cycle templates" />
            <Stat value={count('workout')} label="Workout templates" />
            <Stat value={starred} label="Starred" />
          </div>
          <p className="body-copy" style={{ marginTop: 16, textAlign: 'center' }}>Templates have no dates. Applying one gives that client their own fresh copy.</p>
        </div>
        <div className="rise" style={{ ['--i' as string]: 1, marginTop: 20, maxWidth: 420 } as CSSProperties}>
          <Seg label="Show templates" value={filter} onChange={setFilter} accent options={[{ value: 'all', label: 'All templates' }, { value: 'starred', label: `Starred (${starred})` }]} />
        </div>
        <Section i={2} title="Cycle templates" sub="Whole cycles, saved without dates. Apply one to a client from a start date." slot={slot('macrocycle')}>{section('macrocycle', 'cycle templates')}</Section>
        <Section i={3} title="Workout templates" sub="Single sessions. Run one with a group, or apply it into a session of a client’s cycle." slot={slot('workout')}>
          {section('workout', 'workout templates')}
          <Button size="card" variant="ghost" icon="plus" style={{ marginTop: 12, maxWidth: 420 }} onClick={() => setBuilding(true)}>New workout</Button>
        </Section>
        <Section i={4} title="Save as template" sub="Turn a client’s cycle, or one of its sessions, into a template. Dates and logs stay behind.">
          <Button style={{ maxWidth: 420 }} variant="ghost" icon="library" onClick={() => setSaving(true)}>Save as template</Button>
        </Section>
      </Page>

      {applying && (
        <ApplyFlow key={applying.id} template={applying} clients={clients} repo={repo} coachId={profile.coachId} now={now} onClose={() => setApplying(null)}
          onDone={(cardId, macroId, msg) => { setApplying(null); load(); toast.show(msg); navigate(clientPath(cardId, 'plan', macroId)); }} />
      )}
      {building && <WorkoutBuilder onClose={() => setBuilding(false)} onSaved={(t) => { setBuilding(false); setLib([...list, t]); toast.show(`${t.name} saved to Library`); }} />}
      {saving && (
        <SaveFlow clients={clients} repo={repo} coachId={profile.coachId} now={now} onClose={() => setSaving(false)}
          onSaved={(t) => { setSaving(false); setLib([...list, t]); toast.show(`${t.name} saved to Library`); }} />
      )}
      <Sheet open={!!deleting} title="Delete template?" onClose={() => setDeleting(null)}>
        <p className="muted">{deleting?.name}. Clients who already have a copy keep it; only the template goes.</p>
        <Button variant="danger" icon="trash" style={{ marginTop: 18 }} onClick={async () => {
          const t = deleting!;
          setDeleting(null);
          try { await repo.deleteTemplate(t.id); setLib(list.filter((x) => x.id !== t.id)); toast.show(`${t.name} deleted`); } catch (e) { toast.show(e instanceof Error ? e.message : String(e)); }
        }}>Delete {deleting?.name}</Button>
      </Sheet>
      <Toast msg={toast.msg} />
    </CoachShell>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return <div><div className="num" style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600 }}>{value}</div><div className="muted" style={{ fontSize: 12 }}>{label}</div></div>;
}

const GOAL = { loss: ['acc', 'Lose weight'], gain: ['good', 'Gain weight'], maintenance: ['neutral', 'Maintain'] } as const;

function TemplateCard({ t, i, onApply, onStar, onDelete }: { t: Template; i: number; onApply: () => void; onStar: () => void; onDelete: () => void }) {
  const m = t.body.kind === 'macrocycle' ? t.body.macro : null;
  const facts = m ? [`${m.weeks * m.weeksPerMeso + (m.extensionWeeks || 0)} weeks`, `${m.days.length} sessions a week`] : [`${t.body.kind === 'workout' ? t.body.exercises.length : 0} exercises`];
  const goal = m ? GOAL[m.goalType] : null;
  return (
    <Card i={i} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="row top-align">
        <div style={{ minWidth: 0 }}>
          <div className="display" style={{ fontSize: 17 }}>{t.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
            {goal ? <Chip tone={goal[0]}>{goal[1]}</Chip> : <Chip tone="neutral" icon="train">Workout</Chip>}
            <span className="caption num">{facts.join(' · ')}</span>
          </div>
        </div>
        <button type="button" className="icon-btn in-card" aria-pressed={t.starred} aria-label={t.starred ? `Unstar ${t.name}` : `Star ${t.name}`} onClick={onStar}
          style={{ color: t.starred ? 'var(--amber)' : 'var(--text3)' }}>
          <Icon name={t.starred ? 'starFilled' : 'star'} size={20} />
        </button>
      </div>
      <p className="body-copy" style={{ marginTop: 10, flex: 1 }}>{t.summary}</p>
      <div className="row" style={{ marginTop: 14 }}>
        <span className="caption">{t.appliedLast90} in 90 days · {t.appliedCount} all time</span>
        <span style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="icon-btn in-card" aria-label={`Delete ${t.name}`} onClick={onDelete} style={{ color: 'var(--text3)' }}><Icon name="trash" size={18} /></button>
          <Button size="compact" variant="ghost" icon="userPlus" onClick={onApply} aria-label={`Apply ${t.name} to a client`}>Apply</Button>
        </span>
      </div>
    </Card>
  );
}

type ClientRow = { b: ClientBundle; s: ClientSummary };

/** Picking a client: a search over the coach's clients. */
function ClientPicker({ open, title, clients, onClose, onPick }: { open: boolean; title: string; clients: ClientRow[]; onClose: () => void; onPick: (c: ClientRow) => void }) {
  const [q, setQ] = useState('');
  const list = clients.filter((c) => !q.trim() || c.s.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <SearchSheet open={open} title={title} onClose={onClose} query={q} onQuery={setQ} placeholder="Search clients">
      {list.map((c) => (
        <button key={c.b.card.id} type="button" className="ss-row" onClick={() => onPick(c)}>
          <Avatar initials={c.s.initials} size={34} />
          <span className="main"><b>{c.s.name}</b><small>{c.s.status === 'invited' ? 'Invited · not linked yet' : c.s.status === 'not-on-app' ? 'In person · not on the app' : c.s.cycleText}</small></span>
          <span style={{ color: 'var(--text3)' }}><Icon name="chevR" size={18} /></span>
        </button>
      ))}
      {!list.length && <p className="muted" style={{ padding: '14px 0' }}>{q ? 'No client matches.' : 'No clients yet.'}</p>}
    </SearchSheet>
  );
}

const todayOf = (c: ClientRow, now: number) => c.s.clientToday ?? localDateIn(Intl.DateTimeFormat().resolvedOptions().timeZone, now);

/** Apply a template: choose the client, then a start date (a cycle) or a session of one of their cycles (a workout). The copy lands in their Plan as a draft. */
function ApplyFlow({ template, clients, repo, coachId, now, onClose, onDone }: {
  template: Template; clients: ClientRow[]; repo: CoachRepo; coachId: string; now: number; onClose: () => void; onDone: (cardId: string, macroId: string, msg: string) => void;
}) {
  const [client, setClient] = useState<ClientRow | null>(null);
  const [cycles, setCycles] = useState<Awaited<ReturnType<typeof editableCycles>> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [cycleId, setCycleId] = useState<string>('');
  const [day, setDay] = useState<string>('new');
  const ids = useMemo(() => makeIds(() => Date.now()), []);
  useEffect(() => {
    if (!client) return;
    editableCycles(repo, client.b, coachId, todayOf(client, now)).then((c) => { setCycles(c); setCycleId(c.cycles[0]?.id ?? ''); }).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [client, repo, coachId, now]);
  const first = client ? client.s.name.split(' ')[0] : '';
  const today = client ? todayOf(client, now) : '';
  const running = cycles?.entries.find((e) => e.doc.macro.start <= today && endOf(e.doc.macro) >= today);
  const defaultStart = running ? shiftDateStr(endOf(running.doc.macro), 1) : getNextMonday({ today: today ? shiftDateStr(today, 1) : '2000-01-03' });

  if (!client) return <ClientPicker open title={`Apply ${template.name}`} clients={clients} onClose={onClose} onPick={setClient} />;
  if (template.body.kind === 'macrocycle') {
    const body = template.body;
    return (
      <ApplyCycleSheet open={!!cycles} template={template} defaultStart={defaultStart} first={first} onClose={onClose}
        onApply={async (start, name) => {
          try {
            const doc = applyMacroTemplate(body, start, ids, name);
            await repo.savePlanDraft(client.b.card.id, doc.macro.id, { v: 1, doc, base: null });
            await repo.recordApplication(template.id, client.b.card.id);
            onDone(client.b.card.id, doc.macro.id, `${template.name} added to ${first}’s plan from ${fmt.dm(start)}, as a draft`);
          } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
        }} />
    );
  }
  const body = template.body;
  const target = cycles?.cycles.find((c) => c.id === cycleId) ?? null;
  return (
    <Sheet open title={`Apply ${template.name}`} onClose={onClose}>
      <p className="muted" style={{ marginBottom: 14 }}>To {client.s.name}. It fills a session of one of their cycles, or adds a new one, as a Plan draft.</p>
      {err && <p className="caption t-bad">{err}</p>}
      {!cycles ? <div aria-busy="true" style={{ minHeight: 80 }} />
        : !cycles.cycles.length ? <EmptyState>{first} has no cycle of yours to add it to. Start one in their Plan first.</EmptyState>
        : (
          <>
            <Field label="Cycle" htmlFor="apply-cycle">
              <select id="apply-cycle" className="input" value={cycleId} onChange={(e) => { setCycleId(e.target.value); setDay('new'); }}>
                {cycles.cycles.map((c) => <option key={c.id} value={c.id}>{c.name} · {fmt.range(c.doc.macro.start, c.end)}</option>)}
              </select>
            </Field>
            {target && (
              <Field label="Session" htmlFor="apply-day" hint={day === 'new' ? `Adds “${body.label}” as a new session.` : `Replaces its exercises${target.doc.macro.useMicrocycles ? ', in M1 and M2' : ''}.`}>
                <select id="apply-day" className="input" value={day} onChange={(e) => setDay(e.target.value)}>
                  <option value="new">A new session</option>
                  {target.doc.macro.days.map((d) => <option key={d} value={d}>{target.doc.macro.dayLabels[d] || d}</option>)}
                </select>
              </Field>
            )}
            <Button style={{ marginTop: 20 }} icon="check" disabled={!target} onClick={async () => {
              if (!target) return;
              try {
                const next = applyWorkoutTemplate(target.doc, body, day, ids).doc;
                await repo.savePlanDraft(client.b.card.id, target.id, { v: 1, doc: next, base: target.base ? JSON.stringify(target.base) : null });
                await repo.recordApplication(template.id, client.b.card.id);
                onDone(client.b.card.id, target.id, `${template.name} added to ${first}’s ${target.name}, as a draft`);
              } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
            }}>Apply to {first}</Button>
          </>
        )}
    </Sheet>
  );
}

/** Save as template from the Library: a client, one of their cycles (yours), then the whole cycle or one session. */
function SaveFlow({ clients, repo, coachId, now, onClose, onSaved }: {
  clients: ClientRow[]; repo: CoachRepo; coachId: string; now: number; onClose: () => void; onSaved: (t: Template) => void;
}) {
  const [client, setClient] = useState<ClientRow | null>(null);
  const [all, setAll] = useState<{ id: string; name: string; doc: PlanDoc; end: string }[] | null>(null);
  const [cycleId, setCycleId] = useState('');
  const [kind, setKind] = useState<Kind>('macrocycle');
  const [dk, setDk] = useState('');
  const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!client) return;
    editableCycles(repo, client.b, coachId, '0000-00-00').then((c) => {
      setAll(c.all);
      const f = c.all[c.all.length - 1];
      if (f) { setCycleId(f.id); setName(f.name); setDk(dayKeys(f.doc.macro)[0]); }
    }).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [client, repo, coachId]);
  if (!client) return <ClientPicker open title="Save from a client" clients={clients} onClose={onClose} onPick={setClient} />;
  const c = all?.find((x) => x.id === cycleId) ?? null;
  const tpl = c ? (kind === 'macrocycle' ? macroTemplateOf(c.doc) : workoutTemplateOf(c.doc, dk, name)) : null;
  void now;
  return (
    <Sheet open title="Save as template" onClose={onClose}>
      <p className="muted" style={{ marginBottom: 14 }}>From {client.s.name}.</p>
      {!all ? <div aria-busy="true" style={{ minHeight: 80 }} /> : !all.length ? <EmptyState>{client.s.name.split(' ')[0]} has no cycle of yours yet.</EmptyState> : (
        <>
          <Seg<Kind> label="Template type" value={kind} onChange={(k) => { setKind(k); if (c) setName(k === 'macrocycle' ? c.name : sessionLabel(c.doc.macro, dk).replace(/ · M[12]$/, '')); }}
            options={[{ value: 'macrocycle', label: 'Whole cycle' }, { value: 'workout', label: 'One session' }]} />
          <Field label="Cycle" htmlFor="save-cycle">
            <select id="save-cycle" className="input" value={cycleId} onChange={(e) => { const n = all.find((x) => x.id === e.target.value)!; setCycleId(n.id); setDk(dayKeys(n.doc.macro)[0]); if (kind === 'macrocycle') setName(n.name); }}>
              {all.map((x) => <option key={x.id} value={x.id}>{x.name} · {fmt.range(x.doc.macro.start, x.end)}</option>)}
            </select>
          </Field>
          {kind === 'workout' && c && (
            <Field label="Session" htmlFor="save-day">
              <select id="save-day" className="input" value={dk} onChange={(e) => { setDk(e.target.value); setName(sessionLabel(c.doc.macro, e.target.value).replace(/ · M[12]$/, '')); }}>
                {dayKeys(c.doc.macro).map((d) => <option key={d} value={d}>{sessionLabel(c.doc.macro, d)}</option>)}
              </select>
            </Field>
          )}
          <Field label="Template name" htmlFor="save-name"><input id="save-name" className="input" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></Field>
          {tpl && <p className="body-copy" style={{ marginTop: 12 }}>{tpl.summary}</p>}
          <p className="caption" style={{ marginTop: 8 }}>Saved without dates. The client’s logs and notes stay with them.</p>
          {err && <p className="caption t-bad" style={{ marginTop: 8 }}>{err}</p>}
          <Button style={{ marginTop: 18 }} icon="library" disabled={!tpl || !name.trim() || busy} onClick={async () => {
            if (!tpl) return;
            setBusy(true);
            try { onSaved(await repo.saveTemplate({ kind, name: name.trim(), summary: tpl.summary, body: tpl.body })); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
          }}>{busy ? 'Saving…' : 'Save to Library'}</Button>
        </>
      )}
    </Sheet>
  );
}
