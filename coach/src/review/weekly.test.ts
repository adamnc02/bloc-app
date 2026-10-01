import { describe, expect, it } from 'vitest';
import { MIN_COUNTED_DAYS, isGoodLabel } from '@engine/review';
import { weeklyComplianceSub } from './weekly';

// Weekly compliance's explainer must say what the engine actually scores (engine/src/review/nutrition.ts).
describe('Weekly compliance explainer', () => {
  it('names the good side of calories by the cycle goal, matching isGoodLabel', () => {
    expect(weeklyComplianceSub('loss', 'Maya')).toContain('calories at or under target');
    expect(isGoodLabel('kcal', 'Falling behind', 'loss')).toBe(true);
    expect(weeklyComplianceSub('gain', 'Maya')).toContain('calories at or over target');
    expect(isGoodLabel('kcal', 'Exceeding', 'gain')).toBe(true);
    expect(weeklyComplianceSub('maintenance', 'Maya')).toContain('calories on target');
    expect(isGoodLabel('kcal', 'Falling behind', 'maintenance')).toBe(false);
    expect(weeklyComplianceSub(null, 'Maya')).toContain('calories at or under target'); // no goal type reads as loss
  });
  it('carbs under is the good side; protein and steps under are not', () => {
    expect(weeklyComplianceSub('loss', 'Maya')).toContain('carbs at or under');
    expect(isGoodLabel('carbs', 'Falling behind', 'loss')).toBe(true);
    expect(isGoodLabel('protein', 'Falling behind', 'loss')).toBe(false);
    expect(isGoodLabel('steps', 'Falling behind', 'loss')).toBe(false);
  });
  it('gives the engine’s minimum counted days, and the client’s name', () => {
    const t = weeklyComplianceSub('loss', 'Maya');
    expect(t).toContain(`${MIN_COUNTED_DAYS} full days logged`);
    expect(t).toContain('Maya’s weekly averages');
  });
});
