// ═══════════════════════════════════════════════════════════════════════
// The day map, BMR and TDEE (TECHNICAL §125).
//
// Moved from index.html in v8.35, UNCHANGED apart from their inputs, behind
// same-named shims: the state as `s`, "today" as `ctx` (§123).
//
// 🚨 Units are imperial, as everywhere in the engine: body weight in lbs
//    (÷ 2.2046 for Mifflin-St Jeor's kg), 3,500 kcal ≈ 1 lb.
// ═══════════════════════════════════════════════════════════════════════

import type { BlocState, DateStr, Loose, Macrocycle } from './state.ts';
import { type EngineContext, toLocalDateStr } from './dates.ts';
import { getDateActiveMacroId } from './cycles.ts';

// A `type`, not an interface, so it stays assignable to state.ts's DayMap.
export type DayStats = {
  weight: number | null;
  steps: number | null;
  kcal: number;
  protein: number;
  carbs: number;
  fats: number;
  hasNutr: boolean;
};

// Build per-day stats map from all logs
export function buildDayMap(s: BlocState): Record<DateStr, DayStats> {
  const days: Record<DateStr, DayStats> = {};
  const ensure = (d: DateStr) => { if (!days[d]) days[d] = { weight: null, steps: null, kcal: 0, protein: 0, carbs: 0, fats: 0, hasNutr: false }; };
  (s.bodyLogs || []).forEach(l => {
    ensure(l.date);
    if (l.weight) days[l.date].weight  = parseFloat(l.weight);
    if (l.steps)  days[l.date].steps   = parseInt(l.steps);
  });
  (s.nutritionLogs || []).forEach(l => {
    ensure(l.date);
    if (l.kcal || l.protein) {
      days[l.date].kcal    = parseInt(l.kcal)    || 0;
      days[l.date].protein = parseFloat(l.protein) || 0;
      days[l.date].carbs   = parseFloat(l.carbs)   || 0;
      days[l.date].fats    = parseFloat(l.fats)    || 0;
      days[l.date].hasNutr = true;
    }
  });
  // Also sum from nutritionMeals if available
  Object.entries(s.nutritionMeals || {}).forEach(([date, meals]) => {
    ensure(date);
    let kcal = 0, protein = 0, carbs = 0, fats = 0;
    Object.values(meals).forEach(items => (items || []).forEach((item: Loose) => {
      kcal    += item.kcal    || 0;
      protein += item.protein || 0;
      carbs   += item.carbs   || 0;
      fats    += item.fats    || 0;
    }));
    if (kcal > 0 || protein > 0) {
      days[date].kcal    = kcal;
      days[date].protein = Math.round(protein);
      days[date].carbs   = Math.round(carbs);
      days[date].fats    = Math.round(fats);
      days[date].hasNutr = true;
    }
  });
  return days;
}

// Returns age in whole years from a stored birthday, accounting for whether
// this year's birthday has occurred yet.
//
// (The old code took the year, month and day of now(); ctx.today at midnight
// has the same three, so the age changes on the same day.)
export function calcAge(birthdayStr: DateStr | null | undefined, ctx: EngineContext): number | null {
  if (!birthdayStr) return null;
  const today = new Date(ctx.today + 'T00:00:00');
  const bday  = new Date(birthdayStr + 'T00:00:00');
  let age = today.getFullYear() - bday.getFullYear();
  const m = today.getMonth() - bday.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < bday.getDate())) age--;
  return age;
}

// ── H7 (v8.35, TECHNICAL §126): whose training load the multiplier reads ──
// The cycle the CALENDAR says you're training on: the date-active cycle,
// else (between cycles) the latest one that has started, else none.
//
// 🚨 Before v8.35 this was s.currentMacroId: whichever cycle the person last
//    BROWSED with the cycle arrows. Looking at an old, lighter cycle changed
//    today's BMR estimate, and with it the safety floor and every AI prompt's
//    floor, and Coach would have reproduced whatever the
//    client last clicked. Don't "simplify" it back to currentMacroId.
//
// Between cycles: the most recent started cycle, the one
// that just ended. Strictly date-active would read as no cycle, 0 sessions a
// week, sedentary: a ~29% jump in the BMR estimate and the floor in exactly
// the week Next Cycle advice is asked for. Only before any cycle has started
// is there no cycle, and so no training load.
//
// Ties on start date: the first in s.macrocycles (cycles never overlap,
// §108, so a tie means a malformed state, not a choice).
//
// 🚨 verify-engine-leaves.mjs's H7 control replaces the first line below, in
//    the build, with `return s.currentMacroId;`. If it changes, update it.
export function getActivityMacroId(s: BlocState, ctx: EngineContext): string | null {
  const active = getDateActiveMacroId(s, ctx);
  if (active) return active;
  let latest: Macrocycle | null = null;
  for (const m of s.macrocycles || []) {
    if (m.start && m.start <= ctx.today && (!latest || m.start > (latest.start as DateStr))) latest = m;
  }
  return latest ? latest.id : null;
}

/** Return activity multiplier (TDEE = BMR × multiplier) based on training plan + avg steps. */
export function getActivityMultiplier(s: BlocState, ctx: EngineContext): { multiplier: number; label: string } {
  const activityId = getActivityMacroId(s, ctx); // H7: the calendar's cycle, never the browsed one
  const macro = (s.macrocycles as Loose[]).find(m => m.id === activityId);
  const spw = macro ? (macro.sessionsPerWeek || 0) : 0;

  // Average daily steps from all body logs with steps logged
  const stepLogs = (s.bodyLogs || []).filter(l => parseInt(l.steps) > 0);
  const avgSteps = stepLogs.length
    ? stepLogs.reduce((a, b) => a + parseInt(b.steps), 0) / stepLogs.length
    : 0;

  if (spw >= 5 && avgSteps >= 9000) return { multiplier: 1.725, label: 'very active' };
  if (spw >= 3 && avgSteps >= 7000) return { multiplier: 1.55,  label: 'moderately active' };
  if (spw >= 1 && avgSteps >= 5000) return { multiplier: 1.375, label: 'lightly active' };
  return { multiplier: 1.2, label: 'sedentary' };
}

/** Mifflin-St Jeor BMR (returns kcal/day or null if profile incomplete). */
export function calcMifflinBMR(s: BlocState, ctx: EngineContext): number | null {
  const prof: Loose = s.profile || {};
  if (!prof.gender || !prof.heightCm || !prof.birthday) return null;
  // Use most recent body weight
  const wLog = [...(s.bodyLogs || [])]
    .filter(l => l.weight)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!wLog) return null;

  const weightKg  = parseFloat(wLog.weight) / 2.2046;
  const heightCm  = prof.heightCm;
  const age       = calcAge(prof.birthday, ctx);
  if (!age || age < 1 || age > 120) return null;

  let bmr = (10 * weightKg) + (6.25 * heightCm) - (5 * age);
  bmr += prof.gender === 'male' ? 5 : -161;
  return Math.round(bmr);
}

export interface TdeeResult { tdee: number; bmr: number; dataPoints: number; pairs?: Loose[] }

// ── Trend-based TDEE estimate (the fix for the raw log-pair noise problem) ──
// Compares TRAILING 7-DAY AVERAGE weight at calendar-week boundaries, not raw
// individual weigh-ins — averaging cancels a single high/low water day the
// way a longer gap between two raw points never can. Global (not scoped to
// any macrocycle), same convention as calcDynamicTDEE(). Returns
// { tdee, bmr, dataPoints, pairs: [...] } or null. `pairs` is surfaced
// directly in Card 3's diagnostic table.
export function calcTrendBasedTDEE(s: BlocState, ctx: EngineContext): TdeeResult | null {
  const dayMap = buildDayMap(s);
  const allDates = Object.keys(dayMap).sort();
  if (allDates.length < 8) return null;

  // Anchor the weekly grid to the Monday on/before the earliest logged date
  const first = new Date(allDates[0] + 'T00:00:00');
  const dow = first.getDay(); // 0=Sun..6=Sat
  first.setDate(first.getDate() - (dow === 0 ? 6 : dow - 1));

  const today = ctx.today;
  const buckets: Loose[] = [];
  let cur = new Date(first);
  while (toLocalDateStr(cur) <= today) {
    const bStart = toLocalDateStr(cur);
    // DST-safe: setDate() on the calendar day, not raw ms arithmetic — a
    // span crossing a DST transition is not exactly N*24h of real time.
    const bEndDate = new Date(cur); bEndDate.setDate(bEndDate.getDate() + 6);
    const bEnd = toLocalDateStr(bEndDate);
    // Cap to today — same reasoning as computeWeeklyInsights: the bucket
    // containing today must not average in future-dated entries, or the
    // TDEE estimate (and everything derived from it) gets skewed by
    // meals that haven't happened yet.
    const bDates = allDates.filter(d => d >= bStart && d <= bEnd && d <= today);
    const wD = bDates.filter(d => dayMap[d].weight !== null);
    const nD = bDates.filter(d => dayMap[d].hasNutr);
    const avgWeight = wD.length ? wD.reduce((a, d) => a + (dayMap[d].weight as number), 0) / wD.length : null;
    const avgKcal   = nD.length ? Math.round(nD.reduce((a, d) => a + dayMap[d].kcal, 0) / nD.length) : null;
    buckets.push({ bStart, bEnd, avgWeight, avgKcal, weightDayCount: wD.length, nutrDayCount: nD.length });
    cur = new Date(cur); cur.setDate(cur.getDate() + 7);
  }

  const pairs: Loose[] = [];
  for (let i = 0; i < buckets.length - 1; i++) {
    const a = buckets[i], b = buckets[i + 1];
    if (a.avgWeight === null || b.avgWeight === null) continue;
    // Each side needs >1 weigh-in to actually be a smoothed trend value,
    // not just a single raw reading wearing a trend label.
    if (a.weightDayCount < 2 || b.weightDayCount < 2) continue;
    if (!b.avgKcal || b.nutrDayCount < 4) continue;
    const weightChangeLbs = b.avgWeight - a.avgWeight;
    const impliedTDEE = b.avgKcal - (weightChangeLbs * 3500) / 7;
    pairs.push({
      weekStart: a.bStart, weekEnd: b.bEnd,
      trendWeightStart: parseFloat(a.avgWeight.toFixed(1)),
      trendWeightEnd:   parseFloat(b.avgWeight.toFixed(1)),
      avgKcal: b.avgKcal,
      impliedTDEE: Math.round(impliedTDEE),
    });
  }
  if (!pairs.length) return null;

  const sorted = pairs.map(p => p.impliedTDEE).sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  if (median < 800 || median > 6000) return null;

  const roundedTdee = Math.round(median);
  const { multiplier } = getActivityMultiplier(s, ctx);
  return { tdee: roundedTdee, bmr: Math.round(roundedTdee / multiplier), dataPoints: pairs.length, pairs };
}

// calcDynamicTDEE() — thin wrapper, this is the "swap" step from the design
// spec: the trend-based method (calcTrendBasedTDEE, 7-day rolling-average
// endpoints) was built and validated alongside this one before being
// trusted; now that it's confirmed, every existing caller of
// calcDynamicTDEE() — the BMR line on Progress, calorie targets, ETA
// calcs, computeSafetyFloor(), the Next Cycle direction ramp's start/target
// kcal, etc. — picks up the improved figure automatically in this one
// place, with no other call sites needing to change. Falls back to the raw
// log-pair method only when the trend method doesn't have enough data yet
// (it needs multiple calendar weeks with 2+ weigh-ins each, a higher bar
// than the raw method's "any 2 adjacent readings") — better to give a
// noisier answer than none at all for someone just starting to log.
export function calcDynamicTDEE(s: BlocState, ctx: EngineContext): TdeeResult | null {
  const trend = calcTrendBasedTDEE(s, ctx);
  if (trend) return trend;
  return calcDynamicTDEE_rawLogPair(s, ctx);
}

export function calcDynamicTDEE_rawLogPair(s: BlocState, ctx: EngineContext): TdeeResult | null {
  // Consecutive-pairs method, using median for robustness.
  // Every adjacent pair of weight logs is evaluated. Daily weight fluctuation
  // (water retention, food mass, glycogen) skews individual estimates but the
  // median naturally ignores extremes — every log contributes to the result.
  //
  // Deliberately NOT scoped to the active/browsed macrocycle: the metabolic
  // estimate itself should reflect the person's full logging history, not
  // just whichever cycle happens to be showing. Cycle-specific context (goal
  // weight, direction, calorie target) is applied separately by the caller
  // using the resolved macro, not here.
  const today = ctx.today;

  const wLogs = [...(s.bodyLogs || [])]
    .filter(l => l.weight && l.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (wLogs.length < 2) return null;

  const estimates: number[] = [];

  for (let i = 0; i < wLogs.length - 1; i++) {
    const w1    = wLogs[i], w2 = wLogs[i + 1];
    const d1    = new Date(w1.date + 'T00:00:00');
    const d2    = new Date(w2.date + 'T00:00:00');
    const nDays = Math.round(((d2 as unknown as number) - (d1 as unknown as number)) / 86400000);
    if (nDays < 1 || nDays > 21) continue;

    // Collect calorie data from nutritionLogs (confirmed single source of truth;
    // meals sync here via syncNutrLegacyLog on every save)
    const kcalValues: number[] = [];
    for (let k = 1; k <= nDays; k++) {
      const d    = new Date(d1); d.setDate(d.getDate() + k);
      const ds   = toLocalDateStr(d);
      const nLog = (s.nutritionLogs || []).find(l => l.date === ds);
      const kcal = nLog ? parseInt(nLog.kcal) || 0 : 0;
      if (kcal > 0) kcalValues.push(kcal);
    }
    // Need at least 50% calorie coverage for the pair to count
    if (kcalValues.length < Math.max(1, Math.ceil(nDays * 0.5))) continue;

    const avgKcal          = kcalValues.reduce((a, b) => a + b, 0) / kcalValues.length;
    const weightChangeLbs  = parseFloat(w2.weight) - parseFloat(w1.weight);
    const calPerDayImplied = (weightChangeLbs * 3500) / nDays;
    estimates.push(avgKcal - calPerDayImplied);
  }

  if (!estimates.length) return null;

  // Median — robust against overnight fluctuation outliers
  const sorted     = [...estimates].sort((a, b) => a - b);
  const mid        = Math.floor(sorted.length / 2);
  const medianTdee = sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;

  if (medianTdee < 800 || medianTdee > 6000) return null;

  const roundedTdee = Math.round(medianTdee);
  const { multiplier } = getActivityMultiplier(s, ctx);
  return {
    tdee:       roundedTdee,
    bmr:        Math.round(roundedTdee / multiplier),
    dataPoints: estimates.length,
  };
}

// ── Sustainable weight floor/ceiling ──
// Source of truth: completed maintenance cycles in the rollup that held
// stable (≤0.5 lbs/week, the same threshold plateauWeeksDetected already
// uses) for at least 3 weeks. Mid-cut/mid-bulk stability windows are
// deliberately NOT counted here — see design spec §2.2a for why (adaptation
// risk). Falls back to a 10%-below-most-recent-stable-weight cap when no
// qualifying maintenance cycle exists yet.
export function getSustainableWeightRange(s: BlocState): Loose {
  const rollup: Loose = s.insightsRollup || { completedCycles: [] };
  const qualifying = (rollup.completedCycles || []).filter((c: Loose) =>
    c.goalType === 'maintenance' && (c.plateauWeeksDetected || 0) >= 3 &&
    c.startBw != null && c.endBw != null
  );

  if (!qualifying.length) {
    const latestLog = [...(s.bodyLogs || [])].filter(l => l.weight).sort((a, b) => b.date.localeCompare(a.date))[0];
    const recentStable = latestLog ? parseFloat(latestLog.weight) : null;
    return {
      floor: recentStable ? parseFloat((recentStable * 0.90).toFixed(1)) : null,
      ceiling: recentStable ? parseFloat((recentStable * 1.10).toFixed(1)) : null,
      source: 'cold-start-fallback',
      qualifyingCycles: [],
    };
  }

  const weights = qualifying.map((c: Loose) => (c.startBw + c.endBw) / 2);
  const lowest = Math.min(...weights);
  const highest = Math.max(...weights);
  return {
    floor: parseFloat((lowest * 0.95).toFixed(1)),
    ceiling: parseFloat((highest * 1.05).toFixed(1)),
    source: 'confirmed',
    qualifyingCycles: qualifying.map((c: Loose) => ({ name: c.name, start: c.start, end: c.end, weight: parseFloat(((c.startBw + c.endBw) / 2).toFixed(1)), avgKcal: c.avgKcal, weeksStable: c.plateauWeeksDetected })),
  };
}
