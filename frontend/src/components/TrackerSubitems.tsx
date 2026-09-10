import { useRef, useState } from 'react';
import type { JobRow, TrackerColumn, TrackerJobUpdate, TrackerLabel, TrackerSubitem, WorkerSummary } from '../types';
import { TrackerLabelCell } from './TrackerCellEditors';
import { TrackerOwnerCell, TrackerDueCell } from './TrackerDataCells';
import { TrackerNotesCell, TrackerNotesEditor } from './TrackerNotesCell';
import { TrackerColumnHeader } from './TrackerColumnHeader';
import { UiIcon } from './UiIcon';

export function TrackerSubitems({ job, canManage, workers, labels, columns, onUpdate, onColumnChange, onLabelsChange }: {
  job: JobRow; canManage: boolean; workers: WorkerSummary[]; labels: TrackerLabel[]; columns: TrackerColumn[];
  onUpdate: (job: JobRow, update: TrackerJobUpdate) => Promise<void>;
  onColumnChange: (column: TrackerColumn) => Promise<void>; onLabelsChange: (labels: TrackerLabel[]) => Promise<void>;
}) {
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false);
  const addButton = useRef<HTMLButtonElement>(null);
  const subitems = job.subitems ?? [];
  const descriptionColumn = columns.find((column) => column.key === 'description')!;
  const context = [job.propertyName, job.area, job.service].filter(Boolean).join(' · ');
  const updateSubitem = (subitem: TrackerSubitem) => async (_job: JobRow, update: TrackerJobUpdate) => {
    const { description, status, dueDate, workerIds } = update;
    await onUpdate(job, { subitem: { action: 'update', id: subitem.id,
      ...(description !== undefined ? { description } : {}), ...(status !== undefined ? { status } : {}),
      ...(dueDate !== undefined ? { dueDate } : {}), ...(workerIds !== undefined ? { workerIds } : {}),
    } });
  };
  const remove = async (id: string) => {
    if (busy.current) return;
    busy.current = true; setSaving(true); setError('');
    try { await onUpdate(job, { subitem: { action: 'delete', id } }); setDeleting(null); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not delete the subitem.'); }
    finally { busy.current = false; setSaving(false); }
  };
  return <div className="jt-subitems" id={`jt-subitems-${job.id}`}>
    <table className="jt-subitems-table" aria-label={`Subitems for ${job.service}`}>
      <colgroup>{[440, 110, 126, 112, 150].map((width, index) => <col key={index} style={{ width }} />)}</colgroup>
      <thead><tr>{(['description', 'workers', 'status', 'dueDate', 'actions'] as const).map((key) =>
        <TrackerColumnHeader key={key} column={columns.find((column) => column.key === key)!} canManage={canManage} onChange={onColumnChange} />)}</tr></thead>
      <tbody>{subitems.map((subitem) => {
        const row: JobRow = { ...job, ...subitem, service: subitem.description, startDate: null,
          timeline: { ...job.timeline, isLate: subitem.status !== 'DONE' && Boolean(subitem.dueDate && new Date(subitem.dueDate).getTime() < Date.now()) },
        };
        const update = updateSubitem(subitem);
        return <tr key={subitem.id}>
          <TrackerNotesCell job={row} label={descriptionColumn.label} allowEmpty={false} context={context} canManage={canManage} onUpdate={update} />
          <TrackerOwnerCell job={row} workers={workers} canManage={canManage} onUpdate={update} />
          <TrackerLabelCell kind="status" job={row} labels={labels} canManage={canManage} onUpdate={update} onLabelsChange={onLabelsChange} />
          <TrackerDueCell job={row} canManage={canManage} onUpdate={update} />
          <td>{canManage ? deleting === subitem.id ? <div className="jt-subitem-confirm">
            <button type="button" disabled={saving} onClick={() => { void remove(subitem.id); }}>Delete subitem</button>
            <button type="button" disabled={saving} onClick={() => { setDeleting(null); setError(''); }}>Cancel</button>
          </div> : <div className="jt-actions"><button type="button" className="jt-delete" aria-label={`Delete subitem: ${subitem.description}`}
            onClick={() => { setDeleting(subitem.id); setError(''); }}><UiIcon name="trash" size={15} /></button></div> : null}</td>
        </tr>;
      })}
        {!subitems.length ? <tr><td colSpan={5} className="jt-subitems-empty">No subitems yet.</td></tr> : null}
        {canManage ? <tr className="jt-add-row"><td colSpan={5}><button ref={addButton} type="button" onClick={() => setCreating(true)}><UiIcon name="plus" size={15} />Add subitem</button></td></tr> : null}
      </tbody>
    </table>
    {error ? <p className="jt-editor-error" role="alert">{error}</p> : null}
    {creating ? <TrackerNotesEditor job={{ ...job, description: '' }} label="New subitem" saveLabel="Add subitem" allowEmpty={false} canManage={canManage}
      onClose={() => { setCreating(false); addButton.current?.focus({ preventScroll: true }); }}
      onUpdate={async (_job, update) => { await onUpdate(job, { subitem: { action: 'create', description: update.description! } }); }} /> : null}
  </div>;
}
