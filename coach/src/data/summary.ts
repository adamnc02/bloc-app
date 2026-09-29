// ═══════════════════════════════════════════════════════════════════════
// One Clients-list row, worked out from a client's bundle.
// Pure: "now" is a parameter, so the vitest cases and the fixtures pin it.
//
// 🚨 Every date about the CLIENT is the client's local date (clientState.ts
//    → localDateIn), and every engine call gets `{ today }` in their zone.
//    The coach's own date is only used for things that are the coach's: an
//    invite's expiry, "last synced".
// ═══════════════════════════════════════════════════════════════════════
import { dayDiff, getDateActiveMacroId, getMacroDurationWeeks, shiftDateStr, type BlocState, type Macrocycle } from '@engine';
import type { LinkStatus, OutcomeStatus } from '@/domain/types';
import { reviewFor } from '@/review/model';
import { fmt, initials as toInitials } from '@/lib/format';
import { localDateIn } from '@/lib/clientState';
import type { ClientBundle } from './types';

/** "Not synced for 48h": often the first sign of drop-off. */
export const STALE_SYNC_HOURS = 48;
/** How far back the row's weight sparkline looks: 5 weeks. */
export const SPARKLINE_DAYS = 35;

export interface CycleNow {
  macroId: string;
  name: string;
  week: number;
  weeks: number;
  /** A cycle the coach published (BLOC stamps `publishedBy`, §131), else the client's own. */
  coachOwned: boolean;
}

export interface ClientSummary {
  id: string;
  name: string;
  initials: string;
  status: LinkStatus;
  /** The client's local date, from their upload's zone. Null with no upload. */
  clientToday: string | null;
  tz: string | null;
  cycle: CycleNow | null;
  /** The second line of the row: the cycle, the invite, or why there's nothing. */
  cycleText: string;
  weights: { date: string; lbs: number }[];
  targetLbs: number | null;
  syncedHoursAgo: number | null;
  staleSync: boolean;
  photoConsent: boolean;
  problem: string | null;
  /** The current cycle's outcome at their today (Review's model), whoever owns the cycle. */
  outcome: { status: OutcomeStatus; reason: string };
}

export function linkStatusOf(b: ClientBundle): LinkStatus {
  if (b.link?.status === 'active') return 'linked';
  if (b.invite) return 'invited';
  if (b.link?.status === 'ended') return 'unlinked';
  return 'not-on-app';
}

export function displayName(b: ClientBundle): string {
  const p = b.profileName;
  if (b.link?.status === 'active' && p && (p.first || p.preferred)) {
    return [p.preferred || p.first, p.surname].filter(Boolean).join(' ');
  }
  return [b.card.firstName, b.card.surname].filter(Boolean).join(' ');
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** The date-active cycle and its week, at the client's today. */
export function cycleAt(s: BlocState, today: string): CycleNow | null {
  const id = getDateActiveMacroId(s, { today });
  const m = (s.macrocycles || []).find((x) => x.id === id);
  if (!m || !m.start) return null;
  const weeks = getMacroDurationWeeks(m);
  const week = Math.min(weeks, Math.floor(dayDiff(m.start, today) / 7) + 1);
  return { macroId: m.id, name: String((m as Macrocycle & { name?: string }).name || 'Cycle'), week, weeks, coachOwned: !!m.publishedBy };
}

/** The next cycle to start after today, for "Next cycle starts …". */
function nextCycleStart(s: BlocState, today: string): string | null {
  const starts = (s.macrocycles || []).map((m) => m.start).filter((d): d is string => !!d && d > today).sort();
  return starts[0] ?? null;
}

/** The coach's own calendar date at an instant (an invite's expiry, an unlink): the coach's, not the client's. */
const coachDate = (ms: number) => localDateIn(Intl.DateTimeFormat().resolvedOptions().timeZone, ms);

export function summarise(b: ClientBundle, nowMs: number): ClientSummary {
  const status = linkStatusOf(b);
  const name = displayName(b);
  const snap = status === 'linked' ? b.snapshot : null;
  const clientToday = snap ? localDateIn(snap.tz, nowMs) : null;
  const cycle = snap && clientToday ? cycleAt(snap.state, clientToday) : null;
  const syncedHoursAgo = snap ? Math.max(0, (nowMs - Date.parse(snap.uploadedAt)) / 3600000) : null;

  let cycleText: string;
  if (status === 'invited' && b.invite) {
    const exp = coachDate(Date.parse(b.invite.expiresAt));
    cycleText = Date.parse(b.invite.expiresAt) > nowMs ? `Invite expires ${fmt.ddm(exp)}` : `Invite expired ${fmt.ddm(exp)}`;
  } else if (status === 'not-on-app') {
    cycleText = 'In person · no plan yet';
  } else if (status === 'unlinked') {
    const ended = b.link?.endedAt ? coachDate(Date.parse(b.link.endedAt)) : null;
    cycleText = ended ? `Unlinked ${fmt.ddm(ended)}` : 'Unlinked';
  } else if (b.snapshotError) {
    cycleText = 'Couldn’t read their latest sync';
  } else if (!snap || !clientToday) {
    cycleText = 'Linked · waiting for their first sync';
  } else if (cycle) {
    cycleText = `${cycle.coachOwned ? cycle.name : 'Own cycle'} · week ${cycle.week} of ${cycle.weeks}`;
  } else {
    const next = nextCycleStart(snap.state, clientToday);
    cycleText = next ? `Next cycle starts ${fmt.ddm(next)}` : 'No active cycle';
  }

  const weights: { date: string; lbs: number }[] = [];
  let targetLbs: number | null = null;
  if (snap && clientToday) {
    const from = shiftDateStr(clientToday, -SPARKLINE_DAYS);
    for (const l of snap.state.bodyLogs || []) {
      const lbs = num(l.weight);
      if (lbs != null && l.date > from && l.date <= clientToday) weights.push({ date: l.date, lbs });
    }
    weights.sort((a, z) => a.date.localeCompare(z.date));
    const m = cycle ? (snap.state.macrocycles || []).find((x) => x.id === cycle.macroId) : null;
    targetLbs = m ? num((m as Macrocycle & { targetBw?: unknown }).targetBw) : null;
  }

  let outcome: ClientSummary['outcome'] = { status: 'no-data', reason: cycleText };
  if (snap && clientToday && cycle) {
    const r = reviewFor(b.card.id, snap.hash, snap.state, cycle.macroId, clientToday, name.split(' ')[0]);
    if (r) outcome = { status: r.outcome.status, reason: r.outcome.reason };
  }

  return {
    id: b.card.id,
    name,
    initials: toInitials(name || '?'),
    status,
    clientToday,
    tz: snap?.tz ?? null,
    cycle,
    cycleText,
    weights,
    targetLbs,
    syncedHoursAgo,
    staleSync: syncedHoursAgo != null && syncedHoursAgo >= STALE_SYNC_HOURS,
    photoConsent: !!b.link?.photoConsent && status === 'linked',
    problem: status === 'linked' ? b.snapshotError : null,
    outcome,
  };
}
