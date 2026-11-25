-- Consolidated baseline generated from the effective PostgreSQL 16 schema.
CREATE TABLE public.outbox_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid,
    phone character varying(30) NOT NULL,
    payload jsonb NOT NULL,
    status public.outbox_event_status DEFAULT 'pending'::public.outbox_event_status NOT NULL,
    retry_count integer DEFAULT 0 NOT NULL,
    next_retry_at timestamp(6) with time zone,
    last_error text,
    wamid character varying(255),
    idempotency_key character varying(255) NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    sent_at timestamp(6) with time zone,
    locked_at timestamp(6) with time zone,
    locked_by character varying(255)
);

ALTER TABLE ONLY public.outbox_events
    ADD CONSTRAINT outbox_events_pkey PRIMARY KEY (id);

CREATE INDEX outbox_events_conversation_id_idx ON public.outbox_events USING btree (conversation_id);

CREATE UNIQUE INDEX outbox_events_idempotency_key_key ON public.outbox_events USING btree (idempotency_key);

CREATE INDEX outbox_events_phone_idx ON public.outbox_events USING btree (phone);

CREATE INDEX outbox_events_status_next_retry_at_idx ON public.outbox_events USING btree (status, next_retry_at);
