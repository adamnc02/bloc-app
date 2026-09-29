// The Diary's booking rules. Pure.
// - Overlapping sessions are refused, except group sessions.
// - Request placeholders never block anything (they may clash by design).
// - Nothing can land on a day off. Non-working days and hours are a guide only.
// - A past time is allowed: a session can be added after the fact.
// 🚨 These rules are the ONLY overlap check: a series' weeks exist only once
//    expanded, so the database can't see a clash between a series and a one-off.
import type { ISODate } from '@/domain/types';
import { fmt } from '@/lib/format';
import { isDayOff, occurrencesBetween, seriesDates, type Occurrence, type OccurrenceKind } from './model';
import { overlaps } from './slots';
import type { DayOff, Diary, Series } from './types';

export interface Refusal { reason: string; withKey?: string }

export interface Candidate {
  /** The occurrence being moved (skipped in the check), or null for a new session. */
  key: string | null;
  kind: OccurrenceKind;
  date: ISODate;
  start: number;
  duration: number;
}

/** How far ahead "All future" and a new weekly session are checked. */
export const SERIES_CHECK_WEEKS = 26;

export function findClash(c: Candidate, occurrences: Occurrence[], daysOff: DayOff[], name: (o: Occurrence) => string): Refusal | null {
  if (isDayOff(daysOff, c.date)) return { reason: 'That’s a day off' };
  if (c.start + c.duration > 1440) return { reason: 'It would run past midnight' };
  if (c.kind === 'group') return null;
  const span = { start: c.start, end: c.start + c.duration };
  const hit = occurrences.find((o) =>
    o.key !== c.key && o.date === c.date && !o.cancelled && o.kind !== 'request' && o.kind !== 'group'
    && overlaps(span, { start: o.start, end: o.start + o.duration }));
  if (!hit) return null;
  return { reason: `Clashes with ${name(hit)} ${fmt.time(hit.start)}–${fmt.time(hit.start + hit.duration)}`, withKey: hit.key };
}

/**
 * A weekly session from `from` onwards: every week in the next
 * SERIES_CHECK_WEEKS is checked, skipping the series being replaced (its
 * weeks from `from` on move with it). Days off skip that week, not refuse.
 */
export function findSeriesClash(d: Diary, s: Pick<Series, 'kind' | 'weekday' | 'start' | 'duration' | 'from' | 'to'>,
  replacing: string | null, name: (o: Occurrence) => string): Refusal | null {
  if (s.start + s.duration > 1440) return { reason: 'It would run past midnight' };
  if (s.kind === 'group') return null;
  const until = fmtTo(s.from, s.to);
  const occs = occurrencesBetween(d, s.from, until).filter((o) => !(replacing && o.seriesId === replacing && (o.seriesDate ?? o.date) >= s.from));
  for (const date of seriesDates({ ...s, id: '', cancelled: [], title: null, location: null, clientIds: [] }, s.from, until)) {
    if (isDayOff(d.daysOff, date)) continue;
    const r = findClash({ key: null, kind: s.kind, date, start: s.start, duration: s.duration }, occs, [], name);
    if (r) return { ...r, reason: `${r.reason} on ${fmt.ddm(date)}` };
  }
  return null;
}
const fmtTo = (from: ISODate, to: ISODate | null) => {
  const horizon = seriesHorizon(from);
  return to && to < horizon ? to : horizon;
};
export const seriesHorizon = (from: ISODate) => {
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + SERIES_CHECK_WEEKS * 7);
  return d.toISOString().slice(0, 10);
};

/** Sessions a placeholder overlaps (shown on it, never refused). */
export function requestClashes(r: Occurrence, occurrences: Occurrence[]): Occurrence[] {
  const span = { start: r.start, end: r.start + r.duration };
  return occurrences.filter((o) => o.key !== r.key && o.date === r.date && !o.cancelled && o.kind !== 'request'
    && overlaps(span, { start: o.start, end: o.start + o.duration }));
}

