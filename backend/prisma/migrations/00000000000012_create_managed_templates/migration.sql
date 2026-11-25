-- Consolidated baseline generated from the effective PostgreSQL 16 schema.
CREATE TABLE public.managed_templates (
    template_id character varying(100) NOT NULL,
    waba_id character varying(100) NOT NULL,
    created_at timestamp(6) with time zone,
    updated_at timestamp(6) with time zone
);

ALTER TABLE ONLY public.managed_templates
    ADD CONSTRAINT managed_templates_pkey PRIMARY KEY (template_id);

CREATE INDEX managed_templates_waba_id_idx ON public.managed_templates USING btree (waba_id);
