-- Consolidated baseline generated from the effective PostgreSQL 16 schema.
CREATE TABLE public.identity_lockouts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    identity_key character varying(255) NOT NULL,
    fails integer DEFAULT 0 NOT NULL,
    level integer DEFAULT 0 NOT NULL,
    locked_until timestamp(6) with time zone,
    last_failure_at timestamp(6) with time zone,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.identity_lockouts
    ADD CONSTRAINT identity_lockouts_pkey PRIMARY KEY (id);

CREATE UNIQUE INDEX identity_lockouts_identity_key_key ON public.identity_lockouts USING btree (identity_key);

CREATE INDEX identity_lockouts_locked_until_idx ON public.identity_lockouts USING btree (locked_until);
