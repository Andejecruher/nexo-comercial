-- Consolidated baseline generated from the effective PostgreSQL 16 schema.
CREATE TABLE public.rate_limit_counters (
    scope character varying(50) NOT NULL,
    bucket_key character varying(255) NOT NULL,
    window_start timestamp(6) with time zone NOT NULL,
    count integer DEFAULT 0 NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.rate_limit_counters
    ADD CONSTRAINT rate_limit_counters_pkey PRIMARY KEY (scope, bucket_key, window_start);

CREATE INDEX rate_limit_counters_scope_window_start_idx ON public.rate_limit_counters USING btree (scope, window_start);
