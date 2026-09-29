// ═══════════════════════════════════════════════════════════════════════
// Plan's "Volume by body part" and "Progression preview" (TECHNICAL §144):
// BLOC's own figures (index.html computeBodyPartVolumeRange and
// buildProgressionPreviewHTML), on the engine's progression functions, so a
// coach sees the same range and the same week-by-week loads BLOC shows.
//
// Volume per body part is kg lifted across the whole cycle, two ways: loads
// rising (reps held) and reps rising (load held). The smaller is the
// minimum, the larger the peak. Per-side tracking counts double. The body
// part is the exercise's own, else the library's for its name.
// ═══════════════════════════════════════════════════════════════════════
import {
  getGiantSetProgression, getMacroEffectiveMesoCount, getWeekReps, getWeekSets, getWeekWeight, isMesoMicroValid, parseRepsForVolume,
  type Exercise, type Macrocycle,
} from '@engine';
import { dayKeys, keyOf, microOf, sessionLabel, sortedExercises, type PlanDoc } from './doc';
import { bodyPartFor, type LibraryEntry } from './library';

export interface VolumeRow { bodyPart: string; min: number; max: number }

export function bodyPartVolume(doc: PlanDoc, lib: LibraryEntry[]): VolumeRow[] {
  const m = doc.macro as unknown as Macrocycle;
  const totalMesos = getMacroEffectiveMesoCount(m);
  const totals: Record<string, { w: number; r: number }> = {};
  for (const dk of dayKeys(doc.macro)) {
    const mc = microOf(dk);
    const maxMeso = mc === 2 && !isMesoMicroValid(m, totalMesos, 2) ? totalMesos - 1 : totalMesos;
    for (const ex of doc.exercises[keyOf(doc.macro.id, dk)] || []) {
      if (ex.category === 'cardio') continue;
      const bp = bodyPartFor(ex, lib);
      const t = totals[bp] || (totals[bp] = { w: 0, r: 0 });
      const mult = ex.trackingMode === 'perSide' ? 2 : 1;
      const e = ex as unknown as Exercise;
      const baseReps = parseRepsForVolume(ex.reps);
      for (let w = 1; w <= maxMeso; w++) {
        const sets = getWeekSets(e, w, doc.macro.weeks);
        const wt = getWeekWeight(e, w, 'weight', doc.macro.goalType, doc.macro.weightIncrement);
        t.w += sets * baseReps * wt * mult;
        let reps: number, flat: number;
        if (ex.type === 'pause') { reps = baseReps; flat = wt; }
        else if (ex.type === 'giant') { reps = parseRepsForVolume(getGiantSetProgression(e, w, doc.macro.goalType)); flat = ex.startWeight || 0; }
        else { reps = parseRepsForVolume(getWeekReps(e, w, 'reps', doc.macro.goalType)); flat = ex.startWeight || 0; }
        t.r += sets * reps * flat * mult;
      }
    }
  }
  return Object.entries(totals)
    .map(([bodyPart, t]) => ({ bodyPart, min: Math.min(t.w, t.r), max: Math.max(t.w, t.r) }))
    .sort((a, b) => b.min - a.min);
}

export interface PreviewBlock { label: string; exercises: { name: string; weeks: { week: number; text: string }[] }[] }

/** Weeks 2 onwards of every session, as BLOC's Progression preview lists them: sets · reps · load. */
export function progressionPreview(doc: PlanDoc): PreviewBlock[] {
  const m = doc.macro as unknown as Macrocycle;
  const totalMesos = getMacroEffectiveMesoCount(m);
  const out: PreviewBlock[] = [];
  for (const dk of dayKeys(doc.macro)) {
    const list = sortedExercises(doc.exercises[keyOf(doc.macro.id, dk)]);
    if (!list.length) continue;
    const mc = microOf(dk);
    const maxMeso = mc === 2 && !isMesoMicroValid(m, totalMesos, 2) ? totalMesos - 1 : totalMesos;
    out.push({
      label: sessionLabel(doc.macro, dk),
      exercises: list.map((ex) => ({
        name: ex.name,
        weeks: Array.from({ length: Math.max(0, maxMeso - 1) }, (_, i) => {
          const w = i + 2;
          const e = ex as unknown as Exercise;
          if (ex.category === 'cardio') return { week: w, text: `${getWeekSets(e, w, doc.macro.weeks)} sets` };
          return { week: w, text: `${getWeekSets(e, w, doc.macro.weeks)} sets · ${ex.reps} · ${getWeekWeight(e, w, 'weight', doc.macro.goalType, doc.macro.weightIncrement).toFixed(1)}kg` };
        }),
      })),
    });
  }
  return out;
}
