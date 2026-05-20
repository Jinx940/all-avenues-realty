import { describe, expect, it } from 'vitest';
import type { JobRow } from '../types';
import { buildOperationsAlerts } from './operationsAlerts';

const emptyFiles = () => ({
  before: [],
  progress: [],
  after: [],
  receipt: [],
  invoice: [],
  quote: [],
});

const makeJob = (overrides: Partial<JobRow> = {}): JobRow => ({
  id: 'job-1',
  propertyId: 'property-1',
  propertyName: 'Saranac Rd',
  story: '',
  section: '',
  unit: '',
  area: 'Kitchen',
  service: 'Paint',
  description: '',
  materialCost: 100,
  laborCost: 200,
  totalCost: 300,
  status: 'IN_PROGRESS',
  statusLabel: 'In Progress',
  invoiceStatus: 'NO',
  invoiceStatusLabel: 'No',
  paymentStatus: 'NOT_INVOICED_YET',
  paymentStatusLabel: 'Not invoiced yet',
  advanceCashApp: 0,
  startDate: null,
  dueDate: null,
  completedAt: null,
  workerIds: ['worker-1'],
  workers: [],
  files: emptyFiles(),
  timeline: {
    tone: 'neutral',
    label: 'No due date',
    isLate: false,
  },
  createdAt: '2026-05-18T00:00:00.000Z',
  updatedAt: '2026-05-18T00:00:00.000Z',
  ...overrides,
});

describe('buildOperationsAlerts', () => {
  it('flags missing invoices only after the job is done', () => {
    const openJobAlerts = buildOperationsAlerts([makeJob()]);
    const doneJobAlerts = buildOperationsAlerts([
      makeJob({
        status: 'DONE',
        statusLabel: 'Done',
        completedAt: '2026-05-18T00:00:00.000Z',
      }),
    ]);

    expect(openJobAlerts.some((alert) => alert.kind === 'invoice')).toBe(false);
    expect(doneJobAlerts.some((alert) => alert.kind === 'invoice')).toBe(true);
  });
});
