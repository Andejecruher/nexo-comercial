-- Baseline migration: create realtime outbox events table.

CREATE TABLE "realtime_outbox_events" (
    "id" UUID NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "socket_event_name" VARCHAR(100) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "realtime_outbox_status" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_retry_at" TIMESTAMPTZ(6),
    "locked_at" TIMESTAMPTZ(6),
    "locked_by" VARCHAR(255),
    "published_at" TIMESTAMPTZ(6),
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "realtime_outbox_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "realtime_outbox_events_status_next_retry_at_idx" ON "realtime_outbox_events"("status", "next_retry_at");
CREATE INDEX "realtime_outbox_events_event_type_idx" ON "realtime_outbox_events"("event_type");
CREATE INDEX "realtime_outbox_events_created_at_idx" ON "realtime_outbox_events"("created_at");
