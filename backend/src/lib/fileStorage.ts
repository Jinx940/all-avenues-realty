import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import type { Express } from 'express';
import { env } from '../env.js';
import {
  createStoredUploadName,
  ensureUploadsDir,
  normalizeStoredFileName,
  resolveStoredFilePath,
} from './uploads.js';

const supabaseStorageRefPrefix = 'supabase:';

const sanitizePathSegment = (value: string) =>
  String(value ?? '')
    .trim()
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const normalizeStoragePath = (value: string) => {
  const normalized = path.posix.normalize(String(value ?? '').trim()).replace(/^\/+/, '');
  if (!normalized || normalized === '.' || normalized.startsWith('../')) {
    throw new Error('Invalid Supabase Storage path.');
  }

  return normalized;
};

const supabase = env.supabase
  ? createClient(env.supabase.url, env.supabase.serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

export const isSupabaseStorageRef = (value: string | null | undefined) =>
  String(value ?? '').trim().startsWith(supabaseStorageRefPrefix);

export const createSupabaseStorageRef = (storagePath: string) =>
  `${supabaseStorageRefPrefix}${normalizeStoragePath(storagePath)}`;

export const storagePathFromRef = (value: string) => {
  if (!isSupabaseStorageRef(value)) {
    return null;
  }

  return normalizeStoragePath(String(value).trim().slice(supabaseStorageRefPrefix.length));
};

export const managedStoredRefFromValue = (value: string | null | undefined) => {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return null;
  }

  if (isSupabaseStorageRef(raw)) {
    return raw;
  }

  if (raw.startsWith('/uploads/')) {
    return raw.slice('/uploads/'.length) || null;
  }

  // Legacy local uploads may still be stored as a bare file name in the database.
  if (!raw.includes('/') && !raw.includes('\\')) {
    return raw;
  }

  return null;
};

export const localUploadsSearchDirs = (cwd = process.cwd(), uploadsDir = env.uploadsDir) =>
  Array.from(
    new Set(
      [
        uploadsDir,
        path.resolve(cwd, 'uploads'),
        path.resolve(cwd, 'backend', 'uploads'),
        path.resolve(cwd, '..', 'uploads'),
      ].map((value) => path.resolve(value)),
    ),
  );

export const localStoredFileSearchPaths = (
  storedRef: string,
  cwd = process.cwd(),
  uploadsDir = env.uploadsDir,
) => {
  const safeStoredName = normalizeStoredFileName(storedRef);
  return localUploadsSearchDirs(cwd, uploadsDir).map((directory) =>
    path.resolve(directory, safeStoredName),
  );
};

type LocalManagedFileInspection = {
  exists: boolean;
  location: 'primary' | 'fallback' | 'missing';
  primaryPath: string | null;
  resolvedPath: string | null;
  message: string | null;
};

const inspectLocalManagedFile = (storedRef: string): LocalManagedFileInspection => {
  const searchPaths = localStoredFileSearchPaths(storedRef);
  const primaryPath = searchPaths[0] ?? null;

  if (!primaryPath) {
    return {
      exists: false,
      location: 'missing',
      primaryPath: null,
      resolvedPath: null,
      message: 'Stored file is missing from the server disk.',
    };
  }

  if (fs.existsSync(primaryPath)) {
    return {
      exists: true,
      location: 'primary',
      primaryPath,
      resolvedPath: primaryPath,
      message: null,
    };
  }

  const fallbackPath = searchPaths.find((candidatePath) => candidatePath !== primaryPath && fs.existsSync(candidatePath));
  if (!fallbackPath) {
    return {
      exists: false,
      location: 'missing',
      primaryPath,
      resolvedPath: null,
      message: 'Stored file is missing from the server disk.',
    };
  }

  return {
    exists: true,
    location: 'fallback',
    primaryPath,
    resolvedPath: fallbackPath,
    message: 'Stored file is available in a legacy uploads directory.',
  };
};

const resolveReadableLocalManagedFile = async (storedRef: string) => {
  const inspection = inspectLocalManagedFile(storedRef);
  if (!inspection.exists || !inspection.resolvedPath) {
    return null;
  }

  if (inspection.location === 'primary' || !inspection.primaryPath) {
    return inspection.resolvedPath;
  }

  ensureUploadsDir();
  await fs.promises.copyFile(inspection.resolvedPath, inspection.primaryPath).catch(() => undefined);
  return fs.existsSync(inspection.primaryPath) ? inspection.primaryPath : inspection.resolvedPath;
};

export type ManagedFileInspection = {
  storage: 'local' | 'supabase';
  exists: boolean;
  location: 'primary' | 'fallback' | 'supabase' | 'missing';
  resolvedPath: string | null;
  message: string | null;
};

export const inspectManagedFile = async (storedRef: string): Promise<ManagedFileInspection> => {
  if (isSupabaseStorageRef(storedRef)) {
    const storagePath = storagePathFromRef(storedRef);
    if (!storagePath || !supabase || !env.supabase) {
      return {
        storage: 'supabase',
        exists: false,
        location: 'missing',
        resolvedPath: storagePath,
        message: 'Supabase Storage is not configured correctly.',
      };
    }

    const { data, error } = await supabase.storage.from(env.supabase.bucket).exists(storagePath);
    if (error || !data) {
      return {
        storage: 'supabase',
        exists: false,
        location: 'missing',
        resolvedPath: storagePath,
        message: error?.message || 'Stored file is missing from Supabase Storage.',
      };
    }

    return {
      storage: 'supabase',
      exists: true,
      location: 'supabase',
      resolvedPath: storagePath,
      message: null,
    };
  }

  const inspection = inspectLocalManagedFile(storedRef);
  return {
    storage: 'local',
    exists: inspection.exists,
    location: inspection.exists ? inspection.location : 'missing',
    resolvedPath: inspection.resolvedPath,
    message: inspection.message,
  };
};

type ManagedUploadInput = {
  originalName: string;
  mimeType: string;
  buffer: Buffer;
};

export const uploadManagedBuffer = async (
  file: ManagedUploadInput,
  pathSegments: string[],
) => {
  const fileName = createStoredUploadName(file.originalName);

  if (supabase && env.supabase) {
    const storagePath = normalizeStoragePath(
      [...pathSegments.map(sanitizePathSegment).filter(Boolean), fileName].join('/'),
    );
    const { error } = await supabase.storage.from(env.supabase.bucket).upload(storagePath, file.buffer, {
      contentType: file.mimeType,
      upsert: false,
    });

    if (error) {
      throw new Error(`Could not upload file to Supabase Storage. ${error.message}`);
    }

    return createSupabaseStorageRef(storagePath);
  }

  ensureUploadsDir();
  await fs.promises.writeFile(resolveStoredFilePath(fileName), file.buffer);
  return fileName;
};

export const uploadManagedFile = async (
  file: Express.Multer.File,
  pathSegments: string[],
) =>
  uploadManagedBuffer(
    {
      originalName: file.originalname,
      mimeType: file.mimetype,
      buffer: file.buffer,
    },
    pathSegments,
  );

export const readManagedFile = async (storedRef: string) => {
  if (isSupabaseStorageRef(storedRef)) {
    const storagePath = storagePathFromRef(storedRef);
    if (!storagePath || !supabase || !env.supabase) {
      return {
        kind: 'missing' as const,
        message: 'Supabase Storage is not configured correctly.',
      };
    }

    const { data, error } = await supabase.storage.from(env.supabase.bucket).download(storagePath);
    if (error || !data) {
      return {
        kind: 'missing' as const,
        message: 'Stored file is missing from Supabase Storage.',
      };
    }

    return {
      kind: 'buffer' as const,
      buffer: Buffer.from(await data.arrayBuffer()),
      mimeType: data.type || null,
    };
  }

  const filePath = await resolveReadableLocalManagedFile(storedRef);
  if (!filePath) {
    return {
      kind: 'missing' as const,
      message: 'Stored file is missing from the server disk.',
    };
  }

  return {
    kind: 'path' as const,
    filePath,
  };
};

export const deleteManagedFile = async (storedRef: string) => {
  if (isSupabaseStorageRef(storedRef)) {
    const storagePath = storagePathFromRef(storedRef);
    if (!storagePath || !supabase || !env.supabase) {
      return;
    }

    await supabase.storage.from(env.supabase.bucket).remove([storagePath]).catch(() => undefined);
    return;
  }

  await fs.promises.unlink(resolveStoredFilePath(storedRef)).catch(() => undefined);
};
