-- Baseline migration: create departments reference table for conversation routing.

CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "service_hours" VARCHAR(255),
    "service_schedule" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "departments_slug_key" ON "departments"("slug");
CREATE INDEX "departments_slug_idx" ON "departments"("slug");
CREATE INDEX "departments_is_active_idx" ON "departments"("is_active");
