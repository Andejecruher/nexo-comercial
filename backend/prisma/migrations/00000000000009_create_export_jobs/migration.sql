-- Consolidated baseline generated from the effective PostgreSQL 16 schema.
CREATE TABLE public.export_jobs (
    id uuid NOT NULL,
    module public.export_module NOT NULL,
    filters_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    scope_snapshot jsonb NOT NULL,
    status public.export_job_status DEFAULT 'queued'::public.export_job_status NOT NULL,
    drive_file_id character varying(255),
    drive_folder_id character varying(255),
    drive_filename character varying(255),
    row_count integer,
    error_code character varying(80),
    last_error text,
    requested_by_user_id uuid NOT NULL,
    requested_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    expires_at timestamp(6) with time zone NOT NULL,
    completed_at timestamp(6) with time zone,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    download_token_hash character varying(64),
    download_token_expires_at timestamp(6) with time zone,
    download_token_consumed_at timestamp(6) with time zone,
    file_path text
);

ALTER TABLE ONLY public.export_jobs
    ADD CONSTRAINT export_jobs_pkey PRIMARY KEY (id);

CREATE INDEX export_jobs_requested_by_user_id_created_at_idx ON public.export_jobs USING btree (requested_by_user_id, created_at);

CREATE INDEX export_jobs_status_completed_at_idx ON public.export_jobs USING btree (status, completed_at);

CREATE INDEX export_jobs_status_expires_at_idx ON public.export_jobs USING btree (status, expires_at);
