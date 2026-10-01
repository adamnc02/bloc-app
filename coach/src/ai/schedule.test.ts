// The coached check-in schedule (engine coach.ts, TECHNICAL §168), on the real demo client. A client never asks for
// a check-in. The FIRST is the engine's call (enough data AND a signal that warrants one); after it, every 14 days from
// the last one the coach published. Maya's demo cycle is a plateau (warrants one); onTrack() rewrites her weigh-ins as
// a steady loss, which the engine reads as on track (warrants none).
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
const onTrack = () => {
  const s = maya(); const t0 = Date.parse(String(macroOf(s).start));
  for (const l of s.bodyLogs || []) l.weight = String((221 - 0.15 * (Date.parse(l.date) - t0) / 86400000).toFixed(1));
  return s;
};

describe('coachCheckinSchedule', () => {
  const s = maya(); const m = macroOf(s);
  const mid = shiftDateStr(String(m.start), 42);
  it('the first is due when the data is there AND the signal warrants one (Maya: a plateau)', () => {
    const r = coachCheckinSchedule(s, { today: mid }, m, []);
    expect([r.enoughData, r.signalWarrants, r.due, r.dueOn]).toEqual([true, true, true, null]);
  });
  it('🚨 on track with enough data: no first check-in (control: data alone was the old, wrong gate)', () => {
    const t = onTrack();
    const r = coachCheckinSchedule(t, { today: mid }, macroOf(t), []);
    expect([r.enoughData, r.signalWarrants, r.due]).toEqual([true, false, false]);
  });
  it('after the first, every 14 days whatever the signal: on track and a check-in published, due again two weeks on', () => {
    const t = onTrack(); const pub = shiftDateStr(mid, -3);
    const r = coachCheckinSchedule(t, { today: mid }, macroOf(t), [pub]);
    expect(r.due).toBe(false);
    expect(coachCheckinSchedule(t, { today: r.dueOn! }, macroOf(t), [pub]).due).toBe(true);
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
  it('🚨 never in the final week: a check-in that would fall due then (or after the end) isn\'t shown; the review comes next', () => {
    const end = getMacroEndDate(m, { today: mid });
    // Published 11 days before the end: 14 days on is 3 days AFTER the end (the case this guards).
    const late = shiftDateStr(end, -11);
    const r = coachCheckinSchedule(s, { today: shiftDateStr(end, -4) }, m, [late]);
    expect([r.due, r.nextOn, r.dueOn! > end, r.checkinsUntil]).toEqual([false, null, true, shiftDateStr(end, -7)]);
    // In the final week with an old check-in long overdue: still not due (control: the day before the final week it is).
    const old = shiftDateStr(end, -40);
    expect(coachCheckinSchedule(s, { today: shiftDateStr(end, -6) }, m, [old]).due).toBe(false);
    expect(coachCheckinSchedule(s, { today: shiftDateStr(end, -7) }, m, [old]).due).toBe(true);
    // A next date before the final week is kept.
    const ok = coachCheckinSchedule(s, { today: shiftDateStr(end, -25) }, m, [shiftDateStr(end, -25)]);
    expect(ok.nextOn).toBe(ok.dueOn);
    expect(ok.nextOn! <= ok.checkinsUntil!).toBe(true);
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
  it('on track: no Check-in tab until the first is called for or one is published', () => {
    const t = onTrack();
    expect(coachTabsReady(t, { today: shiftDateStr(String(m.start), 42) }, macroOf(t), none).checkIn).toBe(false);
    expect(coachTabsReady(t, { today: shiftDateStr(String(m.start), 42) }, macroOf(t), { ...none, checkIn: true }).checkIn).toBe(true);
  });
  it('check-in once the first is called for; next cycle from 21 days out; review from the final week', () => {
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
