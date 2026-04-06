import { Prisma } from '@prisma/client';

export const nextDocumentNumberFromValues = (documentNumbers: string[]) =>
  String(
    Math.max(
      1000,
      ...documentNumbers
        .map((value) => Number.parseInt(String(value).trim(), 10))
        .filter((value) => Number.isFinite(value)),
    ) + 1,
  );

export const isDocumentNumberConflictError = (error: unknown) => {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }

  const target = Array.isArray(error.meta?.target)
    ? error.meta.target.map((value) => String(value))
    : [];

  return target.includes('documentType') && target.includes('documentNumber');
};
