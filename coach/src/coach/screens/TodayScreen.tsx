// Today (the wireframe's TodayScreen; TECHNICAL §154): the hub. Today's sessions first, then Needs you, Off
// track and Coming up; on a laptop Needs you is the right-hand column and the other three stack on the left.
// Every Needs you item opens where it's dealt with, and clears once it is. The model is today/model.ts.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccountButton, CoachShell } from '@/coach/CoachShell';
import { Avatar, Button, Card, Chip, EmptyState, Hero, Icon, OutcomeChip, Page, PageHeader, RowButton, Section, Sheet, Tag, Toast, useEntering, useOnResume, type IconName } from '@/components/ui';
import { useCoach } from '@/app/App';
import { clientPath, navigate, sessionPath, useRoute } from '@/app/router';
import { summarise } from '@/data/summary';
import type { Inbox } from '@/data/types';
import { fmt, initials } from '@/lib/format';
import { lengthLabel } from '@/diary/slots';
import { requestSlot, type Occurrence } from '@/diary/model';
import { bookRequest, cancelSession, declineRequest, proposeTime } from '@/diary/actions';
import { useDiaryData } from '@/coach/diary/useDiaryData';
import { RequestSheet } from '@/coach/diary/DiarySheets';
import { prefLabel } from '@/coach/diary/BookingBlock';
import { loadDraft } from '@/inperson/draft';
import { comingUp, needsItemOpen, needsYou, offTrack, pushAction, todaySessions, type ComingKind, type NeedsItem, type NeedsOpen, type TodaySession } from '@/today/model';

/** A Needs you item's destination: a path, or (a request) handled by Today's own sheet, so only paths go here. */
const go = (o: NeedsOpen | null) => { if (o?.kind === 'path') navigate(o.path); };

const greeting = (min: number) => (min < 12 * 60 ? 'Morning' : min < 18 * 60 ? 'Afternoon' : 'Evening');
const COMING: Record<ComingKind, { tag: string; tone: 'amber' | 'acc' | 'neutral'; icon: IconName }> = {
  'check-in': { tag: 'Check-in', tone: 'neutral', icon: 'message' },
  'final-week': { tag: 'Final week', tone: 'acc', icon: 'flag' },
  measurements: { tag: 'Measurements', tone: 'neutral', icon: 'tape' },
  'no-sync': { tag: 'No sync', tone: 'amber', icon: 'sync' },
};

function Glance({ value, label, tone }: { value: number; label: string; tone?: 'acc' | 'bad' }) {
  return (
    <div>
      <div className={`big digits ${tone ? `t-${tone}` : ''}`} style={{ fontSize: 40 }}>{value}</div>
      <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>{label}</div>
    </div>
  );
}

function CardHead({ icon, eyebrow, name, when }: { icon: IconName; eyebrow: string; name: string; when?: string }) {
  return (
    <div className="row top-align">
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
        <Avatar initials={initials(name)} size={38} />
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow acc" style={{ display: 'flex', gap: 5, alignItems: 'center' }}><Icon name={icon} size={13} />{eyebrow}</div>
          <b style={{ fontSize: 15.5, display: 'block', marginTop: 2 }}>{name}</b>
        </div>
      </div>
      {when && <span className="caption" style={{ whiteSpace: 'nowrap' }}>{when}</span>}
    </div>
  );
}
function Quote({ children }: { children: ReactNode }) {
  return <p className="body-copy" style={{ marginTop: 8, paddingLeft: 12, borderLeft: '2px solid color-mix(in srgb, var(--accent) 55%, transparent)', color: 'var(--text)' }}>“{children}”</p>;
}

export function TodayScreen() {
  const { profile } = useCoach();
  const ref = useEntering<HTMLDivElement>('today');
  const { repo, diary, bundles, error, who, today, nowMin, run, toast } = useDiaryData();
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [inboxError, setInboxError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ type: 'request'; id: string } | { type: 'cancel'; item: Extract<NeedsItem, { kind: 'missed' }> } | null>(null);
  const loadInbox = useCallback(() => { repo.loadInbox().then((x) => { setInbox(x); setInboxError(null); }).catch((e) => setInboxError(e instanceof Error ? e.message : String(e))); }, [repo]);
  useEffect(loadInbox, [loadInbox]);
  useOnResume(loadInbox);

  // A tapped push (§158): once the data it needs has loaded, do what that item's button does, once. The
  // parameter is dropped from the address so a reload doesn't repeat it.
  const route = useRoute();
  const push = route.name === 'today' ? route.push : null;
  const pushDone = useRef<string | null>(null);

  const now = repo.now();
  const summaries = useMemo(() => (bundles ?? []).map((b) => summarise(b, now)), [bundles, now]);
  useEffect(() => {
    if (!push || pushDone.current === push || !diary || !bundles || !inbox) return;
    pushDone.current = push;
    history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/today`);
    const a = pushAction(push, needsYou(diary, inbox, bundles, summaries, today));
    if (a?.kind === 'request') setSheet({ type: 'request', id: a.id });
    else go(a);
  }, [push, diary, bundles, inbox, summaries, today]);
  const nameOf = (id: string | null) => summaries.find((s) => s.id === id)?.name ?? 'Client';
  const firstOf = (id: string | null) => nameOf(id).split(' ')[0];
  const coachFirst = profile.displayName.split(' ')[0] || profile.displayName;
  const header = <PageHeader eyebrow={fmt.long(today)} title={`${greeting(nowMin)}, ${coachFirst}`} actions={<AccountButton />} />;

  if (error || inboxError) return <CoachShell tab="today"><Page innerRef={ref}>{header}<EmptyState>Couldn’t load today: {error ?? inboxError}</EmptyState></Page></CoachShell>;
  if (!diary || !bundles || !inbox) return <CoachShell tab="today"><div className="page" aria-busy="true" /></CoachShell>;

  const sessions = todaySessions(diary, inbox, today, nowMin);
  const items = needsYou(diary, inbox, bundles, summaries, today);
  const off = offTrack(summaries);
  const coming = comingUp(bundles, summaries, inbox);
  const next = sessions.find((s) => s.next && !s.past) ?? null;
  const titleOf = (o: Occurrence) => (o.kind === 'group' ? o.title ?? 'Group session' : nameOf(o.clientIds[0] ?? null));
  const req = sheet?.type === 'request' ? diary.requests.find((r) => r.id === sheet.id) : undefined;
  const after = (ok: boolean) => { if (ok) { setSheet(null); loadInbox(); } };

  return (
    <CoachShell tab="today">
      <Page innerRef={ref}>
        {header}
        <Hero>
          <div className="eyebrow acc">The day at a glance</div>
          <div className="tiles-3" style={{ marginTop: 14 }}>
            <Glance value={sessions.length} label={sessions.length === 1 ? 'session today' : 'sessions today'} />
            <Glance value={items.length} label="need you" tone={items.length ? 'acc' : undefined} />
            <Glance value={off.length} label="off track" tone={off.length ? 'bad' : undefined} />
          </div>
          {next && (
            <>
              <div className="divider" style={{ margin: '18px 0 14px' }} />
              <div className="row">
                <span className="muted" style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}><Icon name="clock" size={18} /> Next session</span>
                <b className="num" style={{ textAlign: 'right', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fmt.time(next.occ.start)} · {titleOf(next.occ)}</b>
              </div>
            </>
          )}
        </Hero>

        <div className="today-grid">
          <div className="tg-sessions">
            <Section i={2} title="Today’s sessions" sub="Your diary for today. Start a session to log it in person." slot={<a href="#/diary" className="btn-sm compact">Diary</a>}>
              {sessions.length ? (
                <div className="card list">{sessions.map((s) => <SessionRow key={s.occ.key} s={s} title={titleOf(s.occ)} notOnApp={!!s.cardId && summaries.find((x) => x.id === s.cardId)?.status === 'not-on-app'} />)}</div>
              ) : <EmptyState>Nothing booked today.</EmptyState>}
            </Section>
          </div>

          <div className="tg-needs">
            <Section i={3} title="Needs you" sub="Everything waiting on you, in one list. Each item clears once it’s dealt with." slot={items.length ? <Chip tone="acc">{items.length} waiting</Chip> : undefined}>
              {items.length === 0 && <EmptyState>Nothing waiting on you. Requests, check-ins, notes back and sessions to log land here.</EmptyState>}
              <div className="stack">
                {items.map((it, k) => (
                  <Card key={it.key} i={4 + k}>
                    <NeedsBody it={it} name={it.cardId ? nameOf(it.cardId) : 'A client'} first={firstOf(it.cardId)} who={who}
                      onRequest={(id) => setSheet({ type: 'request', id })} onCancel={(x) => setSheet({ type: 'cancel', item: x })} />
                  </Card>
                ))}
              </div>
            </Section>
          </div>

          <div className="tg-off">
            <Section i={4} title="Off track" sub="Clients whose goal is off, each with the one reason that explains it." slot={<Chip tone={off.length ? 'bad' : 'good'}>{off.length ? `${off.length} ${off.length === 1 ? 'client' : 'clients'}` : 'None'}</Chip>}>
              {off.length ? (
                <div className="card list">
                  {off.map((c) => (
                    <a key={c.id} href={`#${clientPath(c.id, 'review')}`} className="listrow">
                      <Avatar initials={c.initials} />
                      <span className="main">
                        <b>{c.name}</b>
                        <span style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginTop: 4, fontSize: 13, color: 'var(--text)' }}>
                          <span className="t-bad" style={{ flexShrink: 0, marginTop: 1 }}><Icon name="warning" size={15} /></span>{c.outcome.reason}
                        </span>
                        {c.cycle && <span className="caption" style={{ display: 'block', marginTop: 3 }}>{c.cycle.name} · week {c.cycle.week} of {c.cycle.weeks}</span>}
                      </span>
                      <OutcomeChip status={c.outcome.status} />
                      <span style={{ color: 'var(--text3)' }}><Icon name="chevR" size={20} /></span>
                    </a>
                  ))}
                </div>
              ) : <EmptyState>Every client with a plan is on track.</EmptyState>}
              <p className="caption" style={{ marginTop: 10 }}>Only outcomes are flagged. Drifting inputs with a healthy trend stay off this list.</p>
            </Section>
          </div>

          <div className="tg-coming">
            <Section i={5} title="Coming up" sub="Check-ins due, cycles ending, measurements due and apps gone quiet, over the next week." slot={coming.length ? <Chip>{coming.length} items</Chip> : undefined}>
              {coming.length ? (
                <div className="card list">
                  {coming.map((u) => (
                    <RowButton key={u.key} lead={COMING[u.kind].icon} title={nameOf(u.cardId)} sub={u.detail}
                      badge={<Tag tone={COMING[u.kind].tone}>{COMING[u.kind].tag}</Tag>} onClick={() => navigate(clientPath(u.cardId, u.tab))} />
                  ))}
                </div>
              ) : <EmptyState>Nothing due this week.</EmptyState>}
            </Section>
          </div>
        </div>
      </Page>

      {req && (
        <RequestSheet r={req} diary={diary} who={who} today={today} onClose={() => setSheet(null)}
          onBook={(slot) => void run((d) => bookRequest(repo, d, req, slot), `Booked ${fmt.ddm(slot.date)}, ${fmt.time(slot.start_min)}`).then(after)}
          onPropose={(slot) => void run((_d) => proposeTime(repo, req, slot), `Proposed ${fmt.ddm(slot.date)}, ${fmt.time(slot.start_min)} · waiting for them`).then(after)}
          onDecline={() => void run((_d) => declineRequest(repo, req), 'Request declined').then(after)} />
      )}
      {sheet?.type === 'cancel' && (() => {
        const { occ, cardId } = sheet.item;
        const first = firstOf(cardId);
        return (
          <Sheet open title="Cancel the session?" onClose={() => setSheet(null)}>
            <p className="body-copy">{first}’s session on {fmt.ddm(occ.date)}, {fmt.time(occ.start)} wasn’t logged. Cancelling it hands the session back to {first}: it’s theirs to do again, and their Up next moves back to it.</p>
            <p className="caption" style={{ marginTop: 10 }}>{first} gets a “Session cancelled” banner.{occ.recurring ? ' Only this week is cancelled; the weekly session carries on.' : ''}</p>
            <Button variant="danger" style={{ marginTop: 20 }} onClick={() => void run((d) => cancelSession(repo, d, occ, 'one'), `${first}’s ${fmt.ddm(occ.date)} session cancelled`).then(after)}>Cancel the session</Button>
          </Sheet>
        );
      })()}
      <Toast msg={toast.msg} />
    </CoachShell>
  );
}

function SessionRow({ s, title, notOnApp }: { s: TodaySession; title: string; notOnApp: boolean }) {
  const o = s.occ;
  const resume = !!s.cardId && !!loadDraft(o.key, s.cardId);
  return (
    <div className="listrow" style={{ cursor: 'default', flexWrap: 'wrap', opacity: s.past && !s.canStart ? 0.62 : 1 }}>
      <div style={{ width: 56, flexShrink: 0 }}>
        <div className="display num" style={{ fontSize: 17 }}>{fmt.time(o.start)}</div>
        <div className="caption" style={{ whiteSpace: 'nowrap' }}>{lengthLabel(o.duration)}</div>
      </div>
      <span className="main">
        <b>{title}</b>
        <small className="muted" style={{ display: 'block', fontSize: 12.5, marginTop: 2 }}>
          {[o.location, o.kind === 'group' ? 'group' : o.recurring ? 'weekly' : 'one-off', notOnApp ? 'not on the app' : null].filter(Boolean).join(' · ')}
        </small>
      </span>
      {s.logged && <Chip tone="good" icon="check">Logged</Chip>}
      {!s.logged && s.next && !s.past && <Chip tone="acc" icon="clock">Next</Chip>}
      {s.canStart && s.cardId && (
        <div style={{ flexBasis: '100%' }}>
          <Button size="card" icon="play" pulse={s.next && !resume} onClick={() => navigate(sessionPath(o.key, s.cardId!))}>{resume ? 'Resume session' : 'Start session'}</Button>
        </div>
      )}
    </div>
  );
}

function NeedsBody({ it, name, first, who, onRequest, onCancel }: {
  it: NeedsItem; name: string; first: string; who: ReturnType<typeof useDiaryData>['who'];
  onRequest: (id: string) => void; onCancel: (x: Extract<NeedsItem, { kind: 'missed' }>) => void;
}) {
  const ago = (iso: string) => fmt.ddm(iso.slice(0, 10));
  switch (it.kind) {
    case 'request': {
      const r = it.request;
      const clash = r.status === 'accepted';
      const at = requestSlot(r);
      return <>
        <CardHead icon="calendar" eyebrow={clash ? 'Confirmed time clashes' : r.status === 'countered' ? 'Suggested another time' : 'Session request'} name={name} when={ago(r.createdAt)} />
        {r.notes && <Quote>{r.notes}</Quote>}
        <p className="muted" style={{ marginTop: 10 }}>
          {clash && at ? `${first} confirmed ${prefLabel(at)}, which clashes now.` : r.status === 'countered' && at ? `${first} suggested ${prefLabel(at)}.` : r.preferences.map(prefLabel).join(' · ')}{r.repeatWeekly ? ' · weekly' : ''}
        </p>
        <div className="btnrow"><Button size="card" icon="calendar" onClick={() => onRequest(r.id)}>{clash ? 'Move it' : 'Answer'}</Button></div>
      </>;
    }
    case 'checkin': {
      const b = it.submission.body || {};
      return <>
        <CardHead icon="message" eyebrow="Check-in asked for" name={name} when={ago(it.submission.createdAt)} />
        <div className="muted" style={{ marginTop: 12 }}>Feeling <b style={{ color: 'var(--text)' }}>{String(b.feel || 'okay').toLowerCase()}</b></div>
        {b.note && <Quote>{String(b.note)}</Quote>}
        <div className="btnrow"><Button size="card" icon="sparkle" onClick={() => go(needsItemOpen(it))}>Run check-in</Button></div>
      </>;
    }
    case 'note':
      return <>
        <CardHead icon="send" eyebrow="Note back" name={name} when={ago(it.submission.createdAt)} />
        {it.headline && <div className="muted" style={{ marginTop: 12 }}>On “{it.headline}”</div>}
        <Quote>{String(it.submission.body?.text ?? '')}</Quote>
        <div className="btnrow"><Button size="card" icon="message" onClick={() => go(needsItemOpen(it))}>Reply in Review</Button></div>
      </>;
    case 'photos':
      return <>
        <CardHead icon="photo" eyebrow={it.skipped ? 'Review photos skipped' : 'Review photos in'} name={name} when={ago(it.at)} />
        <p className="muted" style={{ marginTop: 12 }}>{it.skipped ? `${first} skipped photos for the cycle review. It can run without them.` : `${first} sent ${it.count} ${it.count === 1 ? 'photo' : 'photos'} for the cycle review.`}</p>
        <div className="btnrow"><Button size="card" icon="sparkle" onClick={() => navigate(clientPath(it.cardId, 'review', it.macroId, null, { at: 'ai', tool: 'cycle_review' }))}>Run the review</Button></div>
      </>;
    case 'missed': {
      const o = it.occ;
      return <>
        <CardHead icon="warning" eyebrow="Not logged" name={name} when={fmt.ddm(o.date)} />
        <p className="body-copy" style={{ marginTop: 12 }}>{first}’s session on {fmt.dayLong(o.date)} wasn’t logged.</p>
        <p className="caption" style={{ marginTop: 4 }}>{fmt.ddm(o.date)}, {fmt.time(o.start)}–{fmt.time(o.start + o.duration)}{o.location ? ` · ${o.location}` : ''}. Until it’s logged or cancelled, a session you tagged stays yours on {first}’s phone.</p>
        <div className="btnrow">
          <Button variant="ghost" size="card" onClick={() => onCancel(it)}>Cancel</Button>
          <Button size="card" icon="edit" onClick={() => navigate(sessionPath(o.key, it.cardId))}>Log it</Button>
        </div>
      </>;
    }
  }
  void who;
  return null;
}
