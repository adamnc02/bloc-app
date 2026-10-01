// Weekly compliance's explainer (Review → Weekly compliance), pure so a test can hold it to the engine's rules.
import { MIN_COUNTED_DAYS } from '@engine/review';

/**
 * What Weekly compliance's ticks, crosses and scores mean, as the engine scores them (engine/src/review/nutrition.ts):
 * Home's four weekly verdicts, the good side of target by the cycle's goal, the share of ticks out of 10, and a week
 * scored only once it's over with MIN_COUNTED_DAYS logged in full.
 */
export function weeklyComplianceSub(goalType: string | null | undefined, first: string): string {
  const kcal = goalType === 'gain' ? 'calories at or over target' : goalType === 'maintenance' ? 'calories on target' : 'calories at or under target';
  return `${first}’s weekly averages against target. ✓ on target, × off it (${kcal}, carbs at or under, protein and steps at or over). `
    + `Score: ticks out of 10. A week counts once it’s over, with ${MIN_COUNTED_DAYS} full days logged.`;
}
