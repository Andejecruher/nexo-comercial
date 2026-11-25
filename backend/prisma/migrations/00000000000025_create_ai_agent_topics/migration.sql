-- Consolidated baseline generated from the effective PostgreSQL 16 schema.
CREATE TABLE public.ai_agent_topics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agent_id uuid NOT NULL,
    topic_id uuid NOT NULL,
    prompt_id uuid NOT NULL,
    priority integer DEFAULT 100 NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);

ALTER TABLE ONLY public.ai_agent_topics
    ADD CONSTRAINT ai_agent_topics_pkey PRIMARY KEY (id);

CREATE INDEX ai_agent_topics_agent_id_is_active_idx ON public.ai_agent_topics USING btree (agent_id, is_active);

CREATE INDEX ai_agent_topics_prompt_id_idx ON public.ai_agent_topics USING btree (prompt_id);

CREATE INDEX ai_agent_topics_topic_id_is_active_idx ON public.ai_agent_topics USING btree (topic_id, is_active);

CREATE UNIQUE INDEX uq_ai_agent_topics_agent_topic ON public.ai_agent_topics USING btree (agent_id, topic_id);

ALTER TABLE ONLY public.ai_agent_topics
    ADD CONSTRAINT ai_agent_topics_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.ai_agents(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.ai_agent_topics
    ADD CONSTRAINT ai_agent_topics_prompt_id_fkey FOREIGN KEY (prompt_id) REFERENCES public.ai_prompts(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.ai_agent_topics
    ADD CONSTRAINT ai_agent_topics_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.ai_topics(id) ON UPDATE CASCADE ON DELETE CASCADE;
