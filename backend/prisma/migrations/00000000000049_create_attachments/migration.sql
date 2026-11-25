-- Consolidated baseline generated from the effective PostgreSQL 16 schema.
CREATE TABLE public.attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    storage_key character varying(1024) NOT NULL,
    mime_type character varying(127) NOT NULL,
    file_size_bytes bigint NOT NULL,
    original_filename character varying(512),
    cdn_url text,
    message_id uuid,
    citizen_id uuid,
    uploaded_by uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    communication_line_id uuid,
    checksum_md5 character varying(32),
    provider_media_id character varying(255),
    provider_phone_number_id character varying(100),
    processing_state character varying(24) DEFAULT 'legacy'::character varying NOT NULL,
    drive_file_id character varying(255),
    drive_folder_id character varying(255),
    checksum_sha256 character varying(64),
    attempts integer DEFAULT 0 NOT NULL,
    next_attempt_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    locked_at timestamp(6) with time zone,
    last_error_code character varying(80),
    stored_at timestamp(6) with time zone
);

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT attachments_pkey PRIMARY KEY (id);

CREATE INDEX attachments_citizen_id_idx ON public.attachments USING btree (citizen_id);

CREATE INDEX attachments_message_id_idx ON public.attachments USING btree (message_id);

CREATE UNIQUE INDEX attachments_message_id_provider_media_id_key ON public.attachments USING btree (message_id, provider_media_id);

CREATE INDEX attachments_processing_state_next_attempt_at_idx ON public.attachments USING btree (processing_state, next_attempt_at);

CREATE INDEX attachments_provider_media_id_idx ON public.attachments USING btree (provider_media_id);

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT attachments_citizen_id_fkey FOREIGN KEY (citizen_id) REFERENCES public.citizens(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT attachments_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;
