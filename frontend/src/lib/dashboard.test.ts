import { describe, expect, it, vi } from 'vitest';
import { buildDashboardFromJobs } from './dashboard';
import { dashboardDate, dashboardStatuses, jobDay, jobRange, jobsForDay, jobsForPeriod, moveCalendar, upcomingDeadlines, visibleCalendarDays } from './dashboardCalendar';
import type { JobRow } from '../types';

const makeJob = (overrides: Partial<JobRow>): JobRow => ({
  id: overrides.id ?? 'job-1',
  propertyId: overrides.propertyId ?? 'property-1',
  propertyName: overrides.propertyName ?? 'Saranac Rd',
  story: overrides.story ?? 'Floor 1',
  unit: overrides.unit ?? 'Unit 1',
  section: overrides.section ?? 'Floor 1 / Unit 1',
  area: overrides.area ?? 'Kitchen',
  service: overrides.service ?? 'Electrical',
  description: overrides.description ?? '',
  materialCost: overrides.materialCost ?? 0,
  laborCost: overrides.laborCost ?? 0,
  totalCost: overrides.totalCost ?? (overrides.materialCost ?? 0) + (overrides.laborCost ?? 0),
  status: overrides.status ?? 'PENDING',
  statusLabel: overrides.statusLabel ?? 'Pending',
  invoiceStatus: overrides.invoiceStatus ?? 'NO',
  invoiceStatusLabel: overrides.invoiceStatusLabel ?? 'No',
  paymentStatus: overrides.paymentStatus ?? 'UNPAID',
  paymentStatusLabel: overrides.paymentStatusLabel ?? 'Unpaid',
  advanceCashApp: overrides.advanceCashApp ?? 0,
  startDate: overrides.startDate ?? null,
  dueDate: overrides.dueDate ?? null,
  completedAt: overrides.completedAt ?? null,
  timeline: overrides.timeline ?? { label: '', tone: 'neutral', isLate: false },
  workers: overrides.workers ?? [],
  workerIds: overrides.workerIds ?? [],
  files:
    overrides.files ?? { before: [], progress: [], after: [], receipt: [], invoice: [], quote: [] },
  createdAt: overrides.createdAt ?? '2026-04-06T00:00:00.000Z',
  updatedAt: overrides.updatedAt ?? '2026-04-06T00:00:00.000Z',
});

describe('dashboard calendar', () => {
  it('keeps API dates on their calendar day and rejects invalid dates', () => {
    expect(jobDay('2026-09-10T00:00:00.000Z')).toBe('2026-09-10');
    expect(dashboardDate('2026-09-10')).toBe('Sep 10');
    expect(jobDay('2026-02-30')).toBeNull();
    expect(jobDay('invalid')).toBeNull();
    expect(jobDay(null)).toBeNull();
  });

  it('covers complete weeks and clamps month navigation across leap years', () => {
    const september = visibleCalendarDays('2026-09-10', 'Month');
    expect(september).toHaveLength(35);
    expect(september[0]).toBe('2026-08-30');
    expect(september.at(-1)).toBe('2026-10-03');
    expect(visibleCalendarDays('2026-08-10', 'Month')).toHaveLength(42);
    expect(moveCalendar('2028-01-31', 'Month', 1)).toBe('2028-02-29');
    expect(moveCalendar('2026-01-31', 'Month', 1)).toBe('2026-02-28');
    expect(moveCalendar('2026-12-31', 'Day', 1)).toBe('2027-01-01');
    expect(visibleCalendarDays('2027-01-01', 'Week')[0]).toBe('2026-12-27');
    expect(moveCalendar('2026-03-08', 'Week', 1)).toBe('2026-03-15');
  });

  it('includes both ends of a job and uses the actual completion date', () => {
    const active = makeJob({ id: 'active', startDate: '2026-09-09T00:00:00Z', dueDate: '2026-09-11T00:00:00Z' });
    const done = makeJob({ id: 'done', status: 'DONE', startDate: '2026-09-09', dueDate: '2026-09-14', completedAt: '2026-09-10T18:00:00Z' });
    const undated = makeJob({ id: 'undated' });
    expect(jobsForDay([active, done, undated], '2026-09-09').map((job) => job.id)).toEqual(['active', 'done']);
    expect(jobsForDay([active, done], '2026-09-11').map((job) => job.id)).toEqual(['active']);
    expect(jobsForDay([active], '2026-09-12')).toEqual([]);
    expect(jobRange(undated)).toBeNull();
    expect(jobRange(makeJob({ dueDate: '2026-09-10' }))).toEqual({ start: '2026-09-10', end: '2026-09-10' });
    expect(jobRange(makeJob({ startDate: '2026-09-11', dueDate: '2026-09-09' }))).toEqual({ start: '2026-09-09', end: '2026-09-11' });
  });

  it('counts overlapping jobs once per reporting period, including unscheduled records', () => {
    const jobs = [
      makeJob({ id: 'cross-year', startDate: '2025-12-31', dueDate: '2026-01-02' }),
      makeJob({ id: 'september', startDate: '2026-08-31', dueDate: '2026-09-01' }),
      makeJob({ id: 'unscheduled', createdAt: '2026-09-10T13:00:00Z' }),
      makeJob({ id: 'old', startDate: '2025-01-01', dueDate: '2025-01-01' }),
    ];
    expect(jobsForPeriod(jobs, 'year', '2026-09-10').map((job) => job.id)).toEqual(['cross-year', 'september', 'unscheduled']);
    expect(jobsForPeriod(jobs, 'month', '2026-09-10').map((job) => job.id)).toEqual(['september', 'unscheduled']);
    expect(jobsForPeriod(jobs, 'all', '2026-09-10')).toHaveLength(4);
  });

  it('sorts real upcoming deadlines, excluding completed, overdue and undated jobs', () => {
    const jobs = [makeJob({ id: 'later', dueDate: '2026-09-12' }), makeJob({ id: 'today', dueDate: '2026-09-10' }), makeJob({ id: 'overdue', dueDate: '2026-09-09' }), makeJob({ id: 'done', status: 'DONE', dueDate: '2026-09-11' }), makeJob({ id: 'undated' })];
    expect(upcomingDeadlines(jobs, '2026-09-10').map((job) => job.id)).toEqual(['today', 'later']);
  });

  it('preserves board labels and accounts for every job, including unknown statuses', () => {
    const statuses = dashboardStatuses([makeJob({ status: 'DONE' }), makeJob({ status: 'DONE' }), makeJob({ status: 'CUSTOM', statusLabel: 'Inspection' })], [{ kind: 'status', value: 'DONE', label: 'Finished', color: '#405080' }]);
    expect(statuses.find((status) => status.value === 'DONE')).toMatchObject({ label: 'Finished', color: '#405080', count: 2 });
    expect(statuses.find((status) => status.value === 'CUSTOM')).toMatchObject({ label: 'Inspection', count: 1 });
    expect(statuses.reduce((sum, status) => sum + status.count, 0)).toBe(3);
  });
});

describe('buildDashboardFromJobs', () => {
  it('builds dashboard stats and charts from jobs without the api payload', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-06T15:00:00.000Z'));

    const dashboard = buildDashboardFromJobs([
      makeJob({
        id: 'done',
        propertyName: 'Saranac Rd',
        status: 'DONE',
        statusLabel: 'Done',
        paymentStatus: 'PAID',
        paymentStatusLabel: 'Paid',
        materialCost: 100,
        laborCost: 200,
        dueDate: '2026-04-02T00:00:00.000Z',
        workers: [{ id: 'w-1', name: 'Ryan', status: 'ACTIVE', statusLabel: 'Active' }],
      }),
      makeJob({
        id: 'overdue',
        propertyName: 'Adams Av',
        status: 'IN_PROGRESS',
        statusLabel: 'In progress',
        paymentStatus: 'PARTIAL_PAYMENT',
        paymentStatusLabel: 'Partial Payment',
        materialCost: 50,
        laborCost: 75,
        dueDate: '2026-04-01T00:00:00.000Z',
        workers: [{ id: 'w-2', name: 'Juan', status: 'ACTIVE', statusLabel: 'Active' }],
      }),
      makeJob({
        id: 'soon',
        propertyName: 'Saranac Rd',
        status: 'PENDING',
        statusLabel: 'Pending',
        paymentStatus: 'UNPAID',
        paymentStatusLabel: 'Unpaid',
        materialCost: 25,
        laborCost: 30,
        dueDate: '2026-04-08T00:00:00.000Z',
        workers: [{ id: 'w-1', name: 'Ryan', status: 'ACTIVE', statusLabel: 'Active' }],
      }),
    ]);

    expect(dashboard.stats).toMatchObject({
      totalJobs: 3,
      doneJobs: 1,
      inProgressJobs: 1,
      pendingJobs: 1,
      lateJobs: 1,
      unpaidOrPartial: 2,
      materialTotal: 175,
      laborTotal: 305,
    });
    expect(dashboard.charts.properties[0]).toEqual({ label: 'Saranac Rd', value: 2 });
    expect(dashboard.charts.workers[0]).toEqual({ label: 'Ryan', value: 2 });
    expect(dashboard.charts.timeline.map((item) => item.label)).toEqual(
      expect.arrayContaining(['Done', 'Overdue', 'Due soon']),
    );

    vi.useRealTimers();
  });
});
