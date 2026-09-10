import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { buildCsv } from '../lib/csv';
import { formatDate, formatMoney } from '../lib/format';
import { paymentStatusTone, workStatusTone } from '../lib/statusVisuals';
import type { JobFile, JobRow, Tone, TrackerJobUpdate, TrackerLabel, WorkerSummary, TrackerColumn } from '../types';
import { resolveTrackerLabels, resolveTrackerColumns } from '../lib/jobTracker';
import { TrackerLabelCell, TrackerTimelineCell, TrackerSummaryCell } from './TrackerCellEditors';
import { TrackerOwnerCell, TrackerDueCell, TrackerTextCell, TrackerPaymentCell } from './TrackerDataCells';
import { TrackerNotesCell } from './TrackerNotesCell';
import { TrackerColumnHeader } from './TrackerColumnHeader';
import { TrackerSummaryBar } from './TrackerSummaryBar';
import { ProtectedAssetImage } from './ProtectedAssetImage';
import { UiIcon } from './UiIcon';
import './JobTrackerBoard.css';

const pageSize = 10;
const groupColors = ['#579bfc', '#9b6bdb', '#00a68a', '#df8b36', '#e2698e'];
const workLabels: Record<string, string> = {
  DONE: 'Done', IN_PROGRESS: 'Working on it', PENDING: 'Not started',
  PLANNING: 'Planning', CANCELED: 'Canceled', CANCELLED: 'Canceled',
};
const paymentLabels: Record<string, string> = {
  PAID: 'Paid', PARTIAL_PAYMENT: 'Partial payment', UNPAID: 'Unpaid', NOT_INVOICED_YET: 'Not invoiced',
};
const workLabel = (job: JobRow) => workLabels[job.status] ?? job.statusLabel;
const paymentLabel = (job: JobRow) => paymentLabels[job.paymentStatus] ?? job.paymentStatusLabel;

function BoardCheckbox({ checked, mixed = false, label, onChange }: {
  checked: boolean; mixed?: boolean; label: string; onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = mixed; }, [mixed]);
  return <input ref={ref} type="checkbox" checked={checked} aria-label={label} onChange={onChange} />;
}

function FileThumbnail({ file }: { file: JobFile }) {
  const fallback = <span className="jt-file-placeholder"><UiIcon name="file" size={17} /></span>;
  return file.mimeType.startsWith('image/')
    ? <ProtectedAssetImage src={file.url} mimeType={file.mimeType} alt={file.name}
        className="jt-file-thumbnail" loadingFallback={fallback} errorFallback={fallback} />
    : fallback;
}

function FileCell({ files, label, canManage, onOpen }: { files: JobFile[]; label: string; canManage: boolean; onOpen: () => void }) {
  return <td className="jt-data-cell jt-files-cell">
    {files.length || canManage ? <button type="button" className="jt-cell-button jt-files" onClick={onOpen} aria-label={`${label}: ${files.length} files`}>
      {files.slice(0, 2).map((file) => <FileThumbnail key={file.id} file={file} />)}
      {files.length > 2 ? <span className="jt-file-count">+{files.length - 2}</span> : null}
      {!files.length ? <UiIcon name="plus" size={15} /> : null}
    </button> : <span className="jt-empty-value" aria-label="No files">—</span>}
  </td>;
}

function StatusSummary({ jobs, payment = false }: { jobs: JobRow[]; payment?: boolean }) {
  const segments = new Map<string, { count: number; label: string; tone: Tone }>();
  for (const job of jobs) {
    const key = payment ? job.paymentStatus : job.status;
    const segment = segments.get(key);
    if (segment) segment.count += 1;
    else segments.set(key, { count: 1, label: payment ? paymentLabel(job) : workLabel(job),
      tone: payment ? paymentStatusTone(job.paymentStatus) : workStatusTone(job.status) });
  }
  return <TrackerSummaryBar segments={[...segments.entries()].map(([value, segment]) => ({
    value, label: segment.label, count: segment.count, className: `jt-status--${segment.tone}`,
  }))} total={jobs.length} actionLabel={`${payment ? 'Payment' : 'Status'} summary for ${jobs[0]?.propertyName ?? ''}`} />;
}

export function JobTrackerBoard({ jobs, canManage, workers, canDeleteFiles, onUploadFiles, onFileDelete, trackerLabels, trackerColumns, onTrackerColumnChange, onTrackerUpdate, onTrackerLabelsChange, onCreate, onDetails, onEdit, onDelete, onFilePreview }: {
  jobs: JobRow[];
  canManage: boolean;
  workers: WorkerSummary[];
  canDeleteFiles: boolean;
  onUploadFiles: (job: JobRow, category: 'before' | 'after', files: File[]) => Promise<void>;
  onFileDelete: (jobId: string, fileId: string) => void;
  onCreate: (propertyId?: string) => void;
  onDetails: (job: JobRow) => void;
  onEdit: (job: JobRow) => void;
  onDelete: (jobId: string) => void;
  trackerLabels?: TrackerLabel[];
  trackerColumns?: TrackerColumn[];
  onTrackerColumnChange: (column: TrackerColumn) => Promise<void>;
  onTrackerUpdate: (job: JobRow, update: TrackerJobUpdate) => Promise<void>;
  onTrackerLabelsChange: (labels: TrackerLabel[]) => Promise<void>;
  onFilePreview: (job: JobRow, file: JobFile) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const labels = resolveTrackerLabels(trackerLabels);
  const columns = resolveTrackerColumns(trackerColumns);
  const columnLabel = (key: TrackerColumn['key']) => columns.find((column) => column.key === key)!.label;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [limits, setLimits] = useState<Record<string, number>>({});
  const [gallery, setGallery] = useState<{ job: JobRow; category: 'before' | 'after' } | null>(null);
  const galleryRef = useRef<HTMLDialogElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const galleryJob = gallery ? jobs.find((job) => job.id === gallery.job.id) ?? gallery.job : null;
  const openGallery = (job: JobRow, category: 'before' | 'after') => { setUploadError(''); setGallery({ job, category }); };
  const grouped = new Map<string, { name: string; jobs: JobRow[] }>();
  for (const job of jobs) {
    const group = grouped.get(job.propertyId);
    if (group) group.jobs.push(job);
    else grouped.set(job.propertyId, { name: job.propertyName, jobs: [job] });
  }
  const selectedJobs = jobs.filter((job) => selected.has(job.id));
  const allCollapsed = grouped.size > 0 && [...grouped.keys()].every((id) => collapsed.has(id));

  useEffect(() => {
    if (gallery) galleryRef.current?.showModal();
    else galleryRef.current?.close();
  }, [gallery]);

  const toggleSelected = (groupJobs: JobRow[]) => setSelected((current) => {
    const next = new Set(current);
    const remove = groupJobs.every((job) => current.has(job.id));
    for (const job of groupJobs) { if (remove) next.delete(job.id); else next.add(job.id); }
    return next;
  });

  const exportSelected = () => {
    const safeText = (value: string) => /^[=+@\-\t\r]/.test(value) ? `'${value}` : value;
    const csv = buildCsv([
      ['Property', columnLabel('service'), 'Location', columnLabel('workers'), columnLabel('status'), columnLabel('priority'), columnLabel('dueDate'), columnLabel('description'), columnLabel('paymentStatus'), columnLabel('laborCost'), columnLabel('materialCost'), 'Total'].map(safeText),
      ...selectedJobs.map((job) => [safeText(job.propertyName), safeText(job.service),
        safeText([job.story, job.unit, job.area].filter(Boolean).join(' · ')),
        safeText(job.workers.map((worker) => worker.name).join(', ')), safeText(labels.find((label) => label.kind === 'status' && label.value === job.status)?.label ?? workLabel(job)),
        safeText(labels.find((label) => label.kind === 'priority' && label.value === (job.priority ?? 'NONE'))?.label ?? ''), job.dueDate?.slice(0, 10),
        safeText(job.description), safeText(paymentLabel(job)), job.laborCost, job.materialCost, job.totalCost]),
    ]);
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'job-tracker.csv';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <div className="jt-board">
    <div className="jt-board-toolbar">
      <span><strong>{jobs.length}</strong> {jobs.length === 1 ? 'job' : 'jobs'} <span className="jt-toolbar-divider">/</span> {grouped.size} {grouped.size === 1 ? 'property' : 'properties'}</span>
      <div>
        {selectedJobs.length ? <>
          <span role="status">{selectedJobs.length} selected</span>
          <button type="button" onClick={exportSelected}><UiIcon name="download" size={15} />Export selection</button>
          <button type="button" onClick={() => setSelected(new Set())}>Deselect</button>
        </> : null}
        <button type="button" onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(grouped.keys()))}>
          <UiIcon name="chevronDown" size={15} />{allCollapsed ? 'Expand groups' : 'Collapse groups'}
        </button>
      </div>
    </div>

    {[...grouped.entries()].map(([propertyId, group], index) => {
      const isCollapsed = collapsed.has(propertyId);
      const groupSelected = group.jobs.filter((job) => selected.has(job.id)).length;
      const limit = limits[propertyId] ?? pageSize;
      const visibleJobs = group.jobs.slice(0, limit);
      const total = group.jobs.reduce((sum, job) => sum + job.totalCost, 0);
      const completed = group.jobs.filter((job) => job.status === 'DONE').length;
      return <section className="jt-group" key={propertyId} style={{ '--jt-accent': groupColors[index % groupColors.length] } as CSSProperties}>
        <div className="jt-group-heading">
          <h3><button type="button" aria-expanded={!isCollapsed} aria-controls={`jt-group-${propertyId}`}
            onClick={() => setCollapsed((current) => {
              const next = new Set(current);
              if (next.has(propertyId)) next.delete(propertyId); else next.add(propertyId);
              return next;
            })}>
            <UiIcon name="chevronDown" size={19} className={isCollapsed ? 'jt-collapsed-icon' : ''} />
            {group.name}
          </button></h3>
          <span>{group.jobs.length} {group.jobs.length === 1 ? 'job' : 'jobs'}</span>
          {isCollapsed ? <span className="jt-collapsed-summary">{completed} completed · {formatMoney(total)}</span> : null}
        </div>
        <div id={`jt-group-${propertyId}`} hidden={isCollapsed}>
          <div className="jt-table-scroll" tabIndex={0} role="region" aria-label={`Jobs at ${group.name}`}>
            <table className="jt-table" aria-label={`Jobs at ${group.name}`}>
              <colgroup>
                {[34, 245, 110, 126, 112, 140, 112, 112, 105, 105, 96, 96, 180, 110, 98].map((width, column) => <col key={column} style={{ width }} />)}
              </colgroup>
              <thead><tr>
                <th className="jt-select-cell"><BoardCheckbox checked={groupSelected === group.jobs.length}
                  mixed={groupSelected > 0 && groupSelected < group.jobs.length} label={`Select jobs at ${group.name}`}
                  onChange={() => toggleSelected(group.jobs)} /></th>
                {columns.map((column) => <TrackerColumnHeader key={column.key} column={column} canManage={canManage} onChange={onTrackerColumnChange} />)}
              </tr></thead>
              <tbody>
                {visibleJobs.map((job) => {
                  return <tr key={job.id} className={selected.has(job.id) ? 'jt-row-selected' : undefined}>
                    <td className="jt-select-cell"><BoardCheckbox checked={selected.has(job.id)} label={`Select ${job.service}`} onChange={() => toggleSelected([job])} /></td>
                    <td className="jt-task-cell"><span className="jt-task" title={job.service}>{job.service}</span></td>
                    <TrackerOwnerCell job={job} workers={workers} canManage={canManage} onUpdate={onTrackerUpdate} />
                    <TrackerLabelCell kind="status" job={job} labels={labels} canManage={canManage} onUpdate={onTrackerUpdate} onLabelsChange={onTrackerLabelsChange} />
                    <TrackerDueCell job={job} canManage={canManage} onUpdate={onTrackerUpdate} />
                    <TrackerNotesCell job={job} label={columnLabel('description')} canManage={canManage} onUpdate={onTrackerUpdate} />
                    <TrackerLabelCell kind="priority" job={job} labels={labels} canManage={canManage} onUpdate={onTrackerUpdate} onLabelsChange={onTrackerLabelsChange} />
                    <TrackerPaymentCell job={job} canManage={canManage} onUpdate={onTrackerUpdate} />
                    <TrackerTextCell job={job} field="laborCost" canManage={canManage} onUpdate={onTrackerUpdate} />
                    <TrackerTextCell job={job} field="materialCost" canManage={canManage} onUpdate={onTrackerUpdate} />
                    <FileCell files={job.files.before} canManage={canManage} label={`Before ${job.service}`} onOpen={() => openGallery(job, 'before')} />
                    <FileCell files={job.files.after} canManage={canManage} label={`After ${job.service}`} onOpen={() => openGallery(job, 'after')} />
                    <TrackerTimelineCell job={job} canManage={canManage} onUpdate={onTrackerUpdate} />
                    <td className="jt-updated" title={new Date(job.updatedAt).toLocaleString('en-US')}>{formatDate(job.updatedAt)}</td>
                    <td><div className="jt-actions">
                      <button type="button" aria-label={`View details for ${job.service}`} title="View details" onClick={() => onDetails(job)}><UiIcon name="eye" size={15} /></button>
                      {canManage ? <>
                        <button type="button" aria-label={`Edit ${job.service}`} title="Edit job" onClick={() => onEdit(job)}><UiIcon name="file" size={15} /></button>
                        <button type="button" className="jt-delete" aria-label={`Delete ${job.service}`} title="Delete job" onClick={() => onDelete(job.id)}><UiIcon name="trash" size={15} /></button>
                      </> : null}
                    </div></td>
                  </tr>;
                })}
                {canManage ? <tr className="jt-add-row"><td /><td colSpan={14}><button type="button" onClick={() => onCreate(propertyId)}><UiIcon name="plus" size={15} />Add job</button></td></tr> : null}
              </tbody>
              <tfoot><tr>
                <td /><td className="jt-summary-label">{completed} of {group.jobs.length} completed</td><td />
                <TrackerSummaryCell jobs={group.jobs} labels={labels} kind="status" propertyName={group.name} /><td /><td />
                <TrackerSummaryCell jobs={group.jobs} labels={labels} kind="priority" propertyName={group.name} />
                <td><StatusSummary jobs={group.jobs} payment /></td>
                <td className="jt-money">{formatMoney(group.jobs.reduce((sum, job) => sum + job.laborCost, 0))}<small>sum</small></td>
                <td className="jt-money">{formatMoney(group.jobs.reduce((sum, job) => sum + job.materialCost, 0))}<small>sum</small></td>
                <td colSpan={5} className="jt-group-total">Group total <strong>{formatMoney(total)}</strong></td>
              </tr></tfoot>
            </table>
          </div>
          {group.jobs.length > pageSize ? <div className="jt-group-pagination">
            <span>{visibleJobs.length} of {group.jobs.length} jobs · Totals include the entire filtered group</span>
            {limit < group.jobs.length ? <button type="button" onClick={() => setLimits((current) => ({ ...current, [propertyId]: limit + pageSize }))}>Show {Math.min(pageSize, group.jobs.length - limit)} more</button> : null}
            {limit > pageSize ? <button type="button" onClick={() => setLimits((current) => ({ ...current, [propertyId]: pageSize }))}>Show less</button> : null}
          </div> : null}
        </div>
      </section>;
    })}

    <dialog ref={galleryRef} className="jt-gallery" aria-labelledby="jt-gallery-title" onCancel={(event) => { if (uploading) event.preventDefault(); else setGallery(null); }} onClose={() => setGallery(null)}>
      {gallery && galleryJob ? <>
        <div className="jt-gallery-head"><div><p>{gallery.job.propertyName} · {gallery.job.service}</p><h2 id="jt-gallery-title">{gallery.category === 'before' ? 'Before files' : 'After files'}</h2></div>
          <button type="button" aria-label="Close files" disabled={uploading} onClick={() => setGallery(null)}><UiIcon name="close" size={20} /></button></div>
        {canManage ? <label className="jt-upload-label">Add photos<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={uploading} aria-label="Add photos" onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          if (!files.length) return;
          if (files.length > 12) { setUploadError('Select up to 12 photos.'); return; }
          setUploading(true); setUploadError('');
          void onUploadFiles(galleryJob, gallery.category, files).catch((error: unknown) => setUploadError(error instanceof Error ? error.message : 'Could not upload the photos.')).finally(() => setUploading(false));
        }} /></label> : null}
        {uploading ? <p role="status">Uploading photos…</p> : null}
        {uploadError ? <p className="jt-editor-error" role="alert">{uploadError}</p> : null}
        <div className="jt-gallery-files">{galleryJob.files[gallery.category].map((file) => <div className="jt-gallery-file" key={file.id}><button type="button" disabled={uploading} onClick={() => {
          galleryRef.current?.close();
          setGallery(null);
          onFilePreview(galleryJob, file);
        }}><FileThumbnail file={file} /><span>{file.name}</span><UiIcon name="eye" size={17} /></button>{canDeleteFiles ? <button type="button" disabled={uploading} aria-label={`Delete file ${file.name}`} onClick={() => { setGallery(null); onFileDelete(galleryJob.id, file.id); }}><UiIcon name="trash" size={17} /></button> : null}</div>)}</div>
      </> : null}
    </dialog>
  </div>;
}
