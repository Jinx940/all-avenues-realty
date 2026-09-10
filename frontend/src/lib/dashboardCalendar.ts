import type { JobRow, TrackerLabel } from '../types';
import { calendarDate, isoCalendarDate, resolveTrackerLabels } from './jobTracker';

export type CalendarView = 'Month' | 'Week' | 'Day';
export type DashboardPeriod = 'all' | 'year' | 'month';

// Job dates are calendar dates, even when the API serializes them at midnight UTC.
export function jobDay(value: string | null): string | null {
  if (!value) return null;
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const parsed = calendarDate(day);
  return Number.isFinite(parsed.getTime()) && isoCalendarDate(parsed) === day ? day : null;
}

export function localToday() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function moveDay(day: string, offset: number) {
  const date = calendarDate(day);
  date.setUTCDate(date.getUTCDate() + offset);
  return isoCalendarDate(date);
}

export function moveCalendar(day: string, view: CalendarView, offset: number) {
  if (view !== 'Month') return moveDay(day, offset * (view === 'Week' ? 7 : 1));
  const date = calendarDate(day);
  const originalDay = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + offset);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(originalDay, lastDay));
  return isoCalendarDate(date);
}

export function visibleCalendarDays(day: string, view: CalendarView) {
  if (view === 'Day') return [day];
  const anchor = view === 'Month' ? `${day.slice(0, 7)}-01` : day;
  const start = moveDay(anchor, -calendarDate(anchor).getUTCDay());
  const date = calendarDate(anchor);
  const monthEnd = isoCalendarDate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)));
  const length = view === 'Week' ? 7 : Math.ceil((calendarDate(anchor).getUTCDay() + Number(monthEnd.slice(8))) / 7) * 7;
  return Array.from({ length }, (_, index) => moveDay(start, index));
}

export function jobRange(job: JobRow) {
  const start = jobDay(job.startDate);
  const end = (job.status === 'DONE' ? jobDay(job.completedAt) : null) ?? jobDay(job.dueDate);
  if (!start && !end) return null;
  const first = start ?? end!;
  const last = end ?? start!;
  return first <= last ? { start: first, end: last } : { start: last, end: first };
}

export const jobsForDay = (jobs: JobRow[], day: string) => jobs.filter((job) => {
  const range = jobRange(job);
  return range !== null && range.start <= day && range.end >= day;
});

export function jobsForPeriod(jobs: JobRow[], period: DashboardPeriod, today: string) {
  if (period === 'all') return jobs;
  const start = period === 'year' ? `${today.slice(0, 4)}-01-01` : `${today.slice(0, 7)}-01`;
  const end = period === 'year' ? `${today.slice(0, 4)}-12-31` : moveDay(moveCalendar(start, 'Month', 1), -1);
  return jobs.filter((job) => {
    const range = jobRange(job);
    const created = jobDay(job.createdAt);
    return range ? range.start <= end && range.end >= start : created !== null && created >= start && created <= end;
  });
}

export function dashboardStatuses(jobs: JobRow[], overrides: TrackerLabel[] = []) {
  const labels = resolveTrackerLabels(overrides).filter((label) => label.kind === 'status');
  for (const job of jobs) {
    if (!labels.some((label) => label.value === job.status)) {
      labels.push({ kind: 'status', value: job.status, label: job.statusLabel || 'Other', color: '#7d8699' });
    }
  }
  return labels.map((label) => ({ ...label, count: jobs.filter((job) => job.status === label.value).length }));
}

export function upcomingDeadlines(jobs: JobRow[], today: string) {
  return jobs.filter((job) => job.status !== 'DONE' && (jobDay(job.dueDate) ?? '') >= today)
    .sort((a, b) => jobDay(a.dueDate)!.localeCompare(jobDay(b.dueDate)!) || a.service.localeCompare(b.service));
}

export function dashboardDate(day: string, options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) {
  return new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' }).format(calendarDate(day));
}
