import { UserStatus } from '@prisma/client';
import { env } from '../env.js';
import { authUserSelect, createSessionToken, hashSessionToken } from './auth.js';
import { asyncRoute, type AuthenticatedRequest } from './http.js';
import { prisma } from './prisma.js';
import { sessionTokenFromRequest } from './session.js';

const sessionDurationMs = env.AUTH_SESSION_DAYS * 24 * 60 * 60 * 1000;

export const sessionMiddleware = asyncRoute(async (request, response, next) => {
  const token = sessionTokenFromRequest(request, env.SESSION_COOKIE_NAME);
  if (!token) {
    response.status(401).json({ message: 'Authentication required.' });
    return;
  }

  const session = await prisma.userSession.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: {
      user: {
        select: authUserSelect,
      },
    },
  });

  if (!session || session.expiresAt < new Date() || session.user.status !== UserStatus.ACTIVE) {
    if (session?.id) {
      await prisma.userSession.deleteMany({
        where: { id: session.id },
      });
    }
    response.status(401).json({ message: 'Your session has expired. Please sign in again.' });
    return;
  }

  await prisma.userSession.update({
    where: { id: session.id },
    data: { lastSeenAt: new Date() },
  });

  (request as AuthenticatedRequest).auth = session.user;
  next();
});

export const issueSession = async (userId: string) => {
  const token = createSessionToken();
  const session = await prisma.userSession.create({
    data: {
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt: new Date(Date.now() + sessionDurationMs),
    },
  });

  return {
    token,
    sessionId: session.id,
    expiresAt: session.expiresAt.toISOString(),
  };
};
