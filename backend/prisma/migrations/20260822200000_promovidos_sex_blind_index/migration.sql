-- Migration: promovidos_sex_blind_index
-- Description: Add an HMAC blind index of the encrypted `sex` field so promovidos can be filtered in SQL.

-- 1. New nullable column (existing rows stay NULL until the backfill script runs)
ALTER TABLE "promovidos"
  ADD COLUMN "sex_blind_index" VARCHAR(64);

-- 2. Index for equality lookups on the blind index
CREATE INDEX "promovidos_sex_blind_index_idx" ON "promovidos"("sex_blind_index");
