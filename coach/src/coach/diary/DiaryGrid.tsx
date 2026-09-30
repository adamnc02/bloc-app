import { useEffect, useRef, useState, type CSSProperties, type MouseEvent as RMouseEvent, type PointerEvent as RPointerEvent } from 'react';
import type { ISODate } from '@/domain/types';
import { Icon } from '@/components/ui/Icon';
import { fmt, weekday } from '@/lib/format';
import { emptySlots, layoutLanes, snap, clamp } from '@/diary/slots';
import { findClash, requestClashes, type Refusal } from '@/diary/rules';
import { dayOffOn, type Occurrence } from '@/diary/model';
import type { DayOff } from '@/diary/types';
import { BookingBlock, type Who } from './BookingBlock';

/** Pixels per minute: one hour is 60px tall at every size. */
export const PX_PER_MIN = 1;
/** Touch: hold this long to pick a session up; a quicker swipe scrolls the page. */
const HOLD_MS = 300;

export interface DragTarget {
  key: string;
  date: ISODate;
  start: number;
}

interface LiveDrag extends DragTarget {
  refusal: Refusal | null;
  /** Floating copy's top-left in the grid body (px). */
  fx?: number;
  fy?: number;
}

interface Pending {
  occ: Occurrence;
  el: HTMLElement;
  pointerId: number;
  mouse: boolean;
  x0: number; y0: number; x: number; y: number;
  grabDx: number; grabDy: number;
  engaged: boolean;
  timer?: number;
}

export interface DiaryGridProps {
  days: ISODate[];
  occurrences: Occurrence[];
  daysOff: DayOff[];
  dayStart: number;
  dayEnd: number;
  workingDays: number[];
  today: ISODate;
  nowMin: number;
  /** Phone: narrow columns, compact blocks. */
  narrow: boolean;
  onOpen: (o: Occurrence) => void;
  /** A legal drop at a new time. */
  onDrop: (o: Occurrence, date: ISODate, start: number) => void;
  onRefused: (o: Occurrence, reason: string) => void;
  onDay: (date: ISODate) => void;
  /** A day off's note: how many sessions it cancelled, and who was told. */
  offNote: (date: ISODate) => { cancelled: number; told: string };
  /** Tap an empty outline: book a session there. */
  onEmpty: (date: ISODate, start: number) => void;
  who: Who;
}

const top = (min: number, dayStart: number) => (min - dayStart) * PX_PER_MIN;

/**
 * The week / 5-day hour grid (TECHNICAL §152). Hours down the left with lines,
 * dotted empty-hour outlines, sessions placed by real time, a "now" line on
 * today, and drag to move (pointer events: mouse drags at once; touch holds
 * ~300ms first so a normal swipe still scrolls). Drops snap to 15 minutes.
 */
export function DiaryGrid(p: DiaryGridProps) {
  const { days, occurrences, daysOff, dayStart, dayEnd, workingDays, today, nowMin, narrow } = p;
  const bodyRef = useRef<HTMLDivElement>(null);
  const pend = useRef<Pending | null>(null);
  const suppressClick = useRef(false);
  const [live, setLive] = useState<LiveDrag | null>(null);
  const { who } = p;

  const byKey = (key: string) => occurrences.find((o) => o.key === key);
  const drag = live;
  const dragOcc = drag ? byKey(drag.key) : undefined;

  // A placeholder dropped anywhere is a proposed time, refused only on a day off or a clash.
  function refusalFor(o: Occurrence, date: ISODate, start: number) {
    return findClash({ key: o.key, kind: o.kind === 'request' ? 'one_to_one' : o.kind, date, start, duration: o.duration }, occurrences, daysOff, who.name);
  }

  // Stop the page scrolling under a finger that has picked a session up (iOS needs a non-passive touchmove).
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const stop = (e: TouchEvent) => { if (pend.current?.engaged) e.preventDefault(); };
    el.addEventListener('touchmove', stop, { passive: false });
    return () => el.removeEventListener('touchmove', stop);
  }, []);

  // Escape cancels a drag in progress.
  useEffect(() => {
    if (!live) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /** Pointer position → snapped day and start time. */
  function locate(cx: number, cy: number, pd: Pending): LiveDrag | null {
    const body = bodyRef.current;
    if (!body) return null;
    const cols = Array.from(body.querySelectorAll<HTMLElement>('[data-col]'));
    if (!cols.length) return null;
    const rects = cols.map((c) => c.getBoundingClientRect());
    let i = rects.findIndex((r) => cx >= r.left && cx < r.right);
    if (i === -1) i = cx < rects[0].left ? 0 : rects.length - 1;
    const date = cols[i].dataset.col as ISODate;
    const raw = dayStart + (cy - pd.grabDy - rects[i].top) / PX_PER_MIN;
    const start = clamp(snap(raw), dayStart, dayEnd - pd.occ.duration);
    const b = body.getBoundingClientRect();
    return { key: pd.occ.key, date, start, refusal: refusalFor(pd.occ, date, start), fx: cx - b.left - pd.grabDx, fy: cy - b.top - pd.grabDy };
  }

  function engage() {
    const pd = pend.current;
    if (!pd) return;
    pd.engaged = true;
    try { pd.el.setPointerCapture(pd.pointerId); } catch { /* pointer already gone */ }
    if (!pd.mouse && 'vibrate' in navigator) navigator.vibrate?.(8);
    setLive(locate(pd.x, pd.y, pd));
  }

  function cancel() {
    const pd = pend.current;
    if (pd?.timer) window.clearTimeout(pd.timer);
    pend.current = null;
    setLive(null);
  }

  function autoScroll(cy: number) {
    const edge = 90;
    if (cy > window.innerHeight - edge - 40) window.scrollBy(0, 14);
    else if (cy < edge) window.scrollBy(0, -14);
  }

  const bind = (o: Occurrence) => ({
    onPointerDown: (e: RPointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      const r = e.currentTarget.getBoundingClientRect();
      const pd: Pending = {
        occ: o, el: e.currentTarget, pointerId: e.pointerId, mouse: e.pointerType === 'mouse',
        x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, grabDx: e.clientX - r.left, grabDy: e.clientY - r.top, engaged: false,
      };
      if (!pd.mouse) pd.timer = window.setTimeout(engage, HOLD_MS);
      pend.current = pd;
    },
    onPointerMove: (e: RPointerEvent<HTMLElement>) => {
      const pd = pend.current;
      if (!pd || pd.pointerId !== e.pointerId) return;
      pd.x = e.clientX; pd.y = e.clientY;
      if (!pd.engaged) {
        const dist = Math.hypot(e.clientX - pd.x0, e.clientY - pd.y0);
        if (pd.mouse && dist > 4) engage();
        else if (!pd.mouse && dist > 8) cancel(); // it was a scroll or a swipe
        return;
      }
      e.preventDefault();
      autoScroll(e.clientY);
      setLive(locate(e.clientX, e.clientY, pd));
    },
    onPointerUp: (e: RPointerEvent<HTMLElement>) => {
      const pd = pend.current;
      if (!pd || pd.pointerId !== e.pointerId) return;
      if (pd.engaged) {
        const at = locate(e.clientX, e.clientY, pd);
        suppressClick.current = true;
        window.setTimeout(() => { suppressClick.current = false; }, 0);
        if (at) {
          if (at.refusal) p.onRefused(pd.occ, at.refusal.reason);
          else if (at.date !== pd.occ.date || at.start !== pd.occ.start) p.onDrop(pd.occ, at.date, at.start);
        }
      }
      cancel();
    },
    onPointerCancel: () => cancel(),
    onContextMenu: (e: RMouseEvent) => e.preventDefault(),
    onClick: () => { if (!suppressClick.current) p.onOpen(o); },
  });

  const hours: number[] = [];
  for (let h = dayStart; h < dayEnd; h += 60) hours.push(h);
  const height = (dayEnd - dayStart) * PX_PER_MIN;
  const cols = days.length;
  const colIndex = drag ? days.indexOf(drag.date) : -1;
  const showNow = days.includes(today) && nowMin >= dayStart && nowMin <= dayEnd;

  const floatStyle: CSSProperties | undefined = drag && dragOcc && colIndex >= 0 ? {
    height: dragOcc.duration * PX_PER_MIN - 2,
    width: `calc((100% - var(--gw)) / ${cols} - 6px)`,
    ...(drag.fx != null && drag.fy != null
      ? { left: drag.fx, top: drag.fy }
      : { left: `calc(var(--gw) + (100% - var(--gw)) * ${colIndex} / ${cols} + 16px)`, top: top(drag.start, dayStart) + 18 }),
  } : undefined;

  return (
    <div className={`dg ${narrow ? 'is-narrow' : ''} ${drag ? 'is-dragging' : ''}`} style={{ '--cols': cols } as CSSProperties}>
      <div className="dg-head" role="presentation">
        <div className="dg-corner" />
        {days.map((d) => {
          const off = !!dayOffOn(daysOff, d);
          const rest = !workingDays.includes(weekday(d));
          const isToday = d === today;
          const inner = (
            <>
              <span className="dg-dow">{fmt.dayShort(d)}</span>
              <span className="dg-date num">{fmt.dm(d).split(' ')[0]}</span>
              {off ? <span className="dg-flag">Day off</span> : rest ? <span className="dg-flag">Not working</span> : isToday ? <span className="dg-flag is-today">Today</span> : null}
            </>
          );
          const cls = `dg-day ${isToday ? 'is-today' : ''} ${rest ? 'is-rest' : ''} ${off ? 'is-off' : ''} ${d === drag?.date ? 'is-target' : ''}`;
          return <button key={d} type="button" className={cls} onClick={() => p.onDay(d)}
            aria-label={`${fmt.long(d)}${isToday ? ', today' : ''}. ${off ? 'A day off: open to undo' : 'Mark as a day off'}`}>{inner}</button>;
        })}
      </div>

      <div className="dg-body" ref={bodyRef} style={{ height }}>
        <div className="dg-gutter" aria-hidden="true">
          {hours.map((h) => (showNow && Math.abs(h - nowMin) < 20 ? null : <span key={h} className={h === dayStart ? 'is-first' : undefined} style={{ top: top(h, dayStart) + (h === dayStart ? 2 : 0) }}>{fmt.hour(h)}</span>))}
          {showNow && (
            <span className="dg-now-label num" style={{ top: top(nowMin, dayStart) }}>{fmt.time(nowMin)}</span>
          )}
        </div>

        {days.map((d) => {
          const off = dayOffOn(daysOff, d);
          const rest = !workingDays.includes(weekday(d));
          const dayOccs = occurrences.filter((o) => o.date === d);
          const shown = dayOccs;
          // Past days and hours keep their outlines: a session can be added after the fact.
          const outlines = off || rest ? [] : emptySlots(
            shown.filter((o) => o.kind !== 'request').map((o) => ({ start: o.start, end: o.start + o.duration })), dayStart, dayEnd);
          // Bookings share lanes when they overlap (group sessions may). Request placeholders sit on
          // top at full width, inset so a booking they clash with still shows its edge and name.
          const placed = [
            ...layoutLanes(shown.filter((o) => o.kind !== 'request').map((o) => ({ ...o, end: o.start + o.duration }))),
            ...shown.filter((o) => o.kind === 'request').map((o) => ({ item: o, lane: 0, lanes: 1 })),
          ];
          const isTarget = drag?.date === d;
          return (
            <div
              key={d} data-col={d}
              className={`dg-col ${rest ? 'is-rest' : ''} ${off ? 'is-off' : ''} ${d === today ? 'is-today' : ''} ${isTarget ? 'is-target' : ''} ${isTarget && drag?.refusal ? 'is-refused' : ''}`}
            >
              {outlines.map((s) => (
                <button key={s.start} type="button" className="dg-empty" style={{ top: top(s.start, dayStart) + 3, height: (s.end - s.start) * PX_PER_MIN - 6 }}
                  onClick={() => p.onEmpty(d, s.start)} aria-label={`Book a session, ${fmt.long(d)} at ${fmt.time(s.start)}`} />
              ))}

              {off && (() => {
                const note = p.offNote(d);
                return (
                  <div className="dg-offnote">
                    <Icon name="moon" size={16} />
                    <b>{off.note || 'Day off'}</b>
                    {note.cancelled > 0 && <small>{note.cancelled} {note.cancelled === 1 ? 'session' : 'sessions'} cancelled</small>}
                    {note.cancelled > 0 && <small>{note.told}</small>}
                  </div>
                );
              })()}

              {placed.map(({ item: o, lane, lanes: n }) => {
                const clashes = o.kind === 'request' ? requestClashes(o, dayOccs) : [];
                const inset = clashes.length ? (narrow ? 6 : 16) : 0;
                return (
                  <BookingBlock
                    key={o.key}
                    occ={o}
                    compact={narrow || n > 1}
                    clashNames={clashes.map((c) => who.name(c))}
                    who={who}
                    lifted={drag?.key === o.key}
                    style={{
                      top: top(o.start, dayStart) + 1,
                      height: o.duration * PX_PER_MIN - 2,
                      left: `calc(${(lane / n) * 100}% + ${3 + inset}px)`,
                      width: `calc(${100 / n}% - ${6 + inset}px)`,
                    }}
                    {...bind(o)}
                  />
                );
              })}

              {d === today && nowMin >= dayStart && nowMin <= dayEnd && (
                <div className="dg-now" style={{ top: top(nowMin, dayStart) }} aria-hidden="true" />
              )}

              {isTarget && drag && dragOcc && (
                <div
                  className={`dg-land ${drag.refusal ? 'is-refused' : ''}`}
                  style={{ top: top(drag.start, dayStart) + 1, height: dragOcc.duration * PX_PER_MIN - 2 }}
                  aria-hidden="true"
                >
                  <span className="dg-land-label num">
                    {drag.refusal
                      ? <><Icon name="warning" size={12} /> {drag.refusal.reason}</>
                      : `${fmt.dayShort(drag.date)} ${fmt.time(drag.start)}`}
                  </span>
                </div>
              )}
            </div>
          );
        })}

        {drag && dragOcc && floatStyle && <BookingBlock occ={{ ...dragOcc, date: drag.date, start: drag.start }} floating compact={narrow} style={floatStyle} who={who} />}
      </div>

      <div className="sr-only" aria-live="polite">
        {drag && dragOcc
          ? drag.refusal
            ? `Can’t drop here. ${drag.refusal.reason}.`
            : `Moving ${who.name(dragOcc)} to ${fmt.long(drag.date)}, ${fmt.time(drag.start)}.`
          : ''}
      </div>
    </div>
  );
}
