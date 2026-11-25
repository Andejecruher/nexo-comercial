-- Consolidated baseline generated from the effective PostgreSQL 16 schema.
CREATE TABLE public.batch_window_claims (
    phone character varying(30) NOT NULL,
    batch_generation integer NOT NULL,
    claim_token character varying(64),
    claim_lease_until timestamp(6) with time zone,
    drain_boundary timestamp(6) with time zone,
    completed_at timestamp(6) with time zone,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.batch_window_claims
    ADD CONSTRAINT batch_window_claims_pkey PRIMARY KEY (phone, batch_generation);

CREATE INDEX batch_window_claims_lease_idx ON public.batch_window_claims USING btree (claim_lease_until, completed_at);

CREATE INDEX batch_window_claims_phone_completion_idx ON public.batch_window_claims USING btree (phone, completed_at, batch_generation);
