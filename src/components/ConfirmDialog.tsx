'use client';
import { useEffect, useRef, type ReactNode } from 'react';

export default function ConfirmDialog({
  open, title, children, confirmLabel = 'Confirm', cancelLabel = 'Keep it', danger, busy, onConfirm, onClose,
}: {
  open: boolean; title: string; children?: ReactNode; confirmLabel?: string; cancelLabel?: string;
  danger?: boolean; busy?: boolean; onConfirm: () => void; onClose: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);
  if (!open) return null;
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-title">
        <h2 id="dlg-title">{title}</h2>
        <div className="text-2">{children}</div>
        <div className="dialog-actions">
          <button ref={cancelRef} className="btn btn-secondary" onClick={onClose} disabled={busy}>{cancelLabel}</button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} disabled={busy}>
            {busy && <span className="spinner" aria-hidden />}{confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
