-- Consolidated baseline generated from the effective PostgreSQL 16 schema.
CREATE TABLE public.refresh_sessions (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    device_id character varying(255) NOT NULL,
    jti character varying(64) NOT NULL,
    token_hash character varying(128) NOT NULL,
    expires_at timestamp(6) with time zone NOT NULL,
    revoked_at timestamp(6) with time zone,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.refresh_sessions
    ADD CONSTRAINT refresh_sessions_pkey PRIMARY KEY (id);

CREATE INDEX refresh_sessions_expires_at_idx ON public.refresh_sessions USING btree (expires_at);

CREATE INDEX refresh_sessions_user_id_created_at_idx ON public.refresh_sessions USING btree (user_id, created_at);

CREATE UNIQUE INDEX refresh_sessions_user_id_device_id_jti_key ON public.refresh_sessions USING btree (user_id, device_id, jti);

ALTER TABLE ONLY public.refresh_sessions
    ADD CONSTRAINT refresh_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;
