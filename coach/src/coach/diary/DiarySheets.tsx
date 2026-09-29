// The Diary's sheets: edit a session, book a new one, choose clients, mark a
// day off or a holiday (and undo one), and answer a session request. Every
// save is checked by the Diary's rules first (diary/actions.ts refusals), so a
// clash is said in the sheet, never discovered after.
import { useId, useMemo, useState } from 'react';
import type { ISODate } from '@/domain/types';
import { Sheet } from '@/components/ui/Sheet';
import { SearchSheet } from '@/components/ui/SearchSheet';
import { Button, Checkbox, Field, RowButton, Seg, Stepper } from '@/components/ui/controls';
import { Avatar, Chip, Tag } from '@/components/ui/display';
import { Icon } from '@/components/ui/Icon';
import { addDays, daysBetween, fmt } from '@/lib/format';
import type { ClientBundle } from '@/data/types';
import { displayName } from '@/data/summary';
import { initials } from '@/lib/format';
import { lengthLabel } from '@/diary/slots';
import { occurrencesBetween, requestSlot, type Occurrence } from '@/diary/model';
import { editRefusal, newRefusal, requestRefusal, type NewSession, type Scope, type SessionPatch } from '@/diary/actions';
import type { DayOff, Diary, SessionKind, SessionRequest, Slot } from '@/diary/types';
import type { Who } from './BookingBlock';

const MINUTES = ['00', '15', '30', '45'] as const;

/** A date, then a start time in 15-minute steps within the coach's hours (the non-drag way to move a session). */
export function TimePicker({ date, start, duration, dayStart, dayEnd, onChange, minDate, maxStart }: {
  date: ISODate; start: number; duration: number; dayStart: number; dayEnd: number;
  onChange: (date: ISODate, start: number) => void; minDate?: ISODate;
  /** A request window's last start. */
  maxStart?: number;
}) {
  const id = useId();
  const hour = Math.floor(start / 60) * 60;
  const min = start % 60;
  const lo = Math.min(dayStart, start), hi = Math.max(dayEnd, start + duration);
  const hours: number[] = [];
  for (let h = Math.floor(lo / 60) * 60; h + 15 <= Math.min(hi, 1440); h += 60) hours.push(h);
  const fit = (s: number) => Math.max(0, Math.min(Math.min(1440 - duration, maxStart ?? 1440), s));
  return (
    <div className="tiles-2">
      <Field label="Day" htmlFor={`${id}-day`}>
        <input id={`${id}-day`} type="date" className="input" value={date} min={minDate} onChange={(e) => e.target.value && onChange(e.target.value, start)} />
      </Field>
      <Field label="Start" htmlFor={`${id}-hour`}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
          <select id={`${id}-hour`} className="input" value={hour} onChange={(e) => onChange(date, fit(Number(e.target.value) + min))} aria-label="Hour">
            {hours.map((h) => <option key={h} value={h}>{fmt.hour(h)}</option>)}
          </select>
          <Seg label="Minutes past the hour" value={String(min).padStart(2, '0') as (typeof MINUTES)[number]}
            options={MINUTES.map((m) => ({ value: m, label: `:${m}` }))} onChange={(m) => onChange(date, fit(hour + Number(m)))} />
        </div>
      </Field>
    </div>
  );
}

/** After changing (or cancelling) a weekly session: two buttons, "Just this one" and "All future"; either one acts at once. */
export function ScopeSheet({ title, intro, one, all, danger, onChoose, onClose }: {
  title: string; intro: string; one: string; all: string; danger?: boolean;
  onChoose: (scope: Scope) => void; onClose: () => void;
}) {
  const opts: { value: Scope; title: string; sub: string }[] = [
    { value: 'one', title: 'Just this one', sub: one },
    { value: 'all', title: 'All future', sub: all },
  ];
  return (
    <Sheet open title={title} onClose={onClose}>
      <p className="muted" style={{ marginBottom: 16 }}>{intro}</p>
      <div className="rq-picks">
        {opts.map((o) => (
          <button key={o.value} type="button" className={`pick scope-pick${danger ? ' is-danger' : ''}`} onClick={() => onChoose(o.value)}>
            <b>{o.title}</b><small>{o.sub}</small>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

/** Choose one client, or several for a group (a filtering list: SearchSheet, never Sheet). */
export function ClientPickerSheet({ open, bundles, multi, picked, onPick, onClose }: {
  open: boolean; bundles: ClientBundle[]; multi: boolean; picked: string[];
  onPick: (ids: string[]) => void; onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string[]>(picked);
  const list = useMemo(() => bundles.map((b) => ({ id: b.card.id, name: displayName(b) }))
    .filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name)), [bundles, q]);
  return (
    <SearchSheet open={open} title={multi ? 'Who’s in the group' : 'Choose a client'} onClose={onClose} query={q} onQuery={setQ} placeholder="Search clients"
      footer={multi ? <Button onClick={() => { onPick(sel); onClose(); }} disabled={!sel.length}>{sel.length ? `Done · ${sel.length}` : 'Choose at least one'}</Button> : undefined}>
      <div className="card list">
        {list.map((c) => multi ? (
          <label key={c.id} className="listrow" style={{ cursor: 'pointer' }}>
            <Avatar initials={initials(c.name)} size={36} />
            <span className="main"><b>{c.name}</b></span>
            <Checkbox label={`Include ${c.name}`} checked={sel.includes(c.id)} onChange={(v) => setSel((s) => (v ? [...s, c.id] : s.filter((x) => x !== c.id)))} />
          </label>
        ) : (
          <button key={c.id} type="button" className="listrow" onClick={() => { onPick([c.id]); onClose(); }}>
            <Avatar initials={initials(c.name)} size={36} />
            <span className="main"><b>{c.name}</b></span>
            <Icon name="chevR" size={18} />
          </button>
        ))}
        {!list.length && <div className="listrow muted" style={{ cursor: 'default' }}>No client matches “{q}”.</div>}
      </div>
    </SearchSheet>
  );
}

function Attendees({ ids, who, bundles, multi, onChange }: { ids: string[]; who: Who; bundles: ClientBundle[]; multi: boolean; onChange: (ids: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const label = ids.length ? ids.map((i) => who.name({ kind: 'one_to_one', title: null, clientIds: [i] }, true)).join(', ') : multi ? 'Choose who’s in the group' : 'Choose a client';
  return (
    <>
      <Field label={multi ? 'Clients' : 'Client'}>
        <RowButton title={label} sub={multi && ids.length ? `${ids.length} ${ids.length === 1 ? 'person' : 'people'}` : undefined} onClick={() => setOpen(true)} />
      </Field>
      {open && <ClientPickerSheet open bundles={bundles} multi={multi} picked={ids} onPick={onChange} onClose={() => setOpen(false)} />}
    </>
  );
}

// ---------------------------------------------------------------- edit

export function EditSheet({ occ, diary, who, bundles, onSave, onCancelSession, onMakeWeekly, onClose }: {
  occ: Occurrence; diary: Diary; who: Who; bundles: ClientBundle[];
  onSave: (p: SessionPatch) => void; onCancelSession: () => void; onMakeWeekly: () => void; onClose: () => void;
}) {
  const id = useId();
  const [p, setP] = useState<SessionPatch>({ date: occ.date, start: occ.start, duration: occ.duration, location: occ.location, title: occ.title, clientIds: occ.clientIds });
  const set = (x: Partial<SessionPatch>) => setP((cur) => ({ ...cur, ...x }));
  const group = occ.kind === 'group';
  // The week itself; "All future" is checked again once chosen.
  const refusal = editRefusal(diary, occ, p, 'one', who.name);
  const { dayStart, dayEnd } = diary.settings;
  return (
    <Sheet open title={group ? 'Group session' : 'Session'} onClose={onClose}>
      <div className="es-who">
        {group ? <span className="es-avatars">{p.clientIds.slice(0, 3).map((c) => <Avatar key={c} initials={who.initials(c)} size={36} />)}</span>
          : p.clientIds[0] && <Avatar initials={who.initials(p.clientIds[0])} size={44} />}
        <div style={{ minWidth: 0 }}>
          <b className="es-name">{who.name({ ...occ, title: p.title, clientIds: p.clientIds }, true)}</b>
          <div className="muted num">{fmt.ddm(p.date)} · {fmt.time(p.start)}–{fmt.time(p.start + p.duration)}{occ.recurring ? ' · weekly' : ''}</div>
        </div>
      </div>
      {group && (
        <>
          <Field label="Name" htmlFor={`${id}-title`}>
            <input id={`${id}-title`} className="input" maxLength={80} value={p.title ?? ''} onChange={(e) => set({ title: e.target.value || null })} placeholder="Saturday bootcamp" />
          </Field>
          <Attendees ids={p.clientIds} who={who} bundles={bundles} multi onChange={(clientIds) => set({ clientIds })} />
        </>
      )}
      <TimePicker date={p.date} start={p.start} duration={p.duration} dayStart={dayStart} dayEnd={dayEnd} onChange={(date, start) => set({ date, start })} />
      <Field label="Length" hint={`Sessions are ${lengthLabel(diary.settings.sessionMinutes)} as standard.`}>
        <Stepper label="length" value={p.duration} min={15} max={480} step={15} format={lengthLabel} onChange={(v) => set({ duration: v, start: Math.min(p.start, 1440 - v) })} />
      </Field>
      <Field label="Location" htmlFor={`${id}-loc`}>
        <input id={`${id}-loc`} className="input" maxLength={120} value={p.location ?? ''} onChange={(e) => set({ location: e.target.value || null })} placeholder="Studio" />
      </Field>
      {refusal && <p className="dy-refusal" role="alert"><Icon name="warning" size={16} /> {refusal.reason}. Pick another time.</p>}
      <div style={{ marginTop: 20 }}><Button onClick={() => onSave(p)} disabled={!!refusal || (group && !p.clientIds.length)}>Save</Button></div>
      <div className="stack" style={{ marginTop: 12 }}>
        {!occ.recurring && <Button variant="ghost" icon="sync" onClick={onMakeWeekly}>Repeat every {fmt.dayLong(occ.date)}</Button>}
        <Button variant="danger" onClick={onCancelSession}>{occ.recurring ? 'Cancel…' : 'Cancel this session'}</Button>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- new

export function NewSessionSheet({ diary, who, bundles, date, start, clientId, onBook, onClose }: {
  diary: Diary; who: Who; bundles: ClientBundle[]; date: ISODate; start: number; clientId?: string | null;
  onBook: (n: NewSession) => void; onClose: () => void;
}) {
  const id = useId();
  const [n, setN] = useState<NewSession>({
    kind: 'one_to_one', weekly: false, date, start, duration: diary.settings.sessionMinutes, location: null, title: null, clientIds: clientId ? [clientId] : [],
  });
  const set = (x: Partial<NewSession>) => setN((cur) => ({ ...cur, ...x }));
  const refusal = newRefusal(diary, n, who.name);
  const group = n.kind === 'group';
  return (
    <Sheet open title="Book a session" onClose={onClose}>
      <Field label="Kind">
        <Seg label="Kind" value={n.kind} onChange={(k: SessionKind) => set({ kind: k, clientIds: k === 'one_to_one' ? n.clientIds.slice(0, 1) : n.clientIds })}
          options={[{ value: 'one_to_one', label: 'One-to-one' }, { value: 'group', label: 'Group' }]} />
      </Field>
      {group && (
        <Field label="Name" htmlFor={`${id}-title`}>
          <input id={`${id}-title`} className="input" maxLength={80} value={n.title ?? ''} onChange={(e) => set({ title: e.target.value || null })} placeholder="Saturday bootcamp" />
        </Field>
      )}
      <Attendees ids={n.clientIds} who={who} bundles={bundles} multi={group} onChange={(clientIds) => set({ clientIds })} />
      <TimePicker date={n.date} start={n.start} duration={n.duration} dayStart={diary.settings.dayStart} dayEnd={diary.settings.dayEnd} onChange={(d, s) => set({ date: d, start: s })} />
      <Field label="Length">
        <Stepper label="length" value={n.duration} min={15} max={480} step={15} format={lengthLabel} onChange={(v) => set({ duration: v, start: Math.min(n.start, 1440 - v) })} />
      </Field>
      <Field label="Repeats">
        <Seg label="Repeats" value={n.weekly ? 'weekly' : 'one'} onChange={(v) => set({ weekly: v === 'weekly' })}
          options={[{ value: 'one', label: 'One-off' }, { value: 'weekly', label: `Every ${fmt.dayShort(n.date)}` }]} />
      </Field>
      <Field label="Location" htmlFor={`${id}-loc`}>
        <input id={`${id}-loc`} className="input" maxLength={120} value={n.location ?? ''} onChange={(e) => set({ location: e.target.value || null })} placeholder="Studio" />
      </Field>
      {refusal && n.clientIds.length > 0 && <p className="dy-refusal" role="alert"><Icon name="warning" size={16} /> {refusal.reason}.</p>}
      <p className="caption" style={{ marginTop: 12 }}>
        {n.clientIds.length ? `${who.name({ kind: n.kind, title: n.title, clientIds: n.clientIds })} ${n.clientIds.length > 1 || group ? 'get' : 'gets'} a banner on their phone.` : 'Clients on BLOC see it in Your sessions, with a banner.'}
      </p>
      <div style={{ marginTop: 16 }}><Button icon="plus" disabled={!!refusal} onClick={() => onBook(n)}>Book {fmt.dayShort(n.date)} {fmt.time(n.start)}</Button></div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- days off

/**
 * A day off, or a holiday over several days. It cancels only those days'
 * sessions, never a series. If any are booked, the coach is asked whether to
 * let those clients know (a banner, and a push once pushes arrive); either way
 * the cancellation reaches their phone.
 */
export function DayOffSheet({ diary, who, today, date, onConfirm, onClose }: {
  diary: Diary; who: Who; today: ISODate; date: ISODate | null;
  onConfirm: (start: ISODate, end: ISODate, note: string | null, notify: boolean) => void; onClose: () => void;
}) {
  const id = useId();
  const [several, setSeveral] = useState(false);
  const [start, setStart] = useState(date ?? today);
  const [end, setEnd] = useState(date ?? today);
  const [note, setNote] = useState('');
  const last = several && end >= start ? end : start;
  const affected = occurrencesBetween(diary, start, last).filter((o) => o.kind !== 'request' && !o.cancelled);
  const people = [...new Set(affected.flatMap((o) => o.clientIds))];
  const clash = diary.daysOff.find((o) => o.start <= last && o.end >= start);
  const bad = clash ? `Already a day off: ${fmt.ddm(clash.start)}${clash.end !== clash.start ? ` – ${fmt.ddm(clash.end)}` : ''}` : several && end < start ? 'The last day is before the first' : null;
  const span = daysBetween(start, last) + 1;
  const ok = (notify: boolean) => onConfirm(start, last, note.trim() || null, notify);
  return (
    <Sheet open title={affected.length ? 'Let clients know?' : 'Mark a day off'} onClose={onClose}>
      <Field label="How long">
        <Seg label="How long" value={several ? 'many' : 'one'} onChange={(v) => setSeveral(v === 'many')} options={[{ value: 'one', label: 'One day' }, { value: 'many', label: 'Several days' }]} />
      </Field>
      <div className={several ? 'tiles-2' : undefined}>
        <Field label={several ? 'From' : 'Day'} htmlFor={`${id}-s`}>
          <input id={`${id}-s`} type="date" className="input" value={start} min={today} onChange={(e) => { if (e.target.value) { setStart(e.target.value); if (end < e.target.value) setEnd(e.target.value); } }} />
        </Field>
        {several && (
          <Field label="Until" htmlFor={`${id}-e`}>
            <input id={`${id}-e`} type="date" className="input" value={end} min={start} onChange={(e) => e.target.value && setEnd(e.target.value)} />
          </Field>
        )}
      </div>
      <Field label="Note (for you)" htmlFor={`${id}-n`}>
        <input id={`${id}-n`} className="input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder={several ? 'Holiday' : 'Optional'} />
      </Field>
      {bad && <p className="dy-refusal" role="alert"><Icon name="warning" size={16} /> {bad}.</p>}
      {affected.length > 0 ? (
        <>
          <p className="muted" style={{ margin: '14px 0 10px' }}>
            {span > 1 ? `These ${span} days` : fmt.long(start)} cancel{span > 1 ? '' : 's'} {affected.length} {affected.length === 1 ? 'session' : 'sessions'}, on {span > 1 ? 'those days' : 'that day'} only. Weekly sessions carry on after.
          </p>
          <div className="card list">
            {affected.map((o) => (
              <div key={o.key} className="do-row">
                {o.clientIds[0] && <Avatar initials={who.initials(o.clientIds[0])} size={36} />}
                <span className="do-main"><b>{who.name(o, true)}</b><small className="num">{fmt.ddm(o.date)} · {fmt.time(o.start)}–{fmt.time(o.start + o.duration)}</small></span>
              </div>
            ))}
          </div>
          <p className="caption" style={{ marginTop: 10 }}>Either way the session is taken off their phone. Letting them know adds a “Session cancelled” banner.</p>
          <div className="do-actions">
            <Button variant="ghost" disabled={!!bad} onClick={() => ok(false)}>Don’t tell them</Button>
            <Button disabled={!!bad} onClick={() => ok(true)}>Let {people.length === 1 ? who.name({ kind: 'one_to_one', title: null, clientIds: people }) : `${people.length} clients`} know</Button>
          </div>
        </>
      ) : (
        <div style={{ marginTop: 20 }}><Button disabled={!!bad} onClick={() => ok(false)}>Mark {span > 1 ? `${span} days` : 'day'} off</Button></div>
      )}
    </Sheet>
  );
}

/** A day off that's already marked: what it cancelled, and Undo. */
export function UndoDayOffSheet({ off, diary, onUndo, onClose }: { off: DayOff; diary: Diary; onUndo: () => void; onClose: () => void }) {
  const n = occurrencesBetween(diary, off.start, off.end).filter((o) => o.cancelled).length;
  const days = daysBetween(off.start, off.end) + 1;
  return (
    <Sheet open title={days > 1 ? 'Holiday' : 'Day off'} onClose={onClose}>
      <p className="display" style={{ fontSize: 20 }}>{days > 1 ? `${fmt.ddm(off.start)} – ${fmt.ddm(off.end)}` : fmt.long(off.start)}</p>
      {off.note && <p className="muted" style={{ marginTop: 6 }}>{off.note}</p>}
      <p className="muted" style={{ marginTop: 12 }}>
        {n ? `${n} ${n === 1 ? 'session is' : 'sessions are'} cancelled.` : 'Nothing was booked.'} {off.notified ? 'Clients were told.' : 'Clients weren’t told.'}
      </p>
      <p className="caption" style={{ marginTop: 10 }}>Undo brings the sessions back{off.notified ? ' and tells those clients it’s back on' : ', quietly'}.</p>
      <div style={{ marginTop: 20 }}><Button variant="ghost" onClick={onUndo}>Undo {days > 1 ? 'holiday' : 'day off'}</Button></div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- requests

type Choice = number | 'counter' | 'other';

/**
 * A session request: book one of the client's times (a window: any start
 * inside it), or propose another (the client gets a banner, and confirms or
 * suggests another). A confirmed time that clashes is moved from here too.
 */
export function RequestSheet({ r, diary, who, today, onBook, onPropose, onDecline, onClose }: {
  r: SessionRequest; diary: Diary; who: Who; today: ISODate;
  onBook: (slot: Slot) => void; onPropose: (slot: Slot) => void; onDecline: () => void; onClose: () => void;
}) {
  const first = r.cardId ? who.name({ kind: 'one_to_one', title: null, clientIds: [r.cardId] }) : 'The client';
  const full = r.cardId ? who.name({ kind: 'one_to_one', title: null, clientIds: [r.cardId] }, true) : 'A client';
  const at = requestSlot(r);
  const waiting = r.status === 'proposed';
  const confirmed = r.status === 'accepted';
  // Open on the client's first time that's free, so the sheet doesn't start on a refusal.
  const [choice, setChoice] = useState<Choice>(() => {
    if (r.status === 'countered') return 'counter';
    if (waiting || confirmed) return 'other';
    const i = r.preferences.findIndex((p) => p.date >= today && !requestRefusal(diary, r, p, who.name));
    return i >= 0 ? i : 'other';
  });
  const [other, setOther] = useState<Slot>({ date: at?.date ?? addDays(today, 1), start_min: at?.start_min ?? Math.max(diary.settings.dayStart, Math.min(18 * 60, diary.settings.dayEnd - diary.settings.sessionMinutes)) });
  const [inWindow, setInWindow] = useState<Record<number, number>>({});
  const len = diary.settings.sessionMinutes;
  const pickOf = (c: Choice): Slot => {
    if (c === 'other') return other;
    if (c === 'counter') return r.counter!;
    const p = r.preferences[c];
    return p.end_min != null ? { date: p.date, start_min: inWindow[c] ?? p.start_min } : p;
  };
  const picked = pickOf(choice);
  const refusal = requestRefusal(diary, r, picked, who.name);
  const when = `${fmt.dayShort(picked.date)} ${fmt.time(picked.start_min)}`;
  const past = picked.date < today;
  const book = choice !== 'other';
  return (
    <Sheet open title="Session request" onClose={onClose}>
      <div className="es-who">
        {r.cardId && <Avatar initials={who.initials(r.cardId)} size={44} />}
        <div style={{ minWidth: 0 }}>
          <b className="es-name">{full}</b>
          <div className="muted">
            {waiting && r.proposed ? `You proposed ${fmt.ddm(r.proposed.date)}, ${fmt.time(r.proposed.start_min)}. Waiting for ${first} to confirm or suggest another time.`
              : confirmed && at ? `${first} confirmed ${fmt.ddm(at.date)}, ${fmt.time(at.start_min)}, but it clashes now. Choose another time to propose.`
              : r.status === 'countered' ? `${first} suggested another time.` : `Sent ${fmt.ddm(r.createdAt.slice(0, 10))}, for one of these times.`}
          </div>
        </div>
      </div>
      {r.repeatWeekly && <Chip tone="acc" icon="sync" style={{ marginBottom: 16 }}>Repeats weekly</Chip>}
      {r.notes && <blockquote className="rq-note">{r.notes}</blockquote>}

      <span className="label">{first}’s times</span>
      <div className="rq-picks" role="radiogroup" aria-label={`${first}’s times`}>
        {r.status === 'countered' && r.counter && (
          <button type="button" role="radio" className="pick" aria-checked={choice === 'counter'} onClick={() => setChoice('counter')}>
            <b className="num">{fmt.ddm(r.counter.date)}, {r.counter.end_min != null ? `any time ${fmt.time(r.counter.start_min)}–${fmt.time(r.counter.end_min)}` : fmt.time(r.counter.start_min)}</b>
            <small><Tag tone="acc">Suggested</Tag></small>
          </button>
        )}
        {r.preferences.map((pr, i) => {
          const rf = requestRefusal(diary, r, pickOf(i), who.name);
          return (
            <button key={i} type="button" role="radio" className="pick" aria-checked={choice === i} onClick={() => setChoice(i)}>
              <b className="num">{fmt.ddm(pr.date)}, {pr.end_min != null ? `any time ${fmt.time(pr.start_min)}–${fmt.time(pr.end_min)}` : `${fmt.time(pr.start_min)}–${fmt.time(pr.start_min + len)}`}</b>
              <small className={rf ? 't-bad' : undefined}>{rf ? <><Icon name="warning" size={12} /> {rf.reason}</> : pr.date < today ? 'Passed' : 'Free'}</small>
            </button>
          );
        })}
        <button type="button" role="radio" className="pick" aria-checked={choice === 'other'} onClick={() => setChoice('other')}>
          <b>{waiting ? 'Another time' : 'Propose another time'}</b>
          <small>{first} gets a banner with the new time.</small>
        </button>
      </div>

      {typeof choice === 'number' && r.preferences[choice].end_min != null && (() => {
        const p = r.preferences[choice];
        return (
          <div style={{ marginTop: 16 }}>
            <TimePicker date={p.date} start={picked.start_min} duration={len} dayStart={p.start_min} dayEnd={p.end_min!}
              maxStart={p.end_min! - 15} onChange={(_d, s) => setInWindow((w) => ({ ...w, [choice]: Math.max(p.start_min, s) }))} />
            <p className="caption">Any start from {fmt.time(p.start_min)} to {fmt.time(p.end_min! - 15)}.</p>
          </div>
        );
      })()}
      {choice === 'other' && (
        <div style={{ marginTop: 16 }}>
          <TimePicker date={other.date} start={other.start_min} duration={len} dayStart={diary.settings.dayStart} dayEnd={diary.settings.dayEnd} minDate={today}
            onChange={(date, start_min) => setOther({ date, start_min })} />
        </div>
      )}
      {(refusal || past) && <p className="dy-refusal" role="alert"><Icon name="warning" size={16} /> {refusal ? refusal.reason : 'That time has passed'}. Choose another time.</p>}
      <div style={{ marginTop: 20 }}>
        {book
          ? <Button icon="check" disabled={!!refusal || past} onClick={() => onBook(picked)}>Book {when}{r.repeatWeekly ? ', weekly' : ''}</Button>
          : <Button icon="send" disabled={!!refusal || past} onClick={() => onPropose(picked)}>Propose {when}</Button>}
      </div>
      <div style={{ marginTop: 10 }}><Button variant="ghost" onClick={onDecline}>Decline the request</Button></div>
    </Sheet>
  );
}

