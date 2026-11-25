-- Consolidated baseline generated from the effective PostgreSQL 16 schema.
CREATE TABLE public.inbox_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    wamid character varying(255) NOT NULL,
    phone character varying(30) NOT NULL,
    payload jsonb NOT NULL,
    status public.inbox_event_status DEFAULT 'pending'::public.inbox_event_status NOT NULL,
    retry_count integer DEFAULT 0 NOT NULL,
    last_error_at timestamp(6) with time zone,
    last_error text,
    idempotency_key character varying(255),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    processed_at timestamp(6) with time zone,
    locked_at timestamp(6) with time zone,
    locked_by character varying(255),
    ingested_at timestamp(6) with time zone,
    message_id uuid,
    correlation_id character varying(255),
    batch_generation integer
);

ALTER TABLE ONLY public.inbox_events
    ADD CONSTRAINT inbox_events_pkey PRIMARY KEY (id);

CREATE INDEX inbox_events_created_at_idx ON public.inbox_events USING btree (created_at);

CREATE INDEX inbox_events_message_id_idx ON public.inbox_events USING btree (message_id);

CREATE INDEX inbox_events_phone_batch_generation_status_idx ON public.inbox_events USING btree (phone, batch_generation, status);

CREATE INDEX inbox_events_phone_idx ON public.inbox_events USING btree (phone);

CREATE INDEX inbox_events_status_created_at_idx ON public.inbox_events USING btree (status, created_at);

CREATE UNIQUE INDEX inbox_events_wamid_key ON public.inbox_events USING btree (wamid);
