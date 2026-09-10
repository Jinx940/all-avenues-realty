ALTER TYPE "JobStatus" ADD VALUE 'STUCK' AFTER 'IN_PROGRESS';

CREATE TYPE "JobPriority" AS ENUM ('HIGH', 'MEDIUM', 'LOW');
ALTER TABLE "Job" ADD COLUMN "priority" "JobPriority";

CREATE TABLE "TrackerLabel" (
  "kind" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "color" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrackerLabel_pkey" PRIMARY KEY ("kind", "value")
);
