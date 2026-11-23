CREATE TABLE "campaign_attachments" (
  "id" UUID NOT NULL,
  "created_by" UUID NOT NULL,
  "line_id" UUID NOT NULL,
  "template_id" VARCHAR(100) NOT NULL,
  "file_id" VARCHAR(255) NOT NULL,
  "folder_id" VARCHAR(255) NOT NULL,
  "filename" VARCHAR(255) NOT NULL,
  "mime_type" VARCHAR(100) NOT NULL,
  "media_type" VARCHAR(20) NOT NULL,
  "url" TEXT NOT NULL,
  "view_url" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "campaign_id" UUID,
  CONSTRAINT "campaign_attachments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "campaign_attachments_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "campaign_attachments_file_id_key" ON "campaign_attachments"("file_id");
CREATE UNIQUE INDEX "campaign_attachments_campaign_id_key" ON "campaign_attachments"("campaign_id");
CREATE INDEX "campaign_attachments_created_by_created_at_idx" ON "campaign_attachments"("created_by", "created_at");
