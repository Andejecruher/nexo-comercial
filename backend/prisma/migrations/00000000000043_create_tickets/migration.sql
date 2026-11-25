-- Consolidated baseline generated from the effective PostgreSQL 16 schema.
CREATE TABLE public.tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    citizen_id uuid NOT NULL,
    status public.ticket_status DEFAULT 'OPEN'::public.ticket_status NOT NULL,
    priority public.ticket_priority DEFAULT 'MEDIUM'::public.ticket_priority NOT NULL,
    source public.ticket_source DEFAULT 'WHATSAPP'::public.ticket_source NOT NULL,
    title character varying(255),
    description text,
    department_slug character varying(100),
    assigned_user_id uuid,
    close_reason character varying(50),
    close_summary text,
    escalation_reason character varying(500),
    closed_at timestamp(6) with time zone,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    folio character varying(32) NOT NULL
);

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_pkey PRIMARY KEY (id);

CREATE INDEX tickets_assigned_user_id_idx ON public.tickets USING btree (assigned_user_id);

CREATE INDEX tickets_assigned_user_id_updated_at_id_idx ON public.tickets USING btree (assigned_user_id, updated_at, id);

CREATE INDEX tickets_citizen_id_idx ON public.tickets USING btree (citizen_id);

CREATE INDEX tickets_conversation_id_status_idx ON public.tickets USING btree (conversation_id, status);

CREATE INDEX tickets_department_slug_updated_at_id_idx ON public.tickets USING btree (department_slug, updated_at, id);

CREATE INDEX tickets_status_idx ON public.tickets USING btree (status);

CREATE INDEX tickets_status_updated_at_id_idx ON public.tickets USING btree (status, updated_at, id);

CREATE INDEX tickets_updated_at_id_idx ON public.tickets USING btree (updated_at, id);

CREATE UNIQUE INDEX uq_tickets_folio ON public.tickets USING btree (folio);

CREATE UNIQUE INDEX uq_tickets_one_active_per_conversation ON public.tickets USING btree (conversation_id) WHERE (status = ANY (ARRAY['OPEN'::public.ticket_status, 'IN_PROGRESS'::public.ticket_status]));

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_assigned_user_id_fkey FOREIGN KEY (assigned_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_citizen_id_fkey FOREIGN KEY (citizen_id) REFERENCES public.citizens(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON UPDATE CASCADE ON DELETE CASCADE;
