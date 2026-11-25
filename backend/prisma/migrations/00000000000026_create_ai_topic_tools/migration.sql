-- Consolidated baseline generated from the effective PostgreSQL 16 schema.
CREATE TABLE public.ai_topic_tools (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    topic_id uuid NOT NULL,
    tool_id uuid NOT NULL,
    sort_order integer DEFAULT 100 NOT NULL,
    is_required boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.ai_topic_tools
    ADD CONSTRAINT ai_topic_tools_pkey PRIMARY KEY (id);

CREATE INDEX ai_topic_tools_tool_id_idx ON public.ai_topic_tools USING btree (tool_id);

CREATE INDEX ai_topic_tools_topic_id_is_active_idx ON public.ai_topic_tools USING btree (topic_id, is_active);

CREATE UNIQUE INDEX uq_ai_topic_tools_topic_tool ON public.ai_topic_tools USING btree (topic_id, tool_id);

ALTER TABLE ONLY public.ai_topic_tools
    ADD CONSTRAINT ai_topic_tools_tool_id_fkey FOREIGN KEY (tool_id) REFERENCES public.ai_tools(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.ai_topic_tools
    ADD CONSTRAINT ai_topic_tools_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.ai_topics(id) ON UPDATE CASCADE ON DELETE CASCADE;
