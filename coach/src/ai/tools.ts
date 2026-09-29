// ═══════════════════════════════════════════════════════════════════════
// Review's AI tools: the rules, as pure functions (TECHNICAL §141).
//
// Everything here takes the client's `today` (their uploaded tz, §139) and
// never reads a clock: scripts/verify-coach-review-clock.mjs checks this
// folder as it checks review/.
//
//   · The original reply is kept exactly as it came back; the coach's edit
//     sits beside it, and the client only ever receives the edit.
//   · The next check-in is built from what was SENT: the coach's published
//     edits stand in for BLOC's own check-in history and cycle reviews
//     (overlayCoachAdvice), never the unsent drafts or the AI's original.
//   · A check-in's goal change is exactly what BLOC's own goal queue
//     (index.html startGoalQueue) does when a Solo user accepts a plan.
// ═══════════════════════════════════════════════════════════════════════
import {
  computeWeeklyInsights, getDayBefore, getMacroEndDate, getMondayAfter, getNextMonday, getSundayAfterWeeks,
  isCycleReviewDue, isNextCycleAdviceEligible, recommendNextCycle, renumberMacroGoalSteps, shiftDateStr,
  type BlocState, type GoalPeriod, type Loose, type Macrocycle,
} from '@engine';
import type { AiDraft, AiEdit, AiOriginal, AiTool, CoachPublication, PhaseEdit, Submission } from './types';

export const TOOLS: AiTool[] = ['check_in', 'cycle_review', 'next_cycle'];
export const TOOL_LABEL: Record<AiTool, { tab: string; run: string; read: string; noun: string }> = {
  check_in: { tab: 'Check-in', run: 'Run check-in', read: 'Read full check-in', noun: 'check-in' },
  cycle_review: { tab: 'Cycle review', run: 'Run cycle review', read: 'Read full review', noun: 'cycle review' },
  next_cycle: { tab: 'Next cycle', run: 'Build next cycle', read: 'Read full advice', noun: 'next-cycle advice' },
};

/** BLOC's check-in cooldown: the Monday after 2 weeks from the run (the engine's postProcessAdviceResponse). */
export const checkinDueAfter = (runOn: string) => getMondayAfter(getSundayAfterWeeks(runOn, 2));

const paragraphs = (t: unknown): string[] =>
  (Array.isArray(t) ? t.map(String) : String(t ?? '').split(/\n\s*\n/)).map((p) => p.trim()).filter(Boolean);
const int = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? Math.round(n) : null;
};

// ---------------------------------------------------------------- the edit

/** The plan choices a reply offers: a check-in's two paths, next-cycle's plans[]. */
export function planChoices(tool: AiTool, o: AiOriginal): { key: string; label: string; summary: string; goals: Loose[] }[] {
  const r = o.response || {};
  if (tool === 'check_in') {
    return (['sustainable', 'aggressive'] as const)
      .filter((k) => r.recommendations?.[k])
      .map((k) => ({ key: k, label: String(r.recommendations[k].label || (k === 'sustainable' ? 'Sustainable' : 'Aggressive')), summary: String(r.recommendations[k].summary || ''), goals: r.recommendations[k].goals || [] }));
  }
  if (tool === 'next_cycle') {
    return (r.plans || []).map((p: Loose) => ({ key: String(p.key), label: String(p.label || p.key), summary: String(p.summary || ''), goals: p.goals || [] }));
  }
  return [];
}

/**
 * The phases a check-in plan would send, with ids that stay the same for this
 * draft and plan: `${macroId}_g{draft ms}{plan}{n}`, BLOC's `${macroId}_g…` form.
 */
export function phasesFor(o: AiOriginal, planKey: string | null, macroId: string, draftMs: number): PhaseEdit[] {
  const plans = planChoices('check_in', o);
  const pi = plans.findIndex((p) => p.key === planKey);
  if (pi < 0) return [];
  return plans[pi].goals.map((g, i) => ({
    id: `${macroId}_g${draftMs}${pi}${i}`,
    label: String(g.label || ''),
    startDate: String(g.startDate), endDate: String(g.endDate),
    kcal: int(g.kcal) ?? 0, protein: int(g.protein) ?? 0, carbs: int(g.carbs) ?? 0, steps: int(g.steps) ?? 0,
  }));
}

/** What the coach sends if they don't edit: the reply, as BLOC would show it. */
export function editFromOriginal(d: Pick<AiDraft, 'tool' | 'original' | 'macroId' | 'createdAt'>): AiEdit {
  const r = d.original.response || {};
  const base: AiEdit = { headline: String(r.headline || ''), narrative: paragraphs(r.narrative), kcal: null, steps: null, compliance: null, planKey: null, phases: [] };
  if (d.tool === 'check_in') {
    const planKey = r.recommendations?.sustainable ? 'sustainable' : null;
    if (r.primaryAction) base.narrative.push(`This week: ${String(r.primaryAction)}`);
    return withPlan(d, { ...base, planKey });
  }
  if (d.tool === 'cycle_review') {
    const extra: string[] = [];
    if ((r.highlights || []).length) extra.push(`What went well: ${r.highlights.join('; ')}.`);
    if ((r.improvements || []).length) extra.push(`To improve: ${r.improvements.join('; ')}.`);
    if (r.stickingPoints) extra.push(`Sticking points: ${r.stickingPoints}`);
    const c = d.original.compliance?.overall ?? (typeof r.complianceScore === 'number' ? r.complianceScore : null);
    return { ...base, narrative: [...base.narrative, ...extra], compliance: c };
  }
  const first = planChoices('next_cycle', d.original)[0];
  return withPlan(d, { ...base, planKey: first?.key ?? null });
}

/** Switches the chosen plan: its phases (check-in) or its first phase's kcal and steps (next cycle). */
export function withPlan(d: Pick<AiDraft, 'tool' | 'original' | 'macroId' | 'createdAt'>, e: AiEdit): AiEdit {
  if (d.tool === 'check_in') {
    const phases = phasesFor(d.original, e.planKey, d.macroId ?? 'macro', Date.parse(d.createdAt) || 0);
    return { ...e, phases, kcal: phases[0]?.kcal ?? null, steps: phases[0]?.steps ?? null };
  }
  if (d.tool === 'next_cycle') {
    const g = planChoices('next_cycle', d.original).find((p) => p.key === e.planKey)?.goals[0];
    return { ...e, kcal: int(g?.kcal), steps: int(g?.steps) };
  }
  return e;
}

const bare = (e: AiEdit): AiEdit => { const { sentAs: _s, ...rest } = e; void _s; return rest; };

/** The version the client gets: the coach's edit, else the reply unedited. */
export function sentEdit(d: AiDraft): AiEdit {
  return d.edited ? bare(d.edited) : editFromOriginal(d);
}
export const isEdited = (d: AiDraft) => !!d.edited && JSON.stringify(bare(d.edited)) !== JSON.stringify(editFromOriginal(d));

/** `ai_response.content`, BLOC's contract (TECHNICAL §135): headline, narrative[], kcal?, steps?, compliance?. */
export function contentOf(e: AiEdit): Loose {
  const c: Loose = { headline: e.headline.trim(), narrative: e.narrative.map((p) => p.trim()).filter(Boolean) };
  if (e.kcal != null) c.kcal = e.kcal;
  if (e.steps != null) c.steps = e.steps;
  if (e.compliance != null) c.compliance = Math.round(e.compliance * 10) / 10;
  return c;
}

// ---------------------------------------------------------------- published?

export type PubState = 'draft' | 'published' | 'changed';

/**
 * Where a draft stands: never sent; sent exactly as it is now; or sent, then
 * edited since (a republish marks the client's card "Updated").
 */
export function publishState(d: AiDraft, pubs: CoachPublication[]): { state: PubState; pub: CoachPublication | null } {
  const pub = d.publicationId ? pubs.find((p) => p.id === d.publicationId) ?? null : null;
  if (!d.publicationId) return { state: 'draft', pub: null };
  return { state: d.edited?.sentAs === d.publicationId ? 'published' : 'changed', pub };
}

// ---------------------------------------------------------------- goal changes

export interface GoalChanges {
  goals: GoalPeriod[];
  remove_goal_ids: string[];
  /** Plain lines for the publish sheet, in order. */
  lines: { kind: 'ends' | 'removed' | 'new' | 'renamed'; text: string }[];
}

const fatsOf = (p: Pick<PhaseEdit, 'kcal' | 'protein' | 'carbs'>) => Math.round(Math.max(0, p.kcal - p.protein * 4 - p.carbs * 4) / 9);

/**
 * A check-in's goal change, as BLOC's own goal queue makes it when a Solo user
 * accepts a plan (index.html startGoalQueue, saveGoalAndAdvanceQueue):
 *   · the goal running at the client's today ends the day before the plan's
 *     first Monday (getNextMonday), or is dropped if it started on or after that;
 *   · this cycle's goals starting after today are removed;
 *   · the plan's phases are added, fats derived, labels renumbered "Step N - …".
 * `priorIds` are phases an earlier publish of this response sent: any the new
 * version no longer has are removed too, in case the client hasn't synced yet.
 */
export function goalChanges(s: BlocState, macroId: string, today: string, phases: PhaseEdit[], priorIds: string[] = [], fmtDate: (iso: string) => string = (x) => x): GoalChanges {
  const before = ((s.goals || []) as GoalPeriod[]).map((g) => ({ ...g }));
  const phaseIds = new Set(phases.map((p) => p.id));
  const remove = new Set<string>();
  const lines: GoalChanges['lines'] = [];
  const label = (g: GoalPeriod) => String(g._blocLabel || 'Goal');

  let after = before.filter((g) => {
    if (phaseIds.has(g.macroGoalID as string)) return false; // replaced below
    if (g.startDate > today && g.macroId === macroId) { if (g.macroGoalID) remove.add(String(g.macroGoalID)); lines.push({ kind: 'removed', text: `${label(g)} · ${fmtDate(g.startDate)} – ${fmtDate(g.endDate)}` }); return false; }
    return true;
  });
  for (const id of priorIds) if (!phaseIds.has(id) && !remove.has(id)) remove.add(id);

  const truncatedEnd = getDayBefore(getNextMonday({ today }));
  const ai = after.findIndex((g) => g.startDate <= today && g.endDate >= today);
  if (ai >= 0) {
    const a = after[ai];
    if (truncatedEnd < a.startDate) {
      if (a.macroGoalID) remove.add(String(a.macroGoalID));
      lines.push({ kind: 'removed', text: `${label(a)} · ${fmtDate(a.startDate)} – ${fmtDate(a.endDate)}` });
      after.splice(ai, 1);
    } else {
      after[ai] = { ...a, endDate: truncatedEnd };
    }
  }
  for (const p of phases) {
    after.push({ macroId, startDate: p.startDate, endDate: p.endDate, kcal: p.kcal, steps: p.steps, protein: p.protein, carbs: p.carbs, fats: fatsOf(p), macroGoalID: p.id, _blocLabel: p.label } as GoalPeriod);
  }
  after = (renumberMacroGoalSteps(after, macroId) || after) as GoalPeriod[];

  const was = new Map(before.map((g) => [g.macroGoalID, g]));
  const goals = after.filter((g) => JSON.stringify(was.get(g.macroGoalID)) !== JSON.stringify(g));
  for (const g of goals) {
    const b = was.get(g.macroGoalID);
    if (phaseIds.has(g.macroGoalID as string)) {
      lines.push({ kind: 'new', text: `${label(g)} · ${fmtDate(g.startDate)} – ${fmtDate(g.endDate)} · ${g.kcal} kcal · P ${g.protein}g · C ${g.carbs}g · ${g.steps} steps` });
    } else if (b && b.endDate !== g.endDate) {
      lines.push({ kind: 'ends', text: `${label(b)} now ends ${fmtDate(g.endDate)} (was ${fmtDate(b.endDate)})` });
    } else if (b) {
      lines.push({ kind: 'renamed', text: `${label(b)} is now “${label(g)}”` });
    }
  }
  for (const g of goals) if (remove.has(g.macroGoalID as string)) remove.delete(g.macroGoalID as string);
  return { goals, remove_goal_ids: [...remove], lines };
}

/** The phase ids earlier publications of this response sent. */
export function priorPhaseIds(responseId: string, pubs: CoachPublication[]): string[] {
  return pubs.filter((p) => p.type === 'ai_response' && p.payload?.response_id === responseId)
    .flatMap((p) => ((p.payload?.goal_changes?.goals || []) as GoalPeriod[]).map((g) => String(g.macroGoalID)))
    .filter((id) => /_g\d+$/.test(id));
}

/** The `ai_response` payload (0023's allow-list: v, tool, response_id, macro_id, content, goal_changes, updated). */
export function aiResponsePayload(d: AiDraft, e: AiEdit, changes: GoalChanges | null, republish: boolean): Loose {
  const p: Loose = { v: 1, tool: d.tool, response_id: d.id, macro_id: d.macroId, content: contentOf(e) };
  if (changes && (changes.goals.length || changes.remove_goal_ids.length)) p.goal_changes = { goals: changes.goals, remove_goal_ids: changes.remove_goal_ids };
  if (republish) p.updated = true;
  return p;
}

// ---------------------------------------------------------------- built from what was sent

/** The latest version of each response that reached the client, oldest first. */
function sentDrafts(drafts: AiDraft[], pubs: CoachPublication[], tool: AiTool, macroId?: string) {
  return drafts
    .filter((d) => d.tool === tool && d.publicationId && (macroId == null || d.macroId === macroId))
    .map((d) => {
      // The version sent is the edit stamped with the latest publication, or the reply unedited.
      const pub = pubs.find((p) => p.id === d.publicationId);
      const e = d.edited?.sentAs === d.publicationId ? bare(d.edited!) : null;
      const sent = e ?? (pub ? editFromPayload(d, pub.payload) : sentEdit(d));
      return { d, e: sent, at: pub?.createdAt ?? d.createdAt };
    })
    .sort((a, b) => a.at.localeCompare(b.at));
}
/** A publication's content read back as an edit (when the draft has been edited again since). */
function editFromPayload(d: AiDraft, payload: Loose): AiEdit {
  const c = payload?.content || {};
  const phases = ((payload?.goal_changes?.goals || []) as Loose[]).filter((g) => /_g\d+$/.test(String(g.macroGoalID)) && String(g.macroGoalID).startsWith(`${d.macroId}_g${Date.parse(d.createdAt) || 0}`))
    .map((g) => ({ id: String(g.macroGoalID), label: String(g._blocLabel || ''), startDate: g.startDate, endDate: g.endDate, kcal: g.kcal, protein: g.protein, carbs: g.carbs, steps: g.steps }));
  const ms = Date.parse(d.createdAt) || 0;
  const planKey = phases.length ? planChoices('check_in', d.original).find((p) => phasesFor(d.original, p.key, d.macroId ?? 'macro', ms)[0]?.id === phases[0].id)?.key ?? null : null;
  return { headline: String(c.headline || ''), narrative: paragraphs(c.narrative), kcal: c.kcal ?? null, steps: c.steps ?? null, compliance: c.compliance ?? null, planKey, phases };
}

const condensePhases = (ph: PhaseEdit[]) => ph.map((g) => `${g.kcal}kcal/${g.protein}p/${g.carbs}c/${g.steps}steps (${g.startDate}–${g.endDate})`).join(' → ');

/**
 * The client's state as the engine should see it for the coach's next run:
 * the check-ins the coach SENT on this cycle stand in for BLOC's check-in
 * history (`blocAdvice`), and the coach's sent cycle reviews stand in for
 * `macro.review`, so the prompts carry what the client was actually told.
 * The client's own state is never changed (a copy).
 */
export function overlayCoachAdvice(s: BlocState, macroId: string, drafts: AiDraft[], pubs: CoachPublication[]): BlocState {
  const out: BlocState = { ...s };
  const checkins = sentDrafts(drafts, pubs, 'check_in', macroId);
  if (checkins.length) {
    const entry = (x: (typeof checkins)[number]) => ({
      date: x.d.original.today,
      why: x.e.headline,
      sustainable: x.e.planKey ? condensePhases(x.e.phases) : '',
      aggressive: '',
      chosenPath: x.e.planKey ? 'sustainable' : null,
      chosenAt: x.at.slice(0, 10),
    });
    const last = checkins[checkins.length - 1];
    const nc = checkinDueAfter(last.d.original.today);
    out.blocAdvice = {
      macroId,
      storedAt: last.d.original.today,
      response: {
        headline: last.e.headline,
        narrative: last.e.narrative.join('\n\n'),
        primaryAction: null,
        recommendations: {
          sustainable: { goals: last.e.phases.map((p) => ({ ...p })) },
          aggressive: { goals: [] },
        },
        nextCheckIn: { sustainable: nc, aggressive: nc },
      },
      chosenPath: last.e.planKey ? 'sustainable' : null,
      chosenAt: last.at.slice(0, 10),
      priorAdviceThisCycle: checkins.slice(0, -1).map(entry),
      revisionInfo: null,
    } as Loose;
  }
  const reviews = sentDrafts(drafts, pubs, 'cycle_review');
  if (reviews.length) {
    const byMacro = new Map(reviews.map((x) => [x.d.macroId, x]));
    out.macrocycles = (s.macrocycles || []).map((m) => {
      const x = byMacro.get(m.id);
      if (!x) return m;
      const r = x.d.original.response || {};
      return {
        ...m,
        review: {
          ...r,
          headline: x.e.headline,
          narrative: x.e.narrative.join('\n\n'),
          complianceScore: x.e.compliance ?? r.complianceScore,
        },
      };
    });
  }
  return out;
}

// ---------------------------------------------------------------- when a tool can run

export interface Eligibility {
  /** Show the lavender ✦ row. */
  ready: boolean;
  /** Tapping still runs it (a check-in run early). */
  runnable: boolean;
  text: string;
}

const purpose = (x: Submission) => (x.kind === 'check_in' ? String(x.body?.purpose || 'check_in') : null);

/** The client's check-in request this cycle that no run has answered yet (`body.purpose 'check_in'`, after the last run). */
export function openRequest(subs: Submission[], drafts: AiDraft[], macroId: string): Submission | null {
  const lastRun = drafts.filter((d) => d.tool === 'check_in' && d.macroId === macroId).map((d) => d.createdAt).sort().pop() ?? '';
  return subs
    .filter((x) => purpose(x) === 'check_in' && (!x.body?.macro_id || x.body.macro_id === macroId) && x.createdAt > lastRun)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt)).pop() ?? null;
}

/** The client's photos for this cycle's review (`body.purpose 'cycle_review'`), the latest set. */
export function reviewPhotos(subs: Submission[], macroId: string): { before: string[]; after: string[]; sentOn: string } | null {
  const x = subs.filter((r) => purpose(r) === 'cycle_review' && r.body?.macro_id === macroId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).pop();
  if (!x) return null;
  const list = (v: unknown) => (Array.isArray(v) ? v.map(String).filter(Boolean) : []);
  return { before: list(x.body.before), after: list(x.body.after), sentOn: String(x.body.sent_on || x.createdAt.slice(0, 10)) };
}

export function eligibility(tool: AiTool, o: {
  s: BlocState; macro: Macrocycle; today: string; cycleStatus: 'past' | 'active' | 'upcoming'; hasKey: boolean;
  drafts: AiDraft[]; request: Submission | null; first: string; fmtDate: (iso: string) => string;
}): Eligibility {
  const { s, macro, today, first, fmtDate } = o;
  const ctx = { today };
  const blocked = (text: string): Eligibility => ({ ready: false, runnable: false, text });
  if (!o.hasKey) return blocked('Add your AI key in Settings to run this');
  if (tool === 'check_in') {
    if (o.cycleStatus !== 'active') return blocked(o.cycleStatus === 'upcoming' ? `Check-ins start when this cycle does, ${fmtDate(macro.start as string)}` : 'Check-ins are for the cycle that’s running');
    const ins = computeWeeklyInsights(s, ctx, macro);
    if (!ins || ins.insufficientData) return blocked(`Needs a baseline week: 4 days of food and weigh-ins logged`);
    if (o.request) return { ready: true, runnable: true, text: `Run check-in · ${first} asked ${fmtDate(o.request.createdAt.slice(0, 10))}` };
    const last = o.drafts.filter((d) => d.tool === 'check_in' && d.macroId === macro.id).map((d) => d.original.today).sort().pop();
    const due = last ? checkinDueAfter(last) : null;
    if (!due || today >= due) return { ready: true, runnable: true, text: 'Run check-in with BLOC' };
    return { ready: false, runnable: true, text: `Next check-in · ${fmtDate(due)} · run early` };
  }
  if (tool === 'cycle_review') {
    return isCycleReviewDue(macro, ctx)
      ? { ready: true, runnable: true, text: `Review ${String(macro.name || 'this cycle')} with BLOC` }
      : blocked(`Review this cycle · opens when it ends on ${fmtDate(getMacroEndDate(macro, ctx))}`);
  }
  const rec = recommendNextCycle(s, ctx, macro, null);
  const gate = isNextCycleAdviceEligible(ctx, macro, rec, null);
  if (gate.eligible) return { ready: true, runnable: true, text: 'Build next cycle with BLOC' };
  if (gate.reason === 'outside-3-week-window') {
    // The engine's window: 21 days or fewer to the cycle's end.
    return blocked(`Next-cycle advice · opens ${fmtDate(shiftDateStr(getMacroEndDate(macro, ctx), -21))}, 3 weeks before the cycle ends`);
  }
  if (gate.reason === 'direction-not-chosen') return blocked('BLOC needs a direction for the next cycle first');
  return blocked('BLOC has no next-cycle recommendation for this cycle yet');
}

// ---------------------------------------------------------------- the cycle review prompt

/** The engine's photo paragraph about one particular user. Coach replaces it with the coach's notes on this client. */
export const PERSONAL_PHOTO_PARAGRAPH = 'The user is heavily tattooed — if progress photos are provided, judge visual body composition change by silhouette, muscle definition, and waist/torso shape, and explicitly look past/ignore tattoos rather than mistaking skin art for shadow, discoloration, or other visual artifacts.';
const COMPLIANCE_SCHEMA_LINE = '"complianceScore": number (0-10, how consistently the user stayed on track this cycle — nutrition/step/training adherence),';

/**
 * BLOC's cycle-review prompt, as Coach sends it for a client:
 *   · the engine's paragraph about one particular user's tattoos is replaced by
 *     the coach's private notes on this client, to be used only where they bear
 *     on judging body composition (none → the paragraph is simply gone);
 *   · the model is given the calculated compliance and told to return exactly
 *     it, never its own estimate (the reply's score is overwritten with it too).
 * BLOC's own prompt is unchanged (its golden file pins it).
 */
export function coachReviewPrompt<P extends { systemPrompt: string; userText: string }>(p: P, notes: string | null, c: { overall: number | null; training: number | null; nutrition: number | null; attendance: boolean } | null): P {
  const n = (notes || '').trim();
  const notesPara = n
    ? `The coach's private notes on this client follow. Use only what bears on judging body composition from the photos or measurements (for example tattoos, skin, posture, an injury); ignore anything else in them, such as scheduling or preferences:\n"""\n${n}\n"""`
    : '';
  let systemPrompt = p.systemPrompt.includes(PERSONAL_PHOTO_PARAGRAPH)
    ? p.systemPrompt.replace(n ? PERSONAL_PHOTO_PARAGRAPH : `${PERSONAL_PHOTO_PARAGRAPH}\n\n`, notesPara)
    : p.systemPrompt;
  let userText = p.userText;
  if (c && c.overall != null) {
    const x = (v: number | null) => (v == null ? 'not scored' : `${v.toFixed(1)}/10`);
    systemPrompt = systemPrompt.replace(COMPLIANCE_SCHEMA_LINE, `"complianceScore": number (always exactly ${c.overall.toFixed(1)}: the calculated score in CALCULATED COMPLIANCE below, never your own estimate),`);
    userText = userText.replace('\n\nWrite this cycle\'s review per the schema above.',
      `\n\nCALCULATED COMPLIANCE (BLOC's own scoring of this cycle; use it as given)\n${c.attendance ? 'Training attendance' : 'Training (every set against its target)'}: ${x(c.training)}\nNutrition (the weekly calorie, protein, carbs and steps verdicts): ${x(c.nutrition)}\nOverall: ${x(c.overall)}\n\nWrite this cycle's review per the schema above.`);
  }
  return { ...p, systemPrompt, userText };
}

/** The mean of the calculated scores there are. */
export function overallCompliance(training: number | null, nutrition: number | null): number | null {
  const xs = [training, nutrition].filter((v): v is number => v != null);
  return xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null;
}

/** A client's check-in request, as a line the check-in prompt carries. */
export function requestNote(r: Submission | null): string {
  if (!r) return '';
  const feel = r.body?.feel ? `feeling ${String(r.body.feel).toLowerCase()}` : 'no feel given';
  const note = String(r.body?.note || '').trim();
  return `\n\nTHE CLIENT ASKED FOR THIS CHECK-IN (${String(r.body?.sent_on || r.createdAt.slice(0, 10))}): ${feel}${note ? `. Their note: "${note}"` : ''}`;
}

// ---------------------------------------------------------------- notes back

/** Notes back on one response (`kind 'note_back'`, `body.response_id`), oldest first, each with the coach's reply if any. */
export function notesBack(subs: Submission[], pubs: CoachPublication[], responseId: string): { note: Submission; reply: CoachPublication | null }[] {
  return subs
    .filter((x) => x.kind === 'note_back' && x.body?.response_id === responseId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((note) => ({ note, reply: pubs.filter((p) => p.type === 'note_reply' && p.payload?.submission_id === note.id).sort((a, b) => b.seq - a.seq)[0] ?? null }));
}

/** The latest draft for a tool on a cycle. */
export const latestDraft = (drafts: AiDraft[], tool: AiTool, macroId: string) =>
  drafts.filter((d) => d.tool === tool && d.macroId === macroId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).pop() ?? null;
