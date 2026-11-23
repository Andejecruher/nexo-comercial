-- Migration: coordinators_hierarchy_closeout
-- Description: Gated close-out of the coordinators hierarchy rollout.
--   - Rejects the migration if unresolved backfill issues exist.
--   - Rejects the migration if any active leader still lacks a coordinator.
--   - Narrows the leader_role enum by removing COORDINADOR_SECCIONAL
--     (PostgreSQL does not support dropping an enum value in place).
--   - Sets the default leader role to PROMOTOR_BARRIO.
--   - Enforces leaders.coordinator_id NOT NULL.
--   - Drops the temporary backfill support tables.

-- 1. Gate: refuse close-out until the data is clean.
DO $$
DECLARE
  pending_issues INT;
  unassigned_leaders INT;
BEGIN
  SELECT COUNT(*) INTO pending_issues FROM "coordinator_backfill_issues";

  IF pending_issues > 0 THEN
    RAISE EXCEPTION 'Close-out blocked: % unresolved coordinator backfill issue(s) exist. Resolve them before re-running the close-out migration.', pending_issues;
  END IF;

  SELECT COUNT(*) INTO unassigned_leaders
  FROM "leaders" l
  WHERE l."coordinator_id" IS NULL
    AND l."is_active" = true
    AND NOT EXISTS (
      SELECT 1 FROM "coordinator_backfill_issues" i WHERE i."leader_id" = l."id"
    );

  IF unassigned_leaders > 0 THEN
    RAISE EXCEPTION 'Close-out blocked: % active leader(s) still have no coordinator assigned.', unassigned_leaders;
  END IF;
END $$;

-- 2. Recreate the leader_role enum without COORDINADOR_SECCIONAL.
ALTER TABLE "leaders" ALTER COLUMN "role" DROP DEFAULT;

ALTER TYPE "leader_role" RENAME TO "leader_role_old";
CREATE TYPE "leader_role" AS ENUM ('PROMOTOR_BARRIO', 'ENLACE_TERRITORIAL');

ALTER TABLE "leaders"
  ALTER COLUMN "role" TYPE "leader_role"
  USING "role"::text::"leader_role";

ALTER TABLE "leaders"
  ALTER COLUMN "role" SET DEFAULT 'PROMOTOR_BARRIO'::"leader_role";

DROP TYPE "leader_role_old";

-- 3. Enforce that every leader belongs to a coordinator.
ALTER TABLE "leaders" ALTER COLUMN "coordinator_id" SET NOT NULL;

-- 4. Drop temporary backfill support tables.
DROP TABLE "coordinator_backfill_issues";
DROP TABLE "coordinator_backfill_map";
