-- AlterTable
ALTER TABLE "ManagedFileBackup"
ADD COLUMN "encoding" TEXT NOT NULL DEFAULT 'identity',
ADD COLUMN "storedSize" INTEGER NOT NULL DEFAULT 0;

-- Backfill actual stored byte sizes for existing rows.
UPDATE "ManagedFileBackup"
SET "storedSize" = OCTET_LENGTH("data");

-- CreateIndex
CREATE INDEX "GeneratedDocument_issueDate_createdAt_idx"
ON "GeneratedDocument"("issueDate", "createdAt");

-- CreateIndex
CREATE INDEX "GeneratedDocument_owner_documentType_issueDate_idx"
ON "GeneratedDocument"("owner", "documentType", "issueDate");
