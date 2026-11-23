-- Retain the configured Shared Drive and folder identities with each stored INE asset.

ALTER TABLE "stored_files"
  ADD COLUMN "storage_drive_id" VARCHAR(255) NOT NULL,
  ADD COLUMN "storage_folder_id" VARCHAR(255) NOT NULL;
