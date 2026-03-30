import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import type { Express } from 'express';
import { env } from '../env.js';
import { createStoredUploadName, ensureUploadsDir, resolveStoredFilePath } from './uploads.js';

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

  return null;
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

  const filePath = resolveStoredFilePath(storedRef);
  if (!fs.existsSync(filePath)) {
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
