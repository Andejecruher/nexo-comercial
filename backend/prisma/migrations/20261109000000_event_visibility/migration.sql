CREATE TYPE "event_visibility" AS ENUM ('public', 'internal');

ALTER TABLE "events"
  ADD COLUMN "visibility" "event_visibility" NOT NULL DEFAULT 'public';

CREATE TABLE "event_internal_details" (
  "event_id" UUID PRIMARY KEY,
  "owner_user_id" UUID,
  "operational_notes" TEXT,
  "budget_estimated" DECIMAL(12, 2),
  "checklist" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_internal_details_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE,
  CONSTRAINT "event_internal_details_owner_user_id_fkey"
    FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE INDEX "idx_events_visibility_status_starts_at"
  ON "events" ("visibility", "status", "starts_at");

CREATE INDEX "idx_events_visibility_starts_at"
  ON "events" ("visibility", "starts_at");

CREATE OR REPLACE FUNCTION enforce_internal_event_details_visibility()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "events"
    WHERE "id" = NEW."event_id"
      AND "visibility" = 'internal'
  ) THEN
    RAISE EXCEPTION 'event_internal_details requires an internal event'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "trg_event_internal_details_visibility"
  BEFORE INSERT OR UPDATE OF "event_id" ON "event_internal_details"
  FOR EACH ROW
  EXECUTE FUNCTION enforce_internal_event_details_visibility();
