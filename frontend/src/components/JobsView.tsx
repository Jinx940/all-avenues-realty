import type { FormEvent } from 'react';
import { buildAssetUrl } from '../lib/api';
import { toStoryFieldValue, toUnitFieldValue } from '../lib/jobLocation';
import { getWorkerAccentClass } from '../lib/workerVisuals';
import type { BootstrapPayload, JobFileField, JobFileMap, WorkerSummary } from '../types';
import { UiIcon, type UiIconName } from './UiIcon';

export type JobFormState = {
  id: string | null;
  propertyId: string;
  story: string;
  unit: string;
  section: string;
  area: string;
  service: string;
  description: string;
  materialCost: string;
  laborCost: string;
  status: string;
  invoiceStatus: string;
  paymentStatus: string;
  advanceCashApp: string;
  startDate: string;
  dueDate: string;
  workerIds: string[];
  files: Record<JobFileField, File[]>;
  currentFiles: JobFileMap;
};

const visibleFileFields: JobFileField[] = ['before', 'progress', 'after', 'receipt'];

const fileLabels: Record<JobFileField, string> = {
  before: 'Before',
  progress: 'Progress Pic',
  after: 'After',
  receipt: 'Receipt',
  invoice: 'Invoice',
  quote: 'Quote',
};

const fileIcons: Record<JobFileField, 'camera' | 'receipt' | 'file'> = {
  before: 'camera',
  progress: 'camera',
  after: 'camera',
  receipt: 'receipt',
  invoice: 'file',
  quote: 'file',
};

const allFileFields: JobFileField[] = ['before', 'progress', 'after', 'receipt', 'invoice', 'quote'];

const compactLocationLabel = (value: string, prefix: 'story' | 'unit') =>
  (prefix === 'story' ? toStoryFieldValue(value) : toUnitFieldValue(value)).trim().toLowerCase();

export function JobsView({
  bootstrap,
  workers,
  form,
  isSaving,
  canAssignWorkers,
  onSubmit,
  onReset,
  onFieldChange,
  onFilesChange,
  onDeleteCurrentFile,
  onToggleWorker,
}: {
  bootstrap: BootstrapPayload | null;
  workers: WorkerSummary[];
  form: JobFormState;
  isSaving: boolean;
  canAssignWorkers: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onReset: () => void;
  onFieldChange: (field: keyof Omit<JobFormState, 'id' | 'workerIds' | 'files' | 'currentFiles'>, value: string) => void;
  onFilesChange: (field: JobFileField, files: File[]) => void;
  onDeleteCurrentFile: (jobId: string, fileId: string) => void;
  onToggleWorker: (workerId: string) => void;
}) {
  const hasCurrentFiles = allFileFields.some((field) => form.currentFiles[field].length > 0);
  const showAdvanceCashApp = form.paymentStatus === 'PARTIAL_PAYMENT';
  const selectedProperty = bootstrap?.properties.find((property) => property.id === form.propertyId) ?? null;
  const storyOptions = selectedProperty?.stories ?? [];
  const selectedStory =
    storyOptions.find(
      (story) => compactLocationLabel(story.label, 'story') === compactLocationLabel(form.story, 'story'),
    ) ?? null;
  const unitOptions = selectedStory?.units ?? [];
  const storySuggestions = storyOptions.map((story) => compactLocationLabel(story.label, 'story')).filter(Boolean);
  const unitSuggestions = unitOptions.map((unit) => compactLocationLabel(unit.label, 'unit')).filter(Boolean);
  const storyFieldListId = selectedProperty ? `job-story-suggestions-${selectedProperty.id}` : 'job-story-suggestions';
  const unitFieldListId = selectedProperty ? `job-unit-suggestions-${selectedProperty.id}` : 'job-unit-suggestions';
  const hasUploadedFiles =
    visibleFileFields.some((field) => form.files[field].length > 0) || hasCurrentFiles;
  const stepCards: Array<{
    number: string;
    title: string;
    description: string;
    icon: UiIconName;
    complete: boolean;
  }> = [
    {
      number: '01',
      title: 'Location',
      description: 'Property, floor, unit, area and service.',
      icon: 'home',
      complete: Boolean(form.propertyId && form.area.trim() && form.service.trim()),
    },
    {
      number: '02',
      title: 'Details',
      description: 'Description and job costs.',
      icon: 'clipboard',
      complete: Boolean(
        form.description.trim() ||
          Number.parseFloat(form.materialCost || '0') > 0 ||
          Number.parseFloat(form.laborCost || '0') > 0,
      ),
    },
    {
      number: '03',
      title: 'Timeline',
      description: 'Dates and status flow.',
      icon: 'calendar',
      complete: Boolean(form.startDate && form.status && form.invoiceStatus && form.paymentStatus),
    },
    {
      number: '04',
      title: 'Workers',
      description: canAssignWorkers ? 'Assign the crew.' : 'Assigned to your worker profile.',
      icon: 'users',
      complete: form.workerIds.length > 0,
    },
    {
      number: '05',
      title: 'Files',
      description: 'Before, progress, after and receipt.',
      icon: 'folder',
      complete: hasUploadedFiles,
    },
  ];

  return (
    <section className="tab-panel">
      <div className="panel form-panel job-form-panel">
        <div className="job-form-head">
          <div className="job-form-copy">
            <p className="page-kicker">New Job</p>
            <h2 className="title-with-icon">
              <UiIcon name="clipboard" />
              <span>Job Form</span>
            </h2>
            <p>Create or edit a job and save it with workers, dates, payment status and supporting files.</p>
          </div>
          {form.id ? (
            <button type="button" className="ghost-button" onClick={onReset}>
              <UiIcon name="refresh" />
              Cancel edit
            </button>
          ) : null}
        </div>

        <form className="job-form-grid" onSubmit={onSubmit}>
          <div className="job-form-steps-overview span-3">
            {stepCards.map((step) => (
              <div key={step.number} className={`job-form-step-chip ${step.complete ? 'is-complete' : ''}`}>
                <span className="job-form-step-chip-badge">{step.number}</span>
                <div className="job-form-step-chip-copy">
                  <small>Step {step.number}</small>
                  <strong>{step.title}</strong>
                  <span>{step.description}</span>
                </div>
                <span className="job-form-step-chip-icon">
                  <UiIcon name={step.icon} size={16} />
                </span>
              </div>
            ))}
          </div>

          <section className="job-form-step span-3">
            <div className="job-form-step-head">
              <div className="job-form-step-title-wrap">
                <span className="job-form-step-number">01</span>
                <div>
                  <p className="page-kicker">Step 01</p>
                  <h3 className="title-with-icon title-with-icon--sm">
                    <UiIcon name="home" />
                    <span>Property and service</span>
                  </h3>
                  <p>Start by choosing where the job happens, the area, and what service will be performed.</p>
                </div>
              </div>
              <span
                className={`pill ${
                  form.propertyId && form.area.trim() && form.service.trim() ? 'tone-success' : 'tone-neutral'
                }`}
              >
                {form.propertyId && form.area.trim() && form.service.trim() ? 'Ready' : 'Pending'}
              </span>
            </div>

            <div className="job-form-step-grid">
              <div className="job-form-primary-grid span-3">
                <label>
                  Property *
                  <select value={form.propertyId} onChange={(event) => onFieldChange('propertyId', event.target.value)} required>
                    <option value="">
                      {bootstrap?.properties.length ? 'Select a property' : 'No assigned properties'}
                    </option>
                    {bootstrap?.properties.map((property) => (
                      <option key={property.id} value={property.id}>
                        {property.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Floor
                  <input
                    value={form.story}
                    onChange={(event) => onFieldChange('story', event.target.value)}
                    placeholder="1"
                    inputMode="numeric"
                    list={storySuggestions.length ? storyFieldListId : undefined}
                  />
                  {storySuggestions.length ? (
                    <datalist id={storyFieldListId}>
                      {storySuggestions.map((storyValue) => (
                        <option key={storyValue} value={storyValue} />
                      ))}
                    </datalist>
                  ) : null}
                </label>

                <label>
                  Unit
                  <input
                    value={form.unit}
                    onChange={(event) => onFieldChange('unit', event.target.value)}
                    placeholder="1"
                    inputMode="numeric"
                    list={unitSuggestions.length ? unitFieldListId : undefined}
                  />
                  {unitSuggestions.length ? (
                    <datalist id={unitFieldListId}>
                      {unitSuggestions.map((unitValue) => (
                        <option key={unitValue} value={unitValue} />
                      ))}
                    </datalist>
                  ) : null}
                </label>
              </div>

              <div className="job-form-secondary-grid span-3">
                <label>
                  Area *
                  <input
                    value={form.area}
                    onChange={(event) => onFieldChange('area', event.target.value)}
                    placeholder="Kitchen, Bathroom, Hallway..."
                    required
                  />
                </label>

                <label>
                  Service *
                  <input value={form.service} onChange={(event) => onFieldChange('service', event.target.value)} required />
                </label>
              </div>
            </div>
          </section>

          <section className="job-form-step span-3">
            <div className="job-form-step-head">
              <div className="job-form-step-title-wrap">
                <span className="job-form-step-number">02</span>
                <div>
                  <p className="page-kicker">Step 02</p>
                  <h3 className="title-with-icon title-with-icon--sm">
                    <UiIcon name="clipboard" />
                    <span>Job details</span>
                  </h3>
                  <p>Add the description and the cost baseline for this work.</p>
                </div>
              </div>
            </div>

            <div className="job-form-step-grid">
              <label className="span-3">
                Description
                <textarea rows={5} value={form.description} onChange={(event) => onFieldChange('description', event.target.value)} />
              </label>

              <label>
                Material cost per unit ($)
                <input type="number" min="0" step="0.01" value={form.materialCost} onChange={(event) => onFieldChange('materialCost', event.target.value)} />
              </label>

              <label>
                Labor ($)
                <input type="number" min="0" step="0.01" value={form.laborCost} onChange={(event) => onFieldChange('laborCost', event.target.value)} />
              </label>
            </div>
          </section>

          <section className="job-form-step span-3">
            <div className="job-form-step-head">
              <div className="job-form-step-title-wrap">
                <span className="job-form-step-number">03</span>
                <div>
                  <p className="page-kicker">Step 03</p>
                  <h3 className="title-with-icon title-with-icon--sm">
                    <UiIcon name="calendar" />
                    <span>Timeline and status</span>
                  </h3>
                  <p>Define dates, work progress, invoice state and payment flow.</p>
                </div>
              </div>
            </div>

            <div className="job-form-step-grid">
              <label>
                Start Date
                <input type="date" value={form.startDate} onChange={(event) => onFieldChange('startDate', event.target.value)} />
              </label>

              <label>
                Due Date
                <input type="date" value={form.dueDate} onChange={(event) => onFieldChange('dueDate', event.target.value)} />
              </label>

              <label>
                Work Status
                <select value={form.status} onChange={(event) => onFieldChange('status', event.target.value)}>
                  <option value="">Select a status</option>
                  {bootstrap?.statuses.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Invoice Status
                <select value={form.invoiceStatus} onChange={(event) => onFieldChange('invoiceStatus', event.target.value)}>
                  <option value="">Select invoice status</option>
                  {bootstrap?.invoiceStatuses.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Payment Status
                <select value={form.paymentStatus} onChange={(event) => onFieldChange('paymentStatus', event.target.value)}>
                  <option value="">Select a payment status</option>
                  {bootstrap?.paymentStatuses.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </label>

              {showAdvanceCashApp ? (
                <label>
                  Advance Cash App ($)
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={form.advanceCashApp}
                    onChange={(event) => onFieldChange('advanceCashApp', event.target.value)}
                    placeholder="0.00"
                    required
                  />
                </label>
              ) : null}
            </div>
          </section>

          <section className="job-form-step span-3">
            <div className="job-form-step-head">
              <div className="job-form-step-title-wrap">
                <span className="job-form-step-number">04</span>
                <div>
                  <p className="page-kicker">Step 04</p>
                  <h3 className="title-with-icon title-with-icon--sm">
                    <UiIcon name="users" />
                    <span>{canAssignWorkers ? 'Assign workers' : 'Assigned worker'}</span>
                  </h3>
                  <p>
                    {canAssignWorkers
                      ? 'Choose the crew that will work on this job.'
                      : 'Jobs you create here are assigned to your worker profile.'}
                  </p>
                </div>
              </div>
            </div>

            <div className="job-workers-field">
              <div className="job-workers-copy">
                <span className="field-label">Workers</span>
                <small className="job-workers-count">
                  {form.workerIds.length
                    ? `${form.workerIds.length} worker(s) selected`
                    : canAssignWorkers
                      ? 'Select one or more workers'
                      : 'Your worker profile will be selected automatically'}
                </small>
              </div>

              <div className="job-workers-list">
                {workers.length ? (
                  workers.map((worker) => {
                    const checked = form.workerIds.includes(worker.id);

                    return (
                      <label
                        key={worker.id}
                        className={`worker-chip job-worker-chip ${getWorkerAccentClass(worker)} ${checked ? 'is-selected' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!canAssignWorkers}
                          onChange={() => onToggleWorker(worker.id)}
                        />
                        <span>{worker.name}</span>
                      </label>
                    );
                  })
                ) : (
                  <div className="job-workers-empty">
                    {canAssignWorkers
                      ? 'No workers available yet.'
                      : 'Your user is not linked to an available worker profile.'}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="job-form-step span-3">
            <div className="job-form-step-head">
              <div className="job-form-step-title-wrap">
                <span className="job-form-step-number">05</span>
                <div>
                  <p className="page-kicker">Step 05</p>
                  <h3 className="title-with-icon title-with-icon--sm">
                    <UiIcon name="folder" />
                    <span>Files and evidence</span>
                  </h3>
                  <p>Upload support files, receipts and photo evidence for the job.</p>
                </div>
              </div>
            </div>

            <div className="job-form-step-grid">
              <div className="span-3 job-file-grid">
                {visibleFileFields.map((field) => (
                  <label key={field} className="file-card">
                    <span className="field-label-inline">
                      <UiIcon name={fileIcons[field]} size={15} />
                      <span>{fileLabels[field]}</span>
                    </span>
                    <input type="file" multiple onChange={(event) => onFilesChange(field, Array.from(event.target.files ?? []))} />
                    <small>{form.files[field].length ? `${form.files[field].length} file(s) selected` : 'No files selected'}</small>
                  </label>
                ))}
              </div>

              {form.id && hasCurrentFiles ? (
                <div className="span-3 current-files-shell">
                  <div className="panel-head">
                    <div>
                      <p className="eyebrow">Current files</p>
                      <h3 className="title-with-icon title-with-icon--sm">
                        <UiIcon name="folder" />
                        <span>Attached documents and media</span>
                      </h3>
                      <p>Open, review or remove the files already linked to this job.</p>
                    </div>
                  </div>

                  <div className="current-files-grid">
                    {allFileFields.map((field) => (
                      <div key={field} className="current-file-group">
                        <strong className="field-label-inline">
                          <UiIcon name={fileIcons[field]} size={15} />
                          <span>{fileLabels[field]}</span>
                        </strong>

                        {form.currentFiles[field].length ? (
                          <div className="current-file-list">
                            {form.currentFiles[field].map((file) => (
                              <div key={file.id} className="current-file-row">
                                <a href={buildAssetUrl(file.url)} target="_blank" rel="noreferrer">
                                  {file.name}
                                </a>
                                <div className="current-file-actions">
                                  {file.documentNumber ? (
                                    <span className="pill tone-neutral">No. {file.documentNumber}</span>
                                  ) : null}
                                  <button
                                    type="button"
                                    className="records-danger-button records-action-button"
                                    onClick={() => onDeleteCurrentFile(form.id!, file.id)}
                                  >
                                    <UiIcon name="trash" size={14} />
                                    Delete
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <small>No files in this category.</small>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="actions-row span-3">
                <button type="submit" disabled={isSaving || !bootstrap?.properties.length}>
                  <UiIcon name="plus" />
                  {isSaving ? 'Saving...' : 'Save Job'}
                </button>
                <button type="button" className="ghost-button" onClick={onReset}>
                  <UiIcon name="refresh" />
                  Clear
                </button>
              </div>
            </div>
          </section>
        </form>
      </div>
    </section>
  );
}
