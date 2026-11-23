-- Additive, backwards-compatible permission lifecycle metadata.
ALTER TABLE "permissions"
  ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "is_system" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "permissions_is_active_idx" ON "permissions"("is_active");
CREATE INDEX "permissions_is_system_idx" ON "permissions"("is_system");

-- Existing seeded permissions may already be referenced by application guards.
UPDATE "permissions" SET "is_system" = true;
