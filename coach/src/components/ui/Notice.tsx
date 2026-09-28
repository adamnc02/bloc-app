import type { CSSProperties, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/**
 * Tinted notice panel, the shape of BLOC's Train deload banner (§6.2): icon,
 * bold title, one or two lines, optional trailing slot. Promoted from the
 * wireframes' two deliberate copies (coach/components/core/Notice and
 * bloc/components/bits), per COMPONENT-INVENTORY "Worth merging before the build".
 */
export function Notice({ icon, title, children, tone = 'acc', trailing, style }: {
  icon: IconName; title: ReactNode; children?: ReactNode; tone?: 'acc' | 'ice' | 'amber' | 'bad' | 'neutral'; trailing?: ReactNode; style?: CSSProperties;
}) {
  const colour = tone === 'acc' ? 'var(--accent2)' : tone === 'ice' ? 'var(--ice)' : tone === 'amber' ? 'var(--amber)' : tone === 'bad' ? 'var(--red)' : 'var(--text2)';
  const base = tone === 'acc' ? 'var(--accent)' : tone === 'neutral' ? 'var(--text)' : colour;
  return (
    <div
      style={{
        display: 'flex', gap: 12, alignItems: 'flex-start', padding: 14, borderRadius: 14,
        background: `color-mix(in srgb, ${base} 10%, transparent)`, border: `1px solid color-mix(in srgb, ${base} 30%, transparent)`, ...style,
      }}
    >
      <span style={{ color: colour, marginTop: 1, flexShrink: 0 }}><Icon name={icon} size={20} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, color: colour }}>{title}</div>
        {children && <div className="muted" style={{ fontSize: 13, marginTop: 3, lineHeight: 1.45 }}>{children}</div>}
      </div>
      {trailing}
    </div>
  );
}
