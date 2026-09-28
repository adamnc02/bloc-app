// ═══════════════════════════════════════════════════════════════════════
// The progression core: the effort-rating step, each week's target, the
// compliance check, the lock, and what Train suggests for an exercise (deep
// dive §1e/§1d, §3 H1–H3, §10 step 5; TECHNICAL §125, and §12/§104 for the
// rules themselves).
//
// Moved from index.html in v8.35, UNCHANGED apart from their inputs, behind
// same-named shims. Two of them wrote while they read, and no longer do:
//   · getWeekTargets filled state.progressionTargets on a cache miss (H2). It
//     now reads and fills a TargetCache the caller passes. BLOC's is the live
//     state.progressionTargets, so BLOC writes exactly what it wrote before;
//     Coach passes an overlay over the client's cached targets, and never
//     publishes what it computed.
//   · evaluateProgressionLock wrote or deleted state.progressionLocks[key]
//     and saved (H1/H3). computeLockTransition returns the change instead;
//     BLOC's evaluateProgressionLock applies it and saves.
// computeExerciseProgression is renderTrainDay's exProgData(), lifted out.
//
// 🚨 A frozen target stays frozen (§12, v7.57; §104). Once a week's target is
//    in the cache it is never recomputed, and the RPE step it was built with
//    is read back from the same entry. Everything here reads the cache
//    FIRST: a cached entry is the answer, whatever the logs now say.
// ═══════════════════════════════════════════════════════════════════════

import type { BlocState, Loose, Macrocycle } from './state.ts';
import {
  getWeekSets, getWeekWeight, getWeekReps, getGiantSetProgression, getProgressionLockKey, getProgKey,
  parseRepsForVolume, roundToIncrement, getMacroEffectiveMesoCount,
} from './progression.ts';
import { isDeloadUnit, isFirstUnitAfterDeload, isSubstitutedUnit } from './sessions.ts';

// The step a mesocycle's progression takes (§104): the weight jump's
// multiplier, and how many reps a rep-progression and a giant set add.
export interface RpeStep { kind: string; weightMult: number; repsInc: number; giantInc: number }

// A week's target, as cached under `${lockKey}_w${week}` (getWeekTargets).
// 🚨 Stored data: the shape is the contract with state.progressionTargets.
export interface WeekTarget {
  weightTargets: Loose[];
  repsTargets: Loose[];
  rpeStep?: 'easy' | 'hold'; // only when the week had one (§104)
  [k: string]: unknown;
}

// Where getWeekTargets reads and records targets. BLOC's wraps
// state.progressionTargets; Coach's reads the client's first and keeps its own
// computations in memory.
export interface TargetCache {
  get(key: string): WeekTarget | undefined;
  set(key: string, target: WeekTarget): void;
}

export interface RawTargets { sets: number; weightTargets: Loose[]; repsTargets: Loose[]; progType: string; rpeStep: string }
// `substituted` (v8.43, §137): the week was swapped or replaced by a group
// session, so there is nothing to judge (D4: N/A, never a miss).
export interface ComplianceResult { fullyLogged: boolean; compliant: boolean; weightTargets: Loose[] | null; repsTargets: Loose[] | null; sets: number; substituted?: boolean }

// A progression lock, as stored under state.progressionLocks[lockKey].
// 🚨 Stored data: the shape is the contract.
export interface LockEntry { weightTargets: Loose[]; repsTargets: Loose[]; sets: number; lockedAtWeek: number }
export type LockTransition = { key: string; set: LockEntry } | { key: string; clear: true } | null;

// exProgData()'s result, which renderTrainDay destructures.
export type ExerciseProgression = Loose;

// What BLOC's exProgData() knows from the lock sweep it runs first: the lock
// as it stood coming into this week (before this week's own evaluation), and
// whether one stood just before last week was evaluated.
export interface ProgressionOpts { lockComingIn?: Loose; prevWasLocked?: boolean }

// ── Effort ratings (RPE, v8.20 — TECHNICAL §104) ────────────────────────
// One rating per exercise per session per mesocycle, 1–10, given on the
// end-of-session sheet (openRpeSheet). Keyed exactly like a set log minus
// the set index — `${macroId}_${week}_${dayKey}_${exId}` — so dayKey carries
// the m1/m2 microcycle and each track's rating only ever steers that same
// track, the way computeRawSuggestedTargets' prevKey already works.
//
// 🚨 Closing the sheet stores { rpeSkipped: true }, NEVER a number. Adam:
// "Option to close assumes it was fine" — so a skip is neutral here (no
// speed-up, no hold) and the coach sees "Not rated". Do not "simplify" it
// into a default rating: a fake 6 or 7 is indistinguishable from an answer.
export function getRpeKey(macroId: string, week: number, dayKey: string, exId: string): string {
  return macroId + '_' + week + '_' + dayKey + '_' + exId;
}

// 🚨 Off unless explicitly true. Existing cycles have no `rpe` field and
// must read as OFF (Adam, 2026-09-27: existing and new Solo cycles default
// off; only coach-created cycles default on). Reading absent as on would
// switch ratings on for every existing cycle on first load.
export function isRpeOn(macro: Macrocycle | null | undefined): boolean {
  return !!(macro && macro.rpe === true);
}

// Whether ratings change targets. In Solo they do. 🚨 On a coach's cycle
// they don't: the coach owns the plan, so ratings only INFORM the coach there
// (Adam, 2026-09-27). This is the one switch.
// 🚨 v8.40 (§132): "the coach's cycle" is `publishedBy`, which is IN the
// data, never "is this phone linked" (that lives outside `state`, §129).
// BLOC Coach runs this engine on the client's uploaded state and must reach
// the same targets as the phone; a link check would split them. So a Solo
// cycle still running after linking stays Solo until the coach replaces it
// (Adam, 2026-09-28: "Coach's cycles only").
export function rpeDrivesProgression(macro: Macrocycle | null | undefined): boolean {
  return isRpeOn(macro) && !(macro && macro.publishedBy);
}

export const RPE_STEP_NONE: RpeStep = Object.freeze({ kind: 'none', weightMult: 1, repsInc: 1, giantInc: 10 });

// The step a rating asks for. 'easy' (compliant + RPE ≤ 6): a double step —
// 2× weightIncrement, heavy-leg 1.5× (Adam: "don't exclude heavy leg.
// Instead do 1.5x multiplier"), +2 reps, giant +20. 'hold' (compliant +
// RPE 9–10): no step at all for one mesocycle — not a lock; it releases on
// its own the week after, because the week after reads its own rating.
export function rpeStepFromKind(kind: string, ex: Loose): RpeStep {
  if (kind === 'easy') return { kind, weightMult: ex && ex.isHeavyLeg ? 1.5 : 2, repsInc: 2, giantInc: 20 };
  if (kind === 'hold') return { kind, weightMult: 0, repsInc: 0, giantInc: 0 };
  return RPE_STEP_NONE;
}

// Decides the step for `week` from the rating given in `week - 1` on the
// same dayKey track. Only ever called for an ordinary week — never for week
// 1, a deload, the session after a deload, or when the week before was a
// deload (Adam: deloads and the session after are exempt, as the
// compliance guard already exempts them). Cardio and maintenance have no
// step to change. A rating of 7–8, a skip, or a non-compliant week → none
// (not compliant + high RPE is already frozen by the lock; it adds a hint,
// never a second target change).
export function computeRpeStepKind(s: BlocState, cache: TargetCache, macro: Macrocycle, week: number, dayKey: string, ex: Loose): 'none' | 'easy' | 'hold' {
  if (!rpeDrivesProgression(macro)) return 'none';
  if (!ex || ex.category === 'cardio' || macro.goalType === 'maintenance') return 'none';
  if (week <= 1) return 'none';
  if (isDeloadUnit(s, macro, week, dayKey) || isFirstUnitAfterDeload(s, macro, week, dayKey)
      || isDeloadUnit(s, macro, week - 1, dayKey)) return 'none';
  const r: Loose = s.rpe && s.rpe[getRpeKey(macro.id, week - 1, dayKey, ex.id)];
  if (!r || typeof r.rpe !== 'number') return 'none';
  if (r.rpe > 6 && r.rpe < 9) return 'none';
  const prev = getWeekComplianceResult(s, cache, macro, week - 1, dayKey, ex);
  if (!prev.fullyLogged || !prev.compliant) return 'none';
  return r.rpe <= 6 ? 'easy' : 'hold';
}

// The step `week` uses, for BOTH the target the week is judged against
// (computeRawSuggestedTargets) and what Train displays (exProgData).
//
// 🚨 Frozen with the target. Once getWeekTargets() has cached a week's
// target, the step it was built with is stored on that same entry and
// read back from there — so a rating given (or edited) after the week was
// judged can never make the display disagree with the target, and never
// rewrites the frozen target itself. A cached entry with no `rpeStep`
// (every entry written before v8.20, and every week that had no step)
// reads as none — which is what keeps existing data byte-identical.
export function getRpeStep(s: BlocState, cache: TargetCache, macro: Macrocycle | null | undefined, week: number, dayKey: string, ex: Loose): RpeStep {
  if (!macro || !ex) return RPE_STEP_NONE;
  const cached = cache.get(getProgressionLockKey(macro.id, dayKey, ex.id) + '_w' + week);
  if (cached) return rpeStepFromKind(cached.rpeStep || 'none', ex);
  return rpeStepFromKind(computeRpeStepKind(s, cache, macro, week, dayKey, ex), ex);
}


export const PROG_STEP_MAINTENANCE: RpeStep = Object.freeze({ kind: 'maintenance', weightMult: 0, repsInc: 0, giantInc: 0 });
export function getProgressionStep(s: BlocState, cache: TargetCache, macro: Macrocycle | null | undefined, week: number, dayKey: string, ex: Loose): RpeStep {
  if (macro && macro.goalType === 'maintenance') return PROG_STEP_MAINTENANCE;
  return getRpeStep(s, cache, macro, week, dayKey, ex);
}

// "8" → "10" and "8–10" → "10–12" for inc 2; the +1 everywhere else in the
// engine is this with inc 1. Unparseable strings come back null.
export function bumpRepsBy(reps: Loose, inc: number): string | null {
  const m = String(reps).match(/^(\d+)(?:–(\d+))?$/);
  if (!m) return null;
  const lo = parseInt(m[1]) + inc;
  return m[2] ? lo + '–' + (parseInt(m[2]) + inc) : String(lo);
}

// Walks backward one track-week at a time from (beforeWeek - 1), skipping
// deload weeks entirely (they have no real target to be compliant
// against — and skipping past one keeps walking rather than stopping, so
// two deloads with nothing but misses between them still correctly reach
// all the way back), and returns the first week found where every set met
// or exceeded its own target. Week 1 is always the implicit floor — the
// exercise's genuine starting point — so the walk stops there
// unconditionally if nothing else qualifies first.
export function getLastCompliantWeek(s: BlocState, cache: TargetCache, macro: Macrocycle, dayKey: string, ex: Loose, beforeWeek: number): number {
  let w = beforeWeek - 1;
  while (w > 1) {
    // v8.43 (§137, D3): a swapped week is skipped exactly like a deload.
    if (isDeloadUnit(s, macro, w, dayKey) || isSubstitutedUnit(s, macro, w, dayKey, ex.id)) { w--; continue; }
    const result = getWeekComplianceResult(s, cache, macro, w, dayKey, ex);
    if (result.fullyLogged && result.compliant) return w;
    w--;
  }
  return 1;
}

// Recomputes the per-set weight/reps target this week WOULD suggest under
// normal progression rules — no lock applied. Used by the compliance check
// to know what should have been hit when no lock currently exists yet.
// Mirrors the per-set math in renderTrainDay's exProgData() exactly; kept
// as a standalone, non-render-scoped function (rather than reusing
// exProgData directly) because exProgData is a closure over whichever
// week/day is currently being VIEWED, while this must also be callable
// right after a log write for the week/day actually being LOGGED (in
// practice always the same, but this keeps the two concerns decoupled).
// Only ever called for a genuinely ordinary week (see getWeekTargets) —
// a post-deload week's target is a direct carry-forward of its reference
// week's own target instead, never a fresh "+jump" computation here.
export function computeRawSuggestedTargets(s: BlocState, cache: TargetCache, macro: Macrocycle, week: number, dayKey: string, ex: Loose): RawTargets {
  const isGain = macro.goalType === 'gain';
  const isMaintenance = macro.goalType === 'maintenance';
  const lightJump = isMaintenance ? 0 : parseFloat(macro.weightIncrement || '2.5');
  const heavyJump = isMaintenance ? 0 : (isGain ? 10 : 5);
  // v8.20: the RPE step scales the jump (2×, heavy-leg 1.5×, or 0 on a hold).
  const rpeStep = getProgressionStep(s, cache, macro, week, dayKey, ex);
  const weightJump = (ex.isHeavyLeg ? heavyJump : lightJump) * rpeStep.weightMult;
  const sets = getWeekSets(ex, week, macro.weeks as number);
  const pk = getProgKey(macro.id, week, dayKey, ex.id);
  const progLog: Loose = (s.trainLogs as Loose)[pk] || {};
  const progType = progLog.progType || 'weight';
  const isPauseSet = ex.type === 'pause';
  const prevWeek = week - 1;
  const prevKey = macro.id + '_' + prevWeek + '_' + dayKey;
  // Only a set actually marked done counts as a real progression source —
  // an in-progress, not-yet-confirmed entry (typed but not checked off) must
  // never seed a target that then gets cached and frozen forever (see the
  // caching note on evaluateProgressionLock below). Without this guard, a
  // stray draft value present in trainLogs at the moment this first gets
  // evaluated could compute a target that's silently wrong for good, even
  // after the real number is logged and confirmed moments later.
  let prevLoggedSets: Loose[] = [];
  if (prevWeek >= 1) {
    const prevSetsCount = getWeekSets(ex, prevWeek, macro.weeks as number);
    for (let i = 0; i < prevSetsCount; i++) {
      const prevLog = (s.trainLogs as Loose)[prevKey + '_' + ex.id + '_' + i];
      prevLoggedSets.push(prevLog && prevLog.done ? prevLog : null);
    }
  }
  const weightTargets: string[] = [], repsTargets: Loose[] = [];
  for (let i = 0; i < sets; i++) {
    const srcSet = i < prevLoggedSets.length
      ? prevLoggedSets[i]
      : (prevLoggedSets.length > 0 ? prevLoggedSets[prevLoggedSets.length - 1] : null);
    const setActualWeight = srcSet && srcSet.weight ? parseFloat(srcSet.weight) : null;
    const setActualReps   = srcSet && srcSet.reps   ? srcSet.reps : null;
    const setRecWeight = setActualWeight !== null
      ? setActualWeight + weightJump
      : getWeekWeight(ex, week, 'weight', macro.goalType, macro.weightIncrement);
    const setRecReps = (() => {
      if (isPauseSet) return getGiantSetProgression(ex, week, macro.goalType);
      if (ex.type === 'giant') {
        if (setActualReps !== null) {
          const baseNum = parseInt(String(setActualReps).match(/(\d+)/)?.[0] as string) || 0;
          return String(baseNum + rpeStep.giantInc);
        }
        return getGiantSetProgression(ex, week, macro.goalType);
      }
      if (setActualReps !== null) {
        const bumped = bumpRepsBy(setActualReps, rpeStep.repsInc);
        if (bumped !== null) return bumped;
      }
      return getWeekReps(ex, week, 'reps', macro.goalType);
    })();
    weightTargets.push(progType === 'weight'
      ? setRecWeight.toFixed(1)
      : (setActualWeight !== null ? setActualWeight.toFixed(1) : ex.startWeight.toFixed(1)));
    repsTargets.push(progType === 'reps'
      ? setRecReps
      : (setActualReps !== null ? setActualReps : ex.reps));
  }
  return { sets, weightTargets, repsTargets, progType, rpeStep: rpeStep.kind };
}

// v7.99: resolves what (macro, week, dayKey, ex) target IS/WAS — the
// single source of truth used by evaluateProgressionLock,
// getLastCompliantWeek's walk-back, AND exProgData's own display (see
// postDeloadTarget there), so there's exactly one answer anywhere in the
// app to "what did/does this week need to hit". Once a week's target is
// cached it's never recomputed (see the caching note in
// evaluateProgressionLock) — with one exception: a post-deload week's
// target is always a fresh, direct carry-forward of getLastCompliantWeek's
// own target (recursively — that reference week may itself have been
// post-deload, in which case its own target is likewise a carry-forward,
// and so on back to a genuine compliant week or week 1). This is a
// RESET, not a "continue progressing from" — the reference week's target
// is copied unchanged, with no weightJump/rep-increment applied on top;
// normal progression (computeRawSuggestedTargets) only resumes the
// following week, once this reset week has itself been evaluated.
export function getWeekTargets(s: BlocState, cache: TargetCache, macro: Macrocycle, week: number, dayKey: string, ex: Loose): WeekTarget {
  const lockKey = getProgressionLockKey(macro.id, dayKey, ex.id);
  const targetKey = lockKey + '_w' + week;
  const cached = cache.get(targetKey);
  if (cached) return cached;

  let raw: Loose;
  if (week === 1) {
    // Week 1 is the exercise's genuine starting point — not part of the
    // lock/compliance pipeline at all, so its "target" is simply its own
    // configured starting numbers, same as exProgData's week-1 display.
    const sets = getWeekSets(ex, 1, macro.weeks as number);
    raw = { weightTargets: Array(sets).fill(ex.startWeight.toFixed(1)), repsTargets: Array(sets).fill(ex.reps) };
  } else if (isFirstUnitAfterDeload(s, macro, week, dayKey)) {
    const refWeek = getLastCompliantWeek(s, cache, macro, dayKey, ex, week);
    raw = getWeekTargets(s, cache, macro, refWeek, dayKey, ex);
  } else {
    const existingLock: Loose = s.progressionLocks && s.progressionLocks[lockKey];
    if (existingLock) {
      raw = { weightTargets: existingLock.weightTargets, repsTargets: existingLock.repsTargets };
    } else if (isSubstitutedUnit(s, macro, week - 1, dayKey, ex.id)) {
      // 🚨 v8.43 (§137, D3): the week after a swap HOLDS the swapped week's
      // target: not penalised, and no jump ahead (proposal §4.3). Without this,
      // computeRawSuggestedTargets found no done sets for the planned exercise
      // last week and fell back to the THEORETICAL getWeekWeight
      // (startWeight + jump × (week − 1)). Copied without its rpeStep: that
      // step belonged to the swapped week, not this one. Recursive, so two
      // swaps in a row hold the same number.
      const held = getWeekTargets(s, cache, macro, week - 1, dayKey, ex);
      raw = { weightTargets: held.weightTargets, repsTargets: held.repsTargets };
    } else {
      raw = computeRawSuggestedTargets(s, cache, macro, week, dayKey, ex);
    }
  }
  const result: WeekTarget = { weightTargets: raw.weightTargets.slice(), repsTargets: raw.repsTargets.slice() };
  // v8.20: freeze the RPE step with the target (see getRpeStep). Only written
  // when there was one, so every no-RPE entry keeps its pre-v8.20 shape.
  if (raw.rpeStep === 'easy' || raw.rpeStep === 'hold') result.rpeStep = raw.rpeStep;
  cache.set(targetKey, result);
  return result;
}

// v7.99: the single compliance comparison — shared by evaluateProgressionLock
// and getLastCompliantWeek's walk-back (previously duplicated between
// evaluateProgressionLock and exProgData's missedTarget check; both now
// call this instead, so there is exactly one comparison implementation in
// the whole app). Returns fullyLogged: false if the session isn't
// completely logged and marked done yet — nothing to evaluate; compliant
// is only meaningful when fullyLogged is true.
export function getWeekComplianceResult(s: BlocState, cache: TargetCache, macro: Macrocycle, week: number, dayKey: string, ex: Loose): ComplianceResult {
  const sets = getWeekSets(ex, week, macro.weeks as number);
  // v8.43 (§137, D3/D4): a swapped week's logs are another exercise's, so
  // there's nothing to judge. Not "fully logged", so the lock never moves on
  // it (computeLockTransition), the week after gets no RPE step from it
  // (computeRpeStepKind), and "missed target" never shows.
  if (isSubstitutedUnit(s, macro, week, dayKey, ex.id)) {
    return { fullyLogged: false, compliant: false, weightTargets: null, repsTargets: null, sets, substituted: true };
  }
  const key2 = macro.id + '_' + week + '_' + dayKey;
  const logs: Loose[] = [];
  for (let i = 0; i < sets; i++) {
    const log = (s.trainLogs as Loose)[key2 + '_' + ex.id + '_' + i];
    if (!log || !log.done) return { fullyLogged: false, compliant: false, weightTargets: null, repsTargets: null, sets };
    logs.push(log);
  }
  if (sets === 0) return { fullyLogged: false, compliant: false, weightTargets: null, repsTargets: null, sets };

  const { weightTargets, repsTargets } = getWeekTargets(s, cache, macro, week, dayKey, ex);

  let compliant = true;
  for (let i = 0; i < sets; i++) {
    const targetW = weightTargets[i] !== undefined ? weightTargets[i] : weightTargets[weightTargets.length - 1];
    const targetR = repsTargets[i] !== undefined ? repsTargets[i] : repsTargets[repsTargets.length - 1];
    const actualW = logs[i].weight ? parseFloat(logs[i].weight) : null;
    const actualR = logs[i].reps !== undefined && logs[i].reps !== null ? String(logs[i].reps).trim() : '';
    // Meeting OR exceeding the suggested number is compliant — only
    // falling short is a miss. A machine that only lets you jump by 5kg
    // when the plan called for 2.5kg, or an extra couple of reps past the
    // target, isn't a compliance failure; it's still progression, just by
    // more than planned. Reps compare via parseRepsForVolume's lower-bound
    // extraction so ranges (e.g. "8–10") compare sensibly too.
    const wOk = actualW !== null && targetW !== undefined && (actualW - parseFloat(targetW) > -0.01);
    const rOk = targetR !== undefined && parseRepsForVolume(actualR) >= parseRepsForVolume(targetR);
    if (!wOk || !rOk) { compliant = false; break; }
  }
  return { fullyLogged: true, compliant, weightTargets, repsTargets, sets };
}

// Whether (macro, week, dayKey, ex) creates, clears or leaves the
// exercise's progression lock, based on getWeekComplianceResult. Only
// decides once every set for this exercise is logged AND marked done; a
// partially-logged session is left unevaluated (null). Skipped for
// maintenance cycles, week 1 (nothing to compare against yet), and true
// deload weeks — but NOT post-deload weeks (v7.99): those are evaluated
// exactly like any other week, just against a target resolved via
// getLastCompliantWeek instead of week-1. A post-deload week's own miss
// always replaces any existing (possibly stale) lock outright with a fresh
// one at the walked-back target — it never silently continues fighting an
// old frozen number from before the deload.
//
// Returns null (no change), { key, set } (lock at these targets) or
// { key, clear: true }. It was evaluateProgressionLock's body until v8.35,
// which wrote the change and saved; BLOC's evaluateProgressionLock() still
// does, from this.
export function computeLockTransition(s: BlocState, cache: TargetCache, macro: Macrocycle | null | undefined, week: number, dayKey: string, ex: Loose): LockTransition {
  if (!macro || !ex) return null;
  if (macro.goalType === 'maintenance') return null;
  if (week <= 1) return null;
  if (isDeloadUnit(s, macro, week, dayKey)) return null;

  const lockKey = getProgressionLockKey(macro.id, dayKey, ex.id);
  const result = getWeekComplianceResult(s, cache, macro, week, dayKey, ex);
  if (!result.fullyLogged) return null; // session not fully logged yet — wait

  const existingLock: Loose = s.progressionLocks && s.progressionLocks[lockKey];
  const isPostDeload = isFirstUnitAfterDeload(s, macro, week, dayKey);

  if (!result.compliant) {
    if (!existingLock || isPostDeload) {
      return { key: lockKey, set: {
        weightTargets: (result.weightTargets as Loose[]).slice(),
        repsTargets: (result.repsTargets as Loose[]).slice(),
        sets: result.sets, lockedAtWeek: week,
      } };
    }
    // Already locked on an ordinary week — target stays frozen exactly as
    // first set; nothing to update.
    return null;
  } else if (existingLock) {
    return { key: lockKey, clear: true };
  }
  return null;
}

// ── What Train suggests for one exercise (renderTrainDay's exProgData) ────
// Everything the exercise card shows: the per-set weight/reps placeholders
// (deload, post-deload reset, lock, week 1, or last week's actual + the
// step, per the week's route), last week's route, the drop-set portion,
// done sets, and whether a finished session missed its target.
// Pure: reads `s`, and reads and fills `cache` through getWeekTargets.
export function computeExerciseProgression(s: BlocState, cache: TargetCache, macro: Macrocycle, week: number, dayKey: string, ex: Loose,
  opts?: ProgressionOpts): ExerciseProgression {
  const exId = ex.id;
  const logsOf = s.trainLogs as Loose;
  // renderTrainDay's session-level flags, computed here from the same inputs.
  const isDeloadSession   = isDeloadUnit(s, macro, week, dayKey);
  const isPostDeloadSession = isFirstUnitAfterDeload(s, macro, week, dayKey);
  // Cardio exercises never participate in progression/compliance — see
  // CARDIO EXERCISES section. Short-circuit with safe zeroed values so
  // this can never throw, however it's reached (e.g. as a superset
  // member) — but doneSets/allDone are computed for real, since the
  // superset card's combined "done" badge sums doneSets across every
  // member regardless of category.
  if (ex.category === 'cardio') {
    const sets = getWeekSets(ex, week, macro.weeks as number);
    const key2c = macro.id + '_' + week + '_' + dayKey;
    let doneSetsC = 0;
    for (let i = 0; i < sets; i++) {
      if ((logsOf[key2c + '_' + exId + '_' + i] || {}).done) doneSetsC++;
    }
    return {
      exId, sets, progType: 'weight', prevProgType: null, prevLoggedSets: [],
      prevActualWeight: null, prevActualReps: null, recommendedWeight: 0, recommendedReps: '0',
      weightPlaceholder: '0.0', repsPlaceholder: '0',
      weightPlaceholders: Array(sets).fill('0.0'), repsPlaceholders: Array(sets).fill('0'),
      dropWeightPlaceholders: [], dropRepsPlaceholders: [],
      weightJump: 0, isPauseSet: false, doneSets: doneSetsC, allDone: doneSetsC === sets && sets > 0, missedTarget: false,
      prevWeek2: week - 1, prevNoProgression: false,
      isDeloadSession, isPostDeloadSession, isLocked: false, prevWasLocked: false,
      isDropSet: false, prevActualDropWeight: null, prevActualDropReps: null,
      recommendedDropWeight: 0, recommendedDropReps: '0', dropWeightPlaceholder: '0.0', dropRepsPlaceholder: '0',
    };
  }
  // ── The retroactive compliance catch-up is the CALLER's ──────────
  // BLOC's exProgData() sweeps every PRIOR week through
  // evaluateProgressionLock() before calling this, noting whether a lock
  // stood just before the last week was evaluated (`prevWasLocked`), and
  // passes the lock as it stood coming into this week (`lockComingIn`).
  // Those sweeps WRITE progressionLocks and save() (deep dive H1/H3), so
  // they stay in BLOC; Coach runs computeLockTransition on its own copy.
  // Without opts: the lock stored in `s`, and prevWasLocked false.
  const prevWasLocked = !!(opts && opts.prevWasLocked);
  const isPauseSet= ex.type === 'pause';
  const isDropSet = ex.type === 'dropset';
  const isGain        = macro.goalType === 'gain';
  const isMaintenance = macro.goalType === 'maintenance';
  // Maintenance cycles carry forward last week's values exactly — no load
  // progression is suggested. The progression selector is also hidden for
  // maintenance cycles (see renderTrainDay). weightJump = 0 here ensures
  // the fill-suggested / quick-complete buttons use the previous weight.
  // weightIncrement is user-configurable and applies to light exercises
  // regardless of cycle type; heavy-leg jumps stay fixed (5kg loss /
  // 10kg gain) and are never affected by the user's setting.
  const lightJump = isMaintenance ? 0 : parseFloat(macro.weightIncrement || '2.5');
  const heavyJump = isMaintenance ? 0 : (isGain ? 10 : 5);
  const weightJump= ex.isHeavyLeg ? heavyJump : lightJump;
  const sets      = getWeekSets(ex, week, macro.weeks as number);
  const pk        = getProgKey(macro.id, week, dayKey, exId);
  const progLog: Loose = logsOf[pk] || {};
  const progType  = progLog.progType || 'weight';
  const prevWeek2 = week - 1;
  const prevPk    = getProgKey(macro.id, prevWeek2, dayKey, exId);
  const prevProgLog: Loose = logsOf[prevPk] || {};
  const prevKey2  = macro.id + '_' + prevWeek2 + '_' + dayKey;

  // ── Progression compliance lock ──────────────────────────────────
  // See PROGRESSION COMPLIANCE GUARD section for how this is created/
  // cleared. Read AFTER the catch-up sweep above (which stops short of
  // this week), so isLocked reflects the state coming into this week —
  // stable for the whole time you're viewing/logging it.
  const progLock: Loose = opts && 'lockComingIn' in opts ? opts.lockComingIn
    : (s.progressionLocks && s.progressionLocks[getProgressionLockKey(macro.id, dayKey, exId)]);
  // Deliberately excludes a lock whose lockedAtWeek equals THIS week —
  // that means this week's own evaluation is what just created it (e.g.
  // via the trailing evaluate below, or a toggle mid-session), which
  // must not hide this week's own chips/button. Only a lock inherited
  // from a strictly earlier week should affect what's shown right now.
  // v7.99: also suppressed outright during deload/post-deload — a
  // deload week always shows its flat 60% figure, and a post-deload
  // week always shows a fresh target walked back to the last compliant
  // week (getLastCompliantWeek) rather than any inherited frozen
  // number, even if one exists. Either way, this exercise's own
  // evaluation below (which now runs for post-deload weeks too) is
  // what decides whether NEXT week sees a lock — never this render.
  const isLocked = !isDeloadSession && !isPostDeloadSession
    && !!progLock && (progLock.lockedAtWeek || 0) < week;
  // (BLOC evaluates THIS week's own compliance between capturing the lock
  // above and calling this, so it only ever affects what NEXT week sees.)
  const postDeloadTarget = isPostDeloadSession
    ? getWeekTargets(s, cache, macro, week, dayKey, ex)
    : null;
  // v8.43 (§137, D3). THIS week swapped for another exercise: nothing the
  // planned exercise did or should do applies to the card, so no last week,
  // no suggestion and no target. The week AFTER a swap: its held target
  // (getWeekTargets carries the swapped week's), shown the way a post-deload
  // week shows its reset target, with last week's (the substitute's) numbers
  // hidden. A lock or a deload wins over either, as they do everywhere.
  const isSwapped = isSubstitutedUnit(s, macro, week, dayKey, exId);
  const heldAfterSwap = !isSwapped && !isDeloadSession && !isPostDeloadSession && !isLocked
    && week > 1 && isSubstitutedUnit(s, macro, week - 1, dayKey, exId);
  const heldTarget = heldAfterSwap ? getWeekTargets(s, cache, macro, week, dayKey, ex) : null;
  const hidePrev = isSwapped || heldAfterSwap;
  // v8.20 — the effort-rating step, the SAME one computeRawSuggestedTargets
  // uses (getRpeStep; frozen with the cached target once there is one), so
  // what Train shows and what the week is judged against cannot disagree.
  // 🚨 rpeJump is for progression only. The deload 60% rounding below keeps
  // using the plain weightJump — a double step must not change deload maths.
  const rpeStep = getProgressionStep(s, cache, macro, week, dayKey, ex);
  const rpeJump = weightJump * rpeStep.weightMult;

  // Same done-check as computeRawSuggestedTargets() above — a set that's
  // been typed but not yet confirmed must never seed a target, here or
  // there, so the two implementations can't quietly drift apart again.
  let prevLoggedSets: Loose[] = [];
  if (prevWeek2 >= 1) {
    const prevSetsCount = getWeekSets(ex, prevWeek2, macro.weeks as number);
    for (let i = 0; i < prevSetsCount; i++) {
      const lk = prevKey2 + '_' + exId + '_' + i;
      const prevLog = logsOf[lk];
      prevLoggedSets.push(prevLog && prevLog.done && !hidePrev ? prevLog : null);
    }
  }
  const prevSet1          = prevLoggedSets[0];
  const prevActualWeight  = prevSet1 && prevSet1.weight ? parseFloat(prevSet1.weight) : null;
  const prevActualReps    = prevSet1 && prevSet1.reps   ? prevSet1.reps : null;
  // Drop-set only: the drop portion of the same set-1 log entry. Stored
  // alongside the main weight/reps on the same trainLogs object (not a
  // separate set index) — see the DROP SET section of the Train
  // renderer for how these two fields are logged per set.
  const prevActualDropWeight = prevSet1 && prevSet1.dropWeight ? parseFloat(prevSet1.dropWeight) : null;
  const prevActualDropReps   = prevSet1 && prevSet1.dropReps   ? prevSet1.dropReps : null;
  // Infer which progression path was used last week when it was never
  // explicitly chosen (e.g. filled via "Fill suggested" then just checked
  // done): compare last week's actual weight/reps against the week before
  // that one (or the exercise's starting values, if last week was week 1).
  // Weight increase wins first; if weight didn't increase, check reps;
  // if neither increased, there's no detectable progression to report.
  let prevProgType: string | null = prevProgLog.progType || null;
  let prevNoProgression = false;
  // If last week started off locked, we already know (by elimination —
  // otherwise this week would itself still be locked) that it must have
  // been the week that successfully cleared the lock, not a genuine new
  // progression decision. Skip the inference below entirely so the
  // header shows nothing rather than a misleading "↑ weight/reps".
  if (prevWasLocked || hidePrev) {
    prevProgType = null;
  } else if (!prevProgType && prevActualWeight !== null) {
    const priorWeek = prevWeek2 - 1;
    let priorWeight: Loose, priorReps: Loose;
    if (priorWeek < 1) {
      priorWeight = ex.startWeight;
      priorReps   = ex.reps;
    } else {
      const priorLog = logsOf[macro.id + '_' + priorWeek + '_' + dayKey + '_' + exId + '_0'];
      priorWeight = priorLog && priorLog.weight ? parseFloat(priorLog.weight) : null;
      priorReps   = priorLog && priorLog.reps   ? priorLog.reps : null;
    }
    if (priorWeight !== null && prevActualWeight > priorWeight) {
      prevProgType = 'weight';
    } else if (priorReps !== null && prevActualReps !== null &&
               parseRepsForVolume(prevActualReps) > parseRepsForVolume(priorReps)) {
      prevProgType = 'reps';
    } else {
      prevNoProgression = true;
    }
  }
  const recommendedWeight = heldTarget ? parseFloat(heldTarget.weightTargets[0])
    : prevActualWeight !== null
    ? prevActualWeight + rpeJump
    : getWeekWeight(ex, week, 'weight', macro.goalType, macro.weightIncrement);
  const recommendedReps = (() => {
    if (heldTarget) return heldTarget.repsTargets[0];
    if (isPauseSet) return getGiantSetProgression(ex, week, macro.goalType); // fixed base, weight-only progression
    if (ex.type === 'giant') {
      if (prevActualReps !== null) {
        // Base the suggestion on what was actually logged last week, not on
        // mesoweek count — so choosing "weight" progression one week doesn't
        // silently double the reps jump the following week.
        const baseNum = parseInt(String(prevActualReps).match(/(\d+)/)?.[0] as string) || 0;
        return String(baseNum + rpeStep.giantInc);
      }
      return getGiantSetProgression(ex, week, macro.goalType); // no prior log yet (e.g. week 2)
    }
    if (prevActualReps !== null) {
      const bumped = bumpRepsBy(prevActualReps, rpeStep.repsInc);
      if (bumped !== null) return bumped;
    }
    return getWeekReps(ex, week, 'reps', macro.goalType);
  })();
  // Drop-set only: the drop portion follows the exact same progression
  // math as the main set (same weightJump, same +1-rep step) so 'apply
  // the same progression to both' holds — but with no plan-time
  // fallback target, since the drop weight/reps are never pre-planned,
  // only discovered live. If there's no prior actual drop data, there's
  // simply nothing to suggest yet (null / blank), unlike the main set
  // which always has ex.startWeight to fall back on.
  const recommendedDropWeight = prevActualDropWeight !== null ? prevActualDropWeight + rpeJump : null;
  const recommendedDropReps = (() => {
    if (prevActualDropReps !== null) {
      const bumped = bumpRepsBy(prevActualDropReps, rpeStep.repsInc);
      if (bumped !== null) return bumped;
    }
    return '';
  })();
  // ── Deload override ──────────────────────────────────────────────
  // A deload session ignores normal progression entirely: weight drops
  // to 60% of whatever was actually logged last time (rounded to this
  // exercise's own increment — weightJump, computed above), reps stay
  // exactly as last logged. A post-deload session needs no override of
  // its own (v7.99) — it's just an ordinary progression week whose
  // reference point (prevWeek2/prevKey2 above) already walked back past
  // the deload to the last genuinely compliant week, so the normal
  // weightPlaceholder/repsPlaceholder math below produces the correct
  // reset numbers automatically.
  let deloadWeightPlaceholder: Loose = null, deloadRepsPlaceholder: Loose = null;
  let deloadDropWeightPlaceholder: Loose = null, deloadDropRepsPlaceholder: Loose = null;
  if (isDeloadSession) {
    const baseWeight = prevActualWeight !== null ? prevActualWeight
      : getWeekWeight(ex, week, 'weight', macro.goalType, macro.weightIncrement);
    const baseReps = prevActualReps !== null ? prevActualReps : ex.reps;
    deloadWeightPlaceholder = roundToIncrement(baseWeight * 0.6, weightJump).toFixed(1);
    deloadRepsPlaceholder = baseReps;
    if (isDropSet) {
      // Drop weight only reduces if there's something real to reduce —
      // no fallback target to fall back to, unlike the main set.
      deloadDropWeightPlaceholder = prevActualDropWeight !== null
        ? roundToIncrement(prevActualDropWeight * 0.6, weightJump).toFixed(1)
        : '';
      deloadDropRepsPlaceholder = prevActualDropReps !== null ? prevActualDropReps : '';
    }
  }
  // Locked single-value fallbacks (exercise-wide — set 1's frozen target),
  // used only when deload doesn't already override (deload always wins).
  const lockWeightPlaceholder = isLocked
    ? (progLock.weightTargets[0] !== undefined ? progLock.weightTargets[0] : progLock.weightTargets[progLock.weightTargets.length - 1])
    : null;
  const lockRepsPlaceholder = isLocked
    ? (progLock.repsTargets[0] !== undefined ? progLock.repsTargets[0] : progLock.repsTargets[progLock.repsTargets.length - 1])
    : null;
  const weightPlaceholder = isSwapped ? ''
    : deloadWeightPlaceholder !== null ? deloadWeightPlaceholder
    : postDeloadTarget !== null ? postDeloadTarget.weightTargets[0]
    : heldTarget !== null ? heldTarget.weightTargets[0]
    : lockWeightPlaceholder !== null ? lockWeightPlaceholder
    : week === 1
    ? ex.startWeight.toFixed(1)
    : progType === 'weight' ? recommendedWeight.toFixed(1)
      : (prevActualWeight !== null ? prevActualWeight.toFixed(1) : ex.startWeight.toFixed(1));
  const repsPlaceholder = isSwapped ? ''
    : deloadRepsPlaceholder !== null ? deloadRepsPlaceholder
    : postDeloadTarget !== null ? postDeloadTarget.repsTargets[0]
    : heldTarget !== null ? heldTarget.repsTargets[0]
    : lockRepsPlaceholder !== null ? lockRepsPlaceholder
    : week === 1
    ? ex.reps
    : progType === 'reps' ? recommendedReps
      : (prevActualReps !== null ? prevActualReps : ex.reps);
  // Drop-set only: mirrors weightPlaceholder/repsPlaceholder exactly,
  // just with no week-1 (or otherwise-no-prior-data) fallback target —
  // blank means "nothing to suggest yet, log it live".
  const dropWeightPlaceholder = !isDropSet ? '' : deloadDropWeightPlaceholder !== null ? deloadDropWeightPlaceholder
    : week === 1 ? ''
    : progType === 'weight' ? (recommendedDropWeight !== null ? recommendedDropWeight.toFixed(1) : '')
      : (prevActualDropWeight !== null ? prevActualDropWeight.toFixed(1) : '');
  const dropRepsPlaceholder = !isDropSet ? '' : deloadDropRepsPlaceholder !== null ? deloadDropRepsPlaceholder
    : week === 1 ? ''
    : progType === 'reps' ? recommendedDropReps
      : (prevActualDropReps !== null ? prevActualDropReps : '');

  // ── Per-set suggested placeholders ─────────────────────────────────
  // v6.09: suggestions now key off the same set number in the previous
  // mesocycle/day, rather than a single exercise-wide figure derived from
  // set 1. This lets an ad-hoc mid-session weight drop (e.g. set 4 dropped
  // to 195kg because 200kg wasn't sustainable) carry forward correctly
  // into the next mesocycle for that specific set only, while the other
  // sets still progress from their own last actual numbers. If this
  // week has more sets than last week (a set added partway through a
  // plan), the extra set(s) simply inherit last week's final set's
  // suggestion. True deload and week-1 sessions are unaffected — they
  // already use a single flat reference for the whole exercise, and
  // that behaviour is preserved unchanged here. Post-deload (v7.99) DOES
  // use per-set targets, same as locked/normal weeks — see
  // postDeloadTarget below.
  const weightPlaceholders: Loose[] = [], repsPlaceholders: Loose[] = [], dropWeightPlaceholders: Loose[] = [], dropRepsPlaceholders: Loose[] = [];
  for (let i = 0; i < sets; i++) {
    if (isSwapped) {
      weightPlaceholders.push(''); repsPlaceholders.push(''); dropWeightPlaceholders.push(''); dropRepsPlaceholders.push('');
      continue;
    }
    if (deloadWeightPlaceholder !== null) {
      weightPlaceholders.push(deloadWeightPlaceholder);
      repsPlaceholders.push(deloadRepsPlaceholder);
      dropWeightPlaceholders.push(!isDropSet ? '' : (deloadDropWeightPlaceholder !== null ? deloadDropWeightPlaceholder : ''));
      dropRepsPlaceholders.push(!isDropSet ? '' : (deloadDropRepsPlaceholder !== null ? deloadDropRepsPlaceholder : ''));
      continue;
    }
    if (postDeloadTarget !== null) {
      const pw = postDeloadTarget.weightTargets[i] !== undefined ? postDeloadTarget.weightTargets[i] : postDeloadTarget.weightTargets[postDeloadTarget.weightTargets.length - 1];
      const pr = postDeloadTarget.repsTargets[i] !== undefined ? postDeloadTarget.repsTargets[i] : postDeloadTarget.repsTargets[postDeloadTarget.repsTargets.length - 1];
      weightPlaceholders.push(pw);
      repsPlaceholders.push(pr);
      // The drop-set portion has no reset target of its own (never part
      // of the compliance guard, same exemption true deload's drop
      // handling already has) — falls back to last actual, if any.
      dropWeightPlaceholders.push(!isDropSet ? '' : (prevActualDropWeight !== null ? prevActualDropWeight.toFixed(1) : ''));
      dropRepsPlaceholders.push(!isDropSet ? '' : (prevActualDropReps !== null ? prevActualDropReps : ''));
      continue;
    }
    if (heldTarget !== null) {
      const hw = heldTarget.weightTargets[i] !== undefined ? heldTarget.weightTargets[i] : heldTarget.weightTargets[heldTarget.weightTargets.length - 1];
      const hr = heldTarget.repsTargets[i] !== undefined ? heldTarget.repsTargets[i] : heldTarget.repsTargets[heldTarget.repsTargets.length - 1];
      weightPlaceholders.push(hw);
      repsPlaceholders.push(hr);
      dropWeightPlaceholders.push('');
      dropRepsPlaceholders.push('');
      continue;
    }
    if (week === 1) {
      weightPlaceholders.push(ex.startWeight.toFixed(1));
      repsPlaceholders.push(ex.reps);
      dropWeightPlaceholders.push('');
      dropRepsPlaceholders.push('');
      continue;
    }
    // Source set for this index: the same set number logged last week, or
    // — if this week has extra sets that didn't exist last week — last
    // week's final logged set, so a newly-added set isn't left blank.
    const srcSet = i < prevLoggedSets.length
      ? prevLoggedSets[i]
      : (prevLoggedSets.length > 0 ? prevLoggedSets[prevLoggedSets.length - 1] : null);
    const setActualWeight    = srcSet && srcSet.weight ? parseFloat(srcSet.weight) : null;
    const setActualReps      = srcSet && srcSet.reps   ? srcSet.reps : null;
    const setActualDropWeight= srcSet && srcSet.dropWeight ? parseFloat(srcSet.dropWeight) : null;
    const setActualDropReps  = srcSet && srcSet.dropReps   ? srcSet.dropReps : null;

    const setRecWeight = setActualWeight !== null
      ? setActualWeight + rpeJump
      : getWeekWeight(ex, week, 'weight', macro.goalType, macro.weightIncrement);
    const setRecReps = (() => {
      if (isPauseSet) return getGiantSetProgression(ex, week, macro.goalType);
      if (ex.type === 'giant') {
        if (setActualReps !== null) {
          const baseNum = parseInt(String(setActualReps).match(/(\d+)/)?.[0] as string) || 0;
          return String(baseNum + rpeStep.giantInc);
        }
        return getGiantSetProgression(ex, week, macro.goalType);
      }
      if (setActualReps !== null) {
        const bumped = bumpRepsBy(setActualReps, rpeStep.repsInc);
        if (bumped !== null) return bumped;
      }
      return getWeekReps(ex, week, 'reps', macro.goalType);
    })();
    const setRecDropWeight = setActualDropWeight !== null ? setActualDropWeight + rpeJump : null;
    const setRecDropReps = (() => {
      if (setActualDropReps !== null) {
        const bumped = bumpRepsBy(setActualDropReps, rpeStep.repsInc);
        if (bumped !== null) return bumped;
      }
      return '';
    })();

    // Locked exercise: main weight/reps freeze at the lock's original
    // missed target (same value every week until compliance is met) —
    // completely overriding progType/normal math for the main set. The
    // drop portion below is never part of the guard, so it keeps
    // following its own normal formula regardless of lock state.
    if (isLocked) {
      const lockW = progLock.weightTargets[i] !== undefined ? progLock.weightTargets[i] : progLock.weightTargets[progLock.weightTargets.length - 1];
      const lockR = progLock.repsTargets[i] !== undefined ? progLock.repsTargets[i] : progLock.repsTargets[progLock.repsTargets.length - 1];
      weightPlaceholders.push(lockW);
      repsPlaceholders.push(lockR);
    } else {
      weightPlaceholders.push(progType === 'weight'
        ? setRecWeight.toFixed(1)
        : (setActualWeight !== null ? setActualWeight.toFixed(1) : ex.startWeight.toFixed(1)));
      repsPlaceholders.push(progType === 'reps'
        ? setRecReps
        : (setActualReps !== null ? setActualReps : ex.reps));
    }
    dropWeightPlaceholders.push(!isDropSet ? '' : (progType === 'weight'
      ? (setRecDropWeight !== null ? setRecDropWeight.toFixed(1) : '')
      : (setActualDropWeight !== null ? setActualDropWeight.toFixed(1) : '')));
    dropRepsPlaceholders.push(!isDropSet ? '' : (progType === 'reps'
      ? setRecDropReps
      : (setActualDropReps !== null ? setActualDropReps : '')));
  }

  let doneSets = 0;
  const key2 = macro.id + '_' + week + '_' + dayKey;
  for (let i = 0; i < sets; i++) {
    const lk = key2 + '_' + exId + '_' + i;
    if ((logsOf[lk] || {}).done) doneSets++;
  }
  const allDone = doneSets === sets && sets > 0;

  // Whether a fully-completed session actually matched its own target
  // (main set only — drop-set drop portions are never part of this,
  // same exemption as the compliance guard itself). Only meaningful on
  // a genuine progression week; a true deload/maintenance/week-1
  // session doesn't have a "target" to miss in this sense. A
  // post-deload session DOES (v7.99) — its target is the walked-back
  // getLastCompliantWeek reference, and missing it is exactly as real
  // as missing any other week's.
  //
  // v8.35 (§125, deep dive §1d): this IS the lock's own decision,
  // getWeekComplianceResult, not a third copy of the comparison. Until v8.35
  // it re-compared the logs against the DISPLAYED placeholders, which are
  // computed live from last week's actuals and so can drift from the target
  // the week is judged against (frozen in progressionTargets the moment the
  // week was first evaluated), e.g. after last week's logs are edited or the
  // route switched. The badge could then say "missed" while the lock said
  // compliant, or the reverse. The lock's own evaluation has already run for
  // this week by now (BLOC's exProgData() evaluates it before calling this),
  // so its target is cached and this reads it back: no new write.
  let missedTarget = false;
  if (allDone && !isDeloadSession && !isMaintenance && week > 1) {
    const c = getWeekComplianceResult(s, cache, macro, week, dayKey, ex);
    missedTarget = c.fullyLogged && !c.compliant;
  }

  return { exId, sets, progType, prevProgType, prevLoggedSets, prevActualWeight, prevActualReps,
           recommendedWeight, recommendedReps, weightPlaceholder, repsPlaceholder,
           weightPlaceholders, repsPlaceholders, dropWeightPlaceholders, dropRepsPlaceholders,
           weightJump, isPauseSet, doneSets, allDone, missedTarget, prevWeek2, prevNoProgression,
           isDeloadSession, isPostDeloadSession, isLocked, prevWasLocked,
           isDropSet, prevActualDropWeight, prevActualDropReps,
           recommendedDropWeight, recommendedDropReps, dropWeightPlaceholder, dropRepsPlaceholder,
           // v8.43 (§137): only when true, so every existing output is unchanged.
           ...(isSwapped ? { isSwapped: true } : {}), ...(heldAfterSwap ? { heldAfterSwap: true } : {}) };
}

// ── v8.43 (§137): the I2 replay, after the coach logs a session ───────────
// Deep dive I2: the target cache assumed logs only change on this device. A
// coach-logged week w arriving AFTER the client's phone evaluated later weeks
// would leave those weeks' targets and the lock computed without it, frozen
// for good. So, per exercise the coach logged:
//   1. 🚨 §0: targets for weeks AFTER w that the client has NOT logged are
//      dropped and recompute from the coach's numbers. A week with any set
//      logged keeps its target: logged weeks never change. (The same rule as
//      a changed plan, invalidateUnloggedTargets in BLOC.)
//   2. the lock is dropped and replayed from week 2, in order, through
//      computeLockTransition: exactly the sequence the client would have
//      produced had the coach's week been logged on the phone.
// Pure: it works on a copy of the locks and an overlay of the cache, and
// returns the changes. BLOC writes them (the H1/H3 split, §125).
export interface ProgressionReplay {
  deleteTargets: string[];
  setTargets: Record<string, WeekTarget>;
  locks: Record<string, LockEntry | null>;
}
export function replayProgressionAfterLog(s: BlocState, cache: TargetCache, macro: Macrocycle, week: number, dayKey: string, exercises: Loose[]): ProgressionReplay {
  const out: ProgressionReplay = { deleteTargets: [], setTargets: {}, locks: {} };
  const total = getMacroEffectiveMesoCount(macro);
  const logKeys = Object.keys(s.trainLogs || {});
  const locks: Record<string, unknown> = { ...(s.progressionLocks || {}) };
  const ws: BlocState = { ...s, progressionLocks: locks };
  for (const ex of exercises) {
    if (!ex || !ex.id || ex.category === 'cardio') continue;
    const lockKey = getProgressionLockKey(macro.id, dayKey, ex.id);
    const logged = (w: number) => { const p = macro.id + '_' + w + '_' + dayKey + '_' + ex.id + '_'; return logKeys.some(k => k.startsWith(p)); };
    const hidden = new Set<string>();
    for (let w = week + 1; w <= total; w++) {
      const k = lockKey + '_w' + w;
      if (cache.get(k) && !logged(w)) { hidden.add(k); out.deleteTargets.push(k); }
    }
    const local: Record<string, WeekTarget> = {};
    const overlay: TargetCache = {
      get: k => (k in local ? local[k] : hidden.has(k) ? undefined : cache.get(k)),
      set: (k, t) => { local[k] = t; },
    };
    delete locks[lockKey];
    for (let w = 2; w <= total; w++) {
      const t = computeLockTransition(ws, overlay, macro, w, dayKey, ex);
      if (!t) continue;
      if ('set' in t) locks[t.key] = t.set; else delete locks[t.key];
    }
    out.locks[lockKey] = (locks[lockKey] as LockEntry) || null;
    Object.assign(out.setTargets, local);
  }
  return out;
}
