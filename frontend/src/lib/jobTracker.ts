import type { JobRow, TrackerLabel, TrackerColumn } from '../types';

export const defaultTrackerColumns: TrackerColumn[] = [
  { key: 'service', label: 'Trabajo' }, { key: 'workers', label: 'Responsable' },
  { key: 'status', label: 'Estado' }, { key: 'dueDate', label: 'Vencimiento' },
  { key: 'description', label: 'Notas' }, { key: 'priority', label: 'Prioridad' },
  { key: 'paymentStatus', label: 'Pago' }, { key: 'laborCost', label: 'Mano de obra' },
  { key: 'materialCost', label: 'Material' }, { key: 'before', label: 'Antes' },
  { key: 'after', label: 'Después' }, { key: 'timeline', label: 'Cronograma' },
  { key: 'updatedAt', label: 'Actualizado' }, { key: 'actions', label: 'Acciones' },
];

export const resolveTrackerColumns = (overrides: TrackerColumn[] = []) => defaultTrackerColumns.map(
  (column) => overrides.find((item) => item.key === column.key) ?? column,
);

export const trackerSegmentText = (label: string, count: number, total: number) =>
  `${label} ${count}/${total}  ${((total ? count / total : 0) * 100).toFixed(1)}%`;

export const defaultTrackerLabels: TrackerLabel[] = [
  { kind: 'status', value: 'DONE', label: 'Completado', color: '#008c60' },
  { kind: 'status', value: 'IN_PROGRESS', label: 'En proceso', color: '#ffb332' },
  { kind: 'status', value: 'STUCK', label: 'Bloqueado', color: '#df2f58' },
  { kind: 'status', value: 'PENDING', label: 'Sin iniciar', color: '#c4c4c4' },
  { kind: 'status', value: 'PLANNING', label: 'Planificación', color: '#8c91a8' },
  { kind: 'priority', value: 'HIGH', label: 'Alta', color: '#401694' },
  { kind: 'priority', value: 'MEDIUM', label: 'Media', color: '#5954d9' },
  { kind: 'priority', value: 'LOW', label: 'Baja', color: '#579bfc' },
  { kind: 'priority', value: 'NONE', label: 'Sin prioridad', color: '#c4c4c4' },
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
  if (remaining) segments.push({ kind, value: 'REMAINING', label: mode === 'done' ? 'Sin completar' : 'Sin etiqueta', color: '#e7e9ef', count: remaining });
  return segments;
}

export const isoCalendarDate = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
export const calendarDate = (value: string) => new Date(`${value}T00:00:00Z`);
export const rangeDayCount = (start: string, end: string) => start && end && end >= start
  ? Math.round((calendarDate(end).getTime() - calendarDate(start).getTime()) / 86400000) + 1 : 0;
