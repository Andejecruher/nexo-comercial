-- Baseline migration: create conversations table.

CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "citizen_id" UUID NOT NULL,
    "status" "conversation_status" NOT NULL DEFAULT 'open',
    "channel" "conversation_channel" NOT NULL DEFAULT 'whatsapp',
    "assigned_dept" VARCHAR(100),
    "assigned_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "conversations_assigned_user_id_idx" ON "conversations"("assigned_user_id");
CREATE INDEX "conversations_citizen_id_status_idx" ON "conversations"("citizen_id", "status");

ALTER TABLE "conversations" ADD CONSTRAINT "conversations_citizen_id_fkey" FOREIGN KEY ("citizen_id") REFERENCES "citizens"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
