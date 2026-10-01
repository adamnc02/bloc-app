// ═══════════════════════════════════════════════════════════════════════
// Nutrition and next-cycle leaves: day-map averages, the peak week, the
// safe-pace taper, and the kcal ramps (TECHNICAL §124).
//
// Moved from index.html in v8.34, UNCHANGED, behind same-named shims. Pure.
// The type casts below only satisfy the type-checker; esbuild erases them,
// so the arithmetic (including on nulls) is the old code's own.
// ═══════════════════════════════════════════════════════════════════════

import type { DateStr, DayMap } from './state.ts';
import { toLocalDateStr } from './dates.ts';

// Average a dayMap field (steps/kcal/protein) across a date range [startStr, endStr] inclusive.
export function avgDayMapField(dayMap: DayMap, field: string, startStr: DateStr, endStr: DateStr): number | null {
  const dates = Object.keys(dayMap).filter(d => d >= startStr && d <= endStr && (field === 'steps' ? dayMap[d].steps !== null : dayMap[d].hasNutr));
  if (!dates.length) return null;
  const sum = dates.reduce((s,d) => s + ((dayMap[d][field] as number) || 0), 0);
  return Math.round(sum / dates.length);
}

// Find the best 7-day rolling window
export function findPeakWindow(dayMap: DayMap, goalType?: string | null) {
  const dates = Object.keys(dayMap).sort();
  if (dates.length < 2) return null;
  const wantLoss = !goalType || goalType === 'loss';
  let best: {
    score: number; delta: number; startDate: DateStr; endDate: DateStr;
    avgSteps: number | null; avgKcal: number | null; avgProtein: number | null;
  } | null = null;
  for (let i = 0; i < dates.length; i++) {
    const startMs = new Date(dates[i] + 'T00:00:00').getTime();
    const endMs   = startMs + 6 * 86400000;
    const wSlice  = dates.filter(d => {
      const ms = new Date(d + 'T00:00:00').getTime();
      return ms >= startMs && ms <= endMs;
    });
    const wDates   = wSlice.filter(d => dayMap[d].weight !== null);
    if (wDates.length < 2) continue;
    const firstW   = dayMap[wDates[0]].weight as number;
    const lastW    = dayMap[wDates[wDates.length - 1]].weight as number;
    const delta    = lastW - firstW;
    const score    = wantLoss ? -delta : delta; // higher = better
    if (best === null || score > best.score) {
      const stepDays  = wSlice.filter(d => dayMap[d].steps !== null);
      const nutrDays  = wSlice.filter(d => dayMap[d].hasNutr);
      best = {
        score,
        delta,
        startDate: dates[i],
        endDate: toLocalDateStr(new Date(endMs)),
        avgSteps:   stepDays.length  ? Math.round(stepDays.reduce((s,d)  => s + (dayMap[d].steps as number),   0) / stepDays.length)  : null,
        avgKcal:    nutrDays.length  ? Math.round(nutrDays.reduce((s,d)  => s + (dayMap[d].kcal as number),    0) / nutrDays.length)  : null,
        avgProtein: nutrDays.length  ? Math.round(nutrDays.reduce((s,d)  => s + (dayMap[d].protein as number), 0) / nutrDays.length)  : null,
      };
    }
  }
  return best;
}

export interface TaperCurve {
  weeklyRates: { week: number; maxChangeLbs: number; atWeight: number }[];
  totalSafeChange: number;
}

// ── 1.5% → 1%/0.5% taper curve ──
// Max safe weekly loss/gain rate, tapering linearly from 1.5% of current
// (running) bodyweight in week 1 down to a bottom bound that depends on
// cycle length: 1% for cuts ≤10 weeks, 0.5% for anything longer (keeps the
// back half of a long cut realistic rather than still implying 1%/week
// deep into the cycle). Recalculated against running weight each week, not
// the starting weight. Returns { weeklyRates: [...], totalSafeChange } for
// a cut/bulk of `weeks` length starting at `startWeight`.
export function computeTaperCurve(startWeight: number, weeks: number): TaperCurve | null {
  if (!startWeight || !weeks || weeks < 1) return null;
  const topPct = 0.015;
  const bottomPct = weeks <= 10 ? 0.01 : 0.005;
  const weeklyRates: TaperCurve['weeklyRates'] = [];
  let w = startWeight;
  let totalSafeChange = 0;
  for (let i = 0; i < weeks; i++) {
    const pct = weeks > 1 ? topPct - ((topPct - bottomPct) * i / (weeks - 1)) : topPct;
    const maxChange = parseFloat((w * pct).toFixed(2));
    weeklyRates.push({ week: i + 1, maxChangeLbs: maxChange, atWeight: parseFloat(w.toFixed(1)) });
    totalSafeChange += maxChange;
    w -= maxChange; // taper is direction-agnostic; caller applies sign for cut vs bulk
  }
  return { weeklyRates, totalSafeChange: parseFloat(totalSafeChange.toFixed(1)) };
}

// ── Target weight / deadline override resolver (Phase 2) ──────────────────
// Only ever called for cut/bulk-direction recommendations (goalTypeRec ===
// 'loss' | 'gain', non-continuation) — maintenance never gets a target
// weight or deadline input at all, per design spec §4.3.
//
// Two independent checks, deliberately asymmetric in how they're treated:
// 1. Floor/ceiling (getSustainableWeightRange) is a HARD safety boundary —
//    a requested target beyond it is always flagged, no matter the pace.
// 2. The taper curve (computeTaperCurve) is a PACE check — a request that's
//    fine on safety grounds but too fast for the stated timeframe offers
//    alternatives rather than a flat refusal.
// Returns null if no override was actually given. Otherwise returns
// { weeks, endDate, conflict } — conflict is null when the request is safe.
export function resolveNextCycleOverride(
  latestBw: number | null | undefined,
  goalTypeRec: string,
  sustainableRange: { floor: number | null; ceiling: number | null; source?: string },
  newMacroStart: DateStr,
  override: { targetWeight?: number | null; deadline?: DateStr | null } | null | undefined,
) {
  if (!override || (!override.targetWeight && !override.deadline) || !latestBw) return null;

  const boundary = goalTypeRec === 'loss' ? sustainableRange.floor : sustainableRange.ceiling;
  const targetWeight = override.targetWeight || null;
  let deadline = override.deadline || null;

  // Snap to the next Sunday on or after whatever date was picked
  if (deadline) {
    const d = new Date(deadline + 'T00:00:00');
    const dow = d.getDay(); // 0 = Sunday
    if (dow !== 0) d.setDate(d.getDate() + (7 - dow));
    deadline = toLocalDateStr(d);
  }

  // Hard safety cap — checked first, independent of pace
  if (targetWeight !== null && boundary !== null) {
    const beyond = goalTypeRec === 'loss' ? targetWeight < boundary : targetWeight > boundary;
    if (beyond) {
      return {
        weeks: null, endDate: null,
        conflict: {
          type: 'boundary',
          message: `${targetWeight} lbs is beyond the ${goalTypeRec === 'loss' ? 'safety floor' : 'safety ceiling'} of ${boundary} lbs from your confirmed sustainable weight range (${sustainableRange.source === 'confirmed' ? 'based on past maintenance cycles' : 'cold-start fallback — no confirmed maintenance cycle yet'}). This isn't a pace suggestion — it's a hard boundary and isn't offered as a one-tap alternative.`,
          altDate: null, altWeight: null,
        },
      };
    }
  }

  const start = new Date(newMacroStart + 'T00:00:00');
  const findMinSafeWeeks = (requestedChange: number) => {
    let weeks = 1;
    while (weeks <= 104) {
      const t = computeTaperCurve(latestBw, weeks);
      if (t && t.totalSafeChange >= requestedChange) return weeks;
      weeks++;
    }
    return 104;
  };
  const endDateForWeeks = (weeks: number) => { const d = new Date(start); d.setDate(d.getDate() + weeks * 7 - 1); return toLocalDateStr(d); };

  // Only a target weight given — find the minimum safe duration for it
  if (targetWeight !== null && !deadline) {
    const requestedChange = Math.abs(targetWeight - latestBw);
    const weeks = findMinSafeWeeks(requestedChange);
    return { weeks, endDate: endDateForWeeks(weeks), conflict: null };
  }

  // Only a deadline given — nothing to pace-check without a weight target
  if (deadline && targetWeight === null) {
    const weeks = Math.max(1, Math.round(((new Date(deadline + 'T00:00:00') as unknown as number) - (start as unknown as number)) / 86400000 / 7));
    return { weeks, endDate: endDateForWeeks(weeks), conflict: null };
  }

  // Both given — pace-check the combination against the taper curve
  const requestedWeeks = Math.max(1, Math.round(((new Date(deadline + 'T00:00:00') as unknown as number) - (start as unknown as number)) / 86400000 / 7));
  const requestedChange = Math.abs((targetWeight as number) - latestBw);
  const taper = computeTaperCurve(latestBw, requestedWeeks);

  if (taper && requestedChange > taper.totalSafeChange) {
    const safeWeeks = findMinSafeWeeks(requestedChange);
    const altWeightRaw = goalTypeRec === 'loss' ? latestBw - taper.totalSafeChange : latestBw + taper.totalSafeChange;
    return {
      weeks: null, endDate: null,
      conflict: {
        type: 'pace',
        message: `That combination averages ~${(requestedChange / requestedWeeks).toFixed(1)} lbs/week over ${requestedWeeks} weeks — above the safe taper ceiling of ~${taper.totalSafeChange} lbs total for a cycle this length.`,
        altDate: endDateForWeeks(safeWeeks),
        altWeight: parseFloat(altWeightRaw.toFixed(1)),
      },
    };
  }

  return { weeks: requestedWeeks, endDate: endDateForWeeks(requestedWeeks), conflict: null };
}

// ── Reverse-diet weekly kcal table ──
// Extracted from the old Card 3 so both the diagnostic view and the goal
// queue builder can share one source of truth. Guarantees the final week
// always lands exactly on `tdee` (v7.01 fix retained).
export function buildReverseDietRows(recentKcal: number, tdee: number, weeklyIncrement: number): { week: number; kcal: number }[] {
  if (!tdee || !recentKcal) return [];
  const maintenance = Math.round(tdee);
  const rows: { week: number; kcal: number }[] = [];
  let kcal = recentKcal;
  let week = 1;
  while (kcal < maintenance - weeklyIncrement / 2 && week <= 60) {
    kcal = Math.min(kcal + weeklyIncrement, maintenance);
    rows.push({ week, kcal: Math.round(kcal) });
    week++;
  }
  if (rows.length && rows[rows.length - 1].kcal !== maintenance) {
    rows[rows.length - 1] = { week: rows[rows.length - 1].week, kcal: maintenance };
  }
  return rows;
}

// ── Cut/bulk-direction weekly kcal ramp ──────────────────────────────────
// Step-and-hold, not a continuous weekly taper — matches how a cut or bulk
// actually gets run in practice: pick a level, hold it a few weeks to
// judge the real trend, then step again. Design choices worth being
// explicit about:
// 1. Starts at `startKcal` (the previous cycle's last planned goal, same
//    "continue from wherever the plan left off" principle as the bridge's
//    rampStartKcal) rather than jumping straight to some computed ideal —
//    coming off a bulk, there's no need to drop below TDEE immediately.
// 2. Step size is asymmetric around TDEE, but ONLY for cuts: bigger while
//    still on the "easy" side (still in surplus, coming off a bulk) where
//    there's no adaptation risk yet, smaller once past TDEE into genuinely
//    restrictive territory where caution actually matters. Bulks do NOT
//    get this asymmetry — a bulk's entire point is minimizing fat gain, so
//    there's no "fast phase" that's safe the way there is coming off a
//    bulk into a cut; bulks always use the smaller, careful step size
//    throughout, regardless of where they sit relative to TDEE.
// These are deliberately rough, round numbers rather than a precisely
// derived curve — the plateau/danger detection in the existing AI advice
// flow is the real safety net for adjusting mid-cycle; this just needs to
// be a sane starting estimate, not a precise prescription.
// `goalTypeRec` is 'loss' (deficit, stepping down toward finalTargetKcal)
// or 'gain' (surplus, stepping up). `safetyFloor` clamps any level from
// going below it (cuts only). Returns pre-grouped {startWeek, endWeek,
// kcal, clamped} rows — already merges consecutive holds at the same
// level, so callers don't need a separate grouping pass.
export function buildDirectionSteppedRamp(
  startKcal: number, finalTargetKcal: number, tdee: number, totalWeeks: number,
  goalTypeRec: string, safetyFloor?: number | null,
): { startWeek: number; endWeek: number; kcal: number; clamped: boolean }[] {
  if (!startKcal || !finalTargetKcal || !tdee || !totalWeeks) return [];
  const holdWeeks = 3;   // weeks per step — long enough to judge a real trend
  const bigStep = 250;   // kcal per step — cuts only, and only on the easy side of TDEE
  const smallStep = 125; // kcal per step past TDEE (cuts) — and always, throughout, for bulks
  const isCut = goalTypeRec === 'loss';
  const pastTDEE = (k: number) => isCut ? k <= tdee : k >= tdee;

  const rows: { startWeek: number; endWeek: number; kcal: number; clamped: boolean }[] = [];
  let kcal = startKcal;
  let weeksUsed = 0;

  while (weeksUsed < totalWeeks) {
    let displayKcal = kcal;
    let clamped = false;
    if (isCut) {
      displayKcal = Math.max(displayKcal, finalTargetKcal); // never go past the final target
      clamped = !!(safetyFloor && displayKcal < safetyFloor);
      if (clamped) displayKcal = safetyFloor as number;
    } else {
      displayKcal = Math.min(displayKcal, finalTargetKcal); // safety floor only meaningfully applies to cuts
    }
    displayKcal = Math.round(displayKcal);

    const weeksThisStep = Math.min(holdWeeks, totalWeeks - weeksUsed);
    const last = rows[rows.length - 1];
    if (last && last.kcal === displayKcal) {
      last.endWeek += weeksThisStep;
      last.clamped = last.clamped || clamped;
    } else {
      rows.push({ startWeek: weeksUsed + 1, endWeek: weeksUsed + weeksThisStep, kcal: displayKcal, clamped });
    }
    weeksUsed += weeksThisStep;

    if (kcal !== finalTargetKcal) {
      const stepSize = isCut ? (pastTDEE(kcal) ? smallStep : bigStep) : smallStep;
      kcal = isCut ? Math.max(finalTargetKcal, kcal - stepSize) : Math.min(finalTargetKcal, kcal + stepSize);
    }
  }
  return rows;
}
