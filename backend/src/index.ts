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
  workerStatusLabels,
} from './data/defaults.js';
import { env } from './env.js';
import { buildInfo, buildSummary } from './lib/buildInfo.js';
import { recordAuditLog } from './lib/audit.js';
import {
  requireAdmin,
  requireDocumentManager,
  requireJobManager,
  roleScopeForDocuments,
  roleScopeForJobs,
  roleScopeForProperties,
} from './lib/access.js';
import {
  buildDocumentResponse,
  buildPdfPreviewResponse,
  buildGeneratedDocumentUrl,
  buildJobFileUrl,
  buildPropertyCoverUrl,
  sanitizeGeneratedDocumentHtml,
} from './lib/documents.js';
import { isDocumentNumberConflictError, nextDocumentNumberFromDatabase } from './lib/documentNumbers.js';
import { asyncRoute, HttpError, type AuthenticatedRequest } from './lib/http.js';
import { prisma } from './lib/prisma.js';
import { sessionMiddleware } from './lib/sessionAuth.js';
import { ensureWorkerIdsExist, serializeWorkerSummary } from './lib/workers.js';
import {
  normalizePropertyStories,
  propertySnapshotFromStories,
  propertySpecFieldNames,
  propertyStoriesInputSchema,
  propertyStoriesToJson,
  type PropertyStory,
} from './propertySpecs.js';
import {
  ensureUploadsDir,
  jobUploadFields,
  upload,
} from './lib/uploads.js';
import {
  buildJobSectionValue,
  normalizeStoryInput,
  normalizeUnitInput,
} from './lib/jobLocation.js';
import {
  deleteManagedFile,
  inspectManagedFile,
  managedStoredRefFromValue,
  readManagedFile,
  syncManagedFileBackupFromSource,
  uploadManagedFile,
} from './lib/fileStorage.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerUserRoutes } from './routes/users.js';
import { registerWorkerRoutes } from './routes/workers.js';

const app = express();
const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFilePath);
const frontendDistDir = path.resolve(currentDir, '../../frontend/dist');
const frontendIndexFile = path.join(frontendDistDir, 'index.html');

type FileFieldName = keyof typeof fileFieldToCategory;
type UploadedFilesMap = Partial<Record<FileFieldName, Express.Multer.File[]>>;

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

const today = () => new Date(new Date().toDateString());

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

const isExternalUrl = (value: string | null | undefined) => /^https?:\/\//i.test(String(value ?? '').trim());

type PhotoAuditItem = {
  kind: 'JOB_PHOTO' | 'PROPERTY_COVER';
  status: 'MISSING' | 'RECOVERED' | 'AVAILABLE';
  storage: 'local' | 'supabase';
  category: string;
  propertyId: string;
  propertyName: string;
  jobId: string | null;
  fileId: string | null;
  locationLabel: string;
  fileName: string;
  mimeType: string;
  storedRef: string;
  createdAt: string | null;
  message: string | null;
};

type PhotoAuditSummary = {
  totalPhotos: number;
  availablePhotos: number;
  missingPhotos: number;
  recoveredFromLegacyPath: number;
  totalJobPhotos: number;
  missingJobPhotos: number;
  totalPropertyCovers: number;
  missingPropertyCovers: number;
  localRefs: number;
  supabaseRefs: number;
  externalCoverUrls: number;
};

type StorageBackupSummary = {
  totalCandidates: number;
  createdBackups: number;
  alreadyBackedUp: number;
  missingSources: number;
  totalBytesStored: number;
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

const summarizePropertyJobs = (
  jobs: Array<{ propertyId: string; status: JobStatus; dueDate: Date | null }>,
) => {
  const totals = new Map<string, { totalJobs: number; openJobs: number; lateJobs: number }>();
  const currentDay = today();

  jobs.forEach((job) => {
    const existing = totals.get(job.propertyId) ?? { totalJobs: 0, openJobs: 0, lateJobs: 0 };
    existing.totalJobs += 1;

    if (job.status !== JobStatus.DONE) {
      existing.openJobs += 1;
      if (job.dueDate && job.dueDate < currentDay) {
        existing.lateJobs += 1;
      }
    }

    totals.set(job.propertyId, existing);
  });

  return totals;
};

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
  story: normalizeStoryInput(job.story),
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

type UploadedJobFileRecord = {
  category: FileCategory;
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
};

const uploadIncomingJobFiles = async (
  jobId: string,
  filesMap: UploadedFilesMap,
): Promise<UploadedJobFileRecord[]> => {
  const uploadedFiles: UploadedJobFileRecord[] = [];

  try {
    for (const [field, files] of Object.entries(filesMap) as Array<[FileFieldName, Express.Multer.File[]]>) {
      for (const file of files ?? []) {
        const storedName = await uploadManagedFile(file, ['jobs', jobId, field]);
        uploadedFiles.push({
          category: fileFieldToCategory[field],
          originalName: file.originalname,
          storedName,
          mimeType: file.mimetype,
          size: file.size,
        });
      }
    }

    return uploadedFiles;
  } catch (error) {
    await Promise.all(uploadedFiles.map((file) => deleteManagedFile(file.storedName)));
    throw error;
  }
};

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
  jobs?: Array<{ status: JobStatus; dueDate: Date | null }>;
  totalJobs?: number;
  openJobs?: number;
  lateJobs?: number;
}) => {
  const stories = propertyStoriesFromSummary(property);
  const derivedSpecs = stories.length ? propertySnapshotFromStories(stories) : propertySpecsFrom(property);
  const propertyTotals = property.jobs
    ? {
        totalJobs: property.jobs.length,
        openJobs: property.jobs.filter((job) => job.status !== JobStatus.DONE).length,
        lateJobs: property.jobs.filter(
          (job) => job.status !== JobStatus.DONE && job.dueDate && job.dueDate < today(),
        ).length,
      }
    : {
        totalJobs: property.totalJobs ?? 0,
        openJobs: property.openJobs ?? 0,
        lateJobs: property.lateJobs ?? 0,
      };

  return {
    id: property.id,
    name: property.name,
    address: property.address,
    cityLine: property.cityLine,
    notes: property.notes,
    coverImageUrl: property.coverImageUrl
      ? isExternalUrl(property.coverImageUrl)
        ? property.coverImageUrl
        : buildPropertyCoverUrl(property.id)
      : null,
    ...propertySpecsFrom(derivedSpecs),
    stories,
    totalJobs: propertyTotals.totalJobs,
    openJobs: propertyTotals.openJobs,
    lateJobs: propertyTotals.lateJobs,
  };
};

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
  _count: {
    files: number;
  };
  files: Array<{
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
  const linkedJobs = document.files.map((file) => ({
    id: file.job.id,
    story: normalizeStoryInput(file.job.story),
    unit: file.job.unit,
    section: file.job.section,
    area: file.job.area,
    service: file.job.service,
  }));

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
    linkedJobCount: document._count.files,
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
      build: buildInfo,
    });
  }),
);

registerAuthRoutes(app);

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

    const managedFile = await readManagedFile(file.storedName);
    if (managedFile.kind === 'missing') {
      response.status(404).json({ message: managedFile.message });
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
    response.setHeader('Content-Type', managedFile.kind === 'buffer' ? managedFile.mimeType || file.mimeType : file.mimeType);
    response.setHeader('Content-Disposition', `inline; filename="${file.originalName.replace(/"/g, '')}"`);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (managedFile.kind === 'buffer') {
      response.send(managedFile.buffer);
      return;
    }

    response.sendFile(managedFile.filePath);
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

    const storedName = managedStoredRefFromValue(property?.coverImageUrl);
    if (!storedName) {
      if (property?.coverImageUrl && isExternalUrl(property.coverImageUrl)) {
        response.redirect(property.coverImageUrl);
        return;
      }

      response.status(404).json({ message: 'Cover image not found.' });
      return;
    }

    const managedFile = await readManagedFile(storedName);
    if (managedFile.kind === 'missing') {
      response.status(404).json({ message: managedFile.message });
      return;
    }

    response.setHeader('Cache-Control', 'private, max-age=60');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (managedFile.kind === 'buffer') {
      if (managedFile.mimeType) {
        response.setHeader('Content-Type', managedFile.mimeType);
      }
      response.send(managedFile.buffer);
      return;
    }

    response.sendFile(managedFile.filePath);
  }),
);

app.get(
  '/api/admin/storage-audit/photos',
  asyncRoute(async (request, response) => {
    if (!requireAdmin(request, response)) {
      return;
    }

    const requestedLimit = Number.parseInt(String(request.query.limit ?? '25'), 10);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 100)
      : 25;

    const [jobPhotos, propertyCovers] = await Promise.all([
      prisma.jobFile.findMany({
        where: {
          storedName: {
            not: null,
          },
          mimeType: {
            startsWith: 'image/',
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        select: {
          id: true,
          category: true,
          originalName: true,
          storedName: true,
          mimeType: true,
          createdAt: true,
          job: {
            select: {
              id: true,
              story: true,
              unit: true,
              area: true,
              service: true,
              property: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      }),
      prisma.property.findMany({
        where: {
          coverImageUrl: {
            not: null,
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
        select: {
          id: true,
          name: true,
          coverImageUrl: true,
          updatedAt: true,
        },
      }),
    ]);

    let externalCoverUrls = 0;

    const candidates = [
      ...jobPhotos.flatMap((file) =>
        file.storedName
          ? [
              {
                kind: 'JOB_PHOTO' as const,
                fileId: file.id,
                propertyId: file.job.property.id,
                propertyName: file.job.property.name,
                jobId: file.job.id,
                category: fileCategoryLabels[file.category],
                locationLabel: [
                  file.job.property.name,
                  normalizeStoryInput(file.job.story),
                  file.job.unit,
                  file.job.area,
                  file.job.service,
                ]
                  .filter(Boolean)
                  .join(' | '),
                fileName: file.originalName,
                mimeType: file.mimeType,
                storedRef: file.storedName,
                createdAt: file.createdAt.toISOString(),
              },
            ]
          : [],
      ),
      ...propertyCovers.flatMap((property) => {
        const rawCoverValue = String(property.coverImageUrl ?? '').trim();
        const storedRef = managedStoredRefFromValue(rawCoverValue);

        if (!storedRef) {
          if (isExternalUrl(rawCoverValue)) {
            externalCoverUrls += 1;
          }
          return [];
        }

        return [
          {
            kind: 'PROPERTY_COVER' as const,
            fileId: null,
            propertyId: property.id,
            propertyName: property.name,
            jobId: null,
            category: 'Cover image',
            locationLabel: property.name,
            fileName: rawCoverValue.split('/').pop() || 'cover-image',
            mimeType: 'image/*',
            storedRef,
            createdAt: property.updatedAt.toISOString(),
          },
        ];
      }),
    ];

    const summary: PhotoAuditSummary = {
      totalPhotos: candidates.length,
      availablePhotos: 0,
      missingPhotos: 0,
      recoveredFromLegacyPath: 0,
      totalJobPhotos: jobPhotos.length,
      missingJobPhotos: 0,
      totalPropertyCovers: candidates.filter((item) => item.kind === 'PROPERTY_COVER').length,
      missingPropertyCovers: 0,
      localRefs: 0,
      supabaseRefs: 0,
      externalCoverUrls,
    };

    const missingItems: PhotoAuditItem[] = [];
    const recoveredItems: PhotoAuditItem[] = [];

    for (let index = 0; index < candidates.length; index += 12) {
      const batch = candidates.slice(index, index + 12);
      const batchResults = await Promise.all(
        batch.map(async (candidate) => ({
          candidate,
          inspection: await inspectManagedFile(candidate.storedRef),
        })),
      );

      batchResults.forEach(({ candidate, inspection }) => {
        if (inspection.storage === 'local') {
          summary.localRefs += 1;
        } else {
          summary.supabaseRefs += 1;
        }

        if (!inspection.exists) {
          summary.missingPhotos += 1;
          if (candidate.kind === 'JOB_PHOTO') {
            summary.missingJobPhotos += 1;
          } else {
            summary.missingPropertyCovers += 1;
          }

          if (missingItems.length < limit) {
            missingItems.push({
              ...candidate,
              status: 'MISSING',
              storage: inspection.storage,
              message: inspection.message,
            });
          }
          return;
        }

        summary.availablePhotos += 1;
        if (inspection.location === 'fallback' && recoveredItems.length < limit) {
          recoveredItems.push({
            ...candidate,
            status: 'RECOVERED',
            storage: inspection.storage,
            message: inspection.message,
          });
        }
        if (inspection.location === 'fallback') {
          summary.recoveredFromLegacyPath += 1;
        }
      });
    }

    response.json({
      checkedAt: new Date().toISOString(),
      summary,
      missingItems,
      recoveredItems,
    });
  }),
);

app.post(
  '/api/admin/storage-backups/sync',
  asyncRoute(async (request, response) => {
    if (!requireAdmin(request, response)) {
      return;
    }

    const [jobFiles, propertyCovers] = await Promise.all([
      prisma.jobFile.findMany({
        where: {
          storedName: {
            not: null,
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        select: {
          id: true,
          originalName: true,
          mimeType: true,
          storedName: true,
        },
      }),
      prisma.property.findMany({
        where: {
          coverImageUrl: {
            not: null,
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
        select: {
          id: true,
          name: true,
          coverImageUrl: true,
        },
      }),
    ]);

    const candidates = [
      ...jobFiles.flatMap((file) =>
        file.storedName
          ? [
              {
                kind: 'JOB_FILE' as const,
                id: file.id,
                storedRef: file.storedName,
                originalName: file.originalName,
                mimeType: file.mimeType,
              },
            ]
          : [],
      ),
      ...propertyCovers.flatMap((property) => {
        const storedRef = managedStoredRefFromValue(property.coverImageUrl);
        if (!storedRef) {
          return [];
        }

        return [
          {
            kind: 'PROPERTY_COVER' as const,
            id: property.id,
            storedRef,
            originalName: property.name,
            mimeType: 'image/*',
          },
        ];
      }),
    ];

    const summary: StorageBackupSummary = {
      totalCandidates: candidates.length,
      createdBackups: 0,
      alreadyBackedUp: 0,
      missingSources: 0,
      totalBytesStored: 0,
    };

    const missingItems: Array<{
      kind: 'JOB_FILE' | 'PROPERTY_COVER';
      id: string;
      storedRef: string;
      originalName: string;
      message: string | null;
    }> = [];

    for (let index = 0; index < candidates.length; index += 10) {
      const batch = candidates.slice(index, index + 10);
      const results = await Promise.all(
        batch.map(async (candidate) => ({
          candidate,
          result: await syncManagedFileBackupFromSource({
            storedRef: candidate.storedRef,
            originalName: candidate.originalName,
            mimeType: candidate.mimeType,
          }),
        })),
      );

      results.forEach(({ candidate, result }) => {
        if (result.status === 'backed_up') {
          summary.createdBackups += 1;
          summary.totalBytesStored += result.storedSize;
          return;
        }

        if (result.status === 'already_backed_up') {
          summary.alreadyBackedUp += 1;
          return;
        }

        summary.missingSources += 1;
        if (missingItems.length < 25) {
          missingItems.push({
            kind: candidate.kind,
            id: candidate.id,
            storedRef: candidate.storedRef,
            originalName: candidate.originalName,
            message: result.message ?? null,
          });
        }
      });
    }

    await recordAuditLog(prisma, request, {
      entityType: 'Storage',
      entityId: null,
      entityLabel: 'Managed file backups',
      action: 'Backed up files',
      summary: `Created ${summary.createdBackups} backup copies for managed files.`,
      metadata: summary,
    });

    response.json({
      syncedAt: new Date().toISOString(),
      summary,
      missingItems,
    });
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

    const [properties, propertyJobs, workers] = await Promise.all([
      prisma.property.findMany({
        where: roleScopeForProperties(auth),
        orderBy: { name: 'asc' },
      }),
      prisma.job.findMany({
        where: roleScopeForJobs(auth),
        select: {
          propertyId: true,
          status: true,
          dueDate: true,
        },
      }),
      prisma.worker.findMany({
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          status: true,
          user: {
            select: {
              id: true,
            },
          },
          _count: {
            select: {
              assignments: true,
            },
          },
        },
      }),
    ]);

    const propertyJobStats = summarizePropertyJobs(propertyJobs);
    const workerSummaries = workers.map(serializeWorkerSummary);

    response.json({
      statuses: jobStatusOptions,
      invoiceStatuses: invoiceStatusOptions,
      paymentStatuses: visiblePaymentStatusOptions,
      properties: properties.map((property) =>
        serializePropertySummary({
          ...property,
          ...(propertyJobStats.get(property.id) ?? {}),
        }),
      ),
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

registerUserRoutes(app);

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

    response.json({
      nextNumber: await nextDocumentNumberFromDatabase(prisma, documentType),
    });
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
      select: {
        id: true,
        documentType: true,
        owner: true,
        documentNumber: true,
        fileName: true,
        issueDate: true,
        createdAt: true,
        updatedAt: true,
        property: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            files: true,
          },
        },
        files: {
          orderBy: {
            jobId: 'asc',
          },
          take: 3,
          select: {
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

    const property = await prisma.property.findUnique({
      where: { id: payload.propertyId },
      select: {
        id: true,
        name: true,
      },
    });

    if (relatedJobs.length !== uniqueJobIds.length) {
      response.status(400).json({
        message: 'Selected jobs do not belong to the chosen property.',
      });
      return;
    }

    let created: {
      id: string;
      fileName: string;
      documentNumber: string;
    };

    try {
      created = await prisma.$transaction(async (transaction) => {
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

        await recordAuditLog(transaction, request, {
          entityType: 'Document',
          entityId: document.id,
          entityLabel: payload.documentNumber,
          action: 'Generated',
          summary: `Generated ${payload.documentType.toLowerCase()} ${payload.documentNumber} for "${property?.name ?? 'property'}".`,
          metadata: {
            documentType: payload.documentType,
            propertyId: payload.propertyId,
            propertyName: property?.name ?? null,
            linkedJobCount: relatedJobs.length,
          },
        });

        return document;
      });
    } catch (error) {
      if (isDocumentNumberConflictError(error)) {
        throw new HttpError(
          409,
          `This ${payload.documentType.toLowerCase()} number is already in use.`,
        );
      }

      throw error;
    }

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
    const workerIds = await ensureWorkerIdsExist(payload.workerIds);

    const createdJob = await prisma.job.create({
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
          create: workerIds.map((workerId) => ({ workerId })),
        },
      },
    });

    let uploadedFiles: UploadedJobFileRecord[] = [];

    try {
      uploadedFiles = await uploadIncomingJobFiles(createdJob.id, filesMap);

      if (uploadedFiles.length) {
        await prisma.jobFile.createMany({
          data: uploadedFiles.map((file) => ({
            jobId: createdJob.id,
            ...file,
          })),
        });
      }
    } catch (error) {
      await Promise.all(uploadedFiles.map((file) => deleteManagedFile(file.storedName)));
      await prisma.job.delete({ where: { id: createdJob.id } }).catch(() => undefined);
      throw error;
    }

    const hydratedJob = await loadJob(createdJob.id);

    await recordAuditLog(prisma, request, {
      entityType: 'Job',
      entityId: hydratedJob.id,
      entityLabel: `${hydratedJob.property.name} - ${hydratedJob.service}`,
      action: 'Created',
      summary: `Created job "${hydratedJob.service}" for "${hydratedJob.property.name}".`,
      metadata: {
        propertyId: hydratedJob.property.id,
        propertyName: hydratedJob.property.name,
        service: hydratedJob.service,
        status: hydratedJob.status,
        workerCount: hydratedJob.assignments.length,
      },
    });

    response.status(201).json(serializeJob(hydratedJob));
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
    const workerIds = await ensureWorkerIdsExist(payload.workerIds);
    const existingJob = await prisma.job.findUniqueOrThrow({
      where: { id: jobId },
      select: {
        id: true,
        service: true,
        property: {
          select: {
            id: true,
            name: true,
          },
        },
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

    let uploadedFiles: UploadedJobFileRecord[] = [];

    try {
      uploadedFiles = await uploadIncomingJobFiles(jobId, filesMap);

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
            create: workerIds.map((workerId) => ({ workerId })),
          },
          ...(uploadedFiles.length
            ? {
                files: {
                  create: uploadedFiles,
                },
              }
            : {}),
        },
      });
    } catch (error) {
      await Promise.all(uploadedFiles.map((file) => deleteManagedFile(file.storedName)));
      throw error;
    }

    const hydratedJob = await loadJob(jobId);

    await recordAuditLog(prisma, request, {
      entityType: 'Job',
      entityId: hydratedJob.id,
      entityLabel: `${hydratedJob.property.name} - ${hydratedJob.service}`,
      action: 'Updated',
      summary: `Updated job "${hydratedJob.service}" for "${hydratedJob.property.name}".`,
      metadata: {
        previousService: existingJob.service,
        propertyId: hydratedJob.property.id,
        propertyName: hydratedJob.property.name,
        status: hydratedJob.status,
        workerCount: hydratedJob.assignments.length,
      },
    });

    response.json(serializeJob(hydratedJob));
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
        originalName: true,
        job: {
          select: {
            id: true,
            service: true,
            property: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
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
      await deleteManagedFile(targetFile.storedName);
    }

    await recordAuditLog(prisma, request, {
      entityType: 'Job file',
      entityId: targetFile.id,
      entityLabel: targetFile.originalName,
      action: 'Deleted',
      summary: `Deleted ${targetFile.category.toLowerCase()} file "${targetFile.originalName}" from "${targetFile.job.service}" in "${targetFile.job.property.name}".`,
      metadata: {
        jobId: targetFile.job.id,
        propertyId: targetFile.job.property.id,
        category: targetFile.category,
      },
    });

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
    const job = await prisma.job.findUniqueOrThrow({
      where: { id: jobId },
      select: {
        id: true,
        service: true,
        property: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
    const files = await prisma.jobFile.findMany({
      where: { jobId },
      select: { storedName: true },
    });

    await prisma.$transaction(async (transaction) => {
      await transaction.job.delete({
        where: { id: jobId },
      });

      await recordAuditLog(transaction, request, {
        entityType: 'Job',
        entityId: job.id,
        entityLabel: `${job.property.name} - ${job.service}`,
        action: 'Deleted',
        summary: `Deleted job "${job.service}" from "${job.property.name}".`,
        metadata: {
          propertyId: job.property.id,
          propertyName: job.property.name,
        },
      });
    });

    await Promise.all(
      files
        .map((file) => file.storedName)
        .filter((storedName): storedName is string => Boolean(storedName))
        .map((storedName) => deleteManagedFile(storedName)),
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
    const property = await prisma.$transaction(async (transaction) => {
      const createdProperty = await transaction.property.create({
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

      await recordAuditLog(transaction, request, {
        entityType: 'Property',
        entityId: createdProperty.id,
        entityLabel: createdProperty.name,
        action: 'Created',
        summary: `Created property "${createdProperty.name}".`,
        metadata: {
          storyCount: stories.length,
        },
      });

      return createdProperty;
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
      select: {
        id: true,
        name: true,
        coverImageUrl: true,
      },
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

    const property = await prisma.$transaction(async (transaction) => {
      const updatedProperty = await transaction.property.update({
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

      await recordAuditLog(transaction, request, {
        entityType: 'Property',
        entityId: updatedProperty.id,
        entityLabel: updatedProperty.name,
        action: 'Updated',
        summary: `Updated property "${updatedProperty.name}".`,
        metadata: {
          previousName: previous.name,
          storyCount: nextStories?.length ?? null,
        },
      });

      return updatedProperty;
    });

    const previousStoredName = managedStoredRefFromValue(previous.coverImageUrl);
    const nextStoredName =
      nextCoverImageUrl !== undefined
        ? managedStoredRefFromValue(nextCoverImageUrl)
        : previousStoredName;

    if (previousStoredName && previousStoredName !== nextStoredName) {
      await deleteManagedFile(previousStoredName);
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

    let nextStoredName: string | null = null;

    const property = await (async () => {
      try {
        nextStoredName = await uploadManagedFile(file, ['properties', propertyId, 'cover-image']);
        return await prisma.property.update({
          where: { id: propertyId },
          data: {
            coverImageUrl: nextStoredName,
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
      } catch (error) {
        if (nextStoredName) {
          await deleteManagedFile(nextStoredName);
        }
        throw error;
      }
    })();

    const previousStoredName = managedStoredRefFromValue(previous.coverImageUrl);
    if (previousStoredName && previousStoredName !== nextStoredName) {
      await deleteManagedFile(previousStoredName);
    }

    await recordAuditLog(prisma, request, {
      entityType: 'Property',
      entityId: property.id,
      entityLabel: property.name,
      action: 'Updated cover',
      summary: `Updated main photo for property "${property.name}".`,
      metadata: {
        previousCoverImageUrl: previous.coverImageUrl,
      },
    });

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
      select: {
        id: true,
        name: true,
        coverImageUrl: true,
      },
    });
    const files = await prisma.jobFile.findMany({
      where: { job: { propertyId } },
      select: { storedName: true },
    });

    await prisma.$transaction(async (transaction) => {
      await transaction.property.delete({
        where: { id: propertyId },
      });

      await recordAuditLog(transaction, request, {
        entityType: 'Property',
        entityId: property.id,
        entityLabel: property.name,
        action: 'Deleted',
        summary: `Deleted property "${property.name}".`,
      });
    });

    await Promise.all(
      files
        .map((file) => file.storedName)
        .filter((storedName): storedName is string => Boolean(storedName))
        .map((storedName) => deleteManagedFile(storedName)),
    );

    const coverImageStoredName = managedStoredRefFromValue(property.coverImageUrl);
    if (coverImageStoredName) {
      await deleteManagedFile(coverImageStoredName);
    }

    response.json({ message: 'Property deleted successfully.' });
  }),
);

registerWorkerRoutes(app);

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

  if (error instanceof HttpError) {
    response.status(error.status).json({
      message: error.message,
      ...(error.details ? error.details : {}),
    });
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2003') {
      response.status(400).json({
        message: 'The request references a related record that no longer exists.',
      });
      return;
    }

    if (error.code === 'P2025') {
      response.status(404).json({
        message: 'The requested record was not found.',
      });
      return;
    }
  }

  console.error(error);
  response.status(500).json({
    message: error instanceof Error ? error.message : 'Unexpected server error',
  });
});

let server: ReturnType<typeof app.listen>;
const listenHost = '0.0.0.0';

const start = async () => {
  server = app.listen(env.API_PORT, listenHost, () => {
    console.log(`API listening on http://${listenHost}:${env.API_PORT}`);
    console.log(`Build ${buildSummary()}`);
  });

  void prisma.user
    .count({
      where: {
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
      },
    })
    .then((adminCount) => {
      if (adminCount === 0) {
        console.warn(
          'No active admin account was found. Run `npm run admin:bootstrap --prefix backend -- --username <user> --password <password>`.',
        );
      }
    })
    .catch((error) => {
      console.error('Could not verify admin accounts during startup', error);
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
