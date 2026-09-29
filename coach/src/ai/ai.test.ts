// Coach v0.3 (TECHNICAL §141): Review's AI tools, on the real engine and the
// demo client. Each rule has a control that shows what goes wrong without it.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildCycleReviewPrompt, computeCycleReviewPayload, type BlocState, type CallModel, type ModelRequest } from '@engine';
import { buildFixtureClients } from '@/data/fixtures';
import { runTool } from './run';
import {
  aiResponsePayload, coachReviewPrompt, contentOf, editFromOriginal, eligibility, goalChanges, isEdited, notesBack,
  openRequest, overallCompliance, PERSONAL_PHOTO_PARAGRAPH, priorPhaseIds, publishState, reviewPhotos, sentEdit, withPlan,
} from './tools';
import type { AiDraft, CoachPublication, Submission } from './types';

const demo = JSON.parse(readFileSync(new URL('../../../bloc-demo-data.json', import.meta.url), 'utf8'));
const { clients } = buildFixtureClients(demo);
const maya = () => structuredClone(clients.find((c) => c.card.id === 'maya')!.snapshot!.state) as BlocState;
const MACRO = 'macro_1780859905961';
const macroOf = (s: BlocState) => s.macrocycles!.find((m) => m.id === MACRO)!;

/** A check-in reply in BLOC's schema, dated from the Monday after `today`. */
function checkinReply(start: string, end: string, headline = 'Hold the deficit, lift the steps') {
  const g = (label: string, kcal: number) => ({ label, startDate: start, endDate: end, kcal, steps: 12000, protein: 190, carbs: 120 });
  return JSON.stringify({
    signal: 'plateau-creep', headline, narrative: 'Para one.\n\nPara two.', primaryAction: 'Log every weekday.', secondaryAction: null,
    recommendations: { sustainable: { label: 'Sustainable', rationale: 'r', summary: 's', goals: [g('Steady', 1600)] }, aggressive: { label: 'Aggressive', rationale: 'r', summary: 's', goals: [g('Push', 1450)] } },
  });
}
function stub(text: string): { callModel: CallModel; sent: ModelRequest[] } {
  const sent: ModelRequest[] = [];
  return { sent, callModel: async (req) => { sent.push(req); return { text }; } };
}
const userText = (r: ModelRequest) => { const c = r.messages[0].content; return typeof c === 'string' ? c : c.map((b: { text?: string }) => b.text ?? '').join('\n'); };

function draft(over: Partial<AiDraft>): AiDraft {
  return { id: 'd1', cardId: 'maya', tool: 'check_in', macroId: MACRO, original: { v: 1, raw: '', response: {}, today: '2026-08-02' }, edited: null, editedAt: null, publicationId: null, createdAt: '2026-08-02T20:00:00.000Z', ...over };
}
const pub = (id: string, seq: number, payload: object, createdAt = '2026-08-02T20:05:00.000Z'): CoachPublication => ({ id, seq, type: 'ai_response', payload, supersedes: null, createdAt, ack: null });

describe('running a check-in: BLOC’s engine, the client’s today, the reply kept verbatim', () => {
  it('keeps the reply exactly as it came back and processes it as BLOC does', async () => {
    const text = '```json\n' + checkinReply('2026-08-10', '2026-08-23') + '\n```';
    const { callModel } = stub(text);
    const o = await runTool({ tool: 'check_in', state: maya(), macro: macroOf(maya()), today: '2026-08-05', callModel, drafts: [], publications: [] });
    expect(o.raw).toBe(text);
    expect(o.today).toBe('2026-08-05');
    expect(o.response.recommendations.sustainable.goals[0].fats).toBe(Math.round((1600 - 190 * 4 - 120 * 4) / 9));
    expect(o.response.nextCheckIn.sustainable).toBe('2026-08-19'); // the engine's cooldown
  });

  it('builds the prompt at the client’s today (control: the coach’s date gives a different first Monday)', async () => {
    const a = stub(checkinReply('2026-08-10', '2026-08-23')), b = stub(checkinReply('2026-08-10', '2026-08-23'));
    await runTool({ tool: 'check_in', state: maya(), macro: macroOf(maya()), today: '2026-08-05', callModel: a.callModel, drafts: [], publications: [] });
    await runTool({ tool: 'check_in', state: maya(), macro: macroOf(maya()), today: '2026-08-02', callModel: b.callModel, drafts: [], publications: [] });
    expect(userText(a.sent[0])).toContain('First goal must start: 2026-08-10');
    expect(userText(b.sent[0])).toContain('First goal must start: 2026-08-03');
  });

  it('carries the client’s request: their feel and note', async () => {
    const { callModel, sent } = stub(checkinReply('2026-08-10', '2026-08-23'));
    const request: Submission = { id: 's1', kind: 'check_in', publicationId: null, createdAt: '2026-08-04T09:00:00Z', body: { purpose: 'check_in', feel: 'Tough', note: 'Starving at night', sent_on: '2026-08-04' } };
    const o = await runTool({ tool: 'check_in', state: maya(), macro: macroOf(maya()), today: '2026-08-05', callModel, drafts: [], publications: [], request });
    expect(userText(sent[0])).toContain('THE CLIENT ASKED FOR THIS CHECK-IN (2026-08-04): feeling tough. Their note: "Starving at night"');
    expect(o.requestId).toBe('s1');
  });

  it('never changes the client’s state', async () => {
    const s = maya();
    const before = JSON.stringify(s);
    await runTool({ tool: 'check_in', state: s, macro: macroOf(s), today: '2026-08-05', callModel: stub(checkinReply('2026-08-10', '2026-08-23')).callModel, drafts: [], publications: [] });
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('the next check-in is built from what was SENT', () => {
  const original = { v: 1 as const, raw: '', today: '2026-08-02', response: JSON.parse(checkinReply('2026-08-03', '2026-08-16', 'AI headline')) };
  const d0 = draft({ original });
  const edit = { ...editFromOriginal(d0), headline: 'Coach headline' };
  edit.phases = edit.phases.map((p) => ({ ...p, kcal: 1575 }));

  it('a published edit replaces the client’s own check-in history in the prompt', async () => {
    const d = draft({ original, edited: { ...edit, sentAs: 'p1' }, publicationId: 'p1' });
    const { callModel, sent } = stub(checkinReply('2026-08-24', '2026-09-06'));
    await runTool({ tool: 'check_in', state: maya(), macro: macroOf(maya()), today: '2026-08-19', callModel, drafts: [d], publications: [pub('p1', 1, {})] });
    const u = userText(sent[0]);
    expect(u).toContain('Why: Coach headline.');
    expect(u).toContain('1575kcal');
    expect(u).not.toContain('AI headline');
  });

  it('control: an unsent draft is not in it', async () => {
    const d = draft({ original, edited: edit });
    const { callModel, sent } = stub(checkinReply('2026-08-24', '2026-09-06'));
    await runTool({ tool: 'check_in', state: maya(), macro: macroOf(maya()), today: '2026-08-19', callModel, drafts: [d], publications: [] });
    expect(userText(sent[0])).not.toContain('Coach headline');
  });
});

describe('a check-in’s goal change is BLOC’s own goal queue', () => {
  const phases = [{ id: `${MACRO}_g1`, label: 'Steady', startDate: '2026-08-10', endDate: '2026-08-23', kcal: 1600, protein: 190, carbs: 120, steps: 12000 }];

  it('mid-week: the running goal ends the Sunday before, later goals go, the phase is added and numbered', () => {
    const c = goalChanges(maya(), MACRO, '2026-08-05', phases);
    const ends = c.goals.find((g) => g.macroGoalID === `${MACRO}_g20260803`)!;
    expect(ends.endDate).toBe('2026-08-09');
    expect(c.remove_goal_ids.sort()).toEqual([`${MACRO}_g20260831`, `${MACRO}_g20260907`]);
    const added = c.goals.find((g) => g.macroGoalID === `${MACRO}_g1`)!;
    expect(added._blocLabel).toBe('Step 5 - Steady');
    expect(added.fats).toBe(Math.round((1600 - 760 - 480) / 9));
    expect(added.macroId).toBe(MACRO);
    expect(c.lines.map((l) => l.kind)).toEqual(['removed', 'removed', 'ends', 'new']);
  });

  it('on a Monday the running goal that started today is dropped, as BLOC’s queue does', () => {
    const c = goalChanges(maya(), MACRO, '2026-08-03', [{ ...phases[0], startDate: '2026-08-03' }]);
    expect(c.remove_goal_ids).toContain(`${MACRO}_g20260803`);
  });

  it('a republish removes phases the earlier version sent and this one doesn’t', () => {
    const c = goalChanges(maya(), MACRO, '2026-08-05', phases, [`${MACRO}_g1`, `${MACRO}_g2`]);
    expect(c.remove_goal_ids).toContain(`${MACRO}_g2`);
    expect(c.remove_goal_ids).not.toContain(`${MACRO}_g1`);
  });

  it('no goal change leaves the goals alone', () => {
    const c = goalChanges(maya(), MACRO, '2026-08-05', []);
    // Only the later goals' removal would happen with phases; without a plan the panel sends no goal_changes at all.
    expect(aiResponsePayload(draft({}), { ...editFromOriginal(draft({})), planKey: null, phases: [] }, null, false).goal_changes).toBeUndefined();
    expect(c.goals.every((g) => g.macroGoalID !== `${MACRO}_g1`)).toBe(true);
  });

  it('priorPhaseIds reads only generated phase ids from earlier publications of the same response', () => {
    const p = pub('p1', 1, { response_id: 'd1', goal_changes: { goals: [{ macroGoalID: `${MACRO}_g17800001` }, { macroGoalID: `${MACRO}_g20260803` }] } });
    expect(priorPhaseIds('d1', [p])).toEqual([`${MACRO}_g17800001`, `${MACRO}_g20260803`]);
    expect(priorPhaseIds('other', [p])).toEqual([]);
  });
});

describe('the edit, what’s sent, and whether it was', () => {
  const original = { v: 1 as const, raw: '', today: '2026-08-05', response: JSON.parse(checkinReply('2026-08-10', '2026-08-23')) };

  it('unedited, the client gets the reply: narrative paragraphs, the action, Sustainable’s first phase', () => {
    const e = editFromOriginal(draft({ original }));
    expect(e.narrative).toEqual(['Para one.', 'Para two.', 'This week: Log every weekday.']);
    expect(e.planKey).toBe('sustainable');
    expect([e.kcal, e.steps]).toEqual([1600, 12000]);
    expect(e.phases[0].id).toMatch(new RegExp(`^${MACRO}_g\\d+00$`));
  });

  it('switching plans switches the phases, with ids of their own', () => {
    const d = draft({ original });
    const e = withPlan(d, { ...editFromOriginal(d), planKey: 'aggressive' });
    expect(e.kcal).toBe(1450);
    expect(e.phases[0].id).toMatch(/10$/);
  });

  it('content is BLOC’s contract and the payload keys are 0023’s allow-list', () => {
    const d = draft({ original });
    const e = sentEdit(d);
    expect(Object.keys(contentOf(e)).sort()).toEqual(['headline', 'kcal', 'narrative', 'steps']);
    const p = aiResponsePayload(d, e, goalChanges(maya(), MACRO, '2026-08-05', e.phases), true);
    const allowed = ['v', 'tool', 'response_id', 'macro_id', 'content', 'goal_changes', 'updated'];
    expect(Object.keys(p).every((k) => allowed.includes(k))).toBe(true);
    expect(p.updated).toBe(true);
    expect(p.response_id).toBe('d1');
  });

  it('draft → published → changed after an edit', () => {
    const d = draft({ original });
    expect(publishState(d, []).state).toBe('draft');
    const sent = draft({ original, edited: { ...sentEdit(d), sentAs: 'p1' }, publicationId: 'p1' });
    expect(publishState(sent, [pub('p1', 1, {})]).state).toBe('published');
    expect(isEdited(sent)).toBe(false);
    const again = draft({ original, edited: { ...sentEdit(d), headline: 'New' }, publicationId: 'p1' });
    expect(publishState(again, [pub('p1', 1, {})]).state).toBe('changed');
    expect(isEdited(again)).toBe(true);
  });
});

describe('the cycle review prompt, as Coach sends it', () => {
  const s = maya();
  const m = macroOf(s);
  const base = buildCycleReviewPrompt(m, computeCycleReviewPayload(s, { today: '2026-09-20' }, m), [], []);

  it('the engine still has the paragraph Coach replaces (fails if BLOC’s prompt changes)', () => {
    expect(base.systemPrompt).toContain(PERSONAL_PHOTO_PARAGRAPH);
  });
  it('the coach’s notes replace it, to be used only where relevant', () => {
    const p = coachReviewPrompt(base, 'Full sleeve tattoos on both arms. Prefers early sessions.', null);
    expect(p.systemPrompt).not.toContain('heavily tattooed');
    expect(p.systemPrompt).toContain('Full sleeve tattoos on both arms');
    expect(p.systemPrompt).toContain('ignore anything else in them, such as scheduling or preferences');
  });
  it('with no notes the paragraph is simply gone', () => {
    const p = coachReviewPrompt(base, '  ', null);
    expect(p.systemPrompt).not.toContain('tattoo');
    expect(p.systemPrompt).not.toContain('\n\n\n\n');
  });
  it('the calculated compliance is given and the reply’s score is overwritten with it', async () => {
    const reply = JSON.stringify({ complianceScore: 3, bodyfatEstimate: { direction: 'loss', note: 'n' }, headline: 'h', narrative: 'n', highlights: ['a'], improvements: ['b'], stickingPoints: '', ranTooLong: false, ranTooLongNote: '' });
    const { callModel, sent } = stub(reply);
    const compliance = { training: 7.2, attendance: false, nutrition: 6.4, overall: overallCompliance(7.2, 6.4) };
    const o = await runTool({ tool: 'cycle_review', state: s, macro: m, today: '2026-09-20', callModel, drafts: [], publications: [], notes: null, compliance });
    expect(compliance.overall).toBe(6.8);
    expect(sent[0].system).toContain('always exactly 6.8');
    expect(userText(sent[0])).toContain('Overall: 6.8/10');
    expect(o.response.complianceScore).toBe(6.8);
    expect(editFromOriginal(draft({ tool: 'cycle_review', original: o })).compliance).toBe(6.8);
  });
});

describe('who asked for what: body.purpose', () => {
  const subs: Submission[] = [
    { id: 'photos', kind: 'check_in', publicationId: null, createdAt: '2026-08-04T10:00:00Z', body: { purpose: 'cycle_review', macro_id: MACRO, before: ['u/reviews/x/before-1.jpg'], after: ['u/reviews/x/after-1.jpg'], sent_on: '2026-08-04' } },
    { id: 'ask', kind: 'check_in', publicationId: null, createdAt: '2026-08-03T10:00:00Z', body: { purpose: 'check_in', feel: 'Good', macro_id: MACRO } },
    { id: 'note', kind: 'note_back', publicationId: 'p1', createdAt: '2026-08-05T10:00:00Z', body: { response_id: 'd1', text: 'Thanks' } },
  ];
  it('a review-photos row is never a check-in request', () => {
    expect(openRequest(subs, [], MACRO)?.id).toBe('ask');
    expect(openRequest(subs.filter((x) => x.id !== 'ask'), [], MACRO)).toBeNull();
    expect(reviewPhotos(subs, MACRO)).toEqual({ before: ['u/reviews/x/before-1.jpg'], after: ['u/reviews/x/after-1.jpg'], sentOn: '2026-08-04' });
  });
  it('a run after the request answers it', () => {
    expect(openRequest(subs, [draft({ createdAt: '2026-08-03T12:00:00Z' })], MACRO)).toBeNull();
  });
  it('notes back attach to their response, with the coach’s reply', () => {
    const reply: CoachPublication = { ...pub('r1', 2, { submission_id: 'note', text: 'Good' }), type: 'note_reply' };
    expect(notesBack(subs, [reply], 'd1')).toEqual([{ note: subs[2], reply }]);
  });
});

describe('when a tool can run', () => {
  const s = maya();
  const base = { s, macro: macroOf(s), today: '2026-08-05', cycleStatus: 'active' as const, hasKey: true, drafts: [], request: null, first: 'Maya', fmtDate: (x: string) => x };
  it('no key, nothing runs', () => {
    expect(eligibility('check_in', { ...base, hasKey: false })).toMatchObject({ ready: false, runnable: false });
  });
  it('a check-in is due with no earlier run; asked for, it says so; inside the cooldown it can still run early', () => {
    expect(eligibility('check_in', base)).toMatchObject({ ready: true, text: 'Run check-in with BLOC' });
    const asked: Submission = { id: 'a', kind: 'check_in', publicationId: null, createdAt: '2026-08-04T10:00:00Z', body: { purpose: 'check_in' } };
    expect(eligibility('check_in', { ...base, request: asked }).text).toBe('Run check-in · Maya asked 2026-08-04');
    const recent = draft({ original: { v: 1, raw: '', response: {}, today: '2026-08-03' } });
    expect(eligibility('check_in', { ...base, drafts: [recent] })).toEqual({ ready: false, runnable: true, text: 'Next check-in · 2026-08-17 · run early' });
  });
  it('a cycle review opens when the cycle ends', () => {
    expect(eligibility('cycle_review', base).runnable).toBe(false);
    expect(eligibility('cycle_review', { ...base, today: '2026-09-27', cycleStatus: 'past' }).ready).toBe(true);
  });
});
