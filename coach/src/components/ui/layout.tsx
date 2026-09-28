import type { CSSProperties, ReactNode, Ref } from 'react';

const idx = (i: number) => ({ '--i': i }) as CSSProperties;

/** Page header (§1.2): eyebrow over H1, one 44×44 action where the page needs one. */
export function PageHeader({ eyebrow, title, sub, actions }: { eyebrow?: ReactNode; title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="top rise" style={idx(0)}>
      <div className="titles">
        {eyebrow != null && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {sub != null && <p className="sub">{sub}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </header>
  );
}

/** Hero card: the page's single most important number or visual. */
export function Hero({ children, onClick, label, style, className = '' }: { children: ReactNode; onClick?: () => void; label?: string; style?: CSSProperties; className?: string }) {
  const s = { ...idx(1), ...style };
  if (onClick) {
    return <button type="button" className={`hero rise ${className}`} style={s} onClick={onClick} aria-label={label}>{children}</button>;
  }
  return <div className={`hero rise ${className}`} style={s}>{children}</div>;
}

/**
 * Numbered section (§3). Numbering is passed in, never hard-coded, so a
 * hidden section never leaves a gap: use `numberSections()` to assign.
 * The sublabel is required: sections never drop it.
 */
export function Section({ n, title, sub, slot, i, children, className = '', id }: {
  n: number; title: string; sub: ReactNode; slot?: ReactNode; i: number; children: ReactNode; className?: string; id?: string;
}) {
  const hid = id ?? `sec-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <section className={`sec rise ${className}`} style={idx(i)} aria-labelledby={hid}>
      <div className="sec-h">
        <span className="sec-n" aria-hidden="true">{String(n).padStart(2, '0')}</span>
        <h2 id={hid}>{title}</h2>
        {slot && <div className="sec-slot">{slot}</div>}
      </div>
      <p className="sec-d">{sub}</p>
      {children}
    </section>
  );
}

/**
 * Assign gap-free numbers to the sections that are shown.
 * `const n = numberSections(['week', showFood && 'food', 'next'])` → n.week === 1…
 */
export function numberSections<K extends string>(keys: (K | false | null | undefined)[]): Record<K, number> {
  const out = {} as Record<K, number>;
  let k = 0;
  keys.forEach((key) => { if (key) out[key] = ++k; });
  return out;
}

export function Page({ children, innerRef, className = '' }: { children: ReactNode; innerRef?: Ref<HTMLDivElement>; className?: string }) {
  return <div ref={innerRef} className={`page ${className}`}>{children}</div>;
}
