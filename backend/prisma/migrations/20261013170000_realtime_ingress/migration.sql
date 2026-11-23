ALTER TABLE inbox_events ADD COLUMN ingested_at TIMESTAMPTZ(6), ADD COLUMN message_id UUID, ADD COLUMN correlation_id VARCHAR(255);
CREATE INDEX inbox_events_message_id_idx ON inbox_events(message_id);
ALTER TABLE conversations ADD COLUMN realtime_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notifications ADD COLUMN ticket_id UUID;
CREATE INDEX notifications_created_at_id_idx ON notifications(created_at, id);
ALTER TABLE inbox_events ADD COLUMN batch_generation INTEGER;
CREATE INDEX inbox_events_phone_batch_generation_status_idx ON inbox_events(phone, batch_generation, status);
