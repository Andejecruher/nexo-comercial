-- Consolidated baseline generated from the effective PostgreSQL 16 schema.
CREATE TABLE public.event_checkins (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    registration_id uuid NOT NULL,
    checked_in_by uuid,
    notes text,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.event_checkins
    ADD CONSTRAINT event_checkins_pkey PRIMARY KEY (id);

CREATE INDEX event_checkins_event_id_idx ON public.event_checkins USING btree (event_id);

CREATE INDEX event_checkins_registration_id_idx ON public.event_checkins USING btree (registration_id);

ALTER TABLE ONLY public.event_checkins
    ADD CONSTRAINT event_checkins_checked_in_by_fkey FOREIGN KEY (checked_in_by) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.event_checkins
    ADD CONSTRAINT event_checkins_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.event_checkins
    ADD CONSTRAINT event_checkins_registration_id_fkey FOREIGN KEY (registration_id) REFERENCES public.event_registrations(id) ON UPDATE CASCADE ON DELETE CASCADE;
