-- Preserve all rows/messages and the currently recorded line. This does NOT
-- reconstruct historical messages that were previously mixed between lines.
BEGIN;
ALTER TABLE conversations ADD COLUMN communication_line_id uuid;
UPDATE conversations c SET communication_line_id = cm.communication_line_id
FROM conversation_meta cm WHERE cm.conversation_id = c.id;

DROP INDEX uq_conversations_canonical_per_citizen;
DROP INDEX uq_conversations_active_per_citizen_channel;
-- NULL is the explicit legacy/unbound scope, not a wildcard for all lines.
CREATE UNIQUE INDEX uq_conversations_canonical_per_citizen_line
ON conversations (citizen_id, channel, COALESCE(communication_line_id, '00000000-0000-0000-0000-000000000000'::uuid))
WHERE is_canonical;
CREATE UNIQUE INDEX uq_conversations_active_per_citizen_channel_line
ON conversations (citizen_id, channel, COALESCE(communication_line_id, '00000000-0000-0000-0000-000000000000'::uuid))
WHERE status IN ('open', 'in_progress');

-- Keep existing meta consumers/API contracts. A row lock makes a first binding
-- atomic across API, campaign and webhook workers. An established line is immutable.
CREATE FUNCTION sync_conversation_line_scope() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE bound_line uuid;
BEGIN
  SELECT communication_line_id INTO bound_line FROM conversations
  WHERE id = NEW.conversation_id FOR UPDATE;
  IF bound_line IS NOT NULL AND bound_line IS DISTINCT FROM NEW.communication_line_id THEN
    RAISE EXCEPTION 'Conversation line cannot be reassigned' USING ERRCODE = '23514';
  END IF;
  UPDATE conversations SET communication_line_id = NEW.communication_line_id
  WHERE id = NEW.conversation_id AND communication_line_id IS DISTINCT FROM NEW.communication_line_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER conversation_meta_line_scope
BEFORE INSERT OR UPDATE OF communication_line_id ON conversation_meta
FOR EACH ROW EXECUTE FUNCTION sync_conversation_line_scope();
COMMIT;
