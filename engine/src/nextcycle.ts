// ═══════════════════════════════════════════════════════════════════════
// The next-cycle recommendation, its goal steps, and when the AI may be asked
// about it (TECHNICAL §125).
//
// Moved from index.html in v8.35, UNCHANGED apart from their inputs, behind
// same-named shims: the state as `s`, "today" as `ctx` (§123), and the two
// UI globals as parameters: the cycle Card 3 is
// previewing (`_nextCyclePreviewMacroId`) and the target/deadline the person
// typed (`_nextCycleOverride`).
// ═══════════════════════════════════════════════════════════════════════

import type { BlocState, Loose, Macrocycle } from './state.ts';
import { type EngineContext, getMacroEndDate, shiftDateStr, toLocalDateStr } from './dates.ts';
import { buildDirectionSteppedRamp, buildReverseDietRows, computeTaperCurve, resolveNextCycleOverride } from './nutrition.ts';
import { calcDynamicTDEE, calcTrendBasedTDEE, getSustainableWeightRange } from './tdee.ts';
import { computeSafetyFloor } from './insights.ts';
import { getNextMacroStart } from './cycles.ts';

// ── The core recommendation engine ──
// Implements the duration×depth matrix (loss→maintenance), the gain→cut
// default, the loss→loss / gain→gain continuation exceptions (narrative
// only, no queue), and the maintenance→direction lookback. Returns a single
// object Card 3 renders directly — see design spec for the full rule set.
export function recommendNextCycle(s: BlocState, ctx: EngineContext, macroIn: Macrocycle | null | undefined, override?: Loose): Loose {
  const macro: Loose = macroIn; // its _synthetic test fields are read below
  if (!macro) return null;
  const goalType = macro.goalType || 'loss';
  const rollup: Loose = s.insightsRollup || { completedCycles: [] };
  const prevCycle = rollup.completedCycles.length ? rollup.completedCycles[rollup.completedCycles.length - 1] : null;

  const dynResult   = calcDynamicTDEE(s, ctx);
  const trendResult = calcTrendBasedTDEE(s, ctx);
  const sustainableRange = getSustainableWeightRange(s);
  const safetyFloorKcal = computeSafetyFloor(s, ctx, macro); // existing app function — 80% of log-based BMR, min 1400

  const today = ctx.today;
  const macroStart = macro.start || today;
  const macroEnd = getMacroEndDate(macro, ctx);
  const macroEndDate = new Date(macroEnd + 'T00:00:00');
  const cycleDurationWeeks = Math.max(1, Math.round(((macroEndDate as unknown as number) - (new Date(macroStart + 'T00:00:00') as unknown as number)) / 86400000 / 7));

  const latestLog = [...(s.bodyLogs || [])].filter(l => l.weight).sort((a, b) => b.date.localeCompare(a.date))[0];
  const latestBw = latestLog ? parseFloat(latestLog.weight) : null;

  const recentKcal = (() => {
    const cutoffStr = shiftDateStr(ctx.today, -14);
    const logs = (s.nutritionLogs || []).filter(l => l.date >= cutoffStr && parseInt(l.kcal) > 0);
    if (!logs.length) return null;
    return Math.round(logs.reduce((a, b) => a + parseInt(b.kcal), 0) / logs.length);
  })();

  // The reverse-diet ramp (and, as of this build, the cut/bulk-direction
  // ramp too) should start from the CURRENT CYCLE'S PLAN, not from recent
  // actual eating — recentKcal (above) reflects adherence noise in either
  // direction and stays in use for depth classification / TDEE work, where
  // actual behavior is exactly what's needed. But a ramp's job is to
  // continue from wherever the current plan actually left off, so it
  // should begin at whatever the current macro's LAST (most recent by end
  // date) goal actually targets — falling back to recentKcal only if the
  // current cycle has no goals logged yet. Synthetic test scenarios carry
  // a fixed startKcal directly, for the same contamination reasons as the
  // gain branch's totalGain/gainRatePerWeek/surplus overrides.
  const currentCycleGoals = (s.goals || []).filter(g => g.macroId === macro.id);
  const lastGoalInCycle = currentCycleGoals.length
    ? currentCycleGoals.reduce((latest: Loose, g) => (!latest || g.endDate > latest.endDate) ? g : latest, null)
    : null;
  const rampStartKcal = macro._synthetic && macro._synthetic.startKcal
    ? macro._synthetic.startKcal
    : ((lastGoalInCycle && lastGoalInCycle.kcal) ? parseInt(lastGoalInCycle.kcal) : recentKcal);

  const rationale: string[] = [];
  let goalTypeRec: Loose = null;
  let isContinuation = false;
  let bridge: Loose = null;       // { climbWeeks, minBridgeWeeks, totalWeeks, fillWeeks, weeklyIncrement, rows }
  let placeholderWeeks: Loose = null; // used for gain→cut / maintenance→direction (no formula-derived length yet)
  let taper: Loose = null; // 1.5%→1%/0.5% safe-rate curve, informational only in Phase 1 (no deadline input yet)
  let overrideConflict: Loose = null; // set when a Phase 2 target-weight/deadline override can't be safely honored
  let directionRamp: Loose[] = []; // weekly kcal table for cut/bulk-direction recommendations (§ buildDirectionSteppedRamp)
  let needsDirectionChoice = false; // maintenance with no determinable direction — Card 3 offers both routes
  let directionWasForced = false; // direction came from override.forcedDirection, not history — Card 3 offers a back button
  // Set only for the loss→loss / gain→gain continuation exceptions — the
  // "normal logic" alternative that would have been recommended had this
  // NOT qualified as short+mild/short-and-not-excessive. Structurally a
  // full substitute rec (goalType/rationale/bridge/directionRamp/newMacroEnd
  // etc., sharing this rec's newMacroStart/dynResult/sustainableRange/etc.)
  // so it can be fed to fillNextCycleMacroModal()/buildNextCycleGoalSteps()
  // exactly like a primary recommendation, and so the Phase 4 prompt can
  // treat it as the thing actually being planned for. Never set for
  // maintenance — maintenance has no continuation exception to begin with.
  let continuationAlternative: Loose = null;

  // Applies a 12-week default, or — for cut/bulk-direction cases only, per
  // §4.3 — a resolved target-weight/deadline override if one was given and
  // it clears both the floor/ceiling safety check and the taper pace check.
  // Shared by the gain→cut and maintenance→direction branches below (and,
  // for the continuation-alternative case, called a second time to compute
  // the "normal logic" alternative) — all otherwise identical in how they
  // size their placeholder duration. Also builds the weekly kcal ramp once
  // the duration is settled — using the requested target weight if one was
  // given, otherwise defaulting to the taper curve's own maximum safe
  // change for that duration (i.e. "assume the safest fastest pace" as the
  // default, the same philosophy the bridge already uses without needing
  // any user input).
  //
  // Pure w.r.t. the outer scope — returns its results rather than mutating
  // rationale/overrideConflict/directionRamp/newMacroEnd/placeholderWeeks
  // directly, so it can safely run twice in the same recommendNextCycle()
  // call (once for the primary recommendation, once for a continuation's
  // alternative) without the two calls clobbering each other. `useOverride`
  // is `override` for the primary call, or `null` when computing an
  // alternative — a target-weight/deadline typed against the PRIMARY
  // direction has no meaning for a different direction.
  const applyPlaceholderOrOverride = (recGoalType: string, useOverride: Loose) => {
    const out: Loose = { rationale: [], overrideConflict: null, directionRamp: [], newMacroEnd: null, placeholderWeeks: null };
    const resolved = resolveNextCycleOverride(latestBw, recGoalType, sustainableRange, newMacroStart, useOverride);
    let finalWeeks: Loose;
    if (resolved && resolved.conflict) {
      out.overrideConflict = resolved.conflict;
      out.rationale.push(`Requested target couldn't be safely applied: ${resolved.conflict.message}`);
      return out; // no ramp, no dates — Card 3 shows the conflict UI instead
    } else if (resolved) {
      out.placeholderWeeks = null; // no longer a default — this is a user-set duration
      out.newMacroEnd = resolved.endDate;
      finalWeeks = resolved.weeks;
      out.rationale.push(`Using your requested target: cycle ends ${resolved.endDate} (${resolved.weeks} weeks).`);
    } else {
      out.placeholderWeeks = 12;
      const d = new Date(newMacroStart + 'T00:00:00');
      d.setDate(d.getDate() + out.placeholderWeeks * 7 - 1);
      out.newMacroEnd = toLocalDateStr(d);
      finalWeeks = out.placeholderWeeks;
    }

    if (latestBw && dynResult) {
      let rampTargetWeight = (useOverride && useOverride.targetWeight) ? useOverride.targetWeight : null;
      if (rampTargetWeight === null) {
        const t = computeTaperCurve(latestBw, finalWeeks);
        if (t) rampTargetWeight = parseFloat((recGoalType === 'loss' ? latestBw - t.totalSafeChange : latestBw + t.totalSafeChange).toFixed(1));
      }
      if (rampTargetWeight !== null) {
        const requestedChange = Math.abs(rampTargetWeight - latestBw);
        const avgDailyDelta = Math.round((requestedChange * 3500) / (finalWeeks * 7));
        const finalTargetKcal = recGoalType === 'loss' ? Math.round(dynResult.tdee) - avgDailyDelta : Math.round(dynResult.tdee) + avgDailyDelta;
        out.directionRamp = buildDirectionSteppedRamp(rampStartKcal, finalTargetKcal, dynResult.tdee, finalWeeks, recGoalType, safetyFloorKcal);
        out.rationale.push(`Weekly kcal steps built from ${rampStartKcal ? rampStartKcal.toLocaleString() : '?'} kcal (current cycle's last goal) toward a ${finalTargetKcal.toLocaleString()} kcal steady state over ${finalWeeks} weeks, aiming for a ${rampTargetWeight} lbs target${(useOverride && useOverride.targetWeight) ? '' : ' (taper curve default — no target weight set)'}. Bigger steps while still on the easy side of TDEE, smaller steps once past it, held a few weeks at a time — a rough estimate, not a precise prescription, given the AI advice flow can catch a real plateau mid-cycle.`);
        const clampedSteps = out.directionRamp.filter((r: Loose) => r.clamped).length;
        if (clampedSteps > 0) {
          out.rationale.push(`${clampedSteps} step${clampedSteps !== 1 ? 's' : ''} capped at the ${safetyFloorKcal.toLocaleString()} kcal safety floor — the resulting pace will be slower than the raw target implies.`);
        }
        const lastStepKcal = out.directionRamp.length ? out.directionRamp[out.directionRamp.length - 1].kcal : null;
        if (lastStepKcal !== null && lastStepKcal !== finalTargetKcal) {
          out.rationale.push(`This cycle's length doesn't fit enough steps to fully reach the ${finalTargetKcal.toLocaleString()} kcal steady state (ends at ${lastStepKcal.toLocaleString()} instead) — the fixed step sizes deliberately don't force an oversized final jump just to land exactly on target. Extend the cycle or reassess near its end if you want to close the gap.`);
        }
      }
    }
    return out;
  };
  let newMacroStart = getNextMacroStart(s, ctx);
  let newMacroEnd: Loose = null; // computed once duration is known

  if (goalType === 'loss') {
    const cutDepth = (dynResult && recentKcal) ? dynResult.tdee - recentKcal : null;
    const pctOfTDEE = (dynResult && cutDepth !== null) ? cutDepth / dynResult.tdee : null;

    let depthBand = 'mild';
    if (cutDepth !== null && (cutDepth > 700 || (pctOfTDEE !== null && pctOfTDEE > 0.25))) depthBand = 'aggressive';
    else if (cutDepth !== null && (cutDepth > 500 || (pctOfTDEE !== null && pctOfTDEE > 0.15))) depthBand = 'moderate';
    // Synthetic test scenarios (Card 3 preview dropdown) carry a fixed
    // depth band directly, since faking dynResult/recentKcal to derive one
    // isn't worth the complexity — see SYNTHETIC_NEXT_CYCLE_SCENARIOS.
    if (macro._synthetic && macro._synthetic.depthBandOverride) depthBand = macro._synthetic.depthBandOverride;

    let durationBand = 'short';
    if (cycleDurationWeeks > 16) durationBand = 'long';
    else if (cycleDurationWeeks >= 8) durationBand = 'medium';

    const matrix: Record<string, Record<string, number>> = {
      short:  { mild: 2, moderate: 3, aggressive: 4 },
      medium: { mild: 3, moderate: 4, aggressive: 6 },
      long:   { mild: 4, moderate: 6, aggressive: 8 },
    };
    const bridgeWeeksMin = matrix[durationBand][depthBand];

    // Taper curve — informational only in Phase 1 (no deadline/target-weight
    // input exists yet to actually constrain against it). Sized against the
    // cut just completed, so this is a look-back sanity check for now: was
    // the pace that was actually run within the 1.5%→1%/0.5% safe band?
    if (latestBw) {
      taper = computeTaperCurve(latestBw, cycleDurationWeeks);
    }

    rationale.push(`Current cut ran ${cycleDurationWeeks} weeks (${durationBand}) at a ${depthBand} deficit${cutDepth !== null ? ` (~${Math.abs(Math.round(cutDepth))} kcal/day below TDEE)` : ' (not enough data to size the deficit)'}.`);

    // Computes the maintenance bridge that follows this cut — used as the
    // PRIMARY recommendation whenever this cut doesn't qualify for
    // continuation, and as the "normal logic" alternative when it does.
    // Pure w.r.t. outer scope, same reasoning as applyPlaceholderOrOverride.
    const computeMaintenanceBridgeFromCut = () => {
      const out: Loose = { rationale: [], bridge: null, newMacroEnd: null };
      // Derived from depthBand directly, not recomputed from raw cutDepth —
      // depthBand's 'aggressive' threshold also considers % of TDEE, not
      // just raw kcal, so recomputing here independently could disagree
      // with what the rationale text just said. Also correctly picks up
      // the synthetic depthBandOverride when previewing a test scenario.
      const isAggressiveCut = depthBand === 'aggressive';
      const weeklyIncrement = isAggressiveCut ? 75 : 125;
      const rows = buildReverseDietRows(rampStartKcal, (dynResult ? dynResult.tdee : null) as number, weeklyIncrement);
      const climbWeeks = rows.length;
      // bridgeWeeksMin is time spent AT (or effectively at) TDEE-level intake,
      // not the total bridge length. The final climb week already lands
      // exactly on TDEE (guaranteed by buildReverseDietRows), so it counts
      // as the first hold week — only bridgeWeeksMin-1 additional flat weeks
      // are needed after any climb. If there's no climb at all (already at
      // TDEE), the full bridgeWeeksMin becomes flat hold weeks.
      const fillWeeks = climbWeeks > 0 ? Math.max(0, bridgeWeeksMin - 1) : bridgeWeeksMin;
      const totalWeeks = climbWeeks + fillWeeks;
      // Canonical full week-by-week table (climb + flat fill weeks) — shared
      // by the diagnostic table and the goal queue builder, so both always
      // agree on what a "7-week bridge" actually contains.
      const maintenanceKcal = dynResult ? Math.round(dynResult.tdee) : (rows.length ? rows[rows.length - 1].kcal : null);
      const fullRows: Loose[] = rows.slice();
      for (let fw = 1; fw <= fillWeeks; fw++) {
        fullRows.push({ week: climbWeeks + fw, kcal: maintenanceKcal, isHoldWeek: true });
      }
      out.bridge = { climbWeeks, minBridgeWeeks: bridgeWeeksMin, totalWeeks, fillWeeks, weeklyIncrement, rows, fullRows, depthBand, durationBand, rampStartKcal };
      out.rationale.push(rampStartKcal !== recentKcal
        ? `Ramp starts at ${rampStartKcal.toLocaleString()} kcal — the current cycle's last planned goal, not the ${recentKcal ? recentKcal.toLocaleString() + ' kcal 14-day actual average' : 'unavailable 14-day actual average'}. Starting from the plan (not adherence noise) errs toward a longer, more conservative climb.`
        : `Ramp starts at ${rampStartKcal ? rampStartKcal.toLocaleString() : '?'} kcal (plan and recent actual eating currently agree).`);
      out.rationale.push(`Recommended time at maintenance-level intake: minimum ${bridgeWeeksMin} weeks (matrix: ${durationBand} × ${depthBand}).`);
      if (climbWeeks) {
        out.rationale.push(fillWeeks > 0
          ? `The reverse-diet ramp to TDEE takes ${climbWeeks} week${climbWeeks !== 1 ? 's' : ''} at +${weeklyIncrement} kcal/week — its final week already lands exactly on TDEE and counts as the first maintenance week, so ${fillWeeks} more flat week${fillWeeks !== 1 ? 's' : ''} at TDEE complete the ${bridgeWeeksMin}-week minimum (total: ${totalWeeks} weeks).`
          : `The reverse-diet ramp to TDEE takes ${climbWeeks} weeks at +${weeklyIncrement} kcal/week, and its final week alone already satisfies the ${bridgeWeeksMin}-week minimum — no extra flat weeks needed.`);
      } else {
        out.rationale.push(`Not enough recent kcal/weight data yet to compute the reverse-diet ramp — recommending ${bridgeWeeksMin} flat weeks at TDEE until more data is available.`);
      }
      const d = new Date(newMacroStart + 'T00:00:00');
      d.setDate(d.getDate() + totalWeeks * 7 - 1);
      out.newMacroEnd = toLocalDateStr(d);
      return out;
    };

    if (durationBand === 'short' && depthBand === 'mild') {
      goalTypeRec = 'loss';
      isContinuation = true;
      rationale.push('Short and mild — reasonable to continue cutting without a maintenance bridge. Consider extending this cut by roughly 2–4 weeks yourself, then reassess against these same rules.');
      // "Normal logic" alternative — what would have been recommended had
      // this NOT qualified as short+mild. Computed alongside the
      // continuation, never in place of it — Card 3 and the Phase 4
      // prompt both surface it.
      const alt = computeMaintenanceBridgeFromCut();
      continuationAlternative = {
        goalType: 'maintenance', isContinuation: false, rationale: alt.rationale,
        bridge: alt.bridge, directionRamp: [], overrideConflict: null,
        newMacroStart, newMacroEnd: alt.newMacroEnd, placeholderWeeks: null,
        cycleDurationWeeks, dynResult, trendResult, sustainableRange,
        latestBw, recentKcal, rampStartKcal,
      };
    } else {
      goalTypeRec = 'maintenance';
      const primary = computeMaintenanceBridgeFromCut();
      rationale.push(...primary.rationale);
      bridge = primary.bridge;
      newMacroEnd = primary.newMacroEnd;
    }
  } else if (goalType === 'gain') {
    // Synthetic test scenarios provide these directly (§ preview dropdown)
    // rather than deriving from state.bodyLogs — a fake macro's start date
    // would otherwise pull in real logged data from that period (e.g. the
    // person's actual cut), which has nothing to do with the fake bulk
    // being tested and would produce a nonsensical rate/surplus figure.
    const synth = macro._synthetic;
    const cycleLogs = synth ? [] : [...(s.bodyLogs || [])].filter(l => l.weight && l.date >= macroStart).sort((a, b) => a.date.localeCompare(b.date));
    const startBw = cycleLogs.length ? parseFloat(cycleLogs[0].weight) : null;
    const totalGain = synth ? synth.totalGain : ((startBw !== null && latestBw !== null) ? latestBw - startBw : null);
    const gainRatePerWeek = synth ? synth.gainRatePerWeek : ((totalGain !== null && cycleDurationWeeks > 0) ? totalGain / cycleDurationWeeks : null);
    const surplus = synth ? synth.surplus : ((dynResult && recentKcal) ? recentKcal - dynResult.tdee : null);
    const excessiveSurplus = surplus !== null && surplus > 500;
    const isShortBulk = cycleDurationWeeks < 10;
    const isMildRate = gainRatePerWeek !== null && gainRatePerWeek <= 0.35;

    rationale.push(`Current bulk ran ${cycleDurationWeeks} weeks${totalGain !== null ? `, gaining ~${totalGain.toFixed(1)} lbs (~${gainRatePerWeek.toFixed(2)} lbs/week)` : ''}${surplus !== null ? `, averaging ~${Math.round(surplus)} kcal/day above TDEE` : ''}.`);

    // Computes the cut that follows this bulk — used as the PRIMARY
    // recommendation whenever this bulk doesn't qualify for continuation,
    // and as the "normal logic" alternative when it does. `useOverride` is
    // `override` for the primary call, `null` for the alternative (a
    // target/deadline typed against "continue bulk" has no meaning for a
    // cut). Pure w.r.t. outer scope, wraps applyPlaceholderOrOverride.
    const computeCutFromBulk = (useOverride: Loose) => {
      const rat: string[] = [];
      rat.push('A bulk-to-cut transition doesn\'t need a mandatory bridge — surplus doesn\'t cause the same adaptive suppression a deficit does.');
      if (cycleDurationWeeks > 12) {
        rat.push('This bulk ran long enough (>12 weeks) that a short 1–2 week maintenance step first would give a cleaner TDEE reading at your new weight before setting cut targets — optional, not physiologically required.');
      }
      const res = applyPlaceholderOrOverride('loss', useOverride);
      return { goalType: 'loss', rationale: rat.concat(res.rationale), bridge: null, directionRamp: res.directionRamp, newMacroEnd: res.newMacroEnd, placeholderWeeks: res.placeholderWeeks, overrideConflict: res.overrideConflict };
    };

    if ((isShortBulk && !excessiveSurplus) || isMildRate) {
      goalTypeRec = 'gain';
      isContinuation = true;
      rationale.push(isMildRate
        ? `Gain rate has been mild (≤0.35 lbs/week) — comfortable to extend even though the cycle itself may read as long. Consider extending by roughly 2–4 weeks, then reassess.`
        : `Bulk is still short and the surplus isn't excessive — reasonable to extend by roughly 2–4 weeks, then reassess.`);
      // "Normal logic" alternative — the cut this bulk would transition
      // into if it weren't continuing. Card 3 and the Phase 4 prompt both
      // surface it.
      const alt = computeCutFromBulk(null);
      continuationAlternative = {
        goalType: alt.goalType, isContinuation: false, rationale: alt.rationale,
        bridge: alt.bridge, directionRamp: alt.directionRamp, overrideConflict: alt.overrideConflict,
        newMacroStart, newMacroEnd: alt.newMacroEnd, placeholderWeeks: alt.placeholderWeeks,
        cycleDurationWeeks, dynResult, trendResult, sustainableRange,
        latestBw, recentKcal, rampStartKcal,
      };
    } else {
      const primary = computeCutFromBulk(override);
      goalTypeRec = primary.goalType;
      rationale.push(...primary.rationale);
      directionRamp = primary.directionRamp;
      newMacroEnd = primary.newMacroEnd;
      placeholderWeeks = primary.placeholderWeeks;
      overrideConflict = primary.overrideConflict;
    }
  } else {
    // maintenance
    let autoDirection: Loose = null;
    if (prevCycle) {
      autoDirection = prevCycle.goalType === 'gain' ? 'loss' : (prevCycle.goalType === 'loss' ? 'gain' : null);
    }

    if (autoDirection) {
      goalTypeRec = autoDirection;
      rationale.push(`This maintenance bridge followed a ${prevCycle.goalType === 'gain' ? 'bulk' : 'cut'} (${prevCycle.name}) — direction continues ${goalTypeRec === 'gain' ? 'into a bulk' : 'into a cut'}.`);
      const res = applyPlaceholderOrOverride(goalTypeRec, override);
      rationale.push(...res.rationale);
      overrideConflict = res.overrideConflict;
      directionRamp = res.directionRamp;
      newMacroEnd = res.newMacroEnd;
      placeholderWeeks = res.placeholderWeeks;
    } else if (override && override.forcedDirection) {
      // No history to determine direction automatically, but the user
      // picked one via Card 3's cut/bulk choice buttons — proceed exactly
      // as if it had been auto-determined. directionWasForced flags this
      // so Card 3 can offer a way back to the choice screen.
      goalTypeRec = override.forcedDirection;
      directionWasForced = true;
      rationale.push(`No completed cycle history to determine a direction automatically — you chose to plan a ${goalTypeRec === 'gain' ? 'bulk' : 'cut'}.`);
      const res = applyPlaceholderOrOverride(goalTypeRec, override);
      rationale.push(...res.rationale);
      overrideConflict = res.overrideConflict;
      directionRamp = res.directionRamp;
      newMacroEnd = res.newMacroEnd;
      placeholderWeeks = res.placeholderWeeks;
    } else {
      // Genuinely ambiguous — offer both routes rather than a dead end.
      // Card 3 renders two buttons; picking one sets override.forcedDirection
      // and this whole function re-runs, landing in the branch above.
      needsDirectionChoice = true;
      rationale.push(prevCycle
        ? `The cycle before this maintenance bridge (${prevCycle.name}) wasn't a cut or bulk — not enough history to determine a direction automatically. Choose one below.`
        : 'No completed cycle history yet to determine which direction to continue in. Choose one below.');
    }
  }

  return {
    goalType: goalTypeRec, isContinuation, rationale, bridge, placeholderWeeks, taper, overrideConflict, directionRamp, needsDirectionChoice, directionWasForced,
    continuationAlternative,
    newMacroStart, newMacroEnd,
    cycleDurationWeeks, dynResult, trendResult, sustainableRange,
    latestBw, recentKcal, rampStartKcal,
  };
}

// Converts a recommendNextCycle() result into full goal objects ready for
// the existing goal-queue infrastructure (_launchGoalQueue/_openQueueStep).
// Protein floor at 1g/lb bodyweight, 50/50 carb/fat split on the remainder
// — the same defaults initGoalMacroSliders() falls back to for a new goal.
// Daily step target is carried forward from whatever goal is currently
// active, since the deterministic engine has no basis to recommend one.
export function buildNextCycleGoalSteps(s: BlocState, ctx: EngineContext, rec: Loose): Loose[] {
  // Phase 4 — an accepted LLM plan already carries fully-formed goal objects
  // (materialised in askBlocForNextCycleAdvice: dates, kcal, protein, carbs,
  // fats, and steps already resolved per the cut-only-lever rule). Use them
  // directly rather than re-deriving from rec.bridge/rec.directionRamp.
  if (rec._llmGoals && rec._llmGoals.length) return rec._llmGoals;

  const bwRounded = rec.latestBw ? Math.round(rec.latestBw) : 150;
  const proteinG = Math.max(1, Math.ceil(bwRounded));
  const macrosFor = (kcal: number) => {
    const remaining = Math.max(0, kcal - proteinG * 4);
    return { protein: proteinG, carbs: Math.round(remaining * 0.5 / 4), fats: Math.round(remaining * 0.5 / 9) };
  };
  const today = ctx.today;
  const currentActiveGoal = (s.goals || []).find(g => g.startDate <= today && g.endDate >= today);
  // Maintenance goals are always 8,000 steps flat — never carried forward
  // from whatever the current active goal happens to be, and never varied.
  // Cut/bulk-direction goals still carry forward the current goal's steps,
  // since that rule is maintenance-specific.
  const stepsTarget = rec.goalType === 'maintenance' ? 8000 : (currentActiveGoal ? currentActiveGoal.steps : 8000);

  const steps: Loose[] = [];
  // DST-safe date-add helper — setDate() operates on the calendar day
  // component directly, unlike raw millisecond arithmetic (getTime() + N *
  // 86400000), which silently drifts a day when a span crosses a DST
  // transition (a "spring forward"/"fall back" day is not exactly 24h of
  // real time). Matches the pattern getMacroEndDate() already uses.
  const addDays = (d: Date, n: number) => { const nd = new Date(d); nd.setDate(nd.getDate() + n); return nd; };
  let cursor = new Date(rec.newMacroStart + 'T00:00:00');

  if (rec.bridge && rec.bridge.fullRows.length) {
    // Group consecutive weeks holding the SAME kcal level into one goal
    // spanning the full held range — one goal per distinct kcal level, not
    // one per calendar week. Ramp weeks (kcal changes every week) naturally
    // stay as individual one-week goals; the flat hold weeks (including the
    // final ramp week, which already lands on TDEE) collapse into a single
    // multi-week goal. Same principle as the LLM path's variable-cadence
    // goal granularity — just applied to the deterministic table too.
    const groups: Loose[] = [];
    rec.bridge.fullRows.forEach((r: Loose) => {
      const last = groups[groups.length - 1];
      if (last && last.kcal === r.kcal) {
        last.endWeek = r.week;
        last.isHoldWeek = last.isHoldWeek || r.isHoldWeek;
      } else {
        groups.push({ startWeek: r.week, endWeek: r.week, kcal: r.kcal, isHoldWeek: r.isHoldWeek });
      }
    });
    groups.forEach((gr: Loose) => {
      const weeksSpanned = gr.endWeek - gr.startWeek + 1;
      const startDate = toLocalDateStr(cursor);
      const endDate   = toLocalDateStr(addDays(cursor, weeksSpanned * 7 - 1));
      const label = gr.startWeek === gr.endWeek
        ? `Wk ${gr.startWeek}${gr.isHoldWeek ? ' (hold)' : ''}`
        : `Wk ${gr.startWeek}-${gr.endWeek}${gr.isHoldWeek ? ' (hold)' : ''}`;
      steps.push({ label, startDate, endDate, kcal: gr.kcal, steps: stepsTarget, ...macrosFor(gr.kcal) });
      cursor = addDays(cursor, weeksSpanned * 7);
    });
  } else if (rec.directionRamp && rec.directionRamp.length) {
    // Cut/bulk-direction ramp — buildDirectionSteppedRamp() already outputs
    // pre-grouped {startWeek, endWeek, kcal} steps (it merges consecutive
    // holds at the same level internally), so this just walks them
    // directly rather than needing its own grouping pass.
    rec.directionRamp.forEach((gr: Loose) => {
      const weeksSpanned = gr.endWeek - gr.startWeek + 1;
      const startDate = toLocalDateStr(cursor);
      const endDate   = toLocalDateStr(addDays(cursor, weeksSpanned * 7 - 1));
      const label = gr.startWeek === gr.endWeek ? `Wk ${gr.startWeek}` : `Wk ${gr.startWeek}-${gr.endWeek}`;
      steps.push({ label, startDate, endDate, kcal: gr.kcal, steps: stepsTarget, ...macrosFor(gr.kcal) });
      cursor = addDays(cursor, weeksSpanned * 7);
    });
  } else {
    // Last-resort fallback — flat single-step goal, only reached if the
    // ramp genuinely couldn't be computed (e.g. no TDEE data at all yet).
    const target = rec.dynResult
      ? (rec.goalType === 'gain' ? rec.dynResult.tdee + 250 : rec.dynResult.tdee - 500)
      : (rec.recentKcal || 2000);
    const endDate = rec.newMacroEnd || toLocalDateStr(addDays(cursor, (rec.placeholderWeeks || 8) * 7 - 1));
    steps.push({ label: 'Starting target', startDate: toLocalDateStr(cursor), endDate, kcal: Math.round(target), steps: stepsTarget, ...macrosFor(Math.round(target)) });
  }
  return steps;
}

// Usage-discipline gate for the LLM CALL ONLY — per design spec §3, the
// deterministic recommendation itself is never gated by cycle timing, just
// this API call. Returns { eligible, reason } (rather than a bare bool) so
// the future render pass can explain *why* it's unavailable, not just hide it.
export function isNextCycleAdviceEligible(ctx: EngineContext, macro: Macrocycle | null | undefined, rec: Loose, previewMacroId: string | null | undefined): Loose {
  if (!macro || !rec || !rec.goalType)  return { eligible: false, reason: 'no-recommendation' };
  // A continuation is only eligible when a "normal logic" alternative was
  // actually computed — the LLM plans for/reasons about that alternative
  // (see nextCycleAdvicePlanMode's planRec resolution), so without one
  // there's nothing concrete to ask about.
  if (rec.isContinuation && (!rec.continuationAlternative || !rec.continuationAlternative.goalType)) {
    return { eligible: false, reason: 'continuation-no-alternative' };
  }
  if (rec.needsDirectionChoice)         return { eligible: false, reason: 'direction-not-chosen' };
  // Always plans for the real active cycle, never a previewed one — same
  // guard "Build this plan next" already applies, for the same reason.
  if (previewMacroId && previewMacroId !== macro.id) {
    return { eligible: false, reason: 'previewing-different-cycle' };
  }
  const macroEndDate = new Date(getMacroEndDate(macro, ctx) + 'T00:00:00');
  const today = new Date(ctx.today + 'T00:00:00');
  const daysToEnd = Math.round(((macroEndDate as unknown as number) - (today as unknown as number)) / 86400000);
  if (daysToEnd > 21) return { eligible: false, reason: 'outside-3-week-window', daysToEnd };
  return { eligible: true, reason: null, daysToEnd };
}

// ── Plan-mode decision, shared by the prompt builder AND the response
//    validator so the two can never silently disagree on what shape of
//    response was actually asked for.
//
// First resolves `planRec` — the rec actually being planned for. Normally
// that's just `rec` itself, but when the deterministic engine recommends a
// continuation (extend the current cycle), the thing worth asking the LLM
// to build/refine a plan for is the "normal logic" alternative
// (rec.continuationAlternative) instead — a plain extension isn't
// something this feature builds via the goal queue either way, so plans[]
// always targets a genuinely-new-cycle direction.
//
// Then, based on planRec, one of three modes:
//    - conflictTwoPlans:  user gave both a target weight AND a deadline, and
//                         the deterministic engine flagged it unsafe (§4.3) —
//                         2 plans, each resolving the conflict a different way.
//    - directionTwoPlans: cut/bulk-direction cycle, no deadline given by the
//                         user — 2 plans, "sustainable" (long/steady) vs
//                         "aggressive" (shorter+harder for a cut; same length,
//                         modestly harder surplus for a bulk — a bulk is
//                         NEVER shortened to be "aggressive").
//    - otherwise:         exactly 1 plan, filling to planRec.newMacroEnd
//                         exactly (maintenance bridges, or a cut/bulk where
//                         the user already gave a deadline that resolved
//                         cleanly).
export function nextCycleAdvicePlanMode(rec: Loose, nextCycleOverride: Loose): Loose {
  const planRec = (rec && rec.isContinuation && rec.continuationAlternative) ? rec.continuationAlternative : rec;
  const override         = nextCycleOverride || {};
  const hasDeadline      = !!override.deadline;
  const conflictTwoPlans = !!(planRec && planRec.overrideConflict);
  const directionTwoPlans = !!(planRec && planRec.goalType && planRec.goalType !== 'maintenance' && !hasDeadline && !conflictTwoPlans);
  // Maintenance bridges have no target-weight/deadline concept, so they can
  // never hit conflictTwoPlans/directionTwoPlans — but the deterministic
  // bridge length (climb + minimum hold) is still just this engine's OWN
  // best guess, same as any other placeholder duration. Gives the LLM room
  // to propose a genuinely different bridge length (still exactly 1 plan,
  // not 2 — there's no "sustainable vs aggressive" split for a bridge) when
  // it has good reason to (see USER CONTEXT / HISTORY in the prompt) rather
  // than being hard-locked to the engine's own default end date.
  const maintenanceFlex = !!(planRec && planRec.goalType === 'maintenance' && !hasDeadline);
  return { hasDeadline, conflictTwoPlans, directionTwoPlans, maintenanceFlex, returnTwoPlans: conflictTwoPlans || directionTwoPlans, planRec };
}

