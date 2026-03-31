import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AdvanceCashAlert } from '../lib/advanceCashAlerts';
import { formatMoney } from '../lib/format';
import { formatAreaServiceLabel, formatStoryDisplayLabel } from '../lib/jobLocation';
import { UiIcon } from './UiIcon';

const advanceCashPriorityLabel = (alert: AdvanceCashAlert) => {
  if (alert.priority === 'overdue') {
    const days = Math.abs(alert.daysDelta ?? 0);
    return `${days} day${days === 1 ? '' : 's'} overdue`;
  }

  if (alert.priority === 'today') {
    return 'Due today';
  }

  if (alert.priority === 'upcoming') {
    const days = alert.daysDelta ?? 0;
    return `Due in ${days} day${days === 1 ? '' : 's'}`;
  }

  return 'Missing due date';
};

const formatAdvanceCashDueDate = (value: string | null) => {
  if (!value) return 'No due date';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No due date';

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
};

export function AdvanceCashAlertsBell({
  alerts,
  onOpenJob,
}: {
  alerts: AdvanceCashAlert[];
  onOpenJob: (jobId: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [panelStyle, setPanelStyle] = useState({ top: 0, left: 0, width: 460 });
  const overdueCount = alerts.filter((alert) => alert.priority === 'overdue').length;
  const totalAmount = alerts.reduce((sum, alert) => sum + alert.advanceCashApp, 0);
  const headlineAlert = alerts[0] ?? null;
  const headlineTone = headlineAlert?.priority ?? 'upcoming';

  useEffect(() => {
    if (!isOpen) return undefined;

    const updatePanelPosition = () => {
      if (!buttonRef.current) return;

      const rect = buttonRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const width = Math.min(460, Math.max(320, viewportWidth - 28));
      const left = Math.min(
        Math.max(14, rect.right - width),
        Math.max(14, viewportWidth - width - 14),
      );
      const estimatedPanelHeight = panelRef.current?.offsetHeight ?? 520;
      const preferredTop = rect.bottom + 12;
      const top =
        preferredTop + estimatedPanelHeight > viewportHeight - 14
          ? Math.max(14, rect.top - estimatedPanelHeight - 12)
          : preferredTop;

      setPanelStyle({
        top,
        left,
        width,
      });
    };

    updatePanelPosition();

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        rootRef.current &&
        !rootRef.current.contains(target) &&
        panelRef.current &&
        !panelRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', updatePanelPosition);
    window.addEventListener('scroll', updatePanelPosition, true);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', updatePanelPosition);
      window.removeEventListener('scroll', updatePanelPosition, true);
    };
  }, [isOpen]);

  const bellWidget = (
    <div
      ref={rootRef}
      className={`advance-cash-bell advance-cash-bell--floating ${
        alerts.length ? 'has-alerts' : ''
      } ${overdueCount ? 'has-overdue' : ''} ${isOpen ? 'is-open' : ''}`.trim()}
    >
      <button
        ref={buttonRef}
        type="button"
        className={`advance-cash-bell-button ${
          alerts.length ? 'has-alerts' : ''
        } ${overdueCount ? 'has-overdue' : ''}`.trim()}
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        <span className="advance-cash-bell-icon">
          <UiIcon name="bell" size={18} />
        </span>
        <span className="advance-cash-bell-copy">
          <strong>Advance Cash App</strong>
          <small>
            {alerts.length
              ? `${overdueCount ? `${overdueCount} overdue` : `${alerts.length} pending`} follow-up${alerts.length === 1 ? '' : 's'}`
              : 'No pending follow-ups'}
          </small>
        </span>
        <span className={`advance-cash-bell-badge ${alerts.length ? 'is-visible' : ''}`.trim()}>
          {alerts.length}
        </span>
      </button>

      {isOpen && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={panelRef}
              className="advance-cash-panel"
              role="dialog"
              aria-label="Advance Cash App alerts"
              style={{
                top: `${panelStyle.top}px`,
                left: `${panelStyle.left}px`,
                width: `${panelStyle.width}px`,
              }}
            >
              <div className="advance-cash-panel-hero">
                <div className="advance-cash-panel-hero-head">
                  <div className="advance-cash-panel-hero-title">
                    <p className="eyebrow">Advance Cash App</p>
                    <h3>Payment watchlist</h3>
                  </div>
                  <span
                    className={`pill advance-cash-priority-pill advance-cash-priority-pill--${headlineTone}`}
                  >
                    {headlineAlert ? advanceCashPriorityLabel(headlineAlert) : 'All clear'}
                  </span>
                </div>

                <div className="advance-cash-panel-hero-metrics">
                  <span className="advance-cash-panel-metric">
                    <strong>{overdueCount}</strong>
                    <small>overdue</small>
                  </span>
                  <span className="advance-cash-panel-metric">
                    <strong>{alerts.length}</strong>
                    <small>alerts</small>
                  </span>
                  <span className="advance-cash-panel-metric advance-cash-panel-metric--money">
                    <strong>{formatMoney(totalAmount)}</strong>
                    <small>pending</small>
                  </span>
                </div>

                {headlineAlert ? (
                  <div className="advance-cash-panel-focus">
                    <strong>{formatAreaServiceLabel(headlineAlert.area, headlineAlert.service)}</strong>
                    <span>{headlineAlert.propertyName}</span>
                  </div>
                ) : null}
              </div>

              <div className="advance-cash-panel-list">
                {alerts.length ? (
                  alerts.map((alert) => (
                    <article
                      key={alert.id}
                      className={`advance-cash-card advance-cash-card--${alert.priority}`.trim()}
                    >
                      <div className="advance-cash-card-head">
                        <div>
                          <strong>{formatAreaServiceLabel(alert.area, alert.service)}</strong>
                          <p>{alert.propertyName}</p>
                        </div>
                        <span
                          className={`pill advance-cash-priority-pill advance-cash-priority-pill--${alert.priority}`}
                        >
                          {advanceCashPriorityLabel(alert)}
                        </span>
                      </div>

                      <div className="advance-cash-card-meta">
                        <span>
                          {[formatStoryDisplayLabel(alert.story), alert.unit].filter(Boolean).join(' / ') ||
                            'Whole property'}
                        </span>
                        <span>{formatAdvanceCashDueDate(alert.dueDate)}</span>
                        <span>{formatMoney(alert.advanceCashApp)}</span>
                      </div>

                      <button
                        type="button"
                        className="ghost-button advance-cash-card-button"
                        onClick={() => {
                          setIsOpen(false);
                          onOpenJob(alert.jobId);
                        }}
                      >
                        <UiIcon name="clipboard" size={15} />
                        Open job
                      </button>
                    </article>
                  ))
                ) : (
                  <div className="advance-cash-empty">
                    <strong>Everything is under control</strong>
                    <span>No partial payments with Advance Cash App are waiting for follow-up.</span>
                  </div>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );

  if (typeof document === 'undefined') {
    return bellWidget;
  }

  return createPortal(bellWidget, document.body);
}
