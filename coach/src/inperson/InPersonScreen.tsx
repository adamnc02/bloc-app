// ═══════════════════════════════════════════════════════════════════════
// In person (the wireframe's InPersonScreen, one-to-one; TECHNICAL §154): Start session on a booking.
//
// 1. Which session: the week agenda, on the one the coach tagged for this booking or else the client's next
//    unfinished one. Choosing it assigns it (a quiet `booking` publication with `assigned_session`), so the
//    client's Train shows it read-only from that moment. It can be changed until a set is done; with every set
//    cleared again it can be changed again.
// 2. Logging: each exercise with Train's targets at the client's date; sets, the tick, Fill suggested, Clear.
//    Kept on this device as it goes (draft.ts).
// 3. Finish: when the cycle has ratings on, BLOC's "How hard was it?" (rated by the coach); then the
//    `session_log` publication, and the assignment released (the session is coach-logged now). A client not on
//    the app has it kept on their card, and it comes across if they link.
// A client not on the app also has Measurements here.
// A session a client not on the app did ON THEIR OWN (from a printed sheet, §162) opens here too, on `own:{date}`:
// no booking, so nothing is assigned or released; Done as planned completes every set at target in one tap; it's
// saved as their session, labelled "On their own" in Coach.
// A group session has its own screen (group/GroupSessionScreen.tsx, §162).
// ═══════════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { BlocState, Loose, Macrocycle } from '@engine';
import { CoachShell } from '@/coach/CoachShell';
import { Bar, Button, Card, EmptyState, Hero, Icon, Notice, Page, PageHeader, Section, Tag, Toast, useEntering } from '@/components/ui';
import { useCoach } from '@/app/App';
import { clientPath, groupSessionPath, navigate, sessionBack } from '@/app/router';
import { displayName, linkStatusOf } from '@/data/summary';
import { addDays, fmt } from '@/lib/format';
import { occurrencesBetween, type Occurrence } from '@/diary/model';
import { assignSession, publishedIdOf } from '@/diary/actions';
import { seriesAssignment } from '@/diary/publish';
import type { AssignedSession, Diary } from '@/diary/types';
import { useDiaryData } from '@/coach/diary/useDiaryData';
import {
  agendaOf, cycleForSession, defaultSession, loggedFor, ownDateOf, ownSessionIdFor, ratingsOn, sameSession, sessionIdFor, sessionLogPayload, sessionTargets,
  type ExerciseTarget, type Ratings, type SetEntry,
} from './model';
import { dropDraft, loadDraft, saveDraft, type InPersonDraft } from './draft';
import { useRecord } from './useRecord';
import { SessionPicker } from './SessionPicker';
import { blankSets, ExerciseLogCard } from './ExerciseLogCard';
import { EffortSheet } from './EffortSheet';
import { MeasurementsForm, type MeasurementPayload } from './Measurements';

/** A diary week or one-off by its key, within two months either side (a missed one is at most 14 days back). */
export const findOccurrence = (d: Diary, key: string, today: string) => occurrencesBetween(d, addDays(today, -60), addDays(today, 60)).find((o) => o.key === key) ?? null;

/** The session assigned to one attendee of a diary week: its own row, or (a week still in its series) the series'. */
export function assignedFor(d: Diary, occ: Occurrence, cardId: string): AssignedSession | null {
  if (occ.bookingId) {
    const b = d.bookings.find((x) => x.id === occ.bookingId);
    const own = b?.assigned?.[cardId] ?? null;
    if (own || !occ.recurring) return own;
  }
  const s = occ.seriesId ? d.series.find((x) => x.id === occ.seriesId) : null;
  return s ? seriesAssignment(d, s, cardId) : null;
}

const volumeOf = (sets: Record<string, SetEntry[]>) => Object.values(sets).flat().filter((s) => s.done).reduce((a, s) => a + (parseFloat(s.kg) || 0) * (parseFloat(s.reps) || 0), 0);

export function InPersonScreen({ occKey, cardId }: { occKey: string; cardId: string }) {
  const { repo } = useCoach();
  const ref = useEntering<HTMLDivElement>(`in-person-${occKey}`);
  const { diary, bundles, error, run, today: coachToday, toast } = useDiaryData();
  const bundle = bundles?.find((b) => b.card.id === cardId) ?? null;
  const rec = useRecord(bundle);
  const back = useMemo(() => sessionBack(), []);
  const backLabel = back.route.name === 'diary' ? 'Diary' : back.route.name === 'client' ? 'Client' : back.route.name === 'clients' ? 'Clients' : 'Today';
  const eyebrow = <a href={back.href} className="eyebrow eyebrow-link"><Icon name="chevL" size={14} /> {backLabel}</a>;

  const [draft, setDraft] = useState<InPersonDraft | null>(() => loadDraft(occKey, cardId));
  const [picking, setPicking] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [rating, setRating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ sets: Record<string, SetEntry[]>; names: Record<string, string> } | null>(null);
  useEffect(() => { if (draft) saveDraft(occKey, cardId, draft); }, [draft, occKey, cardId]);

  // A session done on their own has no diary week: `own:{date}` stands in for one (no booking, no time).
  const ownDate = ownDateOf(occKey);
  const found = diary && !ownDate ? findOccurrence(diary, occKey, coachToday) : null;
  const occ: Occurrence | null = ownDate
    ? { key: occKey, kind: 'one_to_one', date: ownDate, start: 0, duration: 0, title: null, location: null, clientIds: [cardId], recurring: false, seriesId: null, seriesDate: null, bookingId: null, request: null, workout: null }
    : found;
  const macro: Macrocycle | null = rec.state && occ ? cycleForSession(rec.state, rec.today, occ.date) : null;
  const units = useMemo(() => (rec.state && macro ? agendaOf(rec.state, macro, rec.today) : []), [rec.state, macro, rec.today]);
  const targets = useMemo<ExerciseTarget[]>(() => (rec.state && macro && draft && draft.macroId === macro.id
    ? sessionTargets(structuredClone(rec.state) as BlocState, macro, draft.week, draft.dayKey) : []), [rec.state, macro, draft?.macroId, draft?.week, draft?.dayKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const name = bundle ? displayName(bundle) : 'Client';
  const first = name.split(' ')[0] || name;
  const notOnApp = !!bundle && linkStatusOf(bundle) !== 'linked';
  const shell = (body: ReactNode, title = 'In person', sub?: string) => (
    <CoachShell tab="today"><Page innerRef={ref}><PageHeader eyebrow={eyebrow} title={title} sub={sub} />{body}</Page><Toast msg={toast.msg} /></CoachShell>
  );

  if (error || rec.error) return shell(<EmptyState>Couldn’t load the session: {error ?? rec.error}</EmptyState>);
  if (!diary || !bundles || !rec.state) return <CoachShell tab="today"><div className="page" aria-busy="true" /></CoachShell>;
  if (!occ || !bundle || !occ.clientIds.includes(cardId)) return shell(<EmptyState>That session isn’t in the diary any more.</EmptyState>);
  if (occ.kind === 'group') { navigate(groupSessionPath(occKey)); return null; }
  if (ownDate && !notOnApp) return shell(<EmptyState>{first} is on BLOC and logs their own sessions there.</EmptyState>);
  const sub = ownDate ? `${name} · on their own · ${fmt.ddm(occ.date)}` : `${name} · in person · ${fmt.ddm(occ.date)}, ${fmt.time(occ.start)}`;
  if (!macro) {
    return shell(
      <div style={{ marginTop: 24 }}><EmptyState action={<Button size="card" variant="ghost" onClick={() => navigate(clientPath(cardId, 'plan'))}>Open {first}’s plan</Button>}>
        There’s no plan of yours to log against on {fmt.ddm(occ.date)}. In person logs a session of a cycle you’ve published.
      </EmptyState></div>, name, sub);
  }

  const bookingId = ownDate ? null : publishedIdOf(occ);
  const tagged = ownDate ? null : assignedFor(diary, occ, cardId);
  const already = bookingId ? loggedFor(rec.logged, bookingId, occ.date) : null;
  const label = (s: AssignedSession) => units.flatMap((u) => u.sessions).find((x) => x.week === s.week && x.dayKey === s.dayKey)?.label ?? s.dayKey;
  const owned = !!draft && Object.values(draft.sets).some((xs) => xs.some((x) => x.done));
  const current = draft ? { macroId: draft.macroId, week: draft.week, dayKey: draft.dayKey } : defaultSession(rec.state, macro, rec.today, tagged);

  /** Choose (or change) the session: assign it on the booking, quietly, then start its sets from Train's targets. */
  const choose = async (s: AssignedSession) => {
    setPicking(false);
    if (!ownDate && !sameSession(s, tagged)) {
      const ok = await run((d) => assignSession(repo, d, occ, cardId, s), notOnApp ? null : `${label(s)} is ${first}’s session with you: read-only on their phone`);
      if (!ok) return;
    }
    const t = sessionTargets(structuredClone(rec.state!) as BlocState, macro, s.week, s.dayKey);
    setDraft({
      sessionId: draft?.sessionId ?? (bookingId ? sessionIdFor(bookingId, occ.date, Date.now().toString(36)) : ownSessionIdFor(occ.date, Date.now().toString(36))),
      macroId: s.macroId, week: s.week, dayKey: s.dayKey, rpe: {},
      sets: Object.fromEntries(t.map((x) => [String(x.ex.id), blankSets(x)])),
    });
    setOpen(t[0] ? { [String(t[0].ex.id)]: true } : {});
  };

  const finish = async (rpe: Ratings | null) => {
    if (!draft) return;
    setBusy(true);
    try {
      const payload = sessionLogPayload({ sessionId: draft.sessionId, bookingId, macroId: draft.macroId, week: draft.week, dayKey: draft.dayKey, sets: draft.sets, rpe });
      await repo.publish(cardId, 'session_log', payload as Loose, null);
      // The session is the coach's for good now (logged); the marker is done with.
      if (!ownDate && assignedFor(diary, occ, cardId)) await run((d) => assignSession(repo, d, occ, cardId, null), null);
      setSent({ sets: draft.sets, names: Object.fromEntries(targets.map((t) => [String(t.ex.id), String(t.ex.name)])) });
      dropDraft(occKey, cardId);
      setDraft(null);
      setRating(false);
      rec.reload();
      toast.show(notOnApp ? `Saved to ${first}’s record` : `Sent to ${first} · logged by you`);
    } catch (e) {
      toast.show(`Couldn’t send: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(false); }
  };
  const saveMeasurements = async (p: MeasurementPayload) => {
    try { await repo.publish(cardId, 'measurement', p as unknown as Loose, null); rec.reload(); toast.show(`Measurements saved to ${first}’s record`); }
    catch (e) { toast.show(`Couldn’t save: ${e instanceof Error ? e.message : String(e)}`); }
  };

  // ---- sent (this visit) or already logged
  if (sent || (!draft && already)) {
    const lines = sent
      ? Object.entries(sent.sets).map(([id, xs]) => { const d = xs.filter((x) => x.done); return [sent.names[id] ?? id, d.length ? `${d.length} × ${d[0].reps} · ${d[0].kg} kg` : 'Not done']; })
      : Object.entries((already!.pub.payload.logs as Record<string, Loose>) || {}).map(([id, e]) => {
        const xs = ((e?.sets as Loose[]) || []).filter((x) => x.done !== false);
        const ex = ((rec.state as Loose).exercises?.[`${already!.macroId}_1_${already!.dayKey}`] as Loose[] | undefined)?.find((x) => x.id === id);
        return [String(ex?.name ?? id), xs.length ? `${xs.length} × ${xs[0].reps} · ${xs[0].weight} kg` : 'Not done'];
      });
    return shell(<>
      <Hero>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span className="icon-tile" style={{ width: 44, height: 44, borderRadius: 14 }}><Icon name="check" size={24} /></span>
          <div>
            <div className="display" style={{ fontSize: 20 }}>Session {notOnApp ? 'saved' : 'sent'}</div>
            <div className="muted">{ownDate ? `On ${first}’s record: their session on their own, recorded by you.` : notOnApp ? `On ${first}’s record, logged by you in person.` : `On ${first}’s phone as if they’d logged it.`}</div>
          </div>
        </div>
      </Hero>
      <Section i={2} title={notOnApp ? 'On their record' : 'What they see'} sub={notOnApp ? `Kept for ${first}. It comes across if they link to BLOC later.` : `How the session shows in ${first}’s Train. It counts towards progression like any other.`}>
        <Card i={3}>
          <Notice icon="lock" title={ownDate ? 'On their own · recorded by you' : 'Logged by your coach · in person'}>{notOnApp ? `Read-only. ${first} isn’t on the app yet.` : `Read-only for ${first}. Only you can change it.`}</Notice>
          <div style={{ marginTop: 14 }}>{lines.map(([n, v]) => <div key={n} className="ex"><span>{n}</span><span className="num">{v}</span></div>)}</div>
        </Card>
        <Button style={{ marginTop: 16 }} onClick={() => navigate('/today')}>Back to Today</Button>
        <Button variant="ghost" style={{ marginTop: 10 }} onClick={() => navigate(clientPath(cardId, notOnApp ? 'sessions' : 'review'))}>{notOnApp ? `Open ${first}’s sessions` : `Open ${first}’s review`}</Button>
      </Section>
    </>, current ? label(current) : name, sub);
  }

  // ---- choosing the session
  if (!draft) {
    return shell(<>
      <Hero>
        <Notice icon="account" tone="neutral" title={current ? `${first}’s ${label(current)} · MC ${current.week}` : `${first} has nothing left in this cycle`}>
          {current
            ? (tagged && sameSession(current, tagged) ? `You tagged this session for today. ` : `${first}’s next unfinished session. `)
              + (ownDate ? `Record what ${first} did on their own on ${fmt.ddm(occ.date)}, from their sheet.` : notOnApp ? `${first} isn’t on the app: what you log is kept on their record.` : `Starting it makes it yours: ${first} sees it read-only.`)
            : 'Every session of the cycle is done or logged.'}
        </Notice>
        {current && <Button icon={ownDate ? 'edit' : 'play'} style={{ marginTop: 18 }} onClick={() => void choose(current)}>{ownDate ? `Record ${label(current)}` : `Start ${label(current)}`}</Button>}
        <Button variant="ghost" icon="list" style={{ marginTop: 10 }} onClick={() => setPicking(true)}>Choose another session</Button>
      </Hero>
      {picking && <SessionPicker title="Which session?" macro={macro} units={units} first={first} current={current} tagged={tagged} onPick={(s) => void choose(s)} onClose={() => setPicking(false)} />}
    </>, name, sub);
  }

  // ---- logging
  const all = Object.values(draft.sets).flat();
  const done = all.filter((s) => s.done).length;
  const doneExercises = targets.filter((t) => t.ex.category !== 'cardio' && (draft.sets[String(t.ex.id)] || []).some((x) => x.done));
  const deload = targets.some((t) => t.deload);
  return shell(<>
    <Hero>
      <div role="status" style={{ marginBottom: 18 }}>
        {owned ? (
          <Notice icon="lock" title={ownDate ? `Recording ${first}’s session` : 'This session is yours now'}>
            {ownDate ? `What ${first} did on their own. It’s kept on their record and counts towards progression like any other.` : notOnApp ? `You’re logging for ${first}. It’s kept on their record, marked logged by coach, in person.` : `${first} sees it read-only, marked ‘Logged by your coach · in person’. Sets reach their phone exactly as if they’d logged them.`}
          </Notice>
        ) : (
          <Notice icon="account" tone="neutral" title={`${first}’s ${label(draft)} · MC ${draft.week}`}>
            {notOnApp ? `${first} isn’t on the app. What you log is kept on their record and comes across if they link later.` : `${first} sees it read-only, “with your coach”. You can change the session until a set is done.`}
          </Notice>
        )}
      </div>
      {deload && <Notice icon="moon" tone="ice" title="Deload week" style={{ marginBottom: 18 }}>Deload targets shown. Progression resumes next week.</Notice>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, textAlign: 'center' }}>
        <div><div className="big num" style={{ fontSize: 30 }}>{targets.length}</div><div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Exercises</div></div>
        <div><div className="big num" style={{ fontSize: 30 }}>{done}<span style={{ color: 'var(--text3)' }}>/{all.length}</span></div><div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Sets done</div></div>
        <div><div className="big num" style={{ fontSize: 30 }}>{fmt.int(volumeOf(draft.sets))}<span style={{ fontSize: 14, color: 'var(--text3)' }}> kg</span></div><div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Volume</div></div>
      </div>
      <div style={{ marginTop: 8 }}><Bar value={all.length ? Math.max(0.03, done / all.length) : 0} label={`${done} of ${all.length} sets done`} /></div>
      {/* Once every set is done there's nothing left for it to complete, so it goes (§165). */}
      {ownDate && done < all.length && <Button size="card" icon="checkbox" style={{ marginTop: 16 }}
        onClick={() => setDraft({ ...draft, sets: Object.fromEntries(targets.map((t) => [String(t.ex.id), (draft.sets[String(t.ex.id)] ?? blankSets(t)).map((x, k) => ({ kg: x.kg || t.weights[k] || '', reps: x.reps || t.reps[k] || '', done: true }))])) })}>
        Done as planned</Button>}
      {!owned && <Button size="card" variant="ghost" icon="swap" style={{ marginTop: ownDate ? 10 : 16 }} onClick={() => setPicking(true)}>Change session</Button>}
    </Hero>

    <Section i={2} title="The session" sub={deload ? 'Deload targets shown.' : 'Tap an exercise to log sets. The tick button completes every set at target.'} slot={owned ? <Tag tone="acc">Logged by you</Tag> : undefined}>
      <div className="stack">
        {targets.map((t, k) => {
          const id = String(t.ex.id);
          return (
            <ExerciseLogCard key={id} n={k + 1} i={3 + k} t={t} sets={draft.sets[id] ?? blankSets(t)}
              onSets={(s) => setDraft({ ...draft, sets: { ...draft.sets, [id]: s } })}
              expanded={!!open[id]} onToggle={() => setOpen({ ...open, [id]: !open[id] })} />
          );
        })}
      </div>
    </Section>

    {notOnApp && !ownDate && (
      <Section i={3 + targets.length} title="Measurements" sub={`Weigh and measure ${first} while you’re together. Saved to their record.`}>
        <Card><MeasurementsForm state={rec.state} date={occ.date} onSave={(p) => void saveMeasurements(p)} /></Card>
      </Section>
    )}

    <Section i={4 + targets.length} title="Finish" sub={notOnApp ? `Saves the session to ${first}’s record. Unfinished sets count as not done.` : `Sends the session to ${first}’s phone. Unfinished sets count as not done.`}>
      <Button icon="check" disabled={!owned || busy} onClick={() => (ratingsOn(macro) && doneExercises.length ? setRating(true) : void finish(null))}>{notOnApp ? 'Finish session' : `Finish and send to ${first}`}</Button>
      {!owned && <p className="caption" style={{ marginTop: 10 }}>Log at least one set to finish.</p>}
    </Section>

    {picking && <SessionPicker title="Change session" macro={macro} units={units} first={first} current={current} tagged={tagged} onPick={(s) => void choose(s)} onClose={() => setPicking(false)} />}
    {rating && <EffortSheet exercises={doneExercises.map((t) => ({ id: String(t.ex.id), name: String(t.ex.name) }))} initial={draft.rpe} first={first} busy={busy}
      onDone={(r) => { setDraft({ ...draft, rpe: r }); void finish(r); }} onClose={() => setRating(false)} />}
  </>, label(draft), sub);
}
