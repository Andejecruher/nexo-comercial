-- BEFORE INSERT runs before ON CONFLICT, including lease/FSM UPSERTs that
-- omit communication_line_id. Inherit the established scope for such inserts
-- instead of treating their NULL as an attempt to unbind the conversation.
-- Keep explicit UPDATE-to-NULL and different-line writes forbidden.
CREATE OR REPLACE FUNCTION sync_conversation_line_scope() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE bound_line uuid;
BEGIN
  SELECT communication_line_id INTO bound_line FROM conversations
  WHERE id = NEW.conversation_id FOR UPDATE;

  IF TG_OP = 'INSERT' AND NEW.communication_line_id IS NULL THEN
    NEW.communication_line_id := bound_line;
  END IF;

  IF bound_line IS NOT NULL AND bound_line IS DISTINCT FROM NEW.communication_line_id THEN
    RAISE EXCEPTION 'Conversation line cannot be reassigned' USING ERRCODE = '23514';
  END IF;
  UPDATE conversations SET communication_line_id = NEW.communication_line_id
  WHERE id = NEW.conversation_id AND communication_line_id IS DISTINCT FROM NEW.communication_line_id;
  RETURN NEW;
END;
$$;
