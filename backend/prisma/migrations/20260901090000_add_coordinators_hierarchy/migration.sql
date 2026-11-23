-- Migration: add_coordinators_hierarchy
-- Description: Additive schema changes for the coordinators hierarchy.
--   - Creates the `coordinators` table with its Section/User relations.
--   - Adds nullable `coordinator_id` and `user_id` links to `leaders`.
--   - Enforces the same-section rule through a composite FK on
--     (coordinator_id, section_id) -> coordinators(id, section_id).
--   - Adds temporary backfill support tables used by the idempotent TS
--     backfill and cleanup scripts.
-- Does NOT modify the `leader_role` enum; that change belongs to the gated
-- close-out migration.

-- 1. Create coordinators table
CREATE TABLE "coordinators" (
  "id" UUID NOT NULL,
  "section_id" UUID NOT NULL,
  "full_name" VARCHAR(255) NOT NULL,
  "phone" VARCHAR(30),
  "email" VARCHAR(255) NOT NULL,
  "user_id" UUID,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "coordinators_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_coordinators_id_section" ON "coordinators"("id", "section_id");
CREATE UNIQUE INDEX "coordinators_user_id_key" ON "coordinators"("user_id");
CREATE INDEX "coordinators_section_id_is_active_idx" ON "coordinators"("section_id", "is_active");

ALTER TABLE "coordinators"
  ADD CONSTRAINT "coordinators_section_id_fkey"
    FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "coordinators_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 2. Add nullable coordinator/user links to leaders
ALTER TABLE "leaders"
  ADD COLUMN "coordinator_id" UUID,
  ADD COLUMN "user_id" UUID;

CREATE UNIQUE INDEX "leaders_user_id_key" ON "leaders"("user_id");
CREATE INDEX "leaders_coordinator_id_is_active_idx" ON "leaders"("coordinator_id", "is_active");

ALTER TABLE "leaders"
  ADD CONSTRAINT "leaders_coordinator_id_section_id_fkey"
    FOREIGN KEY ("coordinator_id", "section_id") REFERENCES "coordinators"("id", "section_id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "leaders_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. Backfill support tables (temporary; dropped by close-out migration)
CREATE TABLE "coordinator_backfill_map" (
  "id" UUID NOT NULL,
  "leader_id" UUID NOT NULL,
  "section_id" UUID NOT NULL,
  "coordinator_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "coordinator_backfill_map_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "coordinator_backfill_map_leader_id_key" UNIQUE ("leader_id")
);

CREATE INDEX "coordinator_backfill_map_section_id_idx" ON "coordinator_backfill_map"("section_id");

ALTER TABLE "coordinator_backfill_map"
  ADD CONSTRAINT "coordinator_backfill_map_leader_id_fkey"
    FOREIGN KEY ("leader_id") REFERENCES "leaders"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "coordinator_backfill_map_coordinator_id_fkey"
    FOREIGN KEY ("coordinator_id") REFERENCES "coordinators"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "coordinator_backfill_issues" (
  "id" UUID NOT NULL,
  "leader_id" UUID,
  "section_id" UUID,
  "kind" VARCHAR(50) NOT NULL,
  "reason" VARCHAR(255) NOT NULL,
  "payload" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "coordinator_backfill_issues_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "coordinator_backfill_issues_section_id_idx" ON "coordinator_backfill_issues"("section_id");
CREATE INDEX "coordinator_backfill_issues_kind_idx" ON "coordinator_backfill_issues"("kind");
