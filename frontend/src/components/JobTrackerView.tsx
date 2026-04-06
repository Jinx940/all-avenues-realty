import { useEffect, useState, type CSSProperties } from 'react';
import { buildAssetUrl } from '../lib/api';
import { formatDate, formatMoney } from '../lib/format';
import { formatAreaServiceLabel, formatStoryDisplayLabel } from '../lib/jobLocation';
import { paymentStatusTone, workStatusTone } from '../lib/statusVisuals';
import { getWorkerAccentClass } from '../lib/workerVisuals';
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
): CSSProperties | undefined => {
  if (!dimensions) return undefined;
  return {
    width: 'auto',
    height: 'auto',
    maxWidth: '88%',
    maxHeight: '74%',
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
    if (start !== 'No date') return `${start} -> ${completed}`;
    return `Completed on ${completed}`;
  }

  if (start === 'No date' && due === 'No date') return 'No dates';
  return `${start} -> ${due}`;
};

type TrackerFilterField = 'search' | 'propertyId' | 'story' | 'unit' | 'area' | 'service';

type TrackerFilters = {
  search: string;
  propertyId: string;
  story: string;
  unit: string;
  area: string;
  service: string;
};

const trackerValueSort = (left: string, right: string) =>
  left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });

const buildTrackerSelectOptions = (
  values: string[],
  labelFormatter?: (value: string) => string,
) =>
  Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
    .sort(trackerValueSort)
    .map((value) => ({
      value,
      label: labelFormatter ? labelFormatter(value) : value,
    }));

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
  allJobs,
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
  allJobs: JobRow[];
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
  const [descriptionJob, setDescriptionJob] = useState<JobRow | null>(null);
  const propertyScopedJobs = filters.propertyId
    ? allJobs.filter((job) => job.propertyId === filters.propertyId)
    : allJobs;
  const storyOptions = buildTrackerSelectOptions(propertyScopedJobs.map((job) => job.story), formatStoryDisplayLabel);
  const unitOptions = buildTrackerSelectOptions(propertyScopedJobs.map((job) => job.unit));
  const areaOptions = buildTrackerSelectOptions(propertyScopedJobs.map((job) => job.area));
  const serviceOptions = buildTrackerSelectOptions(propertyScopedJobs.map((job) => job.service));

  return (
    <section className="tab-panel">
      <div className="panel records-filter-panel tracker-panel-compact">
        <div className="tracker-panel-head">
          <h2 className="title-with-icon">
            <UiIcon name="activity" />
            <span>Job Tracker</span>
          </h2>
          <p>One central table with the key job files, unit details and status flow.</p>
        </div>

        <div className="job-tracker-filters job-tracker-filters--central">
          <label>
            Search
            <input
              value={filters.search}
              onChange={(event) => onFilterChange('search', event.target.value)}
              placeholder="Search property, floor, unit, area, services..."
            />
          </label>

          <label>
            Property
            <select value={filters.propertyId} onChange={(event) => onFilterChange('propertyId', event.target.value)}>
              <option value="">All</option>
              {bootstrap?.properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Floor
            <select value={filters.story} onChange={(event) => onFilterChange('story', event.target.value)}>
              <option value="">All</option>
              {storyOptions.map((story) => (
                <option key={story.value} value={story.value}>
                  {story.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Unit
            <select value={filters.unit} onChange={(event) => onFilterChange('unit', event.target.value)}>
              <option value="">All</option>
              {unitOptions.map((unit) => (
                <option key={unit.value} value={unit.value}>
                  {unit.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Area
            <select value={filters.area} onChange={(event) => onFilterChange('area', event.target.value)}>
              <option value="">All</option>
              {areaOptions.map((area) => (
                <option key={area.value} value={area.value}>
                  {area.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Services
            <select value={filters.service} onChange={(event) => onFilterChange('service', event.target.value)}>
              <option value="">All</option>
              {serviceOptions.map((service) => (
                <option key={service.value} value={service.value}>
                  {service.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="tracker-action-row">
          <div className="tracker-action-group">
            <button type="button" onClick={onRefresh}>
              <UiIcon name="refresh" />
              Refresh Tracker
            </button>
            <button type="button" className="ghost-button" onClick={onResetFilters}>
              <UiIcon name="search" />
              Reset Filters
            </button>
          </div>
          <span className="result-chip tracker-count-chip">{jobs.length} job(s)</span>
        </div>

        <div className="tracker-table-shell">
          <div className="tracker-table tracker-table--central">
            <div className="tracker-row tracker-row--central tracker-header">
              <span>Property</span>
              <span>Floor</span>
              <span>Unit</span>
              <span>Area</span>
              <span>Services</span>
              <span>Worker</span>
              <span>Material cost per Unit</span>
              <span>Receipt</span>
              <span>Labor</span>
              <span>Timeline</span>
              <span>Pictures</span>
              <span>Work Status</span>
              <span>Invoice Status</span>
              <span>Payment Status</span>
              <span>Actions</span>
            </div>

            {jobs.length ? (
              jobs.map((job) => {
                const timelineVisual = timelineVisualFor(job);

                return (
                  <div
                    key={job.id}
                    className={`tracker-row tracker-row--central tracker-row--tone-${timelineVisual.tone}`}
                  >
                    <span className="tracker-property-cell">{job.propertyName}</span>
                    <span className="tracker-story-cell">{formatStoryDisplayLabel(job.story) || '-'}</span>
                    <span className="tracker-unit-cell">{job.unit || '-'}</span>
                    <span className="tracker-area-cell">{job.area || '-'}</span>
                    <div className="tracker-service-details">
                      <div className="tracker-service-summary">
                        <span className="tracker-service-summary-copy">
                          <strong className="tracker-service-name">{job.service}</strong>
                          <button
                            type="button"
                            className="tracker-service-summary-note tracker-service-trigger"
                            onClick={() => setDescriptionJob(job)}
                          >
                            View description
                          </button>
                        </span>
                      </div>
                    </div>
                    <div className="tracker-cell-stack tracker-cell-stack--worker">
                      {job.workers.length ? (
                        job.workers.map((worker) => (
                          <span key={worker.id} className={`tracker-worker-pill ${getWorkerAccentClass(worker)}`}>
                            {worker.name}
                          </span>
                        ))
                      ) : (
                        <span className="tracker-empty-mark">-</span>
                      )}
                    </div>
                    <span>{formatMoney(job.materialCost)}</span>
                    <span>
                      {job.files.receipt[0] ? (
                        <button
                          type="button"
                          className="tracker-receipt-trigger"
                          onClick={() => setReceiptPreview({ job, file: job.files.receipt[0] })}
                        >
                          {job.files.receipt[0].name}
                        </button>
                      ) : (
                        <span className="tracker-empty-mark">-</span>
                      )}
                    </span>
                    <span>{formatMoney(job.laborCost)}</span>
                    <div className="tracker-timeline-cell">
                      <div className="tracker-timeline-top">
                        <span className="tracker-date-range">{dateRangeFor(job)}</span>
                        {canManage && job.status !== 'DONE' ? (
                          <button
                            type="button"
                            className={`pill tone-${timelineVisual.tone} tracker-pill-button`}
                            onClick={() => onWorkStatusAction(job)}
                          >
                            {timelineVisual.badge}
                          </button>
                        ) : (
                          <span className={`pill tone-${timelineVisual.tone}`}>{timelineVisual.badge}</span>
                        )}
                      </div>
                      <div className="tracker-timeline-bar">
                        <div
                          className={`tracker-timeline-fill tracker-timeline-fill--${timelineVisual.tone}`}
                          style={{ width: `${timelineVisual.progress}%` }}
                        />
                      </div>
                      <small>{timelineVisual.caption}</small>
                    </div>
                    <div className="tracker-media-actions">
                      {job.files.before[0] || job.files.after[0] ? (
                        <button
                          type="button"
                          className="tracker-media-button"
                          onClick={() => setMediaDialog({ mode: 'compare', job })}
                        >
                          <UiIcon name="image" size={14} />
                          Before / After
                        </button>
                      ) : null}

                      {job.files.progress.length ? (
                        <button
                          type="button"
                          className="tracker-media-button tracker-media-button--progress"
                          onClick={() => setMediaDialog({ mode: 'progress', job })}
                        >
                          <UiIcon name="camera" size={14} />
                          Progress {job.files.progress.length > 1 ? `(${job.files.progress.length})` : ''}
                        </button>
                      ) : null}

                      {!job.files.before[0] && !job.files.after[0] && !job.files.progress.length ? (
                        <span className="tracker-empty-mark">-</span>
                      ) : null}
                    </div>
                    <div className="tracker-status-cell">
                      {canManage && job.status !== 'DONE' ? (
                        <button
                          type="button"
                          className={`pill tone-${statusToneFor(job)} tracker-pill-button`}
                          onClick={() => onWorkStatusAction(job)}
                        >
                          {job.statusLabel}
                        </button>
                      ) : (
                        <span className={`pill tone-${statusToneFor(job)}`}>{job.statusLabel}</span>
                      )}
                    </div>
                    <span>
                      <span className={`pill tone-${invoiceToneFor(job)}`}>{job.invoiceStatusLabel}</span>
                    </span>
                    <div className="tracker-payment-cell">
                      {canManage && job.paymentStatus !== 'PAID' ? (
                        <button
                          type="button"
                          className={`pill tone-${paymentToneFor(job)} tracker-pill-button`}
                          onClick={() => onPaymentStatusAction(job)}
                        >
                          {job.paymentStatusLabel}
                        </button>
                      ) : (
                        <span className={`pill tone-${paymentToneFor(job)}`}>{job.paymentStatusLabel}</span>
                      )}
                      {job.advanceCashApp > 0 ? (
                        <small className="tracker-payment-advance">
                          Advance Cash App: {formatMoney(job.advanceCashApp)}
                        </small>
                      ) : null}
                    </div>
                    <div className="tracker-actions-cell">
                      {canManage ? (
                        <div className="tracker-row-tools tracker-row-tools--actions">
                          <button
                            type="button"
                            className="ghost-button tracker-mini-button"
                            onClick={() => onEdit(job)}
                          >
                            <UiIcon name="file" size={13} />
                            Edit
                          </button>
                          <button
                            type="button"
                            className="records-danger-button records-action-button tracker-mini-button"
                            onClick={() => onDelete(job.id)}
                          >
                            <UiIcon name="trash" size={13} />
                            Delete
                          </button>
                        </div>
                      ) : (
                        <span className="tracker-empty-mark">-</span>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="empty-box">No jobs match the active filters.</div>
            )}
          </div>
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
      <TrackerDescriptionDialog
        key={descriptionJob ? `tracker-description-${descriptionJob.id}` : 'tracker-description-closed'}
        job={descriptionJob}
        onClose={() => setDescriptionJob(null)}
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

function TrackerDescriptionDialog({
  job,
  onClose,
}: {
  job: JobRow | null;
  onClose: () => void;
}) {
  if (!job) return null;

  const locationLabel = [job.propertyName, formatStoryDisplayLabel(job.story), job.unit, job.area]
    .filter(Boolean)
    .join(' | ');
  const descriptionLines = splitDescriptionLines(job.description);

  return (
    <div className="tracker-media-dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="tracker-media-dialog-card tracker-media-dialog-card--description"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tracker-description-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="tracker-media-dialog-head">
          <div>
            <p className="eyebrow">Service description</p>
            <h2 id="tracker-description-dialog-title">{formatAreaServiceLabel(job.area, job.service)}</h2>
            <p className="tracker-media-dialog-copy">{locationLabel}</p>
          </div>

          <button type="button" className="ghost-button" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="tracker-media-dialog-body tracker-description-dialog-body">
          <div className="tracker-description-meta-grid">
            <article className="tracker-description-meta-card">
              <span>Property</span>
              <strong>{job.propertyName}</strong>
            </article>
            <article className="tracker-description-meta-card">
              <span>Floor / Unit</span>
              <strong>
                {[formatStoryDisplayLabel(job.story), job.unit].filter(Boolean).join(' / ') || 'Whole property'}
              </strong>
            </article>
            <article className="tracker-description-meta-card">
              <span>Area</span>
              <strong>{job.area || '-'}</strong>
            </article>
          </div>

          <div className="tracker-description-sheet">
            {descriptionLines.length ? (
              descriptionLines.map((line, index) => (
                <p key={`${job.id}-description-line-${index}`}>{line}</p>
              ))
            ) : (
              <div className="tracker-description-empty">
                <strong>No description yet</strong>
                <span>This service does not have a description saved yet.</span>
              </div>
            )}
          </div>
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
  const compareAspectRatio = Math.min(
    Math.max(
      availableAspectRatios.length ? Math.min(...availableAspectRatios) : 1,
      0.7,
    ),
    1.8,
  );
  const compareStageDisplayAspectRatio = Math.max(compareAspectRatio, 1.25);
  const compareStageMaxWidth = `${Math.round(860 * compareStageDisplayAspectRatio)}px`;
  const beforeCompareImageStyle = getTrackerCompareImageStyle(beforePhoto.dimensions);
  const afterCompareImageStyle = getTrackerCompareImageStyle(afterPhoto.dimensions);
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
