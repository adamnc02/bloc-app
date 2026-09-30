// ═══════════════════════════════════════════════════════════════════════
// BLOC's shared engine (PROMPT-03 Phase 2, TECHNICAL §122).
//
// One source for both apps:
//   · BLOC loads the committed build, dist/bloc-engine.js, as a classic
//     <script> before its main script; everything exported here becomes
//     `window.BlocEngine.<name>`. index.html keeps a same-named global shim
//     for each moved function, so its call sites never change.
//   · BLOC Coach (Phase 5) imports this file as source.
//
// 🚨 Rules for anything added here:
//   · Never read the clock, `state`, the DOM, localStorage or the network.
//     "Today" comes in as a parameter (EngineContext, dates.ts), the state as
//     an argument.
//   · Never write to an argument, never read the clock. scripts/
//     verify-engine-pure.mjs runs every export over a write-trapping copy of
//     the demo state, with `new Date()` and `Date.now()` throwing, and fails
//     if an export has no case there.
//   · Behaviour moves across UNCHANGED. scripts/verify-engine-golden.mjs runs
//     BLOC through this build and must match the golden file (§118).
//   · After any edit: `npm run build` in engine/, and commit dist/ with the
//     source. CI rebuilds and fails if the committed bytes differ.
// ═══════════════════════════════════════════════════════════════════════

export type { BlocState, BlocProfile, BodyLog, DateStr, Macrocycle, SampleDayGroup, GoalPeriod, NutritionLog, TrainLog, Loose, Substitution, CoachBooking } from './state.ts';
export { normaliseState } from './state.ts';
export type { EngineContext } from './dates.ts';
export {
  toLocalDateStr, getHomeWeekStart, getWeekDates, getSundayAfterWeeks, getMondayAfter, getNextMonday,
  getMacroDurationWeeks, getMacroEndDate,
  // v8.34 (§124): step 3, the pure leaves
  snapToNextMonday, getDayBefore, shiftDateStr, dayDiff,
} from './dates.ts';
export type { DayMap, DayMapEntry } from './state.ts';
export type { Exercise, TrackUnit } from './progression.ts';
export {
  getMacroExtensionInfo, getMacroEffectiveMesoCount, isMesoMicroValid, getMacroSessionDayKeys, exercisePlanWeek,
  getWeekSets, getWeekWeight, getWeekReps, getDeloadUnitKey, getPrevTrackUnit, roundToIncrement,
  getPrevCalendarWeek, getGiantSetProgression, getProgressionLockKey, getProgKey, parseRepsForVolume,
  progressionStartWeek, lockAppliesFrom,
} from './progression.ts';
export type { TaperCurve } from './nutrition.ts';
export {
  avgDayMapField, findPeakWindow, computeTaperCurve, resolveNextCycleOverride,
  buildReverseDietRows, buildDirectionSteppedRamp,
} from './nutrition.ts';
export type { CycleReviewImage } from './prompts.ts';
export {
  buildSignalPeriods, formatSignalPeriodsForPrompt, extractJsonObject,
  condenseBlocAdvicePlans, condenseBlocAdviceEntry, formatPriorAdviceEntry, buildCycleReviewPrompt,
} from './prompts.ts';
export type { RequiredDaily, MacroGoal } from './home.ts';
export {
  getHomeIsoDow, isCompleteNutritionDay, getWeeklyRequiredDaily, computeWeekPlannedAvg,
  formatAdviceSublabel, getHomeMetricSublabel, getReconciledMacroAdvice,
  RECONCILE_CARBS_FLOOR, RECONCILE_FATS_FLOOR, RECONCILE_PROTEIN_MAX_DROP, RECONCILE_KCAL_MAX_OVERSHOOT,
  // v8.35 (§125): step 4, the badge's status, and the whole week as data
  SAVE_DAY_TOLERANCE, HOME_STEPS_TOLERANCE, HOME_METRIC_POLARITY, getHomeMetricTolerance, getHomeMetricBadge,
  computeHomeWeek,
} from './home.ts';
export type { HomeBadgeStatus, HomeMetricBadge, HomeWeek, HomeWeekMetric } from './home.ts';
export type { Goal } from './clash.ts';
export { macroRange, findMacroClash, buildGoalShiftPlan, planReplaceOffer } from './clash.ts';
export type { ReplaceOffer, ReplaceRefusal, ReplaceBlock } from './clash.ts';
export { isLocalDevHost } from './host.ts';

// ── v8.35 (§125): step 4, the state readers. Each takes the state as `s` and,
//    where it needs "today", an EngineContext; what BLOC read from a page's
//    globals is a parameter. ────────────────────────────────────────────────
export {
  getDateActiveMacroId, getNextMacroStart, getActiveGoal, getGoalForDate, getGoalForDay,
  materialiseDates, isCycleReviewDue, isInFinalWeek, resolveProgressMacro,
} from './cycles.ts';
export type { VolumePoint, MacroSession } from './sessions.ts';
export {
  isDeloadUnit, isFirstUnitAfterDeload, getSessionVolume, getMacroTotalVolume, getMacroVolumeSeries,
  getAllMacroSessions, getCoachAssignment, getNextIncompleteSession, getSelectedTrainWeekDates, getTrainAgendaUnits,
  getSubstitutionKey, getSubstitution, isSubstitutedUnit, getCoachLoggedSession,
} from './sessions.ts';
export type { DayStats, TdeeResult } from './tdee.ts';
export {
  buildDayMap, calcAge, getActivityMacroId, getActivityMultiplier, calcMifflinBMR, calcTrendBasedTDEE, calcDynamicTDEE,
  calcDynamicTDEE_rawLogPair, getSustainableWeightRange,
} from './tdee.ts';
export { computeWeeklyInsights, computeSafetyFloor, computeMaintenanceRecalibration, computeCheckinState } from './insights.ts';
export { recommendNextCycle, buildNextCycleGoalSteps, isNextCycleAdviceEligible, nextCycleAdvicePlanMode } from './nextcycle.ts';
export {
  computeCycleBestLifts, computeCycleWeeklySwings, computeCycleMeasurements, getPriorCycleReviews,
  computeCycleReviewPayload,
} from './review.ts';

// ── v8.35 (§125): step 5, the progression core. Targets are read and filled
//    through a TargetCache; the lock is returned as a transition, never
//    written. ───────────────────────────────────────────────────────────────
export type { RpeStep, WeekTarget, TargetCache, RawTargets, ComplianceResult, LockEntry, LockTransition, ExerciseProgression, ProgressionOpts, ProgressionReplay } from './targets.ts';
export {
  getRpeKey, isRpeOn, rpeDrivesProgression, RPE_STEP_NONE, rpeStepFromKind, computeRpeStepKind, getRpeStep,
  PROG_STEP_MAINTENANCE, getProgressionStep, bumpRepsBy, getLastCompliantWeek, computeRawSuggestedTargets,
  getWeekTargets, getWeekComplianceResult, computeLockTransition, computeExerciseProgression, replayProgressionAfterLog,
} from './targets.ts';

// ── v8.35 (§125): step 6, mutators as pure cores, and the AI flows. The engine
//    returns what BLOC then writes; every model request goes through a
//    `callModel` the caller injects (BLOC: its fetch, with the user's key). ──
export { renumberMacroGoalSteps, computeRollupEntries, recordExerciseHistory } from './mutators.ts';
export type { ModelRequest, ModelReply, CallModel } from './advice.ts';
export {
  buildModelRequest, getRpeSessionExercises, buildRpePromptSummary, buildBlocAdvicePrompt, buildBlocChallengePrompt,
  buildNextCycleAdvicePrompt, postProcessAdviceResponse, postProcessChallengeResponse, acceptChallengeRevision,
  postProcessNextCycleResponse, postProcessCycleReviewResponse, requestBlocAdvice, requestBlocChallenge,
  requestNextCycleAdvice, requestCycleReview,
} from './advice.ts';
