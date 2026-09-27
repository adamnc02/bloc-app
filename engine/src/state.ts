// ═══════════════════════════════════════════════════════════════════════
// BlocState, and normaliseState() — the engine's view of `state`.
//
// The shape is the `let state = {…}` literal in index.html and TECHNICAL §3,
// whose comments are the field-by-field spec. It is deliberately LOOSE where
// the app is loose: every field is optional (old backups, and old clients'
// uploads to Coach, carry partial states — deep dive H5), and every record
// type keeps an index signature, because the stored JSON carries fields no
// type here names. Tighten a field only when the code that reads it moves in.
// ═══════════════════════════════════════════════════════════════════════

export type DateStr = string; // 'YYYY-MM-DD', a client-LOCAL calendar date (deep dive §2b)

export interface Macrocycle {
  id: string;
  start?: DateStr;
  weeks?: number;
  rpe?: boolean; // §104: absent = off
  [k: string]: unknown;
}

export interface BodyLog {
  date: DateStr;
  weight?: string | number;
  steps?: string | number;
  waist?: string | number; // inches, always (§3)
  hip?: string | number;
  [k: string]: unknown;
}

export interface SampleDayGroup {
  id?: string;
  range?: { proteinMax?: number | null; [k: string]: unknown };
  [k: string]: unknown;
}

export interface BlocProfile {
  measureUnit?: string;
  [k: string]: unknown;
}

export interface BlocState {
  macrocycles?: Macrocycle[];
  exercises?: Record<string, unknown[]>;
  trainLogs?: Record<string, unknown>;
  bodyLogs?: BodyLog[];
  nutritionLogs?: unknown[];
  goals?: unknown[];
  customLibrary?: unknown[];
  nutritionMeals?: Record<string, unknown>;
  nutritionQuickLog?: Record<string, unknown>;
  foodLibrary?: unknown[];
  recipes?: unknown[];
  sampleDays?: SampleDayGroup[];
  supersets?: Record<string, unknown>;
  deloads?: Record<string, unknown>;
  progressionLocks?: Record<string, unknown>;
  progressionTargets?: Record<string, unknown>;
  rpe?: Record<string, { rpe: number } | { rpeSkipped: true }>;
  exerciseHistory?: Record<string, unknown>;
  exerciseTrackingMode?: Record<string, unknown>;
  profile?: BlocProfile;
  insightsRollup?: { completedCycles: unknown[]; [k: string]: unknown };
  blocAdvice?: unknown;
  nextCycleAdvice?: unknown;
  nextCycleAdviceHistory?: unknown[];
  mode?: string;
  currentMacroId?: string | null;
  currentWeek?: number;
  currentDay?: string;
  [k: string]: unknown;
}

// ── normaliseState ───────────────────────────────────────────────────────
// Was ensureStateDefaults() (index.html, before v8.32), which filled the
// missing fields of the global `state` IN PLACE. This returns a new object and
// never writes to its input (deep dive H5; checked by
// scripts/verify-engine-pure.mjs), so Coach can run it on every
// uploaded blob. BLOC's ensureStateDefaults() is now a shim:
// `state = BlocEngine.normaliseState(state)`, then the theme attribute.
//
// 🚨 BYTE-IDENTICAL, not tidied. Every test below is the old one, in the old
// order, so keys are added in the same order and the saved JSON is unchanged:
//   · `!x` (falsy), not `x === undefined` — an empty string mode becomes 'dark'.
//   · blocAdvice / nextCycleAdvice test `=== undefined`: null is a real value.
//   · nextCycleAdviceHistory tests Array.isArray: a non-array is replaced.
//   · the proteinMax repair (Infinity does not survive JSON, it becomes null)
//     copies only the groups it repairs; the rest are shared, not cloned.
// Untouched fields are SHARED with the input (structural sharing, not a deep
// copy). BLOC hands it a state it has just parsed, so nothing else holds them.
//
// Input that is not an object throws, as the in-place version did (it failed
// on `state.sampleDays.forEach`): load() never caught that, and a boot that
// dies loudly on a corrupt blob is the behaviour being preserved here.
export function normaliseState(raw: BlocState): BlocState {
  if (raw === null || typeof raw !== 'object') {
    throw new TypeError('normaliseState: state is not an object');
  }
  const s: BlocState = { ...raw };
  if (!s.macrocycles) s.macrocycles = [];
  if (!s.exercises) s.exercises = {};
  if (!s.trainLogs) s.trainLogs = {};
  if (!s.bodyLogs) s.bodyLogs = [];
  if (!s.nutritionLogs) s.nutritionLogs = [];
  if (!s.goals) s.goals = [];
  if (!s.customLibrary) s.customLibrary = [];
  if (!s.nutritionMeals) s.nutritionMeals = {};
  if (!s.nutritionQuickLog) s.nutritionQuickLog = {};
  if (!s.foodLibrary) s.foodLibrary = [];
  if (!s.recipes) s.recipes = [];
  if (!s.sampleDays) s.sampleDays = [];
  if (s.sampleDays.some(needsProteinMaxRepair)) {
    s.sampleDays = s.sampleDays.map(g => needsProteinMaxRepair(g)
      ? { ...g, range: { ...g.range, proteinMax: Number.MAX_SAFE_INTEGER } }
      : g);
  }
  if (!s.supersets) s.supersets = {};
  if (!s.deloads) s.deloads = {};
  if (!s.progressionLocks) s.progressionLocks = {};
  if (!s.progressionTargets) s.progressionTargets = {};
  if (!s.rpe) s.rpe = {};
  if (!s.exerciseHistory) s.exerciseHistory = {};
  if (!s.exerciseTrackingMode) s.exerciseTrackingMode = {};
  if (!s.profile) s.profile = {};
  if (!s.insightsRollup) s.insightsRollup = { completedCycles: [] };
  if (s.blocAdvice === undefined) s.blocAdvice = null;
  if (s.nextCycleAdvice === undefined) s.nextCycleAdvice = null;
  if (!Array.isArray(s.nextCycleAdviceHistory)) s.nextCycleAdviceHistory = [];
  if (!s.profile.measureUnit) s.profile = { ...s.profile, measureUnit: 'in' };
  if (!s.mode) s.mode = 'dark';
  return s;
}

// The old repair's own test: a group with a range whose proteinMax is null or
// missing. A group with no range at all is left alone.
function needsProteinMaxRepair(g: SampleDayGroup): boolean {
  return !!(g.range && (g.range.proteinMax === null || g.range.proteinMax === undefined));
}
