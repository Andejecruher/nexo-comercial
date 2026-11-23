-- Personal Google Drive files are located by provider, object ID, and folder ID.
-- Existing Shared Drive rows retain their historical location metadata but are not read by this provider.

ALTER TABLE "stored_files"
  ALTER COLUMN "storage_path" DROP NOT NULL,
  ALTER COLUMN "storage_drive_id" DROP NOT NULL;
