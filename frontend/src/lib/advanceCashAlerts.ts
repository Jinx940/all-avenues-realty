import type { JobRow } from '../types';

export type AdvanceCashAlertPriority = 'overdue' | 'today' | 'upcoming' | 'unscheduled';

export type AdvanceCashAlert = {
  id: string;
  jobId: string;
  propertyId: string;
  propertyName: string;
  story: string;
  unit: string;
  area: string;
  service: string;
  advanceCashApp: number;
  dueDate: string | null;
  daysDelta: number | null;
  priority: AdvanceCashAlertPriority;
};

const startOfDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate());

const priorityWeight: Record<AdvanceCashAlertPriority, number> = {
  overdue: 0,
  today: 1,
  upcoming: 2,
  unscheduled: 3,
};

const daysDeltaFromDueDate = (dueDate: string | null) => {
  if (!dueDate) return null;

  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return null;

  const today = startOfDay(new Date());
  const target = startOfDay(due);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
};

const priorityFromDaysDelta = (daysDelta: number | null): AdvanceCashAlertPriority => {
  if (daysDelta == null) return 'unscheduled';
  if (daysDelta < 0) return 'overdue';
  if (daysDelta === 0) return 'today';
  return 'upcoming';
};

export const buildAdvanceCashAlerts = (jobs: JobRow[]) =>
  jobs
    .filter((job) => job.paymentStatus === 'PARTIAL_PAYMENT' && job.advanceCashApp > 0)
    .map<AdvanceCashAlert>((job) => {
      const daysDelta = daysDeltaFromDueDate(job.dueDate);
      return {
        id: `advance-cash-${job.id}`,
        jobId: job.id,
        propertyId: job.propertyId,
        propertyName: job.propertyName,
        story: job.story,
        unit: job.unit,
        area: job.area,
        service: job.service,
        advanceCashApp: job.advanceCashApp,
        dueDate: job.dueDate,
        daysDelta,
        priority: priorityFromDaysDelta(daysDelta),
      };
    })
    .sort((left, right) => {
      const priorityDiff = priorityWeight[left.priority] - priorityWeight[right.priority];
      if (priorityDiff !== 0) return priorityDiff;

      if (left.priority === 'overdue' && right.priority === 'overdue') {
        return Math.abs(right.daysDelta ?? 0) - Math.abs(left.daysDelta ?? 0);
      }

      if (left.priority === 'upcoming' && right.priority === 'upcoming') {
        return (left.daysDelta ?? Number.POSITIVE_INFINITY) - (right.daysDelta ?? Number.POSITIVE_INFINITY);
      }

      return left.propertyName.localeCompare(right.propertyName);
    });
