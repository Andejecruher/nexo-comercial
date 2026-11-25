-- Consolidated baseline generated from the effective PostgreSQL 16 schema.
CREATE TABLE public.realtime_outbox_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_type character varying(100) NOT NULL,
    socket_event_name character varying(100) NOT NULL,
    payload jsonb NOT NULL,
    status public.realtime_outbox_status DEFAULT 'pending'::public.realtime_outbox_status NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    next_retry_at timestamp(6) with time zone,
    locked_at timestamp(6) with time zone,
    locked_by character varying(255),
    published_at timestamp(6) with time zone,
    last_error text,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);

ALTER TABLE ONLY public.realtime_outbox_events
    ADD CONSTRAINT realtime_outbox_events_pkey PRIMARY KEY (id);

CREATE INDEX realtime_outbox_events_created_at_idx ON public.realtime_outbox_events USING btree (created_at);

CREATE INDEX realtime_outbox_events_event_type_idx ON public.realtime_outbox_events USING btree (event_type);

CREATE INDEX realtime_outbox_events_status_next_retry_at_idx ON public.realtime_outbox_events USING btree (status, next_retry_at);
