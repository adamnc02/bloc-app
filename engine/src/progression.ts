// ═══════════════════════════════════════════════════════════════════════
// Progression leaves and a macrocycle's shape (deep dive §1a, §10 step 3;
// TECHNICAL §124).
//
// Moved from index.html in v8.34, UNCHANGED: each keeps a same-named global
// shim there, so none of BLOC's call sites change. Pure: the arguments are
// all they read.
//
// 🚨 The key builders (getDeloadUnitKey, getProgressionLockKey, getProgKey)
//    are the contract with STORED data — state.deloads, progressionLocks and
//    the trainLogs progression records. Changing a format orphans every entry
//    already saved under the old one.
// ═══════════════════════════════════════════════════════════════════════

import type { Macrocycle } from './state.ts';

export interface Exercise {
  id?: string;
  type?: string; // 'standard' | 'giant' | 'pause' | …
  startWeight: number;
  reps: string;  // '8', or a range '8–10' (en dash)
  setsStart: number;
  setsEnd: number;
  isHeavyLeg?: boolean;
  [k: string]: unknown;
}

export interface TrackUnit {
  week: number;
  dayKey: string;
}

// ════════════════════════════════════════════════
// EXTEND MACROCYCLE (v7.91)
// ════════════════════════════════════════════════
// A macrocycle extension repeats the FINAL mesocycle's template (there's
// only ever one stored template per macro — mesocycle 1, see
// state.exercises — reused algorithmically for every mesocycle) for
// extensionWeeks more calendar weeks, without touching macro.weeks (the
// original mesocycle count). Concretely this means: getWeekSets holds sets
// flat at each exercise's setsEnd for any mesocycle number beyond the
// original macro.weeks (nothing to interpolate toward — the plan already
// peaked), while getWeekWeight/getWeekReps progression (which were never a
// function of total cycle length to begin with) simply keep running.
// Returns the shape of an extension: how many whole extra mesocycles it
// adds, and whether the trailing one is partial (covers fewer than
// weeksPerMeso calendar weeks, so its M2 microcycle — if the macro uses
// microcycles at all — is dropped rather than padded out to a full week
// that was never asked for).
export function getMacroExtensionInfo(macro: Macrocycle): {
  extWeeks: number; extraMesos: number; partialFinalMeso: boolean; totalMesos: number;
} {
  const extWeeks = macro.extensionWeeks || 0;
  const wpm = macro.weeksPerMeso || 1;
  if (extWeeks <= 0) {
    return { extWeeks: 0, extraMesos: 0, partialFinalMeso: false, totalMesos: macro.weeks || 8 };
  }
  const fullExtraMesos = Math.floor(extWeeks / wpm);
  const remainder = extWeeks % wpm;
  const partialFinalMeso = remainder > 0;
  const extraMesos = fullExtraMesos + (partialFinalMeso ? 1 : 0);
  return { extWeeks, extraMesos, partialFinalMeso, totalMesos: (macro.weeks || 8) + extraMesos };
}

// Effective total mesocycle count including any extension — the number to
// use for iteration bounds (Train's week picker, session enumeration,
// volume totals) wherever the code used to just loop through macro.weeks.
// Never use this as getWeekSets's totalWeeks argument — that must stay
// pinned to macro.weeks itself (see getMacroExtensionInfo's comment above).
export function getMacroEffectiveMesoCount(macro: Macrocycle): number {
  return getMacroExtensionInfo(macro).totalMesos;
}

// True unless (week, mc) is the dropped M2 of a partial trailing extension
// mesocycle — the one case where a real, enumerable mesocycle slot doesn't
// actually have a full pair of microcycles. mc is 1, 2, or 0 (no
// microcycles in use at all, always valid). Every other combination —
// including every microcycle of every ORIGINAL mesocycle — is valid.
export function isMesoMicroValid(macro: Macrocycle, week: number, mc: number): boolean {
  if (mc !== 2) return true;
  const info = getMacroExtensionInfo(macro);
  if (!info.partialFinalMeso) return true;
  return week !== info.totalMesos;
}

// The day keys a macro's sessions use: each day name with its microcycle
// suffix when the macro uses microcycles (['pushm1','pullm1','legsm1',
// 'pushm2','pullm2','legsm2']) or bare day names when it doesn't.
export function getMacroSessionDayKeys(macro: Macrocycle): string[] {
  const days = macro.days || ['push','pull','legs'];
  const useMicro = macro.useMicrocycles !== false;
  if (!useMicro) return days.slice();
  const keys: string[] = [];
  [1,2].forEach(mc => days.forEach(d => keys.push(d + 'm' + mc)));
  return keys;
}

// ════════════════════════════════════════════════
// PROGRESSION LOGIC
// ════════════════════════════════════════════════
// Linearly scales an exercise's set count from its starting value
// (setsStart) up to its peak value (setsEnd) across the cycle's weeks —
// week 1 uses setsStart, the final week uses setsEnd, everything between
// is interpolated and rounded to the nearest whole set. For a mesocycle
// number beyond totalWeeks (only possible on an extended macrocycle — see
// getMacroExtensionInfo), there's nothing left to interpolate toward: the
// plan already peaked at totalWeeks, so extension weeks just hold flat at
// setsEnd. totalWeeks itself must always be the macro's ORIGINAL mesocycle
// count (macro.weeks), never the extended total, or every already-completed
// week's interpolation would silently reflow.
export function getWeekSets(ex: Exercise, week: number, totalWeeks: number): number {
  if (week > totalWeeks) return ex.setsEnd;
  // Linearly scale from setsStart to setsEnd
  const t = totalWeeks > 1 ? (week - 1) / (totalWeeks - 1) : 0;
  return Math.round(ex.setsStart + t * (ex.setsEnd - ex.setsStart));
}

// Theoretical target weight for a given exercise/week, used by both the Plan
// page's progression preview and as a Train page fallback when no prior log
// exists yet. jump = isHeavyLeg ? (gain?10:5) : weightIncrement — the same
// formula Train's live recommendations use, so the two pages never disagree
// (they used to, before this was consolidated into one function).
//
// 🚨 The golden harness's code control (§118) edits `(week - 1)` in THIS
//    function, in this file, and requires the `targets` runs to move. If
//    that expression changes, update the control in verify-engine-golden.mjs.
export function getWeekWeight(ex: Exercise, week: number, progType: string, goalType: string, weightIncrement?: string | number): number {
  if (progType !== 'weight') return ex.startWeight;
  // v8.20 — a maintenance cycle has no progression, so its look-ahead must not
  // climb either. Before this, every week with no log to build on (Train
  // looking ahead, the Plan preview, Home's Up next) showed startWeight +
  // increment × (week − 1) on a maintenance cycle, while the logged path
  // correctly carried last week's actual forward with a jump of 0 (§104).
  if (goalType === 'maintenance') return ex.startWeight;
  // Jump per mesocycle based on macrocycle type — mirrors the weightJump
  // logic in exProgData() so the Plan preview and Train recommendations
  // never disagree. weightIncrement is the user-configurable per-session
  // increment (macro.weightIncrement) used for light exercises on ANY cycle
  // type; heavy-leg jumps are fixed (5kg loss / 10kg gain) and not
  // user-editable, regardless of weightIncrement.
  const isGain = goalType === 'gain';
  const userInc = parseFloat((weightIncrement || '2.5') as string);
  const jump = ex.isHeavyLeg
    ? (isGain ? 10 : 5)
    : userInc;
  return ex.startWeight + jump * (week - 1);
}

// Theoretical target reps for a given week — returns ex.reps unchanged unless
// progType is 'reps', in which case it adds +1 rep per week (handling both
// plain numbers and 'N-M' ranges).
export function getWeekReps(ex: Exercise, week: number, progType: string, goalType: string): string | number {
  if (progType !== 'reps') return ex.reps;
  if (goalType === 'maintenance') return ex.reps; // v8.20 — no progression, see getWeekWeight
  const match = ex.reps.match(/(\d+)/);
  if (!match) return ex.reps;
  const base = parseInt(match[1]);
  const added = base + (week - 1);
  if (ex.reps.includes('–')) {
    const top = parseInt(ex.reps.split('–')[1]);
    return added + '–' + (top + (week - 1));
  }
  return String(added);
}

// Builds the storage key for state.deloads for a given (macro, week, dayKey).
// dayKey only needs its m1/m2 suffix inspected — which of the macro's actual
// day types (push/pull/legs/etc) it is doesn't matter, since a deload always
// applies to every day within its unit.
export function getDeloadUnitKey(macro: Macrocycle, week: number, dayKey?: string): string {
  const useMicro = macro.useMicrocycles !== false;
  if (!useMicro) return macro.id + '_' + week;
  const mc = dayKey && dayKey.endsWith('m2') ? '2' : '1';
  return macro.id + '_' + week + '_m' + mc;
}

// Returns the { week, dayKey } of the same-track unit one mesocycle
// earlier — i.e. same day type AND same microcycle slot (Push M2 always
// compares against the previous mesocycle's Push M2, never against that
// mesocycle's own Push M1). This deliberately mirrors the existing
// prevWeek2/prevKey2 pairing normal progression already uses in
// exProgData(), so a deload's "next session" for reversion purposes
// follows the exact same track normal progression would have used. Returns
// null at week 1 (no earlier mesocycle to compare against).
export function getPrevTrackUnit(_macro: Macrocycle, week: number, dayKey: string): TrackUnit | null {
  return week > 1 ? { week: week - 1, dayKey } : null;
}

// Rounds a weight to the nearest multiple of increment (e.g. rounding a
// deload weight to the exercise's own applicable increment — the same
// weightJump value already used for normal progression).
export function roundToIncrement(weight: number, increment: number): number {
  if (!increment) return weight;
  return Math.round(weight / increment) * increment;
}

// True physical-time "previous calendar week", honoring microcycles (a
// week's m2 is preceded by that same week's m1; a week's m1 is preceded by
// the previous week's m2). Unlike getPrevTrackUnit above, this crosses
// between the m1/m2 tracks — it's used ONLY for counting real elapsed
// weeks (see getWeeksSinceLastDeload), never for progression reversion,
// since Push M1 and Push M2 don't otherwise interact in this app.
export function getPrevCalendarWeek(macro: Macrocycle, week: number, dayKey: string): TrackUnit | null {
  const useMicro = macro.useMicrocycles !== false;
  if (!useMicro) return week > 1 ? { week: week - 1, dayKey } : null;
  const isM2 = dayKey && dayKey.endsWith('m2');
  const dayBase = (dayKey || '').replace(/m[12]$/, '');
  if (isM2) return { week, dayKey: dayBase + 'm1' };
  return week > 1 ? { week: week - 1, dayKey: dayBase + 'm2' } : null;
}

// Reps target for giant-set/pause-set exercises specifically. Pause sets
// are always weight-only progression, so this returns a fixed base derived
// from ex.reps regardless of week. Giant sets add +10 reps per week when
// reps progression is chosen.
export function getGiantSetProgression(ex: Exercise, week: number, goalType: string): string {
  // giant set: +10 reps/week (mesoweek fallback only — actual logged reps
  // take priority wherever they're available, see exProgData); pause set:
  // reps don't increase (weight only). Returns a bare number string (no
  // ' reps' suffix) so callers can safely use it as an input value/
  // placeholder as well as for display.
  if (ex.type === 'pause') {
    const base = parseInt(ex.reps.match(/\d+/)?.[0] as string) || 20;
    return String(base); // fixed — progression is weight only
  }
  // giant set: +10 per week (mesoweek fallback, e.g. week 2 with no prior log);
  // none on a maintenance cycle (v8.20, see getWeekWeight).
  const add = goalType === 'maintenance' ? 0 : 10;
  const base = parseInt(ex.reps.match(/\d+/)?.[0] as string) || 20;
  return String(base + add * (week - 1));
}

// Storage key for a progression lock — one per exercise, per track (day +
// microcycle), independent of week, since the whole point is that it
// persists across however many weeks it takes to clear.
export function getProgressionLockKey(macroId: string, dayKey: string, exId: string): string {
  return macroId + '_' + dayKey + '_' + exId;
}

// Builds the storage key used specifically for a 'which progression path was
// chosen this week' record — distinct from a per-set trainLogs key, since
// the progression choice applies to the whole exercise/week, not one set.
export function getProgKey(macroId: string, week: number, day: string, exId: string): string {
  return macroId + '_prog_' + week + '_' + day + '_' + exId;
}

// Parse a reps log value like "8" or "6-8" (range) into a single number for
// volume math — uses the lower bound of a range, or the plain integer.
export function parseRepsForVolume(repsVal: unknown): number {
  if (repsVal === null || repsVal === undefined) return 0;
  const m = String(repsVal).match(/(\d+)/);
  return m ? parseInt(m[1]) : 0;
}
