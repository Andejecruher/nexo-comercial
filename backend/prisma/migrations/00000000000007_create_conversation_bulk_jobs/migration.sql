-- Consolidated baseline generated from the effective PostgreSQL 16 schema.
CREATE TABLE public.conversation_bulk_jobs (
    id uuid NOT NULL,
    "actorId" uuid NOT NULL,
    "requestKey" uuid NOT NULL,
    "payloadHash" text NOT NULL,
    payload jsonb NOT NULL,
    "createdAt" timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.conversation_bulk_jobs
    ADD CONSTRAINT conversation_bulk_jobs_pkey PRIMARY KEY (id);

CREATE UNIQUE INDEX "conversation_bulk_jobs_actorId_requestKey_key" ON public.conversation_bulk_jobs USING btree ("actorId", "requestKey");
