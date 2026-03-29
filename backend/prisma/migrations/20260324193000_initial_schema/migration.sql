-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('DONE', 'IN_PROGRESS', 'PENDING', 'PLANNING');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PAID', 'PARTIAL_PAYMENT', 'UNPAID', 'NOT_INVOICED_YET');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('YES', 'NO');

-- CreateEnum
CREATE TYPE "WorkerStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'OFFICE', 'WORKER', 'VIEWER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "FileCategory" AS ENUM ('BEFORE', 'PROGRESS', 'AFTER', 'RECEIPT', 'INVOICE', 'QUOTE');

-- CreateEnum
CREATE TYPE "GeneratedDocumentType" AS ENUM ('INVOICE', 'QUOTE');

-- CreateEnum
CREATE TYPE "DocumentOwner" AS ENUM ('AZE', 'RYAN');

-- CreateEnum
CREATE TYPE "WorkerHistoryAction" AS ENUM ('ADDED', 'DISABLED', 'ENABLED', 'DELETED');

-- CreateTable
CREATE TABLE "Property" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "cityLine" TEXT,
    "notes" TEXT,
    "coverImageUrl" TEXT,
    "floors" INTEGER,
    "bedrooms" INTEGER,
    "bathrooms" INTEGER,
    "halfBathrooms" INTEGER,
    "livingRooms" INTEGER,
    "diningRooms" INTEGER,
    "kitchens" INTEGER,
    "garages" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Worker" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "WorkerStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Worker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'WORKER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "workerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "materialCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "laborCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "invoiceStatus" "InvoiceStatus" NOT NULL DEFAULT 'NO',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'NOT_INVOICED_YET',
    "advanceCashApp" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "startDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobAssignment" (
    "jobId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobAssignment_pkey" PRIMARY KEY ("jobId","workerId")
);

-- CreateTable
CREATE TABLE "JobFile" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "category" "FileCategory" NOT NULL,
    "originalName" TEXT NOT NULL,
    "storedName" TEXT,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "documentNumber" TEXT,
    "generatedDocumentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedDocument" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "documentType" "GeneratedDocumentType" NOT NULL,
    "owner" "DocumentOwner" NOT NULL,
    "documentNumber" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'text/html',
    "html" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeneratedDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerHistory" (
    "id" TEXT NOT NULL,
    "workerId" TEXT,
    "workerName" TEXT NOT NULL,
    "action" "WorkerHistoryAction" NOT NULL,
    "previousStatus" "WorkerStatus",
    "newStatus" "WorkerStatus",
    "performedBy" TEXT NOT NULL DEFAULT 'Admin',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkerHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Property_name_key" ON "Property"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Worker_name_key" ON "Worker"("name");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_workerId_key" ON "User"("workerId");

-- CreateIndex
CREATE INDEX "User_role_status_idx" ON "User"("role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "UserSession_tokenHash_key" ON "UserSession"("tokenHash");

-- CreateIndex
CREATE INDEX "UserSession_userId_idx" ON "UserSession"("userId");

-- CreateIndex
CREATE INDEX "UserSession_expiresAt_idx" ON "UserSession"("expiresAt");

-- CreateIndex
CREATE INDEX "Job_propertyId_idx" ON "Job"("propertyId");

-- CreateIndex
CREATE INDEX "Job_status_idx" ON "Job"("status");

-- CreateIndex
CREATE INDEX "Job_paymentStatus_idx" ON "Job"("paymentStatus");

-- CreateIndex
CREATE INDEX "JobFile_jobId_category_idx" ON "JobFile"("jobId", "category");

-- CreateIndex
CREATE INDEX "JobFile_generatedDocumentId_idx" ON "JobFile"("generatedDocumentId");

-- CreateIndex
CREATE INDEX "GeneratedDocument_propertyId_documentType_idx" ON "GeneratedDocument"("propertyId", "documentType");

-- CreateIndex
CREATE UNIQUE INDEX "GeneratedDocument_documentType_documentNumber_key" ON "GeneratedDocument"("documentType", "documentNumber");

-- CreateIndex
CREATE INDEX "WorkerHistory_workerId_idx" ON "WorkerHistory"("workerId");

-- CreateIndex
CREATE INDEX "WorkerHistory_createdAt_idx" ON "WorkerHistory"("createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobAssignment" ADD CONSTRAINT "JobAssignment_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobAssignment" ADD CONSTRAINT "JobAssignment_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobFile" ADD CONSTRAINT "JobFile_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobFile" ADD CONSTRAINT "JobFile_generatedDocumentId_fkey" FOREIGN KEY ("generatedDocumentId") REFERENCES "GeneratedDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedDocument" ADD CONSTRAINT "GeneratedDocument_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerHistory" ADD CONSTRAINT "WorkerHistory_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE SET NULL ON UPDATE CASCADE;
