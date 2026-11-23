-- Additive migration: replaces Redis-backed rate limiting and FSM locks
-- with PostgreSQL native structures (serverless / no Redis).
--
--  1. conversation_meta gains FSM lease-lock columns (fsm_lock_token / fsm_locked_at)
--     replacing the `fsm:lock:{convId}` Redis key.
--  2. rate_limit_counters: fixed-window atomic counters replacing Redis INCR/EXPIRE
--     (one row per scope+bucketKey+windowStart, upsert ON CONFLICT).
--  3. identity_lockouts: progressive lockout state per identity (email/phone/IP)
--     replacing `lo:fails` / `lo:lock` / `lo:level`.
--
-- All additions are nullable/self-contained: no backfill needed.
-- Deploy via the voz-migrator job (`prisma migrate deploy`) BEFORE serving traffic
-- that reads the new columns.

ALTER TABLE "conversation_meta"
    ADD COLUMN "fsm_lock_token" VARCHAR(64),
    ADD COLUMN "fsm_locked_at" TIMESTAMPTZ(6);

CREATE TABLE "rate_limit_counters" (
    "scope" VARCHAR(50) NOT NULL,
    "bucket_key" VARCHAR(255) NOT NULL,
    "window_start" TIMESTAMPTZ(6) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_limit_counters_pkey" PRIMARY KEY ("scope", "bucket_key", "window_start")
);

CREATE INDEX "rate_limit_counters_scope_window_start_idx" ON "rate_limit_counters"("scope", "window_start");

CREATE TABLE "identity_lockouts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "identity_key" VARCHAR(255) NOT NULL,
    "fails" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(6),
    "last_failure_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "identity_lockouts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "identity_lockouts_identity_key_key" ON "identity_lockouts"("identity_key");
CREATE INDEX "identity_lockouts_locked_until_idx" ON "identity_lockouts"("locked_until");