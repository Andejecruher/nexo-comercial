-- Consolidated baseline generated from the effective PostgreSQL 16 schema.
CREATE TABLE public.campaigns (
    id uuid NOT NULL,
    name character varying(160) NOT NULL,
    purpose character varying(1000) NOT NULL,
    line_id uuid NOT NULL,
    phone_number_id character varying(100) NOT NULL,
    template_id character varying(100) NOT NULL,
    template_snapshot jsonb NOT NULL,
    mappings jsonb NOT NULL,
    source character varying(20) NOT NULL,
    status public."CampaignStatus" DEFAULT 'queued'::public."CampaignStatus" NOT NULL,
    total integer NOT NULL,
    created_by uuid NOT NULL,
    idempotency_key uuid NOT NULL,
    request_hash character varying(64) NOT NULL,
    consent_confirmed_at timestamp(6) with time zone NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_pkey PRIMARY KEY (id);

CREATE INDEX campaigns_created_at_id_idx ON public.campaigns USING btree (created_at, id);

CREATE UNIQUE INDEX campaigns_created_by_idempotency_key_key ON public.campaigns USING btree (created_by, idempotency_key);

CREATE INDEX campaigns_status_created_at_idx ON public.campaigns USING btree (status, created_at);

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_line_id_fkey FOREIGN KEY (line_id) REFERENCES public.communication_lines(id) ON UPDATE CASCADE ON DELETE RESTRICT;
