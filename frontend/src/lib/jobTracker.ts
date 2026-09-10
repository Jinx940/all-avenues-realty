import type { JobRow, TrackerLabel, TrackerColumn } from '../types';

export const defaultTrackerColumns: TrackerColumn[] = [
  { key: 'area', label: 'Work' }, { key: 'service', label: 'Services' }, { key: 'workers', label: 'Owner' },
  { key: 'status', label: 'Status' }, { key: 'dueDate', label: 'Due date' },
  { key: 'description', label: 'Description' }, { key: 'priority', label: 'Priority' },
  { key: 'paymentStatus', label: 'Payment' }, { key: 'laborCost', label: 'Labor' },
  { key: 'materialCost', label: 'Materials' }, { key: 'before', label: 'Before files' },
  { key: 'after', label: 'After files' }, { key: 'timeline', label: 'Timeline' },
  { key: 'updatedAt', label: 'Last updated' }, { key: 'actions', label: 'Actions' },
];

export const resolveTrackerColumns = (overrides: TrackerColumn[] = []) => defaultTrackerColumns.map(
  (column) => overrides.find((item) => item.key === column.key) ?? column,
);

export const trackerSegmentText = (label: string, count: number, total: number) =>
  `${label} ${count}/${total}  ${((total ? count / total : 0) * 100).toFixed(1)}%`;

export const defaultTrackerLabels: TrackerLabel[] = [
  { kind: 'status', value: 'DONE', label: 'Done', color: '#008c60' },
  { kind: 'status', value: 'IN_PROGRESS', label: 'Working on it', color: '#ffb332' },
  { kind: 'status', value: 'STUCK', label: 'Stuck', color: '#df2f58' },
  { kind: 'status', value: 'PENDING', label: 'Not started', color: '#c4c4c4' },
  { kind: 'status', value: 'PLANNING', label: 'Planning', color: '#8c91a8' },
  { kind: 'priority', value: 'HIGH', label: 'High', color: '#401694' },
  { kind: 'priority', value: 'MEDIUM', label: 'Medium', color: '#5954d9' },
  { kind: 'priority', value: 'LOW', label: 'Low', color: '#579bfc' },
  { kind: 'priority', value: 'NONE', label: 'No priority', color: '#c4c4c4' },
];

export const resolveTrackerLabels = (overrides: TrackerLabel[] = []) => defaultTrackerLabels.map(
  (label) => overrides.find((item) => item.kind === label.kind && item.value === label.value) ?? label,
);

export const labelTextColor = (hex: string) => {
  const rgb = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255)
    .map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  const luminance = .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
  return luminance > .179 ? '#202338' : '#ffffff';
};

export type TrackerSummaryMode = 'all' | 'done';
export function trackerSummary(jobs: JobRow[], labels: TrackerLabel[], kind: TrackerLabel['kind'], mode: TrackerSummaryMode) {
  const segments = labels.filter((label) => label.kind === kind).map((label) => ({ ...label, count: jobs.filter(
    (job) => (mode === 'all' || job.status === 'DONE') && (kind === 'status' ? job.status : job.priority ?? 'NONE') === label.value,
  ).length })).filter((segment) => segment.count > 0);
  const remaining = jobs.length - segments.reduce((sum, segment) => sum + segment.count, 0);
  if (remaining) segments.push({ kind, value: 'REMAINING', label: mode === 'done' ? 'Not done' : 'No label', color: '#e7e9ef', count: remaining });
  return segments;
}

export const isoCalendarDate = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
export const calendarDate = (value: string) => new Date(`${value}T00:00:00Z`);
export const rangeDayCount = (start: string, end: string) => start && end && end >= start
  ? Math.round((calendarDate(end).getTime() - calendarDate(start).getTime()) / 86400000) + 1 : 0;

export function trackerDueDateRange(jobs: Pick<JobRow, 'dueDate'>[]) {
  let start = '';
  let end = '';
  for (const job of jobs) {
    if (!job.dueDate) continue;
    const date = new Date(job.dueDate);
    if (!Number.isFinite(date.getTime())) continue;
    const day = isoCalendarDate(date);
    if (!start || day < start) start = day;
    if (!end || day > end) end = day;
  }
  return start ? { start, end, days: rangeDayCount(start, end) } : null;
}
