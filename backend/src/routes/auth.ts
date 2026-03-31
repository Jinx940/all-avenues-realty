import type { Express } from 'express';
import { UserStatus } from '@prisma/client';
import { env } from '../env.js';
import { recordAuditLog } from '../lib/audit.js';
import {
  authUserSelect,
  hashPassword,
  hashSessionToken,
  normalizeUsername,
  serializeAuthUser,
  verifyPassword,
} from '../lib/auth.js';
import {
  asyncRoute,
  setNoStore,
  type AuthenticatedRequest,
} from '../lib/http.js';
import { prisma } from '../lib/prisma.js';
import { loginSchema, passwordChangeSchema } from '../lib/schemas.js';
import { issueSession, sessionMiddleware } from '../lib/sessionAuth.js';
import {
  clearSessionCookie,
  sessionTokenFromRequest,
  setSessionCookie,
} from '../lib/session.js';

export const registerAuthRoutes = (app: Express) => {
  app.post(
    '/api/auth/login',
    asyncRoute(async (request, response) => {
      setNoStore(response);
      const payload = loginSchema.parse(request.body);
      const username = normalizeUsername(payload.username);

      const user = await prisma.user.findUnique({
        where: { username },
        select: {
          ...authUserSelect,
          passwordHash: true,
        },
      });

      if (!user || user.status !== UserStatus.ACTIVE || !verifyPassword(payload.password, user.passwordHash)) {
        response.status(401).json({ message: 'Invalid username or password.' });
        return;
      }

      const { token, expiresAt } = await issueSession(user.id);
      setSessionCookie(response, env, token);

      response.json({
        expiresAt,
        user: serializeAuthUser(user),
      });
    }),
  );

  app.get(
    '/api/auth/session',
    sessionMiddleware,
    asyncRoute(async (request, response) => {
      setNoStore(response);
      const auth = (request as AuthenticatedRequest).auth;
      if (!auth) {
        response.status(401).json({ message: 'Authentication required.' });
        return;
      }

      response.json({
        user: serializeAuthUser(auth),
      });
    }),
  );

  app.post(
    '/api/auth/logout',
    sessionMiddleware,
    asyncRoute(async (request, response) => {
      setNoStore(response);
      const token = sessionTokenFromRequest(request, env.SESSION_COOKIE_NAME);
      await prisma.userSession.deleteMany({
        where: { tokenHash: hashSessionToken(token) },
      });

      clearSessionCookie(response, env);
      response.json({ ok: true });
    }),
  );

  app.post(
    '/api/auth/change-password',
    sessionMiddleware,
    asyncRoute(async (request, response) => {
      setNoStore(response);
      const auth = (request as AuthenticatedRequest).auth;
      if (!auth) {
        response.status(401).json({ message: 'Authentication required.' });
        return;
      }

      const payload = passwordChangeSchema.parse(request.body);
      const user = await prisma.user.findUnique({
        where: { id: auth.id },
        select: {
          id: true,
          username: true,
          displayName: true,
          passwordHash: true,
        },
      });

      if (!user) {
        response.status(404).json({ message: 'User not found.' });
        return;
      }

      if (!verifyPassword(payload.currentPassword, user.passwordHash)) {
        response.status(400).json({ message: 'The current password is incorrect.' });
        return;
      }

      if (verifyPassword(payload.newPassword, user.passwordHash)) {
        response.status(400).json({ message: 'The new password must be different from the current one.' });
        return;
      }

      const currentToken = sessionTokenFromRequest(request, env.SESSION_COOKIE_NAME);
      const currentTokenHash = currentToken ? hashSessionToken(currentToken) : null;

      await prisma.$transaction(async (transaction) => {
        await transaction.user.update({
          where: { id: user.id },
          data: {
            passwordHash: hashPassword(payload.newPassword),
          },
        });

        await transaction.userSession.deleteMany({
          where: {
            userId: user.id,
            ...(currentTokenHash ? { NOT: { tokenHash: currentTokenHash } } : {}),
          },
        });

        await recordAuditLog(transaction, request, {
          entityType: 'User',
          entityId: user.id,
          entityLabel: user.displayName,
          action: 'Changed password',
          summary: `Changed password for "${user.displayName}".`,
          metadata: {
            username: user.username,
          },
        });
      });

      response.json({ ok: true });
    }),
  );
};
