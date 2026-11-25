-- Consolidated baseline generated from the effective PostgreSQL 16 schema.
CREATE TABLE public.campaign_recipients (
    id uuid NOT NULL,
    campaign_id uuid NOT NULL,
    citizen_id uuid,
    phone character varying(16) NOT NULL,
    variables jsonb NOT NULL,
    message_id character varying(512),
    status public."CampaignMessageStatus" DEFAULT 'pending'::public."CampaignMessageStatus" NOT NULL,
    dispatch_state public."CampaignDispatchState" DEFAULT 'queued'::public."CampaignDispatchState" NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    next_attempt_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    locked_at timestamp(6) with time zone,
    error_code character varying(80),
    accepted_at timestamp(6) with time zone,
    sent_at timestamp(6) with time zone,
    delivered_at timestamp(6) with time zone,
    read_at timestamp(6) with time zone,
    failed_at timestamp(6) with time zone,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);

ALTER TABLE ONLY public.campaign_recipients
    ADD CONSTRAINT campaign_recipients_pkey PRIMARY KEY (id);

CREATE INDEX campaign_recipients_campaign_id_dispatch_state_next_attempt_idx ON public.campaign_recipients USING btree (campaign_id, dispatch_state, next_attempt_at);

CREATE UNIQUE INDEX campaign_recipients_campaign_id_phone_key ON public.campaign_recipients USING btree (campaign_id, phone);

CREATE INDEX campaign_recipients_campaign_id_status_idx ON public.campaign_recipients USING btree (campaign_id, status);

CREATE UNIQUE INDEX campaign_recipients_message_id_key ON public.campaign_recipients USING btree (message_id);

ALTER TABLE ONLY public.campaign_recipients
    ADD CONSTRAINT campaign_recipients_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.campaign_recipients
    ADD CONSTRAINT campaign_recipients_citizen_id_fkey FOREIGN KEY (citizen_id) REFERENCES public.citizens(id) ON UPDATE CASCADE ON DELETE SET NULL;
