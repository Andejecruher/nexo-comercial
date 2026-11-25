-- Consolidated baseline generated from the effective PostgreSQL 16 schema.
CREATE TABLE public.roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(50) NOT NULL,
    description character varying(255),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    slug character varying(80) NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);

CREATE INDEX roles_name_idx ON public.roles USING btree (name);

CREATE UNIQUE INDEX roles_name_key ON public.roles USING btree (name);

CREATE INDEX roles_slug_idx ON public.roles USING btree (slug);

CREATE UNIQUE INDEX roles_slug_key ON public.roles USING btree (slug);
