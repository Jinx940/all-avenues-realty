import { useEffect, useState, type CSSProperties } from 'react';
import { buildAssetUrl } from '../lib/api';
import { formatDate, formatMoney } from '../lib/format';
import { formatAreaServiceLabel, formatStoryDisplayLabel } from '../lib/jobLocation';
import { paymentStatusTone, workStatusTone } from '../lib/statusVisuals';
import type { BootstrapPayload, JobFile, JobRow, Tone } from '../types';
import { ProtectedAssetFrame } from './ProtectedAssetFrame';
import { ProtectedAssetImage } from './ProtectedAssetImage';
import {
  type ProtectedAssetDimensions,
  useProtectedAssetRenderState,
} from './protectedAssetState';
import { UiIcon } from './UiIcon';

const timelineStateFor = (job: JobRow) => {
  if (job.status === 'DONE') return 'DONE';
  if (job.timeline.isLate || job.timeline.tone === 'danger') return 'OVERDUE';
  if (job.timeline.tone === 'warning') return 'NEAR_DUE';
  return 'IN_PROGRESS';
};

const statusToneFor = (job: JobRow): Tone => {
  return workStatusTone(job.statusLabel || job.status);
};

const invoiceToneFor = (job: JobRow): Tone =>
  job.invoiceStatus === 'YES' ? 'success' : 'neutral';

const paymentToneFor = (job: JobRow): Tone => {
  return paymentStatusTone(job.paymentStatusLabel || job.paymentStatus);
};

const getTrackerCompareImageStyle = (
  dimensions: ProtectedAssetDimensions | null,
  options?: {
    framePercent?: number;
    sharedHeightPercent?: number;
  },
): CSSProperties | undefined => {
  if (!dimensions) return undefined;
  const framePercent = options?.framePercent ?? 84;
  const sharedHeightPercent = options?.sharedHeightPercent ?? framePercent;
  return {
    width: 'auto',
    height: `${sharedHeightPercent}%`,
    maxWidth: `${framePercent}%`,
    maxHeight: `${framePercent}%`,
    padding: 0,
    display: 'block',
    objectPosition: 'center center',
  };
};

const timelineVisualFor = (job: JobRow) => {
  const timelineState = timelineStateFor(job);

  if (timelineState === 'DONE') {
    return {
      badge: 'Done',
      tone: 'success' as Tone,
      progress: 100,
      caption: job.completedAt ? `Completed on ${formatDate(job.completedAt)}` : 'Job marked as done',
    };
  }

  if (timelineState === 'OVERDUE') {
    return {
      badge: 'Overdue',
      tone: 'danger' as Tone,
      progress: 100,
      caption: job.timeline.label,
    };
  }

  if (timelineState === 'NEAR_DUE') {
    return {
      badge: 'Near Due',
      tone: 'warning' as Tone,
      progress: 68,
      caption: job.timeline.label,
    };
  }

  return {
    badge: 'In Progress',
    tone: 'neutral' as Tone,
    progress: 48,
    caption: job.timeline.label,
  };
};

const dateRangeFor = (job: JobRow) => {
  const start = formatDate(job.startDate);
  const due = formatDate(job.dueDate);

  if (job.status === 'DONE' && job.completedAt) {
    const completed = formatDate(job.completedAt);
    if (start !== 'No date') return `${start} – ${completed}`;
    return `Completado el ${completed}`;
  }

  if (start === 'No date' && due === 'No date') return 'Sin fechas';
  return `${start === 'No date' ? 'Sin fecha' : start} – ${due === 'No date' ? 'Sin fecha' : due}`;
};

type TrackerFilterField =
  | 'search'
  | 'propertyId'
  | 'date'
  | 'story'
  | 'unit'
  | 'area'
  | 'service'
  | 'timeline'
  | 'paymentStatus';

type TrackerFilters = {
  search: string;
  propertyId: string;
  date: string;
  story: string;
  unit: string;
  area: string;
  service: string;
  timeline: string;
  paymentStatus: string;
};

const trackerTimelineOptions = [
  { value: 'IN_PROGRESS', label: 'En proceso' },
  { value: 'NEAR_DUE', label: 'Próximo a vencer' },
  { value: 'OVERDUE', label: 'Vencido' },
  { value: 'DONE', label: 'Completado' },
];

const trackerPageSize = 10;

const trackerWorkStatusLabel = (job: JobRow) => {
  const labels: Record<string, string> = {
    DONE: 'Completado',
    IN_PROGRESS: 'En proceso',
    PENDING: 'Pendiente',
    PLANNING: 'Planificación',
    CANCELED: 'Cancelado',
    CANCELLED: 'Cancelado',
  };
  return labels[job.status] ?? job.statusLabel;
};

const trackerPaymentStatusLabel = (value: string, fallback: string) => {
  const labels: Record<string, string> = {
    PAID: 'Pagado',
    PARTIAL_PAYMENT: 'Pago parcial',
    UNPAID: 'Pendiente',
    NOT_INVOICED_YET: 'Sin facturar',
  };
  return labels[value] ?? fallback;
};

const trackerWeekdayFor = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(new Date(value))
    : '';

const triggerDownload = (url: string, fileName: string) => {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.rel = 'noopener noreferrer';
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
};

const getFileExtension = (value: string) => {
  const cleaned = value.split('?')[0].split('#')[0];
  const lastChunk = cleaned.split('/').pop() ?? cleaned;
  const extension = lastChunk.includes('.') ? lastChunk.split('.').pop() : '';
  return (extension ?? '').trim().toLowerCase();
};

const getJobFilePreviewMode = (file: JobFile): 'image' | 'pdf' | 'frame' | 'unsupported' => {
  const mimeType = file.mimeType?.toLowerCase() ?? '';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.includes('pdf')) return 'pdf';
  if (mimeType.includes('html')) return 'frame';

  const extension = getFileExtension(file.name) || getFileExtension(file.url);
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'avif'].includes(extension)) {
    return 'image';
  }

  if (extension === 'pdf') {
    return 'pdf';
  }

  if (['html', 'htm'].includes(extension)) {
    return 'frame';
  }

  return 'unsupported';
};

type TrackerMediaDialogState =
  | {
      mode: 'compare';
      job: JobRow;
    }
  | {
      mode: 'progress';
      job: JobRow;
    }
  | null;

type TrackerReceiptPreviewState = {
  job: JobRow;
  file: JobFile;
} | null;

export function JobTrackerView({
  bootstrap,
  jobs,
  filters,
  onFilterChange,
  onRefresh,
  onResetFilters,
  canManage,
  onEdit,
  onDelete,
  onWorkStatusAction,
  onPaymentStatusAction,
}: {
  bootstrap: BootstrapPayload | null;
  jobs: JobRow[];
  filters: TrackerFilters;
  onFilterChange: (field: TrackerFilterField, value: string) => void;
  onRefresh: () => void;
  onResetFilters: () => void;
  canManage: boolean;
  onEdit: (job: JobRow) => void;
  onDelete: (jobId: string) => void;
  onWorkStatusAction: (job: JobRow) => void;
  onPaymentStatusAction: (job: JobRow) => void;
}) {
  const [mediaDialog, setMediaDialog] = useState<TrackerMediaDialogState>(null);
  const [receiptPreview, setReceiptPreview] = useState<TrackerReceiptPreviewState>(null);
  const [compactJob, setCompactJob] = useState<JobRow | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(jobs.length / trackerPageSize));
  const visiblePage = Math.min(currentPage, totalPages);
  const pageStart = (visiblePage - 1) * trackerPageSize;
  const paginatedJobs = jobs.slice(pageStart, pageStart + trackerPageSize);
  const handleTrackerFilterChange = (field: TrackerFilterField, value: string) => {
    setCurrentPage(1);
    onFilterChange(field, value);
  };
  const handleResetFilters = () => {
    setCurrentPage(1);
    onResetFilters();
  };

  const renderTrackerFlatJobRow = (job: JobRow) => {
    const timelineVisual = timelineVisualFor(job);
    const primaryWorker = job.workers[0];
    const displayDate = job.startDate ?? job.dueDate;
    const propertyDetail = job.area || formatStoryDisplayLabel(job.story) || 'Propiedad';

    return (
      <div
        key={job.id}
        className={`tracker-compact-row tracker-unit-job-row--tone-${timelineVisual.tone}`}
      >
        <div className="tracker-unified-property" title={job.propertyName}>
          <span className="tracker-property-icon" aria-hidden="true">
            <UiIcon name="home" size={14} />
          </span>
          <span className="tracker-property-copy">
            <strong>{job.propertyName}</strong>
            <small>{propertyDetail}</small>
          </span>
        </div>
        <div className="tracker-compact-date">
          <UiIcon name="calendar" size={14} />
          <span>
            <strong>{displayDate ? formatDate(displayDate) : 'Sin fecha'}</strong>
            {displayDate ? <small>{trackerWeekdayFor(displayDate)}</small> : null}
          </span>
        </div>
        <button type="button" className="tracker-compact-service" onClick={() => setCompactJob(job)}>
          <span className="tracker-compact-service-name">{job.service}</span>
        </button>
        {job.story || job.unit || job.area ? (
          <div className="tracker-compact-location">
            <span>{formatStoryDisplayLabel(job.story) || '-'}</span>
            <span>{job.unit || '-'}</span>
            {job.area ? <small>{job.area}</small> : null}
          </div>
        ) : (
          <span className="tracker-compact-location tracker-location-empty">-</span>
        )}
        <div className="tracker-compact-worker">
          {primaryWorker ? (
            <>
              <span>{primaryWorker.name}</span>
              {job.workers.length > 1 ? <small>+{job.workers.length - 1}</small> : null}
            </>
          ) : (
            <span className="tracker-empty-mark">-</span>
          )}
        </div>
        <span className="tracker-compact-money">{formatMoney(job.materialCost)}</span>
        <span className="tracker-compact-money">{formatMoney(job.laborCost)}</span>
        <strong className="tracker-compact-total">{formatMoney(job.totalCost)}</strong>
        <div className="tracker-compact-timeline">
          <span title={dateRangeFor(job)}>{dateRangeFor(job)}</span>
          <div className="tracker-compact-progress">
            <div className="tracker-timeline-bar">
              <div
                className={`tracker-timeline-fill tracker-timeline-fill--${timelineVisual.tone}`}
                style={{ width: `${timelineVisual.progress}%` }}
              />
            </div>
            <small>{timelineVisual.progress}%</small>
          </div>
        </div>
        <div className="tracker-status-cell">
          {canManage && job.status !== 'DONE' ? (
            <button
              type="button"
              className={`pill tone-${statusToneFor(job)} tracker-pill-button`}
              onClick={() => onWorkStatusAction(job)}
            >
              {trackerWorkStatusLabel(job)}
            </button>
          ) : (
            <span className={`pill tone-${statusToneFor(job)}`}>{trackerWorkStatusLabel(job)}</span>
          )}
        </div>
        <div className="tracker-payment-cell">
          {canManage && job.paymentStatus !== 'PAID' ? (
            <button
              type="button"
              className={`pill tone-${paymentToneFor(job)} tracker-pill-button`}
              onClick={() => onPaymentStatusAction(job)}
            >
              {trackerPaymentStatusLabel(job.paymentStatus, job.paymentStatusLabel)}
            </button>
          ) : (
            <span className={`pill tone-${paymentToneFor(job)}`}>
              {trackerPaymentStatusLabel(job.paymentStatus, job.paymentStatusLabel)}
            </span>
          )}
        </div>
        <div className="tracker-compact-actions">
          <button
            type="button"
            className="ghost-button tracker-mini-button tracker-compact-details-button"
            onClick={() => setCompactJob(job)}
            aria-label={`Ver detalles de ${job.service}`}
            title="Ver"
          >
            <UiIcon name="eye" size={14} />
          </button>
          {canManage ? (
            <>
              <button
                type="button"
                className="ghost-button tracker-mini-button"
                onClick={() => onEdit(job)}
                aria-label={`Editar ${job.service}`}
                title="Documento / editar"
              >
                <UiIcon name="file" size={13} />
              </button>
              <button
                type="button"
                className="records-danger-button records-action-button tracker-mini-button"
                onClick={() => onDelete(job.id)}
                aria-label={`Eliminar ${job.service}`}
                title="Eliminar"
              >
                <UiIcon name="trash" size={13} />
              </button>
            </>
          ) : null}
        </div>
      </div>
    );
  };
  return (
    <section className="tab-panel">
      <div className="panel records-filter-panel tracker-panel-compact">
        <div className="tracker-filter-toolbar">
          <div className="job-tracker-filters job-tracker-filters--essential">
            <label>
              Buscar
              <span className="tracker-search-control">
                <UiIcon name="search" size={15} />
                <input
                  value={filters.search}
                  onChange={(event) => handleTrackerFilterChange('search', event.target.value)}
                  placeholder="Propiedad, servicio o trabajador..."
                />
              </span>
            </label>

            <label>
              Propiedad
              <select value={filters.propertyId} onChange={(event) => handleTrackerFilterChange('propertyId', event.target.value)}>
                <option value="">Todas las propiedades</option>
                {bootstrap?.properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Fecha
              <input
                type="date"
                value={filters.date}
                onChange={(event) => handleTrackerFilterChange('date', event.target.value)}
              />
            </label>

            <label>
              Estado del trabajo
              <select value={filters.timeline} onChange={(event) => handleTrackerFilterChange('timeline', event.target.value)}>
                <option value="">Todos los estados</option>
                {trackerTimelineOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Estado de pago
              <select
                value={filters.paymentStatus}
                onChange={(event) => handleTrackerFilterChange('paymentStatus', event.target.value)}
              >
                <option value="">Todos los pagos</option>
                {bootstrap?.paymentStatuses.map((status) => (
                  <option key={status.value} value={status.value}>
                    {trackerPaymentStatusLabel(status.value, status.label)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="tracker-toolbar-actions">
            <button type="button" className="ghost-button tracker-clear-button" onClick={handleResetFilters}>
              Limpiar
            </button>
            <button type="button" className="tracker-refresh-button" onClick={onRefresh}>
              <UiIcon name="refresh" size={15} />
              Actualizar
            </button>
            <span className="result-chip tracker-count-chip">{jobs.length} trabajos</span>
          </div>
        </div>

        <div className="tracker-table-shell">
          {jobs.length ? (
            <section className="tracker-flat-property-card tracker-unified-board">
              <div className="tracker-flat-property-scroll tracker-unified-scroll">
                <div className="tracker-flat-property-table tracker-unified-table">
                  <div className="tracker-compact-row tracker-compact-header">
                    <span>Propiedad</span>
                    <span>Fecha</span>
                    <span>Servicio / Trabajo</span>
                    <span>Ubicación</span>
                    <span>Trabajador</span>
                    <span>Material</span>
                    <span>Mano de obra</span>
                    <span>Total</span>
                    <span>Cronograma</span>
                    <span>Estado trabajo</span>
                    <span>Pago</span>
                    <span>Acciones</span>
                  </div>
                  {paginatedJobs.map(renderTrackerFlatJobRow)}
                </div>
              </div>

              {jobs.length > trackerPageSize ? (
                <footer className="tracker-pagination" aria-label="Paginación de trabajos">
                  <span>
                    {pageStart + 1}–{Math.min(pageStart + trackerPageSize, jobs.length)} de {jobs.length}
                  </span>
                  <div className="tracker-pagination-actions">
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => setCurrentPage(Math.max(1, visiblePage - 1))}
                      disabled={visiblePage === 1}
                    >
                      Anterior
                    </button>
                    <span>Página {visiblePage} de {totalPages}</span>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => setCurrentPage(Math.min(totalPages, visiblePage + 1))}
                      disabled={visiblePage === totalPages}
                    >
                      Siguiente
                    </button>
                  </div>
                </footer>
              ) : null}
            </section>
          ) : (
            <div className="empty-box">No hay trabajos que coincidan con los filtros activos.</div>
          )}
        </div>
      </div>

      <TrackerMediaDialog
        key={mediaDialog ? `${mediaDialog.mode}-${mediaDialog.job.id}` : 'tracker-media-closed'}
        state={mediaDialog}
        onClose={() => setMediaDialog(null)}
      />
      <TrackerReceiptPreviewDialog
        key={receiptPreview ? `tracker-receipt-${receiptPreview.file.id}` : 'tracker-receipt-closed'}
        state={receiptPreview}
        onClose={() => setReceiptPreview(null)}
      />
      <TrackerCompactJobDialog
        key={compactJob ? `tracker-compact-${compactJob.id}` : 'tracker-compact-closed'}
        job={compactJob}
        canManage={canManage}
        onClose={() => setCompactJob(null)}
        onEdit={(job) => {
          setCompactJob(null);
          onEdit(job);
        }}
        onDelete={(job) => {
          setCompactJob(null);
          onDelete(job.id);
        }}
        onWorkStatusAction={(job) => {
          setCompactJob(null);
          onWorkStatusAction(job);
        }}
        onPaymentStatusAction={(job) => {
          setCompactJob(null);
          onPaymentStatusAction(job);
        }}
        onReceipt={(job, file) => {
          setCompactJob(null);
          setReceiptPreview({ job, file });
        }}
        onMedia={(job, mode) => {
          setCompactJob(null);
          setMediaDialog({ job, mode });
        }}
      />
    </section>
  );
}

function TrackerReceiptPreviewDialog({
  state,
  onClose,
}: {
  state: TrackerReceiptPreviewState;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!state) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [state, onClose]);

  if (!state) return null;

  const { job, file } = state;
  const previewMode = getJobFilePreviewMode(file);
  const previewUrl = buildAssetUrl(file.url);
  const locationLabel = [
    job.propertyName,
    formatStoryDisplayLabel(job.story),
    job.unit,
    job.area,
    job.service,
  ]
    .filter(Boolean)
    .join(' | ');
  const descriptionLines = splitDescriptionLines(job.description);

  return (
    <div className="document-preview-backdrop" role="presentation" onClick={onClose}>
      <div
        className="document-preview-dialog tracker-receipt-preview-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tracker-receipt-preview-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="document-preview-head">
          <div className="document-preview-head-copy">
            <p className="eyebrow">Receipt preview</p>
            <h2 id="tracker-receipt-preview-title">{file.name}</h2>
            <p>{locationLabel}</p>
          </div>

          <button type="button" className="ghost-button" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="document-preview-body">
          <div className="document-preview-stage">
            {previewMode === 'image' ? (
              <ProtectedAssetImage
                className="document-preview-image"
                src={previewUrl}
                alt={file.name}
                mimeType={file.mimeType}
                loadingFallback={
                  <div className="document-preview-empty">
                    <strong>Loading receipt image...</strong>
                    <span>Please wait while the saved file opens.</span>
                  </div>
                }
                errorFallback={(message) => (
                  <div className="document-preview-empty">
                    <strong>Could not load this receipt image</strong>
                    <span>{message}</span>
                  </div>
                )}
              />
            ) : previewMode === 'pdf' ? (
              <ProtectedAssetFrame
                className="document-preview-frame"
                src={previewUrl}
                title={`Receipt preview for ${file.name}`}
                mimeType="application/pdf"
                loadingFallback={
                  <div className="document-preview-empty">
                    <strong>Loading receipt PDF...</strong>
                    <span>Please wait while the saved file opens.</span>
                  </div>
                }
                errorFallback={(message) => (
                  <div className="document-preview-empty">
                    <strong>Could not load this receipt PDF</strong>
                    <span>{message}</span>
                  </div>
                )}
              />
            ) : previewMode === 'frame' ? (
              <ProtectedAssetFrame
                className="document-preview-frame"
                src={previewUrl}
                title={`Receipt preview for ${file.name}`}
                mimeType="text/html"
                loadingFallback={
                  <div className="document-preview-empty">
                    <strong>Loading receipt preview...</strong>
                    <span>Please wait while the saved file opens.</span>
                  </div>
                }
                errorFallback={(message) => (
                  <div className="document-preview-empty">
                    <strong>Could not load this receipt preview</strong>
                    <span>{message}</span>
                  </div>
                )}
              />
            ) : (
              <div className="document-preview-empty">
                <strong>Preview not available</strong>
                <span>This receipt file cannot be rendered inline yet. Use Download to inspect it.</span>
              </div>
            )}
          </div>

          <aside className="document-preview-sidebar">
            <div className="document-preview-meta-grid">
              <article className="document-preview-meta-card">
                <span>No.</span>
                <strong>{file.documentNumber?.trim() || '-'}</strong>
              </article>
              <article className="document-preview-meta-card">
                <span>Type</span>
                <strong>Receipt</strong>
              </article>
              <article className="document-preview-meta-card">
                <span>Date</span>
                <strong>{formatDate(file.createdAt)}</strong>
              </article>
              <article className="document-preview-meta-card">
                <span>Floor / Unit</span>
                <strong>
                  {[formatStoryDisplayLabel(job.story), job.unit].filter(Boolean).join(' / ') || 'Whole property'}
                </strong>
              </article>
              <article className="document-preview-meta-card">
                <span>Area</span>
                <strong>{job.area || '-'}</strong>
              </article>
              <article className="document-preview-meta-card document-preview-meta-card--wide">
                <span>Property</span>
                <strong>{job.propertyName}</strong>
              </article>
              <article className="document-preview-meta-card document-preview-meta-card--wide">
                <span>Service</span>
                <strong>{job.service}</strong>
                {descriptionLines.length ? (
                  <div className="tracker-receipt-description-list">
                    {descriptionLines.map((line, index) => (
                      <p key={`${file.id}-receipt-description-${index}`}>{line}</p>
                    ))}
                  </div>
                ) : (
                  <p className="tracker-receipt-description-empty">No description saved yet.</p>
                )}
              </article>
            </div>

            <div className="document-preview-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => triggerDownload(previewUrl, file.name)}
              >
                <UiIcon name="download" size={15} />
                Download
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function TrackerCompactJobDialog({
  job,
  canManage,
  onClose,
  onEdit,
  onDelete,
  onWorkStatusAction,
  onPaymentStatusAction,
  onReceipt,
  onMedia,
}: {
  job: JobRow | null;
  canManage: boolean;
  onClose: () => void;
  onEdit: (job: JobRow) => void;
  onDelete: (job: JobRow) => void;
  onWorkStatusAction: (job: JobRow) => void;
  onPaymentStatusAction: (job: JobRow) => void;
  onReceipt: (job: JobRow, file: JobFile) => void;
  onMedia: (job: JobRow, mode: 'compare' | 'progress') => void;
}) {
  if (!job) return null;

  const timelineVisual = timelineVisualFor(job);
  const descriptionLines = splitDescriptionLines(job.description);
  const locationLabel = [job.propertyName, formatStoryDisplayLabel(job.story), job.unit, job.area]
    .filter(Boolean)
    .join(' · ');
  const workerLabel = job.workers.map((worker) => worker.name).join(', ') || 'Not assigned';

  return (
    <div className="tracker-media-dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="tracker-media-dialog-card tracker-compact-job-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tracker-compact-job-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="tracker-media-dialog-head">
          <div>
            <p className="eyebrow">Job details</p>
            <h2 id="tracker-compact-job-title">{job.service}</h2>
            <p className="tracker-media-dialog-copy">{locationLabel}</p>
          </div>
          <button type="button" className="ghost-button" onClick={onClose}>
            <UiIcon name="close" size={15} />
            Close
          </button>
        </div>

        <div className="tracker-media-dialog-body tracker-compact-job-body">
          <div className="tracker-compact-job-meta-grid">
            <article className="tracker-description-meta-card">
              <span>Worker</span>
              <strong>{workerLabel}</strong>
            </article>
            <article className="tracker-description-meta-card">
              <span>Timeline</span>
              <strong>{dateRangeFor(job)}</strong>
              <small>{timelineVisual.caption}</small>
            </article>
            <article className="tracker-description-meta-card">
              <span>Material</span>
              <strong>{formatMoney(job.materialCost)}</strong>
            </article>
            <article className="tracker-description-meta-card">
              <span>Labor</span>
              <strong>{formatMoney(job.laborCost)}</strong>
            </article>
            <article className="tracker-description-meta-card">
              <span>Work status</span>
              <strong className={`pill tone-${statusToneFor(job)}`}>{job.statusLabel}</strong>
            </article>
            <article className="tracker-description-meta-card">
              <span>Payment</span>
              <strong className={`pill tone-${paymentToneFor(job)}`}>{job.paymentStatusLabel}</strong>
            </article>
            <article className="tracker-description-meta-card">
              <span>Invoice</span>
              <strong className={`pill tone-${invoiceToneFor(job)}`}>{job.invoiceStatusLabel}</strong>
            </article>
            <article className="tracker-description-meta-card">
              <span>Advance Cash App</span>
              <strong>{formatMoney(job.advanceCashApp)}</strong>
            </article>
          </div>

          <section className="tracker-compact-detail-section">
            <h3>Description</h3>
            <div className="tracker-description-sheet">
              {descriptionLines.length ? (
                descriptionLines.map((line, index) => (
                  <p key={`${job.id}-compact-description-${index}`}>{line}</p>
                ))
              ) : (
                <div className="tracker-description-empty">
                  <strong>No description yet</strong>
                  <span>This service does not have a description saved yet.</span>
                </div>
              )}
            </div>
          </section>

          <section className="tracker-compact-detail-section">
            <h3>Files and pictures</h3>
            <div className="tracker-compact-file-actions">
              {job.files.receipt[0] ? (
                <button type="button" className="ghost-button" onClick={() => onReceipt(job, job.files.receipt[0])}>
                  <UiIcon name="receipt" size={15} />
                  View receipt
                </button>
              ) : null}
              {job.files.before[0] || job.files.after[0] ? (
                <button type="button" className="ghost-button" onClick={() => onMedia(job, 'compare')}>
                  <UiIcon name="image" size={15} />
                  Before / After
                </button>
              ) : null}
              {job.files.progress.length ? (
                <button type="button" className="ghost-button" onClick={() => onMedia(job, 'progress')}>
                  <UiIcon name="camera" size={15} />
                  Progress ({job.files.progress.length})
                </button>
              ) : null}
              {!job.files.receipt[0] && !job.files.before[0] && !job.files.after[0] && !job.files.progress.length ? (
                <span className="tracker-compact-no-files">No files attached to this job.</span>
              ) : null}
            </div>
          </section>

          {canManage ? (
            <div className="tracker-compact-dialog-actions">
              {job.status !== 'DONE' ? (
                <button type="button" className="ghost-button" onClick={() => onWorkStatusAction(job)}>
                  Update status
                </button>
              ) : null}
              {job.paymentStatus !== 'PAID' ? (
                <button type="button" className="ghost-button" onClick={() => onPaymentStatusAction(job)}>
                  Update payment
                </button>
              ) : null}
              <button type="button" className="ghost-button" onClick={() => onEdit(job)}>
                <UiIcon name="file" size={14} />
                Edit job
              </button>
              <button type="button" className="records-danger-button" onClick={() => onDelete(job)}>
                <UiIcon name="trash" size={14} />
                Delete
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function TrackerMediaDialog({
  state,
  onClose,
}: {
  state: TrackerMediaDialogState;
  onClose: () => void;
}) {
  const compareSessionKey = `${state?.job.id ?? 'none'}:${state?.mode ?? 'none'}`;
  const [compareUiState, setCompareUiState] = useState<{
    sessionKey: string;
    position: number;
    viewMode: 'compare' | 'before' | 'after';
  }>(() => ({
    sessionKey: compareSessionKey,
    position: 50,
    viewMode: 'compare',
  }));

  const compareBefore = state?.job.files.before[0] ?? null;
  const compareAfter = state?.job.files.after[0] ?? null;
  const progressFiles = state?.job.files.progress ?? [];
  const dialogTitle = state?.mode === 'compare' ? 'Before / After viewer' : 'Progress gallery';
  const dialogEyebrow = state?.mode === 'compare' ? 'Photo comparison' : 'Progress pictures';
  const locationLabel = [
    state?.job.propertyName ?? '',
    formatStoryDisplayLabel(state?.job.story || ''),
    state?.job.unit || '',
    state?.job.area || '',
    state?.job.service || '',
  ]
    .filter(Boolean)
    .join(' | ');
  const compareBeforeId = compareBefore?.id ?? '';
  const compareAfterId = compareAfter?.id ?? '';
  const beforePhoto = useProtectedAssetRenderState(compareBeforeId, Boolean(compareBefore));
  const afterPhoto = useProtectedAssetRenderState(compareAfterId, Boolean(compareAfter));
  const comparePosition =
    compareUiState.sessionKey === compareSessionKey ? compareUiState.position : 50;
  const compareViewMode =
    compareUiState.sessionKey === compareSessionKey ? compareUiState.viewMode : 'compare';
  const hasBeforePhoto = Boolean(compareBefore) && beforePhoto.loadState !== 'error';
  const hasAfterPhoto = Boolean(compareAfter) && afterPhoto.loadState !== 'error';
  const canComparePhotos = hasBeforePhoto && hasAfterPhoto;
  const shouldShowAfterOnly =
    Boolean(compareAfter) && (!compareBefore || beforePhoto.loadState === 'error');
  const shouldShowBeforeOnly =
    Boolean(compareBefore) && (!compareAfter || afterPhoto.loadState === 'error');
  const availableAspectRatios = [beforePhoto.dimensions, afterPhoto.dimensions]
    .filter((dimensions): dimensions is ProtectedAssetDimensions => Boolean(dimensions))
    .map((dimensions) => dimensions.width / Math.max(dimensions.height, 1));
  const compareFramePercent = 84;
  const compareWidestAspectRatio = availableAspectRatios.length
    ? Math.max(...availableAspectRatios, 1)
    : 1;
  const compareSharedHeightPercent = Math.max(
    58,
    Math.min(compareFramePercent, compareFramePercent / compareWidestAspectRatio),
  );
  const compareAspectRatio = Math.min(
    Math.max(
      availableAspectRatios.length ? Math.min(...availableAspectRatios) : 1,
      0.7,
    ),
    1.8,
  );
  const compareStageDisplayAspectRatio = Math.max(compareAspectRatio, 1.25);
  const compareStageMaxWidth = `${Math.round(860 * compareStageDisplayAspectRatio)}px`;
  const beforeCompareImageStyle = getTrackerCompareImageStyle(beforePhoto.dimensions, {
    framePercent: compareFramePercent,
    sharedHeightPercent: compareSharedHeightPercent,
  });
  const afterCompareImageStyle = getTrackerCompareImageStyle(afterPhoto.dimensions, {
    framePercent: compareFramePercent,
    sharedHeightPercent: compareSharedHeightPercent,
  });
  const setCompareView = (viewMode: 'compare' | 'before' | 'after') => {
    setCompareUiState(() => ({
      sessionKey: compareSessionKey,
      position: 50,
      viewMode,
    }));
  };
  const setCompareSliderPosition = (position: number) => {
    setCompareUiState((current) => ({
      sessionKey: compareSessionKey,
      position,
      viewMode: current.sessionKey === compareSessionKey ? current.viewMode : 'compare',
    }));
  };
  const activeCompareView =
    compareViewMode === 'before'
      ? hasBeforePhoto
        ? 'before'
        : hasAfterPhoto
          ? 'after'
          : 'before'
      : compareViewMode === 'after'
        ? hasAfterPhoto
          ? 'after'
          : hasBeforePhoto
            ? 'before'
            : 'after'
        : canComparePhotos
          ? 'compare'
          : hasAfterPhoto
            ? 'after'
            : 'before';

  if (!state) return null;

  return (
    <div className="tracker-media-dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className={`tracker-media-dialog-card ${
          state.mode === 'compare' ? 'tracker-media-dialog-card--compare' : ''
        }`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tracker-media-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="tracker-media-dialog-head">
          <div>
            <p className="eyebrow">{dialogEyebrow}</p>
            <h2 id="tracker-media-dialog-title">{dialogTitle}</h2>
            <p className="tracker-media-dialog-copy">{locationLabel}</p>
          </div>

          <button type="button" className="ghost-button" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="tracker-media-dialog-body">
          {state.mode === 'compare' ? (
            <div className="tracker-compare-showcase">
              <div className="tracker-compare-mode-switch">
                <button
                  type="button"
                  className={`ghost-button ${activeCompareView === 'compare' ? 'is-active' : ''}`.trim()}
                  onClick={() => setCompareView('compare')}
                  disabled={!canComparePhotos}
                >
                  Compare
                </button>
                <button
                  type="button"
                  className={`ghost-button ${activeCompareView === 'before' ? 'is-active' : ''}`.trim()}
                  onClick={() => setCompareView('before')}
                  disabled={!hasBeforePhoto}
                >
                  Before
                </button>
                <button
                  type="button"
                  className={`ghost-button ${activeCompareView === 'after' ? 'is-active' : ''}`.trim()}
                  onClick={() => setCompareView('after')}
                  disabled={!hasAfterPhoto}
                >
                  After
                </button>
              </div>

              <div
                className={`tracker-compare-stage ${
                  activeCompareView !== 'compare' || shouldShowAfterOnly || shouldShowBeforeOnly
                    ? 'tracker-compare-stage--single'
                    : ''
                }`.trim()}
                style={{ maxWidth: compareStageMaxWidth }}
              >
                {activeCompareView === 'after' ? (
                  <div className="tracker-compare-panel tracker-compare-panel--single">
                    <span className="tracker-compare-chip tracker-compare-chip--floating tracker-compare-chip--after">
                      After
                    </span>
                    <div className="tracker-compare-media-shell">
                      <ProtectedAssetImage
                        className="tracker-compare-image"
                        src={compareAfter?.url ?? null}
                        alt={`After - ${formatAreaServiceLabel(state.job.area, state.job.service)}`}
                        mimeType={compareAfter?.mimeType}
                        style={afterCompareImageStyle}
                        onStateChange={afterPhoto.handleStateChange}
                        onDimensionsChange={afterPhoto.handleDimensionsChange}
                        loadingFallback={
                          <div className="tracker-compare-empty">
                            <strong>Loading after photo...</strong>
                            <span>Please wait while the file opens.</span>
                          </div>
                        }
                        errorFallback={(message) => (
                          <div className="tracker-compare-empty">
                            <strong>Could not load the after photo</strong>
                            <span>{message}</span>
                          </div>
                        )}
                      />
                    </div>
                    {shouldShowAfterOnly ? (
                      <div className="tracker-compare-single-note">
                        <strong>Before photo unavailable</strong>
                        <span>Showing the available after image while the older before file is missing.</span>
                      </div>
                    ) : null}
                  </div>
                ) : activeCompareView === 'before' ? (
                  <div className="tracker-compare-panel tracker-compare-panel--single">
                    <span className="tracker-compare-chip tracker-compare-chip--floating">Before</span>
                    <div className="tracker-compare-media-shell">
                      <ProtectedAssetImage
                        className="tracker-compare-image"
                        src={compareBefore?.url ?? null}
                        alt={`Before - ${formatAreaServiceLabel(state.job.area, state.job.service)}`}
                        mimeType={compareBefore?.mimeType}
                        style={beforeCompareImageStyle}
                        onStateChange={beforePhoto.handleStateChange}
                        onDimensionsChange={beforePhoto.handleDimensionsChange}
                        loadingFallback={
                          <div className="tracker-compare-empty">
                            <strong>Loading before photo...</strong>
                            <span>Please wait while the file opens.</span>
                          </div>
                        }
                        errorFallback={(message) => (
                          <div className="tracker-compare-empty">
                            <strong>Could not load the before photo</strong>
                            <span>{message}</span>
                          </div>
                        )}
                      />
                    </div>
                    {shouldShowBeforeOnly ? (
                      <div className="tracker-compare-single-note">
                        <strong>After photo unavailable</strong>
                        <span>Showing the available before image while the older after file is missing.</span>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <>
                    <div
                      className="tracker-compare-panel tracker-compare-panel--after"
                      style={{ clipPath: `inset(0 0 0 ${comparePosition}%)` }}
                    >
                      {compareAfter ? (
                        <div className="tracker-compare-media-shell">
                          <ProtectedAssetImage
                            className="tracker-compare-image tracker-compare-image--reveal"
                            src={compareAfter.url}
                            alt={`After - ${formatAreaServiceLabel(state.job.area, state.job.service)}`}
                            mimeType={compareAfter.mimeType}
                            style={afterCompareImageStyle}
                            onStateChange={afterPhoto.handleStateChange}
                            onDimensionsChange={afterPhoto.handleDimensionsChange}
                            loadingFallback={
                              <div className="tracker-compare-empty">
                                <strong>Loading after photo...</strong>
                                <span>Please wait while the file opens.</span>
                              </div>
                            }
                            errorFallback={(message) => (
                              <div className="tracker-compare-empty">
                                <strong>Could not load the after photo</strong>
                                <span>{message}</span>
                              </div>
                            )}
                          />
                        </div>
                      ) : (
                        <div className="tracker-compare-empty">
                          <strong>No after photo</strong>
                          <span>Upload an after image in the job form to complete the comparison.</span>
                        </div>
                      )}
                    </div>

                    <div
                      className="tracker-compare-panel tracker-compare-panel--before"
                      style={{ clipPath: `inset(0 ${100 - comparePosition}% 0 0)` }}
                    >
                      {compareBefore ? (
                        <div className="tracker-compare-media-shell">
                          <ProtectedAssetImage
                            className="tracker-compare-image tracker-compare-image--reveal"
                            src={compareBefore.url}
                            alt={`Before - ${formatAreaServiceLabel(state.job.area, state.job.service)}`}
                            mimeType={compareBefore.mimeType}
                            style={beforeCompareImageStyle}
                            onStateChange={beforePhoto.handleStateChange}
                            onDimensionsChange={beforePhoto.handleDimensionsChange}
                            loadingFallback={
                              <div className="tracker-compare-empty">
                                <strong>Loading before photo...</strong>
                                <span>Please wait while the file opens.</span>
                              </div>
                            }
                            errorFallback={(message) => (
                              <div className="tracker-compare-empty">
                                <strong>Could not load the before photo</strong>
                                <span>{message}</span>
                              </div>
                            )}
                          />
                        </div>
                      ) : (
                        <div className="tracker-compare-empty">
                          <strong>No before photo</strong>
                          <span>Upload a before image in the job form to start the comparison.</span>
                        </div>
                      )}
                    </div>

                    <div className="tracker-compare-overlay">
                      <div className="tracker-compare-badges">
                        <span className="tracker-compare-chip">Before</span>
                        <span className="tracker-compare-chip tracker-compare-chip--after">After</span>
                      </div>

                      <div className="tracker-compare-divider" style={{ left: `${comparePosition}%` }}>
                        <span className="tracker-compare-handle" />
                      </div>

                      <input
                        className="tracker-compare-range"
                        type="range"
                        min="0"
                        max="100"
                        value={comparePosition}
                        onChange={(event) => setCompareSliderPosition(Number(event.target.value))}
                        aria-label={`Compare before and after photos for ${formatAreaServiceLabel(state.job.area, state.job.service)}`}
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="tracker-compare-meta-grid">
                <TrackerMediaMetaCard
                  label="Before"
                  file={compareBefore ?? undefined}
                  emptyTitle="No before photo"
                  emptyCopy="This side will stay empty until a before image is uploaded."
                />
                <TrackerMediaMetaCard
                  label="After"
                  file={compareAfter ?? undefined}
                  emptyTitle="No after photo"
                  emptyCopy="This side will stay empty until an after image is uploaded."
                />
              </div>
            </div>
          ) : (
            <div className="tracker-progress-grid">
              {progressFiles.length ? (
                progressFiles.map((file, index) => (
                  <article key={file.id} className="tracker-progress-card">
                    <div className="tracker-progress-card-head">
                      <span className="pill tone-neutral">Progress {index + 1}</span>
                      <a
                        className="tracker-media-open-link"
                        href={buildAssetUrl(file.url)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open file
                      </a>
                    </div>
                    <ProtectedAssetImage
                      className="tracker-progress-image"
                      src={file.url}
                      alt={`Progress ${index + 1} - ${formatAreaServiceLabel(state.job.area, state.job.service)}`}
                      mimeType={file.mimeType}
                      loadingFallback={
                        <div className="tracker-compare-empty">
                          <strong>Loading progress photo...</strong>
                          <span>Please wait while the file opens.</span>
                        </div>
                      }
                      errorFallback={(message) => (
                        <div className="tracker-compare-empty">
                          <strong>Could not load this progress photo</strong>
                          <span>{message}</span>
                        </div>
                      )}
                    />
                    <div className="tracker-progress-copy">
                      <strong>{file.name}</strong>
                      <span>{formatDate(file.createdAt)}</span>
                    </div>
                  </article>
                ))
              ) : (
                <div className="tracker-media-stage tracker-media-stage--empty">
                  <div className="tracker-media-stage-empty">
                    <strong>No progress pictures</strong>
                    <span>This job does not have progress evidence yet.</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TrackerMediaMetaCard({
  label,
  file,
  emptyTitle,
  emptyCopy,
}: {
  label: string;
  file: JobFile | undefined;
  emptyTitle: string;
  emptyCopy: string;
}) {
  return (
    <article className="tracker-media-meta-card">
      <div className="tracker-media-meta-head">
        <span className="pill tone-neutral">{label}</span>
        {file ? (
          <a className="tracker-media-open-link" href={buildAssetUrl(file.url)} target="_blank" rel="noreferrer">
            Open file
          </a>
        ) : null}
      </div>

      {file ? (
        <div className="tracker-media-meta-copy">
          <strong>{file.name}</strong>
          <span>{formatDate(file.createdAt)}</span>
        </div>
      ) : (
        <div className="tracker-media-meta-empty">
          <strong>{emptyTitle}</strong>
          <span>{emptyCopy}</span>
        </div>
      )}
    </article>
  );
}

function splitDescriptionLines(value: string) {
  return value
    .replace(/\r/g, '')
    .split('\n')
    .flatMap((block) => {
      const trimmed = block.trim();
      if (!trimmed) return [];

      const sentences = trimmed.match(/[^.!?]+[.!?]["']?|[^.!?]+$/g);
      return (sentences ?? [trimmed]).map((sentence) => sentence.trim()).filter(Boolean);
    });
}
