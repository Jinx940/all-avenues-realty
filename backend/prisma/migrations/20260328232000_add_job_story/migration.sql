ALTER TABLE "Job"
ADD COLUMN "story" TEXT NOT NULL DEFAULT '';

UPDATE "Job"
SET
  "story" = TRIM(SPLIT_PART("unit", ' / ', 1)),
  "unit" = TRIM(SUBSTRING("unit" FROM POSITION(' / ' IN "unit") + 3))
WHERE POSITION(' / ' IN "unit") > 0;

UPDATE "Job"
SET
  "story" = TRIM("unit"),
  "unit" = ''
WHERE "story" = ''
  AND TRIM("unit") ~* '^Story\\s+.+$';
