import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { useMediaQuery } from './hooks';
import { FIT_AFTER_MS, PIN_BELOW_PX, fitListMax, isKeyboardOpen, nextAppHeight, sheetHeight } from './searchFit';

/**
 * A sheet whose search box filters a list (TECHNICAL §144): BLOC's
 * keyboard-pinned search sheet (BLOC TECHNICAL §9 → "Search sheets", §117),
 * as one component so no screen can leave a part out.
 *
 * 🚨 Never put a filtering list in `Sheet`. `Sheet` is anchored to the bottom
 *    and sized by its content, so every keystroke that shortens the list
 *    shrinks it and drops its top behind the keyboard.
 *    scripts/verify-coach-search-sheets.mjs fails on a search box anywhere
 *    but here.
 *
 * The four parts, below 768px (a tablet or laptop gets a centred dialog, with
 * no on-screen keyboard to manage):
 *   1. The sheet never resizes: `position: fixed`, its top at the safe area +
 *      30px, its height from the app height, which is frozen while the
 *      keyboard is open, so its own background runs behind the keyboard.
 *      Everything above the list is `flex-shrink: 0`.
 *   2. Only the list resizes: a wrap (`flex: 1 1 auto; min-height: 0`)
 *      holding the scroller and a SIBLING fade; as a child of the scroller a
 *      re-render would remove it.
 *   3. Fit after the slide-in: the wrap's max height is cleared on open and
 *      fitted once 320ms have passed (the sheet slides in over 0.3s here).
 *   4. Re-fit on every visualViewport resize, which fires when the keyboard
 *      opens and closes: down to the keyboard's top, and 28px behind it.
 * The keyboard test is BLOC's: the Home Screen app only (`navigator.standalone`).
 */
export function SearchSheet({ open, title, onClose, query, onQuery, placeholder, sub, actions, children, footer }: {
  open: boolean; title: ReactNode; onClose: () => void;
  query: string; onQuery: (q: string) => void; placeholder: string;
  /** A line under the title. */
  sub?: ReactNode;
  /** Anything between the search box and the list (a filter row). Never scrolls. */
  actions?: ReactNode;
  /** The list. */
  children: ReactNode;
  /** Under the list (a primary button). Never scrolls. */
  footer?: ReactNode;
}) {
  const pinned = !useMediaQuery(`(min-width: ${PIN_BELOW_PX}px)`);
  const panel = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const appH = useRef<number | null>(null);
  const [h, setH] = useState<number | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const fit = useCallback(() => {
    const vv = window.visualViewport;
    const el = wrap.current;
    if (!vv || !el || !pinned) return;
    el.style.maxHeight = `${fitListMax(vv.height, el.getBoundingClientRect().top)}px`;
  }, [pinned]);

  // 1 and 4: the app height (frozen with the keyboard up), then the list's fit.
  useEffect(() => {
    if (!open || !pinned) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const safeTop = () => {
      // env() only resolves inside a property: measure it on a probe.
      const probe = document.createElement('div');
      probe.style.cssText = 'position:fixed;visibility:hidden;padding-top:env(safe-area-inset-top)';
      document.body.appendChild(probe);
      const v = parseFloat(getComputedStyle(probe).paddingTop) || 0;
      probe.remove();
      return v;
    };
    const measure = () => {
      const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
      appH.current = nextAppHeight(appH.current, vv.height, isKeyboardOpen(standalone, vv.height, window.screen.height));
      setH(sheetHeight(appH.current, safeTop()));
      fit();
    };
    measure();
    vv.addEventListener('resize', measure);
    return () => vv.removeEventListener('resize', measure);
  }, [open, pinned, fit]);

  // 3: clear, then fit once the slide-in has finished.
  useLayoutEffect(() => {
    if (!open) return;
    if (wrap.current) wrap.current.style.maxHeight = '';
    const t = window.setTimeout(fit, FIT_AFTER_MS);
    return () => window.clearTimeout(t);
  }, [open, fit]);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const p = panel.current;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); };
    p?.addEventListener('keydown', onKey);
    return () => { p?.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className="sheet-layer">
      <button type="button" className="scrim" aria-label="Close" onClick={onClose} tabIndex={-1} />
      <div
        ref={panel} className={`sheet search-sheet ${pinned ? 'pinned' : ''}`} role="dialog" aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined} tabIndex={-1}
        style={pinned && h ? { height: h } : undefined}
      >
        <div className="ss-fixed">
          <div className="handle" />
          <div className="sh-h">
            <h3>{title}</h3>
            <button type="button" className="icon-btn round" aria-label="Close" onClick={onClose}><Icon name="close" size={18} /></button>
          </div>
          {sub && <p className="muted" style={{ marginBottom: 12 }}>{sub}</p>}
          <div className="ss-search">
            <Icon name="search" size={18} />
            <input
              type="search" className="input" value={query} placeholder={placeholder} aria-label={placeholder}
              onChange={(e) => onQuery(e.target.value)} autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="search"
            />
          </div>
          {actions}
        </div>
        <div ref={wrap} className="ss-list-wrap">
          <div className="ss-list">{children}</div>
          <div className="ss-fade" aria-hidden="true" />
        </div>
        {footer && <div className="ss-fixed ss-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
