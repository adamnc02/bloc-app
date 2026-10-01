// Weekly compliance's explainer (Review → Weekly compliance), pure so a test can hold it to the engine's rules.
import { MIN_COUNTED_DAYS } from '@engine/review';

/**
 * What Weekly compliance's ticks, crosses and scores mean, as the engine scores them (engine/src/review/nutrition.ts):
 * Home's four weekly verdicts, the good side of target by the cycle's goal, the share of ticks out of 10, and a week
 * scored only once it's over with MIN_COUNTED_DAYS logged in full.
 */
export function weeklyComplianceSub(goalType: string | null | undefined, first: string): string {
  const kcal = goalType === 'gain' ? 'calories at or over target' : goalType === 'maintenance' ? 'calories on target' : 'calories at or under target';
  return `Each Monday–Sunday week, on the four averages ${first}’s Home shows: calories, protein, carbs and steps. `
    + `✓ is the right side of target for this cycle (${kcal}; protein and steps at or over; carbs at or under), × the wrong side. `
    + `The score is the share of ticks out of 10 (3 of 4 is 7.5). A week is scored once it’s over, with at least ${MIN_COUNTED_DAYS} days logged in full; the cycle’s Nutrition score above is the average of those weeks.`;
}
