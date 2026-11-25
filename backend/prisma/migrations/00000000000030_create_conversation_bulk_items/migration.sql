-- Consolidated baseline generated from the effective PostgreSQL 16 schema.
CREATE TABLE public.conversation_bulk_items (
    id uuid NOT NULL,
    "jobId" uuid NOT NULL,
    "conversationId" uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    error text,
    "claimedAt" timestamp(6) with time zone,
    CONSTRAINT conversation_bulk_items_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'succeeded'::text, 'failed'::text, 'uncertain'::text])))
);

ALTER TABLE ONLY public.conversation_bulk_items
    ADD CONSTRAINT conversation_bulk_items_pkey PRIMARY KEY (id);

CREATE UNIQUE INDEX "conversation_bulk_items_jobId_conversationId_key" ON public.conversation_bulk_items USING btree ("jobId", "conversationId");

CREATE INDEX "conversation_bulk_items_status_claimedAt_idx" ON public.conversation_bulk_items USING btree (status, "claimedAt");

ALTER TABLE ONLY public.conversation_bulk_items
    ADD CONSTRAINT "conversation_bulk_items_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES public.conversation_bulk_jobs(id) ON DELETE CASCADE;
