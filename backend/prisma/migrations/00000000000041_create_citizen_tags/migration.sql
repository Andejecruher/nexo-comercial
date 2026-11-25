-- Consolidated baseline generated from the effective PostgreSQL 16 schema.
CREATE TABLE public.citizen_tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    citizen_id uuid NOT NULL,
    tag_id uuid NOT NULL,
    assigned_by_id uuid,
    assigned_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.citizen_tags
    ADD CONSTRAINT citizen_tags_pkey PRIMARY KEY (id);

CREATE INDEX citizen_tags_citizen_id_idx ON public.citizen_tags USING btree (citizen_id);

CREATE INDEX citizen_tags_tag_id_idx ON public.citizen_tags USING btree (tag_id);

CREATE UNIQUE INDEX uq_citizen_tags_citizen_tag ON public.citizen_tags USING btree (citizen_id, tag_id);

ALTER TABLE ONLY public.citizen_tags
    ADD CONSTRAINT citizen_tags_assigned_by_id_fkey FOREIGN KEY (assigned_by_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.citizen_tags
    ADD CONSTRAINT citizen_tags_citizen_id_fkey FOREIGN KEY (citizen_id) REFERENCES public.citizens(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.citizen_tags
    ADD CONSTRAINT citizen_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON UPDATE CASCADE ON DELETE CASCADE;
