import { Prisma, type PrismaClient, WorkerHistoryAction, WorkerStatus } from '@prisma/client';
import {
  workerHistoryActionLabels,
  workerStatusLabels,
} from '../data/defaults.js';
import { HttpError } from './http.js';
import { prisma } from './prisma.js';

type WorkerSummaryRecord = {
  id: string;
  name: string;
  status: WorkerStatus;
  assignments?: Array<{ jobId: string }>;
  _count?: {
    assignments: number;
  };
  user: { id: string } | null;
};

type WorkerHistoryRecord = {
  id: string;
  createdAt: Date;
  workerName: string;
  action: WorkerHistoryAction;
  previousStatus: WorkerStatus | null;
  newStatus: WorkerStatus | null;
  performedBy: string | null;
  notes: string | null;
};

export const serializeWorkerSummary = (worker: WorkerSummaryRecord) => {
  const assignmentCount = worker._count?.assignments ?? worker.assignments?.length ?? 0;

  return {
    id: worker.id,
    name: worker.name,
    status: worker.status,
    statusLabel: workerStatusLabels[worker.status],
    totalJobCount: assignmentCount,
    linkedUserCount: worker.user ? 1 : 0,
    canDelete: assignmentCount === 0,
  };
};

export const serializeWorkerHistory = (item: WorkerHistoryRecord) => ({
  id: item.id,
  date: item.createdAt.toISOString(),
  worker: item.workerName,
  action: workerHistoryActionLabels[item.action],
  previousStatus: item.previousStatus ? workerStatusLabels[item.previousStatus] : null,
  newStatus: item.newStatus ? workerStatusLabels[item.newStatus] : null,
  performedBy: item.performedBy,
  notes: item.notes,
});

type WorkerLookupClient =
  | Pick<PrismaClient, 'worker'>
  | Pick<Prisma.TransactionClient, 'worker'>;

export const normalizeWorkerIds = (workerIds: string[]) =>
  Array.from(
    new Set(
      workerIds
        .map((workerId) => String(workerId).trim())
        .filter(Boolean),
    ),
  );

export const ensureWorkerIdsExist = async (
  workerIds: string[],
  client: WorkerLookupClient = prisma,
) => {
  const normalizedWorkerIds = normalizeWorkerIds(workerIds);
  if (!normalizedWorkerIds.length) {
    return normalizedWorkerIds;
  }

  const existingWorkers = await client.worker.findMany({
    where: {
      id: {
        in: normalizedWorkerIds,
      },
    },
    select: {
      id: true,
    },
  });

  if (existingWorkers.length !== normalizedWorkerIds.length) {
    throw new HttpError(
      400,
      'One or more selected workers no longer exist. Refresh the page and try again.',
    );
  }

  return normalizedWorkerIds;
};

export const loadWorker = (workerId: string) =>
  prisma.worker.findUniqueOrThrow({
    where: { id: workerId },
    include: {
      assignments: {
        select: {
          jobId: true,
        },
      },
      user: {
        select: {
          id: true,
        },
      },
    },
  });
