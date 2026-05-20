import { GeneratedDocumentType, Prisma, type PrismaClient } from '@prisma/client';

type DocumentNumberQueryClient =
  | Pick<PrismaClient, '$queryRaw'>
  | Pick<Prisma.TransactionClient, '$queryRaw'>;

const FIRST_AUTO_DOCUMENT_NUMBER = 4001;
const DOCUMENT_NUMBER_FLOOR = FIRST_AUTO_DOCUMENT_NUMBER - 1;

export const nextDocumentNumberFromValues = (documentNumbers: string[]) =>
  String(
    Math.max(
      DOCUMENT_NUMBER_FLOOR,
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
    SELECT GREATEST(COALESCE(MAX(CAST("documentNumber" AS INTEGER)), ${DOCUMENT_NUMBER_FLOOR}), ${DOCUMENT_NUMBER_FLOOR}) + 1 AS "nextNumber"
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

  return String(
    Number.isFinite(numericValue) && numericValue >= FIRST_AUTO_DOCUMENT_NUMBER
      ? numericValue
      : FIRST_AUTO_DOCUMENT_NUMBER,
  );
};
