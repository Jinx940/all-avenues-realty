import type { Express } from 'express';
import { WorkerHistoryAction, WorkerStatus } from '@prisma/client';
import { actorFromRequest, recordAuditLog } from '../lib/audit.js';
import { normalizeUsername } from '../lib/auth.js';
import { requireAdmin } from '../lib/access.js';
import { asyncRoute } from '../lib/http.js';
import { prisma } from '../lib/prisma.js';
import { workerSchema, workerStatusSchema } from '../lib/schemas.js';
import {
  loadWorker,
  serializeWorkerHistory,
  serializeWorkerSummary,
} from '../lib/workers.js';

export const registerWorkerRoutes = (app: Express) => {
  app.post(
    '/api/workers',
    asyncRoute(async (request, response) => {
      if (!requireAdmin(request, response)) {
        return;
      }

      const payload = workerSchema.parse(request.body);
      const normalizedLookup = normalizeUsername(payload.name);

      const availableUser = await prisma.user.findUnique({
        where: { username: normalizedLookup },
        select: {
          id: true,
          workerId: true,
        },
      });

      const created = await prisma.$transaction(async (transaction) => {
        const worker = await transaction.worker.create({
          data: {
            name: payload.name,
            status: WorkerStatus.ACTIVE,
          },
        });

        await transaction.workerHistory.create({
          data: {
            workerId: worker.id,
            workerName: worker.name,
            action: WorkerHistoryAction.ADDED,
            newStatus: WorkerStatus.ACTIVE,
            performedBy: actorFromRequest(request),
          },
        });

        if (availableUser && !availableUser.workerId) {
          await transaction.user.update({
            where: { id: availableUser.id },
            data: {
              workerId: worker.id,
            },
          });
        }

        await recordAuditLog(transaction, request, {
          entityType: 'Worker',
          entityId: worker.id,
          entityLabel: worker.name,
          action: 'Created',
          summary: `Created worker "${worker.name}".`,
          metadata: {
            linkedUserId: availableUser?.id ?? null,
          },
        });

        return worker;
      });

      response.status(201).json(serializeWorkerSummary(await loadWorker(created.id)));
    }),
  );

  app.patch(
    '/api/workers/:workerId/status',
    asyncRoute(async (request, response) => {
      if (!requireAdmin(request, response)) {
        return;
      }

      const workerId = String(request.params.workerId);
      const payload = workerStatusSchema.parse(request.body);
      const previous = await prisma.worker.findUniqueOrThrow({
        where: {
          id: workerId,
        },
      });

      const worker = await prisma.$transaction(async (transaction) => {
        const updatedWorker = await transaction.worker.update({
          where: {
            id: workerId,
          },
          data: {
            status: payload.status,
          },
        });

        await transaction.workerHistory.create({
          data: {
            workerId: updatedWorker.id,
            workerName: updatedWorker.name,
            action:
              payload.status === WorkerStatus.ACTIVE
                ? WorkerHistoryAction.ENABLED
                : WorkerHistoryAction.DISABLED,
            previousStatus: previous.status,
            newStatus: payload.status,
            performedBy: actorFromRequest(request),
          },
        });

        await recordAuditLog(transaction, request, {
          entityType: 'Worker',
          entityId: updatedWorker.id,
          entityLabel: updatedWorker.name,
          action: 'Updated status',
          summary: `Changed worker "${updatedWorker.name}" from ${previous.status} to ${payload.status}.`,
          metadata: {
            previousStatus: previous.status,
            nextStatus: payload.status,
          },
        });

        return updatedWorker;
      });

      response.json(serializeWorkerSummary(await loadWorker(worker.id)));
    }),
  );

  app.delete(
    '/api/workers/history',
    asyncRoute(async (request, response) => {
      if (!requireAdmin(request, response)) {
        return;
      }

      const deletedCount = await prisma.workerHistory.deleteMany({});

      await recordAuditLog(prisma, request, {
        entityType: 'Worker history',
        action: 'Cleared',
        summary: `Cleared ${deletedCount.count} worker history entr${deletedCount.count === 1 ? 'y' : 'ies'}.`,
        metadata: {
          deletedCount: deletedCount.count,
        },
      });

      response.json({ message: 'Worker history deleted successfully.' });
    }),
  );

  app.delete(
    '/api/workers/:workerId',
    asyncRoute(async (request, response) => {
      if (!requireAdmin(request, response)) {
        return;
      }

      const workerId = String(request.params.workerId);
      const worker = await prisma.worker.findUniqueOrThrow({
        where: {
          id: workerId,
        },
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

      if (worker.assignments.length) {
        response.status(400).json({
          message: 'This worker already has job history. Disable the worker instead of deleting it.',
        });
        return;
      }

      await prisma.$transaction(async (transaction) => {
        await transaction.user.updateMany({
          where: {
            workerId,
          },
          data: {
            workerId: null,
          },
        });

        await transaction.worker.delete({
          where: {
            id: workerId,
          },
        });

        await transaction.workerHistory.create({
          data: {
            workerName: worker.name,
            action: WorkerHistoryAction.DELETED,
            previousStatus: worker.status,
            performedBy: actorFromRequest(request),
          },
        });

        await recordAuditLog(transaction, request, {
          entityType: 'Worker',
          entityId: worker.id,
          entityLabel: worker.name,
          action: 'Deleted',
          summary: `Deleted worker "${worker.name}".`,
          metadata: {
            previousStatus: worker.status,
          },
        });
      });

      response.json({ message: 'Worker deleted successfully.' });
    }),
  );

  app.get(
    '/api/workers/history',
    asyncRoute(async (request, response) => {
      if (!requireAdmin(request, response)) {
        return;
      }

      const history = await prisma.workerHistory.findMany({
        orderBy: {
          createdAt: 'desc',
        },
      });

      response.json(history.map(serializeWorkerHistory));
    }),
  );
};
