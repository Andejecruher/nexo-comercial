-- Consolidated baseline generated from the effective PostgreSQL 16 schema.
CREATE TABLE public.departments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug character varying(100) NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    service_hours character varying(255),
    service_schedule jsonb,
    is_active boolean DEFAULT true NOT NULL,
    keywords text[] DEFAULT ARRAY[]::text[],
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (id);

CREATE INDEX departments_is_active_idx ON public.departments USING btree (is_active);

CREATE INDEX departments_slug_idx ON public.departments USING btree (slug);

CREATE UNIQUE INDEX departments_slug_key ON public.departments USING btree (slug);
