import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

type BtnVariant = 'primary' | 'ghost' | 'danger';

/**
 * Buttons (§2.4). Every save or confirm is primary. Secondary actions are ghost.
 * `size`: full = 52px page CTA, card = 46px in-card, sm = 44px small.
 */
export function Button({ variant = 'primary', size = 'full', icon, pulse, children, className = '', ...rest }:
  { variant?: BtnVariant; size?: 'full' | 'card' | 'sm' | 'compact'; icon?: IconName; pulse?: boolean; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const base = size === 'sm' || size === 'compact' ? `btn-sm ${size === 'compact' ? 'compact' : ''} ${variant === 'primary' ? 'solid' : variant === 'danger' ? 'danger' : ''}` : `btn ${size === 'card' ? 'in-card' : ''} ${variant === 'primary' ? '' : variant}`;
  return (
    <button type="button" className={`${base} ${pulse ? 'pulse' : ''} ${className}`} {...rest}>
      {icon && <Icon name={icon} size={size === 'full' ? 18 : 16} />}
      {children}
    </button>
  );
}

export function IconButton({ icon, label, onClick, inCard, round, className = '', size }: { icon: IconName; label: string; onClick?: () => void; inCard?: boolean; round?: boolean; className?: string; size?: number }) {
  return (
    <button type="button" className={`icon-btn ${inCard ? 'in-card' : ''} ${round ? 'round' : ''} ${className}`} aria-label={label} title={label} onClick={onClick}>
      <Icon name={icon} size={size ?? (inCard || round ? 18 : 22)} />
    </button>
  );
}

/** Row button (§2.4): bold title, small subtitle, trailing chevron (or icon). */
export function RowButton({ title, sub, onClick, trailing = 'chevR', lead, badge, disabled }: { title: ReactNode; sub?: ReactNode; onClick?: () => void; trailing?: IconName; lead?: IconName; badge?: ReactNode; disabled?: boolean }) {
  return (
    <button type="button" className="rowbtn" onClick={onClick} disabled={disabled} style={disabled ? { opacity: .45 } : undefined}>
      {lead && <span className="icon-tile"><Icon name={lead} size={18} /></span>}
      <span style={{ flex: 1, minWidth: 0 }}>
        <b>{title} {badge}</b>
        {sub && <small>{sub}</small>}
      </span>
      <span className="chev"><Icon name={trailing} size={22} /></span>
    </button>
  );
}

export function Seg<T extends string>({ value, options, onChange, accent, label, className = '' }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; accent?: boolean; label: string; className?: string }) {
  return (
    <div className={`seg ${accent ? 'acc' : ''} ${className}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange?: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" className="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange?.(!checked)} />;
}

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="checkbox" className="check" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}>
      {checked && <Icon name="check" size={16} />}
    </button>
  );
}

export function Field({ label, htmlFor, children, hint }: { label: string; htmlFor?: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="field">
      {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <span className="label-text">{label}</span>}
      {children}
      {hint && <div className="caption" style={{ marginTop: 6 }}>{hint}</div>}
    </div>
  );
}

/** Stepper for servings / lengths. */
export function Stepper({ value, onChange, min = 0, max = 99, step = 1, format = String, label }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; format?: (n: number) => string; label: string }) {
  return (
    <div className="inrow" role="group" aria-label={label}>
      <button type="button" className="icon-btn" aria-label={`Less ${label}`} onClick={() => onChange(Math.max(min, value - step))}><span aria-hidden="true" style={{ fontSize: 22 }}>−</span></button>
      <div className="input num" style={{ display: 'grid', placeItems: 'center', fontWeight: 700, whiteSpace: 'nowrap', padding: '0 6px' }} aria-live="polite">{format(value)}</div>
      <button type="button" className="icon-btn" aria-label={`More ${label}`} onClick={() => onChange(Math.min(max, value + step))}><Icon name="plus" size={20} /></button>
    </div>
  );
}
