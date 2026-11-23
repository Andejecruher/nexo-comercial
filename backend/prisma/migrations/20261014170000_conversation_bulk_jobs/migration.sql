CREATE TABLE "conversation_bulk_jobs" (
  "id" UUID PRIMARY KEY, "actorId" UUID NOT NULL, "requestKey" UUID NOT NULL,
  "payloadHash" TEXT NOT NULL, "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "conversation_bulk_jobs_actorId_requestKey_key" ON "conversation_bulk_jobs"("actorId", "requestKey");
CREATE TABLE "conversation_bulk_items" (
  "id" UUID PRIMARY KEY, "jobId" UUID NOT NULL REFERENCES "conversation_bulk_jobs"("id") ON DELETE CASCADE,
  "conversationId" UUID NOT NULL, "status" TEXT NOT NULL DEFAULT 'pending', "error" TEXT,
  "claimedAt" TIMESTAMPTZ(6),
  CONSTRAINT "conversation_bulk_items_status_check" CHECK ("status" IN ('pending', 'running', 'succeeded', 'failed', 'uncertain'))
);
CREATE UNIQUE INDEX "conversation_bulk_items_jobId_conversationId_key" ON "conversation_bulk_items"("jobId", "conversationId");
CREATE INDEX "conversation_bulk_items_status_claimedAt_idx" ON "conversation_bulk_items"("status", "claimedAt");
