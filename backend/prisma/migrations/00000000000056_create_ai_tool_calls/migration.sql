-- Consolidated baseline generated from the effective PostgreSQL 16 schema.
CREATE TABLE public.ai_tool_calls (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid NOT NULL,
    tool_id uuid NOT NULL,
    tool_name character varying(120) NOT NULL,
    status public.ai_tool_call_status DEFAULT 'running'::public.ai_tool_call_status NOT NULL,
    input_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    output_payload jsonb,
    error_message text,
    duration_ms integer,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    finished_at timestamp(6) with time zone
);

ALTER TABLE ONLY public.ai_tool_calls
    ADD CONSTRAINT ai_tool_calls_pkey PRIMARY KEY (id);

CREATE INDEX ai_tool_calls_run_id_created_at_idx ON public.ai_tool_calls USING btree (run_id, created_at);

CREATE INDEX ai_tool_calls_status_idx ON public.ai_tool_calls USING btree (status);

CREATE INDEX ai_tool_calls_tool_id_idx ON public.ai_tool_calls USING btree (tool_id);

ALTER TABLE ONLY public.ai_tool_calls
    ADD CONSTRAINT ai_tool_calls_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.ai_runs(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.ai_tool_calls
    ADD CONSTRAINT ai_tool_calls_tool_id_fkey FOREIGN KEY (tool_id) REFERENCES public.ai_tools(id) ON UPDATE CASCADE ON DELETE CASCADE;
