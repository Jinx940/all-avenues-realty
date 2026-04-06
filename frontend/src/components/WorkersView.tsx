import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { formatDate } from '../lib/format';
import { getWorkerAccentClass } from '../lib/workerVisuals';
import type { WorkerHistoryRow, WorkerSummary } from '../types';
import { UiIcon } from './UiIcon';

const actionToneFor = (action: string) => {
  const normalized = action.toLowerCase();
  if (normalized.includes('delete')) return 'tone-danger';
  if (normalized.includes('disable')) return 'tone-warning';
  if (normalized.includes('enable')) return 'tone-neutral';
  if (normalized.includes('add')) return 'tone-success';
  return 'tone-neutral';
};

const statusToneFor = (status: string | null) => {
  if (!status) return 'tone-neutral';
  return status.toLowerCase().includes('inactive') ? 'tone-warning' : 'tone-success';
};

export function WorkersView({
  activeWorkers,
  inactiveWorkers,
  availableUsernames,
  workerHistory,
  workerName,
  isSaving,
  onSubmit,
  onWorkerNameChange,
  onSetStatus,
  onDelete,
  onClearHistory,
}: {
  activeWorkers: WorkerSummary[];
  inactiveWorkers: WorkerSummary[];
  availableUsernames: string[];
  workerHistory: WorkerHistoryRow[];
  workerName: string;
  isSaving: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onWorkerNameChange: (value: string) => void;
  onSetStatus: (workerId: string, status: 'ACTIVE' | 'INACTIVE') => void;
  onDelete: (workerId: string) => void;
  onClearHistory: () => void;
}) {
  const [activeWorkerId, setActiveWorkerId] = useState('');
  const [inactiveWorkerId, setInactiveWorkerId] = useState('');
  const [deleteWorkerId, setDeleteWorkerId] = useState('');
  const [isUsernameMenuOpen, setIsUsernameMenuOpen] = useState(false);
  const [lookupMenuPosition, setLookupMenuPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const workerLookupRef = useRef<HTMLDivElement | null>(null);
  const workerLookupMenuRef = useRef<HTMLDivElement | null>(null);

  const allWorkers = useMemo(
    () => [...activeWorkers, ...inactiveWorkers].sort((left, right) => left.name.localeCompare(right.name)),
    [activeWorkers, inactiveWorkers],
  );
  const deletableWorkers = useMemo(
    () => allWorkers.filter((worker) => worker.canDelete),
    [allWorkers],
  );
  const selectedActiveWorkerId = activeWorkers.some((worker) => worker.id === activeWorkerId)
    ? activeWorkerId
    : activeWorkers[0]?.id ?? '';
  const selectedInactiveWorkerId = inactiveWorkers.some((worker) => worker.id === inactiveWorkerId)
    ? inactiveWorkerId
    : inactiveWorkers[0]?.id ?? '';
  const selectedDeleteWorkerId = deletableWorkers.some((worker) => worker.id === deleteWorkerId)
    ? deleteWorkerId
    : deletableWorkers[0]?.id ?? '';
  const filteredUsernames = useMemo(() => {
    const query = workerName.trim().toLowerCase();
    const source = query
      ? availableUsernames.filter((username) => username.toLowerCase().includes(query))
      : availableUsernames;

    return source.slice(0, 8);
  }, [availableUsernames, workerName]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        !workerLookupRef.current?.contains(target) &&
        !workerLookupMenuRef.current?.contains(target)
      ) {
        setIsUsernameMenuOpen(false);
        setLookupMenuPosition(null);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  useEffect(() => {
    if (!isUsernameMenuOpen) return;

    const updateMenuPosition = () => {
      const rect = workerLookupRef.current?.getBoundingClientRect();
      if (!rect) return;

      setLookupMenuPosition({
        top: rect.bottom + window.scrollY + 10,
        left: rect.left + window.scrollX,
        width: rect.width,
      });
    };

    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [isUsernameMenuOpen]);

  const lookupMenuContent =
    isUsernameMenuOpen && availableUsernames.length && lookupMenuPosition
      ? createPortal(
          <div
            ref={workerLookupMenuRef}
            className="worker-lookup-menu worker-lookup-menu--portal"
            style={{
              top: `${lookupMenuPosition.top}px`,
              left: `${lookupMenuPosition.left}px`,
              width: `${lookupMenuPosition.width}px`,
            }}
          >
            <div className="worker-lookup-menu-head">
              <span className="eyebrow">Available usernames</span>
            </div>

            <div className="worker-lookup-options">
              {filteredUsernames.length ? (
                filteredUsernames.map((username) => (
                  <button
                    key={username}
                    type="button"
                    className="worker-lookup-option"
                    onClick={() => {
                      onWorkerNameChange(username);
                      setIsUsernameMenuOpen(false);
                      setLookupMenuPosition(null);
                    }}
                  >
                    <strong>{username}</strong>
                    <span>Use username</span>
                  </button>
                ))
              ) : (
                <div className="worker-lookup-empty">No matching usernames.</div>
              )}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <section className="tab-panel">
      <div className="panel records-filter-panel workers-shell workers-shell--compact">
        <div className="workers-panel-head">
          <h2 className="title-with-icon">
            <UiIcon name="users" />
            <span>Workers</span>
          </h2>
        </div>

        <div className="workers-roster-strip">
          <span className="eyebrow">Worker colors</span>
          <div className="workers-roster-list">
            {allWorkers.length ? (
              allWorkers.map((worker) => (
                <span
                  key={`worker-roster-${worker.id}`}
                  className={`worker-color-badge ${getWorkerAccentClass(worker)} ${
                    worker.status === 'INACTIVE' ? 'is-inactive' : ''
                  }`}
                >
                  {worker.name}
                </span>
              ))
            ) : (
              <span className="workers-roster-empty">No workers registered yet.</span>
            )}
          </div>
        </div>

        <div className="workers-card-grid">
          <div className={`worker-control-card ${isUsernameMenuOpen ? 'is-lookup-open' : ''}`}>
            <div className="worker-control-card-head">
              <h3 className="title-with-icon title-with-icon--sm">
                <UiIcon name="userPlus" />
                <span>Add New Worker</span>
              </h3>
            </div>

            <form className="worker-action-form" onSubmit={onSubmit}>
              <label className="worker-lookup-field">
                <span>Worker Name / Username</span>
                <div
                  ref={workerLookupRef}
                  className={`worker-lookup ${isUsernameMenuOpen ? 'is-open' : ''}`}
                >
                  <div className="worker-lookup-input-wrap">
                    <UiIcon name="search" size={16} className="worker-lookup-icon" />
                    <input
                      value={workerName}
                      onChange={(event) => {
                        onWorkerNameChange(event.target.value);
                        setIsUsernameMenuOpen(true);
                      }}
                      onFocus={() => setIsUsernameMenuOpen(true)}
                      placeholder="Search username or enter worker name"
                      required
                    />
                    <button
                      type="button"
                      className="worker-lookup-toggle"
                      aria-label={isUsernameMenuOpen ? 'Close username list' : 'Open username list'}
                      onClick={() =>
                        setIsUsernameMenuOpen((current) => {
                          const next = !current;
                          if (!next) setLookupMenuPosition(null);
                          return next;
                        })
                      }
                    >
                      <span aria-hidden="true">{isUsernameMenuOpen ? '-' : 'v'}</span>
                    </button>
                  </div>

                </div>
              </label>
              <div>
                <button type="submit" className="worker-submit-button" disabled={isSaving}>
                  <UiIcon name="plus" />
                  {isSaving ? 'Saving...' : 'Add Worker'}
                </button>
              </div>
            </form>
          </div>

          <div className="worker-control-card">
            <div className="worker-control-card-head">
              <h3 className="title-with-icon title-with-icon--sm">
                <UiIcon name="userMinus" />
                <span>Active Workers</span>
              </h3>
            </div>

            <div className="worker-action-form">
              <label>
                Disable Worker
                <select
                  value={selectedActiveWorkerId}
                  onChange={(event) => setActiveWorkerId(event.target.value)}
                >
                  <option value="">Select active worker</option>
                  {activeWorkers.map((worker) => (
                    <option key={worker.id} value={worker.id}>
                      {worker.name}
                    </option>
                  ))}
                </select>
              </label>

              <div>
                <button
                  type="button"
                  className="worker-disable-button"
                  onClick={() =>
                    selectedActiveWorkerId && onSetStatus(selectedActiveWorkerId, 'INACTIVE')
                  }
                  disabled={!selectedActiveWorkerId}
                >
                  <UiIcon name="userMinus" />
                  Disable
                </button>
              </div>
            </div>
          </div>

          <div className="worker-control-card">
            <div className="worker-control-card-head">
              <h3 className="title-with-icon title-with-icon--sm">
                <UiIcon name="userCheck" />
                <span>Inactive Workers</span>
              </h3>
            </div>

            <div className="worker-action-form">
              <label>
                Enable Worker
                <select
                  value={selectedInactiveWorkerId}
                  onChange={(event) => setInactiveWorkerId(event.target.value)}
                >
                  <option value="">Select inactive worker</option>
                  {inactiveWorkers.map((worker) => (
                    <option key={worker.id} value={worker.id}>
                      {worker.name}
                    </option>
                  ))}
                </select>
              </label>

              <div>
                <button
                  type="button"
                  className="worker-enable-button"
                  onClick={() =>
                    selectedInactiveWorkerId && onSetStatus(selectedInactiveWorkerId, 'ACTIVE')
                  }
                  disabled={!selectedInactiveWorkerId}
                >
                  <UiIcon name="userCheck" />
                  Enable
                </button>
              </div>
            </div>
          </div>

          <div className="worker-control-card">
            <div className="worker-control-card-head">
              <h3 className="title-with-icon title-with-icon--sm">
                <UiIcon name="trash" />
                <span>Delete Worker</span>
              </h3>
            </div>

            <div className="worker-action-form">
              <label>
                Delete Permanently
                <select
                  value={selectedDeleteWorkerId}
                  onChange={(event) => setDeleteWorkerId(event.target.value)}
                >
                  <option value="">
                    {deletableWorkers.length ? 'Select worker' : 'No workers available to delete'}
                  </option>
                  {deletableWorkers.map((worker) => (
                    <option key={worker.id} value={worker.id}>
                      {worker.name}
                    </option>
                  ))}
                </select>
              </label>

              <div>
                <button
                  type="button"
                  className="worker-delete-button"
                  onClick={() => selectedDeleteWorkerId && onDelete(selectedDeleteWorkerId)}
                  disabled={!selectedDeleteWorkerId}
                >
                  <UiIcon name="trash" />
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>

        {lookupMenuContent}

        <div className="worker-history-card">
          <div className="worker-history-head">
            <div className="property-panel-title property-panel-title--compact worker-history-title">
              <h2 className="title-with-icon title-with-icon--sm">
                <UiIcon name="clipboard" />
                <span>Worker History</span>
              </h2>
            </div>

            <button
              type="button"
              className="worker-history-clear-button"
              onClick={onClearHistory}
              disabled={!workerHistory.length}
            >
              <UiIcon name="trash" />
              Clear history
            </button>
          </div>

          <div className="history-table worker-history-table">
            <div className="history-row header worker-history-row">
              <span>Date</span>
              <span>Worker</span>
              <span>Action</span>
              <span>Previous Status</span>
              <span>New Status</span>
              <span>Performed By</span>
              <span>Notes</span>
            </div>

            {workerHistory.length ? (
              workerHistory.map((entry) => (
                <div key={entry.id} className="history-row worker-history-row">
                  <span>{formatDate(entry.date)}</span>
                  <span>
                    <span className={`worker-color-badge worker-color-badge--compact ${getWorkerAccentClass(entry.worker)}`}>
                      {entry.worker}
                    </span>
                  </span>
                  <span>
                    <span className={`pill ${actionToneFor(entry.action)}`}>{entry.action}</span>
                  </span>
                  <span>
                    <span className={`pill ${statusToneFor(entry.previousStatus)}`}>{entry.previousStatus || '-'}</span>
                  </span>
                  <span>
                    <span className={`pill ${statusToneFor(entry.newStatus)}`}>{entry.newStatus || '-'}</span>
                  </span>
                  <span>{entry.performedBy}</span>
                  <span>{entry.notes || '-'}</span>
                </div>
              ))
            ) : (
              <div className="empty-box">No worker history yet.</div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

