-- Consolidated baseline generated from the effective PostgreSQL 16 schema.
CREATE TABLE public.ai_topics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug character varying(100) NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    system_prompt_id uuid,
    matcher_keywords text[] DEFAULT ARRAY[]::text[],
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);

ALTER TABLE ONLY public.ai_topics
    ADD CONSTRAINT ai_topics_pkey PRIMARY KEY (id);

CREATE INDEX ai_topics_is_active_idx ON public.ai_topics USING btree (is_active);

CREATE UNIQUE INDEX ai_topics_slug_key ON public.ai_topics USING btree (slug);

CREATE INDEX ai_topics_system_prompt_id_idx ON public.ai_topics USING btree (system_prompt_id);

ALTER TABLE ONLY public.ai_topics
    ADD CONSTRAINT ai_topics_system_prompt_id_fkey FOREIGN KEY (system_prompt_id) REFERENCES public.ai_prompts(id) ON UPDATE CASCADE ON DELETE SET NULL;
