import { JobPriority, JobStatus } from '@prisma/client';
import { z } from 'zod';
import { parseNullableLocalDate } from './dates.js';
import { HttpError } from './http.js';

export const trackerUpdateSchema = z.object({
  status: z.nativeEnum(JobStatus).optional(),
  priority: z.nativeEnum(JobPriority).nullable().optional(),
  startDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'No changes provided.');

export function buildTrackerUpdate(existing: {
  status: JobStatus; completedAt: Date | null; startDate: Date | null; dueDate: Date | null;
}, input: unknown, now = new Date()) {
  const payload = trackerUpdateSchema.parse(input);
  const startDate = payload.startDate === undefined ? existing.startDate : parseNullableLocalDate(payload.startDate, 'startDate');
  const dueDate = payload.dueDate === undefined ? existing.dueDate : parseNullableLocalDate(payload.dueDate, 'dueDate');
  if ((payload.startDate !== undefined || payload.dueDate !== undefined) && startDate && dueDate && startDate > dueDate) {
    throw new HttpError(400, 'La fecha final debe ser igual o posterior a la fecha inicial.');
  }
  return {
    ...(payload.status !== undefined ? {
      status: payload.status,
      completedAt: payload.status === JobStatus.DONE
        ? existing.status === JobStatus.DONE ? existing.completedAt ?? now : now
        : null,
    } : {}),
    ...(payload.priority !== undefined ? { priority: payload.priority } : {}),
    ...(payload.startDate !== undefined ? { startDate } : {}),
    ...(payload.dueDate !== undefined ? { dueDate } : {}),
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
