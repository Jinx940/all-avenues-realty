import { useState } from 'react';
import type { TrackerColumn } from '../types';
import { defaultTrackerColumns } from '../lib/jobTracker';
import { TrackerPopover } from './TrackerCellEditors';

export function TrackerColumnHeader({ column, canManage, onChange }: {
  column: TrackerColumn; canManage: boolean; onChange: (column: TrackerColumn) => Promise<void>;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [draft, setDraft] = useState(column.label);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    const label = draft.trim();
    if (!label || saving) return;
    if (label === column.label) { setAnchor(null); return; }
    setSaving(true); setError('');
    try { await onChange({ key: column.key, label }); setAnchor(null); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save. Please try again.'); }
    finally { setSaving(false); }
  };
  return <th scope="col" className="jt-column-header" title={column.label}>
    {canManage ? <button type="button" aria-label={`Rename column: ${column.label}`} aria-haspopup="dialog" aria-expanded={Boolean(anchor)}
      onClick={(event) => { setAnchor(event.currentTarget); setDraft(column.label); setError(''); }}>{column.label}</button> : column.label}
    {anchor ? <TrackerPopover anchor={anchor} title="Column name" onClose={() => { if (!saving) setAnchor(null); }}>
      <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <input aria-label="Column name" value={draft} maxLength={40} required disabled={saving} onChange={(event) => setDraft(event.target.value)} />
        <p className="jt-column-hint">Applies to all groups.</p>
        <div className="jt-editor-actions"><button type="button" disabled={saving} onClick={() => setDraft(defaultTrackerColumns.find((item) => item.key === column.key)!.label)}>Reset</button>
          <button type="submit" disabled={saving || !draft.trim()}>{saving ? 'Saving…' : 'Save'}</button></div>
        {error ? <p className="jt-editor-error" role="alert">{error}</p> : null}
      </form>
    </TrackerPopover> : null}
  </th>;
}
