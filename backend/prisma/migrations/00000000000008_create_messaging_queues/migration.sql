-- Baseline migration: create messaging queue, audit, and assignment tables.

CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" VARCHAR(100) NOT NULL,
    "target_type" VARCHAR(50) NOT NULL,
    "target_id" VARCHAR(255),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "ip" VARCHAR(45),
    "user_agent" VARCHAR(512),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "message_statuses" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "wamid" VARCHAR(255) NOT NULL,
    "status" "message_status_value" NOT NULL,
    "error_code" INTEGER,
    "error_title" VARCHAR(255),
    "timestamp" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_statuses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inbox_events" (
    "id" UUID NOT NULL,
    "wamid" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(30) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "inbox_event_status" NOT NULL DEFAULT 'pending',
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "last_error_at" TIMESTAMPTZ(6),
    "last_error" TEXT,
    "idempotency_key" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(6),

    CONSTRAINT "inbox_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "conversation_id" UUID,
    "phone" VARCHAR(30) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "outbox_event_status" NOT NULL DEFAULT 'pending',
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "next_retry_at" TIMESTAMPTZ(6),
    "last_error" TEXT,
    "wamid" VARCHAR(255),
    "idempotency_key" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(6),

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "webhook_event_logs" (
    "id" UUID NOT NULL,
    "correlation_id" VARCHAR(255) NOT NULL,
    "raw_payload" JSONB NOT NULL,
    "signature" VARCHAR(255),
    "processed_ok" BOOLEAN NOT NULL DEFAULT false,
    "error_message" TEXT,
    "ip_address" VARCHAR(45),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_event_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "assignments" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "department_slug" VARCHAR(100),
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "released_at" TIMESTAMPTZ(6),
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");
CREATE INDEX "audit_logs_target_type_target_id_idx" ON "audit_logs"("target_type", "target_id");
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");
CREATE INDEX "message_statuses_wamid_idx" ON "message_statuses"("wamid");
CREATE INDEX "message_statuses_message_id_idx" ON "message_statuses"("message_id");
CREATE UNIQUE INDEX "inbox_events_wamid_key" ON "inbox_events"("wamid");
CREATE INDEX "inbox_events_phone_idx" ON "inbox_events"("phone");
CREATE INDEX "inbox_events_status_idx" ON "inbox_events"("status");
CREATE INDEX "inbox_events_created_at_idx" ON "inbox_events"("created_at");
CREATE UNIQUE INDEX "outbox_events_idempotency_key_key" ON "outbox_events"("idempotency_key");
CREATE INDEX "outbox_events_phone_idx" ON "outbox_events"("phone");
CREATE INDEX "outbox_events_status_next_retry_at_idx" ON "outbox_events"("status", "next_retry_at");
CREATE INDEX "outbox_events_conversation_id_idx" ON "outbox_events"("conversation_id");
CREATE INDEX "webhook_event_logs_correlation_id_idx" ON "webhook_event_logs"("correlation_id");
CREATE INDEX "webhook_event_logs_created_at_idx" ON "webhook_event_logs"("created_at");
CREATE INDEX "assignments_conversation_id_idx" ON "assignments"("conversation_id");
CREATE INDEX "assignments_user_id_idx" ON "assignments"("user_id");
CREATE INDEX "assignments_is_active_idx" ON "assignments"("is_active");

ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "message_statuses" ADD CONSTRAINT "message_statuses_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
