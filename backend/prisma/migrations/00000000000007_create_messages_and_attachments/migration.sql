-- Baseline migration: create messages and attachments tables.
-- These tables have a mutual optional foreign-key relationship, so both tables
-- are created first and the foreign keys are added afterwards.

CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "direction" "message_direction" NOT NULL,
    "message_type" "message_type" NOT NULL DEFAULT 'text',
    "external_message_id" VARCHAR(255),
    "attachment_id" UUID,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "attachments" (
    "id" UUID NOT NULL,
    "storage_key" VARCHAR(1024) NOT NULL,
    "mime_type" VARCHAR(127) NOT NULL,
    "file_size_bytes" BIGINT NOT NULL,
    "original_filename" VARCHAR(512),
    "cdn_url" TEXT,
    "message_id" UUID,
    "citizen_id" UUID,
    "uploaded_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "messages_external_message_id_idx" ON "messages"("external_message_id");
CREATE INDEX "attachments_message_id_idx" ON "attachments"("message_id");
CREATE INDEX "attachments_citizen_id_idx" ON "attachments"("citizen_id");

ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_citizen_id_fkey" FOREIGN KEY ("citizen_id") REFERENCES "citizens"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
