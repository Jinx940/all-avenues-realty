import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { HttpError } from './http.js';

export const jobArchiveSchema = z.object({
  archived: z.boolean(),
  jobIds: z.array(z.string().trim().min(1)).min(1).max(5000),
}).strict().refine((input) => new Set(input.jobIds).size === input.jobIds.length, 'Duplicate job IDs.');

// Call inside a transaction: a stale or cross-property selection rolls back in full.
export async function updateJobArchive(tx: Prisma.TransactionClient, propertyId: string, input: unknown) {
  const payload = jobArchiveSchema.parse(input);
  const result = await tx.job.updateMany({
    where: { propertyId, id: { in: payload.jobIds }, archivedAt: payload.archived ? null : { not: null } },
    data: { archivedAt: payload.archived ? new Date() : null },
  });
  if (result.count !== payload.jobIds.length) throw new HttpError(409, 'These jobs have changed. Refresh Job Tracker and try again.');
  return { count: result.count, ...payload };
}
