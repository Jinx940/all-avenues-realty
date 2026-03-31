import { Prisma, UserRole, UserStatus } from '@prisma/client';
import { prisma } from './prisma.js';

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

export const ensureWorkerRoleLink = async (
  role: UserRole,
  workerId: string | null | undefined,
) => {
  void role;
  void workerId;
};

export const ensureActiveAdminGuard = async (input: {
  currentUserId?: string;
  existingRole: UserRole;
  existingStatus: UserStatus;
  nextRole: UserRole;
  nextStatus: UserStatus;
}) => {
  if (input.existingRole !== UserRole.ADMIN) {
    return;
  }

  if (input.nextRole === UserRole.ADMIN && input.nextStatus === UserStatus.ACTIVE) {
    return;
  }

  const otherActiveAdmins = await prisma.user.count({
    where: {
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      ...(input.currentUserId ? { NOT: { id: input.currentUserId } } : {}),
    },
  });

  if (otherActiveAdmins === 0) {
    throw new Error('At least one active admin account must remain available.');
  }
};
