-- Consolidated baseline generated from the effective PostgreSQL 16 schema.
CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    body text NOT NULL,
    direction public.message_direction NOT NULL,
    message_type public.message_type DEFAULT 'text'::public.message_type NOT NULL,
    external_message_id character varying(255),
    attachment_id uuid,
    meta jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    idempotency_key character varying(255),
    send_by_user_id uuid,
    ticket_id uuid
);

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);

CREATE INDEX messages_conversation_id_created_at_id_idx ON public.messages USING btree (conversation_id, created_at, id);

CREATE INDEX messages_conversation_id_direction_created_at_idx ON public.messages USING btree (conversation_id, direction, created_at);

CREATE INDEX messages_external_message_id_idx ON public.messages USING btree (external_message_id);

CREATE UNIQUE INDEX messages_idempotency_key_key ON public.messages USING btree (idempotency_key);

CREATE INDEX messages_send_by_user_id_idx ON public.messages USING btree (send_by_user_id);

CREATE INDEX messages_ticket_id_created_at_id_idx ON public.messages USING btree (ticket_id, created_at, id);

CREATE INDEX messages_ticket_id_idx ON public.messages USING btree (ticket_id);

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_attachment_id_fkey FOREIGN KEY (attachment_id) REFERENCES public.attachments(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_send_by_user_id_fkey FOREIGN KEY (send_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON UPDATE CASCADE ON DELETE SET NULL;
