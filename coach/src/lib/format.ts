import { formatInches } from '@engine/review';
import type { ISODate } from '@/domain/types';

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MON_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MON_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Dates are handled as UTC midnight so fixtures never drift with the viewer's zone. */
export function toDate(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
export function toISO(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}
export function addDays(iso: ISODate, n: number): ISODate {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
}
export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86400000);
}
/** 0 = Monday … 6 = Sunday. */
export function weekday(iso: ISODate): number {
  return (toDate(iso).getUTCDay() + 6) % 7;
}
export function startOfWeek(iso: ISODate): ISODate {
  return addDays(iso, -weekday(iso));
}

export const fmt = {
  dayShort: (iso: ISODate) => DAY_SHORT[weekday(iso)],
  dayLong: (iso: ISODate) => DAY_LONG[weekday(iso)],
  /** "28 Sep" */
  dm: (iso: ISODate) => { const d = toDate(iso); return `${d.getUTCDate()} ${MON_SHORT[d.getUTCMonth()]}`; },
  /** "Mon 28 Sep" */
  ddm: (iso: ISODate) => `${fmt.dayShort(iso)} ${fmt.dm(iso)}`,
  /** "Monday 28 September" (page eyebrows) */
  long: (iso: ISODate) => { const d = toDate(iso); return `${fmt.dayLong(iso)} ${d.getUTCDate()} ${MON_LONG[d.getUTCMonth()]}`; },
  /** "28 Sep – 4 Oct" / "5–11 Oct" */
  range: (a: ISODate, b: ISODate) => {
    const A = toDate(a), B = toDate(b);
    return A.getUTCMonth() === B.getUTCMonth()
      ? `${A.getUTCDate()}–${B.getUTCDate()} ${MON_SHORT[B.getUTCMonth()]}`
      : `${fmt.dm(a)} – ${fmt.dm(b)}`;
  },
  /** minutes from midnight → "18:00" */
  time: (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`,
  /** minutes → "6am", "5:15pm" (diary gutter) */
  hour: (min: number) => {
    const h = Math.floor(min / 60), m = min % 60, ap = h < 12 || h === 24 ? 'am' : 'pm';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return m ? `${h12}:${String(m).padStart(2, '0')}${ap}` : `${h12}${ap}`;
  },
  int: (n: number) => Math.round(n).toLocaleString('en-GB'),
  one: (n: number) => n.toFixed(1),
  signed: (n: number, digits = 0) => { const r = Number(n.toFixed(digits)); return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toFixed(digits)}`; },
  signedInt: (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(Math.round(n)).toLocaleString('en-GB')}`,
  /** Inches with quarter fractions: 32.25 → 32¼″ (the engine's, so Review's outcome text and Coach's screens agree). */
  inches: (n: number) => formatInches(n),
  kg: (n: number) => n.toFixed(1),
  ago: (hours: number | null) => {
    if (hours == null) return 'Never synced';
    if (hours < 1) return 'Synced just now';
    if (hours < 24) return `Last synced ${Math.round(hours)}h ago`;
    return `Last synced ${Math.round(hours / 24)}d ago`;
  },
};

/**
 * A set's weight as Train shows it (BLOC index.html fmtKg): whole numbers without a decimal point (25, not 25.0),
 * anything else to its own precision (22.5, 23.75). Display only: the engine's targets ("25.0") and what's logged
 * keep their own strings. Anything that isn't a complete number ("", "—", "25." mid-typing) comes back as it is.
 * Train's set weights only; fmt.kg (one decimal) is unchanged everywhere else.
 */
export function setKg(v: string | number | null | undefined): string {
  if (v == null) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(Math.round(v * 100) / 100) : '';
  const t = v.trim();
  return /^-?\d+(\.\d+)?$/.test(t) ? String(Math.round(parseFloat(t) * 100) / 100) : t;
}

/** Up to two initials, from the first LETTER of each word: "Work (test client)" is "WT", never "W(". */
export function initials(name: string): string {
  return name.split(/\s+/).map((p) => (p.match(/\p{L}/u) ?? [''])[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}
