// The demo Rebuild's rows (TECHNICAL §164), held to what Coach and 0023's
// allow-lists accept, and to the order stampLedger depends on.
import { describe, expect, it } from 'vitest';
import { getHomeWeekStart, shiftDateStr, type Loose } from '@engine';
import { clientOutcome } from '@engine/review';
import { stampLedger } from '@engine/demo';
import { buildDemoRows, demoId, type DemoIds } from './build';
import { DEMO_CARDS, type DemoCardKey } from './cards';
import { BOOKING_KEYS } from '@/diary/publish';
import { SESSION_LOG_KEYS, parseSessionId, loggedSessions } from '@/inperson/model';
import { foldPlan } from '@/plan/fold';
import { weekday } from '@/lib/format';
import type { CoachPublication } from '@/ai/types';
import { missedBookings, missedGroups } from '@/today/model';
import { latestDraft, notesBack, sentEdit } from '@/ai/tools';
import type { AiDraft } from '@/ai/types';
import { applyMacroTemplate, type MacroTemplateBody } from '@/plan/templates';
import { makeIds } from '@/plan/doc';
import { CIRCUITS_TEMPLATE_ID } from './build';
import type { Diary } from '@/diary/types';
import { DEFAULT_SETTINGS } from '@/diary/types';
import { localDateIn } from '@engine/review';

const NOW = Date.parse('2026-10-07T09:00:00Z'); // a Wednesday
const IDS: DemoIds = {
  coachId: 'coach-demo',
  cards: Object.fromEntries(DEMO_CARDS.map((c) => [c.key, demoId(`test-card:${c.key}`)])) as Record<DemoCardKey, string>,
  users: Object.fromEntries(DEMO_CARDS.filter((c) => c.account).map((c) => [c.key, demoId(`test-user:${c.key}`)])),
};
const rows = buildDemoRows(IDS, NOW);
/** The publications as Coach reads them back, numbered in insert order. */
const asCoach = (card: DemoCardKey): CoachPublication[] => rows.publications
  .map((p, i) => ({ ...p, seq: i + 1 }))
  .filter((p) => p.card === card)
  .map((p) => ({ id: p.id, seq: p.seq, type: p.type, payload: p.payload, supersedes: null, createdAt: p.createdAt, ack: null }));

// 0023's allow-lists (plus 0027–0030), the top-level keys each type may carry.
const ALLOWED: Record<string, readonly string[]> = {
  plan: ['v', 'macrocycle', 'exercises', 'supersets', 'deloads', 'remove_exercise_ids', 'remove_superset_ids'],
  goal_phases: ['v', 'macro_id', 'goals', 'remove_goal_ids'],
  ai_response: ['v', 'tool', 'response_id', 'macro_id', 'content', 'goal_changes', 'updated'],
  booking: BOOKING_KEYS,
  session_log: SESSION_LOG_KEYS,
  measurement: ['v', 'log_date', 'weight', 'waist', 'hip'],
  note_reply: ['v', 'submission_id', 'text'],
  photo_request: ['v', 'request_id', 'macro_id', 'cancelled'],
};

describe('demo rows', () => {
  it('every payload is within its type’s allow-list', () => {
    for (const p of rows.publications) {
      const extra = Object.keys(p.payload).filter((k) => !ALLOWED[p.type]?.includes(k));
      expect({ type: p.type, extra }).toEqual({ type: p.type, extra: [] });
    }
  });

  it('each card’s plans and goal phases come before anything else sent to it', () => {
    for (const c of DEMO_CARDS) {
      const types = rows.publications.filter((p) => p.card === c.key).map((p) => p.type);
      const firstOther = types.findIndex((t) => t !== 'plan' && t !== 'goal_phases');
      const lastPlan = Math.max(types.lastIndexOf('plan'), types.lastIndexOf('goal_phases'));
      if (firstOther >= 0) expect(lastPlan < firstOther).toBe(true);
    }
  });

  it('ids are unique, and the same on every build', () => {
    const all = [...rows.publications.map((p) => p.id), ...rows.series.map((s) => s.id), ...rows.bookings.map((b) => b.id), ...rows.submissions.map((s) => s.id), ...rows.requests.map((r) => r.id)];
    expect(new Set(all).size).toBe(all.length);
    expect(buildDemoRows(IDS, NOW)).toEqual(rows);
  });

  it('a week later it is the same diary, a week on', () => {
    const next = buildDemoRows(IDS, NOW + 7 * 86400000);
    expect(next.series.map((s) => s.effective_from)).toEqual(rows.series.map((s) => shiftDateStr(s.effective_from, 7)));
    expect(next.publications.map((p) => p.type)).toEqual(rows.publications.map((p) => p.type));
  });

  it('every weekly session starts on its own weekday; the diary starts on Mondays', () => {
    for (const s of rows.series) expect(weekday(s.effective_from)).toBe(s.weekday);
    const monday = getHomeWeekStart('2026-10-07');
    expect(monday).toBe('2026-10-05');
  });

  it('Eileen (not on the app): Coach reads her plan and her in-person sessions from publications alone', () => {
    const pubs = asCoach('eileen');
    const cycles = foldPlan({ state: null, publications: pubs, coachId: IDS.coachId, since: null });
    expect(cycles.map((c) => c.name)).toEqual(['Strength and Balance']);
    const logged = loggedSessions(pubs);
    expect(logged.length).toBe(13); // 6 weeks of Tuesdays and Fridays, and yesterday (Tuesday)
    for (const l of logged) {
      const where = parseSessionId(l.sessionId)!;
      const series = rows.series.find((s) => s.id === where.bookingId)!;
      expect(weekday(where.date)).toBe(series.weekday);
    }
    expect(pubs.filter((p) => p.type === 'measurement').length).toBe(7);
  });

  it('Maya: once her plans are receipted, Coach shows them applied, not waiting', () => {
    const pubs = asCoach('maya');
    const st = rows.states.find((s) => s.client === 'maya')!.state;
    const stamped = stampLedger(st, pubs.map((p) => ({ ...p, coachId: IDS.coachId })));
    const cycles = foldPlan({ state: stamped, publications: pubs, coachId: IDS.coachId, since: null });
    expect(cycles.map((c) => [c.name, c.status?.state])).toEqual([['Summer Cut', 'applied'], ['Autumn Cut', 'applied']]);
    // Without the receipt the same cycles read as waiting (the control).
    expect(foldPlan({ state: st, publications: pubs, coachId: IDS.coachId, since: null }).map((c) => c.status?.state)).toEqual(['waiting', 'waiting']);
  });

  it('what is waiting for the coach: Maya’s check-in, Casey’s note back and request, Priya’s photo request', () => {
    expect(rows.submissions.map((s) => [s.client, s.kind, (s.body as Loose).purpose ?? null])).toEqual([['maya', 'check_in', 'check_in'], ['casey', 'note_back', null]]);
    expect(rows.requests.map((r) => r.client)).toEqual(['casey']);
    expect(rows.publications.filter((p) => p.type === 'photo_request').map((p) => p.card)).toEqual(['priya']);
    const note = rows.submissions.find((s) => s.kind === 'note_back')!;
    expect(rows.publications.find((p) => p.id === note.publication_id)?.type).toBe('ai_response');
  });

  it('the clients still read as their stories intend at the client’s own today', () => {
    const want: Record<string, string> = { maya: 'on-track', tom: 'off-track', grace: 'no-data', priya: 'on-track', casey: 'off-track' };
    for (const s of rows.states) {
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: s.tz }).format(new Date(NOW));
      expect([s.client, clientOutcome(s.state, today).status]).toEqual([s.client, want[s.client]]);
    }
  });

  it('Needs you: no session in the last 14 days is left unlogged (Maya’s Wednesdays, Eileen’s sessions, Saturday Circuits)', () => {
    const cardOf = Object.fromEntries(Object.entries(IDS.cards).map(([k, v]) => [k, v]));
    const diary: Diary = {
      settings: DEFAULT_SETTINGS, daysOff: [], requests: [], sent: {},
      series: rows.series.map((x) => ({ id: x.id, kind: x.kind, weekday: x.weekday, start: x.start_min, duration: x.duration_min, from: x.effective_from, to: x.effective_to,
        cancelled: [], title: x.title, location: x.location, workout: x.workout, clientIds: rows.seriesClients.filter((c) => c.series_id === x.id).map((c) => cardOf[c.card]) })),
      bookings: rows.bookings.map((b) => ({ id: b.id, seriesId: null, occursOn: null, date: b.date, start: b.start_min, duration: b.duration_min, kind: b.kind, status: b.status,
        title: b.title, location: b.location, clientIds: rows.bookingClients.filter((c) => c.booking_id === b.id).map((c) => cardOf[c.card]) })),
    };
    const inbox = (pubs: typeof rows.publications) => ({ submissions: [], drafts: [],
      publications: pubs.map((p, i) => ({ id: p.id, seq: i + 1, type: p.type, payload: p.payload, supersedes: null, createdAt: p.createdAt, ack: null, cardId: cardOf[p.card] })) });
    const today = localDateIn('Europe/London', NOW);
    expect(missedBookings(diary, inbox(rows.publications), today).map((m) => m.occ.date)).toEqual([]);
    expect(missedGroups(diary, inbox(rows.publications), today).map((o) => o.date)).toEqual([]);
    // CONTROL: without the session logs, Maya's Wednesdays and the circuits weeks come back as "Not logged".
    const noLogs = rows.publications.filter((p) => p.type !== 'session_log');
    expect(missedBookings(diary, inbox(noLogs), today).length).toBeGreaterThan(0);
    expect(missedGroups(diary, inbox(noLogs), today).length).toBeGreaterThan(0);
  });

  it('Review: Casey’s check-in reply shows through its draft, and his note back attaches to it', () => {
    const drafts: AiDraft[] = rows.drafts.map((d) => ({ id: d.id, cardId: IDS.cards[d.card], tool: d.tool, macroId: d.macro_id, original: d.original, edited: d.edited,
      editedAt: d.edited_at, publicationId: d.publication_id, createdAt: d.created_at }));
    const pubs = asCoach('casey');
    const subs = rows.submissions.filter((x) => x.client === 'casey').map((x) => ({ id: x.id, kind: x.kind, publicationId: x.publication_id, body: x.body, createdAt: x.created_at }));
    const d = latestDraft(drafts, 'check_in', 'macro_demo_casey_c2');
    expect(d?.publicationId).toBe(rows.publications.find((p) => p.type === 'ai_response' && p.card === 'casey')!.id);
    expect(sentEdit(d!).headline).toBe('Weight has stalled: it’s the weekends');
    expect(notesBack(subs, pubs, d!.id).map((n) => n.note.body.text)).toEqual([expect.stringContaining('Takeaways on Friday')]);
    // What Casey's phone receives is built from that draft.
    expect(pubs.find((p) => p.type === 'ai_response')!.payload.response_id).toBe(d!.id);
    // CONTROL: with no draft, Review has no reply to show the note under.
    expect(latestDraft([], 'check_in', 'macro_demo_casey_c2')).toBeNull();
  });

  it('the Library: two cycles and two workouts; a cycle applies as Coach applies one; the group runs the circuits template', () => {
    expect(rows.templates.map((t) => [t.kind, t.name])).toEqual([
      ['macrocycle', 'Upper / Lower cut, 8 weeks'], ['macrocycle', 'Push / Pull / Legs size block, 6 weeks'],
      ['workout', 'Strength and Balance A'], ['workout', 'Saturday Circuits'],
    ]);
    const ul = rows.templates[0].body as MacroTemplateBody;
    const doc = applyMacroTemplate(ul, '2026-10-12', makeIds(() => 1), 'New client cut');
    expect(Object.values(doc.exercises).flat().length).toBeGreaterThan(10);
    expect(doc.macro.start).toBe('2026-10-12');
    expect(rows.series.find((x) => x.title === 'Saturday Circuits')!.workout!.template_id).toBe(CIRCUITS_TEMPLATE_ID);
    expect(rows.templates.find((t) => t.name === 'Saturday Circuits')!.id).toBe(CIRCUITS_TEMPLATE_ID);
  });
});
