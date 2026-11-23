-- Split goal scope from cadence and bind scoped goals to electoral entities.
-- Existing rows remain global; legacy GLOBAL cadence becomes CAMPAIGN.

-- CreateEnum
CREATE TYPE "goal_scope" AS ENUM ('GLOBAL', 'SECTION', 'LEADER');
CREATE TYPE "goal_cadence" AS ENUM ('CAMPAIGN', 'MONTHLY', 'WEEKLY');

-- AlterTable
ALTER TABLE "precampaign_goals"
    ADD COLUMN "scope" "goal_scope" NOT NULL DEFAULT 'GLOBAL',
    ADD COLUMN "cadence" "goal_cadence",
    ADD COLUMN "section_id" UUID,
    ADD COLUMN "leader_id" UUID;

-- Preserve legacy cadence while all existing goals remain global.
UPDATE "precampaign_goals"
SET "cadence" = CASE "type"::text
    WHEN 'GLOBAL' THEN 'CAMPAIGN'::"goal_cadence"
    WHEN 'MONTHLY' THEN 'MONTHLY'::"goal_cadence"
    WHEN 'WEEKLY' THEN 'WEEKLY'::"goal_cadence"
END;

ALTER TABLE "precampaign_goals"
    ALTER COLUMN "cadence" SET NOT NULL,
    ALTER COLUMN "cadence" SET DEFAULT 'WEEKLY';

-- Replace the legacy overloaded type only after the backfill.
DROP INDEX "precampaign_goals_type_is_active_idx";
ALTER TABLE "precampaign_goals" DROP COLUMN "type";
DROP TYPE "goal_type";

-- Data integrity
ALTER TABLE "precampaign_goals"
    ADD CONSTRAINT "precampaign_goals_target_positive_check" CHECK ("target" > 0),
    ADD CONSTRAINT "precampaign_goals_date_order_check" CHECK ("start_date" < "end_date"),
    ADD CONSTRAINT "precampaign_goals_scope_binding_check" CHECK (
        ("scope" = 'GLOBAL' AND "section_id" IS NULL AND "leader_id" IS NULL) OR
        ("scope" = 'SECTION' AND "section_id" IS NOT NULL AND "leader_id" IS NULL) OR
        ("scope" = 'LEADER' AND "section_id" IS NULL AND "leader_id" IS NOT NULL)
    );

-- AddForeignKey
ALTER TABLE "precampaign_goals"
    ADD CONSTRAINT "precampaign_goals_section_id_fkey"
    FOREIGN KEY ("section_id") REFERENCES "sections"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "precampaign_goals"
    ADD CONSTRAINT "precampaign_goals_leader_id_fkey"
    FOREIGN KEY ("leader_id") REFERENCES "leaders"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "idx_precampaign_goals_scope_cadence_dates"
    ON "precampaign_goals"("scope", "cadence", "is_active", "start_date", "end_date");
CREATE INDEX "idx_precampaign_goals_section_cadence_dates"
    ON "precampaign_goals"("section_id", "cadence", "is_active", "start_date", "end_date");
CREATE INDEX "idx_precampaign_goals_leader_cadence_dates"
    ON "precampaign_goals"("leader_id", "cadence", "is_active", "start_date", "end_date");
