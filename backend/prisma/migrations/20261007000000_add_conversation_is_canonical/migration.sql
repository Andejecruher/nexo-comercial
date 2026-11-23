-- AlterTable: one canonical conversation row per citizen (Opción A).
ALTER TABLE "conversations"
  ADD COLUMN IF NOT EXISTS "is_canonical" BOOLEAN NOT NULL DEFAULT true;

-- Backfill: keep exactly one canonical row per citizen. Prefer the active
-- conversation (open/in_progress), then the most recently updated one. This
-- yields a single visible row per citizen in the admin conversation list.
UPDATE "conversations" AS c
SET "is_canonical" = false
FROM (
  SELECT DISTINCT ON ("citizen_id") "citizen_id", "id"
  FROM "conversations"
  ORDER BY
    "citizen_id" ASC,
    ("status" IN ('open', 'in_progress')) DESC,
    "updated_at" DESC,
    "id" DESC
) AS preferida
WHERE c."citizen_id" = preferida."citizen_id"
  AND c."id" <> preferida."id";

-- Invariant (raw SQL, outside the Prisma datamodel — same pattern as
-- 00000000000022_add_raw_sql_invariants): at most one canonical row per
-- citizen, enforced by the database.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_conversations_canonical_per_citizen"
  ON "conversations" ("citizen_id")
  WHERE "is_canonical";
