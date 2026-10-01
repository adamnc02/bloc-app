// The coached check-in schedule (engine coach.ts, TECHNICAL §168), on the real demo client. A client never asks for
// a check-in: it's due once the cycle has the data, then 14 days after each one the coach published.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { coachCheckinSchedule, coachTabsReady, getMacroEndDate, shiftDateStr, type BlocState } from '@engine';
import { buildFixtureClients } from '@/data/fixtures';

const demo = JSON.parse(readFileSync(new URL('../../../bloc-demo-data.json', import.meta.url), 'utf8'));
const { clients } = buildFixtureClients(demo);
const maya = () => structuredClone(clients.find((c) => c.card.id === 'maya')!.snapshot!.state) as BlocState;
const MACRO = 'macro_1780859905961';
const macroOf = (s: BlocState) => s.macrocycles!.find((m) => m.id === MACRO)!;
const none = { checkIn: false, cycleReview: false, nextCycle: false, photosAsked: false };

describe('coachCheckinSchedule', () => {
  const s = maya(); const m = macroOf(s);
  const mid = shiftDateStr(String(m.start), 42);
  it('due with enough data and nothing published yet', () => {
    const r = coachCheckinSchedule(s, { today: mid }, m, []);
    expect(r.enoughData).toBe(true);
    expect(r.due).toBe(true);
    expect(r.dueOn).toBeNull();
  });
  it('not due inside the 14-day cooldown after a published check-in, due from the Monday after two weeks', () => {
    const pub = shiftDateStr(mid, -3);
    const r = coachCheckinSchedule(s, { today: mid }, m, [pub]);
    expect(r.due).toBe(false);
    expect(r.dueOn! > mid).toBe(true);
    expect(coachCheckinSchedule(s, { today: r.dueOn! }, m, [pub]).due).toBe(true);
    // the newest publication counts, in any order
    expect(coachCheckinSchedule(s, { today: mid }, m, [shiftDateStr(mid, -40), pub]).lastOn).toBe(pub);
  });
  it('not due before the cycle has the data (control: the first week)', () => {
    const r = coachCheckinSchedule(s, { today: shiftDateStr(String(m.start), 3) }, m, []);
    expect(r.enoughData).toBe(false);
    expect(r.due).toBe(false);
    expect(r.weeksToData).toBeGreaterThan(0);
  });
  it('never due once the cycle has ended', () => {
    const after = shiftDateStr(getMacroEndDate(m, { today: mid }), 1);
    expect(coachCheckinSchedule(s, { today: after }, m, []).due).toBe(false);
  });
  it('0 or 1 weigh-ins reads as not enough data, never a throw (BACKLOG P1)', () => {
    for (const keep of [0, 1]) {
      const t = maya(); t.bodyLogs = (t.bodyLogs || []).slice(0, keep);
      expect(() => coachCheckinSchedule(t, { today: mid }, macroOf(t), [])).not.toThrow();
      expect(coachCheckinSchedule(t, { today: mid }, macroOf(t), []).due).toBe(false);
    }
  });
});

describe('coachTabsReady', () => {
  const s = maya(); const m = macroOf(s);
  const end = getMacroEndDate(m, { today: String(m.start) });
  it('a new cycle shows no tab', () => {
    expect(coachTabsReady(s, { today: shiftDateStr(String(m.start), 2) }, m, none)).toEqual({ checkIn: false, cycleReview: false, nextCycle: false });
  });
  it('check-in once there is data; next cycle from 21 days out; review from the final week', () => {
    expect(coachTabsReady(s, { today: shiftDateStr(String(m.start), 42) }, m, none).checkIn).toBe(true);
    expect(coachTabsReady(s, { today: shiftDateStr(end, -22) }, m, none).nextCycle).toBe(false);
    expect(coachTabsReady(s, { today: shiftDateStr(end, -21) }, m, none).nextCycle).toBe(true);
    expect(coachTabsReady(s, { today: shiftDateStr(end, -7) }, m, none).cycleReview).toBe(false);
    expect(coachTabsReady(s, { today: shiftDateStr(end, -6) }, m, none).cycleReview).toBe(true);
  });
  it('anything already published or asked for shows, whatever the date', () => {
    const early = { today: shiftDateStr(String(m.start), 2) };
    expect(coachTabsReady(s, early, m, { ...none, checkIn: true }).checkIn).toBe(true);
    expect(coachTabsReady(s, early, m, { ...none, photosAsked: true }).cycleReview).toBe(true);
    expect(coachTabsReady(s, early, m, { ...none, nextCycle: true }).nextCycle).toBe(true);
  });
});
