// ═══════════════════════════════════════════════════════════════════════
// The cycle review's deterministic inputs: best lifts, weekly swings,
// measurements, prior reviews, and the payload that carries them
// (TECHNICAL §125). buildCycleReviewPrompt (prompts.ts) turns
// the payload into the prompt.
//
// Moved from index.html in v8.35, UNCHANGED apart from their inputs, behind
// same-named shims: the state as `s`, "today" as `ctx` (§123).
// ═══════════════════════════════════════════════════════════════════════

import type { BlocState, Loose, Macrocycle } from './state.ts';
import { type EngineContext, getMacroEndDate, toLocalDateStr } from './dates.ts';
import { getWeekSets, getMacroSessionDayKeys, getMacroEffectiveMesoCount, isMesoMicroValid } from './progression.ts';
import { buildDayMap } from './tdee.ts';
import { getGoalForDate } from './cycles.ts';
import { computeWeeklyInsights } from './insights.ts';

// Best 5 exercises by % increase in top logged set weight from the first
// week they were logged in this macro to the last — a simple, deterministic
// stand-in for "most progressed lift" that only needs trainLogs/exercises,
// both already keyed by macroId/week/dayKey/exerciseId (see getSessionVolume
// for the same key-construction pattern). Iterates every real session slot
// via getMacroSessionDayKeys/getMacroEffectiveMesoCount so extension weeks
// and microcycles are included automatically.
export function computeCycleBestLifts(s: BlocState, macro: Macrocycle): Loose[] {
  const dayKeys = getMacroSessionDayKeys(macro);
  const totalWeeks = getMacroEffectiveMesoCount(macro);
  const byExercise: Record<string, Loose> = {};
  for (let w = 1; w <= totalWeeks; w++) {
    dayKeys.forEach(dayKey => {
      if (dayKey.endsWith('m2') && !isMesoMicroValid(macro, w, 2)) return;
      const exercises = (s.exercises as Record<string, Loose[]>)[macro.id + '_1_' + dayKey] || [];
      const key = macro.id + '_' + w + '_' + dayKey;
      exercises.forEach(ex => {
        const sets = getWeekSets(ex, w, macro.weeks as number);
        let bestThisSession = 0;
        for (let i = 0; i < sets; i++) {
          const log = (s.trainLogs as Record<string, Loose>)[key + '_' + ex.id + '_' + i];
          if (log && log.weight && log.reps && parseFloat(log.weight) > bestThisSession) {
            bestThisSession = parseFloat(log.weight);
          }
        }
        if (bestThisSession > 0) {
          if (!byExercise[ex.id]) {
            byExercise[ex.id] = { name: ex.name, firstWeek: w, firstWeight: bestThisSession, lastWeek: w, lastWeight: bestThisSession };
          } else {
            const rec = byExercise[ex.id];
            if (w < rec.firstWeek) { rec.firstWeek = w; rec.firstWeight = bestThisSession; }
            if (w > rec.lastWeek)  { rec.lastWeek  = w; rec.lastWeight  = bestThisSession; }
          }
        }
      });
    });
  }
  return Object.values(byExercise)
    .filter(r => r.lastWeek > r.firstWeek && r.firstWeight > 0)
    .map(r => ({
      name: r.name,
      startWeight: r.firstWeight,
      endWeight: r.lastWeight,
      pctIncrease: Math.round(((r.lastWeight - r.firstWeight) / r.firstWeight) * 1000) / 10,
    }))
    .filter(r => r.pctIncrease > 0)
    .sort((a, b) => b.pctIncrease - a.pctIncrease)
    .slice(0, 5);
}

// Per-week min/max swing (weight) and actual-vs-target deviation swing
// (kcal/steps/protein) across the whole cycle — same computation as
// buildWeeklySwingsCardHTML's local weekBuckets, factored out as plain data
// (rather than reusing that function directly, since it renders straight to
// HTML) so the review payload and the live Progress card can never drift
// out of sync in their swing definitions.
export function computeCycleWeeklySwings(s: BlocState, ctx: EngineContext, macro: Macrocycle): Loose[] {
  const dayMap = buildDayMap(s);
  const allDates = Object.keys(dayMap).sort();
  const anchor = macro.start || allDates[0];
  const anchorMs = new Date(anchor + 'T00:00:00').getTime();
  const rangeEndStr = getMacroEndDate(macro, ctx);
  const rangeEndMs = new Date(rangeEndStr + 'T00:00:00').getTime();

  function swingOf(values: Loose[]) {
    if (values.length < 2) return { min: null, max: null };
    const diffs: number[] = [];
    for (let i = 0; i < values.length - 1; i++) diffs.push(values[i+1] - values[i]);
    return { min: Math.min(...diffs), max: Math.max(...diffs) };
  }
  function devSwingOf(dates: string[], field: string) {
    const diffs: number[] = [];
    dates.forEach(d => {
      const g = getGoalForDate(s, d, macro.id);
      const target: Loose = g ? g[field] : null;
      const actual: Loose = dayMap[d] ? (dayMap[d] as Loose)[field] : null;
      if (target !== null && target !== undefined && actual !== null && actual !== undefined) {
        diffs.push(actual - target);
      }
    });
    if (diffs.length < 1) return { min: null, max: null };
    return { min: Math.min(...diffs), max: Math.max(...diffs) };
  }

  const weekBuckets: Loose[] = [];
  let cur = new Date(anchorMs);
  let wn = 1;
  while (cur.getTime() <= rangeEndMs) {
    const bStart = toLocalDateStr(cur);
    const bEndDate = new Date(cur); bEndDate.setDate(bEndDate.getDate() + 6);
    const bEnd = toLocalDateStr(bEndDate);
    const bDates = allDates.filter(d => d >= bStart && d <= bEnd && dayMap[d]);
    if (bDates.length > 0) {
      const wD = bDates.filter(d => dayMap[d].weight !== null);
      const sD = bDates.filter(d => dayMap[d].steps  !== null);
      const nD = bDates.filter(d => dayMap[d].hasNutr);
      weekBuckets.push({
        label: 'W' + wn,
        weight:  swingOf(wD.map(d => dayMap[d].weight)),
        kcal:    devSwingOf(nD, 'kcal'),
        steps:   devSwingOf(sD, 'steps'),
        protein: devSwingOf(nD, 'protein'),
      });
    }
    wn++;
    cur = new Date(cur); cur.setDate(cur.getDate() + 7);
  }
  return weekBuckets;
}

// Start/end weight and waist/hip measurements actually logged within the
// cycle's own date range (macro.start through its effective end date).
export function computeCycleMeasurements(s: BlocState, ctx: EngineContext, macro: Macrocycle): Loose {
  const startStr = macro.start;
  const endStr = getMacroEndDate(macro, ctx);
  const bodyLogs = [...(s.bodyLogs || [])].sort((a, b) => a.date.localeCompare(b.date));
  const inRange = (l: Loose) => l.date >= (startStr as string) && l.date <= endStr;
  const weightLogs = bodyLogs.filter(l => l.weight !== null && l.weight !== undefined && inRange(l));
  const waistLogs  = bodyLogs.filter(l => l.waist  !== null && l.waist  !== undefined && inRange(l));
  const hipLogs    = bodyLogs.filter(l => l.hip    !== null && l.hip    !== undefined && inRange(l));
  const startWeight = weightLogs.length ? weightLogs[0].weight : null;
  const endWeight    = weightLogs.length ? weightLogs[weightLogs.length - 1].weight : null;
  return {
    startWeight, endWeight,
    totalWeightChange: (startWeight !== null && endWeight !== null) ? parseFloat((endWeight - startWeight).toFixed(1)) : null,
    startWaist: waistLogs.length ? waistLogs[0].waist : null,
    endWaist:   waistLogs.length ? waistLogs[waistLogs.length - 1].waist : null,
    startHip:   hipLogs.length ? hipLogs[0].hip : null,
    endHip:     hipLogs.length ? hipLogs[hipLogs.length - 1].hip : null,
    targetWeight: macro.targetBw || null,
    weightTargetDelta: (endWeight !== null && macro.targetBw) ? parseFloat((endWeight - (macro.targetBw as number)).toFixed(1)) : null,
  };
}

// Compact snapshots of the two most recently reviewed OTHER cycles, most
// recent first — sent with every review call so BLOC can compare against
// its own prior verdicts ("always include last 2 reviews in each call").
export function getPriorCycleReviews(s: BlocState, ctx: EngineContext, excludeMacroId: string): Loose[] {
  return ((s.macrocycles || []) as Loose[])
    .filter(m => m.id !== excludeMacroId && m.review)
    .sort((a, b) => getMacroEndDate(b, ctx).localeCompare(getMacroEndDate(a, ctx)))
    .slice(0, 2)
    .map(m => ({
      name: m.name, goalType: m.goalType,
      start: m.start, end: getMacroEndDate(m, ctx),
      complianceScore: m.review.complianceScore,
      bodyfatDirection: m.review.bodyfatEstimate ? m.review.bodyfatEstimate.direction : null,
      weightTargetDelta: m.review.weightTargetDelta,
      highlights: m.review.highlights, improvements: m.review.improvements,
    }));
}

// Assembles every deterministic input for the review call — weekly avgs
// (reuses computeWeeklyInsights, the same function the mid-cycle check-in
// prompt uses), weekly swings, measurements, best lifts, and prior reviews.
// Pure computation, no DOM/API — kept separate from buildCycleReviewPrompt()
// so the payload can be inspected/tested independently of prompt wording.
export function computeCycleReviewPayload(s: BlocState, ctx: EngineContext, macro: Macrocycle): Loose {
  const ins = computeWeeklyInsights(s, ctx, macro);
  const todayStr = ctx.today;
  const endStr = getMacroEndDate(macro, ctx);
  const dayMap = buildDayMap(s);

  // On the cycle's actual final day, one or more of kcal/protein/carbs/
  // steps/weight are often genuinely not yet logged (steps especially —
  // always the last thing logged in a day), even though the day is "done"
  // in every other sense. Rather than silently treating any missing metric
  // as a miss, substitute this week's average-so-far (the last bucket in
  // weeklyAverages already covers exactly this final week) and tell the
  // LLM explicitly which figures were substituted and what value was used
  // (dev 2026-09-15, item 1b — generalized from the original steps-only
  // handling to cover kcal/macros/steps/weight alike).
  const finalDaySubstitutions: Loose = {};
  if (todayStr === endStr) {
    const finalDayEntry = dayMap[endStr] || null;
    const finalWeekBucket = ins && ins.weekBuckets && ins.weekBuckets.length ? ins.weekBuckets[ins.weekBuckets.length - 1] : null;
    if (finalWeekBucket) {
      const missingNutr   = !finalDayEntry || !finalDayEntry.hasNutr;
      const missingSteps  = !finalDayEntry || finalDayEntry.steps === null || finalDayEntry.steps === undefined;
      const missingWeight = !finalDayEntry || finalDayEntry.weight === null || finalDayEntry.weight === undefined;
      if (missingNutr && finalWeekBucket.avgKcal !== null) {
        finalDaySubstitutions.kcal = finalWeekBucket.avgKcal;
        finalDaySubstitutions.protein = finalWeekBucket.avgProtein;
        finalDaySubstitutions.carbs = finalWeekBucket.avgCarbs;
      }
      if (missingSteps && finalWeekBucket.avgSteps !== null) finalDaySubstitutions.steps = finalWeekBucket.avgSteps;
      if (missingWeight && finalWeekBucket.avgWeight !== null) finalDaySubstitutions.weight = parseFloat(finalWeekBucket.avgWeight.toFixed(1));
    }
  }

  return {
    macroName: macro.name, goalType: macro.goalType || 'loss',
    start: macro.start, end: endStr,
    weeklyAverages: ins ? ins.weekBuckets : [],
    weeklySwings: computeCycleWeeklySwings(s, ctx, macro),
    measurements: computeCycleMeasurements(s, ctx, macro),
    bestLifts: computeCycleBestLifts(s, macro),
    priorReviews: getPriorCycleReviews(s, ctx, macro.id),
    finalDaySubstitutions,
  };
}

