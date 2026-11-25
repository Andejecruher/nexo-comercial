-- Consolidated baseline generated from the effective PostgreSQL 16 schema.
CREATE TABLE public.webhook_event_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    correlation_id character varying(255) NOT NULL,
    raw_payload jsonb NOT NULL,
    signature character varying(255),
    processed_ok boolean DEFAULT false NOT NULL,
    error_message text,
    ip_address character varying(45),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.webhook_event_logs
    ADD CONSTRAINT webhook_event_logs_pkey PRIMARY KEY (id);

CREATE INDEX webhook_event_logs_correlation_id_idx ON public.webhook_event_logs USING btree (correlation_id);

CREATE INDEX webhook_event_logs_created_at_idx ON public.webhook_event_logs USING btree (created_at);

CREATE INDEX webhook_event_logs_processed_ok_created_at_idx ON public.webhook_event_logs USING btree (processed_ok, created_at);
