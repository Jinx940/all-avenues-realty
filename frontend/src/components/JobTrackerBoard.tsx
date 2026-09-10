import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { buildCsv } from '../lib/csv';
import { formatDate, formatMoney } from '../lib/format';
import { formatStoryDisplayLabel } from '../lib/jobLocation';
import { paymentStatusTone, workStatusTone } from '../lib/statusVisuals';
import type { JobFile, JobRow, Tone } from '../types';
import { ProtectedAssetImage } from './ProtectedAssetImage';
import { UiIcon } from './UiIcon';
import './JobTrackerBoard.css';

const pageSize = 10;
const groupColors = ['#579bfc', '#9b6bdb', '#00a68a', '#df8b36', '#e2698e'];
const workLabels: Record<string, string> = {
  DONE: 'Completado', IN_PROGRESS: 'En proceso', PENDING: 'Pendiente',
  PLANNING: 'Planificación', CANCELED: 'Cancelado', CANCELLED: 'Cancelado',
};
const paymentLabels: Record<string, string> = {
  PAID: 'Pagado', PARTIAL_PAYMENT: 'Pago parcial', UNPAID: 'Pendiente', NOT_INVOICED_YET: 'Sin facturar',
};
const workLabel = (job: JobRow) => workLabels[job.status] ?? job.statusLabel;
const paymentLabel = (job: JobRow) => paymentLabels[job.paymentStatus] ?? job.paymentStatusLabel;
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join('');
const shortDate = (value: string | null) => value
  ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(value))
  : 'Sin fecha';

function BoardCheckbox({ checked, mixed = false, label, onChange }: {
  checked: boolean; mixed?: boolean; label: string; onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = mixed; }, [mixed]);
  return <input ref={ref} type="checkbox" checked={checked} aria-label={label} onChange={onChange} />;
}

function StatusCell({ label, tone, onClick, actionLabel }: {
  label: string; tone: Tone; onClick?: () => void; actionLabel?: string;
}) {
  return <td className={`jt-status jt-status--${tone}`}>
    {onClick
      ? <button type="button" onClick={onClick} aria-label={actionLabel} title={actionLabel}>{label}</button>
      : <span>{label}</span>}
  </td>;
}

function FileThumbnail({ file }: { file: JobFile }) {
  const fallback = <span className="jt-file-placeholder"><UiIcon name="file" size={17} /></span>;
  return file.mimeType.startsWith('image/')
    ? <ProtectedAssetImage src={file.url} mimeType={file.mimeType} alt={file.name}
        className="jt-file-thumbnail" loadingFallback={fallback} errorFallback={fallback} />
    : fallback;
}

function FileCell({ files, label, onOpen }: { files: JobFile[]; label: string; onOpen: () => void }) {
  return <td className="jt-files-cell">
    {files.length ? <button type="button" className="jt-files" onClick={onOpen} aria-label={`${label}: ${files.length} archivos`}>
      {files.slice(0, 2).map((file) => <FileThumbnail key={file.id} file={file} />)}
      {files.length > 2 ? <span className="jt-file-count">+{files.length - 2}</span> : null}
    </button> : <span className="jt-empty-value" aria-label="Sin archivos">—</span>}
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
  const summary = [...segments.values()].map(({ count, label }) => `${count} ${label}`).join(', ');
  return <div className="jt-status-summary" role="img" aria-label={summary} title={summary}>
    {[...segments.entries()].map(([key, segment]) => <span key={key}
      className={`jt-status--${segment.tone}`} style={{ flex: segment.count }} />)}
  </div>;
}

export function JobTrackerBoard({ jobs, canManage, onCreate, onDetails, onEdit, onDelete, onWorkStatusAction, onPaymentStatusAction, onFilePreview }: {
  jobs: JobRow[];
  canManage: boolean;
  onCreate: (propertyId?: string) => void;
  onDetails: (job: JobRow) => void;
  onEdit: (job: JobRow) => void;
  onDelete: (jobId: string) => void;
  onWorkStatusAction: (job: JobRow) => void;
  onPaymentStatusAction: (job: JobRow) => void;
  onFilePreview: (job: JobRow, file: JobFile) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [limits, setLimits] = useState<Record<string, number>>({});
  const [gallery, setGallery] = useState<{ job: JobRow; category: 'before' | 'after' } | null>(null);
  const galleryRef = useRef<HTMLDialogElement>(null);
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
      ['Propiedad', 'Trabajo', 'Ubicación', 'Responsables', 'Estado', 'Vencimiento', 'Notas', 'Pago', 'Mano de obra', 'Material', 'Total'],
      ...selectedJobs.map((job) => [safeText(job.propertyName), safeText(job.service),
        safeText([job.story, job.unit, job.area].filter(Boolean).join(' · ')),
        safeText(job.workers.map((worker) => worker.name).join(', ')), safeText(workLabel(job)), job.dueDate?.slice(0, 10),
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
      <span><strong>{jobs.length}</strong> trabajos <span className="jt-toolbar-divider">/</span> {grouped.size} propiedades</span>
      <div>
        {selectedJobs.length ? <>
          <span role="status">{selectedJobs.length} seleccionados</span>
          <button type="button" onClick={exportSelected}><UiIcon name="download" size={15} />Exportar selección</button>
          <button type="button" onClick={() => setSelected(new Set())}>Deseleccionar</button>
        </> : null}
        <button type="button" onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(grouped.keys()))}>
          <UiIcon name="chevronDown" size={15} />{allCollapsed ? 'Expandir grupos' : 'Contraer grupos'}
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
          <span>{group.jobs.length} trabajos</span>
          {isCollapsed ? <span className="jt-collapsed-summary">{completed} completados · {formatMoney(total)}</span> : null}
        </div>
        <div id={`jt-group-${propertyId}`} hidden={isCollapsed}>
          <div className="jt-table-scroll" tabIndex={0} role="region" aria-label={`Trabajos de ${group.name}`}>
            <table className="jt-table" aria-label={`Trabajos de ${group.name}`}>
              <colgroup>
                {[34, 245, 110, 126, 112, 140, 112, 105, 105, 96, 96, 180, 110, 98].map((width, column) => <col key={column} style={{ width }} />)}
              </colgroup>
              <thead><tr>
                <th className="jt-select-cell"><BoardCheckbox checked={groupSelected === group.jobs.length}
                  mixed={groupSelected > 0 && groupSelected < group.jobs.length} label={`Seleccionar trabajos de ${group.name}`}
                  onChange={() => toggleSelected(group.jobs)} /></th>
                {['Trabajo', 'Responsable', 'Estado', 'Vencimiento', 'Notas', 'Pago', 'Mano de obra', 'Material', 'Antes', 'Después', 'Cronograma', 'Actualizado', 'Acciones'].map((label) => <th scope="col" key={label}>{label}</th>)}
              </tr></thead>
              <tbody>
                {visibleJobs.map((job) => {
                  const location = [formatStoryDisplayLabel(job.story), job.unit, job.area].filter(Boolean).join(' · ');
                  const end = job.status === 'DONE' && job.completedAt ? job.completedAt : job.dueDate;
                  const isLate = job.status !== 'DONE' && job.timeline.isLate;
                  return <tr key={job.id} className={selected.has(job.id) ? 'jt-row-selected' : undefined}>
                    <td className="jt-select-cell"><BoardCheckbox checked={selected.has(job.id)} label={`Seleccionar ${job.service}`} onChange={() => toggleSelected([job])} /></td>
                    <td className="jt-task-cell"><button type="button" className="jt-task" onClick={() => onDetails(job)} title={[job.service, location].filter(Boolean).join('\n')}>
                      <span><strong>{job.service}</strong>{location ? <small>{location}</small> : null}</span>
                      <UiIcon name="eye" size={15} />
                    </button></td>
                    <td><div className="jt-owners" title={job.workers.map((worker) => worker.name).join(', ') || 'Sin asignar'}>
                      {job.workers.slice(0, 2).map((worker) => <span key={worker.id} className="jt-avatar" aria-label={worker.name}>{initials(worker.name)}</span>)}
                      {job.workers.length > 2 ? <span className="jt-avatar jt-avatar-more">+{job.workers.length - 2}</span> : null}
                      {!job.workers.length ? <span className="jt-avatar jt-avatar-empty" aria-label="Sin asignar"><UiIcon name="users" size={17} /></span> : null}
                    </div></td>
                    <StatusCell label={workLabel(job)} tone={workStatusTone(job.status)}
                      onClick={canManage && job.status !== 'DONE' ? () => onWorkStatusAction(job) : undefined}
                      actionLabel={`Marcar como completado: ${job.service}`} />
                    <td><span className={`jt-due ${isLate ? 'jt-due--late' : ''} ${job.status === 'DONE' ? 'jt-due--done' : ''}`}
                      title={job.dueDate ? formatDate(job.dueDate) : 'Sin fecha de vencimiento'}>
                      {isLate ? <span aria-label="Vencido">!</span> : null}{shortDate(job.dueDate)}
                    </span></td>
                    <td><button type="button" className="jt-notes" onClick={() => onDetails(job)} title={job.description || 'Ver detalles'}>{job.description || '—'}</button></td>
                    <StatusCell label={paymentLabel(job)} tone={paymentStatusTone(job.paymentStatus)}
                      onClick={canManage && job.paymentStatus !== 'PAID' ? () => onPaymentStatusAction(job) : undefined}
                      actionLabel={`Marcar como pagado: ${job.service}`} />
                    <td className="jt-money">{formatMoney(job.laborCost)}</td>
                    <td className="jt-money">{formatMoney(job.materialCost)}</td>
                    <FileCell files={job.files.before} label={`Antes de ${job.service}`} onOpen={() => setGallery({ job, category: 'before' })} />
                    <FileCell files={job.files.after} label={`Después de ${job.service}`} onOpen={() => setGallery({ job, category: 'after' })} />
                    <td><span className={`jt-timeline ${job.status === 'DONE' ? 'jt-timeline--done' : isLate ? 'jt-timeline--late' : ''}`}
                      title={`${formatDate(job.startDate)} – ${formatDate(end)} · ${job.timeline.label}`}>
                      {!job.startDate && !end ? 'Sin fechas' : `${shortDate(job.startDate)} – ${shortDate(end)}`}
                    </span></td>
                    <td className="jt-updated" title={new Date(job.updatedAt).toLocaleString('es-PE')}>{formatDate(job.updatedAt)}</td>
                    <td><div className="jt-actions">
                      <button type="button" aria-label={`Ver detalles de ${job.service}`} title="Ver detalles" onClick={() => onDetails(job)}><UiIcon name="eye" size={15} /></button>
                      {canManage ? <>
                        <button type="button" aria-label={`Editar ${job.service}`} title="Editar trabajo" onClick={() => onEdit(job)}><UiIcon name="file" size={15} /></button>
                        <button type="button" className="jt-delete" aria-label={`Eliminar ${job.service}`} title="Eliminar trabajo" onClick={() => onDelete(job.id)}><UiIcon name="trash" size={15} /></button>
                      </> : null}
                    </div></td>
                  </tr>;
                })}
                {canManage ? <tr className="jt-add-row"><td /><td colSpan={13}><button type="button" onClick={() => onCreate(propertyId)}><UiIcon name="plus" size={15} />Añadir trabajo</button></td></tr> : null}
              </tbody>
              <tfoot><tr>
                <td /><td className="jt-summary-label">{completed} de {group.jobs.length} completados</td><td />
                <td><StatusSummary jobs={group.jobs} /></td><td /><td />
                <td><StatusSummary jobs={group.jobs} payment /></td>
                <td className="jt-money">{formatMoney(group.jobs.reduce((sum, job) => sum + job.laborCost, 0))}<small>suma</small></td>
                <td className="jt-money">{formatMoney(group.jobs.reduce((sum, job) => sum + job.materialCost, 0))}<small>suma</small></td>
                <td colSpan={5} className="jt-group-total">Total del grupo <strong>{formatMoney(total)}</strong></td>
              </tr></tfoot>
            </table>
          </div>
          {group.jobs.length > pageSize ? <div className="jt-group-pagination">
            <span>{visibleJobs.length} de {group.jobs.length} trabajos · Los totales incluyen todo el grupo filtrado</span>
            {limit < group.jobs.length ? <button type="button" onClick={() => setLimits((current) => ({ ...current, [propertyId]: limit + pageSize }))}>Mostrar {Math.min(pageSize, group.jobs.length - limit)} más</button> : null}
            {limit > pageSize ? <button type="button" onClick={() => setLimits((current) => ({ ...current, [propertyId]: pageSize }))}>Mostrar menos</button> : null}
          </div> : null}
        </div>
      </section>;
    })}

    <dialog ref={galleryRef} className="jt-gallery" aria-labelledby="jt-gallery-title" onCancel={() => setGallery(null)} onClose={() => setGallery(null)}>
      {gallery ? <>
        <div className="jt-gallery-head"><div><p>{gallery.job.propertyName} · {gallery.job.service}</p><h2 id="jt-gallery-title">Archivos: {gallery.category === 'before' ? 'antes' : 'después'}</h2></div>
          <button type="button" aria-label="Cerrar archivos" onClick={() => setGallery(null)}><UiIcon name="close" size={20} /></button></div>
        <div className="jt-gallery-files">{gallery.job.files[gallery.category].map((file) => <button key={file.id} type="button" onClick={() => {
          galleryRef.current?.close();
          setGallery(null);
          onFilePreview(gallery.job, file);
        }}><FileThumbnail file={file} /><span>{file.name}</span><UiIcon name="eye" size={17} /></button>)}</div>
      </> : null}
    </dialog>
  </div>;
}
