import { useMemo, useState } from 'react';
import { formatDate, formatMoney } from '../lib/format';
import { formatAreaServiceLabel, formatStoryDisplayLabel } from '../lib/jobLocation';
import { workStatusTone } from '../lib/statusVisuals';
import type { JobRow, PropertySummary } from '../types';
import { UiIcon } from './UiIcon';

const dayMs = 86_400_000;

const startOfLocalDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const addDays = (date: Date, days: number) => new Date(date.getTime() + days * dayMs);

const isoDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseJobDay = (value: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return startOfLocalDay(date);
};

const scheduleDateFor = (job: JobRow) =>
  parseJobDay(job.dueDate) ?? parseJobDay(job.startDate) ?? parseJobDay(job.createdAt);

const dayLabel = (date: Date) =>
  new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date);

const shortWeekday = (date: Date) =>
  new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
  }).format(date);

const monthDayLabel = (date: Date) =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(date);

const sameIsoDay = (left: Date | null, right: Date) => left ? isoDate(left) === isoDate(right) : false;

export function ScheduleView({
  jobs,
  properties,
  canManage,
  onOpenJob,
  onMarkDone,
}: {
  jobs: JobRow[];
  properties: PropertySummary[];
  canManage: boolean;
  onOpenJob: (job: JobRow) => void;
  onMarkDone: (job: JobRow) => void;
}) {
  const [weekStartIso, setWeekStartIso] = useState(() => isoDate(startOfLocalDay(new Date())));
  const [propertyId, setPropertyId] = useState('');
  const [statusScope, setStatusScope] = useState<'OPEN' | 'ALL' | 'DONE'>('OPEN');
  const weekDays = useMemo(() => {
    const weekStart = startOfLocalDay(new Date(`${weekStartIso}T00:00:00`));
    return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  }, [weekStartIso]);
  const filteredJobs = useMemo(
    () =>
      jobs.filter((job) => {
        if (propertyId && job.propertyId !== propertyId) return false;
        if (statusScope === 'OPEN' && job.status === 'DONE') return false;
        if (statusScope === 'DONE' && job.status !== 'DONE') return false;
        return true;
      }),
    [jobs, propertyId, statusScope],
  );
  const unscheduledJobs = filteredJobs.filter((job) => !job.startDate && !job.dueDate);
  const visibleWeekJobs = filteredJobs.filter((job) => {
    const day = scheduleDateFor(job);
    if (!day) return false;
    return day >= weekDays[0] && day <= weekDays[6];
  });
  const weekValue = visibleWeekJobs.reduce((sum, job) => sum + job.totalCost, 0);
  const overdueCount = filteredJobs.filter((job) => job.status !== 'DONE' && job.timeline.isLate).length;
  const openCount = filteredJobs.filter((job) => job.status !== 'DONE').length;

  return (
    <section className="tab-panel schedule-shell">
      <div className="panel schedule-hero schedule-board-panel">
        <div className="schedule-hero-copy">
          <p className="page-kicker">Schedule</p>
          <h2 className="title-with-icon">
            <UiIcon name="calendar" />
            <span>Operations Calendar</span>
          </h2>
          <p>Plan, track, and manage key operations and events.</p>
        </div>
        <div className="schedule-hero-metrics">
          <span className="schedule-stat-card">
            <small>Total events</small>
            <strong>{filteredJobs.length}</strong>
          </span>
          <span className="schedule-stat-card">
            <small>This week</small>
            <strong>{visibleWeekJobs.length}</strong>
          </span>
          <span className="schedule-stat-card">
            <small>Pending / overdue</small>
            <strong>{openCount} / {overdueCount}</strong>
          </span>
          <span className="schedule-stat-card">
            <small>Weekly value</small>
            <strong>{formatMoney(weekValue)}</strong>
          </span>
        </div>
      </div>

      <div className="panel schedule-controls schedule-board-panel">
        <div className="schedule-control-field">
          <label htmlFor="schedule-week-start">Week starts</label>
          <input id="schedule-week-start" type="date" value={weekStartIso} onChange={(event) => setWeekStartIso(event.target.value)} />
        </div>
        <div className="schedule-control-field">
          <label htmlFor="schedule-property-filter">Property</label>
          <select id="schedule-property-filter" value={propertyId} onChange={(event) => setPropertyId(event.target.value)}>
            <option value="">All properties</option>
            {properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.name}
              </option>
            ))}
          </select>
        </div>
        <div className="schedule-segmented-control" role="group" aria-label="Schedule status scope">
          {(['OPEN', 'ALL', 'DONE'] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={statusScope === option ? 'is-active' : ''}
              onClick={() => setStatusScope(option)}
            >
              {option === 'OPEN' ? 'Open' : option === 'DONE' ? 'Done' : 'All'}
            </button>
          ))}
        </div>
      </div>

      <div className="panel schedule-calendar-panel schedule-board-panel">
        <div className="schedule-calendar-head">
          <div>
            <p className="eyebrow">Weekly board</p>
            <h3>Production schedule</h3>
          </div>
          <div className="schedule-calendar-range">
            <span>{dayLabel(weekDays[0])}</span>
            <span>{dayLabel(weekDays[6])}</span>
          </div>
        </div>

        <div className="schedule-week-grid">
          {weekDays.map((day) => {
            const dayJobs = filteredJobs.filter((job) => sameIsoDay(scheduleDateFor(job), day));
            const dayTotal = dayJobs.reduce((sum, job) => sum + job.totalCost, 0);

            return (
              <section key={isoDate(day)} className="schedule-day-column">
                <div className="schedule-day-head">
                  <div>
                    <span>{shortWeekday(day)}</span>
                    <strong>{monthDayLabel(day)}</strong>
                  </div>
                  <small>{dayJobs.length}</small>
                </div>
                <p className="schedule-day-total">{formatMoney(dayTotal)}</p>

                <div className="schedule-card-stack">
                  {dayJobs.length ? (
                    dayJobs.map((job) => (
                      <article key={job.id} className={`schedule-job-card schedule-job-card--tone-${job.timeline.tone}`}>
                        <div className="schedule-job-card-head">
                          <span className={`schedule-event-time schedule-event-time--tone-${job.timeline.tone}`}>{job.timeline.label}</span>
                          <span className={`pill tone-${workStatusTone(job.statusLabel || job.status)}`}>{job.statusLabel}</span>
                        </div>
                        <strong className="schedule-job-title">{formatAreaServiceLabel(job.area, job.service)}</strong>
                        <p>{job.propertyName}</p>
                        <span className="schedule-job-location">
                          {[formatStoryDisplayLabel(job.story), job.unit].filter(Boolean).join(' / ') || 'Whole property'}
                        </span>
                        <div className="schedule-job-actions">
                          <button type="button" className="ghost-button" onClick={() => onOpenJob(job)}>
                            <UiIcon name="activity" />
                            Open
                          </button>
                          {canManage && job.status !== 'DONE' ? (
                            <button type="button" className="ghost-button" onClick={() => onMarkDone(job)}>
                              <UiIcon name="shield" />
                              Done
                            </button>
                          ) : null}
                        </div>
                      </article>
                    ))
                  ) : (
                    <div className="schedule-empty-day">No events</div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {unscheduledJobs.length ? (
        <div className="panel schedule-unscheduled-panel schedule-board-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Needs planning</p>
              <h3 className="title-with-icon title-with-icon--sm">
                <UiIcon name="calendar" />
                <span>Unscheduled Jobs</span>
              </h3>
            </div>
            <span className="schedule-unscheduled-count">{unscheduledJobs.length}</span>
          </div>
          <div className="schedule-unscheduled-list">
            {unscheduledJobs.slice(0, 12).map((job) => (
              <button key={job.id} type="button" className="schedule-unscheduled-row" onClick={() => onOpenJob(job)}>
                <strong>{formatAreaServiceLabel(job.area, job.service)}</strong>
                <span>{job.propertyName}</span>
                <small>{formatDate(job.createdAt)}</small>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
