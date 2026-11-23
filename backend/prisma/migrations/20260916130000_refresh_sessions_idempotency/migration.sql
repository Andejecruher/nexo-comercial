-- Additive migration: session storage and outbound message idempotency move
-- off Redis into PostgreSQL (serverless / no Redis).
--
--  1. refresh_sessions: multi-device refresh-token sessions, one row per
--     {user, device, jti}, replacing the `auth:sessions:{userId}` Redis set
--     and the `auth:session:{sessionKey}` keys (incl. TTL/rotation/replay).
--  2. messages.idempotency_key: unique nullable key replacing the
--     `msg:idem:{idempotencyKey}` Redis dedupe key (WA dedupe / API replays).
--
-- All additions are nullable/self-contained: no backfill needed.
-- Deploy via the voz-migrator job (`prisma migrate deploy`) BEFORE serving
-- traffic that writes refresh sessions or outbound messages.

CREATE TABLE "refresh_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "device_id" VARCHAR(255) NOT NULL,
    "jti" VARCHAR(64) NOT NULL,
    "token_hash" VARCHAR(128) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "refresh_sessions_user_id_device_id_jti_key"
    ON "refresh_sessions"("user_id", "device_id", "jti");
CREATE INDEX "refresh_sessions_user_id_created_at_idx"
    ON "refresh_sessions"("user_id", "created_at");
CREATE INDEX "refresh_sessions_expires_at_idx"
    ON "refresh_sessions"("expires_at");

ALTER TABLE "refresh_sessions" ADD CONSTRAINT "refresh_sessions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "messages" ADD COLUMN "idempotency_key" VARCHAR(255);
CREATE UNIQUE INDEX "messages_idempotency_key_key"
    ON "messages"("idempotency_key");
