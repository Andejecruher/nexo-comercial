ALTER TABLE "export_jobs" ADD COLUMN "file_path" TEXT;
ALTER TABLE "campaign_attachments" ALTER COLUMN "file_id" TYPE TEXT;
ALTER TABLE "campaign_attachments" ALTER COLUMN "folder_id" TYPE TEXT;
