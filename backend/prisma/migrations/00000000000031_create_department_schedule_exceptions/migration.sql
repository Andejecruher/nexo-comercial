-- Consolidated baseline generated from the effective PostgreSQL 16 schema.
CREATE TABLE public.department_schedule_exceptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    department_id uuid NOT NULL,
    type public.department_schedule_exception_type NOT NULL,
    start_date date,
    end_date date,
    reason character varying(500),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    recurrence_type public.department_exception_recurrence_type DEFAULT 'NONE'::public.department_exception_recurrence_type NOT NULL,
    recurrence_starts_on date,
    recurrence_ends_on date,
    yearly_start_month integer,
    yearly_start_day integer,
    yearly_end_month integer,
    yearly_end_day integer,
    weekly_anchor_date date,
    weekdays public.department_day_of_week[] DEFAULT ARRAY[]::public.department_day_of_week[] NOT NULL,
    CONSTRAINT department_schedule_exceptions_date_order_chk CHECK ((start_date <= end_date))
);

ALTER TABLE ONLY public.department_schedule_exceptions
    ADD CONSTRAINT department_schedule_exceptions_pkey PRIMARY KEY (id);

CREATE INDEX department_schedule_exceptions_department_id_idx ON public.department_schedule_exceptions USING btree (department_id);

CREATE INDEX department_schedule_exceptions_department_id_recurrence_starts_ ON public.department_schedule_exceptions USING btree (department_id, recurrence_starts_on, recurrence_ends_on);

CREATE INDEX department_schedule_exceptions_department_id_recurrence_type_id ON public.department_schedule_exceptions USING btree (department_id, recurrence_type);

CREATE INDEX department_schedule_exceptions_department_id_start_date_end_dat ON public.department_schedule_exceptions USING btree (department_id, start_date, end_date);

CREATE INDEX department_schedule_exceptions_department_id_yearly_start_month ON public.department_schedule_exceptions USING btree (department_id, yearly_start_month, yearly_start_day, yearly_end_month, yearly_end_day);

ALTER TABLE ONLY public.department_schedule_exceptions
    ADD CONSTRAINT department_schedule_exceptions_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON UPDATE CASCADE ON DELETE CASCADE;
