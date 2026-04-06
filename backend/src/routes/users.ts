import type { Express } from 'express';
import {
  UserRole,
  UserStatus,
  WorkerHistoryAction,
  WorkerStatus,
} from '@prisma/client';
import {
  actorFromRequest,
  auditLogSelect,
  recordAuditLog,
  serializeAuditLog,
} from '../lib/audit.js';
import { normalizeUsername, hashPassword } from '../lib/auth.js';
import { requireAdmin } from '../lib/access.js';
import {
  asyncRoute,
  type AuthenticatedRequest,
} from '../lib/http.js';
import { prisma } from '../lib/prisma.js';
import { userCreateSchema, userUpdateSchema } from '../lib/schemas.js';
import {
  ensureActiveAdminGuard,
  ensureWorkerRoleLink,
  serializeUserSummary,
  userSummarySelect,
} from '../lib/users.js';

export const registerUserRoutes = (app: Express) => {
  app.get(
    '/api/users',
    asyncRoute(async (request, response) => {
      if (!requireAdmin(request, response)) {
        return;
      }

      const users = await prisma.user.findMany({
        orderBy: [{ role: 'asc' }, { displayName: 'asc' }],
        select: userSummarySelect,
      });

      response.json(users.map(serializeUserSummary));
    }),
  );

  app.get(
    '/api/audit-logs',
    asyncRoute(async (request, response) => {
      if (!requireAdmin(request, response)) {
        return;
      }

      const requestedLimit = Number.parseInt(String(request.query.limit ?? '60'), 10);
      const take = Number.isFinite(requestedLimit)
        ? Math.min(Math.max(requestedLimit, 1), 200)
        : 60;

      const items = await prisma.auditLog.findMany({
        orderBy: {
          createdAt: 'desc',
        },
        take,
        select: auditLogSelect,
      });

      response.json(items.map(serializeAuditLog));
    }),
  );

  app.delete(
    '/api/audit-logs',
    asyncRoute(async (request, response) => {
      if (!requireAdmin(request, response)) {
        return;
      }

      const result = await prisma.auditLog.deleteMany({});
      response.json({
        message: 'Audit history deleted successfully.',
        deletedCount: result.count,
      });
    }),
  );

  app.post(
    '/api/users',
    asyncRoute(async (request, response) => {
      if (!requireAdmin(request, response)) {
        return;
      }

      const payload = userCreateSchema.parse(request.body);
      const username = normalizeUsername(payload.username);
      const workerId = String(payload.workerId ?? '').trim() || null;

      await ensureWorkerRoleLink(payload.role, workerId);

      const existingUser = await prisma.user.findUnique({
        where: { username },
        select: { id: true },
      });

      if (existingUser) {
        response.status(400).json({ message: 'That username is already in use.' });
        return;
      }

      const displayName = payload.displayName.trim();
      const createdUser = await prisma.$transaction(async (transaction) => {
        const user = await transaction.user.create({
          data: {
            username,
            displayName,
            passwordHash: hashPassword(payload.password),
            role: payload.role,
            status: UserStatus.ACTIVE,
            workerId: payload.role === UserRole.WORKER ? workerId : null,
          },
          select: userSummarySelect,
        });

        await recordAuditLog(transaction, request, {
          entityType: 'User',
          entityId: user.id,
          entityLabel: displayName,
          action: 'Created',
          summary: `Created user "${displayName}" with role ${payload.role}.`,
          metadata: {
            username,
            role: payload.role,
            workerId: payload.role === UserRole.WORKER ? workerId : null,
          },
        });

        return user;
      });

      response.status(201).json(serializeUserSummary(createdUser));
    }),
  );

  app.patch(
    '/api/users/:userId',
    asyncRoute(async (request, response) => {
      if (!requireAdmin(request, response)) {
        return;
      }

      const userId = String(request.params.userId);
      const payload = userUpdateSchema.parse(request.body);
      const existingUser = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          displayName: true,
          role: true,
          status: true,
          workerId: true,
        },
      });

      if (!existingUser) {
        response.status(404).json({ message: 'User not found.' });
        return;
      }

      const auth = (request as AuthenticatedRequest).auth;
      const nextRole = payload.role ?? existingUser.role;
      const nextStatus = payload.status ?? existingUser.status;
      const workerId =
        payload.workerId === undefined
          ? existingUser.workerId
          : String(payload.workerId ?? '').trim() || null;

      if (auth?.id === existingUser.id && nextStatus !== UserStatus.ACTIVE) {
        response.status(400).json({ message: 'You cannot disable your current account.' });
        return;
      }

      if (auth?.id === existingUser.id && nextRole !== UserRole.ADMIN) {
        response.status(400).json({ message: 'You cannot remove admin access from your current account.' });
        return;
      }

      await ensureWorkerRoleLink(nextRole, workerId, {
        currentUserId: existingUser.id,
      });
      await ensureActiveAdminGuard({
        currentUserId: existingUser.id,
        existingRole: existingUser.role,
        existingStatus: existingUser.status,
        nextRole,
        nextStatus,
      });

      const nextDisplayName = payload.displayName?.trim() || existingUser.displayName;
      const changedFields = [
        payload.displayName && nextDisplayName !== existingUser.displayName ? 'display name' : null,
        payload.password ? 'password' : null,
        payload.role && nextRole !== existingUser.role ? 'role' : null,
        payload.status && nextStatus !== existingUser.status ? 'status' : null,
        workerId !== existingUser.workerId ? 'linked worker' : null,
      ].filter((value): value is string => Boolean(value));

      const updatedUser = await prisma.$transaction(async (transaction) => {
        const user = await transaction.user.update({
          where: { id: userId },
          data: {
            ...(payload.displayName ? { displayName: nextDisplayName } : {}),
            ...(payload.password ? { passwordHash: hashPassword(payload.password) } : {}),
            ...(payload.role ? { role: nextRole } : {}),
            ...(payload.status ? { status: nextStatus } : {}),
            workerId: nextRole === UserRole.WORKER ? workerId : null,
          },
          select: userSummarySelect,
        });

        await recordAuditLog(transaction, request, {
          entityType: 'User',
          entityId: user.id,
          entityLabel: nextDisplayName,
          action: 'Updated',
          summary: changedFields.length
            ? `Updated user "${nextDisplayName}" (${changedFields.join(', ')}).`
            : `Updated user "${nextDisplayName}".`,
          metadata: {
            username: existingUser.username,
            role: nextRole,
            status: nextStatus,
            workerId: nextRole === UserRole.WORKER ? workerId : null,
            changedFields,
          },
        });

        return user;
      });

      response.json(serializeUserSummary(updatedUser));
    }),
  );

  app.delete(
    '/api/users/:userId',
    asyncRoute(async (request, response) => {
      if (!requireAdmin(request, response)) {
        return;
      }

      const userId = String(request.params.userId);
      const auth = (request as AuthenticatedRequest).auth;

      if (auth?.id === userId) {
        response.status(400).json({ message: 'You cannot delete your current account.' });
        return;
      }

      const existingUser = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          displayName: true,
          role: true,
          status: true,
        },
      });

      if (!existingUser) {
        response.status(404).json({ message: 'User not found.' });
        return;
      }

      await ensureActiveAdminGuard({
        currentUserId: existingUser.id,
        existingRole: existingUser.role,
        existingStatus: existingUser.status,
        nextRole: UserRole.VIEWER,
        nextStatus: UserStatus.INACTIVE,
      });

      await prisma.$transaction(async (transaction) => {
        await transaction.userSession.deleteMany({
          where: { userId },
        });

        await transaction.user.delete({
          where: { id: userId },
        });

        await recordAuditLog(transaction, request, {
          entityType: 'User',
          entityId: existingUser.id,
          entityLabel: existingUser.displayName,
          action: 'Deleted',
          summary: `Deleted user "${existingUser.displayName}".`,
          metadata: {
            username: existingUser.username,
            role: existingUser.role,
            status: existingUser.status,
          },
        });
      });

      response.json({ ok: true });
    }),
  );

  app.post(
    '/api/users/:userId/link-worker',
    asyncRoute(async (request, response) => {
      if (!requireAdmin(request, response)) {
        return;
      }

      const userId = String(request.params.userId);
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          role: true,
          workerId: true,
        },
      });

      if (!user) {
        response.status(404).json({ message: 'User not found.' });
        return;
      }

      if (user.role !== UserRole.WORKER) {
        response.status(400).json({ message: 'Only WORKER users can be linked to a worker.' });
        return;
      }

      if (user.workerId) {
        response.status(400).json({ message: 'This user already has a linked worker.' });
        return;
      }

      const workerName = user.username.trim();
      const existingWorker = await prisma.worker.findUnique({
        where: { name: workerName },
        select: {
          id: true,
          name: true,
          user: {
            select: {
              id: true,
            },
          },
        },
      });

      let workerId = existingWorker?.id ?? null;

      if (existingWorker?.user && existingWorker.user.id !== user.id) {
        response.status(400).json({
          message: `Worker "${workerName}" is already linked to another user.`,
        });
        return;
      }

      await prisma.$transaction(async (transaction) => {
        if (!workerId) {
          const created = await transaction.worker.create({
            data: {
              name: workerName,
              status: WorkerStatus.ACTIVE,
            },
          });

          workerId = created.id;

          await transaction.workerHistory.create({
            data: {
              workerId: created.id,
              workerName: created.name,
              action: WorkerHistoryAction.ADDED,
              newStatus: WorkerStatus.ACTIVE,
              performedBy: actorFromRequest(request),
            },
          });
        }

        await transaction.user.update({
          where: { id: user.id },
          data: {
            workerId,
          },
        });

        await recordAuditLog(transaction, request, {
          entityType: 'User',
          entityId: user.id,
          entityLabel: user.username,
          action: 'Linked worker',
          summary: `Linked worker "${workerName}" to user "${user.username}".`,
          metadata: {
            workerId,
            workerName,
          },
        });
      });

      const updatedUser = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: userSummarySelect,
      });

      response.json(serializeUserSummary(updatedUser));
    }),
  );
};
