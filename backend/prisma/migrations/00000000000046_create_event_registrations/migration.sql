-- Consolidated baseline generated from the effective PostgreSQL 16 schema.
CREATE TABLE public.event_registrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    citizen_id uuid NOT NULL,
    registration_status public.registration_status DEFAULT 'registered'::public.registration_status NOT NULL,
    attendance_status public.attendance_status DEFAULT 'pending'::public.attendance_status NOT NULL,
    checked_in_at timestamp(6) with time zone,
    source_channel public.source_channel DEFAULT 'web'::public.source_channel NOT NULL,
    notes text,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);

ALTER TABLE ONLY public.event_registrations
    ADD CONSTRAINT event_registrations_pkey PRIMARY KEY (id);

CREATE INDEX event_registrations_citizen_id_idx ON public.event_registrations USING btree (citizen_id);

CREATE INDEX event_registrations_event_id_idx ON public.event_registrations USING btree (event_id);

CREATE INDEX event_registrations_registration_status_idx ON public.event_registrations USING btree (registration_status);

CREATE UNIQUE INDEX uq_event_registrations_event_citizen ON public.event_registrations USING btree (event_id, citizen_id);

ALTER TABLE ONLY public.event_registrations
    ADD CONSTRAINT event_registrations_citizen_id_fkey FOREIGN KEY (citizen_id) REFERENCES public.citizens(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.event_registrations
    ADD CONSTRAINT event_registrations_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON UPDATE CASCADE ON DELETE CASCADE;
