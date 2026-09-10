import { useEffect, useId, useRef, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { formatMoney } from '../lib/format';
import { formatStoryDisplayLabel } from '../lib/jobLocation';
import { labelTextColor, rangeDayCount, resolveTrackerColumns, resolveTrackerLabels } from '../lib/jobTracker';
import type { JobFile, JobRow, TrackerColumn, TrackerLabel } from '../types';
import { UiIcon } from './UiIcon';
import './TrackerJobDetailsDialog.css';

const displayDate = (value: string | null) => value
  ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(value))
  : 'No date';
const paymentLabels: Record<string, { label: string; color: string }> = {
  PAID: { label: 'Paid', color: '#008c60' }, UNPAID: { label: 'Unpaid', color: '#c4385a' },
  PARTIAL_PAYMENT: { label: 'Partial payment', color: '#ffd5ac' }, NOT_INVOICED_YET: { label: 'Not invoiced', color: '#e5e6ed' },
};

function DetailLabel({ label, color }: { label: string; color: string }) {
  return <span className="jt-detail-label" style={{ '--label-color': color, '--label-ink': labelTextColor(color) } as CSSProperties}>{label}</span>;
}

export function TrackerJobDetailsDialog({ job, labels: overrides, columns: columnOverrides, canManage, onClose, onEdit, onDelete, onWorkStatusAction, onPaymentStatusAction, onReceipt, onMedia }: {
  job: JobRow; labels?: TrackerLabel[]; columns?: TrackerColumn[]; canManage: boolean; onClose: () => void;
  onEdit: (job: JobRow) => void; onDelete: (job: JobRow) => void;
  onWorkStatusAction: (job: JobRow) => void; onPaymentStatusAction: (job: JobRow) => void;
  onReceipt: (job: JobRow, file: JobFile) => void; onMedia: (job: JobRow, mode: 'compare' | 'progress') => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const labels = resolveTrackerLabels(overrides);
  const columns = resolveTrackerColumns(columnOverrides);
  const columnLabel = (key: TrackerColumn['key']) => columns.find((column) => column.key === key)!.label;
  const status = (value: string) => labels.find((label) => label.kind === 'status' && label.value === value)
    ?? { label: value, color: '#e5e6ed' };
  const priority = labels.find((label) => label.kind === 'priority' && label.value === (job.priority ?? 'NONE'))!;
  const payment = paymentLabels[job.paymentStatus] ?? { label: job.paymentStatusLabel, color: '#e5e6ed' };
  const days = rangeDayCount(job.startDate?.slice(0, 10) ?? '', job.dueDate?.slice(0, 10) ?? '');
  const files = Object.values(job.files).flat();
  const subitems = job.subitems;
  const location = [formatStoryDisplayLabel(job.story), job.unit].filter(Boolean).join(' · ');

  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    element?.showModal();
    title.current?.focus({ preventScroll: true });
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  return createPortal(<dialog ref={dialog} className="jt-details-dialog" aria-labelledby={titleId}
    onKeyDown={(event) => {
      if (event.key !== 'Tab') return;
      const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex="0"]'))
        .filter((element) => element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === title.current)) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
    }}
    onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
    }}>
    <header className="jt-details-header">
      <div className="jt-details-heading">
        <p className="jt-details-path"><UiIcon name="clipboard" size={15} /><span>Job details</span><span aria-hidden="true">/</span><span>{job.propertyName}</span></p>
        <h2 ref={title} id={titleId} tabIndex={-1}>{job.service}</h2>
        <p className="jt-details-area"><span>{columnLabel('area')}</span><strong>{job.area || 'No area'}</strong>{location ? <span>{location}</span> : null}</p>
      </div>
      <button type="button" className="jt-details-close" onClick={onClose} aria-label="Close job details"><UiIcon name="close" size={20} /></button>
    </header>

    <div className="jt-details-scroll">
      <dl className="jt-details-summary">
        <div><dt>{columnLabel('workers')}</dt><dd className="jt-details-owners">{job.workers.length ? job.workers.map((worker) =>
          <span className="jt-details-person" key={worker.id}><span className="jt-details-avatar" aria-hidden="true">{worker.name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join('')}</span><span>{worker.name}</span></span>) : 'Unassigned'}</dd></div>
        <div><dt>{columnLabel('status')}</dt><dd><DetailLabel {...status(job.status)} /></dd></div>
        <div><dt>{columnLabel('priority')}</dt><dd><DetailLabel {...priority} /></dd></div>
        <div><dt>{columnLabel('paymentStatus')}</dt><dd><DetailLabel {...payment} /></dd></div>
      </dl>

      <div className="jt-details-layout">
        <div className="jt-details-main">
          <section className="jt-details-section" aria-labelledby={`${titleId}-subitems`}>
            <h3 id={`${titleId}-subitems`}><UiIcon name="clipboard" size={17} />Subitems</h3>
            {subitems?.length ? <div className="jt-details-subitems-scroll" tabIndex={0} role="region" aria-label="Subitem details">
              <table className="jt-details-subitems" aria-label="Subitems"><thead><tr>
                <th>{columnLabel('description')}</th><th>{columnLabel('status')}</th><th>{columnLabel('dueDate')}</th>
              </tr></thead><tbody>{subitems.map((item) => <tr key={item.id}>
                <td><p>{item.description}</p>{item.workers.length ? <span className="jt-details-subitem-owner"><UiIcon name="users" size={13} />{item.workers.map((worker) => worker.name).join(', ')}</span> : null}</td>
                <td><DetailLabel {...status(item.status)} /></td><td><time dateTime={item.dueDate ?? undefined}>{displayDate(item.dueDate)}</time></td>
              </tr>)}</tbody></table>
            </div> : subitems === undefined && job.description.trim() ? <div className="jt-details-description">{job.description}</div>
              : <p className="jt-details-empty">No subitems yet.</p>}
          </section>

          <section className="jt-details-section" aria-labelledby={`${titleId}-files`}>
            <div className="jt-details-section-head"><h3 id={`${titleId}-files`}><UiIcon name="paperclip" size={17} />Files and pictures</h3>
              <div className="jt-details-file-tools">
                {job.files.before.length || job.files.after.length ? <button type="button" onClick={() => onMedia(job, 'compare')}><UiIcon name="image" size={15} />Before / After</button> : null}
                {job.files.progress.length ? <button type="button" onClick={() => onMedia(job, 'progress')}><UiIcon name="camera" size={15} />Progress</button> : null}
              </div>
            </div>
            {files.length ? <ul className="jt-details-files">{files.map((file) => <li key={file.id}><button type="button" onClick={() => onReceipt(job, file)} aria-label={`Open file: ${file.name}`}>
              <span className="jt-details-file-icon"><UiIcon name={file.mimeType.startsWith('image/') ? 'image' : 'file'} size={20} /></span>
              <span className="jt-details-file-name">{file.name}<small>{file.category.replaceAll('_', ' ').toLowerCase()}</small></span><UiIcon name="eye" size={16} />
            </button></li>)}</ul> : <p className="jt-details-empty"><UiIcon name="paperclip" size={18} />No files attached.</p>}
          </section>
        </div>

        <aside className="jt-details-sidebar">
          <section className="jt-details-section" aria-labelledby={`${titleId}-timeline`}>
            <h3 id={`${titleId}-timeline`}><UiIcon name="calendar" size={17} />{columnLabel('timeline')}</h3>
            <div className="jt-details-range" title={`${displayDate(job.startDate)} – ${displayDate(job.dueDate)}`}>
              <span>{displayDate(job.startDate)}<span aria-hidden="true"> → </span>{displayDate(job.dueDate)}</span>
              {days > 0 ? <strong>{days} {days === 1 ? 'day' : 'days'}</strong> : null}
            </div>
            {job.status === 'DONE' && job.completedAt ? <p className="jt-details-completed">Completed on {displayDate(job.completedAt)}</p> : null}
          </section>
          <section className="jt-details-section" aria-labelledby={`${titleId}-costs`}>
            <h3 id={`${titleId}-costs`}><UiIcon name="dollar" size={17} />Costs</h3>
            <dl className="jt-details-costs">
              <div><dt>{columnLabel('laborCost')}</dt><dd>{formatMoney(job.laborCost)}</dd></div>
              <div><dt>{columnLabel('materialCost')}</dt><dd>{formatMoney(job.materialCost)}</dd></div>
              <div className="jt-details-total"><dt>Total</dt><dd>{formatMoney(job.totalCost)}</dd></div>
              <div><dt>Advance Cash App</dt><dd>{formatMoney(job.advanceCashApp)}</dd></div>
              <div><dt>Invoice</dt><dd>{job.invoiceStatus === 'YES' ? 'Yes' : 'No'}</dd></div>
            </dl>
          </section>
        </aside>
      </div>
    </div>

    <footer className="jt-details-footer">
      <span className="jt-details-updated">{columnLabel('updatedAt')} · {displayDate(job.updatedAt)}</span>
      {canManage ? <div className="jt-details-actions">
        {job.status !== 'DONE' ? <button type="button" onClick={() => onWorkStatusAction(job)}>Update status</button> : null}
        {job.paymentStatus !== 'PAID' ? <button type="button" onClick={() => onPaymentStatusAction(job)}>Update payment</button> : null}
        <button type="button" className="jt-details-delete" onClick={() => onDelete(job)}><UiIcon name="trash" size={15} />Delete</button>
        <button type="button" className="jt-details-edit" onClick={() => onEdit(job)}><UiIcon name="file" size={15} />Edit job</button>
      </div> : <button type="button" onClick={onClose}>Close</button>}
    </footer>
  </dialog>, document.body);
}
