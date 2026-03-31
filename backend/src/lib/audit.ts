import type { Request } from 'express';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { AuthUser } from './auth.js';

type AuditRequest = Request & { auth?: AuthUser };

export type AuditLogClient = Pick<PrismaClient | Prisma.TransactionClient, 'auditLog'>;

export type AuditLogEntry = {
  entityType: string;
  entityId?: string | null;
  entityLabel?: string | null;
  action: string;
  summary: string;
  metadata?: Prisma.InputJsonValue;
};

export const actorFromRequest = (request: Request) => {
  const auth = (request as AuditRequest).auth;
  return auth?.displayName || auth?.username || 'Admin';
};

const auditActorFromRequest = (request: Request) => {
  const auth = (request as AuditRequest).auth;
  return {
    userId: auth?.id ?? null,
    name: actorFromRequest(request),
  };
};

export const recordAuditLog = async (
  client: AuditLogClient,
  request: Request,
  entry: AuditLogEntry,
) => {
  const actor = auditActorFromRequest(request);

  await client.auditLog.create({
    data: {
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      entityLabel: entry.entityLabel ?? null,
      action: entry.action,
      summary: entry.summary,
      ...(entry.metadata !== undefined ? { metadata: entry.metadata } : {}),
      performedByUserId: actor.userId,
      performedByName: actor.name,
    },
  });
};

export const auditLogSelect = {
  id: true,
  entityType: true,
  entityLabel: true,
  action: true,
  summary: true,
  performedByName: true,
  createdAt: true,
} satisfies Prisma.AuditLogSelect;

export const serializeAuditLog = (
  item: Prisma.AuditLogGetPayload<{
    select: typeof auditLogSelect;
  }>,
) => ({
  id: item.id,
  date: item.createdAt.toISOString(),
  entityType: item.entityType,
  entityLabel: item.entityLabel,
  action: item.action,
  summary: item.summary,
  performedBy: item.performedByName,
});
