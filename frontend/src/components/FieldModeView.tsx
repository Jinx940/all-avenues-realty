import { useMemo, useState, type FormEvent } from 'react';
import { formatDate, formatMoney } from '../lib/format';
import { formatAreaServiceLabel, formatStoryDisplayLabel } from '../lib/jobLocation';
import { paymentStatusTone, workStatusTone } from '../lib/statusVisuals';
import type { AuthUser, JobFileField, JobRow } from '../types';
import { UiIcon } from './UiIcon';

type FieldFileDraft = Pick<Record<JobFileField, File[]>, 'before' | 'progress' | 'after' | 'receipt'>;

const createFieldFileDraft = (): FieldFileDraft => ({
  before: [],
  progress: [],
  after: [],
  receipt: [],
});

const fieldFileLabels: Record<keyof FieldFileDraft, string> = {
  before: 'Before',
  progress: 'Progress',
  after: 'After',
  receipt: 'Receipt',
};

const fieldFileAccept: Record<keyof FieldFileDraft, string> = {
  before: 'image/*',
  progress: 'image/*',
  after: 'image/*',
  receipt: 'image/*,application/pdf',
};

const sortFieldJobs = (jobs: JobRow[]) =>
  [...jobs].sort((left, right) => {
    const leftDone = left.status === 'DONE' ? 1 : 0;
    const rightDone = right.status === 'DONE' ? 1 : 0;
    if (leftDone !== rightDone) return leftDone - rightDone;
    if (left.timeline.isLate !== right.timeline.isLate) return left.timeline.isLate ? -1 : 1;
    const leftDate = new Date(left.dueDate ?? left.startDate ?? left.createdAt).getTime();
    const rightDate = new Date(right.dueDate ?? right.startDate ?? right.createdAt).getTime();
    return leftDate - rightDate;
  });

const fileCountLabel = (files: File[]) =>
  files.length ? `${files.length} file${files.length === 1 ? '' : 's'} selected` : 'No file selected';

export function FieldModeView({
  jobs,
  currentUser,
  isSaving,
  onSubmitUpdate,
  onOpenJob,
}: {
  jobs: JobRow[];
  currentUser: AuthUser;
  isSaving: boolean;
  onSubmitUpdate: (job: JobRow, formData: FormData) => Promise<void>;
  onOpenJob: (job: JobRow) => void;
}) {
  const sortedJobs = useMemo(() => sortFieldJobs(jobs), [jobs]);
  const openJobs = sortedJobs.filter((job) => job.status !== 'DONE');
  const overdueJobs = openJobs.filter((job) => job.timeline.isLate);
  const readyForPhotos = openJobs.filter((job) => !job.files.before.length || !job.files.after.length);
  const [selectedJobId, setSelectedJobId] = useState(() => sortedJobs[0]?.id ?? '');
  const selectedJob = sortedJobs.find((job) => job.id === selectedJobId) ?? sortedJobs[0] ?? null;
  const [nextStatus, setNextStatus] = useState('IN_PROGRESS');
  const [fieldNote, setFieldNote] = useState('');
  const [files, setFiles] = useState<FieldFileDraft>(createFieldFileDraft);

  const resetDraft = () => {
    setNextStatus('IN_PROGRESS');
    setFieldNote('');
    setFiles(createFieldFileDraft());
  };

  const submitFieldUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedJob) return;

    const formData = new FormData();
    formData.append('status', nextStatus);
    formData.append('fieldNote', fieldNote);
    (Object.keys(files) as Array<keyof FieldFileDraft>).forEach((field) => {
      files[field].forEach((file) => formData.append(field, file));
    });

    await onSubmitUpdate(selectedJob, formData);
    resetDraft();
  };

  return (
    <section className="tab-panel field-mode-shell">
      <div className="field-mode-hero panel">
        <div>
          <p className="page-kicker">Field Mode</p>
          <h2 className="title-with-icon">
            <UiIcon name="camera" />
            <span>Mobile Work Queue</span>
          </h2>
          <p>
            Fast job updates for the field: review assignments, capture evidence and move work
            forward from a phone.
          </p>
        </div>
        <div className="field-mode-stats">
          <span>
            <strong>{openJobs.length}</strong>
            <small>open</small>
          </span>
          <span>
            <strong>{overdueJobs.length}</strong>
            <small>overdue</small>
          </span>
          <span>
            <strong>{readyForPhotos.length}</strong>
            <small>need photos</small>
          </span>
        </div>
      </div>

      <div className="field-mode-grid">
        <div className="panel field-job-list-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">{currentUser.role === 'WORKER' ? 'My assignments' : 'Crew assignments'}</p>
              <h3 className="title-with-icon title-with-icon--sm">
                <UiIcon name="briefcase" />
                <span>Jobs</span>
              </h3>
            </div>
          </div>

          <div className="field-job-list">
            {sortedJobs.length ? (
              sortedJobs.map((job) => (
                <button
                  key={job.id}
                  type="button"
                  className={`field-job-button ${selectedJob?.id === job.id ? 'is-active' : ''}`}
                  onClick={() => {
                    setSelectedJobId(job.id);
                    setNextStatus(job.status === 'DONE' ? 'DONE' : 'IN_PROGRESS');
                    setFieldNote('');
                    setFiles(createFieldFileDraft());
                  }}
                >
                  <span className={`field-job-status-dot tone-${workStatusTone(job.statusLabel || job.status)}`} />
                  <span className="field-job-button-copy">
                    <strong>{formatAreaServiceLabel(job.area, job.service)}</strong>
                    <small>{job.propertyName}</small>
                    <em>{[formatStoryDisplayLabel(job.story), job.unit].filter(Boolean).join(' / ') || 'Whole property'}</em>
                  </span>
                  <span className={`pill tone-${job.timeline.tone}`}>{job.timeline.label}</span>
                </button>
              ))
            ) : (
              <div className="empty-box">No field jobs are assigned right now.</div>
            )}
          </div>
        </div>

        <div className="panel field-update-panel">
          {selectedJob ? (
            <>
              <div className="field-update-head">
                <div>
                  <p className="eyebrow">Selected job</p>
                  <h3>{formatAreaServiceLabel(selectedJob.area, selectedJob.service)}</h3>
                  <p>{selectedJob.propertyName}</p>
                </div>
                <button type="button" className="ghost-button" onClick={() => onOpenJob(selectedJob)}>
                  <UiIcon name="activity" />
                  Open tracker
                </button>
              </div>

              <div className="field-job-summary-grid">
                <span>
                  <small>Work</small>
                  <strong className={`pill tone-${workStatusTone(selectedJob.statusLabel || selectedJob.status)}`}>
                    {selectedJob.statusLabel}
                  </strong>
                </span>
                <span>
                  <small>Payment</small>
                  <strong className={`pill tone-${paymentStatusTone(selectedJob.paymentStatusLabel || selectedJob.paymentStatus)}`}>
                    {selectedJob.paymentStatusLabel}
                  </strong>
                </span>
                <span>
                  <small>Due</small>
                  <strong>{formatDate(selectedJob.dueDate)}</strong>
                </span>
                <span>
                  <small>Total</small>
                  <strong>{formatMoney(selectedJob.totalCost)}</strong>
                </span>
              </div>

              <form className="field-update-form" onSubmit={submitFieldUpdate}>
                <label>
                  Next status
                  <select value={nextStatus} onChange={(event) => setNextStatus(event.target.value)}>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="DONE">Done</option>
                    <option value="PENDING">Pending</option>
                    <option value="PLANNING">Planning</option>
                  </select>
                </label>

                <label>
                  Field note
                  <textarea
                    rows={4}
                    value={fieldNote}
                    onChange={(event) => setFieldNote(event.target.value)}
                    placeholder="Add a short update for the office."
                  />
                </label>

                <div className="field-mode-upload-grid">
                  {(Object.keys(fieldFileLabels) as Array<keyof FieldFileDraft>).map((field) => (
                    <label key={field} className="field-mode-upload-tile">
                      <input
                        type="file"
                        accept={fieldFileAccept[field]}
                        multiple
                        capture={field === 'receipt' ? undefined : 'environment'}
                        onChange={(event) =>
                          setFiles((current) => ({
                            ...current,
                            [field]: Array.from(event.target.files ?? []),
                          }))
                        }
                      />
                      <span>
                        <UiIcon name={field === 'receipt' ? 'receipt' : 'camera'} />
                      </span>
                      <strong>{fieldFileLabels[field]}</strong>
                      <small>{fileCountLabel(files[field])}</small>
                    </label>
                  ))}
                </div>

                <div className="field-update-actions">
                  <button type="button" className="ghost-button" onClick={resetDraft} disabled={isSaving}>
                    <UiIcon name="refresh" />
                    Reset
                  </button>
                  <button type="submit" className="primary-action-button" disabled={isSaving}>
                    <UiIcon name="camera" />
                    {isSaving ? 'Saving...' : 'Save field update'}
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="empty-box">Select a job to send a field update.</div>
          )}
        </div>
      </div>
    </section>
  );
}
