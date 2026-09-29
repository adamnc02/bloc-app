/**
 * The Diary's time maths. Pure; every time is minutes from midnight.
 */

export interface Span {
  start: number;
  end: number;
}

/** Positions snap to 15 minutes. */
export const SNAP_MIN = 15;
/** Standard session length, and the height of an empty-session outline. */
export const SLOT_MIN = 60;

export const snap = (min: number, step = SNAP_MIN) => Math.round(min / step) * step;
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const overlaps = (a: Span, b: Span) => a.start < b.end && b.start < a.end;

/** Sort and merge overlapping or touching spans (group bookings may overlap others). */
export function mergeSpans(spans: Span[]): Span[] {
  const sorted = spans.filter((s) => s.end > s.start).sort((a, b) => a.start - b.start);
  const out: Span[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end);
    else out.push({ start: s.start, end: s.end });
  }
  return out;
}

/**
 * Dotted empty-session outlines for one day.
 *
 * Walk a cursor from the start of the day. Before each booking, lay whole
 * one-hour outlines from the cursor while they fit; a gap shorter than an hour
 * gets none. Then jump the cursor to the end of the booking. Outlines are laid
 * from wherever the last booking ended, so a session booked off the hour
 * (12:15–13:15) pushes the outlines after it along (13:15–14:15, 14:15–15:15…)
 * until the next booking. Bookings outside the day are clipped.
 *
 *   emptySlots([{start: 735, end: 795}], 660, 960)
 *   → 11:00–12:00, 13:15–14:15, 14:15–15:15   (12:00–12:15 and 15:15–16:00 are too short)
 */
export function emptySlots(bookings: Span[], dayStart: number, dayEnd: number, slot = SLOT_MIN): Span[] {
  const busy = mergeSpans(
    bookings.map((b) => ({ start: clamp(b.start, dayStart, dayEnd), end: clamp(b.end, dayStart, dayEnd) })),
  );
  const out: Span[] = [];
  let cursor = dayStart;
  const fill = (until: number) => {
    while (cursor + slot <= until) {
      out.push({ start: cursor, end: cursor + slot });
      cursor += slot;
    }
  };
  for (const b of busy) {
    fill(b.start);
    cursor = Math.max(cursor, b.end);
  }
  fill(dayEnd);
  return out;
}

/**
 * Side-by-side lanes for items that overlap in one day column (a group booking
 * over a one-to-one, or a request placeholder that clashes). Items in the same
 * overlapping cluster share the column width equally.
 */
export function layoutLanes<T extends Span>(items: T[]): { item: T; lane: number; lanes: number }[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: { item: T; lane: number; lanes: number }[] = [];
  let cluster: { item: T; lane: number; lanes: number }[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -Infinity;
  const close = () => {
    cluster.forEach((c) => { c.lanes = laneEnds.length; });
    out.push(...cluster);
    cluster = [];
    laneEnds = [];
  };
  for (const item of sorted) {
    if (item.start >= clusterEnd) { close(); clusterEnd = -Infinity; }
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(item.end); } else laneEnds[lane] = item.end;
    cluster.push({ item, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  close();
  return out;
}

/** 60 → "1 hr", 45 → "45 min", 90 → "1 hr 30". */
export function lengthLabel(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} hr ${m}` : `${h} hr`;
}
