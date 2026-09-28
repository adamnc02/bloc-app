// ═══════════════════════════════════════════════════════════════════════
// BLOC AI: the prompts, the request, and what is done with the reply (deep
// dive §1e/§1f, §10 step 6; TECHNICAL §125).
//
// Moved from index.html in v8.35, UNCHANGED apart from their inputs, behind
// same-named shims (the prompt text was copied by script, never retyped: the
// golden file pins it, §118). What changed is where the network is:
//
//   · The engine never fetches and never holds a key. Every request goes
//     through a `callModel` the caller injects (deep dive §1f SCOPE): BLOC's
//     is its browser fetch with the user's own key (BYOK); Coach's will be
//     its own. `callModel(request)` resolves to the reply's text.
//   · request* = build the request, await callModel, post-process. The
//     prompt is built BEFORE, by the caller, so a failure there stays
//     distinguishable ("Failed to build prompt" vs "Could not get advice").
//   · postProcess*Response(rawText, …) parse, validate and finish the reply:
//     the same checks and error messages as before, and the same date work.
//     They create the object they return (from the text), so finishing it in
//     place writes to nothing the caller passed.
//   · Storing the result (state.blocAdvice, nextCycleAdvice and its history,
//     macro.review), the loading flags, the DOM and save() stay in BLOC.
//
// 🚨 "Today", twice. The old code dated the goals (materialiseDates →
//    getNextMonday) and the cycle end when the REPLY arrived, but started the
//    advice check-in's cooldown from the day it was ASKED. So request* take
//    `ctxAt`, called once the reply is in, and requestBlocAdvice takes
//    `askedOn`. A request that straddles midnight behaves exactly as before.
// ═══════════════════════════════════════════════════════════════════════

import type { BlocState, Loose, Macrocycle } from './state.ts';
import { type EngineContext, getMacroEndDate, getMacroDurationWeeks, getMondayAfter, getNextMonday, getSundayAfterWeeks } from './dates.ts';
import { getMacroEffectiveMesoCount, isMesoMicroValid } from './progression.ts';
import { computeTaperCurve } from './nutrition.ts';
import { condenseBlocAdviceEntry, condenseBlocAdvicePlans, extractJsonObject, formatPriorAdviceEntry, formatSignalPeriodsForPrompt } from './prompts.ts';
import { calcDynamicTDEE } from './tdee.ts';
import { computeMaintenanceRecalibration, computeSafetyFloor, computeWeeklyInsights } from './insights.ts';
import { nextCycleAdvicePlanMode } from './nextcycle.ts';
import { materialiseDates } from './cycles.ts';
import { isDeloadUnit } from './sessions.ts';
import { type TargetCache, getRpeKey, getWeekComplianceResult } from './targets.ts';

// ── The request, and the injected transport ────────────────────────────────
export interface ModelRequest { model: string; max_tokens: number; system: string; messages: Loose[] }
export interface ModelReply { text: string; stopReason?: string | null }
export type CallModel = (request: ModelRequest) => Promise<ModelReply>;

// The Messages API body every BLOC AI call sends. 🚨 Key order is the order
// the old inline JSON.stringify used (model, max_tokens, system, messages):
// BLOC's transport stringifies this object as it is.
export function buildModelRequest(system: string, messages: Loose[], maxTokens: number): ModelRequest {
  return { model: 'claude-sonnet-4-6', max_tokens: maxTokens, system, messages };
}

// ── The prompts ──────────────────────────────────────────────────────────

// ── Effort-rating sheet (v8.20, §104) ────────────────────────────────────
// The exercises a session asks about: every non-cardio exercise in the
// session template, in plan order, superset members individually (a rating
// is per exercise, whatever group it sits in).
export function getRpeSessionExercises(s: BlocState, macro: Macrocycle, dayKey: string): Loose[] {
  return ((s.exercises as Record<string, Loose[]>)[macro.id + '_1_' + dayKey] || [])
    .filter(ex => ex.category !== 'cardio')
    .slice().sort((a, b) => (a.order || 0) - (b.order || 0));
}

// ── Prompt builder ────────────────────────────────────────────────────────────
// Constructs the system prompt and user message for the Anthropic API call.
// All constraints (safety floor, protein minimum) are computed here client-side
// and injected as hard rules so the LLM cannot produce unsafe values.
// v8.20 — effort ratings for the AI prompts (§104; Adam, 2026-09-27: "yes,
// short summary"). One bounded line per rated exercise, never the raw
// per-session data: average RPE, how many sessions it covers, the latest,
// how often the rated sessions hit target, and how many were skipped. At
// most 12 lines, hardest first. Returns '' when the cycle has no ratings,
// so a cycle with RPE off sends exactly the prompt it sent before v8.20.
export function buildRpePromptSummary(s: BlocState, cache: TargetCache, macroIn: Macrocycle | null | undefined): string {
  const macro: Loose = macroIn;
  if (!macro || !s.rpe) return '';
  const days = macro.days || [];
  const micros = macro.useMicrocycles !== false ? [1, 2] : [0];
  const totalMesos = getMacroEffectiveMesoCount(macro);
  const byName: Record<string, Loose> = {};
  for (let w = 1; w <= totalMesos; w++) {
    micros.forEach(mc => {
      if (!isMesoMicroValid(macro, w, mc)) return;
      days.forEach((d: string) => {
        const dayKey = mc === 0 ? d : d + 'm' + mc;
        getRpeSessionExercises(s, macro, dayKey).forEach(ex => {
          const r: Loose = (s.rpe as Loose)[getRpeKey(macro.id, w, dayKey, ex.id)];
          if (!r) return;
          const name = (ex.name || '').trim() || ex.id;
          const agg = byName[name] || (byName[name] = { ratings: [], skipped: 0, hit: 0, judged: 0 });
          if (typeof r.rpe === 'number') {
            agg.ratings.push(r.rpe);
            if (w > 1 && !isDeloadUnit(s, macro, w, dayKey) && macro.goalType !== 'maintenance') {
              const c = getWeekComplianceResult(s, cache, macro, w, dayKey, ex);
              if (c.fullyLogged) { agg.judged++; if (c.compliant) agg.hit++; }
            }
          } else if (r.rpeSkipped) agg.skipped++;
        });
      });
    });
  }
  const rows = Object.entries(byName).filter(([, a]) => a.ratings.length || a.skipped)
    .map(([name, a]) => ({ name, a, avg: a.ratings.length ? a.ratings.reduce((x: number, y: number) => x + y, 0) / a.ratings.length : null }))
    .sort((x, y) => (y.avg ?? -1) - (x.avg ?? -1)).slice(0, 12);
  if (!rows.length) return '';
  const lines = rows.map(({ name, a, avg }) => {
    const parts = [];
    if (avg !== null) parts.push(`avg RPE ${avg.toFixed(1)} over ${a.ratings.length} session${a.ratings.length === 1 ? '' : 's'} (latest ${a.ratings[a.ratings.length - 1]})`);
    if (a.judged) parts.push(`hit target ${a.hit}/${a.judged}`);
    if (a.skipped) parts.push(`${a.skipped} not rated`);
    return `- ${name}: ${parts.join(', ')}`;
  });
  return `\n\nEFFORT RATINGS THIS CYCLE (RPE 1–10, 10 = nothing left; "not rated" means the user closed the rating and it counts as fine — never read it as a number):\n${lines.join('\n')}`;
}


export function buildBlocAdvicePrompt(s: BlocState, ctx: EngineContext, cache: TargetCache, macroIn: Macrocycle): { systemPrompt: string; userMessage: string } {
  const macro: Loose = macroIn;
  const ins        = computeWeeklyInsights(s, ctx, macro);
  const dynResult  = calcDynamicTDEE(s, ctx);
  const safetyFloor = computeSafetyFloor(s, ctx, macro);
  const today      = ctx.today; // used below for the waist/hip cycle-scope filter and the weekly data table's partial-week flag

  // Protein floor: 1g per lb of most recent bodyweight, rounded up
  const latestLog = [...(s.bodyLogs || [])]
    .filter(l => l.weight)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const latestBw = latestLog ? parseFloat(latestLog.weight) : null;
  const proteinFloor = latestBw ? Math.ceil(latestBw) : 150;

  // Anchor for the AI's first goal start date. This MUST stay in lockstep
  // with startGoalQueue(), which now truncates the active goal to end the
  // day before this same getNextMonday() value (immediate cutover if
  // today is itself a Monday, otherwise this coming Sunday). Using the
  // identical function here guarantees the AI's first goal never overlaps
  // the truncated active goal.
  const nextMonday  = getNextMonday(ctx);
  const cycleEnd    = getMacroEndDate(macro, ctx);

  // ── Waist/hip measurement trend (cycle-scoped) ──
  // Waist/hip change is valuable context for the LLM — it helps distinguish
  // genuine fat loss from a water-weight plateau. Gracefully falls back to
  // 'not logged this cycle' / 'too sparse for a trend' when data is missing,
  // matching the pattern used elsewhere in this prompt for optional fields.
  const measLogsThisCycle = [...(s.bodyLogs || [])]
    .filter(l => l.date >= (macro.start || '') && l.date <= today &&
      ((l.waist !== null && l.waist !== undefined) || (l.hip !== null && l.hip !== undefined)))
    .sort((a, b) => a.date.localeCompare(b.date));
  const waistLogsThisCycle = measLogsThisCycle.filter(l => l.waist !== null && l.waist !== undefined);
  const hipLogsThisCycle   = measLogsThisCycle.filter(l => l.hip   !== null && l.hip   !== undefined);

  const measTrendStr = (logs: Loose[], unit: string) => {
    if (logs.length >= 2) {
      const first = logs[0], lastLog = logs[logs.length - 1];
      const delta = (lastLog[unit] - first[unit]).toFixed(2);
      return `${first[unit]}" (${first.date}) → ${lastLog[unit]}" (${lastLog.date}), Δ ${(delta as unknown as number) > 0 ? '+' : ''}${delta}"`;
    }
    if (logs.length === 1) return `only one reading so far — ${logs[0][unit]}" (${logs[0].date}), too sparse for a trend`;
    return 'not logged this cycle';
  };
  const waistTrendStr = measTrendStr(waistLogsThisCycle, 'waist');
  const hipTrendStr   = measTrendStr(hipLogsThisCycle, 'hip');

  // ── System prompt ──
  const systemPrompt = `You are BLOC, a personal training and nutrition coach embedded in a fitness tracking app. You analyse the user's real logged data and give direct, specific, evidence-based advice. Speak in second person. Never be vague. Reference actual numbers from the data.

HARD CONSTRAINTS — never violate these:
- No recommended kcal value may fall below ${safetyFloor} kcal/day
- Protein must never be recommended below ${proteinFloor}g per day
- All goal startDates must be Mondays, all endDates must be Sundays
- Steps targets must always be multiples of 2000
- Maximum 4 goals per recommendation path
- Do NOT include a fats field — fats are calculated client-side
- Every goal step must represent a single flat kcal/protein/carbs/steps target sustained across the full 7-day Monday–Sunday week. Do not describe or reference intra-week structure (e.g. specific higher-calorie days followed by lower-calorie days) anywhere — not in the goals array, and not in the narrative, rationale, or summary text. If a refeed or diet break is part of the recommendation, represent it as its own full-week goal step at the refeed's target kcal, not as a partial-week structure averaged into a different step.
- When citing a specific week range (e.g. "your weight oscillated between X and Y across W7–W10"), the X/Y values MUST come only from rows literally labeled W7 through W10 in the WEEKLY DATA table below — never pull in a value from an adjacent week (e.g. W6) even if it was just discussed in the same paragraph for a different reason (like the plateau period). Re-check every week-range claim against the table before including it.
- Respond ONLY with valid JSON matching the schema below — no preamble, no markdown, no text outside the JSON

JSON SCHEMA:
{
  "signal": "one of: plateau-creep | plateau-adaptation | drift-warning | gain-deficit | gain-undereating | gain-excess | maint-stable | maint-unstable | on-track",
  "headline": "max 12 words",
  "narrative": "2-4 paragraphs referencing actual numbers from the data",
  "primaryAction": "single most important action this week, one sentence",
  "secondaryAction": "optional secondary action or null",
  "recommendations": {
    "sustainable": {
      "label": "Sustainable",
      "rationale": "one sentence explaining the logic of this path",
      "summary": "plain English description of the full sequence",
      "goals": [
        {
          "label": "short step name",
          "startDate": "YYYY-MM-DD (must be a Monday)",
          "endDate": "YYYY-MM-DD (must be the Sunday after startDate + weeks)",
          "kcal": number,
          "steps": number (multiple of 2000),
          "protein": number (grams, must be >= ${proteinFloor}),
          "carbs": number (grams)
        }
      ]
    },
    "aggressive": {
      "label": "Aggressive",
      "rationale": "one sentence",
      "summary": "plain English description",
      "goals": [ ... same shape ... ]
    }
  }
}`;

  // ── Weekly data table ──
  const weekRows = (ins && ins.weekBuckets || []).map((b: Loose) => {
    const deltaStr = b.delta !== null ? (b.delta > 0 ? '+' : '') + b.delta.toFixed(2) + ' lbs' : 'n/a (first week)';
    const isBaseline = b.label === (ins.baselineWeekLabel || 'W1') ? ' [BASELINE]' : '';
    // Flag any week whose end date is today or in the future as still in progress.
    // The model must not treat a partial week as a settled data point.
    const isPartial = b.bEnd >= today;
    const partialNote = isPartial ? ` [IN PROGRESS — ${b.nutrDayCount} of 7 days logged so far, averages are provisional]` : '';
    return `${b.label} (${b.bStart}–${b.bEnd}): avg weight ${b.avgWeight ? b.avgWeight.toFixed(1) + ' lbs' : 'n/a'} | delta ${deltaStr} | avg ${b.avgKcal ? b.avgKcal.toLocaleString() : '?'} kcal | ${b.avgProtein || '?'}g protein | ${b.avgCarbs || '?'}g carbs | avg ${b.avgSteps ? b.avgSteps.toLocaleString() : '?'} steps | ${b.nutrDayCount} logged days${isBaseline}${partialNote}`;
  }).join('\n');

  // ── Flat/moving periods this cycle ──
  // Gives the model the full period-by-period history (how many stalls, how
  // long each, exactly when) plus which one is currently the sticky flagged
  // period — see buildSignalPeriods() / computeWeeklyInsights() for why the
  // flag doesn't just track the last 1-2 weeks. Without this, the model only
  // sees "current signal: plateau-adaptation" with no sense of whether that
  // stall is happening right now or ended weeks ago.
  const periodsStr = formatSignalPeriodsForPrompt(ins);

  // ── Prior advice summary ──
  // Combines all condensed check-ins already pushed to priorAdviceThisCycle
  // (from earlier asks this cycle) with the still-current, not-yet-superseded
  // stored response (condensed the same way) — together these give a full
  // chronological history without ever going back further than this cycle.
  let priorAdviceStr = 'None — this is the first advice call for this cycle.';
  if (s.blocAdvice && s.blocAdvice.macroId === macro.id && s.blocAdvice.response) {
    const priorEntries = [...(s.blocAdvice.priorAdviceThisCycle || [])];
    const currentEntry = condenseBlocAdviceEntry(s.blocAdvice);
    if (currentEntry) priorEntries.push(currentEntry);
    priorAdviceStr = priorEntries.map((e, i) => formatPriorAdviceEntry(e, i)).join('\n');
  }

  // ── Completed cycle history ──
  const cycles = (s.insightsRollup?.completedCycles || []);
  const cycleHistoryStr = cycles.length
    ? cycles.map(c => {
        const waistPart = (c.startWaist != null && c.endWaist != null) ? ` | waist ${c.startWaist}"→${c.endWaist}"` : '';
        const hipPart   = (c.startHip   != null && c.endHip   != null) ? ` | hip ${c.startHip}"→${c.endHip}"` : '';
        return `${c.name} (${c.goalType}): ${c.start}–${c.end}, ${c.weeks}w | start ${c.startBw ? c.startBw.toFixed(1) : '?'} lbs → end ${c.endBw ? c.endBw.toFixed(1) : '?'} lbs (target ${c.targetBw || '?'})${waistPart}${hipPart} | avg ${c.avgKcal || '?'} kcal, ${c.avgProtein || '?'}g protein, ${c.avgCarbs || '?'}g carbs | plateau ${c.plateauWeeksDetected}w detected | signals: ${c.signals?.join(', ') || 'none'}`;
      }).join('\n')
    : 'No completed cycles yet — this is the first macrocycle.';

  // ── User message ──
  const userMessage =
`CURRENT CYCLE: ${macro.name}
Goal type: ${macro.goalType} | Start: ${macro.start} | End: ${cycleEnd} | Duration: ${getMacroDurationWeeks(macro)} weeks${macro.extensionWeeks ? ` (base plan ${macro.weeks * (macro.weeksPerMeso||1)}w, extended by ${macro.extensionWeeks}w — the extension repeats the final mesocycle at peak sets)` : ``}
Current weight: ${latestBw ? latestBw.toFixed(1) + ' lbs' : 'unknown'} | Target: ${macro.targetBw ? macro.targetBw + ' lbs' : 'not set'}
Remaining: ${latestBw && macro.targetBw ? Math.abs(latestBw - macro.targetBw).toFixed(1) + ' lbs to target' : 'unknown'}

WEEKLY DATA (7-day average weight from daily weigh-ins):
${weekRows || 'No weekly data available.'}

FLAT/MOVING PERIODS THIS CYCLE (grouped, chronological — see note on which is currently flagged):
${periodsStr}

KEY METRICS:
- Baseline avg intake (${ins?.baselineWeekLabel || 'W1'}): ${ins?.avgKcalBaseline ? ins.avgKcalBaseline.toLocaleString() + ' kcal/day' : 'unknown'}
- Recent avg intake (last 2 weeks): ${ins?.avgKcalRecent ? ins.avgKcalRecent.toLocaleString() + ' kcal/day' : 'unknown'}
- Caloric drift from baseline: ${ins?.caloricDrift != null ? (ins.caloricDrift > 0 ? '+' : '') + ins.caloricDrift + ' kcal/day' : 'unknown'}
- Estimated TDEE: ${dynResult ? '~' + dynResult.tdee.toLocaleString() + ' kcal/day (log-based, ' + dynResult.dataPoints + ' data points)' : 'insufficient data'}
- Log-based BMR: ${dynResult ? '~' + dynResult.bmr.toLocaleString() + ' kcal/day' : 'unknown'}
- Current deficit/surplus vs TDEE: ${ins?.deficitOrSurplus != null ? (ins.deficitOrSurplus > 0 ? '+' : '') + ins.deficitOrSurplus + ' kcal/day' : 'unknown'}
- Currently flagged plateau: ${ins?.activePeriodWeeks || 0} weeks${ins?.activePeriod ? ' (' + ins.activePeriod.startLabel + '–' + ins.activePeriod.endLabel + (ins.activePeriodIsOngoing ? ', ongoing' : ', ended — see periods above for how long ago') + ')' : ''}
- Longest flat stretch this cycle (any time, historical max): ${ins?.plateauWeeks || 0} weeks
- Current signal: ${ins?.signal || 'unknown'}
- Waist trend this cycle: ${waistTrendStr}
- Hip trend this cycle: ${hipTrendStr}${buildRpePromptSummary(s, cache, macro)}

CONSTRAINTS FOR YOUR RECOMMENDATIONS:
- Minimum safe kcal floor: ${safetyFloor} kcal/day (log-based BMR × 0.80)
- Minimum protein: ${proteinFloor}g/day (1g per lb current bodyweight)
- First goal must start: ${nextMonday} (next Monday)
- Cycle end date: ${cycleEnd} — note in narrative if plan extends beyond this

PRIOR ADVICE THIS CYCLE:
${priorAdviceStr}

COMPLETED CYCLE HISTORY:
${cycleHistoryStr}`;

  return { systemPrompt, userMessage };
}

// Builds the system prompt + message history for a challenge call. Rebuilds
// the base prompt fresh from buildBlocAdvicePrompt(macro) rather than storing
// the original prompt text anywhere — cheap, deterministic, and guarantees
// the challenge call sees current logged data, not a stale snapshot.
export function buildBlocChallengePrompt(s: BlocState, ctx: EngineContext, cache: TargetCache, macro: Macrocycle, challengeText: string): { systemPrompt: string; messages: Loose[] } {
  const base = buildBlocAdvicePrompt(s, ctx, cache, macro);
  const stored: Loose = s.blocAdvice;
  const priorResponseForContext = stored && stored.response ? JSON.stringify({
    headline: stored.response.headline,
    narrative: stored.response.narrative,
    primaryAction: stored.response.primaryAction,
    secondaryAction: stored.response.secondaryAction,
    recommendations: stored.response.recommendations,
  }) : '{}';

  const challengeSystemPrompt = base.systemPrompt + `

The user is challenging your most recent recommendation, shown to you as your prior assistant turn below. Respond directly to their specific concern.

Respond ONLY with valid JSON matching this EXTENDED schema — no preamble, no markdown, no text outside the JSON:
{
  "acknowledgment": "1-2 sentences: either admit a mistake and explain what was wrong, or explain why you stand by the original advice — respond directly to what the user raised",
  "isSignificantRevision": "true or false (as a JSON boolean, not a string) — true if this revision changes your fundamental read of the situation or overall strategy (e.g. switching from a refeed/diet-break recommendation to a steeper cut, or reversing which direction the plan should move); false if it's a minor correction within the same overall approach (e.g. adjusting one field like steps or protein on one step, tightening a number, fixing a data error) while your underlying reasoning stands. When false, the ORIGINAL headline/narrative stay visible in the UI and only your plans change — so only mark this true when the original narrative would now be actively misleading if left displayed alongside the new plans",
  "headline": "max 12 words",
  "narrative": "2-4 paragraphs referencing actual numbers from the data — do NOT include the acknowledgment text here, this is the normal reasoning only",
  "primaryAction": "single most important action this week, one sentence",
  "secondaryAction": "optional secondary action or null",
  "recommendations": {
    "sustainable": { "label": "Sustainable", "rationale": "one sentence", "summary": "plain English description", "goals": [ ...same shape as before... ] },
    "aggressive": { "label": "Aggressive", "rationale": "one sentence", "summary": "plain English description", "goals": [ ...same shape as before... ] }
  }
}

Both recommendation paths must always be fully present and fully revised (or reaffirmed unchanged if you stand by the original), regardless of whether the user had already picked a path.`;

  return {
    systemPrompt: challengeSystemPrompt,
    messages: [
      { role: 'user', content: base.userMessage },
      { role: 'assistant', content: priorResponseForContext },
      { role: 'user', content: challengeText },
    ],
  };
}

// ── Prompt builder ───────────────────────────────────────────────────────────
// Reuses the same weekly-data/cycle-history context buildBlocAdvicePrompt()
// already assembles, plus the Next Cycle engine's own outputs: floor/ceiling,
// a forward-looking taper curve sized to the NEXT cycle's own duration (NOT
// the look-back one on rec.taper, which is scoped to the cut/bulk just
// finished), the maintenance TDEE-discrepancy flag when relevant, and any
// user-supplied target weight/deadline override.
//
// Steps handling (per your instruction): BLOC only ever uses daily step
// count as a lever during a CUT. Bulk and maintenance goals are always fixed
// at 8,000 steps/day, applied client-side after parsing — the schema and
// constraints below simply omit the "steps" field entirely unless
// rec.goalType === 'loss', so the model is never even asked for it.
export function buildNextCycleAdvicePrompt(s: BlocState, ctx: EngineContext, cache: TargetCache, macroIn: Macrocycle, rec: Loose, userContext: Loose, priorResponse: Loose, nextCycleOverride: Loose): { systemPrompt: string; userMessage: string } {
  const macro: Loose = macroIn;
  const ins             = computeWeeklyInsights(s, ctx, macro);
  const dynResult       = rec.dynResult || calcDynamicTDEE(s, ctx);
  const safetyFloorKcal = computeSafetyFloor(s, ctx, macro);
  const proteinFloor    = rec.latestBw ? Math.ceil(rec.latestBw) : 150;

  // planRec is the rec actually being planned for — see nextCycleAdvicePlanMode()'s
  // header comment. Resolved once, up front, so every direction-specific
  // field below (goalType, newMacroStart/End, overrideConflict, rationale)
  // consistently comes from the same source.
  const mode              = nextCycleAdvicePlanMode(rec, nextCycleOverride);
  const planRec           = mode.planRec;
  const isContinuationCase = !!(rec.isContinuation && rec.continuationAlternative);

  const goalType        = planRec.goalType; // 'loss' | 'gain' | 'maintenance'
  const isCut           = goalType === 'loss';
  const today           = ctx.today;
  const directionLabel  = ({ loss: 'cut', gain: 'bulk', maintenance: 'maintenance bridge' } as Record<string, string>)[goalType] || goalType;

  // ── Forward taper curve, sized to the NEXT cycle (cut/bulk only) ──
  // Distinct from rec.taper (a look-back check on the cut just completed) —
  // this is the same forward-looking boundary applyPlaceholderOrOverride()
  // uses internally to size the deterministic ramp, recomputed here so the
  // LLM gets the identical hard boundary rather than a re-derived guess.
  let forwardTaperStr = 'n/a — this is a maintenance bridge, not a cut/bulk.';
  if (goalType !== 'maintenance' && planRec.newMacroStart && planRec.newMacroEnd && rec.latestBw) {
    const totalWeeksGuess = Math.round(
      (((new Date(planRec.newMacroEnd + 'T00:00:00') as unknown as number) - (new Date(planRec.newMacroStart + 'T00:00:00') as unknown as number)) / 86400000 + 1) / 7
    );
    const fwdTaper = computeTaperCurve(rec.latestBw, totalWeeksGuess);
    if (fwdTaper) {
      const bottomPctLabel = totalWeeksGuess <= 10 ? '1%' : '0.5%';
      forwardTaperStr = `Over ${totalWeeksGuess} weeks from ${rec.latestBw} lbs, the safe taper curve (1.5% week-1 tapering to ${bottomPctLabel}/week) allows a maximum total ${isCut ? 'loss' : 'gain'} of ~${fwdTaper.totalSafeChange} lbs across the cycle. This is a hard boundary — do not exceed it.`;
    }
  }

  // ── Floor/ceiling ──
  const range = rec.sustainableRange;
  const rangeStr = (range && range.floor != null)
    ? `Floor ${range.floor} lbs / Ceiling ${range.ceiling} lbs (${range.source === 'confirmed' ? 'confirmed from past maintenance cycles' : 'cold-start fallback — no confirmed maintenance cycle yet'}). A requested target beyond this boundary must never be honoured, regardless of pace.`
    : 'Not yet established (insufficient history).';

  // ── Maintenance TDEE-discrepancy flag — only meaningful if the CURRENT
  //    cycle (the one ending) is itself an active maintenance bridge. ──
  let recalStr = 'n/a — current cycle is not a maintenance bridge.';
  if (macro.goalType === 'maintenance') {
    const recal = computeMaintenanceRecalibration(s, ctx, macro, ins);
    recalStr = recal
      ? `Flagged — locally-implied TDEE (${recal.localImpliedTDEE} kcal) disagrees with the current target (${recal.currentTargetKcal} kcal) by ${recal.discrepancy > 0 ? '+' : ''}${recal.discrepancy} kcal. Factor this into how you size the next cycle's starting point.`
      : 'Not flagged — no meaningful discrepancy detected.';
  }

  // ── User-supplied override / conflict context ──
  const override = nextCycleOverride || {};
  const hasOverrideInput = !!(override.targetWeight || override.deadline);
  const overrideStr = hasOverrideInput
    ? `Target weight: ${override.targetWeight || 'not given'} | Deadline: ${override.deadline || 'not given'}.`
    : 'None given.';

  // ── Continuation context — the deterministic engine's own default here is
  //    actually to EXTEND the current cycle, not start a new one. Surfaced
  //    so the model can explicitly weigh extending vs the alternative
  //    direction it's being asked to plan for below, per your instruction
  //    that this get "baked into the deterministic layer first" and then
  //    "shipped to the LLM so it can reason all options." ──
  const continuationContextStr = isContinuationCase
    ? `The deterministic engine's own default here is actually to EXTEND the current cycle rather than start a new one — NOT to switch to ${directionLabel === 'maintenance bridge' ? 'a maintenance bridge' : `a ${directionLabel}`}.
Reasoning to extend: ${(rec.rationale || []).join(' ') || 'none given'}
The alternative you're being asked to plan for below (switching direction instead of extending) — deterministic reasoning: ${(planRec.rationale || []).join(' ') || 'none given'}`
    : 'n/a — this is a genuinely new cycle, not a continuation.';

  // ── Conflict context — now names each alternative's concrete numbers
  //    (already computed by resolveNextCycleOverride) so the model has real
  //    anchors instead of re-deriving its own guesses at the same math. ──
  let conflictStr = 'None.';
  if (mode.conflictTwoPlans) {
    const c = planRec.overrideConflict;
    conflictStr = `The deterministic engine flagged this request as unsafe: "${c.message}" Return exactly 2 plans, using EXACTLY these two keys:
- "preserve-weight": keep the requested target weight (${override.targetWeight} lbs), but push the deadline out to the nearest safe date — ${c.altDate || 'compute the nearest safe Sunday'}.
- "preserve-date": keep the requested deadline (${override.deadline}), but adjust the target weight to the nearest safe figure — ${c.altWeight || 'compute the nearest safe weight'} lbs.
Each plan's goals[] must fill exactly from ${planRec.newMacroStart} to that plan's own end date above, with zero gaps.`;
  }

  // ── User-supplied free-text context + stated future intention ──
  // Distinct from `override` above (target weight/deadline, § Phase 2) —
  // this is the new, optional, freeform context gathered by the modal that
  // now sits in front of askBlocForNextCycleAdvice(). Both fields are
  // independently optional; userContext itself is null entirely when the
  // user chose "Skip" or never opened the modal's fields.
  const ucFreeText = (userContext && userContext.freeText || '').trim();
  const ucIntended = (userContext && userContext.intendedNext) || '';
  const intendedLabel = ({ loss: 'a cut', gain: 'a bulk', maintenance: 'another maintenance block' } as Record<string, string>)[ucIntended] || null;
  const userContextStr = (ucFreeText || intendedLabel)
    ? `Free-text notes from the user: ${ucFreeText ? `"${ucFreeText}"` : 'None given.'}
User's stated intention for AFTER this next cycle: ${intendedLabel || 'Not stated.'}`
    : 'None given — user chose to skip this.';

  // ── Recent next-cycle advice history (last 2 calls, oldest first) ──
  // Gives continuity across cycles: what was asked/answered/chosen last
  // time, including the user's own free-text context then, so the model
  // can track the user's journey rather than reasoning from a blank slate
  // every single cycle. Read from state.nextCycleAdviceHistory — populated
  // by every past successful call, kept indefinitely (see migration note).
  const pastAdvice = (s.nextCycleAdviceHistory || []).slice(-2);
  const historyStr = pastAdvice.length
    ? pastAdvice.map((h, i) => {
        const hUc = h.userContext;
        const hUcStr = (hUc && (hUc.freeText || hUc.intendedNext))
          ? `User context then: ${hUc.freeText ? `"${hUc.freeText}"` : 'none'}${hUc.intendedNext ? `; stated intention then: ${hUc.intendedNext}` : ''}`
          : 'No user context given then.';
        const chosenStr = h.chosenPlanKey ? `user chose plan "${h.chosenPlanKey}"` : 'user has not chosen a plan from this yet (or chose to build the app\'s own recommendation directly instead)';
        return `${i + 1}. ${h.date} — cycle ending: ${h.macroName} (${h.macroGoalType}), planned for: ${h.nextGoalType || 'unknown'}. ${hUcStr} Your headline then: "${h.headline}" (signal: ${h.signal}). Outcome: ${chosenStr}.`;
      }).join('\n')
    : 'No past next-cycle advice calls on record — this is the first one.';

  // ── Steps schema/constraint — omitted entirely unless this is a cut ──
  const stepsSchemaField = isCut ? `,\n          "steps": number (multiple of 2000)` : '';
  const stepsConstraintLine = isCut
    ? `- Steps targets must always be multiples of 2000. You may vary steps between goal phases as an increasing lever during this cut — that's the only time BLOC ever uses steps as a lever.`
    : `- Do NOT include a "steps" field on any goal at all — ${goalType === 'gain' ? 'bulk' : 'maintenance'} goals are always fixed at 8,000 steps/day and applied client-side, not something you recommend.`;

  // ── Plan count + length guidance — depends on which of the 3 modes we're in ──
  let planCountLine, weeksSchemaField = '', planLengthGuidanceBlock = '', fillConstraintLine;
  if (mode.conflictTwoPlans) {
    planCountLine = '- Return EXACTLY 2 plans in the "plans" array, keyed "preserve-weight" and "preserve-date" (see CONFLICT below for what each must do).';
    fillConstraintLine = `- Every plan's goals[] must fully and exactly fill that plan's own end date given in CONFLICT below, from ${planRec.newMacroStart}, with zero gaps — no stopping early, no extending past it.`;
  } else if (mode.directionTwoPlans) {
    planCountLine = `- Return EXACTLY 2 plans in the "plans" array, keyed EXACTLY "sustainable" and "aggressive".`;
    weeksSchemaField = `,\n      "weeks": number (this plan's own total duration in weeks — see PLAN LENGTH GUIDANCE below)`;
    planLengthGuidanceBlock = `
PLAN LENGTH GUIDANCE — no deadline was given, so you choose each plan's own length:
- "sustainable": the safer, longer pace — typically 12-20 weeks.
- "aggressive": ${isCut
      ? 'may run SHORTER than "sustainable" — typically 6-10 weeks — paired with a faster (but still safety-floor-respecting) kcal deficit.'
      : 'must run JUST AS LONG as "sustainable", never shorter — a bulk is never shortened to make it "aggressive" (minimizing fat gain requires patience regardless of pace). Only push the surplus modestly harder than "sustainable", never the timeline.'}
- Each plan states its own duration via the required "weeks" field on the plan object.`;
    fillConstraintLine = `- Each plan's goals[] must collectively span EXACTLY its own stated "weeks" field starting from ${planRec.newMacroStart}, with zero gaps — the final goal's endDate must be the Sunday exactly (weeks × 7 − 1) days after ${planRec.newMacroStart}. Never stop before or extend past your own stated duration.`;
  } else if (mode.maintenanceFlex) {
    planCountLine = '- Return EXACTLY 1 plan in the "plans" array.';
    weeksSchemaField = `,\n      "weeks": number (this plan's own total bridge duration in weeks — see PLAN LENGTH GUIDANCE below)`;
    const engineWeeks = planRec.bridge ? planRec.bridge.totalWeeks : null;
    const engineClimbWeeks = planRec.bridge ? planRec.bridge.climbWeeks : null;
    planLengthGuidanceBlock = `
PLAN LENGTH GUIDANCE — this is a maintenance bridge. The deterministic engine's own default length is ${engineWeeks ? engineWeeks + ' weeks' : 'shown above'}${engineClimbWeeks ? ` (a ${engineClimbWeeks}-week reverse-diet climb to TDEE, plus its minimum hold)` : ''}. You may match that length, or propose a different one (typically longer, e.g. a slower climb and/or a longer hold) if the WEEKLY DATA, COMPLETED CYCLE HISTORY, or USER CONTEXT below give you good reason to — for example a user who reports repeated difficulty holding weight after past cuts is a real reason to run this bridge longer than the engine's own minimum, not just to hold it exactly. Never propose a bridge shorter than the reverse-diet climb itself needs (${engineClimbWeeks || 'the climb duration above'} weeks) — that climb is a physiological floor, not a preference. State your chosen total via the required "weeks" field on the plan object.`;
    fillConstraintLine = `- Your goals[] must collectively span EXACTLY your own stated "weeks" field starting from ${planRec.newMacroStart}, with zero gaps — the final goal's endDate must be the Sunday exactly (weeks × 7 − 1) days after ${planRec.newMacroStart}. Never stop before or extend past your own stated duration.`;
  } else {
    planCountLine = '- Return EXACTLY 1 plan in the "plans" array unless you have a genuinely compelling reason to offer an alternative.';
    fillConstraintLine = `- Your goals[] must fill exactly from ${planRec.newMacroStart} to ${planRec.newMacroEnd || 'the proposed end date above'}, with zero gaps and no early stop.`;
  }
  const maxGoalsPerPlan = mode.directionTwoPlans ? 6 : 5;


  const systemPrompt = `You are BLOC, a personal training and nutrition coach embedded in a fitness tracking app. You are being asked to plan the user's NEXT training cycle — the current cycle (${macro.goalType}) is ending soon. A deterministic engine has already produced its own recommendation, given to you below purely as input data for you to weigh alongside everything else — your job is to reach your own independent judgment from the full picture, not to confirm or critique that recommendation. Speak in second person. Never be vague. Reference actual numbers from the data. Never reveal in your output that a deterministic recommendation was given to you at all — see the HARD CONSTRAINT below.

${isContinuationCase
    ? `The deterministic engine's own default here is to EXTEND the current cycle rather than switch direction — but you are specifically being asked to plan for the ALTERNATIVE instead, in case switching now is actually the better call: ${goalType.toUpperCase()} (a ${directionLabel}). See CONTINUATION CONTEXT below for both sides of this, and weigh in on whether extending or switching is actually better based on the data itself — reasoned from the data, never by naming or citing the deterministic engine's own default as your reason (see the HARD CONSTRAINT below). Your plans[] must still represent the alternative (switching), since a plain extension isn't something this feature builds automatically.`
    : `This next cycle's direction has already been decided: ${goalType.toUpperCase()} (a ${directionLabel}). Do not change the direction — only the pacing, kcal levels, and phase structure${mode.maintenanceFlex ? ' (and, for this maintenance bridge, its total length — see PLAN LENGTH GUIDANCE below)' : ''}.`}

The user may have supplied free-text context and/or a stated intention for what they think comes AFTER this next cycle — see USER CONTEXT below. That stated future intention is NOT a request to change the direction decided above; it's a hint about where the user thinks they're headed next, useful for judging pacing/length of THIS cycle (e.g. a slower, longer maintenance bridge to prepare for a bulk the user is unsure they can sustain). Weigh in on it explicitly in your narrative, including if you think a different path than what they intend would serve them better — but never let it override the fixed direction above.

HARD CONSTRAINTS — never violate these:
- No recommended kcal value may fall below ${safetyFloorKcal} kcal/day
- Protein must never be recommended below ${proteinFloor}g per day
- All goal startDates must be Mondays, all endDates must be Sundays
- The very first goal must start on ${planRec.newMacroStart} (the day after the current cycle ends)
${stepsConstraintLine}
- Minimum 2 goal phases per plan (a starting phase and at least one further phase — never a single flat block), maximum ${maxGoalsPerPlan}
- Do NOT include a fats field — fats are calculated client-side
- Every goal step must represent a single flat kcal/protein/carbs target sustained across its full date range. Do not describe or reference intra-week structure anywhere. Goal step granularity is NOT locked to one-week increments — if a bi-weekly or longer hold makes more sense, make one goal span that full range rather than repeating identical weekly goals.
- When citing a specific week range from the WEEKLY DATA table (e.g. "weight oscillated between X and Y across W7–W10"), the X/Y values MUST come only from rows literally labeled within that range — never pull in a value from an adjacent week discussed elsewhere in the same narrative. Re-check every week-range claim against the table before including it.
- The deterministic engine's own recommendation/reasoning below (see CONTINUATION CONTEXT and "DETERMINISTIC ENGINE'S OWN RECOMMENDATION") is given to you ONLY as input context, to help you reach your own independent judgment. Your "narrative" field must never mention it, agree or disagree with it, or refer to it in any way — no phrases like "the app's suggestion," "the deterministic engine," "the recommendation you were given," "confirming the original plan," etc. Write the narrative exactly as if you independently determined this plan from the raw data alone, with no prior guideline to react to.
${priorResponse ? `- This is a REFRESH: you already gave the PRIOR RESPONSE below before the cycle review (see CYCLE REVIEW above) had come back. Only change anything if the cycle review's compliance/bodyfat/sticking-points verdict genuinely changes what you'd recommend — otherwise return your plans/narrative essentially unchanged. Never change anything just for the sake of it, and never mention that this is a refresh, that a prior response existed, or that anything was or wasn't changed anywhere in your narrative — write it exactly as a normal, fresh response either way.` : ''}
${planCountLine}
${fillConstraintLine}
- Respond ONLY with valid JSON matching the schema below — no preamble, no markdown, no text outside the JSON
${planLengthGuidanceBlock}
JSON SCHEMA:
{
  "signal": "one of: on-track-continue | pace-too-fast | pace-too-slow | needs-longer-bridge | needs-shorter-bridge | conflict-resolution | extend-not-switch | switch-not-extend",
  "headline": "max 12 words",
  "narrative": "2-4 paragraphs referencing actual numbers from the data, presented as your own independent assessment — see the HARD CONSTRAINT above on never referencing the deterministic engine/recommendation itself${isContinuationCase ? ' — including which of extending vs switching you\'d actually recommend, and why (without naming the deterministic engine\'s own default as the reason)' : ''}",
  "plans": [
    {
      "key": "short machine-safe id — see plan-count rule above for exact required keys when 2 plans are requested",
      "label": "short human label, e.g. 'Recommended' or 'Sustainable'",
      "rationale": "one sentence explaining the logic of this plan",
      "summary": "plain English description of the full sequence",${weeksSchemaField}
      "goals": [
        {
          "label": "short step name",
          "startDate": "YYYY-MM-DD (must be a Monday)",
          "endDate": "YYYY-MM-DD (must be the Sunday after startDate + weeks)",
          "kcal": number,
          "protein": number (grams, must be >= ${proteinFloor}),
          "carbs": number (grams)${stepsSchemaField}
        }
      ]
    }
  ]
}`;

  // ── Weekly data table (same source/shape as the mid-cycle prompt) ──
  const weekRows = (ins && ins.weekBuckets || []).map((b: Loose) => {
    const deltaStr = b.delta !== null ? (b.delta > 0 ? '+' : '') + b.delta.toFixed(2) + ' lbs' : 'n/a (first week)';
    const isBaseline = b.label === (ins.baselineWeekLabel || 'W1') ? ' [BASELINE]' : '';
    const isPartial = b.bEnd >= today;
    const partialNote = isPartial ? ` [IN PROGRESS — ${b.nutrDayCount} of 7 days logged so far, averages are provisional]` : '';
    return `${b.label} (${b.bStart}–${b.bEnd}): avg weight ${b.avgWeight ? b.avgWeight.toFixed(1) + ' lbs' : 'n/a'} | delta ${deltaStr} | avg ${b.avgKcal ? b.avgKcal.toLocaleString() : '?'} kcal | ${b.avgProtein || '?'}g protein | ${b.avgCarbs || '?'}g carbs | avg ${b.avgSteps ? b.avgSteps.toLocaleString() : '?'} steps | ${b.nutrDayCount} logged days${isBaseline}${partialNote}`;
  }).join('\n');

  // ── Completed cycle history (identical source to the mid-cycle prompt) ──
  const cycles = (s.insightsRollup?.completedCycles || []);
  const cycleHistoryStr = cycles.length
    ? cycles.map(c => {
        const waistPart = (c.startWaist != null && c.endWaist != null) ? ` | waist ${c.startWaist}"→${c.endWaist}"` : '';
        const hipPart   = (c.startHip   != null && c.endHip   != null) ? ` | hip ${c.startHip}"→${c.endHip}"` : '';
        return `${c.name} (${c.goalType}): ${c.start}–${c.end}, ${c.weeks}w | start ${c.startBw ? c.startBw.toFixed(1) : '?'} lbs → end ${c.endBw ? c.endBw.toFixed(1) : '?'} lbs (target ${c.targetBw || '?'})${waistPart}${hipPart} | avg ${c.avgKcal || '?'} kcal, ${c.avgProtein || '?'}g protein, ${c.avgCarbs || '?'}g carbs | plateau ${c.plateauWeeksDetected}w detected | signals: ${c.signals?.join(', ') || 'none'}`;
      }).join('\n')
    : 'No completed cycles yet — this is the first macrocycle.';

  const userMessage =
`CURRENT CYCLE ENDING: ${macro.name} (${macro.goalType})
Start: ${macro.start} | End: ${getMacroEndDate(macro, ctx)} | Duration: ${getMacroDurationWeeks(macro)} weeks${macro.extensionWeeks ? ` (base plan ${macro.weeks * (macro.weeksPerMeso||1)}w, extended by ${macro.extensionWeeks}w)` : ``}
Current weight: ${rec.latestBw ? rec.latestBw.toFixed(1) + ' lbs' : 'unknown'}

WEEKLY DATA (7-day average weight from daily weigh-ins):
${weekRows || 'No weekly data available.'}

CONTINUATION CONTEXT: ${continuationContextStr}

DETERMINISTIC ENGINE'S OWN RECOMMENDATION FOR THE PLAN BELOW (already computed — agree, refine, or override with reasoning):
Direction${isContinuationCase ? ' being planned for (the alternative, not the engine\'s own default of extending)' : ' decided'}: ${goalType}
Reasoning: ${(planRec.rationale || []).join(' ') || 'none given'}
Ramp start point: ${rec.rampStartKcal ? rec.rampStartKcal.toLocaleString() + " kcal (current cycle's last goal)" : 'unknown'}
Proposed next cycle window: ${planRec.newMacroStart} → ${planRec.newMacroEnd || 'not yet resolved'}

KEY METRICS:
- Estimated TDEE: ${dynResult ? '~' + dynResult.tdee.toLocaleString() + ' kcal/day (log-based, ' + dynResult.dataPoints + ' data points)' : 'insufficient data'}
- Log-based BMR: ${dynResult ? '~' + dynResult.bmr.toLocaleString() + ' kcal/day' : 'unknown'}
- Currently flagged plateau (sticky — see mid-cycle logic): ${ins?.activePeriodWeeks || 0} weeks${ins?.activePeriod && !ins.activePeriodIsOngoing ? ' (ended, not currently ongoing)' : ''}
- Longest flat stretch this cycle (any time, historical max): ${ins?.plateauWeeks || 0} weeks
- Current signal (current cycle): ${ins?.signal || 'unknown'}${buildRpePromptSummary(s, cache, macro)}

SAFE BOUNDARIES FOR THE NEXT CYCLE:
- Minimum safe kcal floor: ${safetyFloorKcal} kcal/day
- Minimum protein: ${proteinFloor}g/day
- Sustainable weight floor/ceiling: ${rangeStr}
- Forward taper limit for this cycle's likely length: ${forwardTaperStr}

MAINTENANCE TDEE-DISCREPANCY FLAG (current cycle, if applicable): ${recalStr}

USER-SUPPLIED TARGET/DEADLINE: ${overrideStr}
CONFLICT: ${conflictStr}

USER CONTEXT FOR THIS CYCLE: ${userContextStr}

${(() => {
    // Cycle review, if it's already been generated for the cycle that's
    // ending (dev 2026-09-15, item 1b — the final-week sequencing feature
    // runs the review first when both are triggered together, or it may
    // simply have been run earlier by the user): fold its verdict in as
    // extra context. Purely informational — never changes the fixed
    // direction/constraints above, just gives you the review's own take on
    // compliance/bodyfat/training this cycle to weigh alongside the raw
    // weekly data.
    if (!macro.review) return 'CYCLE REVIEW: Not yet generated for the cycle that\'s ending.';
    const r = macro.review;
    const bf = r.bodyfatEstimate || {};
    return `CYCLE REVIEW (just completed for the cycle that's ending):
Compliance score: ${r.complianceScore}/10
Bodyfat-change estimate: ${bf.direction || 'unclear'}${bf.note ? ' — ' + bf.note : ''}
Headline: ${r.headline}
Ran too long: ${r.ranTooLong ? 'yes — ' + r.ranTooLongNote : 'no'}
Sticking points: ${r.stickingPoints || 'none noted'}`;
  })()}

COMPLETED CYCLE HISTORY:
${cycleHistoryStr}

RECENT NEXT-CYCLE ADVICE HISTORY (your own past calls, most recent last):
${historyStr}

${priorResponse ? `PRIOR RESPONSE (already given to the user, before the cycle review above was available — see the REFRESH instruction above):
Headline: ${priorResponse.headline}
Narrative: ${priorResponse.narrative}
Plans: ${priorResponse.plans.map((p: Loose) => `"${p.label}" (${p.key}) — ${p.summary}`).join(' | ')}` : ''}`;

  return { systemPrompt, userMessage };
}


// ── Finishing a reply ─────────────────────────────────────────────────────

// The check-in (askBlocForAdvice). Throws 'Response was not valid JSON' /
// 'Response missing required fields', as before. `askedOn` starts the 2-week
// cooldown (default: ctx.today).
export function postProcessAdviceResponse(rawText: string, macro: Macrocycle, ctx: EngineContext, askedOn?: string): Loose {
  const today = askedOn || ctx.today;
  // Fences/preamble tolerated — see extractJsonObject() and TECHNICAL.md §76
  const response = extractJsonObject(rawText);
  if (!response) throw new Error('Response was not valid JSON');

  // Validate required fields
  if (!response.signal || !response.headline || !response.narrative
      || !response.recommendations?.sustainable?.goals
      || !response.recommendations?.aggressive?.goals) {
    throw new Error('Response missing required fields');
  }

  // Materialise dates and back-calculate fats for both paths
  const cycleEnd = getMacroEndDate(macro, ctx);
  response.recommendations.sustainable.goals =
    materialiseDates(response.recommendations.sustainable.goals, macro, ctx);
  response.recommendations.aggressive.goals =
    materialiseDates(response.recommendations.aggressive.goals, macro, ctx);

  // nextCheckIn = 2 weeks from today (the call date), always.
  // Reasoning: regardless of how long the plan runs, if progress hasn't
  // improved after 2 weeks you need new advice — waiting for the plan to
  // finish before allowing a check-in defeats the purpose of the feature.
  // Both paths share the same cooldown since the 2-week window is about
  // detecting whether the intervention is working, not about plan length.
  const twoWeeksOut = getMondayAfter(getSundayAfterWeeks(today, 2));
  response.nextCheckIn = {
    sustainable: twoWeeksOut,
    aggressive:  twoWeeksOut,
  };

  // Cycle-exceed flags
  const lastSust = response.recommendations.sustainable.goals.slice(-1)[0]?.endDate;
  const lastAgg  = response.recommendations.aggressive.goals.slice(-1)[0]?.endDate;
  response._cycleEnd = cycleEnd;
  response._sustainableExceedsCycle = lastSust && lastSust > cycleEnd;
  response._aggressiveExceedsCycle  = lastAgg  && lastAgg  > cycleEnd;
  return response;
}

// "Challenge this advice" (askBlocForChallenge): its own required fields,
// then exactly the check-in's processing, so an accepted revision is
// indistinguishable from a normal response to startGoalQueue()/goalSummaryBlock().
export function postProcessChallengeResponse(rawText: string, macro: Macrocycle, ctx: EngineContext): Loose {
  const revision = extractJsonObject(rawText);
  if (!revision) throw new Error('Response was not valid JSON');

  if (!revision.acknowledgment || !revision.headline || !revision.narrative
      || typeof revision.isSignificantRevision !== 'boolean'
      || !revision.recommendations?.sustainable?.goals
      || !revision.recommendations?.aggressive?.goals) {
    throw new Error('Response missing required fields');
  }

  // Materialise dates, compute nextCheckIn and cycle-exceed flags — same
  // processing as a normal response, so it's indistinguishable from one
  // to startGoalQueue()/goalSummaryBlock() once accepted.
  const cycleEnd = getMacroEndDate(macro, ctx);
  revision.recommendations.sustainable.goals =
    materialiseDates(revision.recommendations.sustainable.goals, macro, ctx);
  revision.recommendations.aggressive.goals =
    materialiseDates(revision.recommendations.aggressive.goals, macro, ctx);

  const today = ctx.today;
  const twoWeeksOut = getMondayAfter(getSundayAfterWeeks(today, 2));
  revision.nextCheckIn = { sustainable: twoWeeksOut, aggressive: twoWeeksOut };

  const lastSust = revision.recommendations.sustainable.goals.slice(-1)[0]?.endDate;
  const lastAgg  = revision.recommendations.aggressive.goals.slice(-1)[0]?.endDate;
  revision._cycleEnd = cycleEnd;
  revision._sustainableExceedsCycle = lastSust && lastSust > cycleEnd;
  revision._aggressiveExceedsCycle  = lastAgg  && lastAgg  > cycleEnd;
  return revision;
}

// Accepting a challenge reply (acceptBlocChallenge): takes the revised
// recommendations (both plans) and check-in metadata from the revision, but
// deliberately KEEPS the original headline/narrative/primaryAction/
// secondaryAction — that's still the real reason advice was first requested,
// and a challenge reply is framed around answering the user's specific
// pushback, not re-stating that original context. The acknowledgment is
// preserved as `_revisionNote` and rendered as an italic subtitle beneath
// the narrative instead of replacing it.
//
// Returns the new response and revisionInfo; BLOC writes them onto the
// stored check-in (with chosenPath/chosenAt cleared and the pending
// revision consumed) and saves. `stored` must carry a pendingRevision.
export function acceptChallengeRevision(stored: Loose): { response: Loose; revisionInfo: Loose } {
  const revision = stored.conversation.pendingRevision;

  const originalSummary = condenseBlocAdvicePlans(stored.response);
  const acknowledgment = revision.acknowledgment;
  const significant = !!revision.isSignificantRevision;

  const newResponse = significant
    // Significant: the LLM changed its fundamental read of the situation —
    // the old narrative would now be actively misleading next to the new
    // plans, so swap headline/narrative/actions in wholesale.
    ? {
        ...stored.response,
        headline: revision.headline,
        narrative: revision.narrative,
        primaryAction: revision.primaryAction,
        secondaryAction: revision.secondaryAction,
        recommendations: revision.recommendations,
        nextCheckIn: revision.nextCheckIn,
        _cycleEnd: revision._cycleEnd,
        _sustainableExceedsCycle: revision._sustainableExceedsCycle,
        _aggressiveExceedsCycle: revision._aggressiveExceedsCycle,
        _revisionNote: null,
      }
    // Minor: keep the original headline/narrative/actions — still the real
    // reason advice was first requested — and surface the acknowledgment as
    // a small italic subtitle instead of replacing anything.
    : {
        ...stored.response,
        recommendations: revision.recommendations,
        nextCheckIn: revision.nextCheckIn,
        _cycleEnd: revision._cycleEnd,
        _sustainableExceedsCycle: revision._sustainableExceedsCycle,
        _aggressiveExceedsCycle: revision._aggressiveExceedsCycle,
        _revisionNote: acknowledgment,
      };

  // revisionInfo is captured either way — the next check-in's condensed
  // history should always show both the original and revised numbers,
  // regardless of how significant the change was to the UI narrative.
  return { response: newResponse, revisionInfo: { originalSummary, acknowledgment } };
}

// The next-cycle second opinion (askBlocForNextCycleAdvice): the shape and
// per-plan guards (fill-to-length, the reverse-diet floor, bulk never
// shortened), then fats and the steps rule. `nextCycleOverride` is the
// target/deadline the prompt was built with (BLOC's _nextCycleOverride).
export function postProcessNextCycleResponse(rawText: string, macro: Macrocycle, rec: Loose, nextCycleOverride: Loose, ctx: EngineContext): Loose {
  // Fences/preamble tolerated — see extractJsonObject() and TECHNICAL.md §76
  const response = extractJsonObject(rawText);
  if (!response) throw new Error('Response was not valid JSON');

  // Validate required top-level fields and per-plan shape (>=2 goals per
  // plan, per the spec's "at least 2 goal phases" requirement).
  if (!response.signal || !response.headline || !response.narrative
      || !Array.isArray(response.plans) || !response.plans.length) {
    throw new Error('Response missing required fields');
  }
  const mode = nextCycleAdvicePlanMode(rec, nextCycleOverride);
  const planRec = mode.planRec;
  response.plans.forEach((p: Loose, i: number) => {
    if (!p.key || !p.label || !Array.isArray(p.goals) || p.goals.length < 2) {
      throw new Error(`Plan ${i + 1} is missing required fields or has fewer than 2 goal phases`);
    }
    // ── Fill-to-length guard ──────────────────────────────────────────
    // Forces the model to actually fill the cycle it was asked to plan
    // for, rather than silently stopping short (or running long): in
    // directionTwoPlans mode each plan states its own duration via the
    // required "weeks" field; otherwise the length is already fixed
    // (planRec.newMacroEnd). Either way, the last goal's endDate must
    // land exactly on the implied end date — a mismatch is a hard
    // failure, not a warning, since a plan that doesn't fill its cycle
    // needs a new attempt rather than silent acceptance.
    let expectedEnd: Loose = null;
    if (mode.directionTwoPlans || mode.maintenanceFlex) {
      if (typeof p.weeks !== 'number' || p.weeks < 1) {
        throw new Error(`Plan ${i + 1} ("${p.label}") is missing its required "weeks" field`);
      }
      // A maintenance bridge can never be shorter than its own reverse-diet
      // climb — that's a physiological floor, not a preference (see PLAN
      // LENGTH GUIDANCE). Only meaningful when the engine actually computed
      // a climb (planRec.bridge is null for e.g. a cold-start placeholder).
      if (mode.maintenanceFlex && planRec.bridge && planRec.bridge.climbWeeks && p.weeks < planRec.bridge.climbWeeks) {
        throw new Error(`Plan ${i + 1} ("${p.label}") is shorter (${p.weeks}w) than the required reverse-diet climb (${planRec.bridge.climbWeeks}w)`);
      }
      expectedEnd = getSundayAfterWeeks(planRec.newMacroStart, p.weeks);
    } else if (planRec.newMacroEnd) {
      expectedEnd = planRec.newMacroEnd;
    }
    if (expectedEnd) {
      const lastGoalEnd = p.goals[p.goals.length - 1].endDate;
      if (lastGoalEnd !== expectedEnd) {
        throw new Error(`Plan ${i + 1} ("${p.label}") doesn't fill its cycle — goals end ${lastGoalEnd}, expected ${expectedEnd}`);
      }
    }
  });
  // ── Bulk-never-shortened guard ───────────────────────────────────────
  // A bulk's "aggressive" variant may push kcal harder, but must NEVER run
  // shorter than "sustainable" — patience is the whole point of minimising
  // fat gain, regardless of pace. Only meaningful in directionTwoPlans mode
  // for a gain-type cycle (uses planRec, since a gain-continuation's
  // alternative can itself be a 'loss', in which case this guard correctly
  // doesn't apply).
  if (mode.directionTwoPlans && planRec.goalType === 'gain') {
    const sust = response.plans.find((p: Loose) => p.key === 'sustainable');
    const agg  = response.plans.find((p: Loose) => p.key === 'aggressive');
    if (sust && agg && typeof sust.weeks === 'number' && typeof agg.weeks === 'number' && agg.weeks < sust.weeks) {
      throw new Error(`"aggressive" bulk plan (${agg.weeks}w) is shorter than "sustainable" (${sust.weeks}w) — bulks must never be shortened to be "aggressive"`);
    }
  }

  // Materialise fats and enforce the client-side steps rule: 8,000 flat
  // for every bulk/maintenance goal regardless of what (if anything) came
  // back for that field; only a cut's goals ever carry a real steps value
  // from the model. Uses planRec.goalType, not rec.goalType — for a
  // continuation, plans[] represents the alternative direction, which may
  // differ from the current cycle's own (continuing) direction.
  response.plans.forEach((p: Loose) => {
    p.goals = p.goals.map((g: Loose) => {
      const remainingKcal = Math.max(0, g.kcal - (g.protein * 4) - (g.carbs * 4));
      const fats = Math.round(remainingKcal / 9);
      const steps = planRec.goalType === 'loss' ? (parseInt(g.steps) || 8000) : 8000;
      return { ...g, fats, steps };
    });
  });

  response._cycleEnd = getMacroEndDate(macro, ctx);
  return response;
}

// The cycle review (generateCycleReview): its required fields, and the
// review as stored on macro.review (the payload's deterministic numbers
// alongside the model's verdict).
export function postProcessCycleReviewResponse(rawText: string, payload: Loose, beforePhotoCount: number, afterPhotoCount: number, ctx: EngineContext): Loose {
  const response = extractJsonObject(rawText);
  if (!response) throw new Error('Response was not valid JSON');

  if (!response.narrative || !response.headline || typeof response.complianceScore !== 'number') {
    throw new Error('Response missing required fields');
  }

  return {
    storedAt: ctx.today,
    complianceScore: response.complianceScore,
    bodyfatEstimate: response.bodyfatEstimate || null,
    headline: response.headline,
    narrative: response.narrative,
    highlights: response.highlights || [],
    improvements: response.improvements || [],
    stickingPoints: response.stickingPoints || '',
    ranTooLong: !!response.ranTooLong,
    ranTooLongNote: response.ranTooLongNote || '',
    weightTargetDelta: payload.measurements.weightTargetDelta,
    totalWeightChange: payload.measurements.totalWeightChange,
    beforePhotoCount, afterPhotoCount,
  };
}

// ── The requests, with the transport injected ──────────────────────────────
// `ctxAt` is called once the reply has arrived (see the header's "Today,
// twice"); Coach can pass `() => ctx`.

export async function requestBlocAdvice(prompt: { systemPrompt: string; userMessage: string }, macro: Macrocycle, callModel: CallModel, ctxAt: () => EngineContext, askedOn?: string): Promise<Loose> {
  const reply = await callModel(buildModelRequest(prompt.systemPrompt, [{ role: 'user', content: prompt.userMessage }], 8000));
  return postProcessAdviceResponse(reply.text, macro, ctxAt(), askedOn);
}

export async function requestBlocChallenge(built: { systemPrompt: string; messages: Loose[] }, macro: Macrocycle, callModel: CallModel, ctxAt: () => EngineContext): Promise<Loose> {
  const reply = await callModel(buildModelRequest(built.systemPrompt, built.messages, 8000));
  return postProcessChallengeResponse(reply.text, macro, ctxAt());
}

// `overrideAt` is read once the reply is in, like ctxAt: the old code
// re-read BLOC's _nextCycleOverride then, and the target/deadline inputs stay
// on screen (and can be replaced) while the request is in flight.
export async function requestNextCycleAdvice(prompt: { systemPrompt: string; userMessage: string }, macro: Macrocycle, rec: Loose, callModel: CallModel, ctxAt: () => EngineContext, overrideAt: () => Loose): Promise<Loose> {
  const reply = await callModel(buildModelRequest(prompt.systemPrompt, [{ role: 'user', content: prompt.userMessage }], 8000));
  return postProcessNextCycleResponse(reply.text, macro, rec, overrideAt(), ctxAt());
}

export async function requestCycleReview(prompt: { systemPrompt: string; userText: string; imageBlocks: Loose[] }, payload: Loose, beforePhotoCount: number, afterPhotoCount: number, callModel: CallModel, ctxAt: () => EngineContext): Promise<Loose> {
  const reply = await callModel(buildModelRequest(prompt.systemPrompt,
    [{ role: 'user', content: [{ type: 'text', text: prompt.userText }, ...prompt.imageBlocks] }], 4000));
  return postProcessCycleReviewResponse(reply.text, payload, beforePhotoCount, afterPhotoCount, ctxAt());
}
