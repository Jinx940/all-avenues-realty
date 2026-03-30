import { describe, expect, it, vi } from 'vitest';
import { buildAdvanceCashAlerts } from './advanceCashAlerts';
import type { JobRow } from '../types';

const makeJob = (overrides: Partial<JobRow>): JobRow => ({
  id: overrides.id ?? 'job-1',
  propertyId: overrides.propertyId ?? 'property-1',
  propertyName: overrides.propertyName ?? '1018 Starr Avenue',
  story: overrides.story ?? 'Story 1',
  unit: overrides.unit ?? 'Unit 1',
  section: overrides.section ?? 'Story 1 / Unit 1',
  area: overrides.area ?? 'Kitchen',
  service: overrides.service ?? 'Kitchen',
  description: overrides.description ?? '',
  materialCost: overrides.materialCost ?? 0,
  laborCost: overrides.laborCost ?? 0,
  totalCost: overrides.totalCost ?? 0,
  status: overrides.status ?? 'IN_PROGRESS',
  statusLabel: overrides.statusLabel ?? 'In progress',
  invoiceStatus: overrides.invoiceStatus ?? 'NO',
  invoiceStatusLabel: overrides.invoiceStatusLabel ?? 'No',
  paymentStatus: overrides.paymentStatus ?? 'PARTIAL_PAYMENT',
  paymentStatusLabel: overrides.paymentStatusLabel ?? 'Partial Payment',
  advanceCashApp: overrides.advanceCashApp ?? 100,
  startDate: overrides.startDate ?? null,
  dueDate: overrides.dueDate ?? null,
  completedAt: overrides.completedAt ?? null,
  timeline: overrides.timeline ?? { label: '', tone: 'neutral', isLate: false },
  workers: overrides.workers ?? [],
  workerIds: overrides.workerIds ?? [],
  files: overrides.files ?? { before: [], progress: [], after: [], receipt: [], invoice: [], quote: [] },
  createdAt: overrides.createdAt ?? '2026-03-28T00:00:00.000Z',
  updatedAt: overrides.updatedAt ?? '2026-03-28T00:00:00.000Z',
});

describe('buildAdvanceCashAlerts', () => {
  it('returns only partial payment jobs with an advance cash amount', () => {
    const alerts = buildAdvanceCashAlerts([
      makeJob({ id: 'a', paymentStatus: 'PARTIAL_PAYMENT', advanceCashApp: 50 }),
      makeJob({ id: 'b', paymentStatus: 'PAID', advanceCashApp: 50 }),
      makeJob({ id: 'c', paymentStatus: 'PARTIAL_PAYMENT', advanceCashApp: 0 }),
    ]);

    expect(alerts.map((item) => item.jobId)).toEqual(['a']);
  });

  it('sorts overdue items before due today, upcoming and unscheduled', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-28T12:00:00.000Z'));

    const alerts = buildAdvanceCashAlerts([
      makeJob({ id: 'unscheduled', dueDate: null }),
      makeJob({ id: 'today', dueDate: '2026-03-28T00:00:00.000Z' }),
      makeJob({ id: 'upcoming', dueDate: '2026-03-30T00:00:00.000Z' }),
      makeJob({ id: 'overdue', dueDate: '2026-03-25T00:00:00.000Z' }),
    ]);

    expect(alerts.map((item) => item.jobId)).toEqual(['overdue', 'today', 'upcoming', 'unscheduled']);
    vi.useRealTimers();
  });
});
