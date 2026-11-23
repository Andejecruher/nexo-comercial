-- Migration: neighborhood_match_key_municipality_unique
-- Description: Include municipality in the compound uniqueness so the same
-- neighborhood name can coexist across different municipalities. Add a trigram
-- index on municipality to support ILIKE narrowing in the matcher.

-- 1. Drop the old compound unique (section_id, match_key)
DROP INDEX IF EXISTS "uq_neighborhoods_section_match_key";

-- 2. Recreate with municipality included.
--    When section_id is NULL the same match_key can now exist for distinct
--    municipalities (e.g. "san marcos" in Cintalapa vs Jiquipilas).
--    PostgreSQL treats NULL as distinct in unique indexes, so rows with
--    section_id = NULL are only duplicates when match_key AND municipality
--    are identical.
CREATE UNIQUE INDEX "uq_neighborhoods_section_match_key"
  ON "neighborhoods"("section_id", "match_key", "municipality");

-- 3. Trigram index on municipality for ILIKE performance in matcher narrowing
CREATE INDEX "neighborhoods_municipality_trgm_idx"
  ON "neighborhoods" USING GIN ("municipality" gin_trgm_ops);
