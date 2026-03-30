import fs from 'node:fs/promises';
import { FileCategory } from '@prisma/client';
import { env } from '../env.js';
import { prisma } from '../lib/prisma.js';
import { managedStoredRefFromValue, uploadManagedBuffer } from '../lib/fileStorage.js';
import { resolveStoredFilePath } from '../lib/uploads.js';

const categorySegment = (category: FileCategory) => category.toLowerCase();

const readLocalFile = async (storedName: string) => {
  const filePath = resolveStoredFilePath(storedName);
  try {
    const buffer = await fs.readFile(filePath);
    return { buffer, filePath };
  } catch {
    return null;
  }
};

if (!env.supabase) {
  console.error(
    'Supabase Storage is not configured. Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_BUCKET first.',
  );
  process.exit(1);
}

let migratedJobFiles = 0;
let migratedPropertyCovers = 0;
let skippedMissingJobFiles = 0;
let skippedMissingPropertyCovers = 0;

try {
  const legacyJobFiles = await prisma.jobFile.findMany({
    where: {
      storedName: {
        not: null,
      },
    },
    select: {
      id: true,
      jobId: true,
      category: true,
      originalName: true,
      mimeType: true,
      storedName: true,
    },
  });

  for (const file of legacyJobFiles) {
    if (!file.storedName || file.storedName.startsWith('supabase:')) {
      continue;
    }

    const localFile = await readLocalFile(file.storedName);
    if (!localFile) {
      skippedMissingJobFiles += 1;
      console.warn(`Skipped missing legacy job file ${file.id}: ${file.storedName}`);
      continue;
    }

    const nextStoredRef = await uploadManagedBuffer(
      {
        originalName: file.originalName,
        mimeType: file.mimeType,
        buffer: localFile.buffer,
      },
      ['jobs', file.jobId, categorySegment(file.category)],
    );

    await prisma.jobFile.update({
      where: { id: file.id },
      data: { storedName: nextStoredRef },
    });
    migratedJobFiles += 1;
  }

  const legacyPropertyCovers = await prisma.property.findMany({
    where: {
      coverImageUrl: {
        not: null,
      },
    },
    select: {
      id: true,
      name: true,
      coverImageUrl: true,
    },
  });

  for (const property of legacyPropertyCovers) {
    const legacyStoredName = managedStoredRefFromValue(property.coverImageUrl);
    if (!legacyStoredName || legacyStoredName.startsWith('supabase:')) {
      continue;
    }

    const localFile = await readLocalFile(legacyStoredName);
    if (!localFile) {
      skippedMissingPropertyCovers += 1;
      console.warn(`Skipped missing legacy property cover ${property.id}: ${legacyStoredName}`);
      continue;
    }

    const extension = legacyStoredName.split('.').pop()?.toLowerCase();
    const mimeType =
      extension === 'png'
        ? 'image/png'
        : extension === 'webp'
          ? 'image/webp'
          : 'image/jpeg';

    const nextStoredRef = await uploadManagedBuffer(
      {
        originalName: property.name.replace(/[^\w.-]+/g, '-').toLowerCase() + '.' + (extension || 'jpg'),
        mimeType,
        buffer: localFile.buffer,
      },
      ['properties', property.id, 'cover-image'],
    );

    await prisma.property.update({
      where: { id: property.id },
      data: {
        coverImageUrl: nextStoredRef,
      },
    });
    migratedPropertyCovers += 1;
  }

  console.log('Legacy upload migration finished.');
  console.log(`Migrated job files: ${migratedJobFiles}`);
  console.log(`Migrated property covers: ${migratedPropertyCovers}`);
  console.log(`Missing job files skipped: ${skippedMissingJobFiles}`);
  console.log(`Missing property covers skipped: ${skippedMissingPropertyCovers}`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
