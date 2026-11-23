-- Add durable phone-keyed message batching tables.
-- Author-only migration; do not run prisma migrate dev/deploy without maintainer approval.

CREATE TABLE "batch_windows" (
    "phone" VARCHAR(30) NOT NULL,
    "batch_generation" INTEGER NOT NULL DEFAULT 0,
    "batch_ready_at" TIMESTAMPTZ(6),
    "window_opened_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "batch_windows_pkey" PRIMARY KEY ("phone")
);

CREATE INDEX "batch_windows_ready_generation_idx"
  ON "batch_windows" ("batch_ready_at", "batch_generation");

CREATE TABLE "batch_window_claims" (
    "phone" VARCHAR(30) NOT NULL,
    "batch_generation" INTEGER NOT NULL,
    "claim_token" VARCHAR(64),
    "claim_lease_until" TIMESTAMPTZ(6),
    "drain_boundary" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "batch_window_claims_pkey" PRIMARY KEY ("phone", "batch_generation")
);

CREATE INDEX "batch_window_claims_lease_idx"
  ON "batch_window_claims" ("claim_lease_until", "completed_at");

CREATE INDEX "batch_window_claims_phone_completion_idx"
  ON "batch_window_claims" ("phone", "completed_at", "batch_generation");
