import fs from 'node:fs';
import path from 'node:path';
import { brotliCompress, brotliDecompress, constants as zlibConstants } from 'node:zlib';
import { promisify } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import type { Express } from 'express';
import { env } from '../env.js';
import { prisma } from './prisma.js';
import {
  createStoredUploadName,
  ensureUploadsDir,
  normalizeStoredFileName,
  resolveStoredFilePath,
} from './uploads.js';

const supabaseStorageRefPrefix = 'supabase:';
const brotliCompressAsync = promisify(brotliCompress);
const brotliDecompressAsync = promisify(brotliDecompress);
export const managedFileBackupCompressionEncoding = 'br';

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

export const encodeManagedFileBackupBuffer = async (buffer: Buffer) => {
  const compressedBuffer = await brotliCompressAsync(buffer, {
    params: {
      [zlibConstants.BROTLI_PARAM_QUALITY]: 5,
    },
  });
  const shouldStoreCompressed = compressedBuffer.length + 32 < buffer.length;
  return {
    encoding: shouldStoreCompressed ? managedFileBackupCompressionEncoding : 'identity',
    storedBuffer: shouldStoreCompressed ? compressedBuffer : buffer,
  };
};

export const decodeManagedFileBackupBuffer = async ({
  data,
  encoding,
}: {
  data: Uint8Array;
  encoding: string | null;
}) => {
  const buffer = Buffer.from(data);
  if (encoding === managedFileBackupCompressionEncoding) {
    return Buffer.from(await brotliDecompressAsync(buffer));
  }

  return buffer;
};

const upsertManagedFileBackup = async ({
  storedRef,
  originalName,
  mimeType,
  buffer,
}: {
  storedRef: string;
  originalName: string;
  mimeType: string;
  buffer: Buffer;
}) => {
  const { encoding, storedBuffer } = await encodeManagedFileBackupBuffer(buffer);
  const binaryData = Uint8Array.from(storedBuffer);

  const backup = await prisma.managedFileBackup.upsert({
    where: { storedRef },
    create: {
      storedRef,
      originalName,
      encoding,
      mimeType,
      size: buffer.length,
      storedSize: storedBuffer.length,
      data: binaryData,
    },
    update: {
      originalName,
      encoding,
      mimeType,
      size: buffer.length,
      storedSize: storedBuffer.length,
      data: binaryData,
    },
  });

  return {
    size: backup.size,
    storedSize: backup.storedSize,
    encoding: backup.encoding,
  };
};

const readManagedFileBackup = async (storedRef: string) =>
  prisma.managedFileBackup.findUnique({
    where: { storedRef },
    select: {
      storedRef: true,
      encoding: true,
      size: true,
      storedSize: true,
      data: true,
      mimeType: true,
    },
  });

export const hasManagedFileBackup = async (storedRef: string) => {
  const item = await prisma.managedFileBackup.findUnique({
    where: { storedRef },
    select: { id: true },
  });
  return Boolean(item);
};

const deleteManagedFileBackup = async (storedRef: string) => {
  await prisma.managedFileBackup.delete({ where: { storedRef } }).catch(() => undefined);
};

export const syncManagedFileBackupFromSource = async ({
  storedRef,
  originalName,
  mimeType,
}: {
  storedRef: string;
  originalName: string;
  mimeType: string;
}) => {
  if (await hasManagedFileBackup(storedRef)) {
    return {
      status: 'already_backed_up' as const,
    };
  }

  const managedFile = await readManagedFile(storedRef);
  if (managedFile.kind === 'missing') {
    return {
      status: 'missing' as const,
      message: managedFile.message,
    };
  }

  const buffer =
    managedFile.kind === 'buffer'
      ? managedFile.buffer
      : await fs.promises.readFile(managedFile.filePath);

  const backup = await upsertManagedFileBackup({
    storedRef,
    originalName,
    mimeType: managedFile.kind === 'buffer' ? managedFile.mimeType || mimeType : mimeType,
    buffer,
  });

  return {
    status: 'backed_up' as const,
    size: backup.size,
    storedSize: backup.storedSize,
  };
};

const restoreLocalManagedFileFromBackup = async (storedRef: string, buffer: Buffer) => {
  const filePath = resolveStoredFilePath(storedRef);
  ensureUploadsDir();
  await fs.promises.writeFile(filePath, buffer);
  return filePath;
};

const uploadPrimaryManagedBuffer = async (
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

const restorePrimaryManagedBuffer = async (storedRef: string, buffer: Buffer, mimeType: string) => {
  if (isSupabaseStorageRef(storedRef)) {
    const storagePath = storagePathFromRef(storedRef);
    if (storagePath && supabase && env.supabase) {
      await supabase.storage.from(env.supabase.bucket).upload(storagePath, buffer, {
        contentType: mimeType,
        upsert: true,
      });
    }
    return null;
  }

  return restoreLocalManagedFileFromBackup(storedRef, buffer);
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
  const storedRef = await uploadPrimaryManagedBuffer(file, pathSegments);

  try {
    await upsertManagedFileBackup({
      storedRef,
      originalName: file.originalName,
      mimeType: file.mimeType,
      buffer: file.buffer,
    });
    return storedRef;
  } catch (error) {
    if (isSupabaseStorageRef(storedRef)) {
      const storagePath = storagePathFromRef(storedRef);
      if (storagePath && supabase && env.supabase) {
        await supabase.storage.from(env.supabase.bucket).remove([storagePath]).catch(() => undefined);
      }
    } else {
      await fs.promises.unlink(resolveStoredFilePath(storedRef)).catch(() => undefined);
    }

    throw error;
  }
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
      const backup = await readManagedFileBackup(storedRef);
      if (backup) {
        const restoredBuffer = await decodeManagedFileBackupBuffer(backup);
        return {
          kind: 'buffer' as const,
          buffer: restoredBuffer,
          mimeType: backup.mimeType || null,
        };
      }

      return {
        kind: 'missing' as const,
        message: 'Supabase Storage is not configured correctly.',
      };
    }

    const { data, error } = await supabase.storage.from(env.supabase.bucket).download(storagePath);
    if (error || !data) {
      const backup = await readManagedFileBackup(storedRef);
      if (backup) {
        const restoredBuffer = await decodeManagedFileBackupBuffer(backup);
        await restorePrimaryManagedBuffer(storedRef, restoredBuffer, backup.mimeType).catch(() => undefined);
        return {
          kind: 'buffer' as const,
          buffer: restoredBuffer,
          mimeType: backup.mimeType || null,
        };
      }

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
    const backup = await readManagedFileBackup(storedRef);
    if (backup) {
      const restoredBuffer = await decodeManagedFileBackupBuffer(backup);
      const restoredFilePath = await restorePrimaryManagedBuffer(
        storedRef,
        restoredBuffer,
        backup.mimeType,
      ).catch(() => null);
      if (restoredFilePath) {
        return {
          kind: 'path' as const,
          filePath: restoredFilePath,
        };
      }

      return {
        kind: 'buffer' as const,
        buffer: restoredBuffer,
        mimeType: backup.mimeType || null,
      };
    }

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
      await deleteManagedFileBackup(storedRef);
      return;
    }

    await supabase.storage.from(env.supabase.bucket).remove([storagePath]).catch(() => undefined);
    await deleteManagedFileBackup(storedRef);
    return;
  }

  await fs.promises.unlink(resolveStoredFilePath(storedRef)).catch(() => undefined);
  await deleteManagedFileBackup(storedRef);
};
