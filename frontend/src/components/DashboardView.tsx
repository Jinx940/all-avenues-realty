import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { BootstrapPayload, DashboardPayload, JobRow, PropertySummary, TabId } from '../types';
import { downloadCsv } from '../lib/csv';
import { formatMoney } from '../lib/format';
import { dashboardDate, dashboardStatuses, jobDay, jobRange, jobsForDay, jobsForPeriod, localToday, moveCalendar, upcomingDeadlines, visibleCalendarDays, type CalendarView, type DashboardPeriod } from '../lib/dashboardCalendar';
import { ProtectedAssetImage } from './ProtectedAssetImage';
import { UiIcon, type UiIconName } from './UiIcon';
import './DashboardView.css';

type Status = ReturnType<typeof dashboardStatuses>[number];
const colorStyle = (color: string) => ({ '--event-color': color }) as CSSProperties;
const arrow = <UiIcon name="chevronDown" className="db-arrow" size={15} />;
const statusIcon = (status: string): UiIconName => status === 'DONE' ? 'userCheck' : status === 'STUCK' ? 'bell' : status === 'PLANNING' ? 'calendar' : 'briefcase';

export function DashboardView({ dashboard, jobs, bootstrap, allowedTabs, onCreateJob, onOpenJob, onNavigate }: {
  dashboard: DashboardPayload | null;
  jobs: JobRow[];
  bootstrap: BootstrapPayload | null;
  allowedTabs: TabId[];
  onCreateJob: (date?: string) => void;
  onOpenJob: (job: JobRow) => void;
  onNavigate: (tab: TabId, documentType?: 'Invoice' | 'Quote') => void;
}) {
  const [today, setToday] = useState(localToday);
  const [selectedDay, setSelectedDay] = useState(localToday);
  const [view, setView] = useState<CalendarView>('Month');
  const [period, setPeriod] = useState<DashboardPeriod>('all');
  const [propertyId, setPropertyId] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  useEffect(() => {
    const timer = window.setInterval(() => setToday(localToday()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const properties = useMemo(() => new Map((bootstrap?.properties ?? []).map((item) => [item.id, item])), [bootstrap?.properties]);
  const filteredJobs = useMemo(() => {
    const term = search.trim().toLowerCase();
    return jobs.filter((job) => (!propertyId || job.propertyId === propertyId) && (!term || [job.service, job.area, job.propertyName, properties.get(job.propertyId)?.address, ...job.workers.map((worker) => worker.name)].join(' ').toLowerCase().includes(term)));
  }, [jobs, propertyId, search, properties]);
  const calendarJobs = statusFilter ? filteredJobs.filter((job) => job.status === statusFilter) : filteredJobs;
  const days = visibleCalendarDays(selectedDay, view);
  const dayJobs = jobsForDay(calendarJobs, selectedDay);
  const statuses = dashboardStatuses(jobs, bootstrap?.trackerLabels);
  const chartJobs = jobsForPeriod(filteredJobs, period, today);
  const chartStatuses = dashboardStatuses(chartJobs, bootstrap?.trackerLabels);
  const deadlines = upcomingDeadlines(calendarJobs, today);
  const overdue = calendarJobs.filter((job) => job.status !== 'DONE' && jobDay(job.dueDate) && jobDay(job.dueDate)! < today).length;
  const unscheduled = calendarJobs.filter((job) => !jobRange(job)).length;
  const canCreate = allowedTabs.includes('new-job');
  const statusFor = (job: JobRow) => statuses.find((status) => status.value === job.status)!;
  const title = view === 'Month' ? dashboardDate(selectedDay, { month: 'long', year: 'numeric' }) : view === 'Day'
    ? dashboardDate(selectedDay, { month: 'long', day: 'numeric', year: 'numeric' })
    : `${dashboardDate(days[0])} – ${dashboardDate(days[6], { month: 'short', day: 'numeric', year: 'numeric' })}`;
  const selectedTitle = selectedDay === today ? "Today's Jobs" : `${dashboardDate(selectedDay)} Jobs`;
  const actions: { label: string; icon: UiIconName; color: string; tab: TabId; run: () => void }[] = [
    { label: 'Add Job', icon: 'plus', color: '#0073ea', tab: 'new-job', run: () => onCreateJob() },
    { label: 'Create Invoice', icon: 'receipt', color: '#b77700', tab: 'generate-invoice-quote', run: () => onNavigate('generate-invoice-quote', 'Invoice') },
    { label: 'New Estimate', icon: 'file', color: '#008c60', tab: 'generate-invoice-quote', run: () => onNavigate('generate-invoice-quote', 'Quote') },
    { label: 'Job Tracker', icon: 'clipboard', color: '#df2f58', tab: 'job-tracker', run: () => onNavigate('job-tracker') },
    { label: 'Add Property', icon: 'home', color: '#6941c6', tab: 'property-register', run: () => onNavigate('property-register') },
    { label: 'Schedule Job', icon: 'calendar', color: '#254b75', tab: 'new-job', run: () => onCreateJob(selectedDay) },
  ];
  const exportJobs = () => downloadCsv(`jobs-${today}.csv`, [
    ['Property', 'Work', 'Services', 'Owner', 'Status', 'Payment', 'Start date', 'Due date', 'Labor (USD)', 'Materials (USD)', 'Total (USD)'],
    ...filteredJobs.map((job) => [job.propertyName, job.area, job.service, job.workers.map((worker) => worker.name).join(' | '), statusFor(job).label, job.paymentStatusLabel, jobDay(job.startDate), jobDay(job.dueDate), job.laborCost, job.materialCost, job.totalCost]),
  ]);

  return (
    <section className="db-workspace" aria-label="Dashboard" aria-busy={!dashboard}>
      <header className="db-heading">
        <div><p className="db-eyebrow">WORKSPACE OVERVIEW</p><h2>Dashboard</h2><p>Your properties. Your jobs. All in one place.</p></div>
        <div className="db-heading-actions">
          <select aria-label="Dashboard property" value={propertyId} onChange={(event) => setPropertyId(event.target.value)}><option value="">All properties</option>{[...properties.values()].map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select>
          <button className="db-button" onClick={exportJobs} disabled={!filteredJobs.length}><UiIcon name="download" size={15} />Export</button>
        </div>
      </header>
      {!dashboard ? <p className="db-loading" role="status">Loading your dashboard…</p> : null}
      <div className="db-grid">
        <section className="db-card db-calendar" aria-label="Job calendar">
          <header className="db-card-head db-calendar-head">
            <h3><UiIcon name="calendar" size={22} /><span aria-live="polite">{title}</span></h3>
            <div className="db-calendar-controls">
              <div className="db-navigation"><button aria-label={`Previous ${view.toLowerCase()}`} onClick={() => setSelectedDay(moveCalendar(selectedDay, view, -1))}><UiIcon name="chevronDown" className="db-prev" size={16} /></button><button onClick={() => { setToday(localToday()); setSelectedDay(localToday()); }}>Today</button><button aria-label={`Next ${view.toLowerCase()}`} onClick={() => setSelectedDay(moveCalendar(selectedDay, view, 1))}><UiIcon name="chevronDown" className="db-arrow" size={16} /></button></div>
              <div className="db-view-switch" role="group" aria-label="Calendar view">{(['Month', 'Week', 'Day'] as const).map((mode) => <button key={mode} aria-pressed={view === mode} onClick={() => setView(mode)}>{mode}</button>)}</div>
              {canCreate ? <button className="db-add-job" onClick={() => onCreateJob(selectedDay)}><UiIcon name="plus" size={16} />Add Job</button> : null}
            </div>
          </header>
          {statusFilter ? <div className="db-active-filter"><span>Showing {statuses.find((status) => status.value === statusFilter)?.label}</span><button onClick={() => setStatusFilter('')}>Clear status <UiIcon name="close" size={13} /></button></div> : null}
          {view === 'Day' ? <div className="db-day-list" aria-label="Day agenda">
            <div className="db-day-list-head"><span>{dashboardDate(selectedDay, { weekday: 'long' })} · {dayJobs.length} {dayJobs.length === 1 ? 'job' : 'jobs'}</span><span>All-day jobs</span></div>
            {dayJobs.length ? dayJobs.map((job) => <JobCard key={job.id} job={job} property={properties.get(job.propertyId)} status={statusFor(job)} onOpen={onOpenJob} detailed />) : <Empty icon="calendar" title="No jobs scheduled" text="Choose another day to see its jobs." />}
          </div> : <div className="db-calendar-scroll" tabIndex={0} aria-label={`${view} calendar`}>
            <div className={`db-calendar-grid db-calendar-grid--${view.toLowerCase()}`}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((name) => <div key={name} className="db-weekday">{name}</div>)}
              {days.map((day) => {
                const items = jobsForDay(calendarJobs, day);
                const groups = statuses.map((status) => ({ ...status, count: items.filter((job) => job.status === status.value).length })).filter((status) => status.count);
                return <div key={day} className={`db-calendar-cell${day.slice(0, 7) !== selectedDay.slice(0, 7) ? ' is-outside' : ''}${day === selectedDay ? ' is-selected' : ''}`}>
                  <button className={`db-select-day${day === today ? ' is-today' : ''}`} aria-label={`${dashboardDate(day, { month: 'long', day: 'numeric', year: 'numeric' })}, ${items.length} ${items.length === 1 ? 'job' : 'jobs'}`} aria-pressed={day === selectedDay} aria-current={day === today ? 'date' : undefined} onClick={() => setSelectedDay(day)}><span>{Number(day.slice(8))}</span></button>
                  <div className="db-cell-events">{view === 'Week' ? items.map((job) => <button key={job.id} className="db-week-event" style={colorStyle(statusFor(job).color)} onClick={() => onOpenJob(job)}><strong>{job.service || job.area || 'Untitled job'}</strong><span>{job.propertyName}</span><small>{statusFor(job).label}</small></button>) : groups.slice(0, 3).map((status) => <button key={status.value} className="db-event" style={colorStyle(status.color)} title={`${status.count} ${status.label}`} aria-label={`${status.count} ${status.label} on ${dashboardDate(day)}`} onClick={() => { setSelectedDay(day); setStatusFilter(status.value); }}><UiIcon name={statusIcon(status.value)} size={12} /><span className="db-event-label">{status.count} {status.label}</span><span className="db-event-short" aria-hidden="true">{status.count}</span></button>)}
                  {view === 'Month' && groups.length > 3 ? <button className="db-more" onClick={() => { setSelectedDay(day); setView('Day'); }}>+{groups.slice(3).reduce((total, group) => total + group.count, 0)} more</button> : null}</div>
                </div>;
              })}
            </div>
          </div>}
          <footer className="db-calendar-footer"><span><i />{calendarJobs.length} {calendarJobs.length === 1 ? 'job' : 'jobs'}{propertyId ? ` · ${properties.get(propertyId)?.name}` : ' across your properties'}</span>{unscheduled ? <button onClick={() => onNavigate('job-tracker')}>{unscheduled} unscheduled {arrow}</button> : <span>All-day schedule</span>}</footer>
        </section>

        <section className="db-card db-today" aria-label={selectedTitle}>
          <header className="db-card-head"><h3><UiIcon name="clipboard" size={21} />{selectedTitle}<span className="db-count">{dayJobs.length}</span></h3><button className="db-link" onClick={() => setView('Day')}>View All {arrow}</button></header>
          <div className="db-today-list" aria-live="polite">{dayJobs.length ? dayJobs.map((job) => <JobCard key={job.id} job={job} property={properties.get(job.propertyId)} status={statusFor(job)} onOpen={onOpenJob} />) : <Empty icon="calendar" title="A clear schedule" text={search || propertyId || statusFilter ? 'No jobs match your filters on this day.' : 'No jobs are scheduled for this day.'} />}</div>
          <footer className="db-agenda-footer"><UiIcon name="calendar" size={14} />{dashboardDate(selectedDay, { weekday: 'long', month: 'short', day: 'numeric' })}<span>{dayJobs.length} {dayJobs.length === 1 ? 'job' : 'jobs'}</span></footer>
        </section>

        <section className="db-card db-status-card" aria-label="Jobs by Status">
          <header className="db-card-head"><h3><UiIcon name="chart" size={21} />Jobs by Status</h3><select aria-label="Status date range" value={period} onChange={(event) => setPeriod(event.target.value as DashboardPeriod)}><option value="all">All time</option><option value="year">This year</option><option value="month">This month</option></select></header>
          <StatusChart statuses={chartStatuses} total={chartJobs.length} active={statusFilter} onSelect={(value) => setStatusFilter(statusFilter === value ? '' : value)} />
        </section>

        <section className="db-card db-deadlines" aria-label="Upcoming Deadlines">
          <header className="db-card-head"><h3><UiIcon name="activity" size={21} />Upcoming Deadlines</h3><button className="db-link" onClick={() => onNavigate('schedule')}>View All {arrow}</button></header>
          <div className="db-deadline-list">{deadlines.length ? deadlines.slice(0, 5).map((job) => <button className="db-deadline" key={job.id} onClick={() => onOpenJob(job)}>
            <span className="db-date-badge"><small>{dashboardDate(jobDay(job.dueDate)!, { month: 'short' })}</small><strong>{Number(jobDay(job.dueDate)!.slice(8))}</strong></span>
            <span className="db-deadline-copy"><strong>{job.service || job.area || 'Untitled job'}</strong><span>{job.propertyName} · {job.area}</span></span><StatusBadge status={statusFor(job)} />
          </button>) : <Empty icon="userCheck" title="You're all caught up" text="No upcoming job deadlines." />}</div>
          {overdue ? <button className="db-overdue" onClick={() => onNavigate(allowedTabs.includes('alerts-center') ? 'alerts-center' : 'schedule')}><UiIcon name="bell" size={14} />{overdue} overdue {overdue === 1 ? 'job needs' : 'jobs need'} attention {arrow}</button> : null}
        </section>

        <section className="db-card db-quick" aria-label="Quick Actions">
          <header className="db-card-head"><h3><UiIcon name="spark" size={21} />Quick Actions</h3></header>
          <div className="db-quick-grid">{actions.filter((action) => allowedTabs.includes(action.tab)).map((action) => <button key={action.label} style={colorStyle(action.color)} onClick={action.run}><UiIcon name={action.icon} size={27} /><span>{action.label}</span></button>)}{!canCreate ? <button style={colorStyle('#254b75')} onClick={() => onNavigate('schedule')}><UiIcon name="calendar" size={27} /><span>View Schedule</span></button> : null}</div>
          <div className="db-search"><UiIcon name="search" size={17} /><input aria-label="Search dashboard" placeholder="Search jobs, properties, owners…" value={search} onChange={(event) => setSearch(event.target.value)} />{search ? <button aria-label="Clear dashboard search" onClick={() => setSearch('')}><UiIcon name="close" size={14} /></button> : null}</div>
          {search ? <div className="db-search-results" aria-live="polite"><span>{filteredJobs.length} matching {filteredJobs.length === 1 ? 'job' : 'jobs'}</span>{filteredJobs.slice(0, 4).map((job) => <button key={job.id} onClick={() => onOpenJob(job)}><strong>{job.service || job.area}</strong><span>{job.propertyName}</span>{arrow}</button>)}</div> : null}
        </section>
      </div>
    </section>
  );
}

function StatusBadge({ status }: { status: Status }) {
  return <span className="db-status-badge" style={colorStyle(status.color)}>{status.label}</span>;
}

function JobCard({ job, property, status, onOpen, detailed = false }: { job: JobRow; property?: PropertySummary; status: Status; onOpen: (job: JobRow) => void; detailed?: boolean }) {
  const photo = property?.coverImageUrl || job.files.before.find((file) => file.mimeType.startsWith('image/'))?.url || null;
  const fallback = <span className="db-job-photo db-photo-fallback"><UiIcon name="home" size={27} /></span>;
  return <button className={`db-job-card${detailed ? ' db-job-card--detailed' : ''}`} onClick={() => onOpen(job)}>
    {photo ? <ProtectedAssetImage src={photo} alt="" className="db-job-photo" loadingFallback={fallback} errorFallback={fallback} /> : fallback}
    <span className="db-job-copy"><small>{job.area || 'All-day job'}</small><strong title={job.service}>{job.service || 'Untitled job'}</strong><span title={[property?.address || job.propertyName, property?.cityLine].filter(Boolean).join(', ')}>{property?.address || job.propertyName}{property?.cityLine ? `, ${property.cityLine}` : ''}</span>{detailed ? <span className="db-job-owner">{job.workers.map((worker) => worker.name).join(', ') || 'Unassigned'} · {formatMoney(job.totalCost)}</span> : null}</span>
    <StatusBadge status={status} />{arrow}
  </button>;
}

function Empty({ icon, title, text }: { icon: UiIconName; title: string; text: string }) {
  return <div className="db-empty"><span><UiIcon name={icon} size={26} /></span><strong>{title}</strong><p>{text}</p></div>;
}

function StatusChart({ statuses, total, active, onSelect }: { statuses: Status[]; total: number; active: string; onSelect: (status: string) => void }) {
  const segments = statuses.filter((status) => status.count).map((status, index, items) => ({
    ...status,
    start: items.slice(0, index).reduce((sum, item) => sum + item.count, 0) / total * 100,
    share: status.count / total * 100,
  }));
  return <div className="db-status-content">
    <div className="db-donut"><svg viewBox="0 0 120 120" role="img" aria-label={`${total} total jobs. ${segments.map((status) => `${status.label}: ${status.count}`).join(', ')}`}><circle cx="60" cy="60" r="46" fill="none" stroke="#edf0f5" strokeWidth="18" />{segments.map((status) => <circle key={status.value} cx="60" cy="60" r="46" fill="none" stroke={status.color} strokeWidth="18" pathLength="100" strokeDasharray={`${Math.max(0, status.share - .45)} ${100 - Math.max(0, status.share - .45)}`} strokeDashoffset={-status.start} transform="rotate(-90 60 60)"><title>{status.label}: {status.count} ({Math.round(status.share)}%)</title></circle>)}</svg><div className="db-donut-total" aria-hidden="true"><strong>{total}</strong><span>Total Jobs</span></div></div>
    <div className="db-status-legend">{statuses.map((status) => <button key={status.value} onClick={() => onSelect(status.value)} aria-pressed={active === status.value}><i style={{ background: status.color }} /><span>{status.label}</span><strong>{status.count}</strong><small>{Math.round(total ? status.count / total * 100 : 0)}%</small></button>)}</div>
  </div>;
}
