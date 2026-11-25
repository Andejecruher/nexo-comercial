-- Consolidated baseline generated from the effective PostgreSQL 16 schema.
ALTER TABLE ONLY public.ai_prompts
    ADD CONSTRAINT ai_prompts_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.ai_topics(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT attachments_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_active_ticket_id_fkey FOREIGN KEY (active_ticket_id) REFERENCES public.tickets(id) ON UPDATE CASCADE ON DELETE SET NULL;

CREATE FUNCTION public.sync_conversation_line_scope() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


SET default_tablespace = '';

SET default_table_access_method = heap;

CREATE TRIGGER conversation_meta_line_scope BEFORE INSERT OR UPDATE OF communication_line_id ON public.conversation_meta FOR EACH ROW EXECUTE FUNCTION public.sync_conversation_line_scope();
