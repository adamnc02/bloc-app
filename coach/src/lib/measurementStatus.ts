// BLOC's measurement due rule (index.html `getMeasurementStatus`, BLOC §103), for Today's "Coming up": waist and
// hip are due 7 days after the last measurement, or at the next cycle's start if that comes sooner, and at once
// when there's never been one. A copy, because moving it into the engine would change BLOC's served bytes;
// scripts/verify-coach-today.mjs runs it against BLOC's over many cases, so the two can't drift.
type Log = { date?: unknown; waist?: unknown; hip?: unknown } | null | undefined;
type Cycle = { start?: unknown } | null | undefined;

export function getMeasurementStatus(bodyLogs: Log[] | null | undefined, macrocycles: Cycle[] | null | undefined, today: string): { due: boolean; nextDueDate: string; lastDate: string | null } {
  const dates = (bodyLogs || []).filter((l) => l && (l.waist || l.hip) && l.date)
    .map((l) => String(l!.date)).sort();
  const lastDate = dates.length ? dates[dates.length - 1] : null;
  if (!lastDate) return { due: true, nextDueDate: today, lastDate: null };
  const [y, m, d] = lastDate.split('-').map(Number);
  const plus7 = new Date(Date.UTC(y, m - 1, d + 7)).toISOString().slice(0, 10);
  const nextStart = (macrocycles || []).map((mc) => mc && mc.start)
    .filter((st): st is string => typeof st === 'string' && !!st && st > lastDate).sort()[0] || null;
  const nextDueDate = nextStart && nextStart < plus7 ? nextStart : plus7;
  return { due: today >= nextDueDate, nextDueDate, lastDate };
}
