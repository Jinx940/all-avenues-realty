import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { JobRow, TrackerJobUpdate } from '../types';
import { UiIcon } from './UiIcon';

export function TrackerNotesCell({ job, canManage, onUpdate, label, field = 'description', allowEmpty = true, context }: {
  job: JobRow; canManage: boolean; label: string;
  field?: 'description' | 'service'; allowEmpty?: boolean; context?: string;
  onUpdate: (job: JobRow, update: TrackerJobUpdate) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return <td className="jt-data-cell jt-note-cell">
    <button ref={trigger} type="button" className="jt-cell-button" title={job[field] || label}
      aria-label={`${canManage ? 'Edit' : 'View'} ${field === 'service' ? 'service' : 'notes'}: ${job.service}`} aria-haspopup="dialog" onClick={() => setOpen(true)}>
      {job[field] || '—'}
    </button>
    {open ? <TrackerNotesEditor job={job} label={label} field={field} allowEmpty={allowEmpty} context={context} canManage={canManage} onUpdate={onUpdate}
      onClose={() => { setOpen(false); trigger.current?.focus({ preventScroll: true }); }} /> : null}
  </td>;
}

export function TrackerNotesEditor({ job, label, canManage, onUpdate, onClose, field = 'description', allowEmpty = true, context, saveLabel }: {
  job: JobRow; label: string; canManage: boolean; onClose: () => void;
  field?: 'description' | 'service'; allowEmpty?: boolean; context?: string; saveLabel?: string;
  onUpdate: (job: JobRow, update: TrackerJobUpdate) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const titleId = useId();
  const [draft, setDraft] = useState(job[field]);
  const maxLength = field === 'service' ? 160 : 3000;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    textarea.current?.focus({ preventScroll: true });
    return () => element?.close();
  }, []);
  const close = () => { if (!busy.current) onClose(); };
  const save = async () => {
    if (busy.current || !canManage) return;
    if ((!allowEmpty || field === 'service') && !draft.trim()) return;
    if (draft === job[field]) { close(); return; }
    busy.current = true; setSaving(true); setError('');
    try { await onUpdate(job, { [field]: draft }); onClose(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save. Please try again.'); }
    finally { busy.current = false; setSaving(false); }
  };
  return createPortal(<dialog ref={dialog} className="jt-notes-dialog" aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); close(); }}>
    <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <div className="jt-notes-heading"><div><h2 id={titleId}>{label}</h2><p>{context ?? [job.propertyName, job.area, job.service].filter(Boolean).join(' · ')}</p></div>
        <button type="button" className="jt-notes-close" aria-label="Close notes" disabled={saving} onClick={close}><UiIcon name="close" size={20} /></button>
      </div>
      <textarea ref={textarea} aria-label={label} value={draft} maxLength={maxLength} readOnly={!canManage} disabled={saving}
        onChange={(event) => { setDraft(event.target.value); setError(''); }} onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); void save(); }
        }} />
      <div className="jt-notes-footer"><span>{draft.length}/{maxLength}</span><div>
        <button type="button" disabled={saving} onClick={close}>{canManage ? 'Cancel' : 'Close'}</button>
        {canManage ? <button type="submit" disabled={saving || ((!allowEmpty || field === 'service') && !draft.trim())}>{saving ? 'Saving…' : saveLabel ?? (field === 'service' ? 'Save service' : 'Save notes')}</button> : null}
      </div></div>
      {error ? <p className="jt-editor-error" role="alert">{error}</p> : null}
    </form>
  </dialog>, document.body);
}
