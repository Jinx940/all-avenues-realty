import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { UiIcon } from './UiIcon';

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  text: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'success' | 'warning' | 'danger';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  text,
  confirmLabel = 'Accept',
  cancelLabel = 'Cancel',
  tone = 'default',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (open && element && !element.open) {
      element.showModal();
      element.querySelector<HTMLButtonElement>('[data-cancel]')?.focus();
    }
    return () => {
      if (element?.open) element.close();
      if (open && previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open]);
  if (!open) return null;

  return (
    createPortal(<dialog ref={dialog} className={`workspace-confirm dialog-card--${tone}`} aria-labelledby={titleId} aria-describedby={descriptionId} aria-busy={busy}
      onCancel={(event) => { event.preventDefault(); if (!busy) onCancel(); }}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
        const first = buttons[0];
        const last = buttons.at(-1);
        if (!first) { event.preventDefault(); return; }
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }}>
        <div className="dialog-card-head">
          <span className={`workspace-confirm-icon workspace-confirm-icon--${tone}`}><UiIcon name={tone === 'danger' ? 'trash' : tone === 'success' ? 'userCheck' : tone === 'warning' ? 'bell' : 'clipboard'} size={22} /></span>
          <button type="button" className="workspace-confirm-close" aria-label="Close confirmation" disabled={busy} onClick={onCancel}><UiIcon name="close" size={18} /></button>
        </div>
        <h2 id={titleId}>{title}</h2>
        <p id={descriptionId}>{text}</p>
        <div className="dialog-actions">
          <button type="button" className="ghost-button" data-cancel onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button type="button" className={`dialog-confirm-button dialog-confirm-button--${tone}`} onClick={onConfirm} disabled={busy}>
            {busy ? 'Working...' : confirmLabel}
          </button>
        </div>
    </dialog>, document.body)
  );
}
