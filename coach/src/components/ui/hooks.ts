import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as RPointerEvent } from 'react';

/**
 * Page-load choreography (scope §4.1): replay the entrance on every screen
 * show by removing `is-entering`, forcing a reflow, and re-adding it.
 * Pass a key that changes when the screen is shown again (route, tab…).
 */
export function useEntering<T extends HTMLElement>(key: unknown) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.classList.remove('is-entering');
    void el.offsetWidth;
    el.classList.add('is-entering');
  }, [key]);
  return ref;
}

export function useMediaQuery(q: string) {
  const get = () => (typeof window !== 'undefined' ? window.matchMedia(q).matches : false);
  const [m, setM] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    on();
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return m;
}

export const useIsWide = () => useMediaQuery('(min-width: 1024px)');
export const useIsTablet = () => useMediaQuery('(min-width: 768px)');

/** Transient confirmation (e.g. "Client notified by push"). */
export function useToast(ms = 2600) {
  const [msg, setMsg] = useState<string | null>(null);
  const t = useRef<number>();
  const show = useCallback((m: string) => {
    setMsg(m);
    window.clearTimeout(t.current);
    t.current = window.setTimeout(() => setMsg(null), ms);
  }, [ms]);
  return { msg, show };
}

/**
 * Tap-and-hold, then drag (Part 1 §9, ported from personal-ledger's TrendChart).
 * Touch: hold 280ms to engage, then drag scrubs; a quick swipe still scrolls.
 * Mouse/pen: hover scrubs immediately. Returns the scrub x (px in the element)
 * or null, plus props to spread on the chart's hit area.
 */
export function useScrub(opts: { holdMs?: number } = {}) {
  const holdMs = opts.holdMs ?? 280;
  const [x, setX] = useState<number | null>(null);
  const [engaged, setEngaged] = useState(false);
  const timer = useRef<number>();
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const el = useRef<HTMLElement | null>(null);
  const wasScrub = useRef(false);

  const localX = (e: RPointerEvent) => {
    const r = (el.current ?? (e.currentTarget as HTMLElement)).getBoundingClientRect();
    return Math.max(0, Math.min(r.width, e.clientX - r.left));
  };

  const onPointerDown = (e: RPointerEvent<HTMLElement>) => {
    el.current = e.currentTarget;
    if (e.pointerType === 'mouse') return;
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    const lx = localX(e);
    timer.current = window.setTimeout(() => {
      setEngaged(true);
      wasScrub.current = true;
      setX(lx);
      try { el.current?.setPointerCapture(e.pointerId); } catch { /* noop */ }
      if ('vibrate' in navigator) navigator.vibrate?.(8);
    }, holdMs);
  };
  const onPointerMove = (e: RPointerEvent<HTMLElement>) => {
    el.current = e.currentTarget;
    if (e.pointerType === 'mouse') { setX(localX(e)); return; }
    if (engaged) { setX(localX(e)); return; }
    const s = start.current;
    if (s && (Math.abs(e.clientX - s.x) > 8 || Math.abs(e.clientY - s.y) > 8)) {
      window.clearTimeout(timer.current); start.current = null; // it was a scroll or swipe
    }
  };
  const end = () => {
    window.clearTimeout(timer.current);
    start.current = null;
    setEngaged(false);
    setX(null);
  };
  /** True once after a hold-drag, so the release is not also treated as a tap. */
  const consumeScrubClick = () => { const v = wasScrub.current; wasScrub.current = false; return v; };
  return {
    x,
    engaged,
    consumeScrubClick,
    bind: {
      onPointerDown, onPointerMove,
      onPointerUp: end, onPointerCancel: end,
      onPointerLeave: (e: RPointerEvent) => { if (e.pointerType === 'mouse') end(); },
      style: { touchAction: engaged ? 'none' : 'pan-y' } as CSSProperties,
    },
  };
}

/**
 * Runs `fn` whenever the app comes back to the front: the page becomes
 * visible again (back from another app or tab, a phone unlocked) or the
 * window regains focus. Screens that show server data reload with it, so a
 * change made elsewhere shows without leaving the screen. Both events can
 * fire together; a reload inside 1 s of the last is skipped.
 */
export function useOnResume(fn: () => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    let last = 0;
    const run = () => {
      if (document.visibilityState !== 'visible') return;
      const now = performance.now();
      if (now - last < 1000) return;
      last = now;
      ref.current();
    };
    document.addEventListener('visibilitychange', run);
    window.addEventListener('focus', run);
    return () => { document.removeEventListener('visibilitychange', run); window.removeEventListener('focus', run); };
  }, []);
}
