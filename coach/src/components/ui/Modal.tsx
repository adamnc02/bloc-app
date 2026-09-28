import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Centred modal for one quick question (e.g. RPE after an exercise). Unlike
 * the bottom sheet it sits mid-screen on every size, so it reads as a pause
 * in the flow rather than a new task. Scrim tap or Esc dismisses (onClose).
 */
export function Modal({ open, labelledBy, onClose, children }: { open: boolean; labelledBy: string; onClose: () => void; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current(); };
    const p = panel.current;
    p?.addEventListener('keydown', onKey);
    return () => { p?.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [open]);
  if (!open) return null;
  return createPortal(
    <div className="modal-layer">
      <button type="button" className="scrim" aria-label="Close" tabIndex={-1} onClick={onClose} />
      <div ref={panel} className="modal" role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1}>{children}</div>
    </div>,
    document.body,
  );
}
