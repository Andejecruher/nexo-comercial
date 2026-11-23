-- Baseline migration: add raw SQL constraints and indexes that are intentionally
-- managed outside the Prisma schema.
--
-- These invariants enforce business rules that cannot be expressed directly in
-- the Prisma datamodel (functional unique indexes, partial unique indexes).

-- Case-insensitive uniqueness on tags.name.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_tags_name_lower"
  ON "tags" (lower("name"));

-- At most one active (open or in_progress) conversation per citizen/channel.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_conversations_active_per_citizen_channel"
  ON "conversations" ("citizen_id", "channel")
  WHERE "status" IN ('open', 'in_progress');

-- At most one active (OPEN or IN_PROGRESS) ticket per conversation.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_tickets_one_active_per_conversation"
  ON "tickets" ("conversation_id")
  WHERE "status" IN ('OPEN', 'IN_PROGRESS');
