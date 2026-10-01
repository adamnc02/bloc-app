// Coach v0.15 (TECHNICAL §165): the coach's library in the pickers, Group / Client workout templates, and This
// cycle's session states. Each rule has a control.
import { describe, expect, it } from 'vitest';
import { buildLibrary } from './library';
import { audienceOf, workoutTemplateOf, type Template } from './templates';
import { keyOf, type PlanDoc } from './doc';
import { sessionStatus, type PickSession } from '@/inperson/model';

const doc: PlanDoc = {
  macro: { id: 'm', name: 'W', start: '2026-01-05', weeks: 1, weeksPerMeso: 1, sessionsPerWeek: 1, goal: '', targetBw: null, goalType: 'maintenance', splitType: 'custom', days: ['w'], dayLabels: { w: 'W' }, useMicrocycles: false, weightIncrement: '2.5', rpe: false },
  exercises: { [keyOf('m', 'w')]: [{ id: 'e1', name: 'Goblet Squat', bodyPart: 'Legs', category: 'weight', type: 'standard', reps: '12', setsStart: 3, setsEnd: 3, startWeight: 14, isHeavyLeg: false, trackingMode: 'total', order: 0, supersetId: null, supersetOrder: null }] },
  supersets: {}, deloads: {}, goals: [],
};
const tpl = (body: Template['body']): Template => ({ id: 't', kind: body.kind, name: 'T', summary: null, body, starred: false, createdAt: '', appliedCount: 0, appliedLast90: 0 });

describe('workout templates: Group or Client', () => {
  it('a group workout says so; a client one, and every template from before, reads Client (control)', () => {
    expect(audienceOf(tpl(workoutTemplateOf(doc, 'w', 'Circuit', 'group').body))).toBe('group');
    expect(audienceOf(tpl(workoutTemplateOf(doc, 'w', 'Session A').body))).toBe('client');
    const old = workoutTemplateOf(doc, 'w', 'Old').body;
    expect('audience' in old).toBe(false);
    expect(audienceOf(tpl(old))).toBe('client');
  });
});

describe('the coach\'s library in the pickers', () => {
  it('lists the coach\'s own exercises as "mine" after BLOC\'s and the client\'s, once each (control: a built-in name stays BLOC\'s)', () => {
    const lib = buildLibrary([{ name: 'Sled Push', bodyPart: 'Legs' }], [
      { name: 'Goblet Squat', bodyPart: 'Legs', category: 'weight', source: 'mine' },
      { name: 'goblet squat', bodyPart: 'Legs', source: 'coach' },
      { name: 'Leg Press', bodyPart: 'Legs', source: 'mine' },
    ]);
    expect(lib.find((e) => e.name === 'Goblet Squat')?.source).toBe('mine');
    expect(lib.filter((e) => e.name.toLowerCase() === 'goblet squat')).toHaveLength(1);
    expect(lib.find((e) => e.name === 'Sled Push')?.source).toBe('client');
    expect(lib.find((e) => e.name === 'Leg Press')?.source).toBe('bloc');
  });
});

describe('This cycle: where a session stands', () => {
  const base: PickSession = { week: 3, dayKey: 'd', label: 'Session A', exercises: 4, sets: 12, doneSets: 0, done: false, partial: false, upNext: false, coachLogged: false, groupReplaced: false, assignable: true };
  it('replaced by a group, logged by you, done, part done, up next, to do', () => {
    expect(sessionStatus({ ...base, groupReplaced: true, done: true }).text).toBe('Replaced by a group');
    expect(sessionStatus({ ...base, coachLogged: true, done: true }).text).toBe('Logged by you');
    expect(sessionStatus({ ...base, done: true, doneSets: 12 }).text).toBe('Done');
    expect(sessionStatus({ ...base, partial: true, doneSets: 5 }).text).toBe('Part done · 5/12 sets');
    expect(sessionStatus({ ...base, upNext: true }).text).toBe('Up next');
    expect(sessionStatus(base).text).toBe('To do');
  });
});
