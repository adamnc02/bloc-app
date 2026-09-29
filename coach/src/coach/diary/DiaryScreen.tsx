// The Diary (TECHNICAL §152). Tablet and laptop: the full week, non-working
// days muted. Phone: five days from the day in view. Drag to move (15-minute
// snap), tap to edit, tap an empty outline to book, tap a day's header to mark
// it off (or undo it). Session requests sit in it as placeholders.
import { useState } from 'react';
import type { ISODate } from '@/domain/types';
import { CoachShell, AccountButton } from '@/coach/CoachShell';
import { Hero, Page, PageHeader } from '@/components/ui/layout';
import { Button, IconButton } from '@/components/ui/controls';
import { EmptyState } from '@/components/ui/display';
import { Icon } from '@/components/ui/Icon';
import { Toast } from '@/components/ui/Sheet';
import { useEntering, useIsTablet } from '@/components/ui/hooks';
import { addDays, daysBetween, fmt, startOfWeek } from '@/lib/format';
import { cancelledOn, dayOffOn, occurrencesBetween, requestsNeedingCoach, type Occurrence } from '@/diary/model';
import {
  addDayOff, bookRequest, cancelSession, createSession, declineRequest, editRefusal, editSession, makeWeekly, proposeTime, undoDayOff,
  type Scope, type SessionPatch,
} from '@/diary/actions';
import { DiaryGrid } from './DiaryGrid';
import { DayOffSheet, EditSheet, NewSessionSheet, RequestSheet, ScopeSheet, UndoDayOffSheet } from './DiarySheets';
import { useDiaryData } from './useDiaryData';

type SheetState =
  | { type: 'edit'; key: string }
  | { type: 'request'; id: string }
  | { type: 'scope'; key: string; patch: SessionPatch }
  | { type: 'cancel'; key: string }
  | { type: 'new'; date: ISODate; start: number }
  | { type: 'dayoff'; date: ISODate | null }
  | { type: 'undo'; id: string }
  | null;

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
/** "Mon–Sat", or "Mon, Wed, Fri" when not a run. */
export function workingDaysLabel(days: number[]): string {
  const d = [...days].sort((a, b) => a - b);
  if (!d.length) return 'No working days set';
  const run = d.every((x, i) => i === 0 || x === d[i - 1] + 1);
  return run && d.length > 2 ? `${DAY_SHORT[d[0]]}–${DAY_SHORT[d[d.length - 1]]}` : d.map((x) => DAY_SHORT[x]).join(', ');
}

export function DiaryScreen() {
  const { repo, diary, bundles, error, busy, who, today, nowMin, run, toast } = useDiaryData();
  const wide = useIsTablet();
  const ref = useEntering<HTMLDivElement>('diary');
  const [anchor, setAnchor] = useState<ISODate | null>(null);
  const [sheet, setSheet] = useState<SheetState>(null);

  if (error) return <CoachShell tab="diary"><Page innerRef={ref}><PageHeader title="Diary" /><EmptyState>Couldn’t load the diary: {error}</EmptyState></Page></CoachShell>;
  if (!diary || !bundles) return <CoachShell tab="diary"><div className="page" aria-busy="true" /></CoachShell>;

  const at = anchor ?? today;
  const first = wide ? startOfWeek(at) : at;
  const count = wide ? 7 : 5;
  const days = Array.from({ length: count }, (_, i) => addDays(first, i));
  const last = days[days.length - 1];
  const occs = occurrencesBetween(diary, addDays(first, -1), addDays(last, 1), today);
  const { dayStart, dayEnd, workingDays } = diary.settings;
  const byKey = (key: string) => occs.find((o) => o.key === key) ?? occurrencesBetween(diary, addDays(first, -60), addDays(last, 60)).find((o) => o.key === key);
  const nameOf = (o: Pick<Occurrence, 'kind' | 'title' | 'clientIds'>) => who.name(o);

  // ---- actions
  async function save(o: Occurrence, p: SessionPatch, scope: Scope) {
    const refusal = editRefusal(diary!, o, p, scope, who.name);
    if (refusal) { toast.show(`Can’t move there. ${refusal.reason}.`); return; }
    const moved = p.date !== o.date || p.start !== o.start;
    const ok = await run((d) => editSession(repo, d, o, p, scope), moved
      ? scope === 'all' ? `Every week from ${fmt.ddm(o.date)} moved to ${fmt.dayLong(p.date)}s, ${fmt.time(p.start)}` : `Moved to ${fmt.ddm(p.date)}, ${fmt.time(p.start)}`
      : 'Session saved');
    if (ok) setSheet(null);
  }
  function onDrop(o: Occurrence, date: ISODate, start: number) {
    if (o.kind === 'request' && o.request) {
      void run((_d) => proposeTime(repo, o.request!, { date, start_min: start }), `${nameOf(o)} gets your time: ${fmt.ddm(date)}, ${fmt.time(start)}`);
      return;
    }
    const p: SessionPatch = { date, start, duration: o.duration, location: o.location, title: o.title, clientIds: o.clientIds };
    if (o.recurring) setSheet({ type: 'scope', key: o.key, patch: p });
    else void save(o, p, 'one');
  }

  // ---- hero numbers (days in view)
  const inView = occs.filter((o) => days.includes(o.date) && o.kind !== 'request');
  const hours = inView.reduce((a, o) => a + o.duration, 0) / 60;
  const open = requestsNeedingCoach(diary).length;
  const weekDelta = Math.round(daysBetween(startOfWeek(today), startOfWeek(first)) / 7);
  const rel = weekDelta === 0 ? 'This week' : weekDelta === 1 ? 'Next week' : weekDelta === -1 ? 'Last week' : `Week of ${fmt.dm(startOfWeek(first))}`;

  const s = sheet;
  const occ = s && (s.type === 'edit' || s.type === 'scope' || s.type === 'cancel') ? byKey(s.key) : undefined;
  const req = s?.type === 'request' ? diary.requests.find((r) => r.id === s.id) : undefined;
  const offOf = s?.type === 'undo' ? diary.daysOff.find((o) => o.id === s.id) : undefined;

  return (
    <CoachShell tab="diary">
      <Page innerRef={ref} className="diary-page">
        <PageHeader
          eyebrow={fmt.range(days[0], last)}
          title="Diary"
          actions={<>
            <IconButton icon="plus" label="Book a session" onClick={() => setSheet({ type: 'new', date: today, start: Math.min(Math.max(dayStart, Math.ceil(nowMin / 60) * 60), dayEnd - diary.settings.sessionMinutes) })} />
            <IconButton icon="moon" label="Mark a day off" onClick={() => setSheet({ type: 'dayoff', date: null })} />
            <AccountButton />
          </>}
        />

        <Hero>
          <div className="dy-hero-stats">
            <div><div className="big num">{inView.length}</div><div className="muted">Sessions booked</div></div>
            <div><div className="big num">{Number.isInteger(hours) ? hours : hours.toFixed(1)}<small>h</small></div><div className="muted">Booked time</div></div>
            <div><div className={`big num ${open ? 't-acc' : ''}`}>{open}</div><div className="muted">{open === 1 ? 'Request waiting' : 'Requests waiting'}</div></div>
          </div>
          <div className="dy-hero-foot"><Icon name="clock" size={14} /> Working {workingDaysLabel(workingDays)} · {fmt.hour(dayStart)}–{fmt.hour(dayEnd)}</div>
        </Hero>

        <div className="rise" style={{ ['--i' as string]: 2 }}>
          <div className="dy-bar">
            <IconButton icon="chevL" label={wide ? 'Previous week' : 'Previous 5 days'} onClick={() => setAnchor(addDays(first, -count))} />
            <div className="dy-range" aria-live="polite"><b className="num">{fmt.range(days[0], last)}</b><small>{rel}</small></div>
            <IconButton icon="chevR" label={wide ? 'Next week' : 'Next 5 days'} onClick={() => setAnchor(addDays(first, count))} />
            <Button size="compact" variant="ghost" disabled={days.includes(today) && (wide || days[0] === today)} onClick={() => setAnchor(null)}>Today</Button>
          </div>
          <p className="caption dy-hint">{wide ? 'Click a session to edit it, or drag it to a new time. Click an empty hour to book it.' : 'Tap a session to edit it. Hold, then drag to move it. Tap an empty hour to book it.'}</p>
          <div className="dy-legend" aria-label="What the outlines mean">
            <span><i className="lg-booked" />Booked</span>
            <span><i className="lg-requested" />Requested</span>
            <span><i className="lg-offered" />Offered</span>
            <span><i className="lg-confirmed" />Clash</span>
          </div>
        </div>

        <div className="rise" style={{ ['--i' as string]: 3 }} aria-busy={busy}>
          <DiaryGrid
            days={days} occurrences={occs} daysOff={diary.daysOff} dayStart={dayStart} dayEnd={dayEnd} workingDays={workingDays}
            today={today} nowMin={nowMin} narrow={!wide} who={who}
            onOpen={(o) => setSheet(o.kind === 'request' && o.request ? { type: 'request', id: o.request.id } : { type: 'edit', key: o.key })}
            onDrop={onDrop}
            onRefused={(_o, reason) => toast.show(`Can’t move there. ${reason}.`)}
            onDay={(d) => { const off = dayOffOn(diary.daysOff, d); setSheet(off ? { type: 'undo', id: off.id } : { type: 'dayoff', date: d }); }}
            onEmpty={(d, start) => setSheet({ type: 'new', date: d, start })}
            offNote={(d) => {
              const c = cancelledOn(diary, d);
              const names = c.clientIds.map((id) => who.name({ kind: 'one_to_one', title: null, clientIds: [id] }));
              const list = names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
              return { cancelled: c.count, told: dayOffOn(diary.daysOff, d)?.notified && list ? `${list} notified` : 'No one notified' };
            }}
          />
        </div>
      </Page>

      {s?.type === 'edit' && occ && (
        <EditSheet occ={occ} diary={diary} who={who} bundles={bundles} onClose={() => setSheet(null)}
          onSave={(p) => { const changed = JSON.stringify(p) !== JSON.stringify({ date: occ.date, start: occ.start, duration: occ.duration, location: occ.location, title: occ.title, clientIds: occ.clientIds });
            if (!changed) setSheet(null); else if (occ.recurring) setSheet({ type: 'scope', key: occ.key, patch: p }); else void save(occ, p, 'one'); }}
          onCancelSession={() => { if (occ.recurring) setSheet({ type: 'cancel', key: occ.key }); else void run((d) => cancelSession(repo, d, occ, 'one'), `${nameOf(occ)}’s session on ${fmt.ddm(occ.date)} is cancelled`).then((ok) => ok && setSheet(null)); }}
          onMakeWeekly={() => void run((d) => makeWeekly(repo, d, occ), `${nameOf(occ)} now every ${fmt.dayLong(occ.date)}, ${fmt.time(occ.start)}`).then((ok) => ok && setSheet(null))}
        />
      )}

      {s?.type === 'scope' && occ && (() => {
        const moved = s.patch.date !== occ.date || s.patch.start !== occ.start;
        const to = `${fmt.ddm(s.patch.date)}, ${fmt.time(s.patch.start)}`;
        return (
          <ScopeSheet title="Weekly session" intro={`${nameOf(occ)}’s session repeats every ${fmt.dayLong(occ.seriesDate ?? occ.date)}.`}
            one={moved ? `Only ${fmt.ddm(occ.date)} moves, to ${to}.` : `Only ${fmt.ddm(occ.date)} changes.`}
            all={moved ? `${fmt.ddm(occ.date)} and every week after move to ${fmt.dayLong(s.patch.date)}s at ${fmt.time(s.patch.start)}.` : `${fmt.ddm(occ.date)} and every week after change.`}
            onChoose={(scope) => void save(occ, s.patch, scope)} onClose={() => setSheet(null)} />
        );
      })()}

      {s?.type === 'cancel' && occ && (
        <ScopeSheet title="Cancel" danger intro={`${nameOf(occ)}’s session repeats every ${fmt.dayLong(occ.seriesDate ?? occ.date)}.`}
          one={`Only ${fmt.ddm(occ.date)} is cancelled. The weeks after carry on.`}
          all={`${fmt.ddm(occ.date)} and every week after are cancelled: the weekly session ends.`}
          onChoose={(scope) => void run((d) => cancelSession(repo, d, occ, scope), scope === 'all' ? `${nameOf(occ)}’s weekly session ends` : `${fmt.ddm(occ.date)} cancelled`).then((ok) => ok && setSheet(null))}
          onClose={() => setSheet(null)} />
      )}

      {s?.type === 'new' && (
        <NewSessionSheet diary={diary} who={who} bundles={bundles} date={s.date} start={s.start} onClose={() => setSheet(null)}
          onBook={(n) => void run((d) => createSession(repo, d, n), `Booked ${nameOf(n)}: ${fmt.ddm(n.date)}, ${fmt.time(n.start)}${n.weekly ? ', weekly' : ''}`).then((ok) => ok && setSheet(null))} />
      )}

      {s?.type === 'dayoff' && (
        <DayOffSheet diary={diary} who={who} today={today} date={s.date} onClose={() => setSheet(null)}
          onConfirm={(a, b, note, notify) => void run((d) => addDayOff(repo, d, a, b, note, notify),
            `${a === b ? fmt.long(a) : `${fmt.ddm(a)} – ${fmt.ddm(b)}`} off · ${notify ? 'clients told' : 'no one told'}`).then((ok) => ok && setSheet(null))} />
      )}

      {s?.type === 'undo' && offOf && (
        <UndoDayOffSheet off={offOf} onClose={() => setSheet(null)}
          onUndo={() => void run((_d) => undoDayOff(repo, offOf.id), 'Day off removed · cancelled sessions stay cancelled').then((ok) => ok && setSheet(null))} />
      )}

      {s?.type === 'request' && req && (
        <RequestSheet r={req} diary={diary} who={who} today={today} onClose={() => setSheet(null)}
          onBook={(slot) => { void run((d) => bookRequest(repo, d, req, slot), `Booked ${fmt.ddm(slot.date)}, ${fmt.time(slot.start_min)}`).then((ok) => ok && setSheet(null)); }}
          onPropose={(slot) => void run((_d) => proposeTime(repo, req, slot), `Proposed ${fmt.ddm(slot.date)}, ${fmt.time(slot.start_min)} · waiting for them`).then((ok) => ok && setSheet(null))}
          onDecline={() => void run((_d) => declineRequest(repo, req), 'Request declined').then((ok) => ok && setSheet(null))} />
      )}

      <Toast msg={toast.msg} />
    </CoachShell>
  );
}
