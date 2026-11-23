-- Additive Phase 1 INE OCR and promovidos domain. No messaging or attachment tables are reused.

CREATE TYPE "ine_asset_side" AS ENUM ('front', 'back');
CREATE TYPE "ine_upload_status" AS ENUM ('uploading', 'queued', 'processing', 'review_ready', 'failed', 'confirmed');
CREATE TYPE "ine_ocr_job_status" AS ENUM ('queued', 'processing', 'retryable', 'completed', 'failed');

CREATE TABLE "electoral_states" (
  "id" UUID NOT NULL, "code" VARCHAR(10) NOT NULL, "name" VARCHAR(120) NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true, "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL, CONSTRAINT "electoral_states_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "electoral_states_code_key" ON "electoral_states"("code");
CREATE INDEX "electoral_states_is_active_name_idx" ON "electoral_states"("is_active", "name");

CREATE TABLE "electoral_districts" (
  "id" UUID NOT NULL, "state_id" UUID NOT NULL, "code" VARCHAR(20) NOT NULL, "name" VARCHAR(120),
  "is_active" BOOLEAN NOT NULL DEFAULT true, "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL, CONSTRAINT "electoral_districts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "uq_electoral_districts_state_code" ON "electoral_districts"("state_id", "code");
CREATE INDEX "electoral_districts_is_active_idx" ON "electoral_districts"("is_active");
ALTER TABLE "electoral_districts" ADD CONSTRAINT "electoral_districts_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "electoral_states"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "sections" (
  "id" UUID NOT NULL, "state_id" UUID NOT NULL, "district_id" UUID NOT NULL, "section_code" VARCHAR(20) NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true, "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL, CONSTRAINT "sections_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "uq_sections_state_district_code" ON "sections"("state_id", "district_id", "section_code");
CREATE INDEX "sections_section_code_is_active_idx" ON "sections"("section_code", "is_active");
ALTER TABLE "sections" ADD CONSTRAINT "sections_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "electoral_states"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sections" ADD CONSTRAINT "sections_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "electoral_districts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "leaders" (
  "id" UUID NOT NULL, "section_id" UUID NOT NULL, "full_name" VARCHAR(255) NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true, "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL, CONSTRAINT "leaders_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "leaders_section_id_is_active_idx" ON "leaders"("section_id", "is_active");
ALTER TABLE "leaders" ADD CONSTRAINT "leaders_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "upload_records" (
  "id" UUID NOT NULL, "status" "ine_upload_status" NOT NULL DEFAULT 'uploading', "created_by_user_id" UUID NOT NULL,
  "section_id" UUID, "leader_id" UUID, "manual_phone_encrypted" TEXT, "reviewed_data_encrypted" TEXT,
  "reviewed_at" TIMESTAMPTZ(6), "reviewed_by_user_id" UUID, "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL, CONSTRAINT "upload_records_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "upload_records_status_created_at_idx" ON "upload_records"("status", "created_at");
CREATE INDEX "upload_records_created_by_user_id_idx" ON "upload_records"("created_by_user_id");
CREATE INDEX "upload_records_section_id_idx" ON "upload_records"("section_id");
ALTER TABLE "upload_records" ADD CONSTRAINT "upload_records_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "upload_records" ADD CONSTRAINT "upload_records_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "upload_records" ADD CONSTRAINT "upload_records_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "upload_records" ADD CONSTRAINT "upload_records_leader_id_fkey" FOREIGN KEY ("leader_id") REFERENCES "leaders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "stored_files" (
  "id" UUID NOT NULL, "upload_record_id" UUID NOT NULL, "side" "ine_asset_side" NOT NULL, "storage_provider" VARCHAR(50) NOT NULL,
  "storage_object_id" VARCHAR(255) NOT NULL, "storage_path" VARCHAR(1024) NOT NULL, "mime_type" VARCHAR(127) NOT NULL,
  "file_size_bytes" BIGINT NOT NULL, "original_filename" VARCHAR(512), "checksum_sha256" VARCHAR(64) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "stored_files_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "uq_stored_files_upload_side" ON "stored_files"("upload_record_id", "side");
CREATE UNIQUE INDEX "uq_stored_files_provider_object" ON "stored_files"("storage_provider", "storage_object_id");
CREATE INDEX "stored_files_upload_record_id_idx" ON "stored_files"("upload_record_id");
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_upload_record_id_fkey" FOREIGN KEY ("upload_record_id") REFERENCES "upload_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ine_ocr_jobs" (
  "id" UUID NOT NULL, "stored_file_id" UUID NOT NULL, "status" "ine_ocr_job_status" NOT NULL DEFAULT 'queued',
  "attempt" INTEGER NOT NULL DEFAULT 0, "max_attempts" INTEGER NOT NULL DEFAULT 3, "next_attempt_at" TIMESTAMPTZ(6),
  "locked_at" TIMESTAMPTZ(6), "locked_by" VARCHAR(255), "last_error_code" VARCHAR(80), "last_error" VARCHAR(255),
  "completed_at" TIMESTAMPTZ(6), "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL, CONSTRAINT "ine_ocr_jobs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ine_ocr_jobs_status_next_attempt_at_idx" ON "ine_ocr_jobs"("status", "next_attempt_at");
CREATE INDEX "ine_ocr_jobs_stored_file_id_idx" ON "ine_ocr_jobs"("stored_file_id");
ALTER TABLE "ine_ocr_jobs" ADD CONSTRAINT "ine_ocr_jobs_stored_file_id_fkey" FOREIGN KEY ("stored_file_id") REFERENCES "stored_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ocr_extractions" (
  "id" UUID NOT NULL, "stored_file_id" UUID NOT NULL, "attempt" INTEGER NOT NULL, "provider" VARCHAR(50) NOT NULL,
  "processor_version" VARCHAR(255), "raw_result_encrypted" TEXT NOT NULL, "normalized_result_encrypted" TEXT NOT NULL,
  "source" JSONB NOT NULL DEFAULT '{}', "validation_summary" JSONB NOT NULL, "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ocr_extractions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "uq_ocr_extractions_file_attempt" ON "ocr_extractions"("stored_file_id", "attempt");
CREATE INDEX "ocr_extractions_stored_file_id_created_at_idx" ON "ocr_extractions"("stored_file_id", "created_at");
ALTER TABLE "ocr_extractions" ADD CONSTRAINT "ocr_extractions_stored_file_id_fkey" FOREIGN KEY ("stored_file_id") REFERENCES "stored_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "promovidos" (
  "id" UUID NOT NULL, "upload_record_id" UUID NOT NULL, "leader_id" UUID NOT NULL, "section_id" UUID NOT NULL,
  "citizen_id" UUID, "created_by_user_id" UUID NOT NULL, "data_encrypted" TEXT NOT NULL,
  "state_name_snapshot" VARCHAR(120) NOT NULL, "district_code_snapshot" VARCHAR(20) NOT NULL,
  "section_code_snapshot" VARCHAR(20) NOT NULL, "leader_name_snapshot" VARCHAR(255) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "promovidos_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "promovidos_upload_record_id_key" ON "promovidos"("upload_record_id");
CREATE UNIQUE INDEX "promovidos_citizen_id_key" ON "promovidos"("citizen_id");
CREATE INDEX "promovidos_leader_id_created_at_idx" ON "promovidos"("leader_id", "created_at");
CREATE INDEX "promovidos_section_id_created_at_idx" ON "promovidos"("section_id", "created_at");
ALTER TABLE "promovidos" ADD CONSTRAINT "promovidos_upload_record_id_fkey" FOREIGN KEY ("upload_record_id") REFERENCES "upload_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "promovidos" ADD CONSTRAINT "promovidos_leader_id_fkey" FOREIGN KEY ("leader_id") REFERENCES "leaders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "promovidos" ADD CONSTRAINT "promovidos_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "promovidos" ADD CONSTRAINT "promovidos_citizen_id_fkey" FOREIGN KEY ("citizen_id") REFERENCES "citizens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "promovidos" ADD CONSTRAINT "promovidos_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
