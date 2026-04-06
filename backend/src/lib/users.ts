import { Prisma, type PrismaClient, UserRole, UserStatus } from '@prisma/client';
import { prisma } from './prisma.js';
import { HttpError } from './http.js';

export const userSummarySelect = {
  id: true,
  username: true,
  displayName: true,
  role: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  worker: {
    select: {
      id: true,
      name: true,
      status: true,
    },
  },
} satisfies Prisma.UserSelect;

export type UserSummaryRecord = Prisma.UserGetPayload<{
  select: typeof userSummarySelect;
}>;

export const serializeUserSummary = (user: UserSummaryRecord) => ({
  id: user.id,
  username: user.username,
  displayName: user.displayName,
  role: user.role,
  status: user.status,
  linkedWorker: user.worker
    ? {
        id: user.worker.id,
        name: user.worker.name,
        status: user.worker.status,
      }
    : null,
  createdAt: user.createdAt.toISOString(),
  updatedAt: user.updatedAt.toISOString(),
});

type WorkerLinkClient =
  | Pick<PrismaClient, 'worker'>
  | Pick<Prisma.TransactionClient, 'worker'>;

type ActiveAdminGuardClient =
  | Pick<PrismaClient, 'user'>
  | Pick<Prisma.TransactionClient, 'user'>;

export const ensureWorkerRoleLink = async (
  role: UserRole,
  workerId: string | null | undefined,
  options?: {
    currentUserId?: string;
    client?: WorkerLinkClient;
  },
) => {
  if (role !== UserRole.WORKER) {
    return null;
  }

  const normalizedWorkerId = String(workerId ?? '').trim();
  if (!normalizedWorkerId) {
    throw new HttpError(400, 'Worker users must be linked to a worker profile.');
  }

  const client = options?.client ?? prisma;
  const worker = await client.worker.findUnique({
    where: { id: normalizedWorkerId },
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

  if (!worker) {
    throw new HttpError(400, 'The selected worker profile does not exist.');
  }

  if (worker.user?.id && worker.user.id !== options?.currentUserId) {
    throw new HttpError(400, `Worker "${worker.name}" is already linked to another user.`);
  }

  return worker;
};

export const ensureActiveAdminGuard = async (input: {
  currentUserId?: string;
  existingRole: UserRole;
  existingStatus: UserStatus;
  nextRole: UserRole;
  nextStatus: UserStatus;
}, client: ActiveAdminGuardClient = prisma) => {
  if (input.existingRole !== UserRole.ADMIN) {
    return;
  }

  if (input.nextRole === UserRole.ADMIN && input.nextStatus === UserStatus.ACTIVE) {
    return;
  }

  const otherActiveAdmins = await client.user.count({
    where: {
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      ...(input.currentUserId ? { NOT: { id: input.currentUserId } } : {}),
    },
  });

  if (otherActiveAdmins === 0) {
    throw new HttpError(400, 'At least one active admin account must remain available.');
  }
};
