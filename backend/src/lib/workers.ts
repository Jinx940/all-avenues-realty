import { WorkerHistoryAction, WorkerStatus } from '@prisma/client';
import {
  workerHistoryActionLabels,
  workerStatusLabels,
} from '../data/defaults.js';
import { prisma } from './prisma.js';

type WorkerSummaryRecord = {
  id: string;
  name: string;
  status: WorkerStatus;
  assignments: Array<{ jobId: string }>;
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

export const serializeWorkerSummary = (worker: WorkerSummaryRecord) => ({
  id: worker.id,
  name: worker.name,
  status: worker.status,
  statusLabel: workerStatusLabels[worker.status],
  totalJobCount: worker.assignments.length,
  linkedUserCount: worker.user ? 1 : 0,
  canDelete: worker.assignments.length === 0,
});

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
