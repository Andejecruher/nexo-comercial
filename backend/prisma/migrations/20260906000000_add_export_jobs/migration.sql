-- Generated from the Prisma datamodel after `prisma migrate dev` could not run
-- because the workspace pnpm invocation is incompatible with this pnpm version.
CREATE TYPE "export_module" AS ENUM ('promoted', 'leaders', 'coordinators', 'citizens');
CREATE TYPE "export_job_status" AS ENUM ('queued', 'processing', 'ready', 'failed', 'expired');

CREATE TABLE "export_jobs" (
    "id" UUID NOT NULL,
    "module" "export_module" NOT NULL,
    "filters_json" JSONB NOT NULL DEFAULT '{}',
    "scope_snapshot" JSONB NOT NULL,
    "status" "export_job_status" NOT NULL DEFAULT 'queued',
    "drive_file_id" VARCHAR(255),
    "drive_folder_id" VARCHAR(255),
    "drive_filename" VARCHAR(255),
    "row_count" INTEGER,
    "error_code" VARCHAR(80),
    "last_error" TEXT,
    "requested_by_user_id" UUID NOT NULL,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "export_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "export_jobs_requested_by_user_id_created_at_idx" ON "export_jobs"("requested_by_user_id", "created_at");
CREATE INDEX "export_jobs_status_expires_at_idx" ON "export_jobs"("status", "expires_at");
CREATE INDEX "export_jobs_status_completed_at_idx" ON "export_jobs"("status", "completed_at");
