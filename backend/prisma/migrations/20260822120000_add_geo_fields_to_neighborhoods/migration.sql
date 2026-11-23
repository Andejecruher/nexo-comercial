-- Migration: add_geo_fields_to_neighborhoods
-- Description: Add geo-spatial and administrative fields to neighborhoods; drop legacy description.

-- 1. Add new columns
ALTER TABLE "neighborhoods"
  ADD COLUMN "postal_code" VARCHAR(10),
  ADD COLUMN "municipality" VARCHAR(100),
  ADD COLUMN "state" VARCHAR(100) NOT NULL DEFAULT 'Chiapas',
  ADD COLUMN "state_code" VARCHAR(5) NOT NULL DEFAULT 'CHP';

-- 2. Backfill any existing rows with fixed Chiapas values (defensive; state/state_code already defaulted)
UPDATE "neighborhoods"
  SET "state" = 'Chiapas', "state_code" = 'CHP'
  WHERE "state" IS NULL OR "state_code" IS NULL;

-- 3. Drop legacy description column
ALTER TABLE "neighborhoods" DROP COLUMN "description";

-- 4. Indexes for the new filterable fields
CREATE INDEX "neighborhoods_postal_code_idx" ON "neighborhoods"("postal_code");
CREATE INDEX "neighborhoods_municipality_idx" ON "neighborhoods"("municipality");
CREATE INDEX "neighborhoods_state_idx" ON "neighborhoods"("state");
