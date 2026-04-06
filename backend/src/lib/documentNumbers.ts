import { GeneratedDocumentType, Prisma, type PrismaClient } from '@prisma/client';

type DocumentNumberQueryClient =
  | Pick<PrismaClient, '$queryRaw'>
  | Pick<Prisma.TransactionClient, '$queryRaw'>;

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

export const nextDocumentNumberFromDatabase = async (
  client: DocumentNumberQueryClient,
  documentType: GeneratedDocumentType,
) => {
  const rows = await client.$queryRaw<Array<{ nextNumber: number | bigint | string | null }>>`
    SELECT COALESCE(MAX(CAST("documentNumber" AS INTEGER)), 1000) + 1 AS "nextNumber"
    FROM "GeneratedDocument"
    WHERE "documentType" = ${documentType}
      AND "documentNumber" ~ '^[0-9]+$'
  `;

  const rawValue = rows[0]?.nextNumber;
  const numericValue =
    typeof rawValue === 'bigint'
      ? Number(rawValue)
      : typeof rawValue === 'number'
        ? rawValue
        : Number.parseInt(String(rawValue ?? ''), 10);

  return String(Number.isFinite(numericValue) && numericValue > 1000 ? numericValue : 1001);
};
