// ═══════════════════════════════════════════════════════════════════════
// Today (TECHNICAL §154): the coach's hub. Pure: every date and minute is passed in.
//
//   Today's sessions  the diary's sessions today (the coach's date), with Start session on a one-to-one from
//                     15 minutes before it starts until the day ends, unless it's already logged.
//   Needs you         everything waiting on the coach, each clearing once dealt with: session requests (and a
//                     confirmed time that now clashes), check-ins due (the engine's coachCheckinSchedule, the one BLOC
//                     shows: a client never asks for one), notes back not replied to, review
//                     photos answered and not yet reviewed, and bookings from the last 14 days that weren't
//                     logged or cancelled (BLOC keeps an assigned session out of "next" until one or the other),
//                     group weeks included (§162: Log it opens the group session, Cancel cancels it for everyone),
//                     and an exercise rated 9+, or missing its target, two weeks running on a coach's cycle (§163:
//                     Reset it opens it in Plan; Leave keeps BLOC's hold, until a further week the same way).
//                     A note back or a check-in due can be DISMISSED (§169, 0036): a note back for good, a check-in
//                     until the cooldown after the dismissal (checkinDueAfter) if it's still due then. The client is
//                     never told.
//   Off track         linked clients whose outcome is off track (Review's judgement), with its one reason.
//   Coming up         check-ins coming due in the next 7 days, cycles in their final week, measurements due, and apps
//                     gone quiet.
//
// 🚨 Anything judged about a client is at the client's today (their upload's zone): check-ins, cycle ends and
//    measurements. The diary's own dates (today's sessions, missed bookings) are the coach's.
// ═══════════════════════════════════════════════════════════════════════
import { checkinDueAfter, coachCheckinSchedule, getMacroEndDate, shiftDateStr, dayDiff, type BlocState, type Loose, type Macrocycle } from '@engine';
import type { AiDraft, CoachPublication, Submission } from '@/ai/types';
import { notesBack, photoRequestState, publishedCheckinDates } from '@/ai/tools';
import type { ClientBundle, Inbox } from '@/data/types';
import type { ClientSummary } from '@/data/summary';
import { addDays, fmt } from '@/lib/format';
import { occurrencesBetween, requestsNeedingCoach, type Occurrence } from '@/diary/model';
import { publishedIdOf } from '@/diary/actions';
import type { Diary, SessionRequest } from '@/diary/types';
import { canStart, cycleForSession, loggedFor, loggedSessions, missedFrom, recordState } from '@/inperson/model';
import { highRatingStreaks, isLeft, type HighStreak } from '@/review/effort';
import { groupLoggedFor } from '@/group/model';
import { getMeasurementStatus } from '@/lib/measurementStatus';
import { clientPath } from '@/app/router';

export interface TodaySession {
  occ: Occurrence;
  /** One-to-one: the client's card. A group has none: it's everyone booked (§162). */
  cardId: string | null;
  group: boolean;
  canStart: boolean;
  logged: boolean;
  /** It has ended (by the coach's clock). */
  past: boolean;
  /** The next one still to start. */
  next: boolean;
}

export type NeedsItem =
  | { kind: 'request'; key: string; at: string; cardId: string | null; request: SessionRequest }
  | { kind: 'checkin'; key: string; at: string; cardId: string; macroId: string; dueOn: string | null; first: boolean }
  | { kind: 'note'; key: string; at: string; cardId: string; submission: Submission; headline: string | null; tool: string | null; macroId: string | null }
  | { kind: 'photos'; key: string; at: string; cardId: string; macroId: string; skipped: boolean; count: number }
  | { kind: 'missed'; key: string; at: string; cardId: string; occ: Occurrence }
  | { kind: 'missedGroup'; key: string; at: string; cardId: null; occ: Occurrence }
  | { kind: 'effort'; key: string; at: string; cardId: string; streak: HighStreak };

export type ComingKind = 'check-in' | 'final-week' | 'measurements' | 'no-sync';
export interface ComingItem { key: string; kind: ComingKind; cardId: string; detail: string; tab: 'review' | 'profile' | 'plan'; at: string }

const byCard = <T extends { cardId: string }>(xs: T[], id: string) => xs.filter((x) => x.cardId === id);

/** The in-person sessions logged, from every card's `session_log` publications. */
function loggedOf(inbox: Inbox) {
  const cards = [...new Set(inbox.publications.filter((p) => p.type === 'session_log').map((p) => p.cardId))];
  return cards.flatMap((c) => loggedSessions(byCard(inbox.publications, c)).map((l) => ({ ...l, cardId: c })));
}

/** Whether a group week is logged: on any attendee's card (§162). */
const groupLogged = (inbox: Inbox, o: Occurrence) => groupLoggedFor(o.clientIds.map((c) => byCard(inbox.publications, c)), publishedIdOf(o), o.date);

export function todaySessions(d: Diary, inbox: Inbox, today: string, nowMin: number): TodaySession[] {
  const logged = loggedOf(inbox);
  const list = occurrencesBetween(d, today, today).filter((o) => o.kind !== 'request');
  const nextKey = list.find((o) => o.start + o.duration > nowMin)?.key ?? null;
  return list.map((occ) => {
    const group = occ.kind === 'group';
    const cardId = group ? null : occ.clientIds[0] ?? null;
    const isLogged = group ? groupLogged(inbox, occ) : !!cardId && !!loggedFor(logged.filter((l) => l.cardId === cardId), publishedIdOf(occ), occ.date);
    return { occ, cardId, group, logged: isLogged, past: occ.start + occ.duration <= nowMin, next: occ.key === nextKey,
      canStart: (group ? occ.clientIds.length > 0 : !!cardId) && !isLogged && canStart(occ.date, occ.start, today, nowMin) };
  });
}

/** Group weeks from the last 14 days, before today, not logged or cancelled (§162). */
export function missedGroups(d: Diary, inbox: Inbox, today: string): Occurrence[] {
  return occurrencesBetween(d, missedFrom(today), addDays(today, -1))
    .filter((o) => o.kind === 'group' && o.clientIds.length > 0 && !groupLogged(inbox, o));
}

/** One-to-one bookings from the last 14 days, before today, neither logged nor cancelled (cancelled ones aren't occurrences). */
export function missedBookings(d: Diary, inbox: Inbox, today: string): { occ: Occurrence; cardId: string }[] {
  const logged = loggedOf(inbox);
  return occurrencesBetween(d, missedFrom(today), addDays(today, -1))
    .filter((o) => o.kind === 'one_to_one' && o.clientIds[0])
    .filter((o) => !loggedFor(logged.filter((l) => l.cardId === o.clientIds[0]), publishedIdOf(o), o.date))
    .map((occ) => ({ occ, cardId: occ.clientIds[0] }));
}

/**
 * Exercises rated 9 or 10 two weeks running on each client's running coach's cycle (§163), on their record as their
 * phone holds it: the upload (a linked client) with every plan and session_log publication folded in, so a client not on
 * the app, whose ratings the coach gives, is judged the same way. At the client's today.
 */
export function effortFlags(inbox: Inbox, bundles: ClientBundle[], summaries: ClientSummary[], coachId: string, today: string): { cardId: string; streak: HighStreak }[] {
  const out: { cardId: string; streak: HighStreak }[] = [];
  for (const b of bundles) {
    const sum = summaries.find((x) => x.id === b.card.id);
    if (!sum || sum.status === 'unlinked') continue;
    const snap = b.link?.status === 'active' ? b.snapshot : null;
    const state = recordState({ state: snap?.state ?? null, publications: byCard(inbox.publications, b.card.id), coachId, since: b.lastEndedAt });
    const t = sum.clientToday ?? today;
    const macro = cycleForSession(state, t, t);
    if (!macro) continue;
    for (const streak of highRatingStreaks(state, macro)) if (!isLeft(inbox.leaves ?? [], b.card.id, streak)) out.push({ cardId: b.card.id, streak });
  }
  return out;
}

export function needsYou(d: Diary, inbox: Inbox, bundles: ClientBundle[], summaries: ClientSummary[], today: string, coachId = 'coach'): NeedsItem[] {
  const out: NeedsItem[] = [];
  for (const r of requestsNeedingCoach(d)) out.push({ kind: 'request', key: `r:${r.id}`, at: r.createdAt, cardId: r.cardId, request: r });

  for (const b of bundles) {
    if (b.link?.status !== 'active') continue;
    const cardId = b.card.id;
    const subs = inbox.submissions.filter((x) => x.clientId === b.link!.clientId);
    const drafts: AiDraft[] = inbox.drafts.filter((x) => x.cardId === cardId);
    const pubs: CoachPublication[] = byCard(inbox.publications, cardId);
    // A check-in due on the schedule (at the client's today). Its key names the due date, so a dismissal, or a run
    // and publish, clears this one and the next due date is a new item.
    const sum = summaries.find((s) => s.id === cardId);
    const due = checkinDue(b.snapshot?.state ?? null, sum, pubs);
    if (due && !isDismissed(inbox, `c:${cardId}:${due.macroId}:${due.dueOn ?? 'first'}`, sum!.clientToday!)) out.push({ kind: 'checkin', key: `c:${cardId}:${due.macroId}:${due.dueOn ?? 'first'}`, at: due.dueOn ?? sum!.clientToday!, cardId, macroId: due.macroId, dueOn: due.dueOn, first: !due.dueOn });
    // Notes back with no reply yet: every response on the card.
    const responses = [...new Set(subs.filter((x) => x.kind === 'note_back').map((x) => String(x.body?.response_id ?? '')))];
    for (const rid of responses) {
      const resp = pubs.filter((p) => p.type === 'ai_response' && p.payload?.response_id === rid).sort((a, z) => z.seq - a.seq)[0];
      for (const n of notesBack(subs, pubs, rid)) if (!n.reply && !isDismissed(inbox, `n:${n.note.id}`, null)) out.push({ kind: 'note', key: `n:${n.note.id}`, at: n.note.createdAt, cardId, submission: n.note,
        headline: (resp?.payload?.content as Loose | undefined)?.headline ?? null, tool: (resp?.payload?.tool as string | undefined) ?? null, macroId: (resp?.payload?.macro_id as string | undefined) ?? null });
    }
    // Review photos answered (sent or skipped) and no review run since.
    for (const m of [...new Set(pubs.filter((p) => p.type === 'photo_request').map((p) => String(p.payload?.macro_id ?? '')))].filter(Boolean)) {
      const st = photoRequestState(pubs, subs, m);
      if (st.status !== 'answered' || !st.answer) continue;
      const ran = drafts.some((x) => x.tool === 'cycle_review' && x.macroId === m && x.createdAt > st.answer!.createdAt);
      if (!ran) out.push({ kind: 'photos', key: `p:${st.answer.id}`, at: st.answer.createdAt, cardId, macroId: m, skipped: st.skipped, count: st.before.length + st.after.length });
    }
  }
  const atOf = (occ: Occurrence) => `${occ.date}T${String(Math.floor(occ.start / 60)).padStart(2, '0')}:${String(occ.start % 60).padStart(2, '0')}`;
  for (const { occ, cardId } of missedBookings(d, inbox, today)) out.push({ kind: 'missed', key: `m:${occ.key}`, at: atOf(occ), cardId, occ });
  for (const occ of missedGroups(d, inbox, today)) out.push({ kind: 'missedGroup', key: `g:${occ.key}`, at: atOf(occ), cardId: null, occ });
  for (const { cardId, streak: x } of effortFlags(inbox, bundles, summaries, coachId, today)) {
    out.push({ kind: 'effort', key: `e:${x.kind}:${cardId}:${x.macroId}:${x.dayKey}:${x.exId}:${x.weeks[1]}`, at: today, cardId, streak: x });
  }
  return out.sort((a, z) => a.at.localeCompare(z.at));
}

/**
 * Whether the coach dismissed a Needs you item (0036). A note back (`clientToday` null) stays dismissed. A check-in due
 * comes back once the cooldown after the dismissal has passed (checkinDueAfter of its date, at the client's today), so a
 * check-in skipped and never published is raised again a fortnight later rather than never.
 */
export function isDismissed(inbox: Inbox, key: string, clientToday: string | null): boolean {
  const d = (inbox.dismissed ?? []).filter((x) => x.key === key).map((x) => x.at.slice(0, 10)).sort().pop();
  if (!d) return false;
  return clientToday == null || clientToday < checkinDueAfter(d);
}

/** A linked client's check-in due today on the schedule, on the cycle Review judges (the running one), at their today. */
export function checkinDue(state: BlocState | null, sum: ClientSummary | undefined, pubs: CoachPublication[]): { macroId: string; dueOn: string | null } | null {
  if (!state || !sum || sum.status !== 'linked' || !sum.clientToday || !sum.cycle) return null;
  const m = (state.macrocycles || []).find((x) => x.id === sum.cycle!.macroId) as Macrocycle | undefined;
  if (!m) return null;
  const sch = coachCheckinSchedule(state, { today: sum.clientToday }, m, publishedCheckinDates(pubs, m.id));
  return sch.due ? { macroId: m.id, dueOn: sch.dueOn } : null;
}

export const offTrack = (summaries: ClientSummary[]) => summaries.filter((s) => s.status === 'linked' && s.outcome.status === 'off-track');

/** Coming up, for linked clients with an upload, at each client's today; within the next 7 days. */
export function comingUp(bundles: ClientBundle[], summaries: ClientSummary[], inbox: Inbox): ComingItem[] {
  const out: ComingItem[] = [];
  for (const s of summaries) {
    if (s.status !== 'linked') continue;
    const b = bundles.find((x) => x.card.id === s.id);
    const st = b?.snapshot?.state;
    if (s.staleSync) out.push({ key: `q:${s.id}`, kind: 'no-sync', cardId: s.id, detail: `No sync for ${Math.round((s.syncedHoursAgo ?? 0) / 24)} days`, tab: 'profile', at: '' });
    if (!st || !s.clientToday) continue;
    const today = s.clientToday;
    const soon = shiftDateStr(today, 7);
    const m = s.cycle ? (st.macrocycles || []).find((x) => x.id === s.cycle!.macroId) as Macrocycle | undefined : undefined;
    if (m && s.cycle) {
      const end = getMacroEndDate(m, { today });
      if (end >= today && end <= soon) out.push({ key: `f:${s.id}`, kind: 'final-week', cardId: s.id, detail: `${s.cycle.name} ends ${end === today ? 'today' : `in ${dayDiff(today, end)} ${dayDiff(today, end) === 1 ? 'day' : 'days'}`}`, tab: 'plan', at: end });
      // Coming due within the week; once due it's Needs you's.
      const sch = coachCheckinSchedule(st as BlocState, { today }, m, publishedCheckinDates(byCard(inbox.publications, s.id), m.id));
      if (!sch.due && sch.enoughData && sch.dueOn && sch.dueOn > today && sch.dueOn <= soon && sch.dueOn <= end) {
        out.push({ key: `k:${s.id}`, kind: 'check-in', cardId: s.id, detail: `Check-in due ${fmt.ddm(sch.dueOn)}`, tab: 'review', at: sch.dueOn });
      }
    }
    const ms = getMeasurementStatus(st.bodyLogs as Loose[], st.macrocycles as Loose[], today);
    if (ms.nextDueDate <= soon && (!ms.lastDate || ms.lastDate < today)) out.push({ key: `w:${s.id}`, kind: 'measurements', cardId: s.id, detail: ms.due ? (ms.lastDate ? `Measurements due · last ${fmt.ddm(ms.lastDate)}` : 'No measurements yet') : `Measurements due ${fmt.ddm(ms.nextDueDate)}`, tab: 'review', at: ms.nextDueDate });
  }
  return out.sort((a, z) => (a.at || '').localeCompare(z.at || ''));
}

// ── A Needs you item's button, and a tapped push about it (TECHNICAL §158) ──
export type NeedsOpen = { kind: 'request'; id: string } | { kind: 'path'; path: string };

/** Where a request, a check-in or a note back is dealt with: the button on its card, and a tapped push. */
export function needsItemOpen(it: NeedsItem): NeedsOpen | null {
  switch (it.kind) {
    case 'request': return { kind: 'request', id: it.request.id };
    case 'checkin': return { kind: 'path', path: clientPath(it.cardId, 'review', it.macroId, null, { at: 'ai', tool: 'check_in' }) };
    case 'photos': return { kind: 'path', path: clientPath(it.cardId, 'review', it.macroId, null, { at: 'ai', tool: 'cycle_review' }) };
    case 'note': return { kind: 'path', path: clientPath(it.cardId, 'review', it.macroId, null, { at: 'note', note: it.submission.id, tool: it.tool }) };
    default: return null;
  }
}

/**
 * A push's tag ('request:<id>', 'photos:<submission id>', 'note:<submission id>') to its item's
 * action. The item's key carries the same id. None (it was dealt with already): Today, as it is.
 */
export function pushAction(tag: string, items: NeedsItem[]): NeedsOpen | null {
  const [kind, id] = tag.split(':');
  const prefix = kind === 'request' ? 'r' : kind === 'photos' ? 'p' : kind === 'note' ? 'n' : null;
  const it = prefix && id ? items.find((x) => x.key === `${prefix}:${id}`) : undefined;
  return it ? needsItemOpen(it) : null;
}
