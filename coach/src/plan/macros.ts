// ═══════════════════════════════════════════════════════════════════════
// A goal phase's macros, BLOC's way (index.html computeGoalMacroGrams /
// initGoalMacroSliders; TECHNICAL §144). Pure; scripts/verify-coach-plan.mjs
// runs it against BLOC's own functions over a grid and fails on a difference.
//
// Protein is grams per lb of the client's latest weigh-in (150 lb with none),
// 1.00–2.00 in 0.05 steps. What's left of the calories after protein splits
// between carbs (30–80%) and fats (the rest).
// ═══════════════════════════════════════════════════════════════════════

export const PROTEIN_MIN = 1, PROTEIN_MAX = 2, PROTEIN_STEP = 0.05, PROTEIN_DEFAULT = 1.25;
export const CARB_MIN = 30, CARB_MAX = 80, CARB_DEFAULT = 50;
export const DEFAULT_BW = 150;

export interface MacroSplit { proteinMult: number; proteinG: number; carbPct: number; fatPct: number; carbG: number; fatG: number; remainingCal: number }

/** BLOC's bodyweight for macros: the latest weigh-in, rounded; 150 with none. */
export const bwRounded = (latestLbs: number | null) => (latestLbs ? Math.round(latestLbs) : DEFAULT_BW);

export function goalMacroGrams(bw: number, kcal: number, proteinMult: number, carbPct: number): MacroSplit {
  const b = bw || DEFAULT_BW;
  const pm = proteinMult || PROTEIN_DEFAULT;
  const proteinG = Math.round(b * pm);
  const remainingCal = Math.max(0, (kcal || 0) - proteinG * 4);
  const cp = carbPct || CARB_DEFAULT;
  const fatPct = 100 - cp;
  return { proteinMult: pm, proteinG, carbPct: cp, fatPct, carbG: Math.round(remainingCal * cp / 100 / 4), fatG: Math.round(remainingCal * fatPct / 100 / 9), remainingCal };
}

/** The slider positions for a saved phase (BLOC's back-derivation), or the defaults for a new one. */
export function slidersFromGoal(bw: number, goal: { kcal?: number; protein?: number; carbs?: number } | null): { proteinMult: number; carbPct: number } {
  let proteinMult = PROTEIN_DEFAULT;
  if (goal && goal.protein && bw > 0) proteinMult = Math.min(PROTEIN_MAX, Math.max(PROTEIN_MIN, Math.round((goal.protein / bw) * 20) / 20));
  const remainingCal = Math.max(0, (goal?.kcal || 0) - Math.round(bw * proteinMult) * 4);
  let carbPct = CARB_DEFAULT;
  if (goal && goal.carbs && remainingCal > 0) carbPct = Math.min(CARB_MAX, Math.max(CARB_MIN, Math.round((goal.carbs * 4 / remainingCal) * 100)));
  return { proteinMult, carbPct };
}

/** Each macro's share of the calories (the pie and the "below" labels). */
export function shares(p: number, c: number, f: number) {
  const pc = p * 4, cc = c * 4, fc = f * 9, t = pc + cc + fc || 1;
  return { protein: Math.round(pc / t * 100), carbs: Math.round(cc / t * 100), fats: Math.round(fc / t * 100) };
}

/** BLOC's macro colours (MACRO_COLORS), fixed hex so the sliders match the pie. */
export const MACRO_COLOURS = { protein: '#60a8f0', carbs: '#f5a623', fats: '#ff5f4e' } as const;
