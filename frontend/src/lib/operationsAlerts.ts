import type { UiIconName } from '../components/UiIcon';
import type { JobRow, Tone } from '../types';
import { formatDate, formatMoney } from './format';
import { formatAreaServiceLabel, formatStoryDisplayLabel } from './jobLocation';

export type OperationsAlert = {
  id: string;
  kind: 'overdue' | 'due-soon' | 'payment' | 'invoice' | 'photos' | 'worker' | 'schedule';
  title: string;
  detail: string;
  metric: string;
  tone: Tone;
  icon: UiIconName;
  job: JobRow;
};

const today = () => new Date(new Date().toDateString());

const daysUntil = (value: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.ceil((date.getTime() - today().getTime()) / 86_400_000);
};

export const buildOperationsAlerts = (jobs: JobRow[]): OperationsAlert[] => {
  const alerts: OperationsAlert[] = [];

  jobs.forEach((job) => {
    const dueInDays = daysUntil(job.dueDate);
    const location = formatAreaServiceLabel(job.area, job.service);
    const unitLabel = [formatStoryDisplayLabel(job.story), job.unit].filter(Boolean).join(' / ') || 'Whole property';

    if (job.status !== 'DONE' && job.timeline.isLate) {
      alerts.push({
        id: `${job.id}:overdue`,
        kind: 'overdue',
        title: `${location} is overdue`,
        detail: `${job.propertyName} - ${unitLabel}`,
        metric: job.timeline.label,
        tone: 'danger',
        icon: 'calendar',
        job,
      });
    } else if (job.status !== 'DONE' && dueInDays != null && dueInDays >= 0 && dueInDays <= 3) {
      alerts.push({
        id: `${job.id}:due-soon`,
        kind: 'due-soon',
        title: `${location} is due soon`,
        detail: `${job.propertyName} - ${unitLabel}`,
        metric: dueInDays === 0 ? 'Due today' : `${dueInDays} day${dueInDays === 1 ? '' : 's'}`,
        tone: 'warning',
        icon: 'calendar',
        job,
      });
    }

    if (job.paymentStatus === 'UNPAID' || job.paymentStatus === 'PARTIAL_PAYMENT') {
      alerts.push({
        id: `${job.id}:payment`,
        kind: 'payment',
        title: `Collect ${formatMoney(Math.max(job.totalCost - job.advanceCashApp, 0))}`,
        detail: `${job.propertyName} - ${location}`,
        metric: job.paymentStatusLabel,
        tone: job.paymentStatus === 'PARTIAL_PAYMENT' ? 'warning' : 'danger',
        icon: 'dollar',
        job,
      });
    }

    if (job.invoiceStatus !== 'YES' && job.status === 'DONE') {
      alerts.push({
        id: `${job.id}:invoice`,
        kind: 'invoice',
        title: 'Invoice not issued',
        detail: `${job.propertyName} - ${location}`,
        metric: 'No invoice',
        tone: 'orange',
        icon: 'receipt',
        job,
      });
    }

    if (!job.files.before.length || !job.files.after.length) {
      alerts.push({
        id: `${job.id}:photos`,
        kind: 'photos',
        title: 'Missing job evidence',
        detail: `${job.propertyName} - ${location}`,
        metric: !job.files.before.length && !job.files.after.length ? 'Before + After' : !job.files.before.length ? 'Before' : 'After',
        tone: 'sky',
        icon: 'camera',
        job,
      });
    }

    if (!job.workerIds.length && job.status !== 'DONE') {
      alerts.push({
        id: `${job.id}:worker`,
        kind: 'worker',
        title: 'No worker assigned',
        detail: `${job.propertyName} - ${location}`,
        metric: 'Unassigned',
        tone: 'warning',
        icon: 'users',
        job,
      });
    }

    if (!job.dueDate && job.status !== 'DONE') {
      alerts.push({
        id: `${job.id}:schedule`,
        kind: 'schedule',
        title: 'No due date',
        detail: `${job.propertyName} - ${location}`,
        metric: formatDate(job.createdAt),
        tone: 'neutral',
        icon: 'calendar',
        job,
      });
    }
  });

  const toneWeight: Record<Tone, number> = {
    danger: 0,
    warning: 1,
    orange: 2,
    sky: 3,
    neutral: 4,
    success: 5,
  };

  return alerts.sort((left, right) => toneWeight[left.tone] - toneWeight[right.tone]);
};
