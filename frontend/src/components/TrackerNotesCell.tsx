import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { JobRow, TrackerJobUpdate } from '../types';
import { UiIcon } from './UiIcon';

export function TrackerNotesCell({ job, canManage, onUpdate, label }: {
  job: JobRow; canManage: boolean; label: string;
  onUpdate: (job: JobRow, update: TrackerJobUpdate) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return <td className="jt-data-cell jt-note-cell">
    <button ref={trigger} type="button" className="jt-cell-button" title={job.description || label}
      aria-label={`${canManage ? 'Editar' : 'Ver'} notas: ${job.service}`} aria-haspopup="dialog" onClick={() => setOpen(true)}>
      {job.description || '—'}
    </button>
    {open ? <NotesEditor job={job} label={label} canManage={canManage} onUpdate={onUpdate}
      onClose={() => { setOpen(false); trigger.current?.focus({ preventScroll: true }); }} /> : null}
  </td>;
}

function NotesEditor({ job, label, canManage, onUpdate, onClose }: {
  job: JobRow; label: string; canManage: boolean; onClose: () => void;
  onUpdate: (job: JobRow, update: TrackerJobUpdate) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const titleId = useId();
  const [draft, setDraft] = useState(job.description);
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
    if (draft === job.description) { close(); return; }
    busy.current = true; setSaving(true); setError('');
    try { await onUpdate(job, { description: draft }); onClose(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo guardar. Inténtalo de nuevo.'); }
    finally { busy.current = false; setSaving(false); }
  };
  return createPortal(<dialog ref={dialog} className="jt-notes-dialog" aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); close(); }}>
    <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <div className="jt-notes-heading"><div><h2 id={titleId}>{label}</h2><p>{job.propertyName} · {job.service}</p></div>
        <button type="button" className="jt-notes-close" aria-label="Cerrar notas" disabled={saving} onClick={close}><UiIcon name="close" size={20} /></button>
      </div>
      <textarea ref={textarea} aria-label={label} value={draft} maxLength={3000} readOnly={!canManage} disabled={saving}
        onChange={(event) => { setDraft(event.target.value); setError(''); }} onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); void save(); }
        }} />
      <div className="jt-notes-footer"><span>{draft.length}/3000</span><div>
        <button type="button" disabled={saving} onClick={close}>{canManage ? 'Cancelar' : 'Cerrar'}</button>
        {canManage ? <button type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar notas'}</button> : null}
      </div></div>
      {error ? <p className="jt-editor-error" role="alert">{error}</p> : null}
    </form>
  </dialog>, document.body);
}
