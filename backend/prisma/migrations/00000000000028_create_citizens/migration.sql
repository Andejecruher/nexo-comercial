-- Consolidated baseline generated from the effective PostgreSQL 16 schema.
CREATE TABLE public.citizens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    phone character varying(30),
    name character varying(255),
    last_name character varying(255),
    email character varying(255),
    source_channel public.source_channel DEFAULT 'whatsapp'::public.source_channel NOT NULL,
    lead_status public.lead_status DEFAULT 'new'::public.lead_status NOT NULL,
    consent_given boolean DEFAULT false NOT NULL,
    consent_at timestamp(6) with time zone,
    neighborhood character varying(255),
    neighborhood_id uuid,
    interests text[] DEFAULT ARRAY[]::text[],
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    voter_key_fingerprint character varying(32),
    curp_fingerprint character varying(32)
);

ALTER TABLE ONLY public.citizens
    ADD CONSTRAINT citizens_pkey PRIMARY KEY (id);

CREATE INDEX citizens_curp_fingerprint_idx ON public.citizens USING btree (curp_fingerprint);

CREATE INDEX citizens_email_idx ON public.citizens USING btree (email);

CREATE INDEX citizens_phone_idx ON public.citizens USING btree (phone);

CREATE UNIQUE INDEX citizens_phone_key ON public.citizens USING btree (phone);

CREATE INDEX citizens_voter_key_fingerprint_idx ON public.citizens USING btree (voter_key_fingerprint);

CREATE UNIQUE INDEX uq_citizens_curp_fingerprint ON public.citizens USING btree (curp_fingerprint);

CREATE UNIQUE INDEX uq_citizens_voter_key_fingerprint ON public.citizens USING btree (voter_key_fingerprint);

ALTER TABLE ONLY public.citizens
    ADD CONSTRAINT citizens_neighborhood_id_fkey FOREIGN KEY (neighborhood_id) REFERENCES public.neighborhoods(id) ON UPDATE CASCADE ON DELETE SET NULL;
