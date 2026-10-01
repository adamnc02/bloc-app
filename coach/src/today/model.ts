// ═══════════════════════════════════════════════════════════════════════
// Today (TECHNICAL §154): the coach's hub. Pure: every date and minute is passed in.
//
//   Today's sessions  the diary's sessions today (the coach's date), with Start session on a one-to-one from
//                     15 minutes before it starts until the day ends, unless it's already logged.
//   Needs you         everything waiting on the coach, each clearing once dealt with: session requests (and a
//                     confirmed time that now clashes), notes back not replied to (on a check-in, a challenge), review
//                     photos answered and not yet reviewed, and bookings from the last 14 days that weren't
//                     logged or cancelled (BLOC keeps an assigned session out of "next" until one or the other),
//                     group weeks included (§162: Log it opens the group session, Cancel cancels it for everyone),
//                     and an exercise rated 9+, or missing its target, two weeks running on a coach's cycle (§163:
//                     Reset it opens it in Plan; Leave keeps BLOC's hold, until a further week the same way).
//                     Only a CHALLENGE (a note back on a check-in) can be dismissed (§169, 0036), on every device; the
//                     client is never told.
//   Off track         linked clients whose outcome is off track (Review's judgement), with its one reason.
//   Coming up         the AI tools due now or in the next 7 days (aiSchedule: a check-in, a cycle review, next-cycle
//                     advice; each clears when published; never in Needs you, never dismissed), and
//                     apps gone quiet.
//
// 🚨 Anything judged about a client is at the client's today (their upload's zone): check-ins and cycle ends.
//    The diary's own dates (today's sessions, missed bookings) are the coach's.
// ═══════════════════════════════════════════════════════════════════════
import { coachCheckinSchedule, getMacroEndDate, shiftDateStr, type BlocState, type Loose, type Macrocycle } from '@engine';
import type { AiDraft, AiTool, CoachPublication, Submission } from '@/ai/types';
import { notesBack, PHOTO_WAIT_DAYS, photoRequestState, publishedCheckinDates } from '@/ai/tools';
import type { ClientBundle, Inbox } from '@/data/types';
import type { ClientSummary } from '@/data/summary';
import { addDays, fmt } from '@/lib/format';
import { occurrencesBetween, requestsNeedingCoach, type Occurrence } from '@/diary/model';
import { publishedIdOf } from '@/diary/actions';
import type { Diary, SessionRequest } from '@/diary/types';
import { canStart, cycleForSession, loggedFor, loggedSessions, missedFrom, recordState } from '@/inperson/model';
import { highRatingStreaks, isLeft, type HighStreak } from '@/review/effort';
import { groupLoggedFor } from '@/group/model';
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
  | { kind: 'note'; key: string; at: string; cardId: string; submission: Submission; headline: string | null; tool: string | null; macroId: string | null }
  | { kind: 'photos'; key: string; at: string; cardId: string; macroId: string; skipped: boolean; count: number }
  | { kind: 'missed'; key: string; at: string; cardId: string; occ: Occurrence }
  | { kind: 'missedGroup'; key: string; at: string; cardId: null; occ: Occurrence }
  | { kind: 'effort'; key: string; at: string; cardId: string; streak: HighStreak };

export type ComingKind = 'check-in' | 'final-week' | 'next-cycle' | 'no-sync';
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
    // Notes back with no reply yet: every response on the card.
    const responses = [...new Set(subs.filter((x) => x.kind === 'note_back').map((x) => String(x.body?.response_id ?? '')))];
    for (const rid of responses) {
      const resp = pubs.filter((p) => p.type === 'ai_response' && p.payload?.response_id === rid).sort((a, z) => z.seq - a.seq)[0];
      // Only a challenge (a note on a check-in) can be dismissed (§169).
      const challenge = String(resp?.payload?.tool ?? '') === 'check_in';
      for (const n of notesBack(subs, pubs, rid)) if (!n.reply && !(challenge && isDismissed(inbox, `n:${n.note.id}`))) out.push({ kind: 'note', key: `n:${n.note.id}`, at: n.note.createdAt, cardId, submission: n.note,
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

export interface AiDue { tool: AiTool; macroId: string; at: string; title: string; detail: string; stamp: string }
export interface AiComing { tool: AiTool; macroId: string; at: string; detail: string }

const published = (pubs: CoachPublication[], tool: AiTool, macroId: string) =>
  pubs.some((p) => p.type === 'ai_response' && String(p.payload?.tool) === tool && p.payload?.macro_id === macroId);

/**
 * When each AI tool is DUE or COMING (the next 7 days), at the client's today: both are Coming up's rows. None is ever
 * in Needs you or dismissed: each clears when the coach publishes it.
 *   · Check-in, on the running cycle: the engine's schedule (coachCheckinSchedule, §168).
 *   · Cycle review, on any cycle from its final week to 14 days after its end, until one is published: due when the
 *     coach has the next move (no photos asked yet; or asked, the cycle over, and PHOTO_WAIT_DAYS without an answer).
 *     Asked and waiting is the client's move; answered is Needs you's "Review photos in" card.
 *   · Next cycle, on the running cycle: from 21 days before its end (BLOC's tab window, coachTabsReady) to the end,
 *     until advice for it is published.
 */
export function aiSchedule(state: BlocState, today: string, runningMacroId: string | null, pubs: CoachPublication[], subs: Submission[]): { due: AiDue[]; coming: AiComing[] } {
  const due: AiDue[] = [], coming: AiComing[] = [];
  const soon = shiftDateStr(today, 7);
  const ctx = { today };
  const running = runningMacroId ? (state.macrocycles || []).find((x) => x.id === runningMacroId) as Macrocycle | undefined : undefined;
  if (running?.start) {
    const end = getMacroEndDate(running, ctx);
    const sch = coachCheckinSchedule(state, ctx, running, publishedCheckinDates(pubs, running.id));
    if (sch.due) due.push({ tool: 'check_in', macroId: running.id, at: sch.dueOn ?? today, stamp: sch.dueOn ?? 'first', title: sch.dueOn ? `Check-in due since ${fmt.ddm(sch.dueOn)}` : 'First check-in due',
      detail: sch.dueOn ? 'two weeks since the last' : 'their trend calls for one' });
    else if (sch.enoughData && sch.dueOn && sch.dueOn <= soon && sch.dueOn <= end) coming.push({ tool: 'check_in', macroId: running.id, at: sch.dueOn, detail: `Check-in due ${fmt.ddm(sch.dueOn)}` });
    const opens = shiftDateStr(end, -21);
    if (!published(pubs, 'next_cycle', running.id)) {
      if (today >= opens && today <= end) due.push({ tool: 'next_cycle', macroId: running.id, at: opens, stamp: 'open', title: 'Next cycle due', detail: `cycle ends ${fmt.ddm(end)}` });
      else if (opens > today && opens <= soon) coming.push({ tool: 'next_cycle', macroId: running.id, at: opens, detail: `Next cycle advice from ${fmt.ddm(opens)}` });
    }
  }
  for (const m of (state.macrocycles || []) as Macrocycle[]) {
    if (!m.start || published(pubs, 'cycle_review', m.id)) continue;
    const end = getMacroEndDate(m, ctx);
    const finalWeek = shiftDateStr(end, -6);
    const name = String(m.name || 'The cycle');
    if (today >= finalWeek && today <= shiftDateStr(end, 14)) {
      const ph = photoRequestState(pubs, subs, m.id);
      if (ph.status === 'none') due.push({ tool: 'cycle_review', macroId: m.id, at: finalWeek, stamp: 'ask', title: 'Cycle review due',
        detail: `${name} ${today > end ? 'ended' : 'ends'} ${fmt.ddm(end)}: ask for photos first` });
      else if (ph.status === 'waiting' && today > end && ph.askedOn && today >= shiftDateStr(ph.askedOn, PHOTO_WAIT_DAYS)) due.push({ tool: 'cycle_review', macroId: m.id, at: shiftDateStr(ph.askedOn, PHOTO_WAIT_DAYS), stamp: 'nophotos', title: 'Cycle review due',
        detail: `no photos since ${fmt.ddm(ph.askedOn)}: run it without them` });
    } else if (finalWeek > today && finalWeek <= soon) {
      coming.push({ tool: 'cycle_review', macroId: m.id, at: finalWeek, detail: `${name}: final week from ${fmt.ddm(finalWeek)}, then its review` });
    }
  }
  return { due, coming };
}

/** Whether the coach dismissed a Needs you item (0036): a note back, for good. */
export function isDismissed(inbox: Inbox, key: string): boolean {
  return (inbox.dismissed ?? []).some((x) => x.key === key);
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
    // The AI tools, due now or coming due within the week (aiSchedule): this list's only.
    const subs = inbox.submissions.filter((x) => x.clientId === b?.link?.clientId);
    const KIND: Record<AiTool, ComingKind> = { check_in: 'check-in', cycle_review: 'final-week', next_cycle: 'next-cycle' };
    const ai = aiSchedule(st as BlocState, today, s.cycle?.macroId ?? null, byCard(inbox.publications, s.id), subs);
    for (const x of ai.due) out.push({ key: `${KIND[x.tool]}:${s.id}:${x.macroId}`, kind: KIND[x.tool], cardId: s.id, detail: `${x.title} · ${x.detail}`, tab: 'review', at: x.at });
    for (const x of ai.coming) out.push({ key: `${KIND[x.tool]}:${s.id}:${x.macroId}`, kind: KIND[x.tool], cardId: s.id, detail: x.detail, tab: 'review', at: x.at });
  }
  return out.sort((a, z) => (a.at || '').localeCompare(z.at || ''));
}

// ── A Needs you item's button, and a tapped push about it (TECHNICAL §158) ──
export type NeedsOpen = { kind: 'request'; id: string } | { kind: 'path'; path: string };

/** Where a request, a check-in or a note back is dealt with: the button on its card, and a tapped push. */
export function needsItemOpen(it: NeedsItem): NeedsOpen | null {
  switch (it.kind) {
    case 'request': return { kind: 'request', id: it.request.id };
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
