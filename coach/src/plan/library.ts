// ═══════════════════════════════════════════════════════════════════════
// The exercise library Coach picks from (Plan → Add exercise, Swap exercise;
// TECHNICAL §144): BLOC's built-in list, the client's own custom exercises
// (`customLibrary`, which the client owns), the coach's own library
// (`coach_exercises`, 0035, §165: every exercise the coach has added by name), and
// the names in the plan being edited.
//
// 🚨 BUILT_IN is a COPY of index.html's DEFAULT_LIBRARY: moving that list into
//    the engine would change BLOC's served bytes in a Coach release.
//    scripts/verify-coach-plan.mjs compares the two entry by entry and fails
//    on any difference.
// ═══════════════════════════════════════════════════════════════════════

export interface LibraryEntry {
  name: string;
  bodyPart: string;
  /** 'cardio' for cardio; absent means weight (BLOC's getLibraryCategory). */
  category?: 'weight' | 'cardio';
  /** Where it came from, for the picker's label: BLOC's, the client's, the coach's library ('mine'), this plan's. */
  source?: 'bloc' | 'client' | 'mine' | 'coach';
}

export const BUILT_IN: readonly LibraryEntry[] = [
  { name: 'Cable Curls', bodyPart: 'Biceps' },
  { name: 'Reverse Grip Curls', bodyPart: 'Biceps' },
  { name: 'Rope Curls', bodyPart: 'Biceps' },
  { name: 'Calf Raises', bodyPart: 'Calves' },
  { name: 'Cross Incline Press', bodyPart: 'Chest' },
  { name: 'Decline Press', bodyPart: 'Chest' },
  { name: 'Flat Press', bodyPart: 'Chest' },
  { name: 'Incline Press', bodyPart: 'Chest' },
  { name: 'Hamstring Curl', bodyPart: 'Legs' },
  { name: 'Leg Extension', bodyPart: 'Legs' },
  { name: 'Leg Press', bodyPart: 'Legs' },
  { name: 'RDL', bodyPart: 'Legs' },
  { name: 'Split Squat', bodyPart: 'Legs' },
  { name: 'Walking Lunge', bodyPart: 'Legs' },
  { name: 'Lat Pull Machine', bodyPart: 'Back' },
  { name: 'Lat Pulldown', bodyPart: 'Back' },
  { name: 'Low Row', bodyPart: 'Back' },
  { name: 'Machine Row', bodyPart: 'Back' },
  { name: 'T-Bar Lat Pulldown', bodyPart: 'Back' },
  { name: 'T-Bar Row', bodyPart: 'Back' },
  { name: 'Lateral Raise', bodyPart: 'Shoulders' },
  { name: 'Cross Cable Extensions', bodyPart: 'Triceps' },
  { name: 'Push Downs', bodyPart: 'Triceps' },
  { name: 'Reverse Grip Extensions', bodyPart: 'Triceps' },
  { name: 'Rope Extensions', bodyPart: 'Triceps' },
  { name: 'Skull Crushers', bodyPart: 'Triceps' },
  { name: 'Run', bodyPart: 'Cardio', category: 'cardio' },
  { name: 'Bike', bodyPart: 'Cardio', category: 'cardio' },
  { name: 'Row', bodyPart: 'Cardio', category: 'cardio' },
];

/** The body parts BLOC's library names, in its order. Cardio has no body part to pick. */
export const BODY_PARTS = ['Chest', 'Back', 'Legs', 'Shoulders', 'Biceps', 'Triceps', 'Calves'] as const;

export const categoryOf = (e: { category?: unknown } | null | undefined): 'weight' | 'cardio' => (e && e.category === 'cardio' ? 'cardio' : 'weight');

/**
 * BLOC's built-in list, then the client's custom entries, then any names the
 * coach has used in this plan that neither has. Sorted as BLOC's getLibrary()
 * sorts: body part, then name. A name appears once (the first source wins).
 */
export function buildLibrary(custom: unknown, extra: LibraryEntry[] = []): LibraryEntry[] {
  const out: LibraryEntry[] = [];
  const seen = new Set<string>();
  const add = (e: LibraryEntry) => {
    const k = e.name.trim().toLowerCase();
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push(e);
  };
  for (const e of BUILT_IN) add({ ...e, source: 'bloc' });
  for (const e of Array.isArray(custom) ? custom : []) {
    if (e && typeof e.name === 'string') add({ name: e.name, bodyPart: String(e.bodyPart || (e.category === 'cardio' ? 'Cardio' : 'Other')), category: categoryOf(e), source: 'client' });
  }
  for (const e of extra) add({ ...e, source: e.source ?? 'coach' });
  return out.sort((a, b) => a.bodyPart.localeCompare(b.bodyPart) || a.name.localeCompare(b.name));
}

/** The body part a plan exercise belongs to: its own, else the library's for its name, else 'Other'. */
export function bodyPartFor(ex: { name?: unknown; bodyPart?: unknown; category?: unknown }, lib: LibraryEntry[]): string {
  if (typeof ex.bodyPart === 'string' && ex.bodyPart) return ex.bodyPart;
  if (categoryOf(ex) === 'cardio') return 'Cardio';
  const n = String(ex.name ?? '').trim().toLowerCase();
  return lib.find((e) => e.name.toLowerCase() === n)?.bodyPart ?? 'Other';
}
