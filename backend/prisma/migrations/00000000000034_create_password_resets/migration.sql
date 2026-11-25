-- Consolidated baseline generated from the effective PostgreSQL 16 schema.
CREATE TABLE public.password_resets (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    token_hash character varying(128) NOT NULL,
    expires_at timestamp(6) with time zone NOT NULL,
    used_at timestamp(6) with time zone,
    invalidated_at timestamp(6) with time zone,
    requested_ip character varying(45),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);

ALTER TABLE ONLY public.password_resets
    ADD CONSTRAINT password_resets_pkey PRIMARY KEY (id);

CREATE INDEX password_resets_expires_at_idx ON public.password_resets USING btree (expires_at);

CREATE INDEX password_resets_user_id_idx ON public.password_resets USING btree (user_id);

CREATE UNIQUE INDEX uq_password_resets_token_hash ON public.password_resets USING btree (token_hash);

ALTER TABLE ONLY public.password_resets
    ADD CONSTRAINT password_resets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;
