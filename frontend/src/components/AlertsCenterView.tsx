import { useMemo, useState } from 'react';
import { formatMoney } from '../lib/format';
import { buildOperationsAlerts, type OperationsAlert } from '../lib/operationsAlerts';
import type { JobRow } from '../types';
import { UiIcon } from './UiIcon';

const alertKindLabels: Record<OperationsAlert['kind'], string> = {
  overdue: 'Overdue',
  'due-soon': 'Due Soon',
  payment: 'Payment',
  invoice: 'Invoice',
  photos: 'Photos',
  worker: 'Worker',
  schedule: 'Schedule',
};

export function AlertsCenterView({
  jobs,
  onOpenJob,
  onCreateInvoice,
  onOpenSchedule,
}: {
  jobs: JobRow[];
  onOpenJob: (job: JobRow) => void;
  onCreateInvoice: (job: JobRow) => void;
  onOpenSchedule: () => void;
}) {
  const [kind, setKind] = useState<'ALL' | OperationsAlert['kind']>('ALL');
  const [search, setSearch] = useState('');
  const alerts = useMemo(() => buildOperationsAlerts(jobs), [jobs]);
  const filteredAlerts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return alerts.filter((alert) => {
      if (kind !== 'ALL' && alert.kind !== kind) return false;
      if (!term) return true;
      return [alert.title, alert.detail, alert.metric, alert.job.propertyName, alert.job.service, alert.job.area]
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [alerts, kind, search]);
  const alertCounts = alerts.reduce(
    (counts, alert) => ({
      ...counts,
      [alert.kind]: (counts[alert.kind] ?? 0) + 1,
    }),
    {} as Record<OperationsAlert['kind'], number>,
  );
  const criticalCount = alerts.filter((alert) => alert.tone === 'danger').length;
  const financeExposure = jobs
    .filter((job) => job.paymentStatus === 'UNPAID' || job.paymentStatus === 'PARTIAL_PAYMENT')
    .reduce((sum, job) => sum + Math.max(job.totalCost - job.advanceCashApp, 0), 0);

  return (
    <section className="tab-panel alerts-center-shell">
      <div className="panel alerts-center-hero">
        <div>
          <p className="page-kicker">Alerts Center</p>
          <h2 className="title-with-icon">
            <UiIcon name="bell" />
            <span>Operations Watchlist</span>
          </h2>
          <p>One command center for delays, missing evidence, invoices and payment exposure.</p>
        </div>
        <div className="alerts-center-metrics">
          <span>
            <strong>{alerts.length}</strong>
            <small>alerts</small>
          </span>
          <span>
            <strong>{criticalCount}</strong>
            <small>critical</small>
          </span>
          <span>
            <strong>{formatMoney(financeExposure)}</strong>
            <small>exposure</small>
          </span>
        </div>
      </div>

      <div className="panel alerts-center-toolbar">
        <label>
          Search alerts
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Property, service, worker gap..." />
        </label>
        <div className="alerts-kind-grid">
          <button type="button" className={kind === 'ALL' ? 'is-active' : ''} onClick={() => setKind('ALL')}>
            All <span>{alerts.length}</span>
          </button>
          {(Object.keys(alertKindLabels) as Array<OperationsAlert['kind']>).map((alertKind) => (
            <button
              key={alertKind}
              type="button"
              className={kind === alertKind ? 'is-active' : ''}
              onClick={() => setKind(alertKind)}
            >
              {alertKindLabels[alertKind]} <span>{alertCounts[alertKind] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="alerts-list">
        {filteredAlerts.length ? (
          filteredAlerts.map((alert) => (
            <article key={alert.id} className={`alerts-row alerts-row--tone-${alert.tone}`}>
              <span className="alerts-row-icon">
                <UiIcon name={alert.icon} />
              </span>
              <div className="alerts-row-copy">
                <span className="eyebrow">{alertKindLabels[alert.kind]}</span>
                <strong>{alert.title}</strong>
                <p>{alert.detail}</p>
              </div>
              <span className={`pill tone-${alert.tone}`}>{alert.metric}</span>
              <div className="alerts-row-actions">
                {alert.kind === 'invoice' ? (
                  <button type="button" className="ghost-button" onClick={() => onCreateInvoice(alert.job)}>
                    <UiIcon name="receipt" />
                    Invoice
                  </button>
                ) : null}
                {alert.kind === 'schedule' || alert.kind === 'due-soon' || alert.kind === 'overdue' ? (
                  <button type="button" className="ghost-button" onClick={onOpenSchedule}>
                    <UiIcon name="calendar" />
                    Schedule
                  </button>
                ) : null}
                <button type="button" className="primary-action-button" onClick={() => onOpenJob(alert.job)}>
                  <UiIcon name="activity" />
                  Open job
                </button>
              </div>
            </article>
          ))
        ) : (
          <div className="empty-box">No matching alerts. The current filter is clear.</div>
        )}
      </div>
    </section>
  );
}
