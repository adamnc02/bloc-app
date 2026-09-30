// ═══════════════════════════════════════════════════════════════════════
// Running one AI tool on a client (TECHNICAL §141).
//
// The prompts, the request and the reply's processing are BLOC's own engine
// (engine/src/advice.ts, prompts.ts), exactly as BLOC Solo runs them, on the
// client's uploaded state at THEIR today. Coach changes only what the engine
// can't know:
//   · the history it builds from is what the coach SENT (overlayCoachAdvice);
//   · a check-in the client asked for carries their feel and note;
//   · a cycle review gets the calculated compliance and the coach's notes on
//     the client in place of a paragraph about one particular user
//     (coachReviewPrompt), and its score is the calculated one.
// The transport (`callModel`) is injected: the coach's own key in the browser
// (transport.ts), a stub in the tests. The reply text is kept verbatim.
// ═══════════════════════════════════════════════════════════════════════
import {
  buildBlocAdvicePrompt, buildCycleReviewPrompt, buildNextCycleAdvicePrompt, computeCycleReviewPayload,
  recommendNextCycle, requestBlocAdvice, requestCycleReview, requestNextCycleAdvice,
  type BlocState, type CallModel, type CycleReviewImage, type Macrocycle,
} from '@engine';
import { makeTargetCache } from '@engine/review';
import { coachReviewPrompt, overlayCoachAdvice, requestNote } from './tools';
import type { AiDraft, AiOriginal, AiTool, CalcCompliance, CoachPublication, Submission } from './types';

export interface RunInput {
  tool: AiTool;
  state: BlocState;
  macro: Macrocycle;
  /** The client's local date (their tz). */
  today: string;
  callModel: CallModel;
  /** This client's drafts and publications: the sent history the prompt is built from. */
  drafts: AiDraft[];
  publications: CoachPublication[];
  /** Check-in: the client's open request, if any. */
  request?: Submission | null;
  /** Cycle review: the coach's private notes on the card, the calculated scores, and the consented photos. */
  notes?: string | null;
  compliance?: CalcCompliance | null;
  photos?: { before: CycleReviewImage[]; after: CycleReviewImage[] } | null;
}

export async function runTool(i: RunInput): Promise<AiOriginal> {
  const ctx = { today: i.today };
  const s = overlayCoachAdvice(i.state, i.macro.id, i.drafts, i.publications);
  const macro = (s.macrocycles || []).find((m) => m.id === i.macro.id) ?? i.macro;
  let raw = '';
  const callModel: CallModel = async (req) => { const r = await i.callModel(req); raw = r.text; return r; };

  if (i.tool === 'check_in') {
    const prompt = buildBlocAdvicePrompt(s, ctx, makeTargetCache(s), macro);
    const response = await requestBlocAdvice({ ...prompt, userMessage: prompt.userMessage + requestNote(i.request ?? null) }, macro, callModel, () => ctx, i.today);
    return { v: 1, raw, response, today: i.today, requestId: i.request?.id ?? null };
  }
  if (i.tool === 'cycle_review') {
    const before = i.photos?.before ?? [], after = i.photos?.after ?? [];
    const payload = computeCycleReviewPayload(s, ctx, macro);
    const prompt = coachReviewPrompt(buildCycleReviewPrompt(macro, payload, before, after), i.notes ?? null, i.compliance ?? null);
    const response = await requestCycleReview(prompt, payload, before.length, after.length, callModel, () => ctx);
    if (i.compliance?.overall != null) response.complianceScore = i.compliance.overall;
    return { v: 1, raw, response, today: i.today, compliance: i.compliance ?? null, photos: { before: before.length, after: after.length } };
  }
  const rec = recommendNextCycle(s, ctx, macro, null);
  const prompt = buildNextCycleAdvicePrompt(s, ctx, makeTargetCache(s), macro, rec, null, null, null);
  const response = await requestNextCycleAdvice(prompt, macro, rec, callModel, () => ctx, () => null);
  return { v: 1, raw, response, today: i.today };
}
