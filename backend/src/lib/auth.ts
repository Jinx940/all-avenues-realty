import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Prisma, PrismaClient, UserRole, UserStatus } from '@prisma/client';

export const normalizeUsername = (value: string) => value.trim().toLowerCase();

export const hashPassword = (password: string) => {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
};

export const verifyPassword = (password: string, passwordHash: string) => {
  const [salt, storedHash] = passwordHash.split(':');
  if (!salt || !storedHash) {
    return false;
  }

  const derivedHash = scryptSync(password, salt, 64);
  const storedBuffer = Buffer.from(storedHash, 'hex');
  if (storedBuffer.length !== derivedHash.length) {
    return false;
  }

  return timingSafeEqual(storedBuffer, derivedHash);
};

export const createSessionToken = () => randomBytes(32).toString('hex');

export const hashSessionToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

export const authUserSelect = {
  id: true,
  username: true,
  displayName: true,
  role: true,
  status: true,
  workerId: true,
} satisfies Prisma.UserSelect;

export type AuthUser = Prisma.UserGetPayload<{
  select: typeof authUserSelect;
}>;

export const serializeAuthUser = (user: AuthUser) => ({
  id: user.id,
  username: user.username,
  displayName: user.displayName,
  role: user.role,
  status: user.status,
  workerId: user.workerId,
});

export const ensureDefaultAdminUser = async (
  client: PrismaClient,
  input: {
    username: string;
    password: string;
    displayName: string;
    activeStatus: UserStatus;
    adminRole: UserRole;
  },
) => {
  const username = normalizeUsername(input.username);
  const existing = await client.user.findUnique({
    where: { username },
    select: { id: true },
  });

  if (existing) {
    return existing;
  }

  return client.user.create({
    data: {
      username,
      displayName: input.displayName,
      passwordHash: hashPassword(input.password),
      role: input.adminRole,
      status: input.activeStatus,
    },
    select: { id: true },
  });
};
