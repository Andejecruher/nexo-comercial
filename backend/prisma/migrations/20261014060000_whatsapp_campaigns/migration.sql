-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('queued', 'running', 'completed', 'needs_review');

-- CreateEnum
CREATE TYPE "CampaignMessageStatus" AS ENUM ('pending', 'sent', 'delivered', 'read', 'failed');

-- CreateEnum
CREATE TYPE "CampaignDispatchState" AS ENUM ('queued', 'sending', 'accepted', 'finished', 'uncertain');

-- CreateTable
CREATE TABLE "campaigns" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "purpose" VARCHAR(1000) NOT NULL,
    "line_id" UUID NOT NULL,
    "phone_number_id" VARCHAR(100) NOT NULL,
    "template_id" VARCHAR(100) NOT NULL,
    "template_snapshot" JSONB NOT NULL,
    "mappings" JSONB NOT NULL,
    "source" VARCHAR(20) NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'queued',
    "total" INTEGER NOT NULL,
    "created_by" UUID NOT NULL,
    "idempotency_key" UUID NOT NULL,
    "request_hash" VARCHAR(64) NOT NULL,
    "consent_confirmed_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_recipients" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "citizen_id" UUID,
    "phone" VARCHAR(16) NOT NULL,
    "variables" JSONB NOT NULL,
    "message_id" VARCHAR(512),
    "status" "CampaignMessageStatus" NOT NULL DEFAULT 'pending',
    "dispatch_state" "CampaignDispatchState" NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMPTZ(6),
    "error_code" VARCHAR(80),
    "accepted_at" TIMESTAMPTZ(6),
    "sent_at" TIMESTAMPTZ(6),
    "delivered_at" TIMESTAMPTZ(6),
    "read_at" TIMESTAMPTZ(6),
    "failed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "campaign_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campaigns_created_at_id_idx" ON "campaigns"("created_at", "id");

-- CreateIndex
CREATE INDEX "campaigns_status_created_at_idx" ON "campaigns"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_created_by_idempotency_key_key" ON "campaigns"("created_by", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_recipients_message_id_key" ON "campaign_recipients"("message_id");

-- CreateIndex
CREATE INDEX "campaign_recipients_campaign_id_status_idx" ON "campaign_recipients"("campaign_id", "status");

-- CreateIndex
CREATE INDEX "campaign_recipients_campaign_id_dispatch_state_next_attempt_idx" ON "campaign_recipients"("campaign_id", "dispatch_state", "next_attempt_at");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_recipients_campaign_id_phone_key" ON "campaign_recipients"("campaign_id", "phone");

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "communication_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_citizen_id_fkey" FOREIGN KEY ("citizen_id") REFERENCES "citizens"("id") ON DELETE SET NULL ON UPDATE CASCADE;
