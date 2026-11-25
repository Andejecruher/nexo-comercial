-- Consolidated baseline generated from the effective PostgreSQL 16 schema.
CREATE TABLE public.assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    user_id uuid NOT NULL,
    department_slug character varying(100),
    assigned_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    released_at timestamp(6) with time zone,
    is_active boolean DEFAULT true NOT NULL
);

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT assignments_pkey PRIMARY KEY (id);

CREATE INDEX assignments_conversation_id_idx ON public.assignments USING btree (conversation_id);

CREATE INDEX assignments_is_active_idx ON public.assignments USING btree (is_active);

CREATE INDEX assignments_user_id_idx ON public.assignments USING btree (user_id);

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT assignments_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;
