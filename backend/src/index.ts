import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import multer from 'multer';
import {
  Prisma,
  DocumentOwner,
  FileCategory,
  GeneratedDocumentType,
  InvoiceStatus,
  JobStatus,
  PaymentStatus,
  UserRole,
  UserStatus,
  WorkerHistoryAction,
  WorkerStatus,
} from '@prisma/client';
import { z } from 'zod';
import {
  defaultProperties,
  defaultPropertySpecifications,
  defaultWorkers,
  fileCategoryLabels,
  fileFieldToCategory,
  invoiceStatusLabels,
  invoiceStatusOptions,
  jobStatusLabels,
  jobStatusOptions,
  paymentStatusLabels,
  visiblePaymentStatusOptions,
  workerHistoryActionLabels,
  workerStatusLabels,
} from './data/defaults.js';
import { env } from './env.js';
import {
  authUserSelect,
  createSessionToken,
  hashPassword,
  hashSessionToken,
  normalizeUsername,
  serializeAuthUser,
  verifyPassword,
  type AuthUser,
} from './lib/auth.js';
import {
  buildDocumentResponse,
  buildPdfPreviewResponse,
  buildGeneratedDocumentUrl,
  buildJobFileUrl,
  buildPropertyCoverUrl,
  sanitizeGeneratedDocumentHtml,
} from './lib/documents.js';
import { prisma } from './lib/prisma.js';
import {
  clearSessionCookie,
  sessionTokenFromRequest,
  setSessionCookie,
} from './lib/session.js';
import {
  normalizePropertyStories,
  propertySnapshotFromStories,
  propertySpecFieldNames,
  propertyStoriesInputSchema,
  propertyStoriesToJson,
  type PropertyStory,
} from './propertySpecs.js';
import {
  buildFileUrl,
  deleteStoredFile,
  ensureUploadsDir,
  jobUploadFields,
  resolveStoredFilePath,
  upload,
} from './lib/uploads.js';
import {
  buildJobSectionValue,
  normalizeStoryInput,
  normalizeUnitInput,
} from './lib/jobLocation.js';

const app = express();
const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFilePath);
const frontendDistDir = path.resolve(currentDir, '../../frontend/dist');
const frontendIndexFile = path.join(frontendDistDir, 'index.html');

type FileFieldName = keyof typeof fileFieldToCategory;
type UploadedFilesMap = Partial<Record<FileFieldName, Express.Multer.File[]>>;
type Handler = (request: Request, response: Response, next: NextFunction) => Promise<void> | void;
type AuthenticatedRequest = Request & { auth?: AuthUser };

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

const userCreateSchema = z.object({
  username: z.string().trim().min(3).max(50),
  displayName: z.string().trim().min(2).max(120),
  password: z.string().min(6).max(120),
  role: z.nativeEnum(UserRole),
  workerId: z.string().trim().optional().or(z.literal('')).nullable(),
});

const userUpdateSchema = z.object({
  displayName: z.string().trim().min(2).max(120).optional(),
  password: z.string().min(6).max(120).optional().or(z.literal('')),
  role: z.nativeEnum(UserRole).optional(),
  status: z.nativeEnum(UserStatus).optional(),
  workerId: z.string().trim().optional().or(z.literal('')).nullable(),
});

const optionalIntegerField = z.preprocess((value) => {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return null;
  }

  return Number(raw);
}, z.number().int().min(0).nullable());

const propertySpecificationShape = Object.fromEntries(
  propertySpecFieldNames.map((field) => [field, optionalIntegerField]),
) as Record<(typeof propertySpecFieldNames)[number], typeof optionalIntegerField>;

const propertyCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  address: z.string().trim().max(180).optional().or(z.literal('')),
  cityLine: z.string().trim().max(180).optional().or(z.literal('')),
  notes: z.string().trim().max(500).optional().or(z.literal('')),
  coverImageUrl: z.string().trim().max(2048).optional().or(z.literal('')),
  ...propertySpecificationShape,
  stories: propertyStoriesInputSchema.default([]),
});

const propertyUpdateSchema = propertyCreateSchema.partial().extend({
  stories: propertyStoriesInputSchema.optional(),
});

const workerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  performedBy: z.string().trim().max(120).optional().or(z.literal('')),
});

const workerStatusSchema = z.object({
  status: z.nativeEnum(WorkerStatus),
  performedBy: z.string().trim().max(120).optional().or(z.literal('')),
});

const parseStringArray = (value: unknown) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  const raw = String(value ?? '').trim();
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean);
    }
  } catch {
    return raw
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
};

const jobInputSchema = z.object({
  propertyId: z.string().trim().min(1),
  story: z.string().trim().max(120).optional().transform((value) => normalizeStoryInput(value ?? '')),
  unit: z.string().trim().max(180).optional().transform((value) => normalizeUnitInput(value ?? '')),
  section: z.string().trim().max(120).optional().transform((value) => value ?? ''),
  area: z.string().trim().max(180).optional().or(z.literal('')),
  service: z.string().trim().min(1).max(180),
  description: z.string().trim().max(3000).optional().or(z.literal('')),
  materialCost: z.coerce.number().min(0).default(0),
  laborCost: z.coerce.number().min(0).default(0),
  status: z.nativeEnum(JobStatus),
  invoiceStatus: z.nativeEnum(InvoiceStatus),
  paymentStatus: z.nativeEnum(PaymentStatus),
  advanceCashApp: z.coerce.number().min(0).default(0),
  startDate: z.string().optional(),
  dueDate: z.string().optional(),
  workerIds: z.any().transform(parseStringArray),
  performedBy: z.string().trim().max(120).optional().or(z.literal('')),
});

const generatedDocumentSchema = z.object({
  propertyId: z.string().trim().min(1),
  jobIds: z.array(z.string().trim().min(1)).min(1),
  documentType: z.enum(['Invoice', 'Quote']),
  ownerKey: z.enum(['aze', 'ryan']),
  documentNumber: z.string().trim().min(1).max(80),
  issueDate: z.string().trim().min(1).max(40),
  fileName: z.string().trim().min(1).max(180),
  mimeType: z.enum(['text/html', 'application/pdf']).default('text/html'),
  html: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
}).superRefine((value, context) => {
  if (value.mimeType === 'application/pdf' && !value.content) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['content'],
      message: 'PDF content is required.',
    });
  }

  if (value.mimeType === 'text/html' && !value.html && !value.content) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['html'],
      message: 'HTML content is required.',
    });
  }
});

const asyncRoute = (handler: Handler) => async (
  request: Request,
  response: Response,
  next: NextFunction,
) => {
  try {
    await handler(request, response, next);
  } catch (error) {
    next(error);
  }
};

const today = () => new Date(new Date().toDateString());

const sessionDurationMs = env.AUTH_SESSION_DAYS * 24 * 60 * 60 * 1000;

const numericValue = (value: number | Prisma.Decimal) =>
  typeof value === 'number' ? value : value.toNumber();

const propertySpecsFrom = (
  source: Partial<Record<(typeof propertySpecFieldNames)[number], number | null | undefined>>,
) => ({
  floors: source.floors ?? null,
  bedrooms: source.bedrooms ?? null,
  bathrooms: source.bathrooms ?? null,
  halfBathrooms: source.halfBathrooms ?? null,
  livingRooms: source.livingRooms ?? null,
  diningRooms: source.diningRooms ?? null,
  kitchens: source.kitchens ?? null,
  sunroom: source.sunroom ?? null,
  garages: source.garages ?? null,
  attic: source.attic ?? null,
  frontPorch: source.frontPorch ?? null,
  backPorch: source.backPorch ?? null,
});

const sanitizedPropertyStories = (value: unknown): PropertyStory[] =>
  normalizePropertyStories(value as Prisma.JsonValue);

const propertyStoriesFromSummary = (property: {
  floorGroups?: Prisma.JsonValue | null;
}) => sanitizedPropertyStories(property.floorGroups);

const normalizedPropertyCoverInput = (
  value: string | undefined,
  propertyId: string,
  previousValue: string | null,
) => {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return null;
  }

  return raw === buildPropertyCoverUrl(propertyId) ? previousValue : raw;
};

const setNoStore = (response: Response) => {
  response.setHeader('Cache-Control', 'no-store');
};

const actorFromRequest = (request: Request) => {
  const auth = (request as AuthenticatedRequest).auth;
  return auth?.displayName || auth?.username || 'Admin';
};

const normalizeOrigin = (value: string | undefined) => String(value ?? '').trim().replace(/\/$/, '');

const requestPublicOrigin = (request: Request) => {
  const host = String(request.get('host') ?? '').trim();
  if (!host) {
    return '';
  }

  const forwardedProto = String(request.headers['x-forwarded-proto'] ?? '')
    .split(',')[0]
    .trim();
  const protocol = forwardedProto || request.protocol || 'http';
  return normalizeOrigin(`${protocol}://${host}`);
};

const hasFrontendBuild = () => fs.existsSync(frontendIndexFile);

const isAdmin = (role: UserRole) => role === UserRole.ADMIN;
const canManageJobs = (role: UserRole) => role === UserRole.ADMIN || role === UserRole.OFFICE;
const canViewAllJobs = (role: UserRole) =>
  role === UserRole.ADMIN || role === UserRole.OFFICE || role === UserRole.VIEWER;
const canManageDocuments = (role: UserRole) =>
  role === UserRole.ADMIN || role === UserRole.OFFICE;

const roleScopeForJobs = (auth: AuthUser): Prisma.JobWhereInput =>
  canViewAllJobs(auth.role)
    ? {}
    : {
        assignments: {
          some: {
            workerId: auth.workerId ?? '__no-worker__',
          },
        },
      };

const roleScopeForProperties = (auth: AuthUser): Prisma.PropertyWhereInput =>
  canViewAllJobs(auth.role)
    ? {}
    : {
        jobs: {
          some: roleScopeForJobs(auth),
        },
      };

const roleScopeForDocuments = (auth: AuthUser): Prisma.GeneratedDocumentWhereInput =>
  canViewAllJobs(auth.role)
    ? {}
    : {
        files: {
          some: {
            job: roleScopeForJobs(auth),
          },
        },
      };

const assertRole = (
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

const requireAdmin = (request: Request, response: Response, message = 'Admin access required.') =>
  assertRole(request, response, isAdmin, message);

const requireJobManager = (
  request: Request,
  response: Response,
  message = 'You do not have permission to manage jobs.',
) => assertRole(request, response, canManageJobs, message);

const requireDocumentManager = (
  request: Request,
  response: Response,
  message = 'You do not have permission to generate documents.',
) => assertRole(request, response, canManageDocuments, message);

const parseNullableDate = (value: string | undefined) => {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return null;
  }

  const date = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${raw}`);
  }

  return date;
};

const sumBy = <T>(items: T[], getter: (item: T) => number) =>
  items.reduce((total, item) => total + getter(item), 0);

const generatedDocumentTypeFor = (value: 'Invoice' | 'Quote') =>
  value === 'Invoice' ? GeneratedDocumentType.INVOICE : GeneratedDocumentType.QUOTE;

const documentOwnerFor = (value: 'aze' | 'ryan') =>
  value === 'ryan' ? DocumentOwner.RYAN : DocumentOwner.AZE;

const generatedDocumentTypeLabels: Record<GeneratedDocumentType, 'Invoice' | 'Quote'> = {
  [GeneratedDocumentType.INVOICE]: 'Invoice',
  [GeneratedDocumentType.QUOTE]: 'Quote',
};

const documentOwnerLabels: Record<DocumentOwner, 'AZE' | 'Ryan'> = {
  [DocumentOwner.AZE]: 'AZE',
  [DocumentOwner.RYAN]: 'Ryan',
};

const storedNameFromUrl = (value: string | null | undefined) => {
  const raw = String(value ?? '').trim();
  if (!raw.startsWith('/uploads/')) {
    return null;
  }

  return raw.slice('/uploads/'.length) || null;
};

const countBy = <T>(items: T[], getKey: (item: T) => string) => {
  const result = new Map<string, number>();
  items.forEach((item) => {
    const key = getKey(item);
    result.set(key, (result.get(key) ?? 0) + 1);
  });
  return result;
};

const chartDataFrom = (map: Map<string, number>) =>
  Array.from(map.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((left, right) => right.value - left.value);

const propertyDataFromDefaults = (
  specifications: (typeof defaultPropertySpecifications)[string] | undefined,
) => {
  const defaults = specifications ?? {};
  const stories = defaults.stories
    ? sanitizedPropertyStories(defaults.stories)
    : defaults.floorGroups
      ? sanitizedPropertyStories(defaults.floorGroups)
      : [];
  const derivedSpecs = stories.length ? propertySnapshotFromStories(stories) : null;

  return {
    floors: derivedSpecs?.floors ?? defaults.floors,
    bedrooms: derivedSpecs?.bedrooms ?? defaults.bedrooms,
    bathrooms: derivedSpecs?.bathrooms ?? defaults.bathrooms,
    halfBathrooms: derivedSpecs?.halfBathrooms ?? defaults.halfBathrooms,
    livingRooms: derivedSpecs?.livingRooms ?? defaults.livingRooms,
    diningRooms: derivedSpecs?.diningRooms ?? defaults.diningRooms,
    kitchens: derivedSpecs?.kitchens ?? defaults.kitchens,
    sunroom: derivedSpecs?.sunroom ?? defaults.sunroom,
    garages: derivedSpecs?.garages ?? defaults.garages,
    attic: derivedSpecs?.attic ?? defaults.attic,
    frontPorch: derivedSpecs?.frontPorch ?? defaults.frontPorch,
    backPorch: derivedSpecs?.backPorch ?? defaults.backPorch,
    ...(stories.length
      ? {
          floorGroups: propertyStoriesToJson(stories),
        }
      : {}),
  };
};

const timelineFrom = (status: JobStatus, dueDate: Date | null) => {
  if (status === JobStatus.DONE) {
    return { label: 'Done', tone: 'success', isLate: false };
  }

  if (!dueDate) {
    return { label: 'No due date', tone: 'neutral', isLate: false };
  }

  const diffDays = Math.ceil((dueDate.getTime() - today().getTime()) / 86400000);
  if (diffDays < 0) {
    return { label: `${Math.abs(diffDays)} days overdue`, tone: 'danger', isLate: true };
  }

  if (diffDays <= 7) {
    return { label: `Due in ${diffDays} day${diffDays === 1 ? '' : 's'}`, tone: 'warning', isLate: false };
  }

  return { label: `Due in ${diffDays} days`, tone: 'neutral', isLate: false };
};

const groupFiles = (
  files: Array<{
    id: string;
    category: FileCategory;
    originalName: string;
    storedName: string | null;
    documentNumber: string | null;
    generatedDocumentId: string | null;
    mimeType: string;
    size: number;
    createdAt: Date;
  }>,
) => {
  const grouped: Record<FileFieldName, Array<Record<string, string | number>>> = {
    before: [],
    progress: [],
    after: [],
    receipt: [],
    invoice: [],
    quote: [],
  };

  files.forEach((file) => {
    const key = Object.entries(fileFieldToCategory).find(
      ([, category]) => category === file.category,
    )?.[0] as FileFieldName | undefined;

    if (!key) {
      return;
    }

    grouped[key].push({
      id: file.id,
      category: fileCategoryLabels[file.category],
      name: file.originalName,
      url: file.generatedDocumentId
        ? buildGeneratedDocumentUrl(file.generatedDocumentId)
        : buildJobFileUrl(file.id),
      mimeType: file.mimeType,
      size: file.size,
      documentNumber: file.documentNumber ?? '',
      createdAt: file.createdAt.toISOString(),
    });
  });

  return grouped;
};

const serializeJob = (job: {
  id: string;
  story: string;
  unit: string;
  section: string;
  area: string;
  service: string;
  description: string;
  materialCost: number | Prisma.Decimal;
  laborCost: number | Prisma.Decimal;
  status: JobStatus;
  invoiceStatus: InvoiceStatus;
  paymentStatus: PaymentStatus;
  advanceCashApp: number | Prisma.Decimal;
  startDate: Date | null;
  dueDate: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  property: { id: string; name: string };
  assignments: Array<{ worker: { id: string; name: string; status: WorkerStatus } }>;
  files: Array<{
    id: string;
    category: FileCategory;
    originalName: string;
    storedName: string | null;
    documentNumber: string | null;
    generatedDocumentId: string | null;
    mimeType: string;
    size: number;
    createdAt: Date;
  }>;
}) => ({
  id: job.id,
  propertyId: job.property.id,
  propertyName: job.property.name,
  story: job.story,
  unit: job.unit,
  section: job.section,
  area: job.area,
  service: job.service,
  description: job.description,
  materialCost: numericValue(job.materialCost),
  laborCost: numericValue(job.laborCost),
  totalCost: numericValue(job.materialCost) + numericValue(job.laborCost),
  status: job.status,
  statusLabel: jobStatusLabels[job.status],
  invoiceStatus: job.invoiceStatus,
  invoiceStatusLabel: invoiceStatusLabels[job.invoiceStatus],
  paymentStatus: job.paymentStatus,
  paymentStatusLabel: paymentStatusLabels[job.paymentStatus],
  advanceCashApp: numericValue(job.advanceCashApp),
  startDate: job.startDate?.toISOString() ?? null,
  dueDate: job.dueDate?.toISOString() ?? null,
  completedAt: job.completedAt?.toISOString() ?? null,
  timeline: timelineFrom(job.status, job.dueDate),
  workers: job.assignments.map((assignment) => ({
    id: assignment.worker.id,
    name: assignment.worker.name,
    status: assignment.worker.status,
    statusLabel: workerStatusLabels[assignment.worker.status],
  })),
  workerIds: job.assignments.map((assignment) => assignment.worker.id),
  files: groupFiles(job.files),
  createdAt: job.createdAt.toISOString(),
  updatedAt: job.updatedAt.toISOString(),
});

const serializePropertySummary = (property: {
  id: string;
  name: string;
  address: string | null;
  cityLine: string | null;
  notes: string | null;
  coverImageUrl: string | null;
  floors?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  halfBathrooms?: number | null;
  livingRooms?: number | null;
  diningRooms?: number | null;
  kitchens?: number | null;
  sunroom?: number | null;
  garages?: number | null;
  attic?: number | null;
  frontPorch?: number | null;
  backPorch?: number | null;
  floorGroups?: Prisma.JsonValue | null;
  jobs: Array<{ status: JobStatus; dueDate: Date | null }>;
}) => {
  const stories = propertyStoriesFromSummary(property);
  const derivedSpecs = stories.length ? propertySnapshotFromStories(stories) : propertySpecsFrom(property);

  return {
    id: property.id,
    name: property.name,
    address: property.address,
    cityLine: property.cityLine,
    notes: property.notes,
    coverImageUrl: property.coverImageUrl ? buildPropertyCoverUrl(property.id) : null,
    ...propertySpecsFrom(derivedSpecs),
    stories,
    totalJobs: property.jobs.length,
    openJobs: property.jobs.filter((job) => job.status !== JobStatus.DONE).length,
    lateJobs: property.jobs.filter(
      (job) => job.status !== JobStatus.DONE && job.dueDate && job.dueDate < today(),
    ).length,
  };
};

const serializeWorkerSummary = (worker: {
  id: string;
  name: string;
  status: WorkerStatus;
  assignments: Array<{ jobId: string }>;
  user: { id: string } | null;
}) => ({
  id: worker.id,
  name: worker.name,
  status: worker.status,
  statusLabel: workerStatusLabels[worker.status],
  totalJobCount: worker.assignments.length,
  linkedUserCount: worker.user ? 1 : 0,
  canDelete: worker.assignments.length === 0,
});

const serializeGeneratedDocument = (document: {
  id: string;
  documentType: GeneratedDocumentType;
  owner: DocumentOwner;
  documentNumber: string;
  fileName: string;
  issueDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  property: { id: string; name: string };
  files: Array<{
    id: string;
    job: {
      id: string;
      story: string;
      unit: string;
      section: string;
      area: string;
      service: string;
    };
  }>;
}) => {
  const linkedJobs = Array.from(
    new Map(
      document.files.map((file) => [
        file.job.id,
        {
          id: file.job.id,
          story: file.job.story,
          unit: file.job.unit,
          section: file.job.section,
          area: file.job.area,
          service: file.job.service,
        },
      ]),
    ).values(),
  );

  return {
    id: document.id,
    documentType: document.documentType,
    documentTypeLabel: generatedDocumentTypeLabels[document.documentType],
    owner: document.owner,
    ownerLabel: documentOwnerLabels[document.owner],
    documentNumber: document.documentNumber,
    fileName: document.fileName,
    propertyId: document.property.id,
    propertyName: document.property.name,
    issueDate: document.issueDate?.toISOString() ?? null,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
    url: buildGeneratedDocumentUrl(document.id),
    printUrl: buildGeneratedDocumentUrl(document.id, true),
    linkedJobCount: linkedJobs.length,
    linkedJobs,
  };
};

const loadJob = (jobId: string) =>
  prisma.job.findUniqueOrThrow({
    where: { id: jobId },
    include: {
      property: {
        select: {
          id: true,
          name: true,
        },
      },
      assignments: {
        include: {
          worker: {
            select: {
              id: true,
              name: true,
              status: true,
            },
          },
        },
      },
      files: true,
    },
  });

const loadWorker = (workerId: string) =>
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

const seedSystem = async () => {
  await Promise.all(
    defaultProperties.map(async (name) => {
      const propertyDefaults = propertyDataFromDefaults(defaultPropertySpecifications[name]);
      const existing = await prisma.property.findUnique({
        where: { name },
        select: { id: true },
      });

      if (existing) {
        return prisma.property.update({
          where: { id: existing.id },
          data: {
            address: name,
            ...propertyDefaults,
          },
        });
      }

      return prisma.property.create({
        data: {
          name,
          address: name,
          ...propertyDefaults,
        },
      });
    }),
  );

  await Promise.all(
    defaultWorkers.map((name) =>
      prisma.worker.upsert({
        where: { name },
        update: {
          status: WorkerStatus.ACTIVE,
        },
        create: {
          name,
          status: WorkerStatus.ACTIVE,
        },
      }),
    ),
  );

  return { properties: defaultProperties.length, workers: defaultWorkers.length };
};

const dashboardData = async (auth: AuthUser) => {
  const jobs = await prisma.job.findMany({
    where: roleScopeForJobs(auth),
    include: {
      property: {
        select: {
          id: true,
          name: true,
        },
      },
      assignments: {
        include: {
          worker: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });

  return {
    stats: {
      totalJobs: jobs.length,
      doneJobs: jobs.filter((job) => job.status === JobStatus.DONE).length,
      inProgressJobs: jobs.filter((job) => job.status === JobStatus.IN_PROGRESS).length,
      pendingJobs: jobs.filter(
        (job) => job.status === JobStatus.PENDING || job.status === JobStatus.PLANNING,
      ).length,
      lateJobs: jobs.filter(
        (job) => job.status !== JobStatus.DONE && job.dueDate && job.dueDate < today(),
      ).length,
      unpaidOrPartial: jobs.filter(
        (job) =>
          job.paymentStatus === PaymentStatus.UNPAID ||
          job.paymentStatus === PaymentStatus.PARTIAL_PAYMENT,
      ).length,
      materialTotal: sumBy(jobs, (job) => numericValue(job.materialCost)),
      laborTotal: sumBy(jobs, (job) => numericValue(job.laborCost)),
    },
    charts: {
      status: chartDataFrom(countBy(jobs, (job) => jobStatusLabels[job.status])),
      payment: chartDataFrom(countBy(jobs, (job) => paymentStatusLabels[job.paymentStatus])),
      workers: chartDataFrom(
        countBy(
          jobs.flatMap((job) => job.assignments.map((assignment) => assignment.worker)),
          (worker) => worker.name,
        ),
      ).slice(0, 8),
      timeline: chartDataFrom(
        countBy(jobs, (job) => {
          if (job.status === JobStatus.DONE) return 'Done';
          if (!job.dueDate) return 'No due date';
          if (job.dueDate < today()) return 'Overdue';
          const diffDays = Math.ceil((job.dueDate.getTime() - today().getTime()) / 86400000);
          return diffDays <= 7 ? 'Due soon' : 'Upcoming';
        }),
      ),
      properties: chartDataFrom(countBy(jobs, (job) => job.property.name)).slice(0, 8),
    },
  };
};

const userSummarySelect = {
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

const serializeUserSummary = (
  user: Prisma.UserGetPayload<{
    select: typeof userSummarySelect;
  }>,
) => ({
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

const sessionMiddleware = asyncRoute(async (request, response, next) => {
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

const issueSession = async (userId: string) => {
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

const ensureWorkerRoleLink = async (role: UserRole, workerId: string | null | undefined) => {
  void role;
  void workerId;
};

const ensureActiveAdminGuard = async (input: {
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

ensureUploadsDir();

app.set('trust proxy', env.TRUST_PROXY);
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: false,
  }),
);
app.use(
  (request, response, next) =>
    cors({
      origin: (origin, callback) => {
        const normalizedOrigin = normalizeOrigin(origin);
        const allowedOrigins = new Set(env.allowedCorsOrigins.map((item) => normalizeOrigin(item)));
        const publicOrigin = requestPublicOrigin(request);

        if (
          !normalizedOrigin ||
          allowedOrigins.has(normalizedOrigin) ||
          (publicOrigin && normalizedOrigin === publicOrigin)
        ) {
          callback(null, true);
          return;
        }

        callback(new Error('Origin not allowed by CORS'));
      },
      credentials: true,
    })(request, response, next),
);
app.use(express.json({ limit: '4mb' }));

app.get('/api', (_request, response) => {
  response.json({
    name: 'property-jobs-api',
    message: 'API running',
    docs: '/api/health',
  });
});

app.get(
  '/api/health',
  asyncRoute(async (_request, response) => {
    let database: 'up' | 'down' = 'down';
    try {
      await prisma.$queryRaw`SELECT 1`;
      database = 'up';
    } catch (error) {
      console.error('Database health check failed', error);
    }

    response.json({
      status: 'ok',
      database,
      timestamp: new Date().toISOString(),
    });
  }),
);

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

app.use('/api', sessionMiddleware);

app.get(
  '/api/job-files/:fileId',
  asyncRoute(async (request, response) => {
    const auth = (request as AuthenticatedRequest).auth;
    if (!auth) {
      response.status(401).json({ message: 'Authentication required.' });
      return;
    }

    const fileId = String(request.params.fileId);
    const previewMode = String(request.query.preview ?? '') === '1';
    const rawMode = String(request.query.raw ?? '') === '1';
    const file = await prisma.jobFile.findFirst({
      where: {
        id: fileId,
        storedName: {
          not: null,
        },
        job: roleScopeForJobs(auth),
      },
      select: {
        storedName: true,
        mimeType: true,
        originalName: true,
      },
    });

    if (!file?.storedName) {
      response.status(404).json({ message: 'File not found.' });
      return;
    }

    if (file.mimeType === 'application/pdf' && previewMode && !rawMode) {
      const previewResponse = buildPdfPreviewResponse(
        `${buildJobFileUrl(fileId)}?raw=1`,
        file.originalName,
      );

      Object.entries(previewResponse.headers).forEach(([key, value]) => {
        response.setHeader(key, value);
      });
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.send(previewResponse.html);
      return;
    }

    response.setHeader('Cache-Control', 'private, max-age=60');
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Disposition', `inline; filename="${file.originalName.replace(/"/g, '')}"`);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.sendFile(resolveStoredFilePath(file.storedName));
  }),
);

app.get(
  '/api/properties/:propertyId/cover-image',
  asyncRoute(async (request, response) => {
    const auth = (request as AuthenticatedRequest).auth;
    if (!auth) {
      response.status(401).json({ message: 'Authentication required.' });
      return;
    }

    const propertyId = String(request.params.propertyId);
    const property = await prisma.property.findFirst({
      where: {
        id: propertyId,
        ...roleScopeForProperties(auth),
      },
      select: {
        coverImageUrl: true,
      },
    });

    const storedName = storedNameFromUrl(property?.coverImageUrl);
    if (!storedName) {
      response.status(404).json({ message: 'Cover image not found.' });
      return;
    }

    response.setHeader('Cache-Control', 'private, max-age=60');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.sendFile(resolveStoredFilePath(storedName));
  }),
);

app.get(
  '/api/bootstrap',
  asyncRoute(async (request, response) => {
    const auth = (request as AuthenticatedRequest).auth;
    if (!auth) {
      response.status(401).json({ message: 'Authentication required.' });
      return;
    }

    const [properties, workers] = await Promise.all([
      prisma.property.findMany({
        where: roleScopeForProperties(auth),
        orderBy: { name: 'asc' },
        include: {
          jobs: {
            select: {
              status: true,
              dueDate: true,
            },
          },
        },
      }),
      prisma.worker.findMany({
        orderBy: { name: 'asc' },
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
      }),
    ]);

    const workerSummaries = workers.map(serializeWorkerSummary);

    response.json({
      statuses: jobStatusOptions,
      invoiceStatuses: invoiceStatusOptions,
      paymentStatuses: visiblePaymentStatusOptions,
      properties: properties.map(serializePropertySummary),
      workers:
        auth.role === UserRole.ADMIN || auth.role === UserRole.OFFICE
          ? workerSummaries.filter((worker) => worker.status === WorkerStatus.ACTIVE)
          : [],
      inactiveWorkers:
        auth.role === UserRole.ADMIN || auth.role === UserRole.OFFICE
          ? workerSummaries.filter((worker) => worker.status === WorkerStatus.INACTIVE)
          : [],
    });
  }),
);

app.get(
  '/api/dashboard',
  asyncRoute(async (request, response) => {
    const auth = (request as AuthenticatedRequest).auth;
    if (!auth) {
      response.status(401).json({ message: 'Authentication required.' });
      return;
    }

    response.json(await dashboardData(auth));
  }),
);

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

    const createdUser = await prisma.user.create({
      data: {
        username,
        displayName: payload.displayName.trim(),
        passwordHash: hashPassword(payload.password),
        role: payload.role,
        status: UserStatus.ACTIVE,
        workerId: payload.role === UserRole.WORKER ? workerId : null,
      },
      select: userSummarySelect,
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

    await ensureWorkerRoleLink(nextRole, workerId);
    await ensureActiveAdminGuard({
      currentUserId: existingUser.id,
      existingRole: existingUser.role,
      existingStatus: existingUser.status,
      nextRole,
      nextStatus,
    });

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(payload.displayName ? { displayName: payload.displayName.trim() } : {}),
        ...(payload.password ? { passwordHash: hashPassword(payload.password) } : {}),
        ...(payload.role ? { role: nextRole } : {}),
        ...(payload.status ? { status: nextStatus } : {}),
        workerId: nextRole === UserRole.WORKER ? workerId : null,
      },
      select: userSummarySelect,
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

    await prisma.userSession.deleteMany({
      where: { userId },
    });

    await prisma.user.delete({
      where: { id: userId },
    });

    response.json({ ok: true });
  }),
);

app.get(
  '/api/jobs',
  asyncRoute(async (request, response) => {
    const auth = (request as AuthenticatedRequest).auth;
    if (!auth) {
      response.status(401).json({ message: 'Authentication required.' });
      return;
    }

    const jobs = await prisma.job.findMany({
      where: roleScopeForJobs(auth),
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
      include: {
        property: {
          select: {
            id: true,
            name: true,
          },
        },
        assignments: {
          include: {
            worker: {
              select: {
                id: true,
                name: true,
                status: true,
              },
            },
          },
        },
        files: {
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    response.json(jobs.map(serializeJob));
  }),
);

app.get(
  '/api/generated-documents/next-number',
  asyncRoute(async (request, response) => {
    if (!requireDocumentManager(request, response)) {
      return;
    }

    const documentType =
      String(request.query.documentType ?? '').trim().toLowerCase() === 'quote'
        ? GeneratedDocumentType.QUOTE
        : GeneratedDocumentType.INVOICE;

    const numbers = await prisma.generatedDocument.findMany({
      where: { documentType },
      select: { documentNumber: true },
    });

    const nextNumber =
      Math.max(
        1000,
        ...numbers
          .map((item) => Number.parseInt(item.documentNumber, 10))
          .filter((value) => Number.isFinite(value)),
      ) + 1;

    response.json({ nextNumber: String(nextNumber) });
  }),
);

app.get(
  '/api/generated-documents',
  asyncRoute(async (request, response) => {
    const auth = (request as AuthenticatedRequest).auth;
    if (!auth) {
      response.status(401).json({ message: 'Authentication required.' });
      return;
    }

    const search = String(request.query.search ?? '').trim();
    const propertyId = String(request.query.propertyId ?? '').trim();
    const ownerValue = String(request.query.owner ?? '').trim().toUpperCase();
    const documentTypeValue = String(request.query.documentType ?? '').trim().toUpperCase();
    const dateFrom = parseNullableDate(String(request.query.dateFrom ?? '').trim());
    const dateTo = parseNullableDate(String(request.query.dateTo ?? '').trim());

    const documents = await prisma.generatedDocument.findMany({
      where: {
        ...roleScopeForDocuments(auth),
        ...(propertyId ? { propertyId } : {}),
        ...(ownerValue === DocumentOwner.AZE || ownerValue === DocumentOwner.RYAN
          ? { owner: ownerValue as DocumentOwner }
          : {}),
        ...(documentTypeValue === GeneratedDocumentType.INVOICE ||
        documentTypeValue === GeneratedDocumentType.QUOTE
          ? { documentType: documentTypeValue as GeneratedDocumentType }
          : {}),
        ...(search
          ? {
              OR: [
                {
                  documentNumber: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
                {
                  fileName: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
                {
                  property: {
                    name: {
                      contains: search,
                      mode: 'insensitive',
                    },
                  },
                },
              ],
            }
          : {}),
        ...(dateFrom || dateTo
          ? {
              issueDate: {
                ...(dateFrom ? { gte: dateFrom } : {}),
                ...(dateTo ? { lte: dateTo } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }],
      include: {
        property: {
          select: {
            id: true,
            name: true,
          },
        },
        files: {
          include: {
            job: {
              select: {
                id: true,
                story: true,
                unit: true,
                section: true,
                area: true,
                service: true,
              },
            },
          },
        },
      },
    });

    response.json(documents.map(serializeGeneratedDocument));
  }),
);

app.get(
  '/api/generated-documents/:documentId',
  asyncRoute(async (request, response) => {
    const auth = (request as AuthenticatedRequest).auth;
    if (!auth) {
      response.status(401).json({ message: 'Authentication required.' });
      return;
    }

    const documentId = String(request.params.documentId);
    const printMode = String(request.query.print ?? '') === '1';
    const previewMode = String(request.query.preview ?? '') === '1';
    const rawMode = String(request.query.raw ?? '') === '1';

    const document = await prisma.generatedDocument.findFirst({
      where: {
        id: documentId,
        ...roleScopeForDocuments(auth),
      },
      select: {
        html: true,
        mimeType: true,
        fileName: true,
      },
    });

    if (!document) {
      response.status(404).json({ message: 'Document not found.' });
      return;
    }

    if (document.mimeType === 'application/pdf' && previewMode && !rawMode) {
      const previewResponse = buildPdfPreviewResponse(
        `${buildGeneratedDocumentUrl(documentId)}?raw=1`,
        document.fileName,
      );

      Object.entries(previewResponse.headers).forEach(([key, value]) => {
        response.setHeader(key, value);
      });
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.send(previewResponse.html);
      return;
    }

    if (document.mimeType === 'application/pdf') {
      response.setHeader('Cache-Control', 'private, no-store');
      response.setHeader('Referrer-Policy', 'no-referrer');
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.setHeader('Content-Type', 'application/pdf');
      response.setHeader(
        'Content-Disposition',
        `inline; filename="${document.fileName.replace(/"/g, '')}"`,
      );
      response.send(Buffer.from(document.html, 'base64'));
      return;
    }

    const documentResponse = buildDocumentResponse(document.html, printMode);
    Object.entries(documentResponse.headers).forEach(([key, value]) => {
      response.setHeader(key, value);
    });
    response.setHeader('Content-Type', `${document.mimeType}; charset=utf-8`);
    response.setHeader(
      'Content-Disposition',
      `inline; filename="${document.fileName.replace(/"/g, '')}"`,
    );
    response.send(documentResponse.html);
  }),
);

app.post(
  '/api/generated-documents',
  asyncRoute(async (request, response) => {
    if (!requireDocumentManager(request, response)) {
      return;
    }

    const payload = generatedDocumentSchema.parse(request.body);
    const documentMimeType = payload.mimeType;
    const sanitizedHtml =
      documentMimeType === 'text/html'
        ? sanitizeGeneratedDocumentHtml(payload.html ?? payload.content ?? '')
        : '';
    const pdfBase64 = documentMimeType === 'application/pdf' ? String(payload.content ?? '').trim() : '';

    if (documentMimeType === 'text/html' && !sanitizedHtml) {
      response.status(400).json({ message: 'Generated document HTML is empty after sanitization.' });
      return;
    }
    if (documentMimeType === 'application/pdf' && !pdfBase64) {
      response.status(400).json({ message: 'Generated PDF content is empty.' });
      return;
    }

    const uniqueJobIds = Array.from(new Set(payload.jobIds));
    const documentType = generatedDocumentTypeFor(payload.documentType);
    const fileCategory =
      payload.documentType === 'Invoice' ? FileCategory.INVOICE : FileCategory.QUOTE;
    const storedDocumentContent =
      documentMimeType === 'application/pdf' ? pdfBase64 : sanitizedHtml;
    const storedDocumentSize =
      documentMimeType === 'application/pdf'
        ? Buffer.from(pdfBase64, 'base64').byteLength
        : Buffer.byteLength(sanitizedHtml, 'utf8');

    const relatedJobs = await prisma.job.findMany({
      where: {
        id: { in: uniqueJobIds },
        propertyId: payload.propertyId,
      },
      select: { id: true },
    });

    if (relatedJobs.length !== uniqueJobIds.length) {
      response.status(400).json({
        message: 'Selected jobs do not belong to the chosen property.',
      });
      return;
    }

    const existing = await prisma.generatedDocument.findFirst({
      where: {
        documentType,
        documentNumber: payload.documentNumber,
      },
      select: { id: true },
    });

    if (existing) {
      response.status(400).json({
        message: `This ${payload.documentType.toLowerCase()} number is already in use.`,
      });
      return;
    }

    const created = await prisma.$transaction(async (transaction) => {
      const document = await transaction.generatedDocument.create({
        data: {
          propertyId: payload.propertyId,
          documentType,
          owner: documentOwnerFor(payload.ownerKey),
          documentNumber: payload.documentNumber,
          fileName: payload.fileName,
          mimeType: documentMimeType,
          html: storedDocumentContent,
          issueDate: parseNullableDate(payload.issueDate),
        },
      });

      await transaction.jobFile.createMany({
        data: relatedJobs.map((job) => ({
          jobId: job.id,
          category: fileCategory,
          originalName: payload.fileName,
          storedName: null,
          mimeType: documentMimeType,
          size: storedDocumentSize,
          documentNumber: payload.documentNumber,
          generatedDocumentId: document.id,
        })),
      });

      if (documentType === GeneratedDocumentType.INVOICE) {
        await transaction.job.updateMany({
          where: {
            id: {
              in: relatedJobs.map((job) => job.id),
            },
          },
          data: {
            invoiceStatus: InvoiceStatus.YES,
          },
        });

        await transaction.job.updateMany({
          where: {
            id: {
              in: relatedJobs.map((job) => job.id),
            },
            paymentStatus: PaymentStatus.NOT_INVOICED_YET,
          },
          data: {
            paymentStatus: PaymentStatus.UNPAID,
          },
        });
      }

      return document;
    });

    response.status(201).json({
      id: created.id,
      fileName: created.fileName,
      url: buildGeneratedDocumentUrl(created.id),
      printUrl: buildGeneratedDocumentUrl(created.id, true),
      documentNumber: created.documentNumber,
    });
  }),
);

app.post(
  '/api/jobs',
  jobUploadFields,
  asyncRoute(async (request, response) => {
    if (!requireJobManager(request, response)) {
      return;
    }

    const payload = jobInputSchema.parse(request.body);
    const filesMap = ((request as Request & { files?: UploadedFilesMap }).files ?? {}) as UploadedFilesMap;

    const created = await prisma.job.create({
      data: {
        property: {
          connect: {
            id: payload.propertyId,
          },
        },
        story: payload.story,
        unit: payload.unit,
        section: buildJobSectionValue(payload.story, payload.unit, payload.section || payload.area || payload.service),
        area: payload.area || '',
        service: payload.service,
        description: payload.description || '',
        materialCost: payload.materialCost,
        laborCost: payload.laborCost,
        status: payload.status,
        invoiceStatus: payload.invoiceStatus,
        paymentStatus: payload.paymentStatus,
        advanceCashApp: payload.advanceCashApp,
        startDate: parseNullableDate(payload.startDate),
        dueDate: parseNullableDate(payload.dueDate),
        completedAt: payload.status === JobStatus.DONE ? new Date() : null,
        assignments: {
          create: payload.workerIds.map((workerId) => ({ workerId })),
        },
        files: {
          create: Object.entries(filesMap).flatMap(([field, files]) =>
            (files ?? []).map((file) => ({
              category: fileFieldToCategory[field as FileFieldName],
              originalName: file.originalname,
              storedName: file.filename,
              mimeType: file.mimetype,
              size: file.size,
            })),
          ),
        },
      },
      include: {
        property: {
          select: {
            id: true,
            name: true,
          },
        },
        assignments: {
          include: {
            worker: {
              select: {
                id: true,
                name: true,
                status: true,
              },
            },
          },
        },
        files: true,
      },
    });

    response.status(201).json(serializeJob(created));
  }),
);

app.put(
  '/api/jobs/:jobId',
  jobUploadFields,
  asyncRoute(async (request, response) => {
    if (!requireJobManager(request, response)) {
      return;
    }

    const jobId = String(request.params.jobId);
    const payload = jobInputSchema.parse(request.body);
    const filesMap = ((request as Request & { files?: UploadedFilesMap }).files ?? {}) as UploadedFilesMap;
    const existingJob = await prisma.job.findUniqueOrThrow({
      where: { id: jobId },
      select: {
        status: true,
        completedAt: true,
      },
    });
    const completedAt =
      payload.status === JobStatus.DONE
        ? existingJob.status === JobStatus.DONE
          ? existingJob.completedAt ?? new Date()
          : new Date()
        : null;

    await prisma.job.update({
      where: {
        id: jobId,
      },
      data: {
        property: {
          connect: {
            id: payload.propertyId,
          },
        },
        story: payload.story,
        unit: payload.unit,
        section: buildJobSectionValue(payload.story, payload.unit, payload.section || payload.area || payload.service),
        area: payload.area || '',
        service: payload.service,
        description: payload.description || '',
        materialCost: payload.materialCost,
        laborCost: payload.laborCost,
        status: payload.status,
        invoiceStatus: payload.invoiceStatus,
        paymentStatus: payload.paymentStatus,
        advanceCashApp: payload.advanceCashApp,
        startDate: parseNullableDate(payload.startDate),
        dueDate: parseNullableDate(payload.dueDate),
        completedAt,
        assignments: {
          deleteMany: {},
          create: payload.workerIds.map((workerId) => ({ workerId })),
        },
        files: {
          create: Object.entries(filesMap).flatMap(([field, files]) =>
            (files ?? []).map((file) => ({
              category: fileFieldToCategory[field as FileFieldName],
              originalName: file.originalname,
              storedName: file.filename,
              mimeType: file.mimetype,
              size: file.size,
            })),
          ),
        },
      },
    });

    response.json(serializeJob(await loadJob(jobId)));
  }),
);

app.delete(
  '/api/jobs/:jobId/files/:fileId',
  asyncRoute(async (request, response) => {
    if (!requireAdmin(request, response)) {
      return;
    }

    const jobId = String(request.params.jobId);
    const fileId = String(request.params.fileId);

    const targetFile = await prisma.jobFile.findFirstOrThrow({
      where: {
        id: fileId,
        jobId,
      },
      select: {
        id: true,
        category: true,
        storedName: true,
        generatedDocumentId: true,
      },
    });

    await prisma.$transaction(async (transaction) => {
      await transaction.jobFile.delete({
        where: { id: targetFile.id },
      });

      if (targetFile.generatedDocumentId) {
        const remainingLinks = await transaction.jobFile.count({
          where: {
            generatedDocumentId: targetFile.generatedDocumentId,
          },
        });

        if (remainingLinks === 0) {
          await transaction.generatedDocument.delete({
            where: { id: targetFile.generatedDocumentId },
          });
        }
      }

      if (targetFile.category === FileCategory.INVOICE) {
        const hasInvoiceFiles = await transaction.jobFile.count({
          where: {
            jobId,
            category: FileCategory.INVOICE,
          },
        });

        if (hasInvoiceFiles === 0) {
          await transaction.job.update({
            where: { id: jobId },
            data: {
              invoiceStatus: InvoiceStatus.NO,
            },
          });
        }
      }
    });

    if (targetFile.storedName) {
      await deleteStoredFile(targetFile.storedName);
    }

    response.json({ message: 'File deleted successfully.' });
  }),
);

app.delete(
  '/api/jobs/:jobId',
  asyncRoute(async (request, response) => {
    if (!requireAdmin(request, response)) {
      return;
    }

    const jobId = String(request.params.jobId);
    const files = await prisma.jobFile.findMany({
      where: { jobId },
      select: { storedName: true },
    });

    await prisma.job.delete({
      where: { id: jobId },
    });

    await Promise.all(
      files
        .map((file) => file.storedName)
        .filter((storedName): storedName is string => Boolean(storedName))
        .map((storedName) => deleteStoredFile(storedName)),
    );

    response.json({ message: 'Job deleted successfully.' });
  }),
);

app.post(
  '/api/properties',
  asyncRoute(async (request, response) => {
    if (!requireAdmin(request, response)) {
      return;
    }

    const payload = propertyCreateSchema.parse(request.body);
    const stories = sanitizedPropertyStories(payload.stories);
    const derivedSpecs = stories.length ? propertySnapshotFromStories(stories) : null;
    const property = await prisma.property.create({
      data: {
        name: payload.name,
        address: payload.address || payload.name,
        cityLine: payload.cityLine || null,
        notes: payload.notes || null,
        coverImageUrl: payload.coverImageUrl || null,
        floors: derivedSpecs?.floors ?? payload.floors,
        bedrooms: derivedSpecs?.bedrooms ?? payload.bedrooms,
        bathrooms: derivedSpecs?.bathrooms ?? payload.bathrooms,
        halfBathrooms: derivedSpecs?.halfBathrooms ?? payload.halfBathrooms,
        livingRooms: derivedSpecs?.livingRooms ?? payload.livingRooms,
        diningRooms: derivedSpecs?.diningRooms ?? payload.diningRooms,
        kitchens: derivedSpecs?.kitchens ?? payload.kitchens,
        sunroom: derivedSpecs?.sunroom ?? payload.sunroom,
        garages: derivedSpecs?.garages ?? payload.garages,
        attic: derivedSpecs?.attic ?? payload.attic,
        frontPorch: derivedSpecs?.frontPorch ?? payload.frontPorch,
        backPorch: derivedSpecs?.backPorch ?? payload.backPorch,
        ...(stories.length
          ? { floorGroups: propertyStoriesToJson(stories) }
          : {}),
      },
      include: {
        jobs: {
          select: {
            status: true,
            dueDate: true,
          },
        },
      },
    });

    response.status(201).json(serializePropertySummary(property));
  }),
);

app.patch(
  '/api/properties/:propertyId',
  asyncRoute(async (request, response) => {
    if (!requireAdmin(request, response)) {
      return;
    }

    const propertyId = String(request.params.propertyId);
    const payload = propertyUpdateSchema.parse(request.body);
    const previous = await prisma.property.findUniqueOrThrow({
      where: { id: propertyId },
      select: { coverImageUrl: true },
    });
    const nextCoverImageUrl =
      payload.coverImageUrl !== undefined
        ? normalizedPropertyCoverInput(payload.coverImageUrl, propertyId, previous.coverImageUrl)
        : undefined;
    const nextStories =
      payload.stories !== undefined
        ? sanitizedPropertyStories(payload.stories)
        : undefined;
    const derivedSpecs = nextStories ? propertySnapshotFromStories(nextStories) : null;

    const property = await prisma.property.update({
      where: { id: propertyId },
      data: {
        ...(payload.name !== undefined ? { name: payload.name } : {}),
        ...(payload.address !== undefined ? { address: payload.address || null } : {}),
        ...(payload.cityLine !== undefined ? { cityLine: payload.cityLine || null } : {}),
        ...(payload.notes !== undefined ? { notes: payload.notes || null } : {}),
        ...(nextCoverImageUrl !== undefined ? { coverImageUrl: nextCoverImageUrl } : {}),
        ...(nextStories !== undefined
          ? {
              floors: derivedSpecs?.floors ?? null,
              bedrooms: derivedSpecs?.bedrooms ?? null,
              bathrooms: derivedSpecs?.bathrooms ?? null,
              halfBathrooms: derivedSpecs?.halfBathrooms ?? null,
              livingRooms: derivedSpecs?.livingRooms ?? null,
              diningRooms: derivedSpecs?.diningRooms ?? null,
              kitchens: derivedSpecs?.kitchens ?? null,
              sunroom: derivedSpecs?.sunroom ?? null,
              garages: derivedSpecs?.garages ?? null,
              attic: derivedSpecs?.attic ?? null,
              frontPorch: derivedSpecs?.frontPorch ?? null,
              backPorch: derivedSpecs?.backPorch ?? null,
              floorGroups: nextStories.length
                ? propertyStoriesToJson(nextStories)
                : Prisma.DbNull,
            }
          : {}),
        ...(nextStories === undefined && payload.floors !== undefined
          ? { floors: payload.floors }
          : {}),
        ...(nextStories === undefined && payload.bedrooms !== undefined
          ? { bedrooms: payload.bedrooms }
          : {}),
        ...(nextStories === undefined && payload.bathrooms !== undefined
          ? { bathrooms: payload.bathrooms }
          : {}),
        ...(nextStories === undefined && payload.halfBathrooms !== undefined
          ? { halfBathrooms: payload.halfBathrooms }
          : {}),
        ...(nextStories === undefined && payload.livingRooms !== undefined
          ? { livingRooms: payload.livingRooms }
          : {}),
        ...(nextStories === undefined && payload.diningRooms !== undefined
          ? { diningRooms: payload.diningRooms }
          : {}),
        ...(nextStories === undefined && payload.kitchens !== undefined
          ? { kitchens: payload.kitchens }
          : {}),
        ...(nextStories === undefined && payload.sunroom !== undefined
          ? { sunroom: payload.sunroom }
          : {}),
        ...(nextStories === undefined && payload.garages !== undefined
          ? { garages: payload.garages }
          : {}),
        ...(nextStories === undefined && payload.attic !== undefined
          ? { attic: payload.attic }
          : {}),
        ...(nextStories === undefined && payload.frontPorch !== undefined
          ? { frontPorch: payload.frontPorch }
          : {}),
        ...(nextStories === undefined && payload.backPorch !== undefined
          ? { backPorch: payload.backPorch }
          : {}),
      },
      include: {
        jobs: {
          select: {
            status: true,
            dueDate: true,
          },
        },
      },
    });

    const previousStoredName = storedNameFromUrl(previous.coverImageUrl);
    const nextStoredName =
      nextCoverImageUrl !== undefined
        ? storedNameFromUrl(nextCoverImageUrl)
        : previousStoredName;

    if (previousStoredName && previousStoredName !== nextStoredName) {
      await deleteStoredFile(previousStoredName);
    }

    response.json(serializePropertySummary(property));
  }),
);

app.post(
  '/api/properties/:propertyId/cover-image',
  upload.single('coverImage'),
  asyncRoute(async (request, response) => {
    if (!requireAdmin(request, response)) {
      return;
    }

    const propertyId = String(request.params.propertyId);
    const file = (request as Request & { file?: Express.Multer.File }).file;

    if (!file) {
      response.status(400).json({ message: 'Cover image file is required.' });
      return;
    }

    const previous = await prisma.property.findUniqueOrThrow({
      where: { id: propertyId },
      select: { coverImageUrl: true },
    });

    const property = await prisma.property.update({
      where: { id: propertyId },
      data: {
        coverImageUrl: buildFileUrl(file.filename),
      },
      include: {
        jobs: {
          select: {
            status: true,
            dueDate: true,
          },
        },
      },
    });

    const previousStoredName = storedNameFromUrl(previous.coverImageUrl);
    if (previousStoredName && previousStoredName !== file.filename) {
      await deleteStoredFile(previousStoredName);
    }

    response.json(serializePropertySummary(property));
  }),
);

app.delete(
  '/api/properties/:propertyId',
  asyncRoute(async (request, response) => {
    if (!requireAdmin(request, response)) {
      return;
    }

    const propertyId = String(request.params.propertyId);
    const property = await prisma.property.findUniqueOrThrow({
      where: { id: propertyId },
      select: { coverImageUrl: true },
    });
    const files = await prisma.jobFile.findMany({
      where: { job: { propertyId } },
      select: { storedName: true },
    });

    await prisma.property.delete({
      where: { id: propertyId },
    });

    await Promise.all(
      files
        .map((file) => file.storedName)
        .filter((storedName): storedName is string => Boolean(storedName))
        .map((storedName) => deleteStoredFile(storedName)),
    );

    const coverImageStoredName = storedNameFromUrl(property.coverImageUrl);
    if (coverImageStoredName) {
      await deleteStoredFile(coverImageStoredName);
    }

    response.json({ message: 'Property deleted successfully.' });
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
    });

    const updatedUser = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: userSummarySelect,
    });

    response.json(serializeUserSummary(updatedUser));
  }),
);

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

    const worker = await prisma.worker.update({
      where: {
        id: workerId,
      },
      data: {
        status: payload.status,
      },
    });

    await prisma.workerHistory.create({
      data: {
        workerId: worker.id,
        workerName: worker.name,
        action:
          payload.status === WorkerStatus.ACTIVE
            ? WorkerHistoryAction.ENABLED
            : WorkerHistoryAction.DISABLED,
        previousStatus: previous.status,
        newStatus: payload.status,
        performedBy: actorFromRequest(request),
      },
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

    await prisma.workerHistory.deleteMany({});

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

    response.json(
      history.map((item) => ({
        id: item.id,
        date: item.createdAt.toISOString(),
        worker: item.workerName,
        action: workerHistoryActionLabels[item.action],
        previousStatus: item.previousStatus ? workerStatusLabels[item.previousStatus] : null,
        newStatus: item.newStatus ? workerStatusLabels[item.newStatus] : null,
        performedBy: item.performedBy,
        notes: item.notes,
      })),
    );
  }),
);

app.post(
  '/api/system/seed',
  asyncRoute(async (_request, response) => {
    if (!requireAdmin(_request, response)) {
      return;
    }

    response.json(await seedSystem());
  }),
);

if (env.NODE_ENV === 'production') {
  app.use(express.static(frontendDistDir, { index: false }));
  app.get(/^\/(?!api(?:\/|$)).*/, (_request, response, next) => {
    if (!hasFrontendBuild()) {
      next();
      return;
    }

    response.sendFile(frontendIndexFile);
  });
}

app.use((_request, response) => {
  response.status(404).json({
    message: 'Route not found',
  });
});

app.use((error: unknown, _request: Request, response: Response, next: NextFunction) => {
  void next;
  if (error instanceof z.ZodError) {
    response.status(400).json({
      message: 'Invalid request payload',
      issues: error.issues,
    });
    return;
  }

  if (error instanceof multer.MulterError) {
    response.status(400).json({
      message: error.message,
    });
    return;
  }

  console.error(error);
  response.status(500).json({
    message: error instanceof Error ? error.message : 'Unexpected server error',
  });
});

let server: ReturnType<typeof app.listen>;

const start = async () => {
  const adminCount = await prisma.user.count({
    where: {
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    },
  });

  server = app.listen(env.API_PORT, () => {
    console.log(`API listening on http://localhost:${env.API_PORT}`);
    if (adminCount === 0) {
      console.warn(
        'No active admin account was found. Run `npm run admin:bootstrap --prefix backend -- --username <user> --password <password>`.',
      );
    }
  });
};

const shutdown = async () => {
  await prisma.$disconnect();
  server?.close(() => {
    process.exit(0);
  });
};

void start().catch(async (error) => {
  console.error('Could not start API', error);
  await prisma.$disconnect();
  process.exit(1);
});

process.on('SIGINT', () => {
  void shutdown();
});

process.on('SIGTERM', () => {
  void shutdown();
});
