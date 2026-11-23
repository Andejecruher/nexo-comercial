-- Baseline migration: create neighborhoods reference table.

CREATE TABLE "neighborhoods" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "name_lower" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "zone" VARCHAR(100),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "neighborhoods_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "neighborhoods_name_key" ON "neighborhoods"("name");
CREATE INDEX "neighborhoods_name_idx" ON "neighborhoods"("name");
CREATE INDEX "neighborhoods_name_lower_idx" ON "neighborhoods"("name_lower");
CREATE INDEX "neighborhoods_zone_idx" ON "neighborhoods"("zone");
