// SearchSheet's fit (TECHNICAL §144): BLOC's four-part search sheet, as numbers.
import { describe, expect, it } from 'vitest';
import { fitListMax, isKeyboardOpen, nextAppHeight, sheetHeight, FIT_AFTER_MS } from './searchFit';

describe('SearchSheet’s fit maths', () => {
  it('the keyboard counts as open only in the Home Screen app, under 75% of the screen', () => {
    expect(isKeyboardOpen(true, 480, 844)).toBe(true);
    expect(isKeyboardOpen(false, 480, 844)).toBe(false); // a Safari tab: never
    expect(isKeyboardOpen(true, 700, 844)).toBe(false);  // 83%: no keyboard
  });
  it('the app height freezes while the keyboard is open, so the sheet never resizes (control: it follows the viewport otherwise)', () => {
    expect(nextAppHeight(760, 420, true)).toBe(760);
    expect(nextAppHeight(760, 420, false)).toBe(420);
    expect(nextAppHeight(null, 420, true)).toBe(420); // nothing to hold yet
  });
  it('the sheet is the app height less the safe top and 30px', () => {
    expect(sheetHeight(760, 47)).toBe(683);
  });
  it('the list runs 28px behind the keyboard, and never below 80px', () => {
    expect(fitListMax(420, 240)).toBe(208);
    expect(fitListMax(300, 290)).toBe(80);
  });
  it('fits after the 0.3s slide-in, never during it', () => {
    expect(FIT_AFTER_MS).toBeGreaterThan(300);
  });
});
