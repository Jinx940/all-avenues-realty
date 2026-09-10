import { JobStatus, type Prisma } from '@prisma/client';
import { z } from 'zod';
import { parseNullableLocalDate } from './dates.js';
import { HttpError } from './http.js';
import { ensureWorkerIdsExist } from './workers.js';

const fields = z.object({
  description: z.string().trim().min(1).max(3000),
  status: z.nativeEnum(JobStatus),
  dueDate: z.string().nullable(),
  workerIds: z.array(z.string().trim().min(1)).max(100),
});
export const trackerSubitemSchema = z.discriminatedUnion('action', [
  fields.partial().required({ description: true }).extend({ action: z.literal('create') }).strict(),
  fields.partial().extend({ action: z.literal('update'), id: z.string().min(1) }).strict()
    .refine((value) => Object.keys(value).length > 2, 'No changes provided.'),
  z.object({ action: z.literal('delete'), id: z.string().min(1) }).strict(),
]);

export const descriptionParagraphs = (description: string) => description.split(/\r?\n+/).map((line) => line.trim()).filter(Boolean);

export async function applyTrackerSubitem(tx: Prisma.TransactionClient, jobId: string, input: z.infer<typeof trackerSubitemSchema>) {
  const change = trackerSubitemSchema.parse(input);
  if (change.action !== 'create') {
    const existing = await tx.jobSubitem.findFirst({ where: { id: change.id, jobId }, select: { id: true } });
    if (!existing) throw new HttpError(404, 'Subitem not found in this job.');
    if (change.action === 'delete') {
      await tx.jobSubitem.delete({ where: { id: existing.id } });
      return;
    }
  }
  const { action, description, status, dueDate, workerIds } = change;
  const assignedIds = workerIds === undefined ? undefined : await ensureWorkerIdsExist(workerIds, tx);
  const data = {
    ...(description !== undefined ? { description } : {}),
    ...(status !== undefined ? { status } : {}),
    ...(dueDate !== undefined ? { dueDate: parseNullableLocalDate(dueDate, 'subitem date') } : {}),
  };
  if (action === 'create') {
    const last = await tx.jobSubitem.aggregate({ where: { jobId }, _max: { sortOrder: true } });
    await tx.jobSubitem.create({ data: {
      ...data, description: change.description, jobId, sortOrder: (last._max.sortOrder ?? -1) + 1,
      assignments: { create: (assignedIds ?? []).map((workerId) => ({ workerId })) },
    } });
  } else {
    await tx.jobSubitem.update({ where: { id: change.id }, data: {
      ...data,
      ...(assignedIds !== undefined ? { assignments: { deleteMany: {}, create: assignedIds.map((workerId) => ({ workerId })) } } : {}),
    } });
  }
}
