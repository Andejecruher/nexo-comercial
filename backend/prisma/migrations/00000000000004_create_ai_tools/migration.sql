-- Consolidated baseline generated from the effective PostgreSQL 16 schema.
CREATE TABLE public.ai_tools (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(120) NOT NULL,
    description text NOT NULL,
    type public.ai_tool_kind DEFAULT 'internal'::public.ai_tool_kind NOT NULL,
    execution_type public.ai_tool_execution_type DEFAULT 'function'::public.ai_tool_execution_type NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    kind public.ai_tool_kind NOT NULL,
    internal_key character varying(120),
    external_url text,
    external_method public.ai_tool_http_method,
    external_headers jsonb,
    external_auth_env_key character varying(120),
    timeout_ms integer DEFAULT 8000 NOT NULL,
    allowlist_domains text[] DEFAULT ARRAY[]::text[],
    input_schema jsonb,
    output_schema jsonb,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);

ALTER TABLE ONLY public.ai_tools
    ADD CONSTRAINT ai_tools_pkey PRIMARY KEY (id);

CREATE INDEX ai_tools_kind_is_active_idx ON public.ai_tools USING btree (kind, is_active);

CREATE UNIQUE INDEX ai_tools_name_key ON public.ai_tools USING btree (name);
