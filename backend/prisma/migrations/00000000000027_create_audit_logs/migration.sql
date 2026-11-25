-- Consolidated baseline generated from the effective PostgreSQL 16 schema.
CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_id uuid,
    action character varying(100) NOT NULL,
    target_type character varying(50) NOT NULL,
    target_id character varying(255),
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    ip character varying(45),
    user_agent character varying(512),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);

CREATE INDEX audit_logs_action_idx ON public.audit_logs USING btree (action);

CREATE INDEX audit_logs_actor_id_idx ON public.audit_logs USING btree (actor_id);

CREATE INDEX audit_logs_created_at_idx ON public.audit_logs USING btree (created_at);

CREATE INDEX audit_logs_target_type_target_id_idx ON public.audit_logs USING btree (target_type, target_id);

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;
