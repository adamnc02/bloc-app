// ═══════════════════════════════════════════════════════════════════════
// A group session (TECHNICAL §162): Start session on a group booking.
//
// 1. The workout: the one planned for this week (0033), else the coach plans one here from the Library. Fixed once
//    started.
// 2. Attendees: per person, "Replaces {session}" (off by default): on, the group session stands in for that planned
//    session of their coach's cycle (done, not scored, its targets held on their phone). The session is their next
//    unfinished one, or one the coach chooses.
// 3. The circuit: each person's sets, logged in turn ("Logging for"). A person starts from what they did last time
//    in a group session with that exercise, else the workout's numbers.
// 4. Finish: each person with a set done gets a `session_log` (`kind: 'group'`) on their card. Nobody else is sent
//    anything. A client not on the app has it kept on their card.
// ═══════════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Loose } from '@engine';
import { CoachShell } from '@/coach/CoachShell';
import { Avatar, BackBar, Button, Card, EmptyState, Hero, Icon, Notice, Page, PageHeader, Section, Seg, SwitchRow, Tag, Toast, useEntering } from '@/components/ui';
import { useCoach } from '@/app/App';
import { navigate, sessionBack } from '@/app/router';
import { displayName, linkStatusOf } from '@/data/summary';
import { fmt, initials } from '@/lib/format';
import { planWorkout, publishedIdOf } from '@/diary/actions';
import type { AssignedSession } from '@/diary/types';
import { useDiaryData } from '@/coach/diary/useDiaryData';
import { findOccurrence } from '@/inperson/InPersonScreen';
import { agendaOf, cycleForSession, defaultSession, type ExerciseTarget } from '@/inperson/model';
import { ExerciseLogCard } from '@/inperson/ExerciseLogCard';
import { SessionPicker } from '@/inperson/SessionPicker';
import { TemplatePicker } from '@/coach/client/plan/PlanSheets';
import { audienceOf, type Template } from '@/plan/templates';
import { attended, groupPayload, groupSessionId, plannedFromTemplate, seedSets, workoutExercises, type GroupExercise } from './model';
import { dropGroupDraft, loadGroupDraft, saveGroupDraft, type GroupDraft } from './draft';
import { useRecords, type AttendeeRecord } from './useRecords';

const firstOf = (name: string) => name.split(' ')[0] || name;

/** The planned session a group can stand in for, for one person: their coach's cycle's next unfinished session, if it can be taken. */
function candidateFor(rec: AttendeeRecord | undefined, date: string): { macro: Loose; session: AssignedSession; label: string } | null {
  if (!rec) return null;
  const macro = cycleForSession(rec.state, rec.today, date);
  if (!macro) return null;
  const s = defaultSession(rec.state, macro, rec.today, null);
  if (!s) return null;
  const x = agendaOf(rec.state, macro, rec.today).flatMap((u) => u.sessions).find((y) => y.week === s.week && y.dayKey === s.dayKey);
  return x && x.assignable ? { macro, session: s, label: x.label } : null;
}

/** A station as In person's exercise card reads it: the person's starting sets are its targets. */
function stationTarget(ex: GroupExercise, rec: AttendeeRecord | undefined): ExerciseTarget {
  const seed = seedSets(ex, rec?.groups ?? []);
  const lastLog = (rec?.groups ?? []).map((g) => g.logs.find((l) => l.name.trim().toLowerCase() === ex.name.trim().toLowerCase())).find((l) => l && l.sets.length);
  return {
    ex: { id: ex.key, name: ex.name, category: 'weight', type: 'standard', trackingMode: 'total', reps: ex.reps },
    sets: ex.sets, weights: seed.map((x) => x.kg), reps: seed.map((x) => x.reps), deload: false, locked: false,
    last: Array.from({ length: ex.sets }, (_, i) => {
      const x = lastLog ? lastLog.sets[i] ?? null : null;
      return x ? { weight: x.weight, reps: x.reps } : { weight: null, reps: null };
    }),
  };
}

export function GroupSessionScreen({ occKey }: { occKey: string }) {
  const { repo } = useCoach();
  const ref = useEntering<HTMLDivElement>(`group-${occKey}`);
  const { diary, bundles, error, run, today: coachToday, toast } = useDiaryData();
  const back = useMemo(() => sessionBack(), []);
  const backLabel = back.route.name === 'diary' ? 'Diary' : back.route.name === 'client' ? 'Client' : 'Today';
  const backBar = <BackBar href={back.href} label={backLabel} />;

  const occ = diary ? findOccurrence(diary, occKey, coachToday) : null;
  const ids = occ?.clientIds.join('|') ?? '';
  const people = useMemo(() => (bundles && ids ? ids.split('|').map((c) => bundles.find((b) => b.card.id === c)).filter((b): b is NonNullable<typeof b> => !!b) : []), [bundles, ids]);
  const { records, error: recError, reload } = useRecords(people);

  const [draft, setDraft] = useState<GroupDraft | null>(() => loadGroupDraft(occKey));
  const [who, setWho] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [planning, setPlanning] = useState(false);
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [pickingFor, setPickingFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ cards: string[]; replaced: Record<string, string> } | null>(null);
  useEffect(() => { if (draft) saveGroupDraft(occKey, draft); }, [draft, occKey]);
  useEffect(() => { if (planning && !templates) repo.loadTemplates().then(setTemplates).catch(() => setTemplates([])); }, [planning, templates, repo]);

  const shell = (body: ReactNode, title = 'Group session', sub?: string) => (
    <CoachShell tab="today"><Page innerRef={ref}><PageHeader back={backBar} title={title} sub={sub} />{body}</Page><Toast msg={toast.msg} /></CoachShell>
  );
  if (error || recError) return shell(<EmptyState>Couldn’t load the session: {error ?? recError}</EmptyState>);
  if (!diary || !bundles) return <CoachShell tab="today"><div className="page" aria-busy="true" /></CoachShell>;
  if (!occ || occ.kind !== 'group') return shell(<EmptyState>That group session isn’t in the diary any more.</EmptyState>);
  if (!records) return <CoachShell tab="today"><div className="page" aria-busy="true" /></CoachShell>;

  const title = occ.title ?? 'Group session';
  const sub = `Group · ${people.length} ${people.length === 1 ? 'person' : 'people'} · ${fmt.ddm(occ.date)}, ${fmt.time(occ.start)}`;
  const bookingId = publishedIdOf(occ);
  const nameOf = (c: string) => { const b = people.find((x) => x.card.id === c); return b ? displayName(b) : 'Client'; };
  const loggedHere = people.filter((b) => records[b.card.id]?.groups.some((g) => g.bookingId === bookingId && g.date === occ.date));

  const plan = async (t: Template) => {
    setPlanning(false);
    const w = plannedFromTemplate(t);
    await run((d) => planWorkout(repo, d, occ, w, 'one'), `${w.name} planned for ${fmt.ddm(occ.date)}`);
  };
  const start = () => {
    const w = occ.workout;
    if (!w) return;
    const exs = workoutExercises(w);
    setDraft({
      sessionId: groupSessionId(bookingId, occ.date, Date.now().toString(36)), workout: w, replaces: {},
      sets: Object.fromEntries(people.map((b) => [b.card.id, Object.fromEntries(exs.map((ex) => [ex.key, seedSets(ex, records[b.card.id]?.groups ?? [])]))])),
    });
    setWho(people[0]?.card.id ?? null);
    setOpen(exs[0] ? { [exs[0].key]: true } : {});
  };
  const finish = async () => {
    if (!draft) return;
    setBusy(true);
    const exs = workoutExercises(draft.workout);
    const done: string[] = [];
    try {
      for (const b of people) {
        const c = b.card.id;
        if (!attended(draft.sets[c])) continue;
        const payload = groupPayload({ sessionId: draft.sessionId, bookingId, exercises: exs, sets: draft.sets[c], replaces: draft.replaces[c] ?? null });
        await repo.publish(c, 'session_log', payload as Loose, null);
        done.push(c);
      }
      const replaced: Record<string, string> = {};
      for (const c of done) {
        const r = draft.replaces[c];
        const rec = records[c];
        if (!r || !rec) continue;
        const m = (rec.state.macrocycles || []).find((x) => x.id === r.macroId);
        replaced[c] = (m ? agendaOf(rec.state, m, rec.today).flatMap((u) => u.sessions).find((x) => x.week === r.week && x.dayKey === r.dayKey)?.label : null) ?? r.dayKey;
      }
      setSent({ cards: done, replaced });
      dropGroupDraft(occKey);
      setDraft(null);
      reload();
      toast.show(`Sent to ${done.length} ${done.length === 1 ? 'person' : 'people'}`);
    } catch (e) {
      toast.show(`Couldn’t send${done.length ? ` (sent to ${done.map((c) => firstOf(nameOf(c))).join(', ')})` : ''}: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(false); }
  };

  const avatars = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ display: 'flex' }} aria-hidden="true">
        {people.map((b, k) => <span key={b.card.id} style={{ marginLeft: k ? -10 : 0, borderRadius: '50%', boxShadow: '0 0 0 3px var(--surface)' }}><Avatar initials={initials(displayName(b))} size={40} /></span>)}
      </div>
      <div className="muted">{people.map((b) => firstOf(displayName(b))).join(', ')}</div>
    </div>
  );

  // ---- sent this visit, or already logged
  if (sent || (!draft && loggedHere.length)) {
    const cards = sent ? sent.cards : loggedHere.map((b) => b.card.id);
    const replacedOf = (c: string) => {
      if (sent) return sent.replaced[c] ?? null;
      const g = records[c]?.groups.find((x) => x.bookingId === bookingId && x.date === occ.date);
      return g?.replaces ? g.replaces.dayKey : null;
    };
    return shell(<>
      <Hero>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span className="icon-tile" style={{ width: 44, height: 44, borderRadius: 14 }}><Icon name="check" size={24} /></span>
          <div>
            <div className="display" style={{ fontSize: 20 }}>Sent to {cards.length} {cards.length === 1 ? 'person' : 'people'}</div>
            <div className="muted">Shown as ‘Group session · logged by coach’.</div>
          </div>
        </div>
      </Hero>
      <Section i={2} title="In their history" sub="How the group session lands for each person.">
        <div className="card list">
          {cards.map((c) => {
            const r = replacedOf(c);
            const notOnApp = linkStatusOf(people.find((b) => b.card.id === c)!) !== 'linked';
            return (
              <div key={c} className="listrow" style={{ cursor: 'default' }}>
                <Avatar initials={initials(nameOf(c))} size={36} />
                <span className="main"><b>{nameOf(c)}</b><small className="muted" style={{ display: 'block', fontSize: 12.5, marginTop: 3 }}>
                  {r ? <>Replaces their planned <b>{r}</b>. It’s treated as swapped, so its target holds.</> : 'An extra session. Their progression isn’t affected.'}
                  {notOnApp ? ' Kept on their record.' : ''}
                </small></span>
                <Tag tone={r ? 'acc' : 'neutral'}>{r ? 'Swapped' : 'Extra'}</Tag>
              </div>
            );
          })}
        </div>
        <Button style={{ marginTop: 16 }} onClick={() => navigate('/today')}>Back to Today</Button>
      </Section>
    </>, title, sub);
  }

  // ---- before starting: the workout
  if (!draft) {
    const w = occ.workout;
    return shell(<>
      <Hero>
        {avatars}
        <Notice icon="group" title={w ? w.name : 'No workout planned'} style={{ marginTop: 18 }} tone={w ? 'acc' : 'amber'}>
          {w ? `${workoutExercises(w).map((e) => e.name).join(', ')}. Logged as an extra session for each person; it doesn’t affect their progression unless it replaces their planned session.`
            : 'Choose a workout from your Library to run with the group. It’s planned for this session only.'}
        </Notice>
        {w && <Button icon="play" style={{ marginTop: 18 }} onClick={start}>Start {w.name}</Button>}
        <Button variant="ghost" icon="library" style={{ marginTop: 10 }} onClick={() => setPlanning(true)}>{w ? 'Change workout' : 'Plan a workout'}</Button>
      </Hero>
      {planning && <TemplatePicker open kind="workout" title="Plan a workout" templates={(templates ?? []).filter((t) => audienceOf(t) === 'group')}
        empty={'No group workouts yet. Build one in Library → New workout (for a group), or switch a workout to Group on its card.'} onClose={() => setPlanning(false)} onPick={(t) => void plan(t)} />}
    </>, title, sub);
  }

  // ---- logging
  const exs = workoutExercises(draft.workout);
  const current = who && people.some((b) => b.card.id === who) ? who : people[0]?.card.id ?? null;
  const anyDone = people.some((b) => attended(draft.sets[b.card.id]));
  const count = (c: string) => { const xs = Object.values(draft.sets[c] || {}).flat(); return `${xs.filter((x) => x.done).length}/${xs.length}`; };
  const picking = pickingFor ? people.find((b) => b.card.id === pickingFor) : null;
  const pickRec = pickingFor ? records[pickingFor] : undefined;
  const pickMacro = pickRec ? cycleForSession(pickRec.state, pickRec.today, occ.date) : null;
  return shell(<>
    <Hero>
      {avatars}
      <Notice icon="group" title="Logged as an extra session" style={{ marginTop: 18 }}>
        {draft.workout.name}. It shows in each person’s history as ‘Group session · logged by coach’ and doesn’t affect their progression. Once you log, it’s yours; they see it read-only.
      </Notice>
    </Hero>

    <Section i={2} title="Attendees" sub="Choose whether this replaces anyone’s planned session today. If it does, that session counts as swapped.">
      <div className="grid-3" style={{ gap: 12 }}>
        {people.map((b, k) => {
          const c = b.card.id;
          const cand = candidateFor(records[c], occ.date);
          const chosen = draft.replaces[c] ?? null;
          const label = chosen && records[c]
            ? agendaOf(records[c].state, (records[c].state.macrocycles || []).find((m) => m.id === chosen.macroId)!, records[c].today).flatMap((u) => u.sessions).find((x) => x.week === chosen.week && x.dayKey === chosen.dayKey)?.label ?? chosen.dayKey
            : cand?.label ?? null;
          const setReplace = (s: AssignedSession | null) => setDraft({ ...draft, replaces: { ...draft.replaces, [c]: s } });
          return (
            <div key={c}>
              <Card i={3 + k}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <Avatar initials={initials(displayName(b))} size={40} />
                  <div style={{ minWidth: 0 }}>
                    <b style={{ display: 'block' }}>{displayName(b)}</b>
                    <span className="caption">{label ? `Next planned: ${label}` : 'No planned session to replace'}{linkStatusOf(b) !== 'linked' ? ' · not on the app' : ''}</span>
                  </div>
                </div>
                {label ? (
                  <>
                    <SwitchRow title={`Replaces ${label}`} sub={chosen ? 'Treated as swapped. Its target holds.' : 'Off: counted as an extra session.'}
                      checked={!!chosen} onChange={(v) => setReplace(v ? (chosen ?? cand!.session) : null)} label={`Group session replaces ${firstOf(displayName(b))}’s ${label}`} />
                    <Button size="compact" variant="ghost" icon="list" onClick={() => setPickingFor(c)}>Choose another session</Button>
                  </>
                ) : <p className="caption" style={{ marginTop: 12 }}>Counted as an extra session.</p>}
              </Card>
            </div>
          );
        })}
      </div>
    </Section>

    <Section i={3} title="The circuit" sub="Log each person’s sets. Pick who you’re logging for." slot={anyDone ? <Tag tone="acc">Logged by you</Tag> : undefined}>
      <Seg label="Logging for" value={current ?? ''} onChange={setWho} accent className="auto"
        options={people.map((b) => ({ value: b.card.id, label: <>{firstOf(displayName(b))} <span className="num" style={{ opacity: .7 }}>{count(b.card.id)}</span></> }))} />
      <p className="caption" style={{ marginTop: 10 }} aria-live="polite">
        {current && draft.replaces[current] ? 'Replaces their planned session: it’s treated as swapped, so its target holds.' : 'An extra session. Their progression isn’t affected.'}
      </p>
      {current && (
        <div className="stack" style={{ marginTop: 14 }}>
          {exs.map((ex, k) => (
            <ExerciseLogCard key={`${current}-${ex.key}`} n={k + 1} i={4 + k} t={stationTarget(ex, records[current])} sets={draft.sets[current]?.[ex.key] ?? []} lastLabel="Last time"
              onSets={(s) => setDraft({ ...draft, sets: { ...draft.sets, [current]: { ...(draft.sets[current] || {}), [ex.key]: s } } })}
              expanded={!!open[ex.key]} onToggle={() => setOpen({ ...open, [ex.key]: !open[ex.key] })} />
          ))}
        </div>
      )}
    </Section>

    <Section i={4 + exs.length} title="Finish" sub="Sends each person’s sets to their phone, as a group session. Someone with nothing logged isn’t sent anything.">
      <Button icon="check" disabled={!anyDone || busy} onClick={() => void finish()}>
        Finish and send to {people.filter((b) => attended(draft.sets[b.card.id])).length} {people.filter((b) => attended(draft.sets[b.card.id])).length === 1 ? 'person' : 'people'}
      </Button>
      {!anyDone && <p className="caption" style={{ marginTop: 10 }}>Log at least one set to finish.</p>}
      <Button variant="ghost" style={{ marginTop: 10 }} onClick={() => { dropGroupDraft(occKey); setDraft(null); }} disabled={busy}>Discard and start again</Button>
    </Section>

    {picking && pickRec && pickMacro && (
      <SessionPicker title={`Replaces which of ${firstOf(displayName(picking))}’s sessions?`} macro={pickMacro} units={agendaOf(pickRec.state, pickMacro, pickRec.today)}
        first={firstOf(displayName(picking))} current={draft.replaces[picking.card.id] ?? candidateFor(pickRec, occ.date)?.session ?? null}
        onPick={(s) => { setDraft({ ...draft, replaces: { ...draft.replaces, [picking.card.id]: s } }); setPickingFor(null); }}
        onClose={() => setPickingFor(null)} />
    )}
  </>, title, sub);
}
