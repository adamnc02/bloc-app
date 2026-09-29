import { useEffect, useRef, useState, type ReactNode, type PointerEvent as RPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

/**
 * Bottom sheet (§5): scrim fades in, sheet slides up; handle, title row
 * (Sora 22 + 40px round close), content, primary action last.
 * Swipe down on the handle/title or tap the scrim to close. `actions` sit
 * beside the close button (round icon buttons, e.g. Edit).
 * On tablet/laptop the same component centres as a dialog.
 */
export function Sheet({ open, title, onClose, children, wide, footer, actions }: { open: boolean; title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean; footer?: ReactNode; actions?: ReactNode }) {
  const [dy, setDy] = useState(0);
  const start = useRef<number | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); };
    const p = panel.current;
    p?.addEventListener('keydown', onKey);
    return () => { p?.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [open]);

  if (!open) return null;
  const drag = {
    onPointerDown: (e: RPointerEvent) => { start.current = e.clientY; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); },
    onPointerMove: (e: RPointerEvent) => { if (start.current != null) setDy(Math.max(0, e.clientY - start.current)); },
    onPointerUp: () => { if (dy > 90) onClose(); setDy(0); start.current = null; },
    onPointerCancel: () => { setDy(0); start.current = null; },
  };
  return createPortal(
    <div className="sheet-layer">
      <button type="button" className="scrim" aria-label="Close" onClick={onClose} tabIndex={-1} />
      <div
        ref={panel} className={`sheet ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} tabIndex={-1}
        style={dy ? { transform: `translateY(${dy}px)`, animation: 'none' } : undefined}
      >
        <div {...drag} style={{ touchAction: 'none', cursor: 'grab' }}>
          <div className="handle" />
          <div className="sh-h">
            <h3>{title}</h3>
            <span style={{ display: 'flex', gap: 8, flexShrink: 0 }} onPointerDown={(e) => e.stopPropagation()}>
              {actions}
              <button type="button" className="icon-btn round" aria-label="Close" onClick={onClose}><Icon name="close" size={18} /></button>
            </span>
          </div>
        </div>
        {children}
        {footer && <div style={{ marginTop: 20 }}>{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Toast({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <div className="toast fade-in" role="status"><Icon name="check" size={18} />{msg}</div>;
}
