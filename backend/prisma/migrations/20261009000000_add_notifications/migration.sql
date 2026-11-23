-- Notification center projection from durable realtime events.
-- Written by the API-side RealtimeApiSubscriber; idempotent by event_id
-- (Pub/Sub redeliveries must not duplicate rows).

CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "type" VARCHAR(100) NOT NULL,
    "conversation_id" UUID,
    "contact_name" TEXT,
    "phone" TEXT,
    "message_preview" TEXT,
    "flow_state" TEXT,
    "channel" TEXT,
    "priority" TEXT,
    "department_slug" TEXT,
    "assigned_user_id" UUID,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notifications_event_id_key" ON "notifications"("event_id");
CREATE INDEX "notifications_occurred_at_idx" ON "notifications"("occurred_at");
