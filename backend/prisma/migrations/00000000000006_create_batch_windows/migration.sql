-- Consolidated baseline generated from the effective PostgreSQL 16 schema.
CREATE TABLE public.batch_windows (
    phone character varying(30) NOT NULL,
    batch_generation integer DEFAULT 0 NOT NULL,
    batch_ready_at timestamp(6) with time zone,
    window_opened_at timestamp(6) with time zone,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.batch_windows
    ADD CONSTRAINT batch_windows_pkey PRIMARY KEY (phone);

CREATE INDEX batch_windows_ready_generation_idx ON public.batch_windows USING btree (batch_ready_at, batch_generation);
