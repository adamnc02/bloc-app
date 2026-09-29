import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useScrub } from '@/components/ui/hooks';

/** Width of a container, kept in sync with ResizeObserver. */
export function useWidth<T extends HTMLElement>(fallback = 320) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export const CALLOUT_H = 58;

/**
 * Chart with a tap-hold-drag scrubber. The callout is drawn in a reserved
 * strip ABOVE the plot (Part 1 §9), clamped to the chart's edges, so it never
 * covers the data being read.
 *
 * `render(width, scrubX)` draws the SVG; `callout(scrubX)` returns the
 * callout content (and the x it should anchor to) or null.
 */
export function ScrubChart({ height, render, callout, label, hint = 'Hold and drag to read values', onTap }: {
  height: number;
  /** Quick tap (no hold): e.g. open the day's meals. */
  onTap?: (width: number, x: number) => void;
  render: (width: number, x: number | null) => ReactNode;
  callout: (width: number, x: number) => { at: number; body: ReactNode } | null;
  label: string;
  hint?: string;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const scrub = useScrub();
  const c = scrub.x != null ? callout(w, scrub.x) : null;
  return (
    <div ref={ref} style={{ position: 'relative', paddingTop: CALLOUT_H, userSelect: 'none', WebkitUserSelect: 'none' }}>
      <div aria-live="polite" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: CALLOUT_H - 8 }}>
        {c ? (
          <div className="fade-in" style={{
            position: 'absolute', bottom: 0, left: Math.max(0, Math.min(w - 190, c.at - 95)), width: 190,
            background: 'var(--surface3)', borderRadius: 10, padding: '7px 10px', fontSize: 12, lineHeight: 1.35,
          }}>{c.body}</div>
        ) : (
          <div className="caption" style={{ position: 'absolute', bottom: 4, left: 0 }}>{hint}</div>
        )}
      </div>
      <div
        {...scrub.bind} role="img" aria-label={label} style={{ ...scrub.bind.style, height, cursor: onTap ? 'pointer' : 'crosshair' }}
        onClick={onTap ? (e) => { if (scrub.consumeScrubClick()) return; const r = e.currentTarget.getBoundingClientRect(); onTap(w, e.clientX - r.left); } : undefined}
      >
        {render(w, scrub.x)}
      </div>
    </div>
  );
}

export function linear(d0: number, d1: number, r0: number, r1: number) {
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  const f = (v: number) => r0 + (v - d0) * k;
  f.invert = (px: number) => (k === 0 ? d0 : d0 + (px - r0) / k);
  return f;
}

export function niceRange(min: number, max: number, pad = 0.08): [number, number] {
  const span = Math.max(1, max - min);
  return [min - span * pad, max + span * pad];
}

export function Legend({ items }: { items: { label: string; swatch: ReactNode }[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginTop: 12, fontSize: 11.5, color: 'var(--text2)' }}>
      {items.map((it) => <span key={it.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{it.swatch}{it.label}</span>)}
    </div>
  );
}

export const LineSwatch = ({ color, dash, width = 2 }: { color: string; dash?: string; width?: number }) => (
  <svg width="18" height="8" aria-hidden="true"><line x1="1" x2="17" y1="4" y2="4" stroke={color} strokeWidth={width} strokeDasharray={dash} strokeLinecap="round" /></svg>
);
export const BoxSwatch = ({ color, opacity = 1 }: { color: string; opacity?: number }) => (
  <svg width="10" height="10" aria-hidden="true"><rect width="10" height="10" rx="2" fill={color} opacity={opacity} /></svg>
);
