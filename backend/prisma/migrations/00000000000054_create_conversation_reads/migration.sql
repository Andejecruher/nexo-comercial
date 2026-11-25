-- Consolidated baseline generated from the effective PostgreSQL 16 schema.
CREATE TABLE public.conversation_reads (
    user_id uuid NOT NULL,
    conversation_id uuid NOT NULL,
    last_read_at timestamp(6) with time zone NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);

ALTER TABLE ONLY public.conversation_reads
    ADD CONSTRAINT conversation_reads_pkey PRIMARY KEY (user_id, conversation_id);

CREATE INDEX conversation_reads_conversation_id_idx ON public.conversation_reads USING btree (conversation_id);

ALTER TABLE ONLY public.conversation_reads
    ADD CONSTRAINT conversation_reads_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.conversation_reads
    ADD CONSTRAINT conversation_reads_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;
