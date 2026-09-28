// ═══════════════════════════════════════════════════════════════════════
// Training reads: deload weeks, volume, the list of sessions, and the week
// agenda (deep dive §1b, §10 step 4; TECHNICAL §125, and §115 for the agenda).
//
// Moved from index.html in v8.35, UNCHANGED apart from their inputs, behind
// same-named shims. `s` is the state; the week and session a page is VIEWING
// (BLOC's state.currentWeek / currentDay) are parameters now, because Coach
// views a client's plan without changing what the client was looking at.
//
// 🚨 The trainLogs key, `${macroId}_${week}_${dayKey}_${exId}_${set}`, and the
//    deloads key (getDeloadUnitKey) are the contract with stored data.
// ═══════════════════════════════════════════════════════════════════════

import type { BlocState, DateStr, Loose, Macrocycle } from './state.ts';
import { type EngineContext, toLocalDateStr } from './dates.ts';
import {
  getDeloadUnitKey, getPrevTrackUnit, getPrevCalendarWeek, getWeekSets, parseRepsForVolume,
  getMacroSessionDayKeys, getMacroEffectiveMesoCount, isMesoMicroValid,
} from './progression.ts';

// Whether the given (macro, week, dayKey) unit is currently marked deload.
export function isDeloadUnit(s: BlocState, macro: Macrocycle, week: number, dayKey: string): boolean {
  return !!(s.deloads && s.deloads[getDeloadUnitKey(macro, week, dayKey)]);
}

// True for the first occurrence of a session that comes right after a
// deload — used to suppress progression for exactly that one session, then
// let normal progression resume. This is a union of two adjacency checks,
// because a deload on one microcycle (say MC4 M1) needs to revert BOTH:
//  - the immediate physical-calendar sibling within the same mesoweek
//    (MC4 M2 — a completely different track that just happens to be the
//    very next calendar week), via getPrevCalendarWeek(), and
//  - the next occurrence of the SAME track, one mesocycle later (MC5 M1 —
//    same dayKey as the deload, since Push M1 only ever compares against
//    the previous mesocycle's Push M1), via getPrevTrackUnit().
// For macros without microcycles the two checks are identical (both reduce
// to week-1, same dayKey), so this collapses to the simple case there.
export function isFirstUnitAfterDeload(s: BlocState, macro: Macrocycle, week: number, dayKey: string): boolean {
  if (isDeloadUnit(s, macro, week, dayKey)) return false;
  const trackPrev = getPrevTrackUnit(macro, week, dayKey);
  if (trackPrev && isDeloadUnit(s, macro, trackPrev.week, trackPrev.dayKey)) return true;
  const calPrev = getPrevCalendarWeek(macro, week, dayKey);
  if (calPrev && isDeloadUnit(s, macro, calPrev.week, calPrev.dayKey)) return true;
  return false;
}

// Total volume (kg) for a single session: macroId_week_dayKey, summed over
// all exercises/sets that have a logged weight+reps (done or not — logged is
// enough). dayKey already includes any microcycle suffix (e.g. 'pushm1').
// Drop-set exercises contribute both halves — the main set's volume plus
// the drop's, since both are real work performed.
export function getSessionVolume(s: BlocState, macro: Macrocycle, week: number, dayKey: string): number {
  const templateKey = macro.id + '_1_' + dayKey;
  const exercises = (s.exercises as Record<string, Loose[]>)[templateKey] || [];
  const key = macro.id + '_' + week + '_' + dayKey;
  let vol = 0;
  exercises.forEach(ex => {
    const sets = getWeekSets(ex, week, macro.weeks as number);
    const sideMultiplier = ex.trackingMode === 'perSide' ? 2 : 1;
    for (let i = 0; i < sets; i++) {
      const log = (s.trainLogs as Record<string, Loose>)[key + '_' + ex.id + '_' + i];
      if (!log) continue;
      if (log.weight && log.reps) {
        vol += parseFloat(log.weight) * sideMultiplier * parseRepsForVolume(log.reps);
      }
      if (ex.type === 'dropset' && log.dropWeight && log.dropReps) {
        vol += parseFloat(log.dropWeight) * sideMultiplier * parseRepsForVolume(log.dropReps);
      }
    }
  });
  return vol;
}

// Total volume (kg) across an entire macrocycle — all weeks, all sessions,
// including any Extend-added weeks (see getMacroExtensionInfo).
export function getMacroTotalVolume(s: BlocState, macro: Macrocycle): number {
  const dayKeys = getMacroSessionDayKeys(macro);
  const totalMesos = getMacroEffectiveMesoCount(macro);
  let total = 0;
  for (let w = 1; w <= totalMesos; w++) {
    dayKeys.forEach(dayKey => {
      if (dayKey.endsWith('m2') && !isMesoMicroValid(macro, w, 2)) return;
      total += getSessionVolume(s, macro, w, dayKey);
    });
  }
  return total;
}

export interface VolumePoint { date: Date; week: number; day: string; vol: number }

// Volume time series for a macrocycle — one point per session date (week+day
// mapped onto a real calendar date via the macro start date), used for the
// Plan page's "volume over time" area chart. Only includes sessions with
// logged volume > 0, sorted chronologically.
//
// Each mesocycle ("week" w) spans weeksPerMeso real calendar weeks (default
// 1), so its dayKeys — which may include microcycle suffixes representing
// different calendar weeks within that mesocycle, not just same-week
// variants — are spread proportionally across the mesocycle's full real
// span (weeksPerMeso * 7 days), not a flat 7 days. Without this, a 2-week
// mesocycle (weeks:1, weeksPerMeso:2) using microcycles to represent its
// two real weeks would have every session's approximate date collapse into
// the same single 7-day window.
//
// 🚨 `startFallback`: the instant an UNSTARTED cycle counts from. The old code
//    used BLOC's now(), which carries the current time of day (unless the Demo
//    Tour's anchor is set), and every point's Date inherited it. BLOC's shim
//    passes now(), so its points are unchanged; without it, ctx.today at
//    midnight. A started cycle never reads it. (The same trap as
//    getMacroEndDate's, §123.)
export function getMacroVolumeSeries(s: BlocState, macro: Macrocycle, ctx: EngineContext, startFallback?: Date): VolumePoint[] {
  const dayKeys = getMacroSessionDayKeys(macro);
  const startDate = macro.start ? new Date(macro.start + 'T00:00:00')
    : (startFallback ? new Date(startFallback.getTime()) : new Date(ctx.today + 'T00:00:00'));
  const sessionsPerWeek = dayKeys.length;
  const mesoSpanDays = (macro.weeksPerMeso || 1) * 7;
  const totalMesos = getMacroEffectiveMesoCount(macro);
  const points: VolumePoint[] = [];
  for (let w = 1; w <= totalMesos; w++) {
    dayKeys.forEach((dayKey, di) => {
      if (dayKey.endsWith('m2') && !isMesoMicroValid(macro, w, 2)) return;
      const vol = getSessionVolume(s, macro, w, dayKey);
      if (vol > 0) {
        // Approximate calendar date: mesocycle block start + proportional
        // offset within that block's real span.
        const d = new Date(startDate);
        d.setDate(d.getDate() + (w - 1) * mesoSpanDays + Math.round((di / sessionsPerWeek) * mesoSpanDays));
        points.push({ date: d, week: w, day: dayKey, vol });
      }
    });
  }
  points.sort((a, b) => (a.date as unknown as number) - (b.date as unknown as number));
  return points;
}

export interface MacroSession { week: number; dayKey: string; done: boolean }

// Computes every (week, dayKey) session in a macrocycle in order, and
// whether each is fully logged done. Sessions with zero exercises defined
// are skipped entirely (not counted as incomplete). Shared by renderTrain()
// (which auto-selects the next incomplete one) and the Home page's next-
// session preview, so both always agree on what "next" means.
export function getAllMacroSessions(s: BlocState, macro: Macrocycle): MacroSession[] {
  const days = macro.days || ['push','pull','legs'];
  const useMicro = macro.useMicrocycles !== false;
  const micros = useMicro ? [1,2] : [0];
  const allSessions: MacroSession[] = [];
  const totalMesos = getMacroEffectiveMesoCount(macro);
  for (let w = 1; w <= totalMesos; w++) {
    micros.forEach(mc => {
      if (!isMesoMicroValid(macro, w, mc)) return; // dropped M2 of a partial trailing extension mesocycle
      days.forEach(d => {
        const dayKey = mc === 0 ? d : d + 'm' + mc;
        const templateKey = macro.id + '_1_' + dayKey;
        const exercises = ((s.exercises as Record<string, Loose[]>)[templateKey] || []).slice().sort((a,b) => (a.order||0)-(b.order||0));
        if (exercises.length === 0) return;
        let allDone = true;
        exercises.forEach(ex => {
          const sets = getWeekSets(ex, w, macro.weeks as number);
          for (let i = 0; i < sets; i++) {
            const lk = macro.id + '_' + w + '_' + dayKey + '_' + ex.id + '_' + i;
            const logs = s.trainLogs as Record<string, Loose>;
            if (!logs[lk] || !logs[lk].done) allDone = false;
          }
        });
        allSessions.push({ week: w, dayKey, done: allDone });
      });
    });
  }
  return allSessions;
}

// Returns the next incomplete { week, dayKey } session for a macro, or null
// if every defined session is done (or the macro has no exercises at all).
// Deliberately does NOT fall back to the last session the way renderTrain's
// picker does — callers like the Home preview want to know unambiguously
// whether there's anything left to do today.
export function getNextIncompleteSession(s: BlocState, macro: Macrocycle): MacroSession | null {
  const allSessions = getAllMacroSessions(s, macro);
  const next = allSessions.find(x => !x.done);
  return next || null;
}

// Computes the real calendar week (start/end dates) that a mesocycle +
// microcycle session falls in — for forward-planning deload weeks against
// upcoming goal periods. Uses the same mesocycle-span math as
// getMacroVolumeSeries(): each mesocycle spans weeksPerMeso real calendar
// weeks (2, when microcycles represent each real week), fanned out from the
// macro's start date. Returns null if the macro has no start date set.
//
// The only week→date mapping for sessions (deep dive §2b: sessions carry no
// date). `week`/`dayKey` were state.currentWeek/currentDay — the session
// Train is showing; BLOC's shim still passes those.
export function getSelectedTrainWeekDates(macro: Macrocycle | null | undefined, week: number, dayKey: string): { start: DateStr; end: DateStr } | null {
  if (!macro || !macro.start) return null;
  const mesoSpanDays = (macro.weeksPerMeso || 1) * 7;
  const useMicro = macro.useMicrocycles !== false;
  // A mesocycle only represents two distinct real calendar weeks when it
  // actually spans 2 weeks via microcycles — otherwise M1/M2 (if used at
  // all) share the same single calendar week, mirroring the exact
  // distinction the Train page's own day-tab grouping already makes.
  const usesTwoRealWeeks = useMicro && (macro.weeksPerMeso || 1) === 2;
  let offsetDays = (week - 1) * mesoSpanDays;
  if (usesTwoRealWeeks && String(dayKey).endsWith('m2')) offsetDays += 7;
  const start = new Date(macro.start + 'T00:00:00');
  start.setDate(start.getDate() + offsetDays);
  const end = new Date(start);
  end.setDate(end.getDate() + (usesTwoRealWeeks ? 6 : mesoSpanDays - 1));
  return { start: toLocalDateStr(start), end: toLocalDateStr(end) };
}

// The week agenda (TECHNICAL §115, Change session): one unit per real
// calendar week, each with its sessions and their status. `viewing` is the
// session the page is showing (BLOC: state.currentWeek/currentDay); Coach
// passes the one it has open, or null.
export function getTrainAgendaUnits(s: BlocState, ctx: EngineContext, macro: Macrocycle, viewing: { week: number; dayKey: string } | null | undefined) {
  const days = macro.days || ['push','pull','legs'];
  const dayLabels = (macro.dayLabels as Record<string, string>) || { push:'Push', pull:'Pull', legs:'Legs' };
  const useMicro = macro.useMicrocycles !== false;
  const wpm = macro.weeksPerMeso || 1;
  const twoWeeks = useMicro && wpm === 2;
  const total = getMacroEffectiveMesoCount(macro);
  const today = ctx.today;
  const next = getNextIncompleteSession(s, macro);
  const addDays = (iso: DateStr, n: number) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return toLocalDateStr(d); };
  const viewWeek = viewing ? viewing.week : undefined;
  const viewDay = viewing ? viewing.dayKey : undefined;
  const sessionFor = (w: number, dayKey: string, label: string) => {
    const exercises = ((s.exercises as Record<string, Loose[]>)[macro.id + '_1_' + dayKey] || []);
    if (!exercises.length) return null;
    let sets = 0, doneSets = 0;
    exercises.forEach(ex => {
      const n = getWeekSets(ex, w, macro.weeks as number);
      sets += n;
      for (let i = 0; i < n; i++) {
        const lg = (s.trainLogs as Record<string, Loose>)[macro.id + '_' + w + '_' + dayKey + '_' + ex.id + '_' + i];
        if (lg && lg.done) doneSets++;
      }
    });
    return {
      week: w, dayKey, label, exercises: exercises.length, sets, doneSets,
      done: sets > 0 && doneSets === sets,
      partial: doneSets > 0 && doneSets < sets,
      upNext: !!(next && next.week === w && next.dayKey === dayKey),
      viewing: viewWeek === w && viewDay === dayKey,
    };
  };
  const units: Loose[] = [];
  for (let w = 1; w <= total; w++) {
    const groups = twoWeeks ? [1, 2].filter(mc => isMesoMicroValid(macro, w, mc)).map(mc => [mc]) : [useMicro ? [1, 2].filter(mc => isMesoMicroValid(macro, w, mc)) : [0]];
    groups.forEach(mcs => {
      const offsetWeeks = twoWeeks ? (w - 1) * 2 + (mcs[0] - 1) : (w - 1) * wpm;
      const spanDays = twoWeeks ? 7 : wpm * 7;
      const start = macro.start ? addDays(macro.start, offsetWeeks * 7) : null;
      const end = start ? addDays(start, spanDays - 1) : null;
      const sessions: Loose[] = [];
      mcs.forEach(mc => days.forEach(d => {
        const dayKey = mc === 0 ? d : d + 'm' + mc;
        const name = dayLabels[d] || d;
        // Both microcycles share one unit only when they share a calendar week:
        // then, and only then, the session needs telling apart.
        const label = (!twoWeeks && useMicro) ? name + ' · ' + (mc === 1 ? 'A' : 'B') : name;
        const sess = sessionFor(w, dayKey, label);
        if (sess) sessions.push(sess);
      }));
      if (!sessions.length) return;
      units.push({
        key: w + '-' + mcs.join(''), week: w, weekOfMeso: twoWeeks ? mcs[0] : 0,
        start, end,
        isThisWeek: !!(start && today >= start && today <= (end as DateStr)),
        isDeload: isDeloadUnit(s, macro, w, sessions[0].dayKey),
        sessions,
        doneCount: sessions.filter(x => x.done).length,
        viewing: sessions.some(x => x.viewing),
        hasUpNext: sessions.some(x => x.upNext),
      });
    });
  }
  return { units, next, total };
}
