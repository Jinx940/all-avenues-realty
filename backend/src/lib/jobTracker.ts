import { JobPriority, JobStatus, PaymentStatus } from '@prisma/client';
import { z } from 'zod';
import { parseNullableLocalDate } from './dates.js';
import { HttpError } from './http.js';
import { trackerSubitemSchema } from './trackerSubitems.js';

const usdAmount = z.number().finite().min(0).max(9999999999.99).refine(
  (value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.0001,
  'Use at most two decimal places.',
);

export const trackerColumnKeySchema = z.enum([
  'area', 'service', 'workers', 'status', 'dueDate', 'description', 'priority', 'paymentStatus',
  'laborCost', 'materialCost', 'before', 'after', 'timeline', 'updatedAt', 'actions',
]);
export const trackerColumnUpdateSchema = z.object({ label: z.string().trim().min(1).max(40) }).strict();

export const trackerUpdateSchema = z.object({
  service: z.string().trim().min(1).max(160).optional(),
  subitem: trackerSubitemSchema.optional(),
  status: z.nativeEnum(JobStatus).optional(),
  priority: z.nativeEnum(JobPriority).nullable().optional(),
  startDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  description: z.string().max(3000).optional(),
  laborCost: usdAmount.optional(),
  materialCost: usdAmount.optional(),
  paymentStatus: z.nativeEnum(PaymentStatus).optional(),
  advanceCashApp: usdAmount.optional(),
  workerIds: z.array(z.string().trim().min(1)).max(100).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'No changes provided.')
  .refine((value) => !value.subitem || Object.keys(value).length === 1, 'Save subitem changes separately.');

export function buildTrackerUpdate(existing: {
  status: JobStatus; completedAt: Date | null; startDate: Date | null; dueDate: Date | null;
}, input: unknown, now = new Date()) {
  const payload = trackerUpdateSchema.parse(input);
  const startDate = payload.startDate === undefined ? existing.startDate : parseNullableLocalDate(payload.startDate, 'startDate');
  const dueDate = payload.dueDate === undefined ? existing.dueDate : parseNullableLocalDate(payload.dueDate, 'dueDate');
  if ((payload.startDate !== undefined || payload.dueDate !== undefined) && startDate && dueDate && startDate > dueDate) {
    throw new HttpError(400, 'The end date must be on or after the start date.');
  }
  return {
    ...(payload.service !== undefined ? { service: payload.service } : {}),
    ...(payload.subitem !== undefined ? { subitem: payload.subitem } : {}),
    ...(payload.status !== undefined ? {
      status: payload.status,
      completedAt: payload.status === JobStatus.DONE
        ? existing.status === JobStatus.DONE ? existing.completedAt ?? now : now
        : null,
    } : {}),
    ...(payload.priority !== undefined ? { priority: payload.priority } : {}),
    ...(payload.startDate !== undefined ? { startDate } : {}),
    ...(payload.dueDate !== undefined ? { dueDate } : {}),
    ...(payload.description !== undefined ? { description: payload.description } : {}),
    ...(payload.laborCost !== undefined ? { laborCost: payload.laborCost } : {}),
    ...(payload.materialCost !== undefined ? { materialCost: payload.materialCost } : {}),
    ...(payload.paymentStatus !== undefined ? { paymentStatus: payload.paymentStatus } : {}),
    ...(payload.advanceCashApp !== undefined ? { advanceCashApp: payload.advanceCashApp } : {}),
    ...(payload.workerIds !== undefined ? { workerIds: [...new Set(payload.workerIds)] } : {}),
  };
}

export const trackerLabelSchema = z.object({
  kind: z.enum(['status', 'priority']),
  value: z.string(),
  label: z.string().trim().min(1).max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hexadecimal color.'),
}).strict().superRefine((value, context) => {
  const values: string[] = value.kind === 'status' ? Object.values(JobStatus) : [...Object.values(JobPriority), 'NONE'];
  if (!values.includes(value.value)) context.addIssue({ code: 'custom', path: ['value'], message: 'Unknown label.' });
});

export const trackerLabelsSchema = z.array(trackerLabelSchema).min(1).max(9).refine(
  (labels) => new Set(labels.map((label) => `${label.kind}:${label.value}`)).size === labels.length,
  'Duplicate labels.',
);
