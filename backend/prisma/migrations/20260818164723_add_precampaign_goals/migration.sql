-- Additive migration: precampaign goals for the Promovidos tactical dashboard.
-- Creates the goal_type enum and the precampaign_goals table with a composite
-- index on (type, is_active) to support the active-goal lookups used by the
-- analytics service. No existing tables are altered.

-- CreateEnum
CREATE TYPE "goal_type" AS ENUM ('GLOBAL', 'MONTHLY', 'WEEKLY');

-- CreateTable
CREATE TABLE "precampaign_goals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" VARCHAR(100) NOT NULL,
    "target" INTEGER NOT NULL,
    "type" "goal_type" NOT NULL DEFAULT 'WEEKLY',
    "start_date" TIMESTAMPTZ(6) NOT NULL,
    "end_date" TIMESTAMPTZ(6) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "precampaign_goals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "precampaign_goals_type_is_active_idx" ON "precampaign_goals"("type", "is_active");
