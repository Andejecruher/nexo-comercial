-- Additive: historical attachments remain legacy; no historical messages are rewritten.
ALTER TYPE "message_type" ADD VALUE IF NOT EXISTS 'sticker';
ALTER TYPE "message_type" ADD VALUE IF NOT EXISTS 'contacts';
ALTER TYPE "message_type" ADD VALUE IF NOT EXISTS 'unsupported';
ALTER TABLE "attachments"
 ADD COLUMN "communication_line_id" UUID, ADD COLUMN "checksum_md5" VARCHAR(32),
 ADD COLUMN "provider_media_id" VARCHAR(255),
 ADD COLUMN "provider_phone_number_id" VARCHAR(100),
 ADD COLUMN "processing_state" VARCHAR(24) NOT NULL DEFAULT 'legacy',
 ADD COLUMN "drive_file_id" VARCHAR(255), ADD COLUMN "drive_folder_id" VARCHAR(255),
 ADD COLUMN "checksum_sha256" VARCHAR(64), ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 ADD COLUMN "locked_at" TIMESTAMPTZ(6), ADD COLUMN "last_error_code" VARCHAR(80),
 ADD COLUMN "stored_at" TIMESTAMPTZ(6);
CREATE UNIQUE INDEX "attachments_message_id_provider_media_id_key" ON "attachments" ("message_id", "provider_media_id");
CREATE INDEX "attachments_processing_state_next_attempt_at_idx" ON "attachments" ("processing_state", "next_attempt_at");

CREATE INDEX "webhook_event_logs_processed_ok_created_at_idx" ON "webhook_event_logs" ("processed_ok", "created_at");

ALTER TABLE "notifications" ADD COLUMN "communication_line_id" UUID;
