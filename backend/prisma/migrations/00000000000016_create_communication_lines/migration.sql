-- Baseline migration: create communication lines table.

CREATE TABLE "communication_lines" (
    "id" UUID NOT NULL,
    "channel" "conversation_channel" NOT NULL DEFAULT 'whatsapp',
    "external_identifier" VARCHAR(255) NOT NULL,
    "phone_number" VARCHAR(30),
    "provider" VARCHAR(100),
    "display_name" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "ai_enabled" BOOLEAN NOT NULL DEFAULT false,
    "agent_id" UUID,
    "ai_agent_id" UUID,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "whatsapp_app_secret" VARCHAR(255),
    "whatsapp_access_token" TEXT,
    "whatsapp_business_account_id" VARCHAR(100),
    "whatsapp_app_id" VARCHAR(100),
    "whatsapp_phone_number_id" VARCHAR(100),

    CONSTRAINT "communication_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "communication_lines_phone_number_idx" ON "communication_lines"("phone_number");
CREATE INDEX "communication_lines_agent_id_idx" ON "communication_lines"("agent_id");
CREATE INDEX "communication_lines_ai_agent_id_idx" ON "communication_lines"("ai_agent_id");
CREATE INDEX "communication_lines_is_active_ai_enabled_idx" ON "communication_lines"("is_active", "ai_enabled");
CREATE UNIQUE INDEX "uq_communication_lines_channel_external" ON "communication_lines"("channel", "external_identifier");

ALTER TABLE "communication_lines" ADD CONSTRAINT "communication_lines_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "ai_agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "communication_lines" ADD CONSTRAINT "communication_lines_ai_agent_id_fkey" FOREIGN KEY ("ai_agent_id") REFERENCES "ai_agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
