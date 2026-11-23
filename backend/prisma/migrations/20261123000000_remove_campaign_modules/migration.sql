-- Remove the six retired campaign modules.
-- Historical Drive/GCS objects are intentionally preserved; only database
-- metadata and records are removed.

-- Abort before destructive changes when removing section_id would collapse
-- two non-null municipality keys into the new retained-neighborhood key.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "neighborhoods"
    WHERE "municipality" IS NOT NULL
    GROUP BY "match_key", "municipality"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot remove campaign modules: duplicate neighborhoods exist for (match_key, municipality)';
  END IF;
END
$$;

-- Seed upserts do not remove retired permissions, so clean persisted RBAC
-- assignments before deleting the permission catalog rows.
DELETE FROM "role_permissions"
WHERE "permission_id" IN (
  SELECT "id"
  FROM "permissions"
  WHERE "module" IN (
    'indicadores_precampana',
    'promovidos',
    'lideres',
    'coordinadores',
    'catalogo_electoral'
  )
);

DELETE FROM "permissions"
WHERE "module" IN (
  'indicadores_precampana',
  'promovidos',
  'lideres',
  'coordinadores',
  'catalogo_electoral'
);

-- Export files remain in Drive/GCS. Their database jobs must be removed before
-- PostgreSQL can narrow the enum to the retained citizens module.
DELETE FROM "export_jobs"
WHERE "module" IN ('promoted', 'leaders', 'coordinators');

CREATE TYPE "export_module_new" AS ENUM ('citizens');
ALTER TABLE "export_jobs"
  ALTER COLUMN "module" TYPE "export_module_new"
  USING ("module"::text::"export_module_new");
DROP TYPE "export_module";
ALTER TYPE "export_module_new" RENAME TO "export_module";

-- Drop the dependent campaign graph from leaves to roots.
DROP TABLE "precampaign_goals";
DROP TABLE "promovidos";
DROP TABLE "ocr_extractions";
DROP TABLE "ine_ocr_jobs";
DROP TABLE "stored_files";
DROP TABLE "upload_records";
DROP TABLE "leaders";
DROP TABLE "coordinators";
DROP TABLE "organizational_structures";

-- Neighborhoods remain, but their optional electoral section relation does not.
DROP INDEX "uq_neighborhoods_section_match_key";
DROP INDEX "neighborhoods_section_id_idx";
ALTER TABLE "neighborhoods" DROP COLUMN "section_id";
CREATE UNIQUE INDEX "uq_neighborhoods_match_key_municipality"
  ON "neighborhoods"("match_key", "municipality");

DROP TABLE "sections";
DROP TABLE "electoral_districts";
DROP TABLE "electoral_states";

DROP TYPE "goal_scope";
DROP TYPE "goal_cadence";
DROP TYPE "ine_asset_side";
DROP TYPE "ine_upload_status";
DROP TYPE "ine_ocr_job_status";
DROP TYPE "leader_role";
