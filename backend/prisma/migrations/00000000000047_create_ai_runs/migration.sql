-- Consolidated baseline generated from the effective PostgreSQL 16 schema.
CREATE TABLE public.ai_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    citizen_id uuid NOT NULL,
    communication_line_id uuid NOT NULL,
    agent_id uuid NOT NULL,
    topic_id uuid NOT NULL,
    prompt_id uuid NOT NULL,
    provider public.ai_provider NOT NULL,
    model character varying(255) NOT NULL,
    status public.ai_run_status DEFAULT 'running'::public.ai_run_status NOT NULL,
    input_message text NOT NULL,
    prompt_snapshot text NOT NULL,
    model_response text,
    error_message text,
    steps integer DEFAULT 0 NOT NULL,
    max_steps integer DEFAULT 4 NOT NULL,
    tool_calls_count integer DEFAULT 0 NOT NULL,
    correlation_id character varying(255),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    finished_at timestamp(6) with time zone
);

ALTER TABLE ONLY public.ai_runs
    ADD CONSTRAINT ai_runs_pkey PRIMARY KEY (id);

CREATE INDEX ai_runs_agent_id_topic_id_created_at_idx ON public.ai_runs USING btree (agent_id, topic_id, created_at);

CREATE INDEX ai_runs_communication_line_id_created_at_idx ON public.ai_runs USING btree (communication_line_id, created_at);

CREATE INDEX ai_runs_conversation_id_created_at_idx ON public.ai_runs USING btree (conversation_id, created_at);

ALTER TABLE ONLY public.ai_runs
    ADD CONSTRAINT ai_runs_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.ai_agents(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.ai_runs
    ADD CONSTRAINT ai_runs_citizen_id_fkey FOREIGN KEY (citizen_id) REFERENCES public.citizens(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.ai_runs
    ADD CONSTRAINT ai_runs_communication_line_id_fkey FOREIGN KEY (communication_line_id) REFERENCES public.communication_lines(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.ai_runs
    ADD CONSTRAINT ai_runs_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.ai_runs
    ADD CONSTRAINT ai_runs_prompt_id_fkey FOREIGN KEY (prompt_id) REFERENCES public.ai_prompts(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.ai_runs
    ADD CONSTRAINT ai_runs_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.ai_topics(id) ON UPDATE CASCADE ON DELETE CASCADE;
