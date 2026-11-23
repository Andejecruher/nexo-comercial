ALTER TABLE "inbox_events"
ADD COLUMN "locked_at" TIMESTAMPTZ(6),
ADD COLUMN "locked_by" VARCHAR(255);

ALTER TABLE "outbox_events"
ADD COLUMN "locked_at" TIMESTAMPTZ(6),
ADD COLUMN "locked_by" VARCHAR(255);
