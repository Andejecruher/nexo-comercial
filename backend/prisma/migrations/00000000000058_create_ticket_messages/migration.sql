-- Consolidated baseline generated from the effective PostgreSQL 16 schema.
CREATE TABLE public.ticket_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    message_id uuid NOT NULL,
    actor_type public.ticket_actor_type DEFAULT 'CITIZEN'::public.ticket_actor_type NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.ticket_messages
    ADD CONSTRAINT ticket_messages_pkey PRIMARY KEY (id);

CREATE INDEX ticket_messages_message_id_idx ON public.ticket_messages USING btree (message_id);

CREATE INDEX ticket_messages_ticket_id_idx ON public.ticket_messages USING btree (ticket_id);

CREATE UNIQUE INDEX uq_ticket_messages_ticket_message ON public.ticket_messages USING btree (ticket_id, message_id);

ALTER TABLE ONLY public.ticket_messages
    ADD CONSTRAINT ticket_messages_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.ticket_messages
    ADD CONSTRAINT ticket_messages_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON UPDATE CASCADE ON DELETE CASCADE;
