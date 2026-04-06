import { describe, expect, it, vi } from 'vitest';
import { buildDashboardFromJobs } from './dashboard';
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
