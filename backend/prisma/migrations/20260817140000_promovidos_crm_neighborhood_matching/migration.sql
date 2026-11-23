-- Atomically link all new promoted records to CRM citizens and make neighborhood
-- matching section-aware. Legacy territory columns are intentionally retained.

ALTER TABLE "citizens" ALTER COLUMN "phone" DROP NOT NULL;
ALTER TABLE "citizens" ADD COLUMN "voter_key_fingerprint" VARCHAR(32);
ALTER TABLE "citizens" ADD COLUMN "curp_fingerprint" VARCHAR(32);
CREATE UNIQUE INDEX "uq_citizens_voter_key_fingerprint" ON "citizens"("voter_key_fingerprint");
CREATE UNIQUE INDEX "uq_citizens_curp_fingerprint" ON "citizens"("curp_fingerprint");
CREATE INDEX "citizens_voter_key_fingerprint_idx" ON "citizens"("voter_key_fingerprint");
CREATE INDEX "citizens_curp_fingerprint_idx" ON "citizens"("curp_fingerprint");

ALTER TABLE "neighborhoods" ADD COLUMN "section_id" UUID;
ALTER TABLE "neighborhoods" ADD COLUMN "match_key" VARCHAR(255);
ALTER TABLE "neighborhoods" ADD CONSTRAINT "neighborhoods_section_id_fkey"
  FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE EXTENSION IF NOT EXISTS unaccent;
UPDATE "neighborhoods"
SET "match_key" = regexp_replace(
  regexp_replace(
    regexp_replace(lower(unaccent("name")), '^[[:space:]]*(barrio|barr|colonia|col|fraccionamiento|fracc|fr|ejido|ej)[.[:space:]]+', ''),
    '[^[:alnum:]]+', ' ', 'g'
  ),
  '[[:space:]]+', ' ', 'g'
);
UPDATE "neighborhoods" SET "match_key" = trim("match_key");
ALTER TABLE "neighborhoods" ALTER COLUMN "match_key" SET NOT NULL;

DROP INDEX IF EXISTS "neighborhoods_name_key";
DROP INDEX IF EXISTS "neighborhoods_name_lower_idx";
ALTER TABLE "neighborhoods" DROP COLUMN "name_lower";
CREATE UNIQUE INDEX "uq_neighborhoods_section_match_key"
  ON "neighborhoods"("section_id", "match_key");
CREATE INDEX "neighborhoods_section_id_idx" ON "neighborhoods"("section_id");

CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- Prisma deploy executes this migration in a transaction, so CREATE INDEX
-- CONCURRENTLY is invalid here. Schedule this non-concurrent index build in a
-- maintenance window for large production catalogs.
CREATE INDEX "neighborhoods_match_key_trgm_idx"
  ON "neighborhoods" USING GIN ("match_key" gin_trgm_ops);
