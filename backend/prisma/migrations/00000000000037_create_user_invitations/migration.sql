-- Consolidated baseline generated from the effective PostgreSQL 16 schema.
CREATE TABLE public.user_invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash character varying(128) NOT NULL,
    status public.user_invitation_status DEFAULT 'pending'::public.user_invitation_status NOT NULL,
    expires_at timestamp(6) with time zone NOT NULL,
    sent_at timestamp(6) with time zone,
    accepted_at timestamp(6) with time zone,
    revoked_at timestamp(6) with time zone,
    provider character varying(40),
    provider_message_id character varying(255),
    last_error_code character varying(80),
    delivery_attempt_count integer DEFAULT 0 NOT NULL,
    created_by_id uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.user_invitations
    ADD CONSTRAINT user_invitations_pkey PRIMARY KEY (id);

CREATE UNIQUE INDEX uq_user_invitations_token_hash ON public.user_invitations USING btree (token_hash);

CREATE INDEX user_invitations_expires_at_idx ON public.user_invitations USING btree (expires_at);

CREATE INDEX user_invitations_user_id_status_idx ON public.user_invitations USING btree (user_id, status);

ALTER TABLE ONLY public.user_invitations
    ADD CONSTRAINT user_invitations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;
