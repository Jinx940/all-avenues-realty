import type { ChartDatum, DashboardPayload, JobRow } from '../types';

const dashboardToday = () => new Date(new Date().toDateString());

const sumBy = <T>(items: T[], getter: (item: T) => number) =>
  items.reduce((total, item) => total + getter(item), 0);

const countBy = <T>(items: T[], getKey: (item: T) => string) => {
  const result = new Map<string, number>();
  items.forEach((item) => {
    const key = getKey(item);
    result.set(key, (result.get(key) ?? 0) + 1);
  });
  return result;
};

const chartDataFrom = (map: Map<string, number>): ChartDatum[] =>
  Array.from(map.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((left, right) => right.value - left.value);

const dashboardTimelineBucketFor = (job: JobRow) => {
  if (job.status === 'DONE') return 'Done';
  if (!job.dueDate) return 'No due date';

  const dueDate = new Date(job.dueDate);
  if (Number.isNaN(dueDate.getTime())) return 'No due date';
  if (dueDate < dashboardToday()) return 'Overdue';

  const diffDays = Math.ceil((dueDate.getTime() - dashboardToday().getTime()) / 86400000);
  return diffDays <= 7 ? 'Due soon' : 'Upcoming';
};

export const buildDashboardFromJobs = (jobs: JobRow[]): DashboardPayload => ({
  stats: {
    totalJobs: jobs.length,
    doneJobs: jobs.filter((job) => job.status === 'DONE').length,
    inProgressJobs: jobs.filter((job) => job.status === 'IN_PROGRESS').length,
    pendingJobs: jobs.filter((job) => job.status === 'PENDING' || job.status === 'PLANNING').length,
    lateJobs: jobs.filter((job) => job.status !== 'DONE' && job.dueDate && new Date(job.dueDate) < dashboardToday())
      .length,
    unpaidOrPartial: jobs.filter(
      (job) => job.paymentStatus === 'UNPAID' || job.paymentStatus === 'PARTIAL_PAYMENT',
    ).length,
    materialTotal: sumBy(jobs, (job) => job.materialCost),
    laborTotal: sumBy(jobs, (job) => job.laborCost),
  },
  charts: {
    status: chartDataFrom(countBy(jobs, (job) => job.statusLabel)),
    payment: chartDataFrom(countBy(jobs, (job) => job.paymentStatusLabel)),
    workers: chartDataFrom(
      countBy(
        jobs.flatMap((job) => job.workers),
        (worker) => worker.name,
      ),
    ).slice(0, 8),
    timeline: chartDataFrom(countBy(jobs, dashboardTimelineBucketFor)),
    properties: chartDataFrom(countBy(jobs, (job) => job.propertyName)).slice(0, 8),
  },
});
