import { useRef, useState, type ReactNode } from 'react';
import { formatMoney } from '../lib/format';
import { paymentStatusTone } from '../lib/statusVisuals';
import type { JobRow, TrackerJobUpdate, WorkerSummary } from '../types';
import { TrackerPopover } from './TrackerCellEditors';
import { UiIcon } from './UiIcon';

type CellProps = { job: JobRow; canManage: boolean; onUpdate: (job: JobRow, update: TrackerJobUpdate) => Promise<void> };
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Could not save. Please try again.';

function parseTrackerMoney(input: string) {
  const value = input.trim().replace(/^\$\s*/, '');
  if (!value) return 0;
  if (!/^(?:(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?|\.\d{1,2})$/.test(value)) throw new Error('Use USD, for example $1,234.50.');
  const amount = Number(value.replaceAll(',', ''));
  if (!Number.isFinite(amount) || amount > 9999999999.99) throw new Error('Amount is too large.');
  return amount;
}

export function TrackerTextCell({ job, field, canManage, onUpdate }: CellProps & { field: 'laborCost' | 'materialCost' }) {
  const label = field === 'laborCost' ? 'Labor' : 'Materials';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false);
  const canceled = useRef(false);
  const display = formatMoney(job[field]);
  const save = async () => {
    if (busy.current || canceled.current) return;
    try {
      const value = parseTrackerMoney(draft);
      if (value === job[field]) { setEditing(false); return; }
      busy.current = true; setSaving(true); setError('');
      await onUpdate(job, { [field]: value });
      setEditing(false);
    } catch (failure) { setError(errorText(failure)); }
    finally { busy.current = false; setSaving(false); }
  };
  return <td className="jt-data-cell jt-money">
    {editing ? <div className="jt-inline-editor">
      <div className="jt-inline-field"><span className="jt-currency-sign">$</span>
        <input aria-label={label} inputMode="decimal" value={draft} maxLength={20}
          disabled={saving} aria-invalid={Boolean(error)} title={error || undefined}
          ref={(element) => { if (element && document.activeElement !== element) { element.focus({ preventScroll: true }); element.select(); } }}
          onChange={(event) => { setDraft(event.target.value); setError(''); }} onBlur={() => { void save(); }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') { event.preventDefault(); void save(); }
            if (event.key === 'Escape') { event.preventDefault(); canceled.current = true; setEditing(false); }
          }} />
      </div>
      {error ? <span className="jt-inline-error" role="alert">{error}</span> : null}
    </div> : canManage ? <button type="button" className="jt-cell-button" aria-label={`Edit ${label.toLowerCase()}: ${job.service}`} title={display}
      onClick={() => { canceled.current = false; setDraft(String(job[field])); setError(''); setEditing(true); }}>{display}</button> : <span className="jt-cell-value" title={display}>{display}</span>}
  </td>;
}

function EditablePopoverCell({ job, canManage, onUpdate, title, action, className = '', children, editor }: CellProps & {
  title: string; action: string; className?: string; children: ReactNode;
  editor: (save: (update: TrackerJobUpdate) => Promise<void>, saving: boolean) => ReactNode;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const save = async (update: TrackerJobUpdate) => {
    setSaving(true); setError('');
    try { await onUpdate(job, update); setAnchor(null); }
    catch (failure) { setError(errorText(failure)); }
    finally { setSaving(false); }
  };
  return <td className={`jt-data-cell ${className}`}>
    {canManage ? <button type="button" className="jt-cell-button" aria-label={`${action}: ${job.service}`} aria-haspopup="dialog" aria-expanded={Boolean(anchor)}
      onClick={(event) => { setAnchor(event.currentTarget); setError(''); }}>{children}</button> : <span className="jt-cell-value">{children}</span>}
    {anchor ? <TrackerPopover anchor={anchor} title={title} onClose={() => { if (!saving) setAnchor(null); }}>
      {editor(save, saving)}
      {error ? <p className="jt-editor-error" role="alert">{error}</p> : null}
    </TrackerPopover> : null}
  </td>;
}

export function TrackerOwnerCell(props: CellProps & { workers: WorkerSummary[] }) {
  const { job, workers } = props;
  return <EditablePopoverCell {...props} title="Owners" action="Edit owners" editor={(save, saving) => <OwnerEditor job={job} workers={workers} save={save} saving={saving} />}>
    <span className="jt-owners" title={job.workers.map((worker) => worker.name).join(', ') || 'Unassigned'}>
      {job.workers.slice(0, 2).map((worker) => <span key={worker.id} className="jt-avatar" aria-label={worker.name}>{worker.name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join('')}</span>)}
      {job.workers.length > 2 ? <span className="jt-avatar jt-avatar-more">+{job.workers.length - 2}</span> : null}
      {!job.workers.length ? <span className="jt-avatar jt-avatar-empty" aria-label="Unassigned"><UiIcon name="users" size={17} /></span> : null}
    </span>
  </EditablePopoverCell>;
}

function OwnerEditor({ job, workers, save, saving }: { job: JobRow; workers: WorkerSummary[]; save: (update: TrackerJobUpdate) => Promise<void>; saving: boolean }) {
  const [ids, setIds] = useState(job.workerIds);
  const [search, setSearch] = useState('');
  const options = [...new Map([...workers, ...job.workers].map((worker) => [worker.id, worker])).values()];
  return <form onSubmit={(event) => { event.preventDefault(); void save({ workerIds: ids }); }}>
    <input aria-label="Search owners" placeholder="Search owners" value={search} onChange={(event) => setSearch(event.target.value)} />
    <div className="jt-worker-options">{options.filter((worker) => worker.name.toLowerCase().includes(search.toLowerCase())).map((worker) => <label key={worker.id}>
      <input type="checkbox" checked={ids.includes(worker.id)} disabled={saving || (worker.status === 'INACTIVE' && !job.workerIds.includes(worker.id))}
        onChange={(event) => setIds((current) => event.target.checked ? [...current, worker.id] : current.filter((id) => id !== worker.id))} />
      {worker.name}{worker.status === 'INACTIVE' ? ' (Inactive)' : ''}
    </label>)}</div>
    <div className="jt-editor-actions"><button type="button" disabled={saving} onClick={() => setIds([])}>Unassigned</button><button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button></div>
  </form>;
}

export function TrackerDueCell(props: CellProps) {
  const { job } = props;
  const short = job.dueDate ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(job.dueDate)) : '—';
  return <EditablePopoverCell {...props} title="Due date" action="Edit due date" editor={(save, saving) => <DueEditor job={job} save={save} saving={saving} />}>
    <span className={`jt-due ${job.status === 'DONE' ? 'jt-due--done' : job.timeline.isLate ? 'jt-due--late' : ''}`}>{short}</span>
  </EditablePopoverCell>;
}

function DueEditor({ job, save, saving }: { job: JobRow; save: (update: TrackerJobUpdate) => Promise<void>; saving: boolean }) {
  const [date, setDate] = useState(job.dueDate?.slice(0, 10) ?? '');
  return <form onSubmit={(event) => { event.preventDefault(); void save({ dueDate: date || null }); }}>
    <input type="date" aria-label="Due date" value={date} min={job.startDate?.slice(0, 10)} disabled={saving} onChange={(event) => setDate(event.target.value)} />
    <div className="jt-editor-actions"><button type="button" disabled={saving} onClick={() => { void save({ dueDate: null }); }}>Clear date</button><button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button></div>
  </form>;
}

const payments = [{ value: 'PAID', label: 'Paid' }, { value: 'PARTIAL_PAYMENT', label: 'Partial payment' }, { value: 'UNPAID', label: 'Unpaid' }, { value: 'NOT_INVOICED_YET', label: 'Not invoiced' }];
export function TrackerPaymentCell(props: CellProps) {
  const { job } = props;
  return <EditablePopoverCell {...props} title="Payment" action="Edit payment" className={`jt-status jt-status--${paymentStatusTone(job.paymentStatus)}`}
    editor={(save, saving) => <PaymentEditor job={job} save={save} saving={saving} />}>
    {payments.find((option) => option.value === job.paymentStatus)?.label ?? job.paymentStatusLabel}
  </EditablePopoverCell>;
}

function PaymentEditor({ job, save, saving }: { job: JobRow; save: (update: TrackerJobUpdate) => Promise<void>; saving: boolean }) {
  const [partial, setPartial] = useState(false);
  const [advance, setAdvance] = useState(String(job.advanceCashApp));
  const [error, setError] = useState('');
  return <>
    <div className="jt-label-options">{payments.map((option) => <button type="button" key={option.value} disabled={saving} aria-pressed={job.paymentStatus === option.value}
      className={`jt-status--${paymentStatusTone(option.value)}`} onClick={() => {
        if (option.value === 'PARTIAL_PAYMENT') setPartial(true);
        else { void save({ paymentStatus: option.value }); }
      }}>{option.label}</button>)}</div>
    {partial ? <form onSubmit={(event) => {
      event.preventDefault();
      try { const amount = parseTrackerMoney(advance); setError(''); void save({ paymentStatus: 'PARTIAL_PAYMENT', advanceCashApp: amount }); }
      catch (failure) { setError(errorText(failure)); }
    }}>
      <label>Advance (USD $)<input aria-label="Advance (USD $)" inputMode="decimal" value={advance} disabled={saving} onChange={(event) => setAdvance(event.target.value)} /></label>
      <div className="jt-editor-actions"><button type="submit" disabled={saving}>Save</button></div>
      {error ? <p className="jt-editor-error" role="alert">{error}</p> : null}
    </form> : null}
  </>;
}
