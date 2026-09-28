// ═══════════════════════════════════════════════════════════════════════
// Mutators, as pure cores: what each one would write, returned instead of
// written (deep dive §1e, §3 H4, §10 step 6; TECHNICAL §125).
//
// Each was a BLOC function that changed `state` (and some saved). The engine
// computes the change; BLOC's same-named function applies it, in the same
// order, with the same save(). Coach runs the cores on a client's state and
// keeps the result in memory: it never writes a client's labels, rollup or
// exercise history.
// ═══════════════════════════════════════════════════════════════════════

import type { BlocState, DateStr, GoalPeriod, Loose, Macrocycle } from './state.ts';
import { type EngineContext, getMacroEndDate } from './dates.ts';
import { getWeekSets } from './progression.ts';
import { isDeloadUnit } from './sessions.ts';
import { buildDayMap } from './tdee.ts';
import { computeWeeklyInsights } from './insights.ts';

// Recomputes the "Step N - " prefix on every goal belonging to a macrocycle,
// based purely on chronological startDate order — macroGoalID itself never
// changes, only this display prefix. Any free text the user typed after an
// existing "Step N - " prefix (or a bare custom label with no prefix at all)
// is preserved; only the leading "Step N" segment is stripped and reapplied.
//
// Returns the goals with that macro's relabelled as COPIES (every other goal
// is the same object). BLOC's renumberMacroGoalSteps(macroId) copies the new
// labels onto its own goal objects, which other code holds references to.
export function renumberMacroGoalSteps(goals: GoalPeriod[] | null | undefined, macroId: string | null | undefined): GoalPeriod[] | null | undefined {
  if (!goals || !macroId) return goals;
  const macroGoals = goals.filter(g => g.macroId === macroId);
  macroGoals.sort((a, b) => a.startDate.localeCompare(b.startDate));
  const labels = new Map<GoalPeriod, string>();
  macroGoals.forEach((g, i) => {
    const n = i + 1;
    const suffix = String(g._blocLabel || '').replace(/^Step\s*\d+\s*-?\s*/i, '').trim();
    labels.set(g, suffix ? `Step ${n} - ${suffix}` : `Step ${n}`);
  });
  return goals.map(g => labels.has(g) ? { ...g, _blocLabel: labels.get(g) } : g);
}

// ── Historical rollup — compact per-completed-macrocycle summary ──────────
// The entries updateInsightsRollup() appends to s.insightsRollup.completedCycles
// for every macrocycle that has ended (before ctx.today) and isn't archived
// yet. Each is computed once and frozen thereafter; BLOC appends them, caps
// the list at the last 10 and saves.
//
// 🚨 Deep dive H4: an archive is computed with the archiver's today and data.
//    Coach must use the client's stored rollup verbatim, and use this only as
//    a provisional overlay for cycles the client hasn't archived yet.
//
// CycleRollup shape:
//   { id, name, goalType, start, end, weeks,
//     startBw, endBw, targetBw,
//     startWaist, endWaist, startHip, endHip,
//     avgKcal, avgProtein, avgCarbs,
//     plateauWeeksDetected, signals[] }
export function computeRollupEntries(s: BlocState, ctx: EngineContext): Loose[] {
  const rollup: Loose = s.insightsRollup || { completedCycles: [] };
  const today = ctx.today;

  // Find completed macrocycles not yet in the rollup
  const archivedIds = new Set((rollup.completedCycles || []).map((r: Loose) => r.id));
  const newlyCompleted = ((s.macrocycles || []) as Loose[]).filter(m => {
    if (archivedIds.has(m.id)) return false;
    const end = getMacroEndDate(m, ctx);
    return end && end < today;
  });

  if (!newlyCompleted.length) return []; // nothing new to archive

  const dayMap = buildDayMap(s);
  const entries: Loose[] = [];

  for (const m of newlyCompleted) {
    const endStr: DateStr = getMacroEndDate(m, ctx);
    const startStr: DateStr = m.start || '';

    // Body weight at cycle start and end
    const bwLogs = (s.bodyLogs || [])
      .filter(l => l.weight && l.date >= startStr && l.date <= endStr)
      .sort((a, b) => a.date.localeCompare(b.date));
    const startBw = bwLogs.length ? parseFloat(bwLogs[0].weight) : null;
    const endBw   = bwLogs.length ? parseFloat(bwLogs[bwLogs.length - 1].weight) : null;

    // Average kcal, protein, carbs across the cycle
    const allDates = Object.keys(dayMap).filter(d => d >= startStr && d <= endStr);
    const nutrDates = allDates.filter(d => dayMap[d].hasNutr);
    const avgKcal    = nutrDates.length ? Math.round(nutrDates.reduce((a, d) => a + dayMap[d].kcal, 0)    / nutrDates.length) : null;
    const avgProtein = nutrDates.length ? Math.round(nutrDates.reduce((a, d) => a + (dayMap[d].protein||0), 0) / nutrDates.length) : null;
    const avgCarbs   = nutrDates.length ? Math.round(nutrDates.reduce((a, d) => a + (dayMap[d].carbs||0),   0) / nutrDates.length) : null;

    // Waist and hip: first and last logged values within the cycle.
    // Stored in inches (always, regardless of entry unit — see §13).
    // Useful LLM context: waist/hip change shows body composition shift
    // independent of scale weight (e.g. recomping, water weight masking fat loss).
    const measLogs = (s.bodyLogs || [])
      .filter(l => l.date >= startStr && l.date <= endStr && (l.waist || l.hip))
      .sort((a, b) => a.date.localeCompare(b.date));
    const startWaist = measLogs.length ? (measLogs[0].waist || null) : null;
    const endWaist   = measLogs.length ? (measLogs[measLogs.length - 1].waist || null) : null;
    const startHip   = measLogs.length ? (measLogs[0].hip || null) : null;
    const endHip     = measLogs.length ? (measLogs[measLogs.length - 1].hip || null) : null;

    // Detect signals via computeWeeklyInsights
    const ins = computeWeeklyInsights(s, ctx, m);
    const signals: string[] = [];
    if (ins && !ins.insufficientData) {
      if (ins.plateauWeeks >= 2) signals.push(`plateau-${ins.plateauWeeks}wk`);
      if (ins.signal && ins.signal !== 'on-track') signals.push(ins.signal);
    }

    entries.push({
      id: m.id, name: m.name, goalType: m.goalType || 'loss',
      start: startStr, end: endStr, weeks: m.weeks,
      startBw, endBw, targetBw: m.targetBw || null,
      startWaist, endWaist, startHip, endHip,
      avgKcal, avgProtein, avgCarbs,
      plateauWeeksDetected: ins ? ins.plateauWeeks : 0,
      signals,
    });
  }
  return entries;
}

// What recordExerciseHistory() stores for an exercise just completed: its
// current representative weight/reps/sets (set-1 based, matching the
// convention used everywhere else in Train), keyed by exercise name + set
// type, plus its tracking mode by name. BLOC writes it into
// state.exerciseHistory / exerciseTrackingMode, so the most recent real
// performance is always instantly available — for the Add Exercise modal's
// prefilled defaults and its 'Last logged' reference note — without ever
// having to search back through past macrocycles.
//
// Returns null when nothing is recorded: a deload week (deliberately reduced
// to 60% — recording it would poison the 'last logged' reference and the next
// plan's defaults), an unnamed exercise, or no weight on set 1 yet.
export function recordExerciseHistory(s: BlocState, ctx: EngineContext, macro: Macrocycle, week: number, dayKey: string, ex: Loose):
  { name: string; type: string; entry: Loose; trackingMode: Loose } | null {
  if (isDeloadUnit(s, macro, week, dayKey)) return null;
  const nameNorm = (ex.name || '').trim().toLowerCase();
  if (!nameNorm) return null;
  const type = ex.type || 'standard';
  const key2 = macro.id + '_' + week + '_' + dayKey;
  const logs = s.trainLogs as Loose;
  const log0 = logs[key2 + '_' + ex.id + '_0'];
  if (!log0 || !log0.weight) return null; // nothing meaningful logged yet
  const plannedSets = getWeekSets(ex, week, macro.weeks as number);
  let loggedSets = 0;
  for (let i = 0; i < plannedSets; i++) {
    if ((logs[key2 + '_' + ex.id + '_' + i] || {}).weight) loggedSets++;
  }
  return {
    name: nameNorm,
    type,
    entry: {
      sets: loggedSets || plannedSets,
      reps: log0.reps || '',
      weight: log0.weight || '',
      dropWeight: log0.dropWeight || '',
      dropReps: log0.dropReps || '',
      date: ctx.today,
    },
    trackingMode: ex.trackingMode,
  };
}
