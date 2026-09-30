// The demo Rebuild's rows (PROMPT-04), held to what Coach and 0023's
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
});
