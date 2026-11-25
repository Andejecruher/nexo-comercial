-- Consolidated baseline generated from the effective PostgreSQL 16 schema.
CREATE TABLE public.neighborhoods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    zone character varying(100),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    match_key character varying(255) NOT NULL,
    postal_code character varying(10),
    municipality character varying(100),
    state character varying(100) DEFAULT 'Chiapas'::character varying NOT NULL,
    state_code character varying(5) DEFAULT 'CHP'::character varying NOT NULL
);

ALTER TABLE ONLY public.neighborhoods
    ADD CONSTRAINT neighborhoods_pkey PRIMARY KEY (id);

CREATE INDEX neighborhoods_match_key_trgm_idx ON public.neighborhoods USING gin (match_key public.gin_trgm_ops);

CREATE INDEX neighborhoods_municipality_idx ON public.neighborhoods USING btree (municipality);

CREATE INDEX neighborhoods_municipality_trgm_idx ON public.neighborhoods USING gin (municipality public.gin_trgm_ops);

CREATE INDEX neighborhoods_name_idx ON public.neighborhoods USING btree (name);

CREATE INDEX neighborhoods_postal_code_idx ON public.neighborhoods USING btree (postal_code);

CREATE INDEX neighborhoods_state_idx ON public.neighborhoods USING btree (state);

CREATE INDEX neighborhoods_zone_idx ON public.neighborhoods USING btree (zone);

CREATE UNIQUE INDEX uq_neighborhoods_match_key_municipality ON public.neighborhoods USING btree (match_key, municipality);
