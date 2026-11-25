-- Consolidated baseline generated from the effective PostgreSQL 16 schema.
CREATE TABLE public.events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title character varying(255) NOT NULL,
    slug character varying(255) NOT NULL,
    description text,
    event_type public.event_type DEFAULT 'townhall'::public.event_type NOT NULL,
    status public.event_status DEFAULT 'draft'::public.event_status NOT NULL,
    starts_at timestamp(6) with time zone NOT NULL,
    ends_at timestamp(6) with time zone,
    location_name character varying(255),
    address character varying(500),
    latitude numeric(10,7),
    longitude numeric(10,7),
    capacity integer,
    organizer_user_id uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    neighborhood character varying(255),
    visibility public.event_visibility DEFAULT 'public'::public.event_visibility NOT NULL
);

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);

CREATE INDEX events_organizer_user_id_idx ON public.events USING btree (organizer_user_id);

CREATE UNIQUE INDEX events_slug_key ON public.events USING btree (slug);

CREATE INDEX events_starts_at_idx ON public.events USING btree (starts_at);

CREATE INDEX events_status_idx ON public.events USING btree (status);

CREATE INDEX idx_events_visibility_starts_at ON public.events USING btree (visibility, starts_at);

CREATE INDEX idx_events_visibility_status_starts_at ON public.events USING btree (visibility, status, starts_at);

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_organizer_user_id_fkey FOREIGN KEY (organizer_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;
