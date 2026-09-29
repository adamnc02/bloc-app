// ═══════════════════════════════════════════════════════════════════════
// SearchSheet's measurements, pure (BLOC TECHNICAL §9 → "Search sheets";
// Coach TECHNICAL §144). searchFit.test.ts pins each rule.
// ═══════════════════════════════════════════════════════════════════════

/** The sheet's top sits this far below the safe area. */
export const SHEET_TOP_GAP = 30;
/** The list runs this far behind the keyboard, under the fade. */
export const LIST_UNDER_KEYBOARD = 28;
/** The list never shrinks below this. */
export const LIST_MIN = 80;
/** The sheet slides in over 0.3 s; the list is fitted once this has passed (a mid-slide measurement is wrong). */
export const FIT_AFTER_MS = 320;
/** Below this width the sheet pins; at or above it, it's a centred dialog with no on-screen keyboard to manage. */
export const PIN_BELOW_PX = 768;

/**
 * BLOC's keyboard test: only the Home Screen app reports it
 * (`navigator.standalone`), with the visual viewport under 75% of the screen.
 */
export function isKeyboardOpen(standalone: boolean, viewportHeight: number, screenHeight: number): boolean {
  return standalone && viewportHeight < screenHeight * 0.75;
}

/** The app height the sheet is sized from: the visual viewport's, FROZEN while the keyboard is open. */
export function nextAppHeight(previous: number | null, viewportHeight: number, keyboardOpen: boolean): number {
  return keyboardOpen && previous ? previous : viewportHeight;
}

/** The sheet's height: the app height less the safe top and the gap. It never changes while typing. */
export function sheetHeight(appHeight: number, safeTop: number): number {
  return Math.max(0, appHeight - safeTop - SHEET_TOP_GAP);
}

/** The list's max height: down to the keyboard's top (the live viewport) and 28px behind it, at least 80. */
export function fitListMax(viewportHeight: number, listTop: number): number {
  return Math.max(LIST_MIN, Math.round(viewportHeight - listTop + LIST_UNDER_KEYBOARD));
}
