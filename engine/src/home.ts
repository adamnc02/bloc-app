// ═══════════════════════════════════════════════════════════════════════
// Home's weekly pace: which days count as logged, the catch-up rate for the
// rest of the week, the planned average, and the reconciled macro advice
// (deep dive §1a, §10 step 3; TECHNICAL §124).
//
// Moved from index.html in v8.34, UNCHANGED, behind same-named shims. Pure:
// `today` is already a parameter here, as it always was.
//
// Not here yet: getHomeMetricBadge, its tolerance and its polarity. Step 4
// splits the badge's status from its colour (deep dive §1a SCOPE) and adds
// computeHomeWeek; moving it now would mean moving it twice.
//
// The casts only satisfy the type-checker (a day-map field is `unknown`
// until buildDayMap moves) and are erased.
// ═══════════════════════════════════════════════════════════════════════

import type { DateStr, DayMap, DayMapEntry } from './state.ts';
import { toLocalDateStr, getWeekDates } from './dates.ts';

export interface RequiredDaily {
  requiredDaily: number;
  loggedSoFar: number;
  daysTrackedSoFar: number;
  daysRemaining: number;
  startsToday: boolean;
}

export interface MacroGoal {
  kcal?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fats?: number | null;
  steps?: number | null;
  [k: string]: unknown;
}

// ISO day-of-week for a date string: Monday = 1 .. Sunday = 7.
export function getHomeIsoDow(dateStr: DateStr): number {
  const d = new Date(dateStr + 'T00:00:00');
  const dow = d.getDay();
  return dow === 0 ? 7 : dow;
}

// A kcal/protein/carbs day only counts as a genuinely "logged" day (as
// opposed to a day that was simply never filled in) if its kcal comes
// within 300kcal of the kcal target — close enough to be real intake, not
// noise from an empty or near-empty log.
export function isCompleteNutritionDay(day: DayMapEntry | null | undefined, kcalTarget: number | null | undefined): boolean {
  if (!day || !day.hasNutr) return false;
  if (kcalTarget === null || kcalTarget === undefined) return true;
  return (day.kcal as number) >= (kcalTarget - 300);
}

// The flat daily rate still needed for the rest of the week (today onward)
// to land the weekly total on `target`, based on logged totals for every
// day strictly BEFORE today in this week — days with no log at all are
// excluded entirely (both from the sum and from the "needed total" it's
// compared against), so a day you simply didn't log doesn't silently count
// as zero progress and inflate the catch-up rate for the days that remain.
// Shared by getHomeMetricBadge's pace check, getHomeMetricSublabel's advice
// text, and getReconciledMacroAdvice (which runs this same calc for kcal/
// protein/carbs/fats before reconciling them against each other).
// kcalTarget is only used for kcal/protein/carbs/fats (ignored for steps) —
// it's always the goal's kcal figure regardless of which field is being
// asked about, matching computeWeekPlannedAvg's isCompleteNutritionDay
// gate exactly, so the "off track" badge/pace math and the "Total this
// week avg" figure can never disagree about which days actually qualify.
export function getWeeklyRequiredDaily(field: string, dayMap: DayMap, weekStart: DateStr, today: DateStr, target: number | null | undefined, kcalTarget?: number | null): RequiredDaily | null {
  if (target === null || target === undefined) return null;
  const dow = getHomeIsoDow(today); // Monday=1 .. Sunday=7
  // A day only stays "open" (still recoverable budget) until it actually
  // has a logged value — once today has one, it's settled just like any
  // earlier day, and must count in the sum below rather than being
  // silently skipped. Without this, day 1 of a week always has zero prior
  // days AND excludes today, so the pace calc trivially equals target no
  // matter what today's real number is.
  const todayEntry = dayMap[today];
  const todayHasField = !!todayEntry && (field === 'steps' ? todayEntry.steps !== null : isCompleteNutritionDay(todayEntry, kcalTarget));
  const cutoff = todayHasField ? today : (() => {
    const d = new Date(today + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    return toLocalDateStr(d);
  })();
  const daysRemaining = todayHasField ? (7 - dow) : (8 - dow); // days still open
  let loggedSoFar = 0;
  let daysTrackedSoFar = 0;
  Object.keys(dayMap).forEach(d => {
    if (d >= weekStart && d <= cutoff) {
      const day = dayMap[d];
      const hasField = field === 'steps' ? day.steps !== null : isCompleteNutritionDay(day, kcalTarget);
      if (hasField) { loggedSoFar += ((day[field] as number) || 0); daysTrackedSoFar++; }
    }
  });
  if (daysRemaining <= 0) {
    const requiredDaily = daysTrackedSoFar > 0 ? (loggedSoFar / daysTrackedSoFar) : target;
    return { requiredDaily, loggedSoFar, daysTrackedSoFar, daysRemaining, startsToday: !todayHasField };
  }
  const neededTotal = target * (daysTrackedSoFar + daysRemaining);
  const remainingBudget = neededTotal - loggedSoFar;
  return { requiredDaily: remainingBudget / daysRemaining, loggedSoFar, daysTrackedSoFar, daysRemaining, startsToday: !todayHasField };
}

// Projects what this week's average WOULD be if the plan is followed
// exactly for any day not yet locked in: today-or-earlier days use what's
// actually logged (steps falls back to the goal if today has no steps
// yet, or if some other past day is simply missing one), and every day
// after today uses the goal value outright, since it hasn't happened yet.
// For kcal/protein/carbs specifically, ANY day — past, today, or future —
// contributes its actual number the moment it's a "complete" day (see
// isCompleteNutritionDay), since a real qualifying log is a real qualifying
// log regardless of which side of "today" it falls on (e.g. a day logged
// ahead of time). A day only falls back to the assumed-on-plan target if
// it's in the future AND has no nutrition log at all yet; a day with a
// logged-but-non-qualifying entry (too far under target) is skipped
// entirely — not counted as zero, and not silently replaced with the
// target either. See getWeeklyRequiredDaily for the matching day
// qualifier used by the off-track badge/pace calc, kept deliberately in
// sync with this one.
export function computeWeekPlannedAvg(field: string, dayMap: DayMap, weekStart: DateStr, today: DateStr, goal: MacroGoal | null | undefined): number | null {
  if (!goal) return null;
  const target = goal[field];
  if (target === null || target === undefined) return null;
  const dates = getWeekDates(weekStart);

  if (field === 'steps') {
    let sum = 0;
    dates.forEach(d => {
      const day = dayMap[d];
      const hasActual = d <= today && day && day.steps !== null && day.steps !== undefined;
      sum += hasActual ? (day.steps as number) : (target as number);
    });
    return Math.round(sum / dates.length);
  }

  const kcalTarget = goal.kcal;
  let sum = 0, count = 0;
  dates.forEach(d => {
    const day = dayMap[d];
    if (isCompleteNutritionDay(day, kcalTarget)) {
      sum += ((day[field] as number) || 0);
      count++;
      return;
    }
    if (d > today && !(day && day.hasNutr)) {
      sum += target as number;
      count++;
    }
  });
  if (count === 0) return null;
  return Math.round(sum / count);
}

// Turns a requiredDaily figure into the same "adjust by X" / "hit X today"
// wording getHomeMetricSublabel has always used — shared so reconciled
// figures (see getReconciledMacroAdvice) read identically to unreconciled
// ones. startsToday (see getWeeklyRequiredDaily's identically-named return
// field) disambiguates which day the "for the rest of the week" figure
// actually starts counting from — once today already has a logged value
// for this field, the flat rate is spread from TOMORROW onward instead
// (today's own number is already locked in), which previously wasn't
// stated anywhere in the text itself.
export function formatAdviceSublabel(requiredDaily: number, target: number, unit: string, today: DateStr, daysRemaining?: number, startsToday?: boolean): string {
  if (daysRemaining === undefined) daysRemaining = 8 - getHomeIsoDow(today);
  const rounded = Math.round(requiredDaily);
  if (daysRemaining <= 1) {
    return `Hit ${rounded.toLocaleString()}${unit} today to bring the week to target`;
  }
  const delta = rounded - Math.round(target);
  const fromWord = startsToday === false ? 'starting tomorrow' : 'starting today';
  if (Math.abs(delta) < 1) return 'On pace for the week';
  const sign = delta > 0 ? '+' : '';
  return `Adjust your daily avg by ${sign}${delta.toLocaleString()}${unit} for the rest of the week (${fromWord}) to hit target`;
}

// Builds the "adjust your daily avg by X" (or, on the week's final day, the
// exact "hit X today") sublabel for one metric's OWN independent catch-up
// rate — unreconciled against any other metric. Used as-is for steps, and
// for kcal/protein/carbs whenever getReconciledMacroAdvice isn't in play.
// Reached through openHomeMetricAdvice()'s modal; the Home page's own
// consolidated advice panel that also used it was removed in v8.16.
export function getHomeMetricSublabel(field: string, dayMap: DayMap, weekStart: DateStr, today: DateStr, target: number, unit: string, kcalTarget?: number | null): string {
  const info = getWeeklyRequiredDaily(field, dayMap, weekStart, today, target, kcalTarget);
  if (info === null) return '';
  return formatAdviceSublabel(info.requiredDaily, target, unit, today, info.daysRemaining, info.startsToday);
}

// ── Weekly macro advice reconciliation ──────────────────────────────────
// kcal, protein, carbs, and fats each have their own independent weekly
// catch-up rate (getWeeklyRequiredDaily), but those numbers can be mutually
// impossible on their own — e.g. "reduce kcal by 760/day" alongside
// "increase protein by 37g/day" ignores that the extra protein alone would
// cost more calories than the reduced kcal budget allows. This reconciles
// kcal/protein/carbs/fats into one mutually-achievable set of numbers,
// in strict priority order — kcal, then protein, then carbs, then fats:
//   1. If protein's own catch-up rate fits inside the kcal catch-up rate,
//      alongside carbs and fats at their floors (50g/20g), protein and kcal
//      both keep their own independent numbers, and carbs/fats fill
//      whatever's left of the kcal budget. Fats — the lowest priority —
//      always takes the drop first; carbs only gets trimmed once fats has
//      already been cut to its 20g floor and there's still no room.
//   2. If not, protein's rate is capped at 10g/day below its own flat daily
//      goal (never lower), carbs/fats drop to their floors, and kcal is
//      recalculated as whatever that combination actually costs — but
//      clamped to a range, never left to float free: floored at kcal's own
//      raw catch-up rate (this fallback must never suggest eating LESS than
//      plain kcal pacing already called for — seeing a low-protein day also
//      shove kcal down further than pacing alone would is the bug this
//      floor exists to prevent), and ceilinged at 75kcal above the flat
//      daily kcal goal (never suggest blowing well past target on a single
//      day just to chase protein). When the ceiling is what binds, protein
//      may land short of its own 10g-under-goal number — kcal outranks
//      protein in the priority order, so kcal's ceiling wins.
// Only ever called for a metric that's already flagged concerning (see
// openHomeMetricAdvice) — this changes the ADVICE text only, never
// which metrics get flagged or their badge colour.
//
// 🚨 index.html's getDayViewRequiredDaily reconciliation reads these too, as
//    `const RECONCILE_… = BlocEngine.RECONCILE_…`: one source for both.
export const RECONCILE_CARBS_FLOOR = 50;
export const RECONCILE_FATS_FLOOR  = 20;
export const RECONCILE_PROTEIN_MAX_DROP = 10;
export const RECONCILE_KCAL_MAX_OVERSHOOT = 75;


export function getReconciledMacroAdvice(dayMap: DayMap, weekStart: DateStr, today: DateStr, goal: MacroGoal | null | undefined) {
  if (!goal || goal.kcal === null || goal.kcal === undefined || goal.protein === null || goal.protein === undefined) return null;
  const kcalInfo    = getWeeklyRequiredDaily('kcal',    dayMap, weekStart, today, goal.kcal, goal.kcal);
  const proteinInfo = getWeeklyRequiredDaily('protein', dayMap, weekStart, today, goal.protein, goal.kcal);
  const carbsInfo   = getWeeklyRequiredDaily('carbs',   dayMap, weekStart, today, goal.carbs, goal.kcal);
  const fatsInfo    = getWeeklyRequiredDaily('fats',    dayMap, weekStart, today, goal.fats, goal.kcal);
  if (kcalInfo === null || proteinInfo === null) return null;
  const kcalRaw    = kcalInfo.requiredDaily;
  const proteinRaw = proteinInfo.requiredDaily;
  const carbsRaw    = carbsInfo ? carbsInfo.requiredDaily : null;
  const fatsRaw     = fatsInfo  ? fatsInfo.requiredDaily  : null;

  const floorKcalCost = (proteinRaw * 4) + (RECONCILE_CARBS_FLOOR * 4) + (RECONCILE_FATS_FLOOR * 9);
  const feasible = floorKcalCost <= kcalRaw;

  if (feasible) {
    let carbsAdvice = carbsRaw !== null ? carbsRaw : RECONCILE_CARBS_FLOOR;
    let fatsAdvice  = fatsRaw  !== null ? fatsRaw  : RECONCILE_FATS_FLOOR;
    const budgetForCarbsAndFats = kcalRaw - (proteinRaw * 4);
    let cost = (carbsAdvice * 4) + (fatsAdvice * 9);
    if (cost > budgetForCarbsAndFats) {
      // Trim fats toward its floor first — it has no visible counter of
      // its own, so this is the lowest-cost place to make room.
      const maxFatsKcal = budgetForCarbsAndFats - (carbsAdvice * 4);
      fatsAdvice = Math.max(RECONCILE_FATS_FLOOR, maxFatsKcal / 9);
      cost = (carbsAdvice * 4) + (fatsAdvice * 9);
      if (cost > budgetForCarbsAndFats) {
        // Still doesn't fit even with fats at its floor — trim carbs too.
        const maxCarbsKcal = budgetForCarbsAndFats - (fatsAdvice * 9);
        carbsAdvice = Math.max(RECONCILE_CARBS_FLOOR, maxCarbsKcal / 4);
      }
    }
    const fatsChanged = fatsRaw !== null && Math.round(fatsAdvice) !== Math.round(fatsRaw);
    return {
      feasible: true,
      kcal: kcalRaw, protein: proteinRaw, carbs: carbsAdvice,
      fats: fatsAdvice, fatsChanged,
    };
  }

  // Not feasible: cap protein's shortfall at 10g below its own flat daily
  // goal, drop carbs/fats to their floors, and let kcal absorb the cost —
  // clamped between kcalRaw (floor) and goal.kcal + 75 (ceiling). See the
  // comment above this function for why both bounds exist.
  const proteinAdvice = (goal.protein as number) - RECONCILE_PROTEIN_MAX_DROP;
  const floorCost = (proteinAdvice * 4) + (RECONCILE_CARBS_FLOOR * 4) + (RECONCILE_FATS_FLOOR * 9);
  const kcalCeiling = (goal.kcal as number) + RECONCILE_KCAL_MAX_OVERSHOOT;
  const kcalAdvice = Math.min(kcalCeiling, Math.max(kcalRaw, floorCost));
  return {
    feasible: false,
    kcal: kcalAdvice, protein: proteinAdvice, carbs: RECONCILE_CARBS_FLOOR,
    fats: RECONCILE_FATS_FLOOR, fatsChanged: true,
  };
}
