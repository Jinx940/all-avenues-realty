CREATE TABLE "JobSubitem" (
  "id" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
  "dueDate" TIMESTAMP(3),
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "JobSubitem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "JobSubitem_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "JobSubitem_jobId_sortOrder_idx" ON "JobSubitem"("jobId", "sortOrder");
CREATE TABLE "JobSubitemAssignment" (
  "subitemId" TEXT NOT NULL,
  "workerId" TEXT NOT NULL,
  CONSTRAINT "JobSubitemAssignment_pkey" PRIMARY KEY ("subitemId", "workerId"),
  CONSTRAINT "JobSubitemAssignment_subitemId_fkey" FOREIGN KEY ("subitemId") REFERENCES "JobSubitem"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "JobSubitemAssignment_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "JobSubitemAssignment_workerId_idx" ON "JobSubitemAssignment"("workerId");

-- Preserve original descriptions used by existing documents and seed each nonempty paragraph once.
INSERT INTO "JobSubitem" ("id", "jobId", "description", "status", "dueDate", "sortOrder", "createdAt", "updatedAt")
SELECT job."id" || '_description_' || paragraph.position, job."id", btrim(paragraph.text),
       job."status", job."dueDate", paragraph.position::integer - 1, job."createdAt", job."updatedAt"
FROM "Job" AS job
CROSS JOIN LATERAL regexp_split_to_table(job."description", E'[\r\n]+') WITH ORDINALITY AS paragraph(text, position)
WHERE btrim(paragraph.text) <> '';

INSERT INTO "JobSubitemAssignment" ("subitemId", "workerId")
SELECT subitem."id", assignment."workerId"
FROM "JobSubitem" AS subitem JOIN "JobAssignment" AS assignment ON assignment."jobId" = subitem."jobId";

-- Move the existing Work heading to the area column and give services its own heading.
INSERT INTO "TrackerColumn" ("key", "label", "updatedAt")
SELECT 'area', "label", CURRENT_TIMESTAMP FROM "TrackerColumn" WHERE "key" = 'service'
ON CONFLICT ("key") DO NOTHING;
UPDATE "TrackerColumn" SET "label" = 'Services', "updatedAt" = CURRENT_TIMESTAMP WHERE "key" = 'service';
UPDATE "TrackerColumn" SET "label" = 'Description', "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'description' AND "label" IN ('Notes', 'Notas');
