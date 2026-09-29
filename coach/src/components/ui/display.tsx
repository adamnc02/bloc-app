import type { CSSProperties, ReactNode } from 'react';
import type { OutcomeStatus } from '@/domain/types';
import { Icon, type IconName } from './Icon';

type Tone = 'good' | 'bad' | 'acc' | 'amber' | 'ice' | 'neutral' | 'blue' | '';

export function Card({ children, className = '', style, as: As = 'div', i }: { children: ReactNode; className?: string; style?: CSSProperties; as?: 'div' | 'article' | 'li'; i?: number }) {
  const s = i != null ? ({ '--i': i, ...style } as CSSProperties) : style;
  return <As className={`card ${i != null ? 'rise' : ''} ${className}`} style={s}>{children}</As>;
}

export function Chip({ tone = '', children, icon, style }: { tone?: Tone; children: ReactNode; icon?: IconName; style?: CSSProperties }) {
  return <span className={`chip ${tone}`} style={style}>{icon && <Icon name={icon} size={13} />}{children}</span>;
}

export function Tag({ tone = '', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`tag ${tone}`}>{children}</span>;
}

export function AIBadge({ label = 'BLOC AI' }: { label?: string }) {
  return <span className="aibadge"><Icon name="sparkle" size={13} /> {label}</span>;
}

/** Outcome chip: the one status every client list leads with. */
export function OutcomeChip({ status, label }: { status: OutcomeStatus; label?: string }) {
  const map = { 'on-track': ['good', 'On track'], 'off-track': ['bad', 'Off track'], 'no-data': ['neutral', 'No outcome yet'] } as const;
  const [tone, text] = map[status];
  return <Chip tone={tone}>{label ?? text}</Chip>;
}

/**
 * AI action row (§6.4 placement rule): full width, directly under the
 * "Read full…" ghost button. Lavender with ✦ when actionable, grey timer row when not.
 */
export function ActionRow({ kind, children, onClick, disabled }: { kind: 'ready' | 'timer'; children: ReactNode; onClick?: () => void; disabled?: boolean }) {
  if (kind === 'ready') {
    return (
      <button type="button" className="soon act" onClick={onClick} disabled={disabled} style={disabled ? { opacity: .4 } : undefined}>
        <Icon name="sparkle" size={15} /> {children} {!disabled && <span className="ready-dot" aria-hidden="true" />}
      </button>
    );
  }
  return <div className="soon"><Icon name="timer" size={16} /> {children}</div>;
}

/** 6px bar; `over` renders the red excess after the target (Fuel hero rule). */
export function Bar({ value, color = 'var(--accent)', i = 0, thick, over, label }: { value: number; color?: string; i?: number; thick?: boolean; over?: number; label?: string }) {
  const w = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={`bar ${thick ? 'thick' : ''}`} role="img" aria-label={label}>
      {over && over > 0 ? (
        <i style={{ width: '100%', background: `linear-gradient(90deg, ${color} ${100 / (1 + over)}%, var(--red) ${100 / (1 + over)}%)`, ['--i' as string]: i }} />
      ) : (
        <i style={{ width: `${w}%`, background: color, ['--i' as string]: i }} />
      )}
    </div>
  );
}

export function Metric({ label, value, target, unit, frac, color, i, note }: { label: string; value: ReactNode; target: ReactNode; unit?: string; frac: number; color: string; i: number; note?: ReactNode }) {
  return (
    <div className="metric">
      <div className="row"><span className="lbl">{label}</span><span className="val num"><b>{value}</b> / {target}{unit ? ` ${unit}` : ''}</span></div>
      <Bar value={frac} color={color} i={i} label={`${label} ${Math.round(frac * 100)}% of target`} />
      {note && <div className="note">{note}</div>}
    </div>
  );
}

export function Ring({ size = 104, stroke = 9, value, label, sub }: { size?: number; stroke?: number; value: number; label: ReactNode; sub?: ReactNode }) {
  const r = (size - stroke) / 2 - 1;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(1, value)));
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} className="trk" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} className="arc" strokeWidth={stroke} style={{ ['--c' as string]: c, ['--off' as string]: off }} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div className="ring-l"><b>{label}</b>{sub && <span>{sub}</span>}</div>
    </div>
  );
}

export function Avatar({ initials, size = 40, solid }: { initials: string; size?: number; solid?: boolean }) {
  return <span className={`avatar ${solid ? 'solid' : ''}`} style={{ width: size, height: size, fontSize: size * 0.36 }} aria-hidden="true">{initials}</span>;
}

export function StatTile({ label, value, sub, subTone }: { label: string; value: ReactNode; sub?: ReactNode; subTone?: 'good' | 'bad' | 'acc' }) {
  return (
    <div className="card" style={{ padding: 14 }}>
      <div className="muted" style={{ fontSize: 12 }}>{label}</div>
      <div className="stat" style={{ marginTop: 6 }}>{value}</div>
      {sub != null && <div className={subTone ? `t-${subTone}` : 'muted'} style={{ fontSize: 11.5, marginTop: 4, fontWeight: subTone ? 700 : 500 }}>{sub}</div>}
    </div>
  );
}

/** Score out of 10, the unit every compliance level uses (§7.1). */
export function Score({ value, size = 24 }: { value: string; size?: number }) {
  return <span className="num" style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: size }}>{value}<span style={{ fontSize: size * 0.58, color: 'var(--text3)' }}>/10</span></span>;
}

export function EmptyState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: '26px 18px' }}>
      <div className="muted">{children}</div>
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}
