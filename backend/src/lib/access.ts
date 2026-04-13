import type { Request, Response } from 'express';
import { Prisma, UserRole } from '@prisma/client';
import type { AuthUser } from './auth.js';
import type { AuthenticatedRequest } from './http.js';

export const isAdmin = (role: UserRole) => role === UserRole.ADMIN;

export const canManageJobs = (role: UserRole) =>
  role === UserRole.ADMIN || role === UserRole.OFFICE;

export const canCreateJobs = (role: UserRole) =>
  canManageJobs(role) || role === UserRole.WORKER;

export const canViewAllJobs = (role: UserRole) =>
  role === UserRole.ADMIN || role === UserRole.OFFICE || role === UserRole.VIEWER;

export const canManageDocuments = (role: UserRole) =>
  role === UserRole.ADMIN || role === UserRole.OFFICE;

export const roleScopeForJobs = (auth: AuthUser): Prisma.JobWhereInput =>
  canViewAllJobs(auth.role)
    ? {}
    : {
        assignments: {
          some: {
            workerId: auth.workerId ?? '__no-worker__',
          },
        },
      };

export const roleScopeForProperties = (auth: AuthUser): Prisma.PropertyWhereInput =>
  canViewAllJobs(auth.role)
    ? {}
    : {
        jobs: {
          some: roleScopeForJobs(auth),
        },
      };

export const roleScopeForDocuments = (auth: AuthUser): Prisma.GeneratedDocumentWhereInput =>
  canViewAllJobs(auth.role)
    ? {}
    : {
        files: {
          some: {
            job: roleScopeForJobs(auth),
          },
        },
      };

export const assertRole = (
  request: Request,
  response: Response,
  predicate: (role: UserRole) => boolean,
  message: string,
) => {
  const auth = (request as AuthenticatedRequest).auth;
  if (!auth || !predicate(auth.role)) {
    response.status(403).json({ message });
    return false;
  }

  return true;
};

export const requireAdmin = (
  request: Request,
  response: Response,
  message = 'Admin access required.',
) => assertRole(request, response, isAdmin, message);

export const requireJobManager = (
  request: Request,
  response: Response,
  message = 'You do not have permission to manage jobs.',
) => assertRole(request, response, canManageJobs, message);

export const requireJobCreator = (
  request: Request,
  response: Response,
  message = 'You do not have permission to create jobs.',
) => assertRole(request, response, canCreateJobs, message);

export const requireDocumentManager = (
  request: Request,
  response: Response,
  message = 'You do not have permission to generate documents.',
) => assertRole(request, response, canManageDocuments, message);
