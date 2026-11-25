-- Consolidated baseline generated from the effective PostgreSQL 16 schema.
CREATE TABLE public.template_status_events (
    id bigint NOT NULL,
    dedupe_key character varying(64) NOT NULL,
    waba_id character varying(100) NOT NULL,
    template_id character varying(100) NOT NULL,
    template_name character varying(512) NOT NULL,
    status character varying(100) NOT NULL,
    reason text,
    occurred_at timestamp(6) with time zone NOT NULL,
    received_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE SEQUENCE public.template_status_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.template_status_events_id_seq OWNED BY public.template_status_events.id;

ALTER TABLE ONLY public.template_status_events ALTER COLUMN id SET DEFAULT nextval('public.template_status_events_id_seq'::regclass);

ALTER TABLE ONLY public.template_status_events
    ADD CONSTRAINT template_status_events_dedupe_key_key UNIQUE (dedupe_key);

ALTER TABLE ONLY public.template_status_events
    ADD CONSTRAINT template_status_events_pkey PRIMARY KEY (id);

CREATE INDEX template_status_events_waba_id_id_idx ON public.template_status_events USING btree (waba_id, id);
