-- Consolidated baseline generated from the effective PostgreSQL 16 schema.
CREATE TABLE public.communication_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    channel public.conversation_channel DEFAULT 'whatsapp'::public.conversation_channel NOT NULL,
    external_identifier character varying(255) NOT NULL,
    phone_number character varying(30),
    provider character varying(100),
    display_name character varying(255) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    ai_enabled boolean DEFAULT false NOT NULL,
    agent_id uuid,
    ai_agent_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    whatsapp_app_secret character varying(255),
    whatsapp_access_token text,
    whatsapp_business_account_id character varying(100),
    whatsapp_app_id character varying(100),
    whatsapp_phone_number_id character varying(100)
);

ALTER TABLE ONLY public.communication_lines
    ADD CONSTRAINT communication_lines_pkey PRIMARY KEY (id);

CREATE INDEX communication_lines_agent_id_idx ON public.communication_lines USING btree (agent_id);

CREATE INDEX communication_lines_ai_agent_id_idx ON public.communication_lines USING btree (ai_agent_id);

CREATE INDEX communication_lines_is_active_ai_enabled_idx ON public.communication_lines USING btree (is_active, ai_enabled);

CREATE INDEX communication_lines_phone_number_idx ON public.communication_lines USING btree (phone_number);

CREATE UNIQUE INDEX uq_communication_lines_channel_external ON public.communication_lines USING btree (channel, external_identifier);

ALTER TABLE ONLY public.communication_lines
    ADD CONSTRAINT communication_lines_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.ai_agents(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.communication_lines
    ADD CONSTRAINT communication_lines_ai_agent_id_fkey FOREIGN KEY (ai_agent_id) REFERENCES public.ai_agents(id) ON UPDATE CASCADE ON DELETE SET NULL;
