-- Consolidated baseline generated from the effective PostgreSQL 16 schema.
CREATE TABLE public.ai_agents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug character varying(100) NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    provider public.ai_provider NOT NULL,
    model character varying(255) NOT NULL,
    temperature numeric(4,2),
    max_tokens integer,
    is_active boolean DEFAULT true NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);

ALTER TABLE ONLY public.ai_agents
    ADD CONSTRAINT ai_agents_pkey PRIMARY KEY (id);

CREATE INDEX ai_agents_is_active_idx ON public.ai_agents USING btree (is_active);

CREATE UNIQUE INDEX ai_agents_slug_key ON public.ai_agents USING btree (slug);
