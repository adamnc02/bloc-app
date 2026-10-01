// ═══════════════════════════════════════════════════════════════════════
// Prompt text and model-response parsing: the plateau periods, the prior
// check-in history, the cycle review prompt, and pulling the JSON object out
// of a reply (TECHNICAL §124).
//
// Moved from index.html in v8.34, UNCHANGED, behind same-named shims. Pure:
// no network. The transport (callModel) is injected in step 6, with the
// prompt builders that read `state`.
//
// 🚨 Prompt text is behaviour. The golden harness (§118) records every
//    prompt in full, so a changed character here fails it. Never tidy the
//    wording in passing.
//
// `Loose` marks shapes built by code still in index.html (computeWeekly-
// Insights, computeCycleReviewPayload, the stored advice). They get real
// types when that code moves (steps 4–6).
// ═══════════════════════════════════════════════════════════════════════

import type { Macrocycle } from './state.ts';

type Loose = any;

export interface CycleReviewImage {
  mediaType: string;
  base64: string;
}

// ── Sticky flat/moving period grouping ──────────────────────────────────────
// Groups the weeks since baseline into contiguous "flat" (|delta|<=0.5, same
// threshold as the plateau check) vs "moving" runs, so both computeWeeklyInsights
// (for the sticky current signal) and the AI prompt (for full period history —
// how many stalls, how long each, when) can use the same grouping. A period
// only "confirms" once it reaches 2 consecutive weeks — a lone week either way
// is noise, not a real regime change.
export function buildSignalPeriods(weekBuckets: Loose[], baselineIdx: number): { periods: Loose[]; activePeriod: Loose | null } {
  const seq = weekBuckets.slice(baselineIdx + 1).filter(b => b.delta !== null);
  const periods: Loose[] = [];
  let cur: Loose = null;
  for (const b of seq) {
    const type = Math.abs(b.delta) <= 0.5 ? 'flat' : 'moving';
    if (cur && cur.type === type) {
      cur.weeks.push(b);
    } else {
      if (cur) periods.push(cur);
      cur = { type, weeks: [b] };
    }
  }
  if (cur) periods.push(cur);

  periods.forEach(p => {
    p.length = p.weeks.length;
    p.startLabel = p.weeks[0].label;
    p.endLabel = p.weeks[p.weeks.length - 1].label;
    p.startDate = p.weeks[0].bStart;
    p.endDate = p.weeks[p.weeks.length - 1].bEnd;
    p.confirmed = p.length >= 2;
    const kcalWeeks = p.weeks.filter((w: Loose) => w.avgKcal !== null);
    p.avgKcalDuring = kcalWeeks.length
      ? Math.round(kcalWeeks.reduce((s: number, w: Loose) => s + w.avgKcal, 0) / kcalWeeks.length)
      : null;
  });

  // Sticky "active" period: the most recent CONFIRMED (2+ week) period.
  // A still-forming trailing period (<2 weeks) never overrides the last
  // confirmed one — this is what makes the flag sticky rather than
  // flickering on single-week noise.
  let activePeriod: Loose = null;
  for (const p of periods) {
    if (p.confirmed) activePeriod = p;
  }

  return { periods, activePeriod };
}

// Formats the flat/moving periods from computeWeeklyInsights() into a
// prompt-ready block: every period with its date range, length, and whether
// it's confirmed (2+ weeks) — plus an explicit note on which one is the
// sticky "currently flagged" period and whether it's ongoing or historical.
// Shared by both the mid-cycle and next-cycle prompts.
export function formatSignalPeriodsForPrompt(ins: Loose): string {
  if (!ins || !ins.signalPeriods || !ins.signalPeriods.length) {
    return 'No confirmed flat/moving periods yet — still gathering data since baseline.';
  }
  const lines = ins.signalPeriods.map((p: Loose) => {
    const range = p.startLabel === p.endLabel ? p.startLabel : `${p.startLabel}–${p.endLabel}`;
    const label = p.type === 'flat' ? 'PLATEAU (flat weight)' : 'active movement';
    const conf = p.confirmed ? '' : ' [not yet confirmed — fewer than 2 weeks, could still turn out to be noise]';
    const kcalPart = p.avgKcalDuring !== null ? `, avg ${p.avgKcalDuring.toLocaleString()} kcal/day during` : '';
    return `${range} (${p.length}wk): ${label}${kcalPart}${conf}`;
  }).join('\n');

  let activeNote = '';
  if (ins.activePeriod && ins.activePeriod.type === 'flat') {
    activeNote = ins.activePeriodIsOngoing
      ? `\nCurrently flagged: PLATEAU, ${ins.activePeriod.startLabel}–${ins.activePeriod.endLabel} (${ins.activePeriod.length} weeks), still ongoing as of the latest logged week.`
      : `\nCurrently flagged: PLATEAU, ${ins.activePeriod.startLabel}–${ins.activePeriod.endLabel} (${ins.activePeriod.length} weeks). This specific stall has ENDED, but the flag is deliberately sticky and stays up until a NEW confirmed 2+ consecutive-week run of genuine movement is logged — a single good week (or a single flat week breaking up otherwise-moving weeks) is not enough on its own to clear it. Use the weeks logged since this period ended to judge whether a breakthrough looks like it's forming, but don't claim the flag has cleared unless the data above actually shows 2+ confirmed weeks of it.`;
  }

  return lines + activeNote;
}

// Pulls the JSON object out of a model response. Every AI feature in this app
// asks for "raw JSON, no preamble", and for a plain single-turn call that is
// what comes back — but it is a request, not a guarantee, and it stops being
// true the moment a server tool is in play: a web_search turn interleaves the
// model's own narration ("No published nutrition data for…", "Let me search
// for…") as extra text blocks alongside the JSON one, and analyseMealPhoto()
// joins ALL text blocks together before parsing. That is the v8.13 bug —
// "JSON Parse error: Unexpected identifier "No"" — see TECHNICAL.md §76.
//
// So: strip fences wherever they appear, then take the first balanced {…}
// object rather than assuming the whole string is JSON. Brace counting is
// string- and escape-aware, otherwise a brace inside a food name ("Chicken
// {special}") would end the object early. Returns null when there is no
// object at all, so callers can raise their own message instead of surfacing
// a raw JSON.parse error to the user.
export function extractJsonObject(rawText: string | null | undefined): Loose | null {
  if (!rawText) return null;
  const text = rawText.replace(/```json/gi, '').replace(/```/g, '');
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(text.slice(start, i + 1)); } catch (e) { return null; }
      }
    }
  }
  return null;
}

// ── Prior check-in history helpers ──────────────────────────────────────────
// Condenses a recommendation response into a compact kcal/protein/carbs
// progression string per path — used both for the prompt's prior-advice
// context and for the Accept-a-challenge "originally recommended X" note.
// Deliberately NOT the full goal objects — just enough for the LLM (or a
// future reader) to see what changed.
export function condenseBlocAdvicePlans(response: Loose): { sustainable: string; aggressive: string } {
  const condensePath = (path: Loose) => (path?.goals || [])
    .map((g: Loose) => `${g.kcal}kcal/${g.protein}p/${g.carbs}c/${g.steps || '?'}steps (${g.startDate}–${g.endDate})`)
    .join(' → ');
  return {
    sustainable: condensePath(response?.recommendations?.sustainable),
    aggressive:  condensePath(response?.recommendations?.aggressive),
  };
}

// Condenses a full state.blocAdvice-shaped object (response + storedAt +
// chosenPath + chosenAt + optional revisionInfo) into one prior-check-in
// history entry. If the response was itself the result of an accepted
// challenge (revisionInfo present), folds in what it replaced and why —
// a declined challenge leaves no trace here, since decline changes nothing
// about what "actually ended up standing".
export function condenseBlocAdviceEntry(stored: Loose): Loose | null {
  if (!stored || !stored.response) return null;
  const pr = stored.response;
  const plans = condenseBlocAdvicePlans(pr);
  const entry: Loose = {
    date: stored.storedAt,
    why: pr.primaryAction || pr.headline || '',
    sustainable: plans.sustainable,
    aggressive: plans.aggressive,
    chosenPath: stored.chosenPath || null,
    chosenAt: stored.chosenAt || null,
  };
  if (stored.revisionInfo) {
    entry.revisedFrom = stored.revisionInfo.originalSummary;
    entry.revisionReason = stored.revisionInfo.acknowledgment;
  }
  return entry;
}

// Renders one condensed history entry as a single prompt-ready line.
export function formatPriorAdviceEntry(entry: Loose, idx: number): string {
  let s = `Check-in ${idx + 1} (${entry.date}): `;
  if (entry.revisedFrom) {
    s += `Originally recommended — sustainable: ${entry.revisedFrom.sustainable || 'none'}; aggressive: ${entry.revisedFrom.aggressive || 'none'}. After a user challenge, revised to — sustainable: ${entry.sustainable || 'none'}; aggressive: ${entry.aggressive || 'none'} (reason: ${entry.revisionReason}).`;
  } else {
    s += `Recommended — sustainable: ${entry.sustainable || 'none'}; aggressive: ${entry.aggressive || 'none'}.`;
  }
  s += ` Why: ${entry.why}.`;
  if (entry.chosenPath) s += ` User chose the ${entry.chosenPath} plan${entry.chosenAt ? ' on ' + entry.chosenAt : ''}.`;
  return s;
}

// Builds the system + user prompt for the cycle-end review call, plus the
// ordered list of image content blocks (each preceded by its own text
// label, since the API has no per-image caption field) to append after it.
//
// `macro` is unused (the payload carries the name and dates); kept so the
// signature, and every call site, stays the same.
export function buildCycleReviewPrompt(_macro: Macrocycle, payload: Loose, beforeImages: CycleReviewImage[], afterImages: CycleReviewImage[]): { systemPrompt: string; userText: string; imageBlocks: Loose[] } {
  const weeklyLines = payload.weeklyAverages.map((w: Loose) =>
    `${w.label} (${w.bStart}–${w.bEnd}): avg weight ${w.avgWeight !== null ? w.avgWeight.toFixed(1) + ' lbs' : '—'}, avg kcal ${w.avgKcal ?? '—'}, avg protein ${w.avgProtein ?? '—'}g, avg carbs ${w.avgCarbs ?? '—'}g, avg steps ${w.avgSteps ?? '—'}`
  ).join('\n') || 'No weekly data logged this cycle.';

  const swingsLines = payload.weeklySwings.map((w: Loose) => {
    const f = (s: Loose, suf: string) => s.min === null ? '—' : (s.min === s.max ? `${s.min}${suf}` : `${s.min}${suf}/${s.max}${suf}`);
    return `${w.label}: weight swing ${f(w.weight, 'lbs')}, kcal-vs-target swing ${f(w.kcal, '')}, steps-vs-target swing ${f(w.steps, '')}, protein-vs-target swing ${f(w.protein, 'g')}`;
  }).join('\n') || 'No weekly swing data available.';

  const m = payload.measurements;
  const measLines = `Weight: ${m.startWeight ?? '—'} → ${m.endWeight ?? '—'} lbs (${m.totalWeightChange !== null ? (m.totalWeightChange > 0 ? '+' : '') + m.totalWeightChange : '—'} lbs)${m.targetWeight ? `, target was ${m.targetWeight} lbs (ended ${m.weightTargetDelta > 0 ? '+' : ''}${m.weightTargetDelta} lbs vs target)` : ''}
Waist: ${m.startWaist ?? '—'} → ${m.endWaist ?? '—'} in
Hip: ${m.startHip ?? '—'} → ${m.endHip ?? '—'} in`;

  const liftsLines = payload.bestLifts.length
    ? payload.bestLifts.map((l: Loose) => `${l.name}: ${l.startWeight} → ${l.endWeight} (+${l.pctIncrease}%)`).join('\n')
    : 'No exercises had enough logged data across the cycle to show progression.';

  const priorLines = payload.priorReviews.length
    ? payload.priorReviews.map((r: Loose) => `- ${r.name} (${r.goalType}, ${r.start}–${r.end}): compliance ${r.complianceScore}/10, bodyfat ${r.bodyfatDirection || 'unclear'}, ended ${r.weightTargetDelta !== null ? (r.weightTargetDelta > 0 ? '+' : '') + r.weightTargetDelta + ' lbs vs target' : 'no target set'}`).join('\n')
    : 'No prior reviewed cycles yet — this is the first.';

  const beforeCount = beforeImages.length;
  const afterCount  = afterImages.length;

  const systemPrompt = `You are BLOC, a personal training and nutrition coach embedded in a fitness tracking app, writing this user's end-of-cycle review. Speak in second person, be direct and specific, and reference actual numbers from the data below rather than being vague.

The user is heavily tattooed — if progress photos are provided, judge visual body composition change by silhouette, muscle definition, and waist/torso shape, and explicitly look past/ignore tattoos rather than mistaking skin art for shadow, discoloration, or other visual artifacts.

${beforeCount || afterCount ? `${beforeCount} before photo(s) and ${afterCount} after photo(s) are attached below (labelled). Use them only to inform the bodyfat-change estimate and narrative — never to redo any of the numeric/deterministic figures already given to you.` : 'No before/after photos were provided this cycle — base the bodyfat-change estimate on weight, measurements, and training data only, and say so plainly rather than guessing from nothing.'}

Respond with ONLY a raw JSON object, no markdown fences, no preamble. Schema:
{
  "complianceScore": number (0-10, how consistently the user stayed on track this cycle — nutrition/step/training adherence),
  "bodyfatEstimate": { "direction": "loss"|"gain"|"no significant change"|"unclear", "note": "1-2 sentence explanation, cross-referencing weight/measurement trend against any visual estimate" },
  "headline": "one-sentence verdict on the cycle",
  "narrative": "3-5 paragraph full review — how far off the weight target they were, whether measurements/photos support genuine fat loss vs just scale movement, training performance, and whether the cycle ran too long (e.g. stalled in a deficit near the end) or was well-timed",
  "highlights": ["short bullet", "..."],
  "improvements": ["short bullet", "..."],
  "stickingPoints": "1-2 sentences on the main sticking point(s), or empty string if none",
  "ranTooLong": boolean,
  "ranTooLongNote": "1 sentence if ranTooLong is true, else empty string"
}

${(() => {
    const fd = payload.finalDaySubstitutions || {};
    const parts: string[] = [];
    if (fd.kcal !== undefined) parts.push(`kcal/protein/carbs — assume ~${fd.kcal} kcal, ${fd.protein}g protein, ${fd.carbs}g carbs`);
    if (fd.steps !== undefined) parts.push(`steps — assume ~${fd.steps.toLocaleString()}`);
    if (fd.weight !== undefined) parts.push(`weight — assume ~${fd.weight} lbs`);
    return parts.length
      ? `Note: this cycle's final day had not yet logged the following (the WEEKLY AVERAGES/MEASUREMENTS below already exclude it rather than counting it as zero). Assume it matched this week's average instead of treating it as a miss or a data gap: ${parts.join('; ')}.`
      : '';
  })()}`;

  const userText = `CYCLE: ${payload.macroName} (${payload.goalType}), ${payload.start} to ${payload.end}

WEEKLY AVERAGES
${weeklyLines}

WEEKLY SWINGS (min/max)
${swingsLines}

MEASUREMENTS
${measLines}

BEST PROGRESSED LIFTS (top set weight, first → last logged week)
${liftsLines}

PRIOR REVIEWED CYCLES (most recent first)
${priorLines}

Write this cycle's review per the schema above.`;

  const imageBlocks: Loose[] = [];
  beforeImages.forEach((img, i) => {
    imageBlocks.push({ type: 'text', text: `BEFORE PHOTO ${i + 1}:` });
    imageBlocks.push({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.base64 } });
  });
  afterImages.forEach((img, i) => {
    imageBlocks.push({ type: 'text', text: `AFTER PHOTO ${i + 1}:` });
    imageBlocks.push({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.base64 } });
  });

  return { systemPrompt, userText, imageBlocks };
}
