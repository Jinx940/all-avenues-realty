import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { env } from '../env.js';

const uploadFieldNames = ['before', 'progress', 'after', 'receipt', 'invoice', 'quote'] as const;
const imageFieldNames = new Set(['before', 'progress', 'after', 'coverImage']);
const imageMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const documentMimeTypes = new Set([...imageMimeTypes, 'application/pdf']);
const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const documentExtensions = new Set([...imageExtensions, '.pdf']);
const extensionsByMimeType: Record<string, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'application/pdf': ['.pdf'],
};

const sanitizeFileName = (fileName: string) =>
  fileName
    .normalize('NFD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

export const createStoredUploadName = (originalName: string) => {
  const extension = path.extname(originalName);
  const baseName = path.basename(originalName, extension);
  const safeBaseName = sanitizeFileName(baseName) || 'file';
  return `${Date.now()}-${Math.round(Math.random() * 1e9)}-${safeBaseName}${extension}`;
};

export const isAllowedUploadFile = (
  fieldName: string,
  mimeType: string,
  originalName: string,
) => {
  const normalizedMimeType = String(mimeType ?? '').trim().toLowerCase();
  const extension = path.extname(String(originalName ?? '').trim()).toLowerCase();
  const expectsImage = imageFieldNames.has(fieldName);
  const allowedMimeTypes = expectsImage ? imageMimeTypes : documentMimeTypes;
  const allowedExtensions = expectsImage ? imageExtensions : documentExtensions;
  const extensionsForMimeType = extensionsByMimeType[normalizedMimeType] ?? [];

  return (
    Boolean(extension) &&
    allowedMimeTypes.has(normalizedMimeType) &&
    allowedExtensions.has(extension) &&
    extensionsForMimeType.includes(extension)
  );
};

export const ensureUploadsDir = () => {
  fs.mkdirSync(env.uploadsDir, { recursive: true });
};

ensureUploadsDir();

const ensureStoredName = (storedName: string) => {
  const normalized = path.basename(String(storedName).trim());
  if (!normalized || normalized !== storedName) {
    throw new Error('Invalid stored file reference.');
  }

  return normalized;
};

export const resolveStoredFilePath = (storedName: string) => {
  const safeStoredName = ensureStoredName(storedName);
  return path.resolve(env.uploadsDir, safeStoredName);
};

const fileFilter: multer.Options['fileFilter'] = (_request, file, callback) => {
  if (!isAllowedUploadFile(file.fieldname, file.mimetype, file.originalname)) {
    callback(
      new Error(
        imageFieldNames.has(file.fieldname)
          ? 'Only JPG, PNG or WEBP image files are allowed for photo uploads.'
          : 'Only PDF, JPG, PNG or WEBP files are allowed for document uploads.',
      ),
    );
    return;
  }

  callback(null, true);
};

export const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: {
    fileSize: env.maxUploadSizeBytes,
    files: 48,
  },
});

export const jobUploadFields = upload.fields(
  uploadFieldNames.map((name) => ({
    name,
    maxCount: 12,
  })),
);

export const buildFileUrl = (storedName: string) => `/uploads/${storedName}`;

export const deleteStoredFile = async (storedName: string) => {
  await fs.promises.unlink(resolveStoredFilePath(storedName)).catch(() => undefined);
};
