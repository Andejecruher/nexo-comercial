-- Additive migration: composite indexes for Postgres-backed inbox queue and FSM.
--
--  1. inbox_events (status, created_at): poller claim query
--     WHERE status IN (...) ORDER BY created_at. Replaces the single-column
--     status index (leftmost prefix still covers status-only filters).
--  2. conversation_meta (conversation_id, flow_state): FSM orchestrator
--     lookups by conversation + flow state.
--
-- RateLimitCounter upserts remain covered by PK (scope, bucket_key, window_start).
-- OutboxEvent already has (status, next_retry_at).
-- Deploy via the migrator service (`make migrate-dev` / prisma migrate deploy).

DROP INDEX "inbox_events_status_idx";

CREATE INDEX "inbox_events_status_created_at_idx" ON "inbox_events"("status", "created_at");

CREATE INDEX "conversation_meta_conversation_id_flow_state_idx" ON "conversation_meta"("conversation_id", "flow_state");
