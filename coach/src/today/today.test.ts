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
import { getMeasurementStatus } from '@/lib/measurementStatus';
import { comingUp, missedBookings, needsItemOpen, needsYou, offTrack, pushAction, todaySessions } from './model';

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

describe('Needs you', () => {
  it('a booking from the last 14 days that wasn’t logged or cancelled; logged or older, it isn’t', async () => {
    const d = await fixtureDiary(ANCHOR).loadDiary();
    const missed = missedBookings(d, empty(), ANCHOR).map((m) => m.occ.key);
    expect(missed).toContain('s:sr-tom@2026-07-30');
    expect(missed.some((k) => k.endsWith('@2026-07-16'))).toBe(false);          // 17 days back: not raised
    const logged = { ...empty(), publications: [pub('tom', 'p1', 1, 'session_log', { session_id: sessionIdFor('sr-tom', '2026-07-30', 'x'), kind: 'in_person', logs: {} })] };
    expect(missedBookings(d, logged, ANCHOR).map((m) => m.occ.key)).not.toContain('s:sr-tom@2026-07-30');
    expect(missed.every((k) => !k.startsWith('s:sr-bootcamp'))).toBe(true);      // group sessions aren't logged in person yet
  });
  it('requests waiting on the coach, a check-in request, an unanswered note back and answered review photos; each clears once dealt with', async () => {
    const d = await fixtureDiary(ANCHOR).loadDiary();
    const inbox: Inbox = {
      submissions: [
        sub('user-maya', 's1', 'check_in', { purpose: 'check_in', feel: 'Okay', note: 'Hungry', macro_id: null }),
        sub('user-maya', 's2', 'note_back', { response_id: 'r1', text: 'Thanks!' }),
        sub('user-maya', 's3', 'check_in', { purpose: 'cycle_review', request_id: 'pr1', macro_id: 'macro_1780859905961', skipped: true, before: [], after: [] }),
      ],
      drafts: [],
      publications: [pub('maya', 'a1', 1, 'ai_response', { response_id: 'r1', content: { headline: 'Steady' } }), pub('maya', 'q1', 2, 'photo_request', { request_id: 'pr1', macro_id: 'macro_1780859905961' })],
    };
    const kinds = needsYou(d, inbox, built.clients, summaries, ANCHOR).map((x) => x.kind);
    for (const k of ['request', 'checkin', 'note', 'photos', 'missed']) expect(kinds).toContain(k);
    // Coach v0.9 (§158): a tapped push does what its item's button does. The push's tag carries the id in the item's key.
    const items = needsYou(d, inbox, built.clients, summaries, ANCHOR);
    const tagOf = (key: string) => ({ r: 'request', c: 'checkin', n: 'note' } as Record<string, string>)[key[0]] + ':' + key.slice(2);
    const pushable = items.filter((x) => x.kind === 'request' || x.kind === 'checkin' || x.kind === 'note');
    expect([...new Set(pushable.map((x) => x.kind))].sort()).toEqual(['checkin', 'note', 'request']);
    for (const it of pushable) expect(pushAction(tagOf(it.key), items)).toEqual(needsItemOpen(it));
    expect(pushAction('checkin:not-an-item', items)).toBeNull();          // dealt with already: stay on Today
    expect(pushAction('digest:2026-08-02', items)).toBeNull();
    const note = pushable.find((x) => x.kind === 'note')!;
    expect(needsItemOpen(note)).toEqual({ kind: 'path', path: expect.stringContaining('?') });
    expect((needsItemOpen(note) as { path: string }).path).toMatch(/^\/clients\/maya\/review\?.*at=note/);
    // Dealt with: the note replied to, the check-in and the review run after.
    const done: Inbox = {
      ...inbox,
      publications: [...inbox.publications, pub('maya', 'n1', 3, 'note_reply', { submission_id: 's2', text: 'You’re welcome' })],
      drafts: [
        { id: 'd1', cardId: 'maya', tool: 'check_in', macroId: 'macro_1780859905961', original: {} as never, edited: null, editedAt: null, publicationId: null, createdAt: `${ANCHOR}T12:00:00.000Z` },
        { id: 'd2', cardId: 'maya', tool: 'cycle_review', macroId: 'macro_1780859905961', original: {} as never, edited: null, editedAt: null, publicationId: null, createdAt: `${ANCHOR}T12:00:00.000Z` },
      ],
    };
    const after = needsYou(d, done, built.clients, summaries, ANCHOR).map((x) => x.kind);
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
