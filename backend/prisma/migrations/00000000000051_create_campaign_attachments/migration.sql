-- Consolidated baseline generated from the effective PostgreSQL 16 schema.
CREATE TABLE public.campaign_attachments (
    id uuid NOT NULL,
    created_by uuid NOT NULL,
    line_id uuid NOT NULL,
    template_id character varying(100) NOT NULL,
    file_id text NOT NULL,
    folder_id text NOT NULL,
    filename character varying(255) NOT NULL,
    mime_type character varying(100) NOT NULL,
    media_type character varying(20) NOT NULL,
    url text NOT NULL,
    view_url text NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    campaign_id uuid
);

ALTER TABLE ONLY public.campaign_attachments
    ADD CONSTRAINT campaign_attachments_pkey PRIMARY KEY (id);

CREATE UNIQUE INDEX campaign_attachments_campaign_id_key ON public.campaign_attachments USING btree (campaign_id);

CREATE INDEX campaign_attachments_created_by_created_at_idx ON public.campaign_attachments USING btree (created_by, created_at);

CREATE UNIQUE INDEX campaign_attachments_file_id_key ON public.campaign_attachments USING btree (file_id);

ALTER TABLE ONLY public.campaign_attachments
    ADD CONSTRAINT campaign_attachments_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON UPDATE CASCADE ON DELETE RESTRICT;
