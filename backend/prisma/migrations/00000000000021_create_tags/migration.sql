-- Consolidated baseline generated from the effective PostgreSQL 16 schema.
CREATE TABLE public.tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    color character varying(20),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_pkey PRIMARY KEY (id);

CREATE INDEX tags_name_idx ON public.tags USING btree (name);

CREATE UNIQUE INDEX tags_name_key ON public.tags USING btree (name);

CREATE UNIQUE INDEX uq_tags_name_lower ON public.tags USING btree (lower((name)::text));
