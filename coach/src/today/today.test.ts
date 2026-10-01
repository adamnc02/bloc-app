// Coach v0.6 (TECHNICAL §154): Today's model on the fixture diary and clients. Each rule has a control.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Loose } from '@engine';
import { fixtureDiary } from '@/data/fixtureDiary';
import { buildFixtureClients } from '@/data/fixtures';
import { summarise } from '@/data/summary';
import type { Inbox } from '@/data/types';
import type { CoachPublication, Submission } from '@/ai/types';
import { sessionIdFor } from '@/inperson/model';
import { groupSessionId } from '@/group/model';
import { getMeasurementStatus } from '@/lib/measurementStatus';
import { comingUp, missedBookings, missedGroups, needsItemOpen, needsYou, offTrack, pushAction, todaySessions } from './model';

const demo = JSON.parse(readFileSync(new URL('../../../bloc-demo-data.json', import.meta.url), 'utf8')) as Record<string, unknown>;
const built = buildFixtureClients(demo);
const ANCHOR = built.anchor;                // Sun 2 Aug
const summaries = built.clients.map((b) => summarise(b, built.now));
const empty = (): Inbox => ({ submissions: [], drafts: [], publications: [] });
const pub = (cardId: string, id: string, seq: number, type: string, payload: object, createdAt = `${ANCHOR}T10:00:00.000Z`): CoachPublication & { cardId: string } =>
  ({ cardId, id, seq, type, payload: { v: 1, ...payload } as Loose, supersedes: null, createdAt, ack: null });
const sub = (clientId: string, id: string, kind: Submission['kind'], body: object, createdAt = `${ANCHOR}T09:00:00.000Z`): Submission & { clientId: string } =>
  ({ clientId, id, kind, publicationId: null, body: body as Loose, createdAt });

describe("Today's sessions", () => {
  it('lists the day’s sessions; Start session from 15 minutes before until the day ends (control: an hour before, it isn’t offered)', async () => {
    const d = await fixtureDiary(ANCHOR).loadDiary();
    const at = (min: number) => todaySessions(d, empty(), ANCHOR, min).find((s) => s.occ.key === 'b:bk-maya-today')!;
    expect(at(21 * 60).canStart).toBe(true);
    expect(at(23 * 60 + 50).canStart).toBe(true);
    expect(at(20 * 60).canStart).toBe(false);
  });
  it('a session already logged isn’t started again', async () => {
    const d = await fixtureDiary(ANCHOR).loadDiary();
    const logged = { ...empty(), publications: [pub('maya', 'p1', 1, 'session_log', { session_id: sessionIdFor('bk-maya-today', ANCHOR, 'x'), kind: 'in_person', logs: {} })] };
    const s = todaySessions(d, logged, ANCHOR, 21 * 60).find((x) => x.occ.key === 'b:bk-maya-today')!;
    expect([s.logged, s.canStart]).toEqual([true, false]);
  });
});

describe('group sessions (§162)', () => {
  it('a group week today can be started; once logged on any attendee\'s card, it can\'t', async () => {
    const d = await fixtureDiary(ANCHOR).loadDiary();
    const sat = '2026-08-08';
    const at = (inbox: Inbox) => todaySessions(d, inbox, sat, 9 * 60).find((x) => x.occ.key === `s:sr-bootcamp@${sat}`)!;
    expect([at(empty()).group, at(empty()).canStart, at(empty()).logged]).toEqual([true, true, false]);
    const logged = { ...empty(), publications: [pub('priya', 'g1', 1, 'session_log', { session_id: groupSessionId('sr-bootcamp', sat, 'x'), booking_id: 'sr-bootcamp', kind: 'group', logs: [] })] };
    expect([at(logged).canStart, at(logged).logged]).toEqual([false, true]);
    // Control: logged for another week, this one is still to do.
    const other = { ...empty(), publications: [pub('priya', 'g1', 1, 'session_log', { session_id: groupSessionId('sr-bootcamp', '2026-08-01', 'x'), booking_id: 'sr-bootcamp', kind: 'group', logs: [] })] };
    expect(at(other).logged).toBe(false);
  });
  it('a group week from the last 14 days not logged is Needs you\'s, once (control: logged, it isn\'t)', async () => {
    const d = await fixtureDiary(ANCHOR).loadDiary();
    const keys = missedGroups(d, empty(), ANCHOR).map((o) => o.key);
    expect(keys).toContain('s:sr-bootcamp@2026-08-01');
    expect(keys.some((k) => k.endsWith('@2026-07-18'))).toBe(false);          // 15 days back: not raised
    const logged = { ...empty(), publications: [pub('grace', 'g1', 1, 'session_log', { session_id: groupSessionId('sr-bootcamp', '2026-08-01', 'x'), booking_id: 'sr-bootcamp', kind: 'group', logs: [] })] };
    expect(missedGroups(d, logged, ANCHOR).map((o) => o.key)).not.toContain('s:sr-bootcamp@2026-08-01');
    const items = needsYou(d, empty(), built.clients, summaries, ANCHOR).filter((x) => x.kind === 'missedGroup');
    expect(items.filter((x) => x.occ.key === 's:sr-bootcamp@2026-08-01')).toHaveLength(1);
  });
});

describe('Needs you', () => {
  it('a booking from the last 14 days that wasn’t logged or cancelled; logged or older, it isn’t', async () => {
    const d = await fixtureDiary(ANCHOR).loadDiary();
    const missed = missedBookings(d, empty(), ANCHOR).map((m) => m.occ.key);
    expect(missed).toContain('s:sr-tom@2026-07-30');
    expect(missed.some((k) => k.endsWith('@2026-07-16'))).toBe(false);          // 17 days back: not raised
    const logged = { ...empty(), publications: [pub('tom', 'p1', 1, 'session_log', { session_id: sessionIdFor('sr-tom', '2026-07-30', 'x'), kind: 'in_person', logs: {} })] };
    expect(missedBookings(d, logged, ANCHOR).map((m) => m.occ.key)).not.toContain('s:sr-tom@2026-07-30');
    expect(missed.every((k) => !k.startsWith('s:sr-bootcamp'))).toBe(true);      // a group week is missedGroups', not this list's
  });
  it('requests waiting on the coach, a check-in due, an unanswered note back and answered review photos; each clears once dealt with', async () => {
    const d = await fixtureDiary(ANCHOR).loadDiary();
    const inbox: Inbox = {
      submissions: [
        sub('user-maya', 's2', 'note_back', { response_id: 'r1', text: 'Thanks!' }),
        sub('user-maya', 's3', 'check_in', { purpose: 'cycle_review', request_id: 'pr1', macro_id: 'macro_1780859905961', skipped: true, before: [], after: [] }),
      ],
      drafts: [],
      publications: [pub('maya', 'a1', 1, 'ai_response', { response_id: 'r1', content: { headline: 'Steady' } }), pub('maya', 'q1', 2, 'photo_request', { request_id: 'pr1', macro_id: 'macro_1780859905961' })],
    };
    const kinds = needsYou(d, inbox, built.clients, summaries, ANCHOR).map((x) => x.kind);
    for (const k of ['request', 'checkin', 'note', 'photos', 'missed']) expect(kinds).toContain(k);
    // The check-in is due on the schedule, with no client request (v0.16): an old request row changes nothing.
    const withOldAsk: Inbox = { ...inbox, submissions: [...inbox.submissions, sub('user-maya', 's1', 'check_in', { purpose: 'check_in', feel: 'Okay', macro_id: null })] };
    expect(needsYou(d, withOldAsk, built.clients, summaries, ANCHOR).filter((x) => x.kind === 'checkin' || x.kind === 'photos').map((x) => x.key))
      .toEqual(needsYou(d, inbox, built.clients, summaries, ANCHOR).filter((x) => x.kind === 'checkin' || x.kind === 'photos').map((x) => x.key));
    // Coach v0.9 (§158): a tapped push does what its item's button does. The push's tag carries the id in the item's key.
    const items = needsYou(d, inbox, built.clients, summaries, ANCHOR);
    const tagOf = (key: string) => ({ r: 'request', p: 'photos', n: 'note' } as Record<string, string>)[key[0]] + ':' + key.slice(2);
    const pushable = items.filter((x) => x.kind === 'request' || x.kind === 'photos' || x.kind === 'note');
    expect([...new Set(pushable.map((x) => x.kind))].sort()).toEqual(['note', 'photos', 'request']);
    // Review photos open the client's Review on the cycle review tool.
    expect((needsItemOpen(pushable.find((x) => x.kind === 'photos')!) as { path: string }).path).toMatch(/^\/clients\/maya\/review\?.*tool=cycle_review/);
    for (const it of pushable) expect(pushAction(tagOf(it.key), items)).toEqual(needsItemOpen(it));
    expect(pushAction('checkin:not-an-item', items)).toBeNull();          // dealt with already: stay on Today
    expect(pushAction('digest:2026-08-02', items)).toBeNull();
    const note = pushable.find((x) => x.kind === 'note')!;
    expect(needsItemOpen(note)).toEqual({ kind: 'path', path: expect.stringContaining('?') });
    expect((needsItemOpen(note) as { path: string }).path).toMatch(/^\/clients\/maya\/review\?.*at=note/);
    // Dealt with: the note replied to, a check-in PUBLISHED, and the review run after.
    const runOnly: Inbox = {
      ...inbox,
      drafts: [{ id: 'd1', cardId: 'maya', tool: 'check_in', macroId: 'macro_1780859905961', original: {} as never, edited: null, editedAt: null, publicationId: null, createdAt: `${ANCHOR}T12:00:00.000Z` }],
    };
    // control: a run never published leaves the check-in due
    expect(needsYou(d, runOnly, built.clients, summaries, ANCHOR).filter((x) => x.cardId === 'maya').map((x) => x.kind)).toContain('checkin');
    const done: Inbox = {
      ...inbox,
      publications: [...inbox.publications, pub('maya', 'n1', 3, 'note_reply', { submission_id: 's2', text: 'You’re welcome' }),
        pub('maya', 'c1', 4, 'ai_response', { tool: 'check_in', response_id: 'd1', macro_id: 'macro_1780859905961', content: { headline: 'Keep going' } })],
      drafts: [
        { id: 'd2', cardId: 'maya', tool: 'cycle_review', macroId: 'macro_1780859905961', original: {} as never, edited: null, editedAt: null, publicationId: null, createdAt: `${ANCHOR}T12:00:00.000Z` },
      ],
    };
    // Maya's only: other linked clients may have their own check-ins due on the schedule.
    const after = needsYou(d, done, built.clients, summaries, ANCHOR).filter((x) => x.cardId === 'maya').map((x) => x.kind);
    expect(after.filter((k) => ['checkin', 'note', 'photos'].includes(k))).toEqual([]);
  });
});

describe('Off track and Coming up', () => {
  it('off track: linked clients Review judges off track (Maya at the anchor, explained by calories)', () => {
    expect(offTrack(summaries).map((s) => s.id)).toContain('maya');
    expect(offTrack(summaries).every((s) => s.status === 'linked')).toBe(true);
  });
  it('an app gone quiet (Tom, 60 h) is in Coming up; one synced 2 h ago isn’t (control)', () => {
    const c = comingUp(built.clients, summaries, empty());
    expect(c.some((x) => x.kind === 'no-sync' && x.cardId === 'tom')).toBe(true);
    expect(c.some((x) => x.kind === 'no-sync' && x.cardId === 'maya')).toBe(false);
  });
  it('Coach’s measurement rule: due 7 days after the last, or at the next cycle start if sooner', () => {
    expect(getMeasurementStatus([{ date: '2026-07-27', waist: 32 }], [], '2026-08-02').due).toBe(false);
    expect(getMeasurementStatus([{ date: '2026-07-27', waist: 32 }], [], '2026-08-03').due).toBe(true);
    expect(getMeasurementStatus([{ date: '2026-07-27', waist: 32 }], [{ start: '2026-07-30' }], '2026-07-30').nextDueDate).toBe('2026-07-30');
    expect(getMeasurementStatus([], [], '2026-08-02')).toEqual({ due: true, nextDueDate: '2026-08-02', lastDate: null });
  });
});
