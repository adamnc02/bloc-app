// Client → Sessions (TECHNICAL §152): this client's next session, their
// requests, their weekly sessions, and the next two weeks, from the same
// diary as the Diary (useDiaryData), with Book a session. Answering a request
// or booking here is the Diary's own action, so it reaches the client the same
// way and clears from the Diary too.
import { useState } from 'react';
import type { ClientView } from '@/coach/screens/ClientScreen';
import { Section } from '@/components/ui/layout';
import { Hero } from '@/components/ui/layout';
import { Button } from '@/components/ui/controls';
import { Chip, EmptyState, Tag } from '@/components/ui/display';
import { Notice } from '@/components/ui/Notice';
import { Icon } from '@/components/ui/Icon';
import { Toast } from '@/components/ui/Sheet';
import { navigate } from '@/app/router';
import { addDays, fmt } from '@/lib/format';
import { lengthLabel } from '@/diary/slots';
import { nextSeriesWeek, occurrencesBetween, requestSlot, type Occurrence } from '@/diary/model';
import { bookRequest, cancelSession, createSession, declineRequest, proposeTime, removeFromGroup } from '@/diary/actions';
import { Sheet } from '@/components/ui/Sheet';
import { prefLabel } from '@/coach/diary/BookingBlock';
import { NewSessionSheet, RequestSheet } from '@/coach/diary/DiarySheets';
import { useDiaryData } from '@/coach/diary/useDiaryData';

const WINDOW_DAYS = 14;
const DAY_PLURAL = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'];

function KindTag({ o }: { o: Occurrence }) {
  if (o.kind === 'group') return <Tag tone="blue">Group</Tag>;
  return o.recurring ? <Tag tone="neutral">Weekly</Tag> : <Tag tone="acc">One-off</Tag>;
}

export function SessionsTab({ v }: { v: ClientView }) {
  const { repo, diary, bundles, error, who, today, nowMin, run, toast } = useDiaryData();
  const [sheet, setSheet] = useState<{ type: 'new' } | { type: 'request'; id: string } | { type: 'session'; key: string } | null>(null);
  const cardId = v.bundle.card.id;
  const first = v.first;

  if (error) return <EmptyState>Couldn’t load {first}’s sessions: {error}</EmptyState>;
  if (!diary || !bundles) return <div aria-busy="true" style={{ minHeight: 200 }} />;

  const mine = (o: Occurrence) => o.clientIds.includes(cardId);
  const list = occurrencesBetween(diary, today, addDays(today, WINDOW_DAYS - 1))
    .filter((o) => mine(o) && o.kind !== 'request' && !(o.date === today && o.start + o.duration <= nowMin));
  const next = list[0];
  // A weekly row opens its next week; look well past the two-week list for it.
  const ahead = occurrencesBetween(diary, today, addDays(today, 180)).filter((o) => mine(o) && o.kind !== 'request');
  const nextOf = (seriesId: string) => nextSeriesWeek(diary, seriesId, today);
  // 🚨 Only weekly sessions with a week still to come: one whose weeks are all cancelled, moved (detached) or past is
  // over (its moved weeks are one-offs, under Coming up), and a row with nothing to act on can't be tapped.
  const weekly = diary.series.filter((s) => s.clientIds.includes(cardId) && !!nextOf(s.id))
    .sort((a, b) => a.weekday - b.weekday || a.start - b.start);
  const requests = diary.requests.filter((r) => r.cardId === cardId && requestSlot(r));
  const notOnApp = v.summary.status !== 'linked' && v.summary.status !== 'invited';
  const empty = !list.length && !requests.length && !weekly.length;
  const req = sheet?.type === 'request' ? diary.requests.find((r) => r.id === sheet.id) : undefined;
  const acting = sheet?.type === 'session' ? ahead.find((o) => o.key === sheet.key) : undefined;
  const defaultStart = Math.min(Math.max(diary.settings.dayStart, Math.ceil((nowMin + 1) / 60) * 60), diary.settings.dayEnd - diary.settings.sessionMinutes);

  return (
    <>
      <Hero>
        {next ? <>
          <div className="eyebrow acc">Next session</div>
          <div className="display num" style={{ fontSize: 24, marginTop: 6 }}>{next.date === today ? 'Today' : fmt.ddm(next.date)} · {fmt.time(next.start)}</div>
          <div className="muted" style={{ marginTop: 4 }}>
            {lengthLabel(next.duration)}{next.location ? ` · ${next.location}` : ''} · {next.kind === 'group' ? next.title ?? 'Group session' : next.recurring ? 'weekly' : 'one-off'}
          </div>
        </> : <>
          <div className="eyebrow">Next session</div>
          <div className="display" style={{ fontSize: 22, marginTop: 6 }}>Nothing booked</div>
          <div className="muted" style={{ marginTop: 4 }}>Nothing in the next two weeks.</div>
        </>}
        <Button icon="plus" style={{ marginTop: 16 }} onClick={() => setSheet({ type: 'new' })}>Book a session</Button>
        {notOnApp && (
          <Notice icon="account" tone="neutral" title={`${first} isn’t on the app`} style={{ marginTop: 16 }}>
            Bookings are for your diary. If {first} links later, the ones still to come arrive on their phone.
          </Notice>
        )}
      </Hero>

      {empty && (
        <Section i={2} title="Bookings" sub={`Sessions you book for ${first} show here, with any requests.`}>
          <EmptyState action={<Button size="card" variant="ghost" icon="diary" onClick={() => navigate('/diary')}>Open the diary</Button>}>No sessions booked yet.</EmptyState>
        </Section>
      )}

      {requests.length > 0 && (
        <Section i={2} title="Requests" sub={`Book one of ${first}’s times, or propose another. It clears from the Diary too.`} slot={<Chip tone="acc">{requests.length}</Chip>}>
          <div className="card list">
            {requests.map((r) => {
              const at = requestSlot(r)!;
              const state = r.status === 'proposed' ? `You proposed ${prefLabel(at)} · waiting for ${first}`
                : r.status === 'countered' ? `${first} suggested ${prefLabel(at)}`
                : r.status === 'accepted' ? `${first} confirmed ${prefLabel(at)}, which clashes now`
                : r.preferences.map(prefLabel).join(' · ');
              return (
                <button key={r.id} type="button" className="listrow" onClick={() => setSheet({ type: 'request', id: r.id })}>
                  <span className="icon-tile"><Icon name={r.repeatWeekly ? 'sync' : 'calendar'} size={18} /></span>
                  <span className="main">
                    <b>{r.status === 'pending' ? 'Asked for a session' : r.status === 'proposed' ? 'Waiting for an answer' : 'Needs you'}{r.repeatWeekly ? ' · weekly' : ''}</b>
                    <small className="muted" style={{ display: 'block', fontSize: 12.5, marginTop: 3 }}>{state}</small>
                  </span>
                  <Icon name="chevR" size={18} />
                </button>
              );
            })}
          </div>
        </Section>
      )}

      {weekly.length > 0 && (
        <Section i={3} title="Weekly" sub="Sessions that repeat every week. Move or stop one from the Diary.">
          <div className="card list">
            {weekly.map((s) => (
              <button key={s.id} type="button" className="listrow" onClick={() => setSheet({ type: 'session', key: nextOf(s.id)!.key })}>
                <span className="icon-tile"><Icon name={s.kind === 'group' ? 'group' : 'sync'} size={18} /></span>
                <span className="main">
                  <b className="num">{DAY_PLURAL[s.weekday]} · {fmt.time(s.start)}–{fmt.time(s.start + s.duration)}</b>
                  <small className="muted" style={{ display: 'block', fontSize: 12.5, marginTop: 3 }}>
                    {s.kind === 'group' ? `${s.title ?? 'Group session'} · ${s.clientIds.length} people` : lengthLabel(s.duration)}{s.location ? ` · ${s.location}` : ''}{s.to ? ` · until ${fmt.dm(s.to)}` : ''}
                  </small>
                </span>
                {s.kind === 'group' ? <Tag tone="blue">Group</Tag> : <Tag tone="neutral">Weekly</Tag>}
                <Icon name="chevR" size={18} />
              </button>
            ))}
          </div>
        </Section>
      )}

      {!empty && (
        <Section i={4} title="Coming up" sub="The next two weeks, one-off and weekly together.">
          {list.length ? (
            <div className="card list">
              {list.map((o) => (
                <button key={o.key} type="button" className="listrow" onClick={() => setSheet({ type: 'session', key: o.key })}>
                  <span style={{ width: 44, textAlign: 'center', flexShrink: 0 }} aria-hidden="true">
                    <span className="caption" style={{ display: 'block', textTransform: 'uppercase', letterSpacing: '.1em', fontWeight: 700 }}>{fmt.dayShort(o.date)}</span>
                    <span className="display num" style={{ fontSize: 20 }}>{Number(o.date.slice(8))}</span>
                  </span>
                  <span className="main">
                    <b className="num"><span className="sr-only">{fmt.ddm(o.date)}, </span>{fmt.time(o.start)}–{fmt.time(o.start + o.duration)}</b>
                    <small className="muted" style={{ display: 'block', fontSize: 12.5, marginTop: 3 }}>
                      {`${o.kind === 'group' ? o.title ?? 'Group session' : lengthLabel(o.duration)}${o.location ? ` · ${o.location}` : ''}`}
                    </small>
                  </span>
                  <KindTag o={o} />
                  <Icon name="chevR" size={18} />
                </button>
              ))}
            </div>
          ) : <EmptyState>Nothing booked in the next two weeks.</EmptyState>}
        </Section>
      )}

      {sheet?.type === 'new' && (
        <NewSessionSheet diary={diary} who={who} bundles={bundles} date={today} start={defaultStart} clientId={cardId}
          onClose={() => setSheet(null)}
          onBook={(n) => void run((d) => createSession(repo, d, n), `Booked ${fmt.ddm(n.date)}, ${fmt.time(n.start)}${n.weekly ? ', weekly' : ''}`).then((ok) => ok && setSheet(null))} />
      )}
      {req && (
        <RequestSheet r={req} diary={diary} who={who} today={today} onClose={() => setSheet(null)}
          onBook={(slot) => void run((d) => bookRequest(repo, d, req, slot), `Booked ${fmt.ddm(slot.date)}, ${fmt.time(slot.start_min)}`).then((ok) => ok && setSheet(null))}
          onPropose={(slot) => void run((_d) => proposeTime(repo, req, slot), `Proposed ${fmt.ddm(slot.date)}, ${fmt.time(slot.start_min)} · waiting for ${first}`).then((ok) => ok && setSheet(null))}
          onDecline={() => void run((_d) => declineRequest(repo, req), 'Request declined').then((ok) => ok && setSheet(null))} />
      )}
      {acting && (() => {
        const o = acting;
        const when = `${fmt.ddm(o.date)}, ${fmt.time(o.start)}–${fmt.time(o.start + o.duration)}`;
        const title = o.kind === 'group' ? o.title ?? 'Group session' : 'Session';
        const others = o.clientIds.filter((c) => c !== cardId).length;
        const close = (ok: boolean) => { if (ok) setSheet(null); };
        return (
          <Sheet open title={title} onClose={() => setSheet(null)}>
            <p className="display num" style={{ fontSize: 20 }}>{when}</p>
            <p className="muted" style={{ marginTop: 4 }}>{[o.recurring ? `every ${fmt.dayLong(o.date)}` : 'one-off', o.location].filter(Boolean).join(' · ')}</p>
            <div className="stack" style={{ marginTop: 20 }}>
              {o.kind === 'group' ? (
                <>
                  <Button variant="danger" onClick={() => void run((d) => removeFromGroup(repo, d, o, cardId), `${first} removed from ${title}`).then(close)}>Remove {first} from {title}</Button>
                  <p className="caption">{title} carries on{others ? ` for the other ${others === 1 ? 'person' : `${others} people`}` : ''}{o.recurring ? `; ${first} is out of every week from now on` : ''}. {first} gets a banner.</p>
                </>
              ) : !o.recurring ? (
                <Button variant="danger" onClick={() => void run((d) => cancelSession(repo, d, o, 'one'), `${fmt.ddm(o.date)} cancelled`).then(close)}>Cancel this session</Button>
              ) : (
                <>
                  <Button variant="danger" onClick={() => void run((d) => cancelSession(repo, d, o, 'one'), `${fmt.ddm(o.date)} cancelled`).then(close)}>Cancel just {fmt.ddm(o.date)}</Button>
                  <Button variant="danger" onClick={() => void run((d) => cancelSession(repo, d, o, 'all'), `${first}’s weekly session ends`).then(close)}>Stop the weekly session from {fmt.ddm(o.date)}</Button>
                </>
              )}
            </div>
          </Sheet>
        );
      })()}
      <Toast msg={toast.msg} />
    </>
  );
}
