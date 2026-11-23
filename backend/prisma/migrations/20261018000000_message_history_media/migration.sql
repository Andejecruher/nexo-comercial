ALTER TYPE "message_type" ADD VALUE IF NOT EXISTS 'sticker';
CREATE INDEX IF NOT EXISTS "messages_conversation_id_created_at_id_idx" ON "messages"("conversation_id", "created_at", "id");
CREATE INDEX IF NOT EXISTS "messages_conversation_id_direction_created_at_idx" ON "messages"("conversation_id", "direction", "created_at");
CREATE INDEX IF NOT EXISTS "messages_ticket_id_created_at_id_idx" ON "messages"("ticket_id", "created_at", "id");
