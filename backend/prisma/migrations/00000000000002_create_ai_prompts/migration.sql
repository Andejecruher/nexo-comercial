-- Consolidated baseline generated from the effective PostgreSQL 16 schema.
CREATE TABLE public.ai_prompts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    topic_id uuid,
    name character varying(255) NOT NULL,
    type public.ai_prompt_type DEFAULT 'topic'::public.ai_prompt_type NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    content text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);

ALTER TABLE ONLY public.ai_prompts
    ADD CONSTRAINT ai_prompts_pkey PRIMARY KEY (id);

CREATE INDEX ai_prompts_topic_id_is_active_idx ON public.ai_prompts USING btree (topic_id, is_active);

CREATE UNIQUE INDEX uq_ai_prompts_topic_version ON public.ai_prompts USING btree (topic_id, version);
