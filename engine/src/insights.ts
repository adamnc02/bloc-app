// ═══════════════════════════════════════════════════════════════════════
// Weekly insights, the safety floor, the maintenance recalibration and the
// check-in's state (deep dive §1b, §10 step 4; TECHNICAL §125).
//
// Moved from index.html in v8.35, UNCHANGED apart from their inputs, behind
// same-named shims: the state as `s`, "today" as `ctx` (§123). Every AI
// prompt reads these, so the prompts' text is pinned by the golden file (§118).
// ═══════════════════════════════════════════════════════════════════════

import type { BlocState, Loose, Macrocycle } from './state.ts';
import { type EngineContext, getMacroEndDate, getMondayAfter, getSundayAfterWeeks, toLocalDateStr } from './dates.ts';
import { buildSignalPeriods } from './prompts.ts';
import { buildDayMap, calcDynamicTDEE } from './tdee.ts';

// Computes per-week stats for the resolved macrocycle, detects caloric drift
// and plateau/undereating signals, and produces a goalType-branched narrative.
// Pure computation — no DOM writes. Returns null if insufficient data.
//
// Anchor-slide logic (loss cycles only):
//   Weeks 1–2 of a cut often show inflated weight drops (glycogen / digestive
//   clearance). If either of the first two weeks shows a delta below −2% of
//   that week's average bodyweight, those weeks are considered anomalously
//   fast and the baseline slides forward (capped at weeks 3–4). On gain and
//   maintenance cycles the baseline is always anchored at week 1.
//
// A "valid week" for drift comparison requires ≥ 4 days with nutrition logged
// in that 7-day bucket (same threshold as the drift minimum-data guard).
//
// Plateau definition (loss cycles): ≤ 0.3 lbs average weekly weight delta
// for 2 or more consecutive complete buckets.
export function computeWeeklyInsights(s: BlocState, ctx: EngineContext, macro: Macrocycle | null | undefined): Loose {
  if (!macro) return null;
  const goalType = macro.goalType || 'loss';
  const isLoss = goalType === 'loss';
  const isGain = goalType === 'gain';
  const isMaint = goalType === 'maintenance';

  // Reuse the same bucket builder as buildWeeklySummaryCardHTML
  const dayMap = buildDayMap(s);
  const allDates = Object.keys(dayMap).sort();
  if (allDates.length < 2) return null;

  const todayStr = ctx.today;
  const macroEndStr = getMacroEndDate(macro, ctx);
  const anchor = macro.start || allDates[0];
  const anchorMs = new Date(anchor + 'T00:00:00').getTime();
  const rangeEndStr = macroEndStr < todayStr ? macroEndStr : todayStr;
  const rangeEndMs = new Date(rangeEndStr + 'T00:00:00').getTime();

  const weekBuckets: Loose[] = [];
  let cur = new Date(anchorMs);
  let wn = 1;
  let prevAvgWeight: number | null = null;
  while (cur.getTime() <= rangeEndMs) {
    const bStart = toLocalDateStr(cur);
    const bEndDate = new Date(cur); bEndDate.setDate(bEndDate.getDate() + 6); const bEnd = toLocalDateStr(bEndDate);
    // Cap to today — a bucket spanning the current in-progress week must
    // never average in future-dated entries (e.g. meals pre-logged later
    // this week). Without this cap, a partial week's avgKcal/avgProtein
    // gets diluted by days that haven't happened yet, which then feeds a
    // distorted "recent intake" figure straight into the AI advice prompt.
    const bDates = allDates.filter(d => d >= bStart && d <= bEnd && d <= todayStr);
    if (bDates.length > 0) {
      const wD = bDates.filter(d => dayMap[d].weight !== null);
      const nD = bDates.filter(d => dayMap[d].hasNutr);
      const sD = bDates.filter(d => dayMap[d].steps !== null);
      const avgWeight = wD.length ? wD.reduce((s,d) => s + (dayMap[d].weight as number), 0) / wD.length : null;
      const avgKcal   = nD.length ? Math.round(nD.reduce((s,d) => s + dayMap[d].kcal, 0) / nD.length) : null;
      const avgProtein= nD.length ? Math.round(nD.reduce((s,d) => s + dayMap[d].protein, 0) / nD.length) : null;
      const avgCarbs  = nD.length ? Math.round(nD.reduce((s,d) => s + (dayMap[d].carbs || 0), 0) / nD.length) : null;
      const avgSteps  = sD.length ? Math.round(sD.reduce((s,d) => s + (dayMap[d].steps as number), 0) / sD.length) : null;
      const delta = (avgWeight !== null && prevAvgWeight !== null)
        ? parseFloat((avgWeight - prevAvgWeight).toFixed(2)) : null;
      if (avgWeight !== null) prevAvgWeight = avgWeight;
      weekBuckets.push({
        weekNum: wn, label: 'W' + wn,
        bStart, bEnd,
        avgWeight, delta, avgKcal, avgProtein, avgCarbs, avgSteps,
        nutrDayCount: nD.length, weightDayCount: wD.length, stepsDayCount: sD.length,
      });
    }
    cur = new Date(cur); cur.setDate(cur.getDate() + 7);
    wn++;
  }
  if (weekBuckets.length < 2) return null;

  // ── TDEE estimate ──
  const tdeeResult = calcDynamicTDEE(s, ctx);
  const estimatedTDEE: Loose = tdeeResult ? tdeeResult.tdee : null;

  // ── Baseline anchor selection (loss cycles only) ──
  // Find the first valid week bucket (≥4 nutr days) for the baseline.
  // If weeks 1–2 show weight drops faster than −2% bodyweight/week,
  // slide the baseline forward (max anchor = weeks 3–4).
  function isAnomalouslyFast(bucket: Loose) {
    if (!isLoss) return false;
    if (bucket.delta === null || bucket.avgWeight === null) return false;
    const pct = bucket.delta / bucket.avgWeight; // negative = loss
    return pct < -0.02; // dropping faster than 2% bodyweight/week
  }

  let baselineIdx = -1; // index into weekBuckets
  // For loss: try wk1, then wk2, cap at wk3 (index 2)
  // For gain/maintenance: always use wk1
  if (isLoss) {
    for (let i = 0; i <= Math.min(2, weekBuckets.length - 2); i++) {
      const b = weekBuckets[i];
      if (b.nutrDayCount >= 4 && !isAnomalouslyFast(b)) {
        baselineIdx = i;
        break;
      }
    }
    // If all early weeks are anomalous or thin, fall back to first valid week ≤ idx 2
    if (baselineIdx === -1) {
      for (let i = 0; i <= Math.min(2, weekBuckets.length - 2); i++) {
        if (weekBuckets[i].nutrDayCount >= 4) { baselineIdx = i; break; }
      }
    }
  } else {
    // Gain/maintenance — anchor on first week with ≥4 nutr days
    baselineIdx = weekBuckets.findIndex(b => b.nutrDayCount >= 4);
  }

  // Need at least one comparison period after the baseline
  if (baselineIdx === -1 || baselineIdx >= weekBuckets.length - 1) {
    return { weekBuckets, estimatedTDEE, insufficientData: true };
  }

  // ── Baseline and recent windows ──
  // Baseline: the anchor week itself + the next one (2-week window)
  const baselineWeeks = weekBuckets.slice(baselineIdx, baselineIdx + 2).filter(b => b.nutrDayCount >= 4);
  // Recent: the last 2 complete weeks (≥4 nutr days) after the baseline
  const afterBaseline = weekBuckets.slice(baselineIdx + 2).filter(b => b.nutrDayCount >= 4);
  if (!baselineWeeks.length || !afterBaseline.length) {
    return { weekBuckets, estimatedTDEE, insufficientData: true };
  }
  const recentWeeks = afterBaseline.slice(-2);

  const avgKcalBaseline = baselineWeeks.reduce((s,b) => s + (b.avgKcal || 0), 0) / baselineWeeks.length;
  const avgKcalRecent   = recentWeeks.reduce((s,b)   => s + (b.avgKcal || 0), 0) / recentWeeks.length;
  const avgProteinRecent= recentWeeks.reduce((s,b)   => s + (b.avgProtein || 0), 0) / recentWeeks.length;
  const caloricDrift    = Math.round(avgKcalRecent - avgKcalBaseline); // +ve = eating more

  // Deficit/surplus vs TDEE (using recent kcal avg)
  const deficitOrSurplus: Loose = estimatedTDEE ? Math.round(avgKcalRecent - estimatedTDEE) : null; // -ve = deficit

  // ── Plateau detection (loss only) — ≤0.5 lbs/wk for 2+ consecutive buckets ──
  // 0.5 lbs is the right threshold: 0.3 was too tight and would break a real
  // 3-week plateau if a single week came in at e.g. -0.34 lbs. Weekly average
  // weight has enough noise (water, glycogen, digestive load) that anything
  // below 0.5 lbs/week should be treated as effectively flat for a loss cycle.
  // NOTE: this `plateauWeeks` (= the longest flat run anywhere since baseline)
  // is kept exactly as before because it's still the correct metric for the
  // completed-cycle rollup and getSustainableWeightRange() — "did this cycle
  // ever demonstrate a genuine N-week stable stretch" is a whole-cycle
  // question, not a "what's true right now" one. The UI/LLM "is there
  // currently a flagged plateau" question uses the separate sticky
  // activePeriod logic below instead — see buildSignalPeriods().
  let plateauWeeks = 0, maxPlateauRun = 0, curRun = 0;
  for (const b of weekBuckets.slice(baselineIdx + 1)) {
    if (b.delta !== null && Math.abs(b.delta) <= 0.5) {
      curRun++;
      if (curRun > maxPlateauRun) maxPlateauRun = curRun;
    } else { curRun = 0; }
  }
  plateauWeeks = maxPlateauRun;

  // ── Sticky flat/moving periods ──────────────────────────────────────────
  // Groups weeks since baseline into contiguous "flat" (plateau) vs "moving"
  // runs. The UI/LLM-facing "active" period is STICKY: once a plateau is
  // confirmed (2+ consecutive flat weeks), it stays the active/flagged
  // period until a NEW confirmed (2+ consecutive week) run of movement
  // appears. A single good week — or a single flat week breaking up a run
  // of otherwise-moving weeks — is not enough to flip the flag on or off;
  // that's exactly the "3-week stall, then 1 good week, then flat again"
  // case that shouldn't flicker the badge. See buildSignalPeriods().
  const { periods: signalPeriods, activePeriod } = buildSignalPeriods(weekBuckets, baselineIdx);
  const stuckSignal = !!activePeriod && activePeriod.type === 'flat';
  const activePeriodWeeks = activePeriod ? activePeriod.length : 0;
  const activePeriodIsOngoing = !!activePeriod && activePeriod === signalPeriods[signalPeriods.length - 1];
  // Deficit specifically DURING the active flagged period (not blended with
  // weeks outside it, which is what the old plateauWeeks-based check did) —
  // this is what actually determines whether that particular stall looked
  // like real adaptation or was just calorie creep at the time.
  const avgKcalDuringActive = (activePeriod && activePeriod.avgKcalDuring !== null) ? activePeriod.avgKcalDuring : avgKcalRecent;
  const deficitDuringActive: Loose = estimatedTDEE ? Math.round(avgKcalDuringActive - estimatedTDEE) : deficitOrSurplus;
  const hasPlateauSignal = isLoss && stuckSignal;

  // ── Maintenance: weight stability check ──
  let maintVariance = null;
  if (isMaint && macro.targetBw) {
    const wksWithWeight = weekBuckets.filter(b => b.avgWeight !== null);
    if (wksWithWeight.length >= 2) {
      const weights: number[] = wksWithWeight.map(b => b.avgWeight);
      maintVariance = parseFloat((Math.max(...weights) - Math.min(...weights)).toFixed(1));
    }
  }

  // ── Build narrative (goalType-branched) ──
  let signal, headline, detail;

  if (isLoss) {
    // "Weeks since the flagged period ended" — 0 if it's still the latest
    // (ongoing) period, otherwise how many confirmed/unconfirmed weeks have
    // passed since. Used to make the headline honest about timing instead of
    // implying "this is happening right now" for a stall that's actually over.
    const weeksSincePeriodEnded = (!activePeriodIsOngoing && activePeriod)
      ? signalPeriods.slice(signalPeriods.indexOf(activePeriod) + 1).reduce((s, p) => s + p.length, 0)
      : 0;
    const agoNote = activePeriodIsOngoing ? '' : ` (${activePeriod.startLabel}–${activePeriod.endLabel}, ${weeksSincePeriodEnded} week${weeksSincePeriodEnded === 1 ? '' : 's'} ago — no confirmed 2+ week breakthrough since)`;

    if (hasPlateauSignal && deficitDuringActive !== null && deficitDuringActive > -200) {
      // Plateau + deficit had narrowed to near-zero during that period — calorie creep is the cause
      signal = 'plateau-creep';
      headline = caloricDrift > 100
        ? `Intake has drifted up ~${Math.abs(caloricDrift)} kcal since your baseline`
        : `Your deficit had narrowed — weight was flat for ${activePeriodWeeks} weeks${agoNote}`;
      detail = estimatedTDEE
        ? `Your estimated TDEE is ~${estimatedTDEE.toLocaleString()} kcal/day. During that flat stretch you were averaging ${avgKcalDuringActive.toLocaleString()} kcal — only a ~${Math.abs(deficitDuringActive)} kcal deficit. ${caloricDrift > 100 ? `This compares to ~${Math.round(avgKcalBaseline).toLocaleString()} kcal/day in your baseline weeks.` : ''} Right now you're averaging ${Math.round(avgKcalRecent).toLocaleString()} kcal/day.`
        : `You averaged ${avgKcalDuringActive.toLocaleString()} kcal/day during that flat stretch vs ~${Math.round(avgKcalBaseline).toLocaleString()} kcal/day at your baseline — a drift of ${caloricDrift > 0 ? '+' : ''}${caloricDrift} kcal.`;
    } else if (hasPlateauSignal) {
      // Plateau but deficit still looked real during that period — adaptation or logging gap
      signal = 'plateau-adaptation';
      headline = `Weight was flat for ${activePeriodWeeks} weeks despite a deficit${agoNote}`;
      detail = estimatedTDEE
        ? `During that flat stretch you were averaging ${avgKcalDuringActive.toLocaleString()} kcal/day — a ~${Math.abs(deficitDuringActive).toLocaleString()} kcal deficit vs your estimated TDEE of ${estimatedTDEE.toLocaleString()} kcal. Flat weight despite a real deficit can indicate metabolic adaptation, water retention masking fat loss, or logging gaps. Right now you're averaging ${Math.round(avgKcalRecent).toLocaleString()} kcal/day — this flag will clear once a new 2+ week run of genuine loss is confirmed.`
        : `Weight was flat for ${activePeriodWeeks} weeks. This can reflect metabolic adaptation, water retention, or calorie logging gaps.`;
    } else if (caloricDrift > 150) {
      // Drift detected but not yet a confirmed plateau
      signal = 'drift-warning';
      headline = `Intake has crept up ~${Math.abs(caloricDrift)} kcal from your baseline`;
      detail = `You're averaging ${Math.round(avgKcalRecent).toLocaleString()} kcal/day recently vs ~${Math.round(avgKcalBaseline).toLocaleString()} kcal at your baseline${estimatedTDEE ? ` (est. TDEE ~${estimatedTDEE.toLocaleString()} kcal)` : ''}. No plateau yet — but this trend typically leads to one within 1–2 weeks if intake continues rising.`;
    } else {
      signal = 'on-track';
      headline = 'Deficit looks consistent';
      detail = `You're averaging ${Math.round(avgKcalRecent).toLocaleString()} kcal/day${estimatedTDEE ? ` — a ~${Math.abs(deficitOrSurplus).toLocaleString()} kcal deficit vs estimated TDEE of ${estimatedTDEE.toLocaleString()} kcal` : ''}. Intake drift from baseline is minimal (${caloricDrift > 0 ? '+' : ''}${caloricDrift} kcal).`;
    }

  } else if (isGain) {
    const surplusOk = deficitOrSurplus !== null && deficitOrSurplus >= 150 && deficitOrSurplus <= 500;
    void surplusOk; // computed and never read, in index.html too
    const weightRising = recentWeeks.some(b => b.delta !== null && b.delta > 0.1);
    const weightStuck  = stuckSignal;
    if (deficitOrSurplus !== null && deficitOrSurplus < 0) {
      signal = 'gain-deficit';
      headline = `You're eating below TDEE on a gain cycle`;
      detail = `Your recent avg intake is ${Math.round(avgKcalRecent).toLocaleString()} kcal/day — ${Math.abs(deficitOrSurplus).toLocaleString()} kcal below your estimated TDEE of ${estimatedTDEE ? estimatedTDEE.toLocaleString() : '?'} kcal. A small surplus of ~200–300 kcal above TDEE is needed to support lean muscle gain.`;
    } else if (weightStuck && deficitOrSurplus !== null && deficitOrSurplus < 200) {
      signal = 'gain-undereating';
      headline = `Weight is flat — surplus may be too small`;
      detail = `Weight has been flat for ${activePeriodWeeks} weeks${activePeriodIsOngoing ? '' : ' (' + activePeriod.startLabel + '–' + activePeriod.endLabel + ')'}. Your avg intake of ${Math.round(avgKcalRecent).toLocaleString()} kcal yields only a ~${deficitOrSurplus} kcal surplus — likely not enough for consistent lean gain. Aim for 200–300 kcal above TDEE.`;
    } else if (deficitOrSurplus !== null && deficitOrSurplus > 500) {
      signal = 'gain-excess';
      headline = `Surplus may be larger than needed for lean gain`;
      detail = `You're averaging ${Math.round(avgKcalRecent).toLocaleString()} kcal/day — ~${deficitOrSurplus.toLocaleString()} kcal above estimated TDEE. Lean gain typically only requires ~200–300 kcal surplus. A larger surplus tends to increase fat accumulation without proportionally more muscle.`;
    } else {
      signal = 'on-track';
      headline = 'Intake looks good for lean gain';
      detail = `You're averaging ${Math.round(avgKcalRecent).toLocaleString()} kcal/day${deficitOrSurplus !== null ? ` — a ~${deficitOrSurplus} kcal surplus vs estimated TDEE` : ''}. ${weightRising ? 'Weight is trending upward, consistent with lean gain.' : 'Keep monitoring weight weekly to confirm the surplus is sufficient.'}`;
    }

  } else {
    // Maintenance
    if (maintVariance !== null && maintVariance > 3) {
      signal = 'maint-unstable';
      headline = `Weight varying ${maintVariance} lbs — more than expected for maintenance`;
      detail = `Maintenance targets ±1–2 lbs variance around goal weight. A ${maintVariance} lb range may indicate inconsistent intake${macro.targetBw ? ` relative to your ${macro.targetBw} lbs target` : ''}. Check if calorie intake is fluctuating significantly week-to-week.`;
    } else if (maintVariance !== null) {
      signal = 'maint-stable';
      headline = `Weight is stable — maintenance on track`;
      detail = `Weight range across logged weeks is ${maintVariance} lbs${macro.targetBw ? ` around your ${macro.targetBw} lbs target` : ''}. That's within the expected variance for maintenance. Focus on keeping training performance steady.`;
    } else {
      signal = 'maint-nodata';
      headline = 'Log more weigh-ins to track stability';
      detail = 'Maintenance insights need at least 2 weeks of body weight data to detect variance trends.';
    }
  }

  return {
    weekBuckets,
    estimatedTDEE,
    avgKcalBaseline: Math.round(avgKcalBaseline),
    avgKcalRecent:   Math.round(avgKcalRecent),
    avgProteinRecent:Math.round(avgProteinRecent),
    caloricDrift,
    deficitOrSurplus,
    plateauWeeks,          // longest flat run anywhere since baseline (whole-cycle max — used by the rollup/getSustainableWeightRange, NOT the sticky UI signal)
    signalPeriods,          // full chronological list of flat/moving periods since baseline, for LLM context
    activePeriod,           // the sticky "currently flagged" period (null if none confirmed yet)
    activePeriodWeeks,      // length of activePeriod, or 0
    activePeriodIsOngoing,  // true if activePeriod is also the most recent period (i.e. still happening now)
    baselineWeekLabel: weekBuckets[baselineIdx] ? weekBuckets[baselineIdx].label : 'W1',
    maintVariance,
    signal, headline, detail,
    insufficientData: false,
  };
}

// ── Safety floor calculation ─────────────────────────────────────────────────
// Returns the minimum safe kcal/day for aggressive recommendations.
// Primary method: log-based BMR (from calcDynamicTDEE()) × 0.80.
//   The log-based BMR is derived from actual weight-change + calorie data,
//   making it more accurate than Mifflin-St Jeor for someone actively tracking.
// Fallback (no log-based TDEE): best single week with ≥1 lb loss, avgKcal − 175.
// Hard minimum: 1,400 kcal if no loss weeks exist yet.
export function computeSafetyFloor(s: BlocState, ctx: EngineContext, macro: Macrocycle | null | undefined): number {
  // Primary: log-based BMR × 0.80
  const dynResult = calcDynamicTDEE(s, ctx);
  if (dynResult && dynResult.bmr && dynResult.bmr > 800) {
    return Math.round(dynResult.bmr * 0.80);
  }
  // Fallback: best single loss week avgKcal − 175
  const ins = computeWeeklyInsights(s, ctx, macro);
  if (ins && !ins.insufficientData && ins.weekBuckets) {
    const bestLossWeek = ins.weekBuckets
      .filter((b: Loose) => b.delta !== null && b.delta <= -1.0 && b.avgKcal)
      .sort((a: Loose, b: Loose) => a.delta - b.delta)[0];
    if (bestLossWeek) return Math.max(1400, bestLossWeek.avgKcal - 175);
  }
  return 1400;
}

// ── Maintenance TDEE-discrepancy recalibration (Phase 3) ───────────────────
// Distinct from calcTrendBasedTDEE()'s whole-history median, which is
// deliberately slow-moving — this is a locally-scoped check specifically
// for "my body is doing something different RIGHT NOW, mid-bridge," which
// the global figure won't catch quickly by design. Only fires for the
// CURRENTLY ACTIVE maintenance macro — recalibrating a past cycle's
// already-finished goals wouldn't mean anything.
//
// Trigger: a genuine directional weight trend over the last 3 qualifying
// weeks (not just variance/noise — same ±0.5 lb/week stability threshold
// used elsewhere), AND the resulting locally-implied TDEE meaningfully
// disagrees (>150 kcal or >7%) with what the current/future goals are
// actually set to.
//
// Returns null if recalibration isn't warranted, otherwise
// { localImpliedTDEE, currentTargetKcal, discrepancy, direction, affectedGoals }
// — affectedGoals is every goal in this macro with endDate >= today (today's
// goal plus all not-yet-started future ones), the exact set Card 3's modal
// will preview and batch-update.
export function computeMaintenanceRecalibration(s: BlocState, ctx: EngineContext, macro: Macrocycle | null | undefined, ins: Loose): Loose {
  if (!macro || macro.goalType !== 'maintenance') return null;
  const today = ctx.today;
  const macroEnd = getMacroEndDate(macro, ctx);
  if (today < (macro.start || today) || today > macroEnd) return null; // active cycle only

  const qualifying = (ins.weekBuckets || []).filter((b: Loose) => b.avgWeight !== null && b.nutrDayCount >= 4);
  if (qualifying.length < 3) return null; // need a real trend, not one or two noisy points

  const recent = qualifying.slice(-3);
  const deltas = recent.slice(1).map((b: Loose, i: number) => b.avgWeight - recent[i].avgWeight);
  const avgWeeklyDelta = deltas.reduce((a: number, b: number) => a + b, 0) / deltas.length;
  if (Math.abs(avgWeeklyDelta) <= 0.5) return null; // stable — this is what maintenance should look like, no action needed

  // Locally-implied TDEE from just the two most recent qualifying weeks —
  // deliberately NOT the whole-history calcDynamicTDEE(), since the whole
  // point is catching a shift that figure won't reflect for a long time.
  const w1 = recent[recent.length - 2], w2 = recent[recent.length - 1];
  const weightChangeLbs = w2.avgWeight - w1.avgWeight;
  const localImpliedTDEE = Math.round(w2.avgKcal - (weightChangeLbs * 3500) / 7);
  if (localImpliedTDEE < 800 || localImpliedTDEE > 6000) return null; // sanity guard, same bounds as calcDynamicTDEE

  const affectedGoals = (s.goals || [])
    .filter(g => g.macroId === macro.id && g.endDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  if (!affectedGoals.length) return null;

  const currentTargetKcal = parseInt(affectedGoals[0].kcal) || null;
  if (!currentTargetKcal) return null;

  const discrepancy = localImpliedTDEE - currentTargetKcal;
  if (Math.abs(discrepancy) < 150 && Math.abs(discrepancy / currentTargetKcal) < 0.07) return null; // not meaningful

  return {
    localImpliedTDEE, currentTargetKcal, discrepancy,
    direction: avgWeeklyDelta > 0 ? 'gaining' : 'losing',
    affectedGoals,
  };
}

// ── The check-in's eligibility, cooldown and stored state ─────────────────
// One implementation, read by the section and by its full-view sheet. It was
// inline in the old fused card; both readers computing it separately is how
// a section and its sheet start disagreeing about whether a check-in is due.
export function computeCheckinState(s: BlocState, ctx: EngineContext, macro: Macrocycle | null | undefined): Loose {
  if (!macro) return null;
  const ins = computeWeeklyInsights(s, ctx, macro);
  const today = ctx.today;

  // drift-warning alone is informational — it does not warrant an API call.
  const INTERVENTION_SIGNALS = new Set([
    'plateau-creep', 'plateau-adaptation',
    'gain-deficit', 'gain-undereating', 'gain-excess',
    'maint-unstable',
  ]);

  const hasEnoughData  = ins && !ins.insufficientData;
  const signalWarrants = ins && INTERVENTION_SIGNALS.has(ins.signal);
  const eligible       = hasEnoughData && signalWarrants;

  const stored = s.blocAdvice;
  const hasStoredAdvice = !!(stored && stored.macroId === macro.id && stored.response);

  // nextCheckIn is per-path; with no plan chosen, the earlier of the two.
  // A date more than 16 days after storedAt was computed by the old
  // end-of-plan logic — cap it at the 14-day fallback rather than trusting it.
  let inCooldown = false;
  let cooldownUntil = null;
  if (hasStoredAdvice && stored.response.nextCheckIn) {
    const nc = stored.response.nextCheckIn;
    const chosen = stored.chosenPath;
    let rawDate = chosen && nc[chosen] ? nc[chosen] : ([nc.sustainable, nc.aggressive].filter(Boolean).sort()[0] || null);
    if (rawDate && stored.storedAt) {
      const storedMs = new Date(stored.storedAt + 'T00:00:00').getTime();
      const checkMs  = new Date(rawDate + 'T00:00:00').getTime();
      if (checkMs > storedMs + 16 * 86400000) {
        rawDate = getMondayAfter(getSundayAfterWeeks(stored.storedAt, 2));
      }
    }
    cooldownUntil = rawDate;
    if (cooldownUntil && today < cooldownUntil) inCooldown = true;
  }

  return { ins, hasEnoughData, signalWarrants, eligible, stored, hasStoredAdvice, inCooldown, cooldownUntil };
}

