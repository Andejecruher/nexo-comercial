-- Consolidated baseline generated from the effective PostgreSQL 16 schema.
CREATE TABLE public.notifications (
    id uuid NOT NULL,
    event_id uuid NOT NULL,
    type character varying(100) NOT NULL,
    conversation_id uuid,
    contact_name text,
    phone text,
    message_preview text,
    flow_state text,
    channel text,
    priority text,
    department_slug text,
    assigned_user_id uuid,
    occurred_at timestamp(6) with time zone NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    ticket_id uuid,
    communication_line_id uuid
);

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);

CREATE INDEX notifications_created_at_id_idx ON public.notifications USING btree (created_at, id);

CREATE UNIQUE INDEX notifications_event_id_key ON public.notifications USING btree (event_id);

CREATE INDEX notifications_occurred_at_idx ON public.notifications USING btree (occurred_at);
