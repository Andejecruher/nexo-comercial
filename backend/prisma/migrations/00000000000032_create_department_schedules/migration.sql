-- Consolidated baseline generated from the effective PostgreSQL 16 schema.
CREATE TABLE public.department_schedules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    department_id uuid NOT NULL,
    day_of_week public.department_day_of_week NOT NULL,
    is_open boolean DEFAULT false NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.department_schedules
    ADD CONSTRAINT department_schedules_pkey PRIMARY KEY (id);

CREATE INDEX department_schedules_day_of_week_idx ON public.department_schedules USING btree (day_of_week);

CREATE INDEX department_schedules_department_id_idx ON public.department_schedules USING btree (department_id);

CREATE UNIQUE INDEX uq_department_schedules_department_day ON public.department_schedules USING btree (department_id, day_of_week);

ALTER TABLE ONLY public.department_schedules
    ADD CONSTRAINT department_schedules_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON UPDATE CASCADE ON DELETE CASCADE;
