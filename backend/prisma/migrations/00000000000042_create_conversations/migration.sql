-- Consolidated baseline generated from the effective PostgreSQL 16 schema.
CREATE TABLE public.conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    citizen_id uuid NOT NULL,
    status public.conversation_status DEFAULT 'open'::public.conversation_status NOT NULL,
    channel public.conversation_channel DEFAULT 'whatsapp'::public.conversation_channel NOT NULL,
    assigned_dept character varying(100),
    assigned_user_id uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    is_canonical boolean DEFAULT true NOT NULL,
    attendance_mode public.attendance_mode DEFAULT 'bot'::public.attendance_mode NOT NULL,
    bot_enabled boolean DEFAULT true NOT NULL,
    active_ticket_id uuid,
    transferred_at timestamp(6) with time zone,
    transferred_by character varying(100),
    transfer_reason character varying(255),
    realtime_version integer DEFAULT 0 NOT NULL,
    communication_line_id uuid
);

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);

CREATE INDEX conversations_active_ticket_id_idx ON public.conversations USING btree (active_ticket_id);

CREATE INDEX conversations_assigned_user_id_idx ON public.conversations USING btree (assigned_user_id);

CREATE INDEX conversations_attendance_reconcile_idx ON public.conversations USING btree (attendance_mode) WHERE (assigned_user_id IS NOT NULL);

CREATE INDEX conversations_citizen_id_status_idx ON public.conversations USING btree (citizen_id, status);

CREATE INDEX conversations_transferred_at_idx ON public.conversations USING btree (transferred_at);

CREATE UNIQUE INDEX uq_conversations_active_per_citizen_channel_line ON public.conversations USING btree (citizen_id, channel, COALESCE(communication_line_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE (status = ANY (ARRAY['open'::public.conversation_status, 'in_progress'::public.conversation_status]));

CREATE UNIQUE INDEX uq_conversations_canonical_per_citizen_line ON public.conversations USING btree (citizen_id, channel, COALESCE(communication_line_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE is_canonical;

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_assigned_user_id_fkey FOREIGN KEY (assigned_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_citizen_id_fkey FOREIGN KEY (citizen_id) REFERENCES public.citizens(id) ON UPDATE CASCADE ON DELETE CASCADE;
