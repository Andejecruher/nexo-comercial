-- Consolidated baseline generated from the effective PostgreSQL 16 schema.
CREATE TABLE public.conversation_meta (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    communication_line_id uuid,
    flow_state public.conversation_flow_state DEFAULT 'BOT_FLOW'::public.conversation_flow_state NOT NULL,
    locked_by_user_id uuid,
    locked_at timestamp(6) with time zone,
    version integer DEFAULT 0 NOT NULL,
    department_slug character varying(100),
    handover_at timestamp(6) with time zone,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    fsm_lock_token character varying(64),
    fsm_locked_at timestamp(6) with time zone,
    handoff_kind character varying(50)
);

ALTER TABLE ONLY public.conversation_meta
    ADD CONSTRAINT conversation_meta_pkey PRIMARY KEY (id);

CREATE INDEX conversation_meta_communication_line_id_idx ON public.conversation_meta USING btree (communication_line_id);

CREATE INDEX conversation_meta_conversation_id_flow_state_idx ON public.conversation_meta USING btree (conversation_id, flow_state);

CREATE UNIQUE INDEX conversation_meta_conversation_id_key ON public.conversation_meta USING btree (conversation_id);

CREATE INDEX conversation_meta_flow_state_idx ON public.conversation_meta USING btree (flow_state);

CREATE INDEX conversation_meta_locked_by_user_id_idx ON public.conversation_meta USING btree (locked_by_user_id);

ALTER TABLE ONLY public.conversation_meta
    ADD CONSTRAINT conversation_meta_communication_line_id_fkey FOREIGN KEY (communication_line_id) REFERENCES public.communication_lines(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.conversation_meta
    ADD CONSTRAINT conversation_meta_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON UPDATE CASCADE ON DELETE CASCADE;
