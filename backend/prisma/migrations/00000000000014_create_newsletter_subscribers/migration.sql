-- Consolidated baseline generated from the effective PostgreSQL 16 schema.
CREATE TABLE public.newsletter_subscribers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying(255) NOT NULL,
    name character varying(255),
    status public.newsletter_subscriber_status DEFAULT 'pending'::public.newsletter_subscriber_status NOT NULL,
    source character varying(50) NOT NULL,
    subscribed_at timestamp(6) with time zone,
    unsubscribed_at timestamp(6) with time zone,
    ip_address character varying(45),
    confirm_token_hash character varying(64),
    confirm_token_expires_at timestamp(6) with time zone,
    unsubscribe_token_hash character varying(64),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);

ALTER TABLE ONLY public.newsletter_subscribers
    ADD CONSTRAINT newsletter_subscribers_pkey PRIMARY KEY (id);

CREATE INDEX newsletter_subscribers_confirm_token_hash_idx ON public.newsletter_subscribers USING btree (confirm_token_hash);

CREATE UNIQUE INDEX newsletter_subscribers_email_key ON public.newsletter_subscribers USING btree (email);

CREATE INDEX newsletter_subscribers_status_idx ON public.newsletter_subscribers USING btree (status);

CREATE INDEX newsletter_subscribers_unsubscribe_token_hash_idx ON public.newsletter_subscribers USING btree (unsubscribe_token_hash);
