import type { CSSProperties, ReactNode, Ref } from 'react';
import { Icon } from './Icon';

const idx = (i: number) => ({ '--i': i }) as CSSProperties;

/**
 * A page's way back (‹ Clients), pinned to the top of the screen while the page scrolls. It sits in the eyebrow's
 * place above the H1 and stays in reach however far down the page is. `className` adds a show/hide class
 * (Settings' is phone-only).
 */
export function BackBar({ label, href, onClick, className = '' }: { label: ReactNode; href?: string; onClick?: () => void; className?: string }) {
  const inner = <><Icon name="chevL" size={14} /> {label}</>;
  return (
    <div className={`backbar ${className}`}>
      {href != null
        ? <a href={href} className="eyebrow eyebrow-link">{inner}</a>
        : <button type="button" className="eyebrow eyebrow-link" onClick={onClick}>{inner}</button>}
    </div>
  );
}

/** Page header (§1.2): eyebrow over H1, one 44×44 action where the page needs one. `back` (a BackBar) goes above it, pinned. */
export function PageHeader({ eyebrow, title, sub, actions, back }: { eyebrow?: ReactNode; title: ReactNode; sub?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <>
      {back}
      <header className={`top rise${back ? ' top-after-back' : ''}`} style={idx(0)}>
        <div className="titles">
          {eyebrow != null && <div className="eyebrow">{eyebrow}</div>}
          <h1>{title}</h1>
          {sub != null && <p className="sub">{sub}</p>}
        </div>
        {actions && <div className="actions">{actions}</div>}
      </header>
    </>
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
 * Section: a title, an optional right slot, and a sublabel that is always
 * present.
 * 🚨 Sections carry no number badge. There is no `n` prop, so a screen that
 *    passes one fails the type-check; scripts/verify-coach-no-section-numbers.mjs
 *    checks it (TECHNICAL §139).
 */
export function Section({ title, sub, slot, i, children, className = '', id }: {
  title: string; sub: ReactNode; slot?: ReactNode; i: number; children: ReactNode; className?: string; id?: string;
}) {
  const hid = id ?? `sec-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <section className={`sec rise ${className}`} style={idx(i)} aria-labelledby={hid}>
      <div className="sec-h">
        <h2 id={hid}>{title}</h2>
        {slot && <div className="sec-slot">{slot}</div>}
      </div>
      <p className="sec-d">{sub}</p>
      {children}
    </section>
  );
}

export function Page({ children, innerRef, className = '' }: { children: ReactNode; innerRef?: Ref<HTMLDivElement>; className?: string }) {
  return <div ref={innerRef} className={`page ${className}`}>{children}</div>;
}
