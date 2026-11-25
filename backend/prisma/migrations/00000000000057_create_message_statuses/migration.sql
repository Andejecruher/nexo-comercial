-- Consolidated baseline generated from the effective PostgreSQL 16 schema.
CREATE TABLE public.message_statuses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    message_id uuid NOT NULL,
    wamid character varying(255) NOT NULL,
    status public.message_status_value NOT NULL,
    error_code integer,
    error_title character varying(255),
    "timestamp" timestamp(3) without time zone NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.message_statuses
    ADD CONSTRAINT message_statuses_pkey PRIMARY KEY (id);

CREATE INDEX message_statuses_message_id_idx ON public.message_statuses USING btree (message_id);

CREATE INDEX message_statuses_wamid_idx ON public.message_statuses USING btree (wamid);

ALTER TABLE ONLY public.message_statuses
    ADD CONSTRAINT message_statuses_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id) ON UPDATE CASCADE ON DELETE CASCADE;
