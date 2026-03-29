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
  if (!open) return null;

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className={`dialog-card dialog-card--${tone}`} role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
        <div className="dialog-card-head">
          <h2 id="confirm-dialog-title">{title}</h2>
        </div>
        <p>{text}</p>
        <div className="dialog-actions">
          <button type="button" className="ghost-button" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button type="button" className={`dialog-confirm-button dialog-confirm-button--${tone}`} onClick={onConfirm} disabled={busy}>
            {busy ? 'Working...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
