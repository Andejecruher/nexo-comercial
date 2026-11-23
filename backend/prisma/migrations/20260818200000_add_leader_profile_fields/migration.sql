-- Additive migration: operational profile for electoral leaders.
-- Adds contact (phone, email), territory (neighborhood_id), and assignment
-- (promovido_quota, role) columns to `leaders`. Existing rows keep their data:
-- every new column is nullable except `role`, which defaults to the most common
-- assignment so the backfill is implicit.

-- CreateEnum
CREATE TYPE "leader_role" AS ENUM ('COORDINADOR_SECCIONAL', 'PROMOTOR_BARRIO', 'ENLACE_TERRITORIAL');

-- AlterTable
ALTER TABLE "leaders"
    ADD COLUMN "neighborhood_id" UUID,
    ADD COLUMN "phone" VARCHAR(30),
    ADD COLUMN "email" VARCHAR(255),
    ADD COLUMN "promovido_quota" INTEGER,
    ADD COLUMN "role" "leader_role" NOT NULL DEFAULT 'COORDINADOR_SECCIONAL';

-- CreateIndex
CREATE INDEX "leaders_neighborhood_id_idx" ON "leaders"("neighborhood_id");

-- AddForeignKey
ALTER TABLE "leaders"
    ADD CONSTRAINT "leaders_neighborhood_id_fkey"
    FOREIGN KEY ("neighborhood_id") REFERENCES "neighborhoods"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
