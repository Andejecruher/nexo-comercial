-- Consolidated baseline generated from the effective PostgreSQL 16 schema.
CREATE TABLE public.department_schedule_intervals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    schedule_id uuid NOT NULL,
    start_time character varying(5) NOT NULL,
    end_time character varying(5) NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT department_schedule_intervals_time_order_chk CHECK (((start_time)::text < (end_time)::text))
);

ALTER TABLE ONLY public.department_schedule_intervals
    ADD CONSTRAINT department_schedule_intervals_pkey PRIMARY KEY (id);

CREATE INDEX department_schedule_intervals_schedule_id_sort_order_idx ON public.department_schedule_intervals USING btree (schedule_id, sort_order);

CREATE UNIQUE INDEX uq_department_schedule_intervals_range ON public.department_schedule_intervals USING btree (schedule_id, start_time, end_time);

ALTER TABLE ONLY public.department_schedule_intervals
    ADD CONSTRAINT department_schedule_intervals_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES public.department_schedules(id) ON UPDATE CASCADE ON DELETE CASCADE;
