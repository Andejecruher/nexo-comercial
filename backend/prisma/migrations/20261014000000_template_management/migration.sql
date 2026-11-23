CREATE TABLE "template_status_events" (
 "id" BIGSERIAL PRIMARY KEY, "dedupe_key" VARCHAR(64) NOT NULL UNIQUE,
 "waba_id" VARCHAR(100) NOT NULL, "template_id" VARCHAR(100) NOT NULL,
 "template_name" VARCHAR(512) NOT NULL, "status" VARCHAR(100) NOT NULL, "reason" TEXT,
 "occurred_at" TIMESTAMPTZ(6) NOT NULL, "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "template_status_events_waba_id_id_idx" ON "template_status_events" ("waba_id", "id");
CREATE TABLE "managed_templates" (
 "template_id" VARCHAR(100) PRIMARY KEY, "waba_id" VARCHAR(100) NOT NULL,
 "created_at" TIMESTAMPTZ(6), "updated_at" TIMESTAMPTZ(6)
);
CREATE INDEX "managed_templates_waba_id_idx" ON "managed_templates" ("waba_id");
