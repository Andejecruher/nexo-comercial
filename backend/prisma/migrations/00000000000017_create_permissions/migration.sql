-- Consolidated baseline generated from the effective PostgreSQL 16 schema.
CREATE TABLE public.permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    slug character varying(120) NOT NULL,
    module character varying(80) NOT NULL,
    description character varying(255),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    is_system boolean DEFAULT false NOT NULL
);

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);

CREATE INDEX permissions_is_active_idx ON public.permissions USING btree (is_active);

CREATE INDEX permissions_is_system_idx ON public.permissions USING btree (is_system);

CREATE INDEX permissions_module_idx ON public.permissions USING btree (module);

CREATE INDEX permissions_slug_idx ON public.permissions USING btree (slug);

CREATE UNIQUE INDEX permissions_slug_key ON public.permissions USING btree (slug);
